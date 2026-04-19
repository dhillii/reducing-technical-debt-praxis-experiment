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
 * Process and normalize options for model operations.
 * Handles withRelated normalization and author relation mapping.
 *
 * @param {string} fnName - The function name being called
 * @param {Object} self - The model instance
 * @param {Object} model - The model being operated on
 * @param {Object} attrs - Model attributes
 * @param {Object} options - Operation options
 * @returns {Function} Wrapped function that processes options
 */
function _handleOptions(fnName, self, model, attrs, options) {
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

    return self[fnName].call(self, model, attrs, options);
}

/**
 * Process authors matching logic for a model.
 * Finds or creates authors based on id, slug, or email.
 *
 * @param {Object} ghostBookshelf - Bookshelf instance
 * @param {Object} model - The model with authors
 * @param {Object} options - Operation options
 * @returns {Promise} Promise that resolves when authors are matched
 */
function _matchAuthors(ghostBookshelf, model, options) {
    const ops = [];

    ops.push(() => {
        return ghostBookshelf
            .model('User')
            .getOwnerUser(Object.assign({}, _.pick(options, 'transacting')))
            .then((_ownerUser) => {
                return _ownerUser;
            });
    });

    ops.push(() => {
        const authors = model.get('authors');
        const authorsToSet = [];

        return Promise.all(authors.map((author, index) => {
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
                .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')))
                .then((user) => {
                    let userId = user ? user.id : options.ownerUser.id;

                    const userExists = _.find(authorsToSet, {id: userId});

                    if (!userExists) {
                        authorsToSet[index] = {};
                        authorsToSet[index].id = userId;
                    }
                });
            });
        }).then(() => {
            model.set('authors', authorsToSet);
        });
    });

    return sequence(ops);
}

/**
 * Reassign posts from one author to the owner.
 * Handles database transactions for author reassignment.
 *
 * @param {Object} knex - Knex instance
 * @param {Object} trx - Transaction instance
 * @param {string} authorId - ID of author to reassign from
 * @param {Object} ghostBookshelf - Bookshelf instance
 * @returns {Promise} Promise that resolves when reassignment is complete
 */
function _reassignByAuthor(knex, trx, authorId, ghostBookshelf) {
    // Get owner user ID
    return knex('roles')
        .transacting(trx)
        .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
        .where('roles.name', 'Owner')
        .select('roles_users.user_id')
        .then((ownerUser) => {
            const ownerId = ownerUser[0].user_id;

            // Get authors' posts
            return knex('posts_authors')
                .transacting(trx)
                .where('author_id', authorId)
                .select('post_id', 'sort_order');
        })
        .then((authorsPosts) => {
            // Get owner's posts
            return knex('posts_authors')
                .transacting(trx)
                .where('author_id', ownerId)
                .select('post_id');
        })
        .then((ownersPosts) => {
            // Find posts where owner is co-author with author
            const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
            const primaryPostsWithOwnerCoauthor = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
            const primaryPostsWithOwnerCoauthorIds = primaryPostsWithOwnerCoauthor.map(post => post.post_id);

            // Remove author from posts where owner is primary
            return knex('posts_authors')
                .transacting(trx)
                .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
                .where('author_id', authorId)
                .del();
        })
        .then(() => {
            // Make owner primary author
            return knex('posts_authors')
                .transacting(trx)
                .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
                .where('author_id', ownerId)
                .update('sort_order', 0);
        })
        .then(() => {
            // Swap author with owner in remaining posts
            const primaryPostsWithoutOwnerCoauthor = _.differenceBy(authorsPrimaryPosts, primaryPostsWithOwnerCoauthor, 'post_id');
            const postsWithoutOwnerCoauthorIds = primaryPostsWithoutOwnerCoauthor.map(post => post.post_id);

            return knex('posts_authors')
                .transacting(trx)
                .whereIn('post_id', postsWithoutOwnerCoauthorIds)
                .where('author_id', authorId)
                .update('author_id', ownerId);
        })
        .then(() => {
            // Remove author as secondary author from other posts
            return knex('posts_authors')
                .transacting(trx)
                .where('author_id', authorId)
                .del();
        });
}

/**
 * Check if authors are being changed in the update.
 *
 * @param {Object} unsafeAttrs - Unsafe attributes
 * @param {Object} postModel - Post model
 * @returns {boolean} True if authors are changing
 */
function _isChangingAuthors(unsafeAttrs, postModel) {
    if (!unsafeAttrs.authors) {
        return false;
    }

    if (!unsafeAttrs.authors.length) {
        return true;
    }

    return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
}

/**
 * Check if the user is the owner of the post.
 *
 * @param {Object} unsafeAttrs - Unsafe attributes
 * @param {Object} context - Request context
 * @returns {boolean} True if user is owner
 */
function _isOwner(unsafeAttrs, context) {
    if (!unsafeAttrs.authors) {
        return false;
    }

    if (unsafeAttrs.authors) {
        return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
    }

    return false;
}

/**
 * Check if the user is the primary author.
 *
 * @param {Object} context - Request context
 * @param {Object} postModel - Post model
 * @returns {boolean} True if user is primary author
 */
function _isPrimaryAuthor(context, postModel) {
    return context.user === postModel.related('authors').models[0].id;
}

/**
 * Check if the user is a co-author.
 *
 * @param {Object} context - Request context
 * @param {Object} postModel - Post model
 * @returns {boolean} True if user is co-author
 */
function _isCoAuthor(context, postModel) {
    return postModel.related('authors').models.map(author => author.id).includes(context.user);
}

/**
 * Check if user has permission to perform the action.
 *
 * @param {string} action - The action being performed
 * @param {string} role - User role (contributor or author)
 * @param {boolean} isChangingAuthors - Whether authors are changing
 * @param {boolean} isOwner - Whether user is owner
 * @param {boolean} isPrimaryAuthor - Whether user is primary author
 * @param {boolean} isCoAuthor - Whether user is co-author
 * @returns {boolean} True if user has permission
 */
function _checkUserPermission(action, role, isChangingAuthors, isOwner, isPrimaryAuthor, isCoAuthor) {
    if (role === 'contributor') {
        if (action === 'edit') {
            return !isChangingAuthors && isCoAuthor;
        }
        if (action === 'add') {
            return isOwner;
        }
        if (action === 'destroy') {
            return isPrimaryAuthor;
        }
    }

    if (role === 'author') {
        if (action === 'edit') {
            return isCoAuthor && !isChangingAuthors;
        }
        if (action === 'add') {
            return isOwner;
        }
    }

    return false;
}

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions: function _handleOptions(fnName) {
            const self = this;

            return function innerHandleOptions(model, attrs, options) {
                return _handleOptions(fnName, self, model, attrs, options);
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
            return _matchAuthors(ghostBookshelf, model, options);
        },

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
                    await _reassignByAuthor(knex, trx, authorId, ghostBookshelf);
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

            const isChangingAuthors = _isChangingAuthors(unsafeAttrs, postModel);
            const isOwner = _isOwner(unsafeAttrs, context);
            const isPrimaryAuthor = _isPrimaryAuthor(context, postModel);
            const isCoAuthor = _isCoAuthor(context, postModel);

            const hasPermission = _checkUserPermission(action, isContributor || isAuthor, isChangingAuthors, isOwner, isPrimaryAuthor, isCoAuthor);

            if (hasPermission && hasApiKeyPermission) {
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
    }, {
        reassignByAuthor: Model.reassignByAuthor
    });

    return Model;
};
```