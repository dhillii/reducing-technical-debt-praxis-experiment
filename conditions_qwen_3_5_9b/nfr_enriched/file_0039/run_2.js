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
 * Extracts and normalizes author-related options from the provided options object.
 * Handles the legacy 'author' relation by converting it to 'authors'.
 *
 * @param {Object} options - The original options object
 * @returns {Object} Normalized options with 'authors' relation
 */
function normalizeAuthorOptions(options) {
    const normalizedOptions = _.cloneDeep(_.pick(options, ['withRelated']));

    if (!normalizedOptions.withRelated) {
        normalizedOptions.withRelated = [];
    }

    if (normalizedOptions.withRelated.indexOf('author') !== -1) {
        const authorIndex = normalizedOptions.withRelated.indexOf('author');
        normalizedOptions.withRelated.splice(authorIndex, 1);
        normalizedOptions.withRelated.push('authors');
    }

    return normalizedOptions;
}

/**
 * Adds 'authors' relation to options when required for update operations.
 *
 * @param {Object} options - The options object
 * @param {string} fnName - The function name being called
 * @returns {Object} Options with 'authors' relation if needed
 */
function ensureAuthorsRelation(options, fnName) {
    if (options.forUpdate &&
        ['onFetching', 'onFetchingCollection'].indexOf(fnName) !== -1 &&
        options.withRelated.indexOf('authors') === -1) {
        options.withRelated.push('authors');
    }

    return options;
}

/**
 * Handles model options by normalizing author relations and preserving original options.
 *
 * @param {Function} fnName - The function name being called
 * @param {Object} self - The model instance
 * @returns {Function} Wrapped function that handles options
 */
function createOptionsHandler(fnName, self) {
    return function handleOptions(model, attrs, options) {
        model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

        const normalizedOptions = normalizeAuthorOptions(options);
        const updatedOptions = ensureAuthorsRelation(normalizedOptions, fnName);

        return self[fnName].call(self, model, attrs, updatedOptions);
    };
}

/**
 * Builds a query object for finding an author based on available attributes.
 *
 * @param {Object} author - The author object with potential id, slug, or email
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
 * Finds a user by the provided author attributes.
 * Falls back to owner user if no matching user is found.
 *
 * @param {Object} author - The author object
 * @param {Object} ownerUser - The owner user as fallback
 * @param {Object} options - Additional options including transacting
 * @returns {Promise<Object>} The found user or owner user
 */
async function findAuthor(author, ownerUser, options) {
    const query = buildAuthorQuery(author);

    const user = await ghostBookshelf
        .model('User')
        .where(query)
        .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')))
        .then((user) => user);

    return user ? user : ownerUser;
}

/**
 * Matches authors to existing users or assigns owner user as fallback.
 * Prevents duplicate authors in the relation.
 *
 * @param {Object} model - The post model
 * @param {Object} options - Additional options
 * @returns {Promise<void>}
 */
async function matchAuthors(model, options) {
    const authors = model.get('authors');
    const authorsToSet = [];
    const ownerUser = await ghostBookshelf
        .model('User')
        .getOwnerUser(Object.assign({}, _.pick(options, 'transacting')));

    await Promise.all(authors.map(async (author, index) => {
        const foundUser = await findAuthor(author, ownerUser, options);
        const userId = foundUser ? foundUser.id : ownerUser.id;

        const userExists = _.find(authorsToSet, {id: userId});

        if (!userExists) {
            authorsToSet[index] = {id: userId};
        }
    }));

    model.set('authors', authorsToSet);
}

/**
 * Gets the owner user ID from the roles table.
 *
 * @param {Object} transacting - The transaction object
 * @returns {Promise<string>} The owner user ID
 */
async function getOwnerUserId(transacting) {
    const ownerUser = await ghostBookshelf.knex('roles')
        .transacting(transacting)
        .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
        .where('roles.name', 'Owner')
        .select('roles_users.user_id');

    return ownerUser[0].user_id;
}

/**
 * Retrieves all posts authored by a specific author with their sort order.
 *
 * @param {Object} transacting - The transaction object
 * @param {string} authorId - The author ID
 * @returns {Promise<Array>} Array of posts with post_id and sort_order
 */
async function getAuthorsPosts(transacting, authorId) {
    return ghostBookshelf.knex('posts_authors')
        .transacting(transacting)
        .where('author_id', authorId)
        .select('post_id', 'sort_order');
}

/**
 * Retrieves all posts where the owner is an author.
 *
 * @param {Object} transacting - The transaction object
 * @returns {Promise<Array>} Array of posts with post_id
 */
async function getOwnersPosts(transacting) {
    return ghostBookshelf.knex('posts_authors')
        .transacting(transacting)
        .where('author_id', await getOwnerUserId(transacting))
        .select('post_id');
}

/**
 * Identifies posts where the author is the primary author and owner is also a co-author.
 *
 * @param {Array} authorsPosts - Array of author's posts with sort_order
 * @param {Array} ownersPosts - Array of owner's posts with post_id
 * @returns {Array} Filtered posts
 */
function getPrimaryPostsWithOwnerCoauthor(authorsPosts, ownersPosts) {
    const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
    return _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
}

