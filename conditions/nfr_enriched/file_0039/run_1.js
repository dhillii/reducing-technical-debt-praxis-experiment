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

// Helper: Store original options from request
function storeOriginalOptions(model, options) {
    model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));
}

// Helper: Normalize author relation to authors
function normalizeAuthorRelation(options) {
    if (!options.withRelated) {
        options.withRelated = [];
    }

    if (options.withRelated.indexOf('author') !== -1) {
        options.withRelated.splice(options.withRelated.indexOf('author'), 1);
        options.withRelated.push('authors');
    }
}

// Helper: Add authors to withRelated for forUpdate queries
function addAuthorsForUpdate(fnName, options) {
    if (options.forUpdate &&
        ['onFetching', 'onFetchingCollection'].indexOf(fnName) !== -1 &&
        options.withRelated.indexOf('authors') === -1) {
        options.withRelated.push('authors');
    }
}

// Helper: Process options before model operations
function processModelOptions(fnName, model, attrs, options, proto, self) {
    storeOriginalOptions(model, options);
    normalizeAuthorRelation(options);
    addAuthorsForUpdate(fnName, options);
    return proto[fnName].call(self, model, attrs, options);
}

// Helper: Validate authors exist
function validateAuthorsExist(model) {
    if (model.get('authors') && !model.get('authors').length) {
        throw new errors.ValidationError({
            message: 'At least one author is required.'
        });
    }
}

// Helper: Unset deprecated author field
function unsetDeprecatedAuthor(model) {
    model.unset('author');
}

// Helper: Check if authors should be included in serialization
function shouldIncludeAuthors(originalOptions) {
    if (!originalOptions || !originalOptions.withRelated) {
        return false;
    }
    return originalOptions.withRelated.indexOf('authors') !== -1;
}

// Helper: Attach primary author computed property
function attachPrimaryAuthor(attrs, options) {
    if (!options.columns || (options.columns && options.columns.indexOf('primary_author') > -1)) {
        if (attrs.authors && attrs.authors.length) {
            attrs.primary_author = attrs.authors[0];
        } else {
            attrs.primary_author = null;
        }
    }
}

// Helper: Fetch owner user
async function fetchOwnerUser(ghostBookshelf, options) {
    return ghostBookshelf
        .model('User')
        .getOwnerUser(Object.assign({}, _.pick(options, 'transacting')));
}

// Helper: Build query for author lookup
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

// Helper: Fetch user by query
async function fetchUserByQuery(ghostBookshelf, query, options) {
    return ghostBookshelf
        .model('User')
        .where(query)
        .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')));
}

// Helper: Process single author for matching
async function processSingleAuthor(ghostBookshelf, author, index, ownerUser, authorsToSet, options) {
    const query = buildAuthorQuery(author);
    const user = await fetchUserByQuery(ghostBookshelf, query, options);
    const userId = user ? user.id : ownerUser.id;

    const userExists = _.find(authorsToSet, {id: userId});
    if (!userExists) {
        authorsToSet[index] = {id: userId};
    }
}

// Helper: Match authors to existing users
async function matchAuthorsToUsers(ghostBookshelf, model, ownerUser, options) {
    const authors = model.get('authors');
    const authorsToSet = [];

    await Promise.all(authors.map((author, index) => {
        return processSingleAuthor(ghostBookshelf, author, index, ownerUser, authorsToSet, options);
    }));

    model.set('authors', authorsToSet);
}

// Helper: Get owner user ID from database
async function getOwnerUserId(ghostBookshelf, trx) {
    const ownerUser = await ghostBookshelf.knex('roles')
        .transacting(trx)
        .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
        .where('roles.name', 'Owner')
        .select('roles_users.user_id');
    return ownerUser[0].user_id;
}

// Helper: Fetch author posts
async function fetchAuthorPosts(ghostBookshelf, authorId, trx) {
    return ghostBookshelf.knex('posts_authors')
        .transacting(trx)
        .where('author_id', authorId)
        .select('post_id', 'sort_order');
}

// Helper: Fetch owner posts
async function fetchOwnerPosts(ghostBookshelf, ownerId, trx) {
    return ghostBookshelf.knex('posts_authors')
        .transacting(trx)
        .where('author_id', ownerId)
        .select('post_id');
}

// Helper: Remove author from primary posts with owner coauthor
async function removeAuthorFromPrimaryPostsWithOwner(ghostBookshelf, authorId, ownerId, primaryPostsWithOwnerCoauthorIds, trx) {
    await ghostBookshelf.knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
        .where('author_id', authorId)
        .del();

    await ghostBookshelf.knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
        .where('author_id', ownerId)
        .update('sort_order', 0);
}

