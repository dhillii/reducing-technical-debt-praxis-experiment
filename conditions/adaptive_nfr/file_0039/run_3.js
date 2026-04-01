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
 * Normalizes withRelated options by replacing 'author' with 'authors'
 * @param {Array} withRelated - The withRelated array from options
 */
function normalizeAuthorRelation(withRelated) {
    const authorIndex = withRelated.indexOf('author');
    if (authorIndex !== -1) {
        withRelated.splice(authorIndex, 1);
        withRelated.push('authors');
    }
}

/**
 * Checks if authors should be fetched for update operations
 * @param {boolean} forUpdate - Whether this is a forUpdate operation
 * @param {string} fnName - The function name being called
 * @param {Array} withRelated - The withRelated array
 * @returns {boolean} True if authors should be added to withRelated
 */
function shouldFetchAuthorsForUpdate(forUpdate, fnName, withRelated) {
    return forUpdate &&
        ['onFetching', 'onFetchingCollection'].indexOf(fnName) !== -1 &&
        withRelated.indexOf('authors') === -1;
}

/**
 * Checks if authors were requested in original options
 * @param {Object} originalOptions - The original options object
 * @returns {boolean} True if authors were requested
 */
function authorsWereRequested(originalOptions) {
    return originalOptions && 
           originalOptions.withRelated && 
           originalOptions.withRelated.indexOf('authors') !== -1;
}

/**
 * Extracts author identifier from author object
 * @param {Object} author - The author object
 * @returns {Object} Query object with id, slug, or email
 */
function extractAuthorQuery(author) {
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
 * Checks if user already exists in authors set
 * @param {Array} authorsToSet - Array of authors to be set
 * @param {string} userId - User ID to check
 * @returns {boolean} True if user exists
 */
function authorExists(authorsToSet, userId) {
    return _.find(authorsToSet, {id: userId});
}

/**
 * Determines permission based on contributor role and action
 * @param {string} action - The action being performed
 * @param {Function} isChangingAuthors - Predicate function
 * @param {Function} isCoAuthor - Predicate function
 * @param {Function} isOwner - Predicate function
 * @returns {boolean|null} Permission result or null if no match
 */
function getContributorPermission(action, isChangingAuthors, isCoAuthor, isOwner) {
    const permissionMap = {
        'edit': () => !isChangingAuthors() && isCoAuthor(),
        'add': () => isOwner(),
        'destroy': () => false
    };
    return permissionMap[action] ? permissionMap[action]() : null;
}

/**
 * Determines permission based on author role and action
 * @param {string} action - The action being performed
 * @param {Function} isCoAuthor - Predicate function
 * @param {Function} isChangingAuthors - Predicate function
 * @param {Function} isOwner - Predicate function
 * @returns {boolean|null} Permission result or null if no match
 */
function getAuthorPermission(action, isCoAuthor, isChangingAuthors, isOwner) {
    const permissionMap = {
        'edit': () => isCoAuthor() && !isChangingAuthors(),
        'add': () => isOwner()
    };
    return permissionMap[action] ? permissionMap[action]() : null;
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

                normalizeAuthorRelation(options.withRelated);

                if (shouldFetchAuthorsForUpdate(options.forUpdate, fnName, options.withRelated)) {
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
            if (!options.columns || (options.columns && options.columns.indexOf('primary_author') > -1)) {
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
                const authors = model.get('authors');
                const authorsToSet = [];

                return Promise.all(authors.map((author, index) => {
                    const query = extractAuthorQuery(author);

                    return ghostBookshelf
                        .model('User')
                        .where(query)
                        .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')))
                        .then((user) => {
                            let userId = user ? user.id : ownerUser.id;

                            // CASE: avoid attaching duplicate authors relation
                            if (!authorExists(authorsToSet, userId.id)) {
                                authorsToSet[index] = {};
                                authorsToSet[index].id = userId;
                            }
                        });
                })).then(() => {
                    model.set('authors', authorsToSet);
                });
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