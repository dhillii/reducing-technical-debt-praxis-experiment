```javascript
const _ = require('lodash');
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const {sequence} = require('@tryghost/promise');
const {setIsRoles} = require('../role-utils');

const messages = {
    noUserFound: 'No user found',
    postNotFound: 'Post not found.',
    notEnoughPermission: 'You do not have permission to perform this action'
};

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    // -------------------------------------------------------------------------
    // Helper functions (instance level)
    // -------------------------------------------------------------------------
    function handleOptions(fnName) {
        return function innerHandleOptions(model, attrs, options) {
            model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

            if (!options.withRelated) {
                options.withRelated = [];
            }

            const authorIdx = options.withRelated.indexOf('author');
            if (authorIdx !== -1) {
                options.withRelated.splice(authorIdx, 1);
                options.withRelated.push('authors');
            }

            if (options.forUpdate &&
                ['onFetching', 'onFetchingCollection'].includes(fnName) &&
                !options.withRelated.includes('authors')) {
                options.withRelated.push('authors');
            }

            return proto[fnName].call(this, model, attrs, options);
        };
    }

    function isChangingAuthors(postModel, unsafeAttrs) {
        if (!unsafeAttrs.authors) {
            return false;
        }
        if (!unsafeAttrs.authors.length) {
            return true;
        }
        return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
    }

    function isOwner(context, unsafeAttrs) {
        if (!unsafeAttrs.authors) {
            return false;
        }
        return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
    }

    function isPrimaryAuthor(context, postModel) {
        return context.user === postModel.related('authors').models[0].id;
    }

    function isCoAuthor(context, postModel) {
        return postModel.related('authors').models.map(a => a.id).includes(context.user);
    }

    // -------------------------------------------------------------------------
    // Model definition
    // -------------------------------------------------------------------------
    const Model = Post.extend({
        _handleOptions: function (fnName) {
            return handleOptions.call(this, fnName);
        },

        onFetching: function (model, attrs, options) {
            return this._handleOptions('onFetching')(model, attrs, options);
        },

        onFetchingCollection: function (collection, attrs, options) {
            return this._handleOptions('onFetchingCollection')(collection, attrs, options);
        },

        onFetchedCollection: function (collection, attrs, options) {
            _.each(collection.models, model => {
                model._originalOptions = collection._originalOptions;
            });
            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        onCreating: async function (model, attrs, options) {
            if (!model.get('authors')) {
                model.set('authors', [{id: await this.contextUser(options)}]);
            }
            return this._handleOptions('onCreating')(model, attrs, options);
        },

        onUpdating: function (model, attrs, options) {
            return this._handleOptions('onUpdating')(model, attrs, options);
        },

        onSaving: function (model, attrs, options) {
            const ops = [];

            model.unset('author');

            if (model.get('authors') && !model.get('authors').length) {
                throw new errors.ValidationError({message: 'At least one author is required.'});
            }

            if (model.get('authors')) {
                ops.push(() => this.matchAuthors(model, options));
            }

            ops.push(() => proto.onSaving.call(this, model, attrs, options));

            return sequence(ops);
        },

        serialize: function (options) {
            let attrs = proto.serialize.call(this, options);

            this._originalOptions = this._originalOptions || {};

            if (!this._originalOptions.withRelated || !this._originalOptions.withRelated.includes('authors')) {
                delete attrs.authors;
            }

            if (!options.columns || options.columns.includes('primary_author')) {
                attrs.primary_author = (attrs.authors && attrs.authors.length) ? attrs.authors[0] : null;
            }

            return attrs;
        },

        matchAuthors(model, options) {
            let ownerUser;
            const ops = [];

            ops.push(() => ghostBookshelf
                .model('User')
                .getOwnerUser(_.pick(options, 'transacting'))
                .then(u => { ownerUser = u; })
            );

            ops.push(() => {
                const authors = model.get('authors');
                const authorsToSet = [];

                return Promise.all(authors.map((author, idx) => {
                    const query = author.id ? {id: author.id}
                        : author.slug ? {slug: author.slug}
                        : author.email ? {email: author.email}
                        : {};

                    return ghostBookshelf
                        .model('User')
                        .where(query)
                        .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')))
                        .then(user => {
                            const userId = user ? user.id : ownerUser.id;
                            const exists = _.find(authorsToSet, {id: userId});
                            if (!exists) {
                                authorsToSet[idx] = {id: userId};
                            }
                        });
                })).then(() => {
                    model.set('authors', authorsToSet);
                });
            });

            return sequence(ops);
        }
    }, {
        reassignByAuthor: async function (unfilteredOptions) {
            const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
            const authorId = options.id;

            if (!authorId) {
                return Promise.reject(new errors.NotFoundError({message: tpl(messages.noUserFound)}));
            }

            const reassign = async () => {
                const trx = options.transacting;
                const knex = ghostBookshelf.knex;

                try {
                    const ownerRows = await knex('roles')
                        .transacting(trx)
                        .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
                        .where('roles.name', 'Owner')
                        .select('roles_users.user_id');

                    const ownerId = ownerRows[0].user_id;

                    const authorsPosts = await knex('posts_authors')
                        .transacting(trx)
                        .where('author_id', authorId)
                        .select('post_id', 'sort_order');

                    const ownersPosts = await knex('posts_authors')
                        .transacting(trx)
                        .where('author_id', ownerId)
                        .select('post_id');

                    const authorsPrimary = authorsPosts.filter(p => p.sort_order === 0);
                    const primaryWithOwner = _.intersectionBy(authorsPrimary, ownersPosts, 'post_id');
                    const primaryWithOwnerIds = primaryWithOwner.map(p => p.post_id);

                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', primaryWithOwnerIds)
                        .where('author_id', authorId)
                        .del();

                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', primaryWithOwnerIds)
                        .where('author_id', ownerId)
                        .update('sort_order', 0);

                    const primaryWithoutOwner = _.differenceBy(authorsPrimary, primaryWithOwner, 'post_id');
                    const primaryWithoutOwnerIds = primaryWithoutOwner.map(p => p.post_id);

                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', primaryWithoutOwnerIds)
                        .where('author_id', authorId)
                        .update('author_id', ownerId);

                    await knex('posts_authors')
                        .transacting(trx)
                        .where('author_id', authorId)
                        .del();
                } catch (err) {
                    throw new errors.InternalServerError({err});
                }
            };

            if (!options.transacting) {
                return ghostBookshelf.transaction(trx => {
                    options.transacting = trx;
                    return reassign();
                });
            }

            return reassign();
        },

        permissible: function (postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
            let postModel = postModelOrId;
            let origArgs;

            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                origArgs = _.toArray(arguments).slice(1);
                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then(found => {
                        if (!found) {
                            throw new errors.NotFoundError({message: tpl(messages.postNotFound)});
                        }
                        const newArgs = [found].concat(origArgs);
                        return self.permissible.apply(self, newArgs);
                    });
            }

            const isEdit = action === 'edit';
            const isAdd = action === 'add';
            const isDestroy = action === 'destroy';

            if (isContributor && isEdit) {
                hasUserPermission = !isChangingAuthors(postModel, unsafeAttrs) && isCoAuthor(context, postModel);
            } else if (isContributor && isAdd) {
                hasUserPermission = isOwner(context, unsafeAttrs);
            } else if (isContributor && isDestroy) {
                hasUserPermission = isPrimaryAuthor(context, postModel);
            } else if (isAuthor && isEdit) {
                hasUserPermission = isCoAuthor(context, postModel) && !isChangingAuthors(postModel, unsafeAttrs);
            } else if (isAuthor && isAdd) {
                hasUserPermission = isOwner(context, unsafeAttrs);
            } else if (postModel) {
                hasUserPermission = hasUserPermission || isPrimaryAuthor(context, postModel);
            }

            if (hasUserPermission && hasApiKeyPermission) {
                return Post.permissible.call(
                    this,
                    postModelOrId,
                    action,
                    context,
                    unsafeAttrs,
                    loadedPermissions,
                    hasUserPermission,
                    hasApiKeyPermission
                ).then(({excludedAttrs}) => {
                    if (isContributor || isAuthor) {
                        return {excludedAttrs: ['authors', ...excludedAttrs]};
                    }
                    return {excludedAttrs};
                });
            }

            return Promise.reject(new errors.NoPermissionError({message: tpl(messages.notEnoughPermission)}));
        }
    });

    return Model;
};
```