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
 * Extracts the owner user from the database using the provided transaction context.
 * @param {Object} options - Options containing transacting transaction
 * @returns {Promise<Object>} The owner user model
 */
function getOwnerUser(options, ghostBookshelf) {
    return ghostBookshelf
        .model('User')
        .getOwnerUser(Object.assign({}, _.pick(options, 'transacting')));
}

/**
 * Builds a query object for finding an author based on available attributes.
 * @param {Object} author - Author object with potential id, slug, or email
 * @returns {Object} Query object for User model
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
 * Finds a user matching the provided author attributes.
 * @param {Object} author - Author object with potential id, slug, or email
 * @param {Object} ghostBookshelf - Ghost bookshelf instance
 * @param {Object} options - Options containing transacting transaction
 * @returns {Promise<Object|null>} The found user model or null
 */
function findAuthor(author, ghostBookshelf, options) {
    const query = buildAuthorQuery(author);

    return ghostBookshelf
        .model('User')
        .where(query)
        .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')))
        .then((user) => user);
}

/**
 * Matches authors to existing users or assigns owner user as fallback.
 * @param {Object} model - Post model with authors relation
 * @param {Object} options - Options containing transacting transaction
 * @param {Object} ghostBookshelf - Ghost bookshelf instance
 * @returns {Promise<void>}
 */
function matchAuthors(model, options, ghostBookshelf) {
    const authors = model.get('authors');
    const authorsToSet = [];

    return Promise.all(authors.map((author, index) => {
        return findAuthor(author, ghostBookshelf, options)
            .then((user) => {
                const userId = user ? user.id : options.ownerUser.id;

                const userExists = _.find(authorsToSet, {id: userId});

                if (!userExists) {
                    authorsToSet[index] = {id: userId};
                }
            });
    })).then(() => {
        model.set('authors', authorsToSet);
    });
}

/**
 * Handles options for model operations, ensuring authors relation is properly set.
 * @param {string} fnName - Name of the function being called
 * @param {Object} self - Model instance
 * @param {Object} proto - Prototype methods
 * @returns {Function} Wrapped function handler
 */
function handleOptions(fnName, self, proto) {
    return function innerHandleOptions(model, attrs, options) {
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

        return proto[fnName].call(self, model, attrs, options);
    };
}

/**
 * Extracts the owner user ID from the database using the provided transaction context.
 * @param {Object} trx - Transaction object
 * @param {Object} knex - Knex instance
 * @returns {Promise<number>} The owner user ID
 */
function getOwnerUserId(trx, knex) {
    return knex('roles')
        .transacting(trx)
        .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
        .where('roles.name', 'Owner')
        .select('roles_users.user_id')
        .then((ownerUser) => ownerUser[0].user_id);
}

/**
 * Retrieves all posts authored by a specific author with their sort order.
 * @param {Object} trx - Transaction object
 * @param {Object} knex - Knex instance
 * @param {number} authorId - The author ID to filter by
 * @returns {Promise<Array>} Array of posts with post_id and sort_order
 */
function getAuthorsPosts(trx, knex, authorId) {
    return knex('posts_authors')
        .transacting(trx)
        .where('author_id', authorId)
        .select('post_id', 'sort_order');
}

/**
 * Retrieves all posts where the owner is an author.
 * @param {Object} trx - Transaction object
 * @param {Object} knex - Knex instance
 * @returns {Promise<Array>} Array of posts with post_id
 */
function getOwnersPosts(trx, knex) {
    return knex('posts_authors')
        .transacting(trx)
        .where('author_id', 0) // Placeholder, will be replaced
        .select('post_id');
}

/**
 * Identifies posts where the author is primary and owner is also a co-author.
 * @param {Array} authorsPosts - Array of author posts with sort_order
 * @param {Array} ownersPosts - Array of owner posts with post_id
 * @returns {Array} Filtered array of matching posts
 */
