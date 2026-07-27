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
 * Why and when do we have to fetch `authors` by default?
 *
 * # CASE 1
 * We fetch the `authors` relations when you either request `withRelated=['authors']` or `withRelated=['author`].
 * The old `author` relation was removed, but we still have to support this case.
 *
 * ---
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

/**
 * Normalizes withRelated options by converting 'author' to 'authors'
 * @param {Array} withRelated - The withRelated array from options
 */
function normalizeWithRelated(withRelated) {
    if (!withRelated) {
        return [];
    }

    const normalized = [...withRelated];
    const authorIndex = normalized.indexOf('author');
    if (authorIndex !== -1) {
        normalized.splice(authorIndex, 1);
        normalized.push('authors');
    }
    return normalized;
}

/**
 * Determines if authors should be added to withRelated for forUpdate
 * @param {boolean} forUpdate - Whether this is a forUpdate operation
 * @param {string} fnName - The function name being called
 * @param {Array} withRelated - The current withRelated array
 */
function shouldAddAuthorsForUpdate(forUpdate, fnName, withRelated) {
    return forUpdate &&
        ['onFetching', 'onFetchingCollection'].indexOf(fnName) !== -1 &&
        withRelated.indexOf('authors') === -1;
}

/**
 * Checks if authors were requested in original options
 * @param {Object} originalOptions - The original options object
 */
function authorsWereRequested(originalOptions) {
    return originalOptions &&
        originalOptions.withRelated &&
        originalOptions.withRelated.indexOf('authors') !== -1;
}

/**
 * Determines if primary author should be computed
 * @param {Object} options - The options object
 */
function shouldComputePrimaryAuthor(options) {
    return !options.columns || (options.columns && options.columns.indexOf('primary_author') > -1);
}

/**
 * Extracts user ID from author lookup result
 * @param {Object} user - The user object from database
 * @param {Object} ownerUser - The fallback owner user
 */
function extractUserId(user, ownerUser) {
    return user ? user.id : ownerUser.id;
}

/**
 * Checks if user already exists in authors set
 * @param {Array} authorsToSet - The authors array being built
 * @param {string} userId - The user ID to check
 */
function userAlreadyExists(authorsToSet, userId) {
    return _.find(authorsToSet, {id: userId});
}

/**
 * Builds author query based on available identifiers
 * @param {Object} author - The author object with id, slug, or email
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
 * Processes a single author and returns their user ID
 * @param {Object} author - The author to process
 * @param {Object} ghostBookshelf - The bookshelf instance
 * @param {Object} ownerUser - The owner user fallback
 * @param {Object} options - The options object
 */
function processAuthor(author, ghostBookshelf, ownerUser, options) {
    const query = buildAuthorQuery(author);

    return ghostBookshelf
        .model('User')
        .where(query)
        .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')))
        .then((user) => {
            return extractUserId(user, ownerUser);
        });
}

/**
 * Matches authors in model to actual users
 * @param {Object} model - The post model
 * @param {Object} ghostBookshelf - The bookshelf instance
 * @param {Object} ownerUser - The owner user
 * @param {Object} options - The options object
 */