// Helper: Replace author with owner in primary posts
async function replaceAuthorWithOwner(ghostBookshelf, authorId, ownerId, postsWithoutOwnerCoauthorIds, trx) {
    await ghostBookshelf.knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', postsWithoutOwnerCoauthorIds)
        .where('author_id', authorId)
        .update('author_id', ownerId);
}

// Helper: Remove author from all remaining posts
async function removeAuthorFromAllPosts(ghostBookshelf, authorId, trx) {
    await ghostBookshelf.knex('posts_authors')
        .transacting(trx)
        .where('author_id', authorId)
        .del();
}

// Helper: Execute reassign operations
async function executeReassignOperations(ghostBookshelf, authorId, trx) {
    const ownerId = await getOwnerUserId(ghostBookshelf, trx);
    const authorsPosts = await fetchAuthorPosts(ghostBookshelf, authorId, trx);
    const ownersPosts = await fetchOwnerPosts(ghostBookshelf, ownerId, trx);

    const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
    const primaryPostsWithOwnerCoauthor = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
    const primaryPostsWithOwnerCoauthorIds = primaryPostsWithOwnerCoauthor.map(post => post.post_id);

    await removeAuthorFromPrimaryPostsWithOwner(ghostBookshelf, authorId, ownerId, primaryPostsWithOwnerCoauthorIds, trx);

    const primaryPostsWithoutOwnerCoauthor = _.differenceBy(authorsPrimaryPosts, primaryPostsWithOwnerCoauthor, 'post_id');
    const postsWithoutOwnerCoauthorIds = primaryPostsWithoutOwnerCoauthor.map(post => post.post_id);

    await replaceAuthorWithOwner(ghostBookshelf, authorId, ownerId, postsWithoutOwnerCoauthorIds, trx);
    await removeAuthorFromAllPosts(ghostBookshelf, authorId, trx);
}

// Helper: Check if authors are being changed
function isChangingAuthors(unsafeAttrs, postModel) {
    if (!unsafeAttrs.authors) {
        return false;
    }

    if (!unsafeAttrs.authors.length) {
        return true;
    }

    return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
}

// Helper: Check if user is the owner of the post
function isOwner(unsafeAttrs, context) {
    if (!unsafeAttrs.authors) {
        return false;
    }

    return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
}

// Helper: Check if user is primary author
function isPrimaryAuthor(context, postModel) {
    return context.user === postModel.related('authors').models[0].id;
}

// Helper: Check if user is co-author
function isCoAuthor(context, postModel) {
    return postModel.related('authors').models.map(author => author.id).includes(context.user);
}

// Helper: Determine user permission based on role and action
function determineUserPermission(isContributor, isAuthor, isEdit, isAdd, isDestroy, unsafeAttrs, postModel, context) {
    let hasUserPermission = false;

    if (isContributor && isEdit) {
        hasUserPermission = !isChangingAuthors(unsafeAttrs, postModel) && isCoAuthor(context, postModel);
    } else if (isContributor && isAdd) {
        hasUserPermission = isOwner(unsafeAttrs, context);
    } else if (isContributor && isDestroy) {
        hasUserPermission = isPrimaryAuthor(context, postModel);
    } else if (isAuthor && isEdit) {
        hasUserPermission = isCoAuthor(context, postModel) && !isChangingAuthors(unsafeAttrs, postModel);
    } else if (isAuthor && isAdd) {
        hasUserPermission = isOwner(unsafeAttrs, context);
    } else if (postModel) {
        hasUserPermission = isPrimaryAuthor(context, postModel);
    }

    return hasUserPermission;
}

// Helper: Build excluded attributes based on role
function buildExcludedAttrs(isContributor, isAuthor, excludedAttrs) {
    if (isContributor || isAuthor) {
        return ['authors'].concat(excludedAttrs);
    }
    return excludedAttrs;
}

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions: function _handleOptions(fnName) {
            const self = this;

            return function innerHandleOptions(model, attrs, options) {
                return processModelOptions(fnName, model, attrs, options, proto, self);
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

            unsetDeprecatedAuthor(model);
            validateAuthorsExist(model);

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

            if (!this._originalOptions) {
                this._originalOptions = {};
            }

            if (!shouldIncludeAuthors(this._originalOptions)) {
                delete attrs.authors;
            }

            attachPrimaryAuthor(attrs, options);

            return attrs;
        },

        matchAuthors(model, options) {
            let ownerUser;
            const ops = [];

            ops.push(async () => {
                ownerUser = await fetchOwnerUser(ghostBookshelf, options);
            });

            ops.push(async () => {
                await matchAuthorsToUsers(ghostBookshelf, model, ownerUser, options);
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

            const reass