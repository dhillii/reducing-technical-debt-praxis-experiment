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

// Helper: Add authors to withRelated for forUpdate operations
function addAuthorsForUpdate(fnName, options) {
    if (options.forUpdate &&
        ['onFetching', 'onFetchingCollection'].indexOf(fnName) !== -1 &&
        options.withRelated.indexOf('authors') === -1) {
        options.withRelated.push('authors');
    }
}

// Helper: Process options before fetch operations
function processOptionsBeforeFetch(model, attrs, options, fnName, proto, self) {
    storeOriginalOptions(model, options);
    normalizeAuthorRelation(options);
    addAuthorsForUpdate(fnName, options);
    return proto[fnName].call(self, model, attrs, options);
}

// Helper: Check if authors were requested in original options
function authorsWereRequested(originalOptions) {
    return originalOptions && originalOptions.withRelated && 
           originalOptions.withRelated.indexOf('authors') !== -1;
}

// Helper: Set primary author from authors list
function setPrimaryAuthor(attrs, options) {
    if (!options.columns || (options.columns && options.columns.indexOf('primary_author') > -1)) {
        if (attrs.authors && attrs.authors.length) {
            attrs.primary_author = attrs.authors[0];
        } else {
            attrs.primary_author = null;
        }
    }
}

// Helper: Validate authors exist
function validateAuthorsExist(model) {
    if (model.get('authors') && !model.get('authors').length) {
        throw new errors.ValidationError({
            message: 'At least one author is required.'
        });
    }
}

// Helper: Get owner user for author matching
function getOwnerUser(ghostBookshelf, options) {
    return ghostBookshelf
        .model('User')
        .getOwnerUser(Object.assign({}, _.pick(options, 'transacting')));
}

// Helper: Find user by id, slug, or email
function findUserByAuthorData(ghostBookshelf, author, options) {
    const query = {};

    if (author.id) {
        query.id = author.id;
    } else if (author.slug) {
        query.slug = author.slug;
    } else if (author.email) {
        query.email = author.email;
    }

    return ghostBookshelf
        .model('User')
        .where(query)
        .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')));
}

// Helper: Process single author for matching
function processAuthorForMatching(ghostBookshelf, author, index, ownerUser, options) {
    return findUserByAuthorData(ghostBookshelf, author, options)
        .then((user) => {
            return {
                userId: user ? user.id : ownerUser.id,
                index: index
            };
        });
}

// Helper: Build authors set avoiding duplicates
function buildAuthorsSet(authorResults) {
    const authorsToSet = [];
    const seenIds = new Set();

    authorResults.forEach((result) => {
        if (!seenIds.has(result.userId)) {
            seenIds.add(result.userId);
            authorsToSet[result.index] = {id: result.userId};
        }
    });

    return authorsToSet.filter(author => author !== undefined);
}

// Helper: Match authors to existing users
function matchAuthorsToUsers(ghostBookshelf, model, ownerUser, options) {
    const authors = model.get('authors');

    return Promise.all(authors.map((author, index) => {
        return processAuthorForMatching(ghostBookshelf, author, index, ownerUser, options);
    })).then((authorResults) => {
        const authorsToSet = buildAuthorsSet(authorResults);
        model.set('authors', authorsToSet);
    });
}

// Helper: Get owner user ID from database
function getOwnerUserId(ghostBookshelf, trx) {
    const knex = ghostBookshelf.knex;
    return knex('roles')
        .transacting(trx)
        .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
        .where('roles.name', 'Owner')
        .select('roles_users.user_id')
        .then((ownerUser) => ownerUser[0].user_id);
}

// Helper: Get author's posts
function getAuthorsPosts(ghostBookshelf, authorId, trx) {
    return ghostBookshelf.knex('posts_authors')
        .transacting(trx)
        .where('author_id', authorId)
        .select('post_id', 'sort_order');
}

// Helper: Get owner's posts
function getOwnersPosts(ghostBookshelf, ownerId, trx) {
    return ghostBookshelf.knex('posts_authors')
        .transacting(trx)
        .where('author_id', ownerId)
        .select('post_id');
}

// Helper: Remove author from primary posts with owner coauthor
function removeAuthorFromPrimaryPostsWithOwner(ghostBookshelf, authorId, ownerId, primaryPostsWithOwnerCoauthorIds, trx) {
    return ghostBookshelf.knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
        .where('author_id', authorId)
        .del();
}

// Helper: Make owner primary author on posts
function makeOwnerPrimaryAuthor(ghostBookshelf, ownerId, primaryPostsWithOwnerCoauthorIds, trx) {
    return ghostBookshelf.knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
        .where('author_id', ownerId)
        .update('sort_order', 0);
}