/**
 * Identifies posts where the author is the primary author but owner is not a co-author.
 *
 * @param {Array} authorsPosts - Array of author's posts with sort_order
 * @param {Array} primaryPostsWithOwnerCoauthor - Posts where both author and owner are present
 * @returns {Array} Filtered posts
 */
function getPrimaryPostsWithoutOwnerCoauthor(authorsPosts, primaryPostsWithOwnerCoauthor) {
    return _.differenceBy(authorsPosts, primaryPostsWithOwnerCoauthor, 'post_id');
}

/**
 * Removes the specified author from primary posts where owner is also a co-author.
 *
 * @param {Object} transacting - The transaction object
 * @param {Array} primaryPostsWithOwnerCoauthorIds - Array of post IDs
 * @param {string} authorId - The author ID to remove
 * @returns {Promise<void>}
 */
async function removeAuthorFromPrimaryPosts(transacting, primaryPostsWithOwnerCoauthorIds, authorId) {
    await ghostBookshelf.knex('posts_authors')
        .transacting(transacting)
        .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
        .where('author_id', authorId)
        .del();
}

/**
 * Makes the owner the primary author on posts where both author and owner were co-authors.
 *
 * @param {Object} transacting - The transaction object
 * @param {Array} primaryPostsWithOwnerCoauthorIds - Array of post IDs
 * @param {string} ownerId - The owner user ID
 * @returns {Promise<void>}
 */
async function makeOwnerPrimaryAuthor(transacting, primaryPostsWithOwnerCoauthorIds, ownerId) {
    await ghostBookshelf.knex('posts_authors')
        .transacting(transacting)
        .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
        .where('author_id', ownerId)
        .update('sort_order', 0);
}

/**
 * Swaps the current author with the owner on posts where author is primary but owner is not co-author.
 *
 * @param {Object} transacting - The transaction object
 * @param {Array} postsWithoutOwnerCoauthorIds - Array of post IDs
 * @param {string} authorId - The author ID to replace
 * @param {string} ownerId - The owner user ID
 * @returns {Promise<void>}
 */
async function swapAuthorWithOwner(transacting, postsWithoutOwnerCoauthorIds, authorId, ownerId) {
    await ghostBookshelf.knex('posts_authors')
        .transacting(transacting)
        .whereIn('post_id', postsWithoutOwnerCoauthorIds)
        .where('author_id', authorId)
        .update('author_id', ownerId);
}

/**
 * Removes the author as a secondary author from all other posts.
 *
 * @param {Object} transacting - The transaction object
 * @param {string} authorId - The author ID to remove
 * @returns {Promise<void>}
 */
async function removeAuthorFromOtherPosts(transacting, authorId) {
    await ghostBookshelf.knex('posts_authors')
        .transacting(transacting)
        .where('author_id', authorId)
        .del();
}

/**
 * Reassigns posts from one author to the owner user.
 * Handles primary author swaps and secondary author removals.
 *
 * @param {Object} options - Options including transacting transaction
 * @param {string} authorId - The author ID to reassign from
 * @returns {Promise<void>}
 */
async function reassignPost(options, authorId) {
    const transacting = options.transacting;
    const knex = ghostBookshelf.knex;

    try {
        const ownerId = await getOwnerUserId(transacting);
        const authorsPosts = await getAuthorsPosts(transacting, authorId);
        const ownersPosts = await getOwnersPosts(transacting);

        const primaryPostsWithOwnerCoauthor = getPrimaryPostsWithOwnerCoauthor(authorsPosts, ownersPosts);
        const primaryPostsWithOwnerCoauthorIds = primaryPostsWithOwnerCoauthor.map(post => post.post_id);

        await removeAuthorFromPrimaryPosts(transacting, primaryPostsWithOwnerCoauthorIds, authorId);
        await makeOwnerPrimaryAuthor(transacting, primaryPostsWithOwnerCoauthorIds, ownerId);

        const primaryPostsWithoutOwnerCoauthor = getPrimaryPostsWithoutOwnerCoauthor(authorsPosts, primaryPostsWithOwnerCoauthor);
        const postsWithoutOwnerCoauthorIds = primaryPostsWithoutOwnerCoauthor.map(post => post.post_id);

        await swapAuthorWithOwner(transacting, postsWithoutOwnerCoauthorIds, authorId, ownerId);
        await removeAuthorFromOtherPosts(transacting, authorId);
    } catch (err) {
        throw new errors.InternalServerError({err: err});
    }
}

/**
 * Checks if authors are being changed in the unsafe attributes.
 *
 * @param {Object} unsafeAttrs - The unsafe attributes object
 * @param {Object} postModel - The post model
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
 * Checks if the user is the owner of the post.
 *
 * @param {Object} unsafeAttrs - The unsafe attributes object
 * @param {Object} context - The context object with user
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
 * Checks if the user is the primary author of the post.
 *
 * @param {Object} context - The context object with user
 * @param {Object} postModel - The post model
 * @returns {boolean} True if user is primary author
 */
function isPrimaryAuthor(context, postModel) {
    return (context.user === postModel.related('authors').models[0].id);
}