function getPrimaryPostsWithOwnerCoauthor(authorsPosts, ownersPosts) {
    const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
    const primaryPostsWithOwnerCoauthor = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
    return primaryPostsWithOwnerCoauthor.map(post => post.post_id);
}

/**
 * Identifies posts where the author is primary but owner is not a co-author.
 * @param {Array} authorsPosts - Array of author posts with sort_order
 * @param {Array} primaryPostsWithOwnerCoauthorIds - Array of post IDs with owner co-author
 * @returns {Array} Filtered array of remaining posts
 */
function getPrimaryPostsWithoutOwnerCoauthor(authorsPosts, primaryPostsWithOwnerCoauthorIds) {
    const primaryPostsWithoutOwnerCoauthor = _.differenceBy(authorsPosts, primaryPostsWithOwnerCoauthorIds, 'post_id');
    return primaryPostsWithoutOwnerCoauthor.map(post => post.post_id);
}

/**
 * Removes the specified author from primary posts where owner is also a co-author.
 * @param {Object} trx - Transaction object
 * @param {Object} knex - Knex instance
 * @param {Array} primaryPostsWithOwnerCoauthorIds - Array of post IDs to update
 * @param {number} authorId - The author ID to remove
 * @returns {Promise<void>}
 */
function removeAuthorFromPrimaryPosts(trx, knex, primaryPostsWithOwnerCoauthorIds, authorId) {
    return knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
        .where('author_id', authorId)
        .del();
}

/**
 * Makes the owner a primary author on posts where they are a co-author.
 * @param {Object} trx - Transaction object
 * @param {Object} knex - Knex instance
 * @param {Array} primaryPostsWithOwnerCoauthorIds - Array of post IDs to update
 * @param {number} ownerId - The owner user ID
 * @returns {Promise<void>}
 */
function makeOwnerPrimaryAuthor(trx, knex, primaryPostsWithOwnerCoauthorIds, ownerId) {
    return knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
        .where('author_id', ownerId)
        .update('sort_order', 0);
}

/**
 * Swaps the current author with the owner on posts where owner is not a co-author.
 * @param {Object} trx - Transaction object
 * @param {Object} knex - Knex instance
 * @param {Array} postsWithoutOwnerCoauthorIds - Array of post IDs to update
 * @param {number} authorId - The author ID to replace
 * @param {number} ownerId - The owner user ID
 * @returns {Promise<void>}
 */
function swapAuthorWithOwner(trx, knex, postsWithoutOwnerCoauthorIds, authorId, ownerId) {
    return knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', postsWithoutOwnerCoauthorIds)
        .where('author_id', authorId)
        .update('author_id', ownerId);
}

/**
 * Removes the specified author from all posts where they are not the primary author.
 * @param {Object} trx - Transaction object
 * @param {Object} knex - Knex instance
 * @param {number} authorId - The author ID to remove
 * @returns {Promise<void>}
 */
function removeAuthorFromOtherPosts(trx, knex, authorId) {
    return knex('posts_authors')
        .transacting(trx)
        .where('author_id', authorId)
        .del();
}

/**
 * Reassigns posts from one author to the owner user.
 * @param {Object} options - Options containing transacting transaction
 * @param {Object} ghostBookshelf - Ghost bookshelf instance
 * @param {number} authorId - The author ID to reassign from
 * @returns {Promise<void>}
 */
