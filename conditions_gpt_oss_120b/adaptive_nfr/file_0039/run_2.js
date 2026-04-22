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

/**
 * Predicate helpers for permission checks
 */
function hasUnsafeAuthors(unsafeAttrs) {
    return !!unsafeAttrs.authors;
}
function unsafeAuthorsEmpty(unsafeAttrs) {
    return unsafeAttrs.authors && unsafeAttrs.authors.length === 0;
}
function unsafeAuthorsChanged(unsafeAttrs, postModel) {
    if (!unsafeAttrs.authors) {
        return false;
    }
    if (unsafeAuthorsEmpty(unsafeAttrs)) {
        return true;
    }
    const currentFirst = postModel.related('authors').models[0];
    return unsafeAttrs.authors[0].id !== (currentFirst && currentFirst.id);
}
function isOwnerContext(unsafeAttrs, context) {
    if (!unsafeAttrs.authors) {
        return false;
    }
    return unsafeAttrs.authors.length &&
        unsafeAttrs.authors[0].id === context.user;
}
function isPrimaryAuthorContext(context, postModel) {
    const firstAuthor = postModel.related('authors').models[0];
    return firstAuthor && context.user === firstAuthor.id;
}
function isCoAuthorContext(context, postModel) {
    return postModel.related('authors').models
        .map(author => author.id)
        .includes(context.user);
}

/**
 * Permission strategy map: role -> action -> evaluator
 */
const permissionStrategies = {
    contributor: {
        edit: (postModel, unsafeAttrs, context) => !unsafeAuthorsChanged(unsafeAttrs, postModel) && isCoAuthorContext(context, postModel),
        add: (postModel, unsafeAttrs, context) => isOwnerContext(unsafeAttrs, context),
        destroy: (postModel, unsafeAttrs, context) => isPrimaryAuthorContext(context, postModel)
    },
    author: {
        edit: (postModel, unsafeAttrs, context) => isCoAuthorContext(context, postModel) && !unsafeAuthorsChanged(unsafeAttrs, postModel),
        add: (postModel, unsafeAttrs, context) => isOwnerContext(unsafeAttrs, context)
    }
};

/**
 * Resolve user ID for author reference
 * @param {Object} author
 * @returns {Object} query
 */
function buildAuthorQuery(author) {
    const query = {};
    if (author.id) {
        query.id = author.id;
    } else if (author.slug) {
        query.slug = author.slug;
    } else if (author.email) {
        query.email = author.email;
    }
    return query;
}

/**
 * Find or fallback to owner user ID
 * @param {Object} user
 * @param {Object} ownerUser
 * @returns {String}
 */
function resolveUserId(user, ownerUser) {
    return user ? user.id : ownerUser.id;
}

/**
 * Main model extension
 */
module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions(fnName) {
            const self = this;
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

                return proto[fnName].call(self, model, attrs, options);
            };
        },

        onFetching(model, attrs, options) {
            return this._handleOptions('onFetching')(model, attrs, options);
        },

        onFetchingCollection(collection, attrs, options) {
            return this._handleOptions('onFetchingCollection')(collection, attrs, options);
        },

        onFetchedCollection(collection, attrs, options) {
            _.each(collection.models, model => {
                model._originalOptions = collection._originalOptions;
            });
            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        async onCreating(model, attrs, options) {
            if (!model.get('authors')) {
                model.set('authors', [{id: await this.contextUser(options)}]);
            }
            return this._handleOptions('onCreating')(model, attrs, options);
        },

        onUpdating(model, attrs, options) {
            return this._handleOptions('onUpdating')(model, attrs, options);
        },

        onSaving(model, attrs, options) {
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

        serialize(options) {
            let attrs = proto.serialize.call(this, options);

            if (!this._originalOptions) {
                this._originalOptions = {};
            }

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

                return Promise.all(authors.map((author, index) => {
                    const query = buildAuthorQuery(author);
                    return ghostBookshelf
                        .model('User')
                        .where(query)
                        .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')))
                        .then(user => {
                            const userId = resolveUserId(user, ownerUser);
                            const exists = _.find(authorsToSet, {id: userId});
                            if (!exists) {
                                authorsToSet[index] = {id: userId};
                            }
                        });
                })).then(() => {
                    model.set('authors', authorsToSet);
                });
            });

            return sequence(ops);
        }
    }, {
        async reassignByAuthor(unfilteredOptions) {
            const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
            const authorId = options.id;

            if (!authorId) {
                return Promise.reject(new errors.NotFoundError({message: tpl(messages.noUserFound)}));
            }

            const reassignPost = async () => {
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

                    const authorsPrimary = authorsPosts.filter(ap => ap.sort_order === 0);
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
                return ghostBookshelf.transaction(transacting => {
                    options.transacting = transacting;
                    return reassignPost();
                });
            }

            return reassignPost();
        },

        permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
            const role = isContributor ? 'contributor' : isAuthor ? 'author' : null;

            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                const origArgs = _.toArray(arguments).slice(1);
                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then(found => {
                        if (!found) {
                            throw new errors.NotFoundError({message: tpl(messages.postNotFound)});
                        }
                        return self.permissible.apply(self, [found].concat(origArgs));
                    });
            }

            const postModel = postModelOrId;
            const strategy = role && permissionStrategies[role] && permissionStrategies[role][action];
            if (strategy) {
                hasUserPermission = strategy(postModel, unsafeAttrs, context);
            } else if (postModel) {
                hasUserPermission = hasUserPermission || isPrimaryAuthorContext(context, postModel);
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
                        return {excludedAttrs: ['authors'].concat(excludedAttrs)};
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