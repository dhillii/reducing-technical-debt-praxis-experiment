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

    const Model = Post.extend(
        {
            // -----------------------------------------------------------------
            // Option handling
            // -----------------------------------------------------------------
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

                    if (
                        options.forUpdate &&
                        ['onFetching', 'onFetchingCollection'].includes(fnName) &&
                        !options.withRelated.includes('authors')
                    ) {
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

            // -----------------------------------------------------------------
            // Creation / Updating
            // -----------------------------------------------------------------
            async onCreating(model, attrs, options) {
                if (!model.get('authors')) {
                    model.set('authors', [{id: await this.contextUser(options)}]);
                }
                return this._handleOptions('onCreating')(model, attrs, options);
            },

            onUpdating(model, attrs, options) {
                return this._handleOptions('onUpdating')(model, attrs, options);
            },

            // -----------------------------------------------------------------
            // Saving
            // -----------------------------------------------------------------
            onSaving(model, attrs, options) {
                model.unset('author');

                if (model.get('authors') && !model.get('authors').length) {
                    throw new errors.ValidationError({message: 'At least one author is required.'});
                }

                const ops = [];

                if (model.get('authors')) {
                    ops.push(() => this._matchAuthors(model, options));
                }

                ops.push(() => proto.onSaving.call(this, model, attrs, options));

                return sequence(ops);
            },

            // -----------------------------------------------------------------
            // Serialization
            // -----------------------------------------------------------------
            serialize(options) {
                let attrs = proto.serialize.call(this, options);

                this._originalOptions = this._originalOptions || {};

                if (
                    !this._originalOptions.withRelated ||
                    !this._originalOptions.withRelated.includes('authors')
                ) {
                    delete attrs.authors;
                }

                if (!options.columns || options.columns.includes('primary_author')) {
                    attrs.primary_author = attrs.authors && attrs.authors.length ? attrs.authors[0] : null;
                }

                return attrs;
            },

            // -----------------------------------------------------------------
            // Author matching
            // -----------------------------------------------------------------
            _matchAuthors(model, options) {
                let ownerUser;
                const ops = [];

                ops.push(() =>
                    ghostBookshelf
                        .model('User')
                        .getOwnerUser(_.pick(options, 'transacting'))
                        .then(user => {
                            ownerUser = user;
                        })
                );

                ops.push(() => this._resolveAuthors(model, options, ownerUser));

                return sequence(ops);
            },

            _resolveAuthors(model, options, ownerUser) {
                const authors = model.get('authors');
                const authorsToSet = [];

                return Promise.all(
                    authors.map((author, index) => {
                        const query = author.id
                            ? {id: author.id}
                            : author.slug
                            ? {slug: author.slug}
                            : author.email
                            ? {email: author.email}
                            : {};

                        return ghostBookshelf
                            .model('User')
                            .where(query)
                            .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')))
                            .then(user => {
                                const userId = user ? user.id : ownerUser.id;
                                const exists = _.find(authorsToSet, {id: userId});
                                if (!exists) {
                                    authorsToSet[index] = {id: userId};
                                }
                            });
                    })
                ).then(() => {
                    model.set('authors', authorsToSet);
                });
            }
        },
        {
            // -----------------------------------------------------------------
            // Reassign posts by author
            // -----------------------------------------------------------------
            async reassignByAuthor(unfilteredOptions) {
                const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {
                    extraAllowedProperties: ['id']
                });
                const authorId = options.id;

                if (!authorId) {
                    return Promise.reject(
                        new errors.NotFoundError({message: tpl(messages.noUserFound)})
                    );
                }

                const reassign = async () => {
                    const trx = options.transacting;
                    const knex = ghostBookshelf.knex;

                    try {
                        const [ownerRow] = await knex('roles')
                            .transacting(trx)
                            .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
                            .where('roles.name', 'Owner')
                            .select('roles_users.user_id');

                        const ownerId = ownerRow.user_id;

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

                        // Remove author from primary posts where owner is co‑author
                        await knex('posts_authors')
                            .transacting(trx)
                            .whereIn('post_id', primaryWithOwnerIds)
                            .where('author_id', authorId)
                            .del();

                        // Promote owner to primary author
                        await knex('posts_authors')
                            .transacting(trx)
                            .whereIn('post_id', primaryWithOwnerIds)
                            .where('author_id', ownerId)
                            .update('sort_order', 0);

                        const primaryWithoutOwner = _.differenceBy(authorsPrimary, primaryWithOwner, 'post_id');
                        const primaryWithoutOwnerIds = primaryWithoutOwner.map(p => p.post_id);

                        // Swap author with owner on primary posts without owner co‑author
                        await knex('posts_authors')
                            .transacting(trx)
                            .whereIn('post_id', primaryWithoutOwnerIds)
                            .where('author_id', authorId)
                            .update('author_id', ownerId);

                        // Remove author from any secondary posts
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
                        return reassign();
                    });
                }

                return reassign();
            },

            // -----------------------------------------------------------------
            // Permission handling
            // -----------------------------------------------------------------
            permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
                const self = this;
                const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
                const isEdit = action === 'edit';
                const isAdd = action === 'add';
                const isDestroy = action === 'destroy';

                // -----------------------------------------------------------------
                // Resolve model if an ID was supplied
                // -----------------------------------------------------------------
                if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                    const origArgs = _.toArray(arguments).slice(1);
                    return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']}).then(found => {
                        if (!found) {
                            throw new errors.NotFoundError({message: tpl(messages.postNotFound)});
                        }
                        return self.permissible.apply(self, [found, ...origArgs]);
                    });
                }

                // -----------------------------------------------------------------
                // Helper checks
                // -----------------------------------------------------------------
                const isChangingAuthors = () => {
                    if (!unsafeAttrs.authors) return false;
                    if (!unsafeAttrs.authors.length) return true;
                    return unsafeAttrs.authors[0].id !== postModelOrId.related('authors').models[0].id;
                };

                const isOwner = () => {
                    if (!unsafeAttrs.authors) return false;
                    return (
                        unsafeAttrs.authors.length &&
                        unsafeAttrs.authors[0].id === context.user
                    );
                };

                const isPrimaryAuthor = () => context.user === postModelOrId.related('authors').models[0].id;

                const isCoAuthor = () =>
                    postModelOrId
                        .related('authors')
                        .models.map(a => a.id)
                        .includes(context.user);

                // -----------------------------------------------------------------
                // Permission matrix
                // -----------------------------------------------------------------
                if (isContributor && isEdit) {
                    hasUserPermission = !isChangingAuthors() && isCoAuthor();
                } else if (isContributor && isAdd) {
                    hasUserPermission = isOwner();
                } else if (isContributor && isDestroy) {
                    hasUserPermission = isPrimaryAuthor();
                } else if (isAuthor && isEdit) {
                    hasUserPermission = isCoAuthor() && !isChangingAuthors();
                } else if (isAuthor && isAdd) {
                    hasUserPermission = isOwner();
                } else if (postModelOrId) {
                    hasUserPermission = hasUserPermission || isPrimaryAuthor();
                }

                if (hasUserPermission && hasApiKeyPermission) {
                    return Post.permissible
                        .call(
                            this,
                            postModelOrId,
                            action,
                            context,
                            unsafeAttrs,
                            loadedPermissions,
                            hasUserPermission,
                            hasApiKeyPermission
                        )
                        .then(({excludedAttrs}) => {
                            if (isContributor || isAuthor) {
                                return {excludedAttrs: ['authors', ...excludedAttrs]};
                            }
                            return {excludedAttrs};
                        });
                }

                return Promise.reject(
                    new errors.NoPermissionError({message: tpl(messages.notEnoughPermission)})
                );
            }
        }
    );

    return Model;
};
```