function reassignPost(options, ghostBookshelf, authorId) {
    let trx = options.transacting;
    let knex = ghostBookshelf.knex;

    return getOwnerUserId(trx, knex)
        .then((ownerId) => {
            return getAuthorsPosts(trx, knex, authorId)
                .then((authorsPosts) => {
                    return getOwnersPosts(trx, knex)
                        .then((ownersPosts) => {
                            const primaryPostsWithOwnerCoauthorIds = getPrimaryPostsWithOwnerCoauthor(authorsPosts, ownersPosts);

                            return removeAuthorFromPrimaryPosts(trx, knex, primaryPostsWithOwnerCoauthorIds, authorId)
                                .then(() => makeOwnerPrimaryAuthor(trx, knex, primaryPostsWithOwnerCoauthorIds, ownerId))
                                .then(() => {
                                    const postsWithoutOwnerCoauthorIds = getPrimaryPostsWithoutOwnerCoauthor(authorsPosts, primaryPostsWithOwnerCoauthorIds);
                                    return swapAuthorWithOwner(trx, knex, postsWithoutOwnerCoauthorIds, authorId, ownerId);
                                });
                        });
                })
                .then(() => removeAuthorFromOtherPosts(trx, knex, authorId));
        });
}

/**
 * Checks if authors are being changed in the unsafe attributes.
 * @param {Object} unsafeAttrs - Attributes being updated
 * @param {Object} postModel - Post model instance
 * @returns {boolean} True if authors are changing
 */
function isChangingAuthors(unsafeAttrs, postModel) {
    if (!unsafeAttrs.authors) {
        return false;
    }

    if (!unsafeAttrs.authors.length) {
        return true;
    }

    return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
}

/**
 * Checks if the current user is the owner of the post.
 * @param {Object} unsafeAttrs - Attributes being updated
 * @param {Object} context - Request context
 * @returns {boolean} True if user is owner
 */
function isOwner(unsafeAttrs, context) {
    if (!unsafeAttrs.authors) {
        return false;
    }

    if (unsafeAttrs.authors) {
        const isCorrectOwner = unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
        return isCorrectOwner;
    }

    return false;
}

/**
 * Checks if the current user is the primary author of the post.
 * @param {Object} context - Request context
 * @param {Object} postModel - Post model instance
 * @returns {boolean} True if user is primary author
 */
function isPrimaryAuthor(context, postModel) {
    return context.user === postModel.related('authors').models[0].id;
}

/**
 * Checks if the current user is a co-author of the post.
 * @param {Object} context - Request context
 * @param {Object} postModel - Post model instance
 * @returns {boolean} True if user is co-author
 */
function isCoAuthor(context, postModel) {
    return postModel.related('authors').models.map(author => author.id).includes(context.user);
}

/**
 * Determines if the user has permission to edit based on contributor role.
 * @param {boolean} isContributor - Whether user is a contributor
 * @param {boolean} isEdit - Whether action is edit
 * @param {boolean} isChangingAuthors - Whether authors are changing
 * @param {boolean} isCoAuthor - Whether user is co-author
 * @returns {boolean} True if user has permission
 */
function checkContributorPermissions(isContributor, isEdit, isChangingAuthors, isCoAuthor) {
    return isContributor && isEdit && !isChangingAuthors && isCoAuthor;
}

/**
 * Determines if the user has permission to add based on contributor role.
 * @param {boolean} isContributor - Whether user is a contributor
 * @param {boolean} isAdd - Whether action is add
 * @param {boolean} isOwner - Whether user is owner
 * @returns {boolean} True if user has permission
 */
function checkContributorAddPermissions(isContributor, isAdd, isOwner) {
    return isContributor && isAdd && isOwner;
}

/**
 * Determines if the user has permission to destroy based on contributor role.
 * @param {boolean} isContributor - Whether user is a contributor
 * @param {boolean} isDestroy - Whether action is destroy
 * @param {boolean} isPrimaryAuthor - Whether user is primary author
 * @returns {boolean} True if user has permission
 */
function checkContributorDestroyPermissions(isContributor, isDestroy, isPrimaryAuthor) {
    return isContributor && isDestroy && isPrimaryAuthor;
}

/**
 * Determines if the user has permission to edit based on author role.
 * @param {boolean} isAuthor - Whether user is an author
 * @param {boolean} isEdit - Whether action is edit
 * @param {boolean} isCoAuthor - Whether user is co-author
 * @param {boolean} isChangingAuthors - Whether authors are changing
 * @returns {boolean} True if user has permission
 */
