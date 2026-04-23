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
 * Normalize options to ensure 'authors' is used instead of 'author' and handle special cases.
 * @param {string} fnName - The name of the function being called.
 * @param {Function} originalFn - The original function to call.
 * @param {Object} self - The model instance.
 * @param {Function} handleOptions - The function to wrap options handling.
 * @returns {Function} Wrapped function that handles options.
 */
function createWrappedHandler(fnName, originalFn, self, handleOptions) {
    return function wrappedHandler(model, attrs, options) {
        return handleOptions(fnName)(model, attrs, options);
    };
}

/**
 * Handle options for model operations, ensuring 'authors' relation is fetched when needed.
 * @param {string} fnName - The name of the function being called.
 * @param {Object} self - The model instance.
 * @returns {Function} Function that handles options.
 */
function handleOptions(fnName, self) {
    return function handleOptionsWrapper(model, attrs, options) {
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
    };
}

/**
 * Check if a user exists based on id, slug, or email.
 * @param {Object} author - The author object to match.
 * @param {Object} ghostBookshelf - The Ghost Bookshelf instance.
 * @param {Object} options - The options object.
 * @returns {Promise<Object>} The found user or null.
 */
function findUserByAuthor(author, ghostBookshelf, options) {
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
        .then((user) => user);
}

/**
 * Match authors to users, falling back to owner user if not found.
 * @param {Object} model - The post model.
 * @param {Object} ghostBookshelf - The Ghost Bookshelf instance.
 * @param {Object} options - The options object.
 * @returns {Promise<void>}
 */
function matchAuthors(model, ghostBookshelf, options) {
    const authors = model.get('authors');
    const authorsToSet = [];

    return Promise.all(authors.map((author, index) => {
        return findUserByAuthor(author, ghostBookshelf, options)
            .then((user) => {
                let userId = user ? user.id : options.contextUser(options);
                const userExists = _.find(authorsToSet, {id: userId});

                if (!userExists) {
                    authorsToSet[index] = {};
                    authorsToSet[index].id = userId;
                }
            });
    })).then(() => {
        model.set('authors', authorsToSet);
    });
}

/**
 * Reassign posts from one author to the owner user.
 * @param {Object} options - The options object containing id and transacting.
 * @param {Object} ghostBookshelf - The Ghost Bookshelf instance.
 * @returns {Promise<void>}
 */
function reassignPost(options, ghostBookshelf) {
    const authorId = options.id;
    const trx = options.transacting;
    const knex = ghostBookshelf.knex;

    return knex('roles')
        .transacting(trx)
        .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
        .where('roles.name', 'Owner')
        .select('roles_users.user_id')
        .then((ownerUser) => {
            const ownerId = ownerUser[0].user_id;

            return Promise.all([
                knex('posts_authors')
                    .transacting(trx)
                    .where('author_id', authorId)
                    .select('post_id', 'sort_order'),
                knex('posts_authors')
                    .transacting(trx)
                    .where('author_id', ownerId)
                    .select('post_id')
            ]);
        })
        .then(([authorsPosts, ownersPosts]) => {
            const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
            const primaryPostsWithOwnerCoauthor = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
            const primaryPostsWithOwnerCoauthorIds = primaryPostsWithOwnerCoauthor.map(post => post.post_id);

            return knex('posts_authors')
                .transacting(trx)
                .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
                .where('author_id', authorId)
                .del()
                .then(() => {
                    return knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
                        .where('author_id', ownerId)
                        .update('sort_order', 0);
                })
                .then(() => {
                    const primaryPostsWithoutOwnerCoauthor = _.differenceBy(authorsPrimaryPosts, primaryPostsWithOwnerCoauthor, 'post_id');
                    const postsWithoutOwnerCoauthorIds = primaryPostsWithoutOwnerCoauthor.map(post => post.post_id);

                    return knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', postsWithoutOwnerCoauthorIds)
                        .where('author_id', authorId)
                        .update('author_id', ownerId);
                })
                .then(() => {
                    return knex('posts_authors')
                        .transacting(trx)
                        .where('author_id', authorId)
                        .del();
                });
        });
}

