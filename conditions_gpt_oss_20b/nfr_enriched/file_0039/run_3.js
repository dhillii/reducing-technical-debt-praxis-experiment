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

    /**
     * Process options for fetching and updating posts.
     * @param {string} fnName - The name of the original method.
     * @param {Object} model - The model or collection being processed.
     * @param {Object} attrs - Attributes passed to the method.
     * @param {Object} options - Options passed to the method.
     * @returns {Promise} - Result of the original method.
     */
    function processOptions(fnName, model, attrs, options) {
        model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

        if (!options.withRelated) {
            options.withRelated = [];
        }

        if (options.withRelated.indexOf('author') !== -1) {
            options.withRelated.splice(options.withRelated.indexOf('author'), 1);
            options.withRelated.push('authors');
        }

        if (options.forUpdate &&
            ['onFetching', 'onFetchingCollection'].indexOf(fnName) !== -1 &&
            options.withRelated.indexOf('authors') === -1) {
            options.withRelated.push('authors');
        }

        return proto[fnName].call(model, attrs, options);
    }

    const Model = Post.extend({
        onFetching: function onFetching(model, attrs, options) {
            return processOptions('onFetching', model, attrs, options);
        },

        onFetchingCollection: function onFetchingCollection(collection, attrs, options) {
            return processOptions('onFetchingCollection', collection, attrs, options);
        },

        onFetchedCollection: function (collection, attrs, options) {
            _.each(collection.models, (model) => {
                model._originalOptions = collection._originalOptions;
            });

            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        onCreating: async function onCreating(model, attrs, options) {
            if (!model.get('authors')) {
                model.set('authors', [{
                    id: await this.contextUser(options)
                }]);
            }

            return processOptions('onCreating', model, attrs, options);
        },

        onUpdating: function onUpdating(model, attrs, options) {
            return processOptions('onUpdating', model, attrs, options);
        },

        onSaving: async function (model, attrs, options) {
            // Remove deprecated single author field
            model.unset('author');

            // Ensure at least one author exists
            if (model.get('authors') && !model.get('authors').length) {
                throw new errors.ValidationError({
                    message: 'At least one author is required.'
                });
            }

            // Match authors to existing users
            if (model.get('authors')) {
                await this.matchAuthors(model, options);
            }

            return proto.onSaving.call(this, model, attrs, options);
        },

        serialize: function serialize(options) {
            let attrs = proto.serialize.call(this, options);

            if (!this._originalOptions) {
                this._originalOptions = {};
            }

            if (!this._originalOptions.withRelated || this._originalOptions.withRelated.indexOf('authors') === -1) {
                delete attrs.authors;
            }

            if (!options.columns || (options.columns && options.columns.indexOf('primary_author') > -1)) {
                if (attrs.authors && attrs.authors.length) {
                    attrs.primary_author = attrs.authors[0];
                } else {
                    attrs.primary_author = null;
                }
            }

            return attrs;
        },

        /**
         * Resolve authors to existing users or fallback to owner.
         * @param {Object} model - Post model.
         * @param {Object} options - Options passed to the method.
         */
        async matchAuthors(model, options) {
            const ownerUser = await ghostBookshelf
                .model('User')
                .getOwnerUser(_.pick(options, 'transacting'));

            const authors = model.get('authors');
            const authorsToSet = [];

            await Promise.all(authors.map(async (author, index) => {
                const query = {};

                if (author.id) {
                    query.id = author.id;
                } else if (author.slug) {
                    query.slug = author.slug;
                } else if (author.email) {
                    query.email = author.email;
                }

                const user = await ghostBookshelf
                    .model('User')
                    .where(query)
                    .fetch(_.assign({columns: ['id']}, _.pick(options, 'transacting')));

                const userId = user ? user.id : ownerUser.id;

                const userExists = _.find(authorsToSet, {id: userId});

                if (!userExists) {
                    authorsToSet[index] = {id: userId};
                }
            }));

            model.set('authors', authorsToSet);
        }
    }, {
        /**
         * Reassign posts from a deleted author to the owner.
         * @param {Object} unfilteredOptions - Options containing context, id, and transacting.
         */
        reassignByAuthor: async function reassignByAuthor(unfilteredOptions) {
            const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
            const authorId = options.id;

            if (!authorId) {
                return Promise.reject(new errors.NotFoundError({
                    message: tpl(messages.noUserFound)
                }));
            }

            const reassignPost = async () => {
                const trx = options.transacting;
                const knex = ghostBookshelf.knex;

                try {
                    const ownerUser = await knex('roles')
                        .transacting(trx)
                        .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
                        .where('roles.name', 'Owner')
                        .select('roles_users.user_id');

                    const ownerId = ownerUser[0].user_id;

                    const authorsPosts = await knex('posts_authors')
                        .transacting(trx)
                        .where('author_id', authorId)
                        .select('post_id', 'sort_order');

                    const ownersPosts = await knex('posts_authors')
                        .transacting(trx)
                        .where('author_id', ownerId)
                        .select('post_id');

                    const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
                    const primaryPostsWithOwnerCoauthor = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
                    const primaryPostsWithOwnerCoauthorIds = primaryPostsWithOwnerCoauthor.map(post => post.post_id);

                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
                        .where('author_id', authorId)
                        .del();

                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
                        .where('author_id', ownerId)
                        .update('sort_order', 0);

                    const primaryPostsWithoutOwnerCoauthor = _.differenceBy(authorsPrimaryPosts, primaryPostsWithOwnerCoauthor, 'post_id');
                    const postsWithoutOwnerCoauthorIds = primaryPostsWithoutOwnerCoauthor.map(post => post.post_id);

                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', postsWithoutOwnerCoauthorIds)
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
                return ghostBookshelf.transaction((transacting) => {
                    options.transacting = transacting;
                    return reassignPost();
                });
            }

            return reassignPost();
        },

        /**
         * Determine if a user has permission to perform an action on a post.
         * @param {Object|number|string} postModelOrId - Post model or ID.
         * @param {string} action - Action to check ('edit', 'add', 'destroy').
         * @param {Object} context - Request context.
         * @param {Object} unsafeAttrs - Attributes that may change.
         * @param {Object} loadedPermissions - Permissions loaded for the user.
         * @param {boolean} hasUserPermission - Existing user permission flag.
         * @param {boolean} hasApiKeyPermission - API key permission flag.
         * @returns {Promise} - Resolves with permission result or rejects with error.
         */
        permissible: function permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
            const isEdit = action === 'edit';
            const isAdd = action === 'add';
            const isDestroy = action === 'destroy';

            // Helper to fetch post by ID
            function fetchPostById(id) {
                return self.findOne({id, status: 'all'}, {withRelated: ['authors']})
                    .then(foundPostModel => {
                        if (!foundPostModel) {
                            throw new errors.NotFoundError({
                                message: tpl(messages.postNotFound)
                            });
                        }
                        return foundPostModel;
                    });
            }

            // Helper to determine if authors are changing
            function isChangingAuthors() {
                if (!unsafeAttrs.authors) return false;
                if (!unsafeAttrs.authors.length) return true;
                return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
            }

            // Helper to check ownership
            function isOwner() {
                if (!unsafeAttrs.authors) return false;
                return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
            }

            // Helper to check primary author
            function isPrimaryAuthor() {
                return context.user === postModel.related('authors').models[0].id;
            }

            // Helper to check co-author
            function isCoAuthor() {
                return postModel.related('authors').models.map(author => author.id).includes(context.user);
            }

            // Resolve post model if an ID was provided
            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                const origArgs = _.toArray(arguments).slice(1);
                return fetchPostById(postModelOrId)
                    .then(foundPostModel => {
                        const newArgs = [foundPostModel].concat(origArgs);
                        return self.permissible.apply(self, newArgs);
                    });
            }

            const postModel = postModelOrId;

            // Determine user permission based on role and action
            if (isContributor) {
                if (isEdit) {
                    hasUserPermission = !isChangingAuthors() && isCoAuthor();
                } else if (isAdd) {
                    hasUserPermission = isOwner();
                } else if (isDestroy) {
                    hasUserPermission = isPrimaryAuthor();
                }
            } else if (isAuthor) {
                if (isEdit) {
                    hasUserPermission = isCoAuthor() && !isChangingAuthors();
                } else if (isAdd) {
                    hasUserPermission = isOwner();
                } else if (postModel) {
                    hasUserPermission = isPrimaryAuthor();
                }
            } else if (postModel) {
                hasUserPermission = hasUserPermission || isPrimaryAuthor();
            }

            // Final permission check
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
                        return {
                            excludedAttrs: ['authors'].concat(excludedAttrs)
                        };
                    }
                    return {excludedAttrs};
                });
            }

            return Promise.reject(new errors.NoPermissionError({
                message: tpl(messages.notEnoughPermission)
            }));
        }
    });

    return Model;
};