function checkAuthorPermissions(isAuthor, isEdit, isCoAuthor, isChangingAuthors) {
    return isAuthor && isEdit && isCoAuthor && !isChangingAuthors;
}

/**
 * Determines if the user has permission to add based on author role.
 * @param {boolean} isAuthor - Whether user is an author
 * @param {boolean} isAdd - Whether action is add
 * @param {boolean} isOwner - Whether user is owner
 * @returns {boolean} True if user has permission
 */
function checkAuthorAddPermissions(isAuthor, isAdd, isOwner) {
    return isAuthor && isAdd && isOwner;
}

/**
 * Determines if the user has permission based on post model.
 * @param {boolean} hasUserPermission - Current user permission status
 * @param {boolean} isPrimaryAuthor - Whether user is primary author
 * @returns {boolean} True if user has permission
 */
function checkPostPermissions(hasUserPermission, isPrimaryAuthor) {
    return hasUserPermission || isPrimaryAuthor;
}

/**
 * Filters options for the reassignByAuthor action.
 * @param {Object} unfilteredOptions - Original options
 * @param {string} actionName - Action name
 * @param {Object} extraAllowedProperties - Additional allowed properties
 * @returns {Object} Filtered options
 */
function filterOptions(unfilteredOptions, actionName, extraAllowedProperties) {
    return this.filterOptions(unfilteredOptions, actionName, {extraAllowedProperties: ['id']});
}

/**
 * Extends the Post model with authors-related functionality.
 * @param {Object} Post - Post model
 * @param {Object} Posts - Posts collection
 * @param {Object} ghostBookshelf - Ghost bookshelf instance
 * @returns {Object} Extended Post model
 */
module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions: function _handleOptions(fnName) {
            const self = this;
            return handleOptions(fnName, self, proto);
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

            model.unset('author');

            if (model.get('authors') && !model.get('authors').length) {
                throw new errors.ValidationError({
                    message: 'At least one author is required.'
                });
            }

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

        matchAuthors: function matchAuthors(model, options) {
            return matchAuthors(model, options, ghostBookshelf);
        },

        reassignByAuthor: async function reassignByAuthor(unfilteredOptions) {
            let options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
            let authorId = options.id;

            if (!authorId) {
                return Promise.reject(new errors.NotFoundError({
                    message: tpl(messages.noUserFound)
                }));
            }

            if (!options.transacting) {
                return ghostBookshelf.transaction((transacting) => {
                    options.transacting = transacting;
                    return reassignPost(options, ghostBookshelf, authorId);
                });
            }

            return reassignPost(options, ghostBookshelf, authorId);
        },

        permissible: function permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const postModel = postModelOrId;
            let origArgs;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
            let isEdit;
            let isAdd;
            let isDestroy;

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

            isEdit = (action === 'edit');
            isAdd = (action === 'add');
            isDestroy = (action === 'destroy');

            if (isContributor && isEdit) {
                hasUserPermission = checkContributorPermissions(isContributor, isEdit, isChangingAuthors(unsafeAttrs, postModel), isCoAuthor(context, postModel));
            } else if (isContributor && isAdd) {
                hasUserPermission = checkContributorAddPermissions(isContributor, isAdd, isOwner(unsafeAttrs, context));
            } else if (isContributor && isDestroy) {
                hasUserPermission = checkContributorDestroyPermissions(isContributor, isDestroy, isPrimaryAuthor(context, postModel));
            } else if (isAuthor && isEdit) {
                hasUserPermission = checkAuthorPermissions(isAuthor, isEdit, isCoAuthor(context, postModel), isChangingAuthors(unsafeAttrs, postModel));
            } else if (isAuthor && isAdd) {
                hasUserPermission = checkAuthorAddPermissions(isAuthor, isAdd, isOwner(unsafeAttrs, context));
            } else if (postModel) {
                hasUserPermission = checkPostPermissions(hasUserPermission, isPrimaryAuthor(context, postModel));
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
```