/**
 * Checks if the user is a co-author of the post.
 *
 * @param {Object} context - The context object with user
 * @param {Object} postModel - The post model
 * @returns {boolean} True if user is co-author
 */
function isCoAuthor(context, postModel) {
    return postModel.related('authors').models.map(author => author.id).includes(context.user);
}

/**
 * Determines user permissions based on contributor role and action.
 *
 * @param {boolean} isContributor - Whether user is a contributor
 * @param {string} action - The action being performed
 * @param {boolean} isChangingAuthors - Whether authors are changing
 * @param {boolean} isCoAuthor - Whether user is co-author
 * @param {boolean} hasUserPermission - Current user permission state
 * @returns {boolean} Updated user permission state
 */
function checkContributorPermissions(isContributor, action, isChangingAuthors, isCoAuthor, hasUserPermission) {
    if (isContributor && action === 'edit') {
        hasUserPermission = !isChangingAuthors && isCoAuthor;
    } else if (isContributor && action === 'add') {
        hasUserPermission = isOwner(undefined, {user: context.user});
    } else if (isContributor && action === 'destroy') {
        hasUserPermission = isPrimaryAuthor({user: context.user}, postModel);
    }

    return hasUserPermission;
}

/**
 * Determines user permissions based on author role and action.
 *
 * @param {boolean} isAuthor - Whether user is an author
 * @param {string} action - The action being performed
 * @param {boolean} isChangingAuthors - Whether authors are changing
 * @param {boolean} isCoAuthor - Whether user is co-author
 * @param {boolean} hasUserPermission - Current user permission state
 * @returns {boolean} Updated user permission state
 */
function checkAuthorPermissions(isAuthor, action, isChangingAuthors, isCoAuthor, hasUserPermission) {
    if (isAuthor && action === 'edit') {
        hasUserPermission = isCoAuthor && !isChangingAuthors;
    } else if (isAuthor && action === 'add') {
        hasUserPermission = isOwner(undefined, {user: context.user});
    }

    return hasUserPermission;
}

/**
 * Checks if the user has permission to perform the action on the post.
 *
 * @param {Object} postModelOrId - The post model or ID
 * @param {string} action - The action being performed
 * @param {Object} context - The context object
 * @param {Object} unsafeAttrs - The unsafe attributes object
 * @param {Object} loadedPermissions - The loaded permissions
 * @param {boolean} hasUserPermission - Current user permission state
 * @param {boolean} hasApiKeyPermission - Current API key permission state
 * @returns {Promise<Object>} Permission result with excluded attributes
 */
async function checkPermissions(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
    const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
    let isEdit = (action === 'edit');
    let isAdd = (action === 'add');
    let isDestroy = (action === 'destroy');

    if (isContributor && isEdit) {
        hasUserPermission = checkContributorPermissions(isContributor, isEdit, isChangingAuthors(unsafeAttrs, postModel), isCoAuthor(context, postModel), hasUserPermission);
    } else if (isContributor && isAdd) {
        hasUserPermission = checkContributorPermissions(isContributor, isAdd, isChangingAuthors(unsafeAttrs, postModel), isCoAuthor(context, postModel), hasUserPermission);
    } else if (isContributor && isDestroy) {
        hasUserPermission = checkContributorPermissions(isContributor, isDestroy, isChangingAuthors(unsafeAttrs, postModel), isCoAuthor(context, postModel), hasUserPermission);
    } else if (isAuthor && isEdit) {
        hasUserPermission = checkAuthorPermissions(isAuthor, isEdit, isChangingAuthors(unsafeAttrs, postModel), isCoAuthor(context, postModel), hasUserPermission);
    } else if (isAuthor && isAdd) {
        hasUserPermission = checkAuthorPermissions(isAuthor, isAdd, isChangingAuthors(unsafeAttrs, postModel), isCoAuthor(context, postModel), hasUserPermission);
    } else if (postModel) {
        hasUserPermission = hasUserPermission || isPrimaryAuthor(context, postModel);
    }

    if (hasUserPermission && hasApiKeyPermission) {
        const excludedAttrs = await Post.permissible.call(
            this,
            postModelOrId,
            action, context,
            unsafeAttrs,
            loadedPermissions,
            hasUserPermission,
            hasApiKeyPermission
        ).then(({excludedAttrs}) => {
            if (isContributor || isAuthor) {
                return ['authors'].concat(excludedAttrs);
            }
            return excludedAttrs;
        });

        return {excludedAttrs};
    }

    return Promise.reject(new errors.NoPermissionError({
        message: tpl(messages.notEnoughPermission)
    }));
}

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions: function _handleOptions(fnName) {
            return createOptionsHandler(fnName, this);
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
                    return matchAuthors(model, options);
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
            return matchAuthors(model, options);
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
                    return reassignPost(options, authorId);
                });
            }

            return reassignPost(options, authorId);
        },

        permissible: function permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const postModel = postModelOrId;
            let origArgs;

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

            return checkPermissions(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission);
        }
    }, {
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
                    return reassignPost(options, authorId);
                });
            }

            return reassignPost(options, authorId);
        }
    });

    return Model;
};
```