/**
 * Check if authors are being changed in the unsafe attributes.
 * @param {Object} unsafeAttrs - The unsafe attributes.
 * @param {Object} postModel - The post model.
 * @returns {boolean} True if authors are being changed.
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
 * Check if the user is the owner of the post.
 * @param {Object} unsafeAttrs - The unsafe attributes.
 * @param {Object} context - The context object.
 * @returns {boolean} True if the user is the owner.
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
 * Check if the user is the primary author of the post.
 * @param {Object} context - The context object.
 * @param {Object} postModel - The post model.
 * @returns {boolean} True if the user is the primary author.
 */
function isPrimaryAuthor(context, postModel) {
    return (context.user === postModel.related('authors').models[0].id);
}

/**
 * Check if the user is a co-author of the post.
 * @param {Object} context - The context object.
 * @param {Object} postModel - The post model.
 * @returns {boolean} True if the user is a co-author.
 */
function isCoAuthor(context, postModel) {
    return postModel.related('authors').models.map(author => author.id).includes(context.user);
}

/**
 * Check permissions for a post model or ID.
 * @param {Object|number|string} postModelOrId - The post model or ID.
 * @param {string} action - The action being performed.
 * @param {Object} context - The context object.
 * @param {Object} unsafeAttrs - The unsafe attributes.
 * @param {Object} loadedPermissions - The loaded permissions.
 * @param {boolean} hasUserPermission - The user permission status.
 * @param {boolean} hasApiKeyPermission - The API key permission status.
 * @param {Object} ghostBookshelf - The Ghost Bookshelf instance.
 * @param {Object} Post - The Post model class.
 * @returns {Promise<Object>} The permission result.
 */
function checkPermissions(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission, ghostBookshelf, Post) {
    const self = this;
    const postModel = postModelOrId;
    let origArgs;
    const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
    let isEdit;
    let isAdd;
    let isDestroy;

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

    isEdit = (action === 'edit');
    isAdd = (action === 'add');
    isDestroy = (action === 'destroy');

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
        hasUserPermission = hasUserPermission || isPrimaryAuthor(context, postModel);
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

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        onFetching: function onFetching(model, attrs, options) {
            return createWrappedHandler('onFetching', proto.onFetching, this, handleOptions);
        },

        onFetchingCollection: function onFetchingCollection(collection, attrs, options) {
            return createWrappedHandler('onFetchingCollection', proto.onFetchingCollection, this, handleOptions);
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

            return createWrappedHandler('onCreating', proto.onCreating, this, handleOptions);
        },

        onUpdating: function onUpdating(model, attrs, options) {
            return createWrappedHandler('onUpdating', proto.onUpdating, this, handleOptions);
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
                    return matchAuthors(model, ghostBookshelf, options);
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
            if (!this._originalOptions || !this._originalOptions.withRelated || this._originalOptions.withRelated.indexOf('authors') === -1) {
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
         * Match authors to users based on id, slug, or email.
         * @param {Object} model - The post model.
         * @param {Object} options - The options object.
         * @returns {Promise<void>}
         */
        matchAuthors: function matchAuthors(model, options) {
            return matchAuthors(model, ghostBookshelf, options);
        },

        /**
         * Reassign posts from one author to the owner user.
         * @param {Object} unfilteredOptions - The options object containing id and transacting.
         * @returns {Promise<void>}
         */
        reassignByAuthor: async function reassignByAuthor(unfilteredOptions) {
            let options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
            let authorId = options.id;

            if (!authorId) {
                return Promise.reject(new errors.NotFoundError({
                    message: tpl(messages.noUserFound)
                }));
            }

            const reassignPostTask = async () => {
                let trx = options.transacting;
                let knex = ghostBookshelf.knex;

                try {
                    return reassignPost(options, ghostBookshelf);
                } catch (err) {
                    throw new errors.InternalServerError({err: err});
                }
            };

            if (!options.transacting) {
                return ghostBookshelf.transaction((transacting) => {
                    options.transacting = transacting;
                    return reassignPostTask();
                });
            }

            return reassignPostTask();
        },

        permissible: function permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            return checkPermissions(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission, ghostBookshelf, Post);
        }
    });

    return Model;
};