function matchAuthorsWithOwner(model, ghostBookshelf, ownerUser, options) {
    const authors = model.get('authors');
    const authorsToSet = [];

    return Promise.all(authors.map((author, index) => {
        return processAuthor(author, ghostBookshelf, ownerUser, options)
            .then((userId) => {
                if (!userAlreadyExists(authorsToSet, userId)) {
                    authorsToSet[index] = {id: userId};
                }
            });
    })).then(() => {
        model.set('authors', authorsToSet);
    });
}

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions: function _handleOptions(fnName) {
            const self = this;

            return function innerHandleOptions(model, attrs, options) {
                model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

                if (!options.withRelated) {
                    options.withRelated = [];
                }

                options.withRelated = normalizeWithRelated(options.withRelated);

                if (shouldAddAuthorsForUpdate(options.forUpdate, fnName, options.withRelated)) {
                    options.withRelated.push('authors');
                }

                return proto[fnName].call(self, model, attrs, options);
            };
        },

        onFetching: function onFetching(model, attrs, options) {
            return this._handleOptions('onFetching')(model, attrs, options);
        },

        onFetchingCollection: function onFetchingCollection(collection, attrs, options) {
            return this._handleOptions('onFetchingCollection')(collection, attrs, options);
        },

        onFetchedCollection: function (collection, attrs, options) {
            _.each(collection.models, ((model) => {
                model._originalOptions = collection._originalOptions;
            }));

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

        onSaving: function (model, attrs, options) {
            const ops = [];

            /**
             * @deprecated: single authors was superceded by multiple authors in Ghost 1.22.0 - `author`, is unused in Ghost 3.0
             */
            model.unset('author');

            // CASE: you can't delete all authors
            if (model.get('authors') && !model.get('authors').length) {
                throw new errors.ValidationError({
                    message: 'At least one author is required.'
                });
            }

            /**
             * @NOTE:
             *
             * Try to find a user with either id, slug or email if "authors" is present.
             * Otherwise fallback to owner user.
             *
             * You cannot create an author via posts!
             * Ghost uses the invite flow to create users.
             */
            if (model.get('authors')) {
                ops.push(() => {
                    return this.matchAuthors(model, options);
                });
            }

            ops.push(() => {
                return proto.onSaving.call(this, model, attrs, options);
            });

            return sequence(ops);
        },

        serialize: function serialize(options) {
            let attrs = proto.serialize.call(this, options);

            // CASE: e.g. you stub model response in the test
            // CASE: you delete a model without fetching before
            if (!this._originalOptions) {
                this._originalOptions = {};
            }

            // CASE: `posts.authors` was not requested, but fetched in specific cases (see top)
            if (!authorsWereRequested(this._originalOptions)) {
                delete attrs.authors;
            }

            // If the current column settings allow it...
            if (shouldComputePrimaryAuthor(options)) {
                // ... attach a computed property of primary_author which is the first author
                if (attrs.authors && attrs.authors.length) {
                    attrs.primary_author = attrs.authors[0];
                } else {
                    attrs.primary_author = null;
                }
            }

            return attrs;
        },

        /**
         * Authors relation is special. You cannot add new authors via relations.
         * But you can for the tags relation. That's why we have to sort this out before
         * we trigger bookshelf-relations.
         *
         * @TODO: Add a feature to bookshelf-relations to configure if relations can be added or should be matched only.
         */
        matchAuthors(model, options) {
            let ownerUser;
            const ops = [];

            ops.push(() => {
                return ghostBookshelf
                    .model('User')
                    .getOwnerUser(Object.assign({}, _.pick(options, 'transacting')))
                    .then((_ownerUser) => {
                        ownerUser = _ownerUser;
                    });
            });

            ops.push(() => {
                return matchAuthorsWithOwner(model, ghostBookshelf, ownerUser, options);
            });

            return sequence(ops);
        }
    }, {
        /**
         * ### reassignByAuthor
         * @param  {Object} unfilteredOptions has context and id. Context is the user doing the destroy, id is the user to destroy
         * @param {string} unfilteredOptions.id
         * @param {Object} unfilteredOptions.context
         * @param {Object} unfilteredOptions.transacting
         */
        reassignByAuthor: async function reassignByAuthor(unfilteredOptions) {
            let options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
            let authorId = options.id;

            if (!authorId) {
                return Promise.reject(new errors.NotFoundError({
                    message: tpl(messages.noUserFound)
                }));
            }

            const reassignPost = (async () => {
                let trx = options.transacting;
                let knex = ghostBookshelf.knex;

                try {
                    // There's only one possible owner per Ghost instance
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

                    // remove author and bump owner's sort_order to 0 to make them a primary author
                    // remove author from posts
                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
                        .where('author_id', authorId)
                        .del();

                    // make the owner a primary author
                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
                        .where('author_id', ownerId)
                        .update('sort_order', 0);

                    const primaryPostsWithoutOwnerCoauthor = _.differenceBy(authorsPrimaryPosts, primaryPostsWithOwnerCoauthor, 'post_id');
                    const postsWithoutOwnerCoauthorIds = primaryPostsWithoutOwnerCoauthor.map(post => post.post_id);

                    // swap out current author with the owner
                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', postsWithoutOwnerCoauthorIds)
                        .where('author_id', authorId)
                        .update('author_id', ownerId);

                    // remove author as secondary author from any other posts
                    await knex('posts_authors')
                        .transacting(trx)
                        .where('author_id', authorId)
                        .del();
                } catch (err) {
                    throw new errors.InternalServerError({err: err});
                }
            });

            if (!options.transacting) {
                return ghostBookshelf.transaction((transacting) => {
                    options.transacting = transacting;
                    return reassignPost();
                });
            }

            return reassignPost();
        },

        permissible: function permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const postModel = postModelOrId;
            let origArgs;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);

            // If we passed in an id instead of a model, get the model
            // then check the permissions
            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                // Grab the original args without the first one
                origArgs = _.toArray(arguments).slice(1);

                // Get the actual post model
                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then(function then(foundPostModel) {
                        if (!foundPostModel) {
                            throw new errors.NotFoundError({
                                message: tpl(messages.postNotFound)
                            });
                        }

                        // Build up the original args but substitute with actual model
                        const newArgs = [foundPostModel].concat(origArgs);
                        return self.permissible.apply(self, newArgs);
                    });
            }

            const isEdit = (action === 'edit');
            const isAdd = (action === 'add');
            const isDestroy = (action === 'destroy');

            /** @returns {boolean} Whether authors are being changed */
            function isChangingAuthors() {
                if (!unsafeAttrs.authors) {
                    return false;
                }

                if (!unsafeAttrs.authors.length) {
                    return true;
                }

                return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
            }

            /** @returns {boolean} Whether the user is the owner of the post */
            function isOwner() {
                if (!unsafeAttrs.authors) {
                    return false;
                }

                return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
            }

            /** @returns {boolean} Whether the user is the primary author */
            function isPrimaryAuthor() {
                return (context.user === postModel.related('authors').models[0].id);
            }

            /** @returns {boolean} Whether the user is a co-author */
            function isCoAuthor() {
                return postModel.related('authors').models.map(author => author.id).includes(context.user);
            }

            // Strategy object for permission checks
            const permissionStrategies = {
                contributorEdit: () => !isChangingAuthors() && isCoAuthor(),
                contributorAdd: () => isOwner(),
                contributorDestroy: () => isPrimaryAuthor(),
                authorEdit: () => isCoAuthor() && !isChangingAuthors(),
                authorAdd: () => isOwner(),
                defaultCheck: () => isPrimaryAuthor()
            };

            // Determine permission based on role and action
            if (isContributor && isEdit) {
                hasUserPermission = permissionStrategies.contributorEdit();
            } else if (isContributor && isAdd) {
                hasUserPermission = permissionStrategies.contributorAdd();
            } else if (isContributor && isDestroy) {
                hasUserPermission = permissionStrategies.contributorDestroy();
            } else if (isAuthor && isEdit) {
                hasUserPermission = permissionStrategies.authorEdit();
            } else if (isAuthor && isAdd) {
                hasUserPermission = permissionStrategies.authorAdd();
            } else if (postModel) {
                hasUserPermission = hasUserPermission || permissionStrategies.defaultCheck();
            }

            if (hasUserPermission && hasApiKeyPermission) {
                return Post.permissible.call(
                    this,
                    postModelOrId,
                    action, context,
                    unsafeAttrs,
                    loadedPermissions,
                    hasUserPermission,
                    hasApiKeyPermission
                ).then(({excludedAttrs}) => {
                    // @TODO: we need a concept for making a diff between incoming authors and existing authors
                    // @TODO: for now we simply re-use the new concept of `excludedAttrs`
                    // We only check the primary author of `authors`, any other change will be ignored.
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