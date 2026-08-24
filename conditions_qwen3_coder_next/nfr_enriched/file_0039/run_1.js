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
 * Explain why and when authors must be fetched by default.
 *
 * # CASE 1
 * We fetch the `authors` relations when you either request `withRelated=['authors']` or `withRelated=['author']`.
 * The old `author` relation was removed, but we still have to support this case.
 *
 * It's impossible to implement a default `withRelated` feature nicely at the moment, because we can't hook into bookshelf
 * and support all model queries and collection queries (e.g. fetchAll). The hardest part is to remember
 * if the user requested the `authors` or not. Overriding `sync` does not work for collections.
 * And overriding the sync method of Collection does not trigger sync - probably a bookshelf bug, i have
 * not investigated.
 *
 * That's why we remember `_originalOptions` for now - only specific to posts.
 *
 * NOTE: If we fetch the multiple authors manually on the events, we run into the same problem. We have to remember
 * the original options. Plus: we would fetch the authors twice in some cases.
 */
module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    /**
     * Clones specific option keys from `options` into `model._originalOptions`.
     * Normalizes `author` → `authors` in `withRelated`.
     * Adds `authors` when `forUpdate` is true and relevant hooks are triggered.
     */
    const handleOptions = function handleOptions(fnName) {
        return function innerHandleOptions(model, attrs, options) {
            model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

            if (!options.withRelated) {
                options.withRelated = [];
            }

            // Normalize deprecated `author` to `authors`
            if (options.withRelated.indexOf('author') !== -1) {
                const index = options.withRelated.indexOf('author');
                options.withRelated.splice(index, 1);
                options.withRelated.push('authors');
            }

            // Ensure authors are always loaded for updates
            if (options.forUpdate &&
                ['onFetching', 'onFetchingCollection'].indexOf(fnName) !== -1 &&
                options.withRelated.indexOf('authors') === -1) {
                options.withRelated.push('authors');
            }

            return proto[fnName].call(this, model, attrs, options);
        };
    };

    const Model = Post.extend({
        _handleOptions: handleOptions,

        onFetching: function onFetching(model, attrs, options) {
            return this._handleOptions('onFetching')(model, attrs, options);
        },

        onFetchingCollection: function onFetchingCollection(collection, attrs, options) {
            return this._handleOptions('onFetchingCollection')(collection, attrs, options);
        },

        onFetchedCollection: function onFetchedCollection(collection, attrs, options) {
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

            return this._handleOptions('onCreating')(model, attrs, options);
        },

        onUpdating: function onUpdating(model, attrs, options) {
            return this._handleOptions('onUpdating')(model, attrs, options);
        },

        /**
         * Ensure deprecated `author` is removed and `authors` is validated.
         * Match provided authors against existing users or fallback to owner.
         */
        onSaving: function onSaving(model, attrs, options) {
            const ops = [];

            // Remove deprecated `author` attribute (Ghost 3.0+)
            model.unset('author');

            // Validate: at least one author required
            if (model.get('authors') && !model.get('authors').length) {
                throw new errors.ValidationError({
                    message: 'At least one author is required.'
                });
            }

            // Validate and match authors
            if (model.get('authors')) {
                ops.push(() => this.matchAuthors(model, options));
            }

            // Continue with base `onSaving` behavior
            ops.push(() => proto.onSaving.call(this, model, attrs, options));

            return sequence(ops);
        },

        /**
         * Serialize model with computed `primary_author`.
         * Strip `authors` if not requested.
         */
        serialize: function serialize(options) {
            let attrs = proto.serialize.call(this, options);

            // Ensure `_originalOptions` exists for non-persisted stubs
            if (!this._originalOptions) {
                this._originalOptions = {};
            }

            // Remove authors if not originally requested
            if (!this._originalOptions || !this._originalOptions.withRelated || this._originalOptions.withRelated.indexOf('authors') === -1) {
                delete attrs.authors;
            }

            // Compute `primary_author` unless explicitly excluded
            if (!options.columns || (options.columns && options.columns.indexOf('primary_author') > -1)) {
                attrs.primary_author = attrs.authors ? attrs.authors[0] || null : null;
            }

            return attrs;
        },

        /**
         * Match provided author identifiers (id/slug/email) against existing users.
         * Fallback to owner if no match found.
         * Ensure no duplicate author entries.
         */
        matchAuthors: function matchAuthors(model, options) {
            let ownerUser;

            const getOwnerUser = () => {
                return ghostBookshelf
                    .model('User')
                    .getOwnerUser(_.pick(options, 'transacting'))
                    .then((user) => {
                        ownerUser = user;
                    });
            };

            const matchAuthorsToUsers = () => {
                const authors = model.get('authors');

                return Promise.all(authors.map((author) => {
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
                        .fetch(_.assign({columns: ['id']}, _.pick(options, 'transacting')))
                        .then((user) => {
                            const userId = user ? user.id : ownerUser.id;

                            return userId;
                        });
                }))
                .then((userIdList) => {
                    const seenIds = new Set();
                    const authorsToSet = [];

                    // Filter out duplicates and preserve order
                    authors.forEach((author, index) => {
                        const userId = userIdList[index];
                        if (!seenIds.has(userId)) {
                            authorsToSet.push({id: userId});
                            seenIds.add(userId);
                        }
                    });

                    model.set('authors', authorsToSet);
                });
            };

            return sequence([getOwnerUser, matchAuthorsToUsers]);
        }
    }, {
        /**
         * Reassign posts from one author to the site owner.
         * Manages primary author promotion, co-author removal, and secondary removal.
         */
        reassignByAuthor: async function reassignByAuthor(unfilteredOptions) {
            let options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
            let authorId = options.id;

            if (!authorId) {
                return Promise.reject(new errors.NotFoundError({
                    message: tpl(messages.noUserFound)
                }));
            }

            /**
             * Performs the database reassignment logic within a transaction.
             */
            const executeReassignment = async () => {
                const trx = options.transacting;
                const knex = ghostBookshelf.knex;

                const ownerUser = await knex('roles')
                    .transacting(trx)
                    .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
                    .where('roles.name', 'Owner')
                    .select('roles_users.user_id');

                const ownerId = ownerUser[0]?.user_id;

                if (!ownerId) {
                    throw new errors.NotFoundError({message: 'Owner user not found'});
                }

                const authorsPosts = await knex('posts_authors')
                    .transacting(trx)
                    .where('author_id', authorId)
                    .select('post_id', 'sort_order');

                const ownersPosts = await knex('posts_authors')
                    .transacting(trx)
                    .where('author_id', ownerId)
                    .select('post_id');

                const authorsPrimaryPosts = authorsPosts.filter((ap) => ap.sort_order === 0);
                const primaryPostsWithOwnerCoauthor = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
                const primaryPostsWithOwnerCoauthorIds = primaryPostsWithOwnerCoauthor.map(post => post.post_id);

                // Remove author from primary posts where owner is co-author
                await knex('posts_authors')
                    .transacting(trx)
                    .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
                    .where('author_id', authorId)
                    .del();

                // Promote owner to primary author in primary posts with co-author
                await knex('posts_authors')
                    .transacting(trx)
                    .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
                    .where('author_id', ownerId)
                    .update('sort_order', 0);

                const primaryPostsWithoutOwnerCoauthor = _.differenceBy(authorsPrimaryPosts, primaryPostsWithOwnerCoauthor, 'post_id');
                const postsWithoutOwnerCoauthorIds = primaryPostsWithoutOwnerCoauthor.map(post => post.post_id);

                // Replace author with owner in secondary-author primary posts
                await knex('posts_authors')
                    .transacting(trx)
                    .whereIn('post_id', postsWithoutOwnerCoauthorIds)
                    .where('author_id', authorId)
                    .update('author_id', ownerId);

                // Remove author from remaining (secondary) posts
                await knex('posts_authors')
                    .transacting(trx)
                    .where('author_id', authorId)
                    .del();
            };

            const reassignPost = async () => {
                try {
                    await executeReassignment();
                } catch (err) {
                    throw new errors.InternalServerError({err});
                }
            };

            // Run in transaction if not already wrapped
            if (!options.transacting) {
                return ghostBookshelf.transaction((transacting) => {
                    options.transacting = transacting;
                    return reassignPost();
                });
            }

            return reassignPost();
        },

        /**
         * Determine if the current user or API key can perform an action on the post.
         */
        permissible: function permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const postModel = postModelOrId;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
            let isEdit = (action === 'edit');
            let isAdd = (action === 'add');
            let isDestroy = (action === 'destroy');

            // Locate by ID if a model ID was passed
            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then((foundPostModel) => {
                        if (!foundPostModel) {
                            throw new errors.NotFoundError({message: tpl(messages.postNotFound)});
                        }

                        return self.permissible.apply(self, [foundPostModel, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission]);
                    });
            }

            /**
             * Decide if authors array is changing, including removal or primary author change.
             */
            const isChangingAuthors = () => {
                if (!unsafeAttrs || !unsafeAttrs.authors) {
                    return false;
                }
                if (!unsafeAttrs.authors.length) {
                    return true;
                }
                const existingPrimary = postModel?.related('authors')?.models?.[0]?.id;
                const incomingPrimary = unsafeAttrs.authors[0]?.id;
                return existingPrimary !== incomingPrimary;
            };

            /**
             * Is the current user the site owner?
             */
            const isOwnerUser = () => {
                if (!unsafeAttrs?.authors?.length) {
                    return false;
                }
                return unsafeAttrs.authors[0]?.id === context?.user;
            };

            /**
             * Is current user the primary author of the post?
             */
            const isPrimaryAuthor = () => {
                return postModel?.related('authors')?.models?.[0]?.id === context?.user;
            };

            /**
             * Is current user among any of the post's authors (primary or secondary)?
             */
            const isCoAuthor = () => {
                const authorIds = postModel?.related('authors')?.models?.map(author => author.id) || [];
                return authorIds.includes(context?.user);
            };

            // Assign permissions based on role
            if (isContributor && isEdit) {
                hasUserPermission = !isChangingAuthors() && isCoAuthor();
            } else if (isContributor && isAdd) {
                hasUserPermission = isOwnerUser();
            } else if (isContributor && isDestroy) {
                hasUserPermission = isPrimaryAuthor();
            } else if (isAuthor && isEdit) {
                hasUserPermission = isCoAuthor() && !isChangingAuthors();
            } else if (isAuthor && isAdd) {
                hasUserPermission = isOwnerUser();
            } else if (postModel) {
                hasUserPermission = hasUserPermission || isPrimaryAuthor();
            }

            // Permit and return final exclusions if allowed
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
                            excludedAttrs: ['authors'].concat(excludedAttrs || [])
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