// Helper: Replace author with owner on primary posts
function replaceAuthorWithOwner(ghostBookshelf, authorId, ownerId, postsWithoutOwnerCoauthorIds, trx) {
    return ghostBookshelf.knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', postsWithoutOwnerCoauthorIds)
        .where('author_id', authorId)
        .update('author_id', ownerId);
}

// Helper: Remove author from all remaining posts
function removeAuthorFromAllPosts(ghostBookshelf, authorId, trx) {
    return ghostBookshelf.knex('posts_authors')
        .transacting(trx)
        .where('author_id', authorId)
        .del();
}

// Helper: Execute reassign logic
function executeReassignLogic(ghostBookshelf, authorId, ownerId, trx) {
    return getAuthorsPosts(ghostBookshelf, authorId, trx)
        .then((authorsPosts) => {
            return getOwnersPosts(ghostBookshelf, ownerId, trx)
                .then((ownersPosts) => {
                    const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
                    const primaryPostsWithOwnerCoauthor = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
                    const primaryPostsWithOwnerCoauthorIds = primaryPostsWithOwnerCoauthor.map(post => post.post_id);
                    const primaryPostsWithoutOwnerCoauthor = _.differenceBy(authorsPrimaryPosts, primaryPostsWithOwnerCoauthor, 'post_id');
                    const postsWithoutOwnerCoauthorIds = primaryPostsWithoutOwnerCoauthor.map(post => post.post_id);

                    return Promise.all([
                        removeAuthorFromPrimaryPostsWithOwner(ghostBookshelf, authorId, ownerId, primaryPostsWithOwnerCoauthorIds, trx),
                        makeOwnerPrimaryAuthor(ghostBookshelf, ownerId, primaryPostsWithOwnerCoauthorIds, trx),
                        replaceAuthorWithOwner(ghostBookshelf, authorId, ownerId, postsWithoutOwnerCoauthorIds, trx),
                        removeAuthorFromAllPosts(ghostBookshelf, authorId, trx)
                    ]);
                });
        });
}

// Helper: Check if user is changing authors
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
function determineUserPermission(isContributor, isAuthor, action, unsafeAttrs, context, postModel) {
    const isEdit = action === 'edit';
    const isAdd = action === 'add';
    const isDestroy = action === 'destroy';

    if (isContributor && isEdit) {
        return !isChangingAuthors(unsafeAttrs, postModel) && isCoAuthor(context, postModel);
    }

    if (isContributor && isAdd) {
        return isOwner(unsafeAttrs, context);
    }

    if (isContributor && isDestroy) {
        return isPrimaryAuthor(context, postModel);
    }

    if (isAuthor && isEdit) {
        return isCoAuthor(context, postModel) && !isChangingAuthors(unsafeAttrs, postModel);
    }

    if (isAuthor && isAdd) {
        return isOwner(unsafeAttrs, context);
    }

    if (postModel) {
        return isPrimaryAuthor(context, postModel);
    }

    return false;
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
                return processOptionsBeforeFetch(model, attrs, options, fnName, proto, self);
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

            // @deprecated: single authors was superceded by multiple authors in Ghost 1.22.0
            model.unset('author');

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

            if (!authorsWereRequested(this._originalOptions)) {
                delete attrs.authors;
            }

            setPrimaryAuthor(attrs, options);

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
                return getOwnerUser(ghostBookshelf, options)
                    .then((_ownerUser) => {
                        ownerUser = _ownerUser;
                    });
            });

            ops.push(() => {
                return matchAuthorsToUsers(ghostBookshelf, model, ownerUser, options);
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

                try {
                    const ownerId = await getOwnerUserId(ghostBookshelf, trx);
                    await executeReassignLogic(ghostBookshelf, authorId, ownerId, trx);
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

            // If we passed in an id instead of a model, get the model then check the permissions
            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                origArgs = _.toArray(arguments).slice(1);

                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then(function then(foundPostModel) {
                        if (!foundPostModel) {
                            throw new errors.NotFoundError({
                                message: tpl(messages.postNotFound)
                            });
                        }

                        const newArgs = [foundPostModel].concat(origArgs);
                        return self.permissible.apply(self, newArgs);
                    });
            }

            hasUserPermission = determineUserPermission(isContributor, isAuthor, action, unsafeAttrs, context, postModel) || hasUserPermission;

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
                    return {
                        excludedAttrs: buildExcludedAttrs(isContributor, isAuthor, excludedAttrs)
                    };
                });
            }

            return Promise.reject(new errors.NoPermissionError({
                message: tpl(messages.notEnoughPermission)
            }));
        }
    });

    return Model;
};
```