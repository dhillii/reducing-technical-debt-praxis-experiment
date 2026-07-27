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
 * Extend Post model with author handling logic.
 */
module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    /**
     * Wrap model lifecycle methods to ensure `authors` relation handling.
     */
    function wrapWithOptions(fnName) {
        return function (model, attrs, options) {
            model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

            if (!options.withRelated) {
                options.withRelated = [];
            }

            // Replace deprecated `author` with `authors`
            const authorIdx = options.withRelated.indexOf('author');
            if (authorIdx !== -1) {
                options.withRelated.splice(authorIdx, 1, 'authors');
            }

            // Ensure authors are fetched on updates
            if (options.forUpdate && ['onFetching', 'onFetchingCollection'].includes(fnName) && !options.withRelated.includes('authors')) {
                options.withRelated.push('authors');
            }

            return proto[fnName].call(this, model, attrs, options);
        };
    }

    /**
     * Resolve author identifiers to user IDs and attach them to the post.
     */
    async function resolveAuthors(model, options) {
        const ownerUser = await ghostBookshelf.model('User')
            .getOwnerUser(_.pick(options, 'transacting'));

        const authors = model.get('authors') || [];
        const resolved = [];

        await Promise.all(authors.map(async (author) => {
            const query = author.id ? {id: author.id}
                : author.slug ? {slug: author.slug}
                : author.email ? {email: author.email}
                : {};

            const user = await ghostBookshelf.model('User')
                .where(query)
                .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')));

            const userId = user ? user.id : ownerUser.id;
            if (!resolved.some(a => a.id === userId)) {
                resolved.push({id: userId});
            }
        }));

        model.set('authors', resolved);
    }

    /**
     * Helper to determine if authors array is being cleared.
     */
    function isAuthorsBeingCleared(unsafeAttrs) {
        return unsafeAttrs.authors && unsafeAttrs.authors.length === 0;
    }

    /**
     * Helper to check if the primary author is being changed.
     */
    function isPrimaryAuthorChanging(postModel, unsafeAttrs) {
        if (!unsafeAttrs.authors) {
            return false;
        }
        const newFirst = unsafeAttrs.authors[0];
        const currentFirst = postModel.related('authors').models[0];
        return newFirst && currentFirst && newFirst.id !== currentFirst.id;
    }

    /**
     * Helper to verify the requestor is the owner author.
     */
    function isRequestorOwner(context, unsafeAttrs) {
        if (!unsafeAttrs.authors) {
            return false;
        }
        return unsafeAttrs.authors.length &&
            unsafeAttrs.authors[0].id === context.user;
    }

    /**
     * Helper to verify the requestor is the primary author.
     */
    function isRequestorPrimary(context, postModel) {
        return context.user === postModel.related('authors').models[0].id;
    }

    /**
     * Helper to verify the requestor is a co‑author.
     */
    function isRequestorCoAuthor(context, postModel) {
        return postModel.related('authors').models
            .map(a => a.id)
            .includes(context.user);
    }

    const Model = Post.extend({
        onFetching: function (model, attrs, options) {
            return wrapWithOptions.call(this, 'onFetching')(model, attrs, options);
        },

        onFetchingCollection: function (collection, attrs, options) {
            return wrapWithOptions.call(this, 'onFetchingCollection')(collection, attrs, options);
        },

        onFetchedCollection: function (collection, attrs, options) {
            collection.models.forEach(m => {
                m._originalOptions = collection._originalOptions;
            });
            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        onCreating: async function (model, attrs, options) {
            if (!model.get('authors')) {
                model.set('authors', [{id: await this.contextUser(options)}]);
            }
            return wrapWithOptions.call(this, 'onCreating')(model, attrs, options);
        },

        onUpdating: function (model, attrs, options) {
            return wrapWithOptions.call(this, 'onUpdating')(model, attrs, options);
        },

        onSaving: async function (model, attrs, options) {
            model.unset('author');

            if (model.get('authors') && model.get('authors').length === 0) {
                throw new errors.ValidationError({message: 'At least one author is required.'});
            }

            const ops = [];

            if (model.get('authors')) {
                ops.push(() => resolveAuthors.call(this, model, options));
            }

            ops.push(() => proto.onSaving.call(this, model, attrs, options));

            return sequence(ops);
        },

        serialize: function (options) {
            const attrs = proto.serialize.call(this, options);

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

        /**
         * Match provided author identifiers to existing users.
         */
        matchAuthors: async function (model, options) {
            await resolveAuthors.call(this, model, options);
        }
    }, {
        /**
         * Reassign posts from a deleted author to the owner.
         */
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

                    // Remove author from posts where owner is also a co‑author and promote owner
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

                    // Swap author with owner for primary posts without owner co‑author
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
                return ghostBookshelf.transaction(trx => {
                    options.transacting = trx;
                    return reassign();
                });
            }

            return reassign();
        },

        /**
         * Permission check for post actions.
         */
        permissible: async function (postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);

            // Resolve ID to model if needed
            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                const origArgs = Array.from(arguments).slice(1);
                const found = await this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']});
                if (!found) {
                    throw new errors.NotFoundError({message: tpl(messages.postNotFound)});
                }
                return self.permissible.apply(self, [found, ...origArgs]);
            }

            const isEdit = action === 'edit';
            const isAdd = action === 'add';
            const isDestroy = action === 'destroy';

            if (isContributor && isEdit) {
                hasUserPermission = !isPrimaryAuthorChanging(postModelOrId, unsafeAttrs) && isRequestorCoAuthor(context, postModelOrId);
            } else if (isContributor && isAdd) {
                hasUserPermission = isRequestorOwner(context, unsafeAttrs);
            } else if (isContributor && isDestroy) {
                hasUserPermission = isRequestorPrimary(context, postModelOrId);
            } else if (isAuthor && isEdit) {
                hasUserPermission = isRequestorCoAuthor(context, postModelOrId) && !isPrimaryAuthorChanging(postModelOrId, unsafeAttrs);
            } else if (isAuthor && isAdd) {
                hasUserPermission = isRequestorOwner(context, unsafeAttrs);
            } else if (postModelOrId) {
                hasUserPermission = hasUserPermission || isRequestorPrimary(context, postModelOrId);
            }

            if (hasUserPermission && hasApiKeyPermission) {
                const {excludedAttrs} = await Post.permissible.call(
                    this,
                    postModelOrId,
                    action,
                    context,
                    unsafeAttrs,
                    loadedPermissions,
                    hasUserPermission,
                    hasApiKeyPermission
                );

                if (isContributor || isAuthor) {
                    return {excludedAttrs: ['authors', ...excludedAttrs]};
                }
                return {excludedAttrs};
            }

            throw new errors.NoPermissionError({message: tpl(messages.notEnoughPermission)});
        }
    });

    return Model;
};