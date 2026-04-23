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
 * @param {Function} fnName - The name of the Bookshelf method being called.
 * @param {Object} self - The model instance.
 * @returns {Function} A wrapped handler function.
 */
function createOptionsHandler(fnName, self) {
    return function handleOptions(model, attrs, options) {
        const originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));
        options.withRelated = options.withRelated || [];

        if (options.withRelated.indexOf('author') !== -1) {
            const index = options.withRelated.indexOf('author');
            options.withRelated.splice(index, 1);
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
 * Fetches the context user and sets them as the default author if none exists.
 * @param {Object} model - The Post model instance.
 * @param {Object} options - The operation options.
 * @returns {Promise}
 */
async function ensureDefaultAuthor(model, options) {
    if (!model.get('authors')) {
        model.set('authors', [{
            id: await this.contextUser(options)
        }]);
    }
}

/**
 * Validates that at least one author is present.
 * @param {Object} model - The Post model instance.
 * @throws {errors.ValidationError}
 */
function validateAuthorPresence(model) {
    if (model.get('authors') && !model.get('authors').length) {
        throw new errors.ValidationError({
            message: 'At least one author is required.'
        });
    }
}

/**
 * Matches authors to users based on id, slug, or email, falling back to the owner user.
 * @param {Object} model - The Post model instance.
 * @param {Object} options - The operation options.
 * @returns {Promise}
 */
function matchAuthors(model, options) {
    const ops = [];

    ops.push(() => {
        return ghostBookshelf
            .model('User')
            .getOwnerUser(Object.assign({}, _.pick(options, 'transacting')))
            .then((ownerUser) => {
                model._ownerUser = ownerUser;
            });
    });

    ops.push(() => {
        const authors = model.get('authors');
        const authorsToSet = [];
        const existingIds = new Set();

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
                    const userId = user ? user.id : model._ownerUser.id;
                    if (!existingIds.has(userId)) {
                        authorsToSet[index] = {id: userId};
                        existingIds.add(userId);
                    }
                });
        })).then(() => {
            model.set('authors', authorsToSet);
        });
    });

    return sequence(ops);
}

/**
 * Handles the saving of a post, including author validation and matching.
 * @param {Object} model - The Post model instance.
 * @param {Object} attrs - The attributes being saved.
 * @param {Object} options - The operation options.
 * @returns {Promise}
 */
function handlePostSaving(model, attrs, options) {
    const ops = [];

    model.unset('author');

    validateAuthorPresence(model);

    if (model.get('authors')) {
        ops.push(() => matchAuthors(model, options));
    }

    ops.push(() => {
        return proto.onSaving.call(this, model, attrs, options);
    });

    return sequence(ops);
}

/**
 * Serializes the post model, handling author relations and primary author computation.
 * @param {Object} options - The serialization options.
 * @returns {Object} The serialized attributes.
 */
function serializePost(options) {
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
}

/**
 * Reassigns posts from a specific author to the owner user.
 * @param {Object} unfilteredOptions - The options containing id and context.
 * @returns {Promise}
 */
async function reassignByAuthor(unfilteredOptions) {
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
            throw new errors.InternalServerError({err: err});
        }
    })();

    if (!options.transacting) {
        return ghostBookshelf.transaction((transacting) => {
            options.transacting = transacting;
            return reassignPost();
        });
    }

    return reassignPost();
}

/**
 * Checks if the user has permission to perform the specified action on the post.
 * @param {Object|number|string} postModelOrId - The post model or its ID.
 * @param {string} action - The action to check ('edit', 'add', 'destroy').
 * @param {Object} context - The context object containing user info.
 * @param {Object} unsafeAttrs - The attributes being changed.
 * @param {Object} loadedPermissions - The loaded permissions.
 * @param {boolean} hasUserPermission - Current user permission status.
 * @param {boolean} hasApiKeyPermission - API key permission status.
 * @returns {Promise<Object>}
 */
function checkPermissions(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
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

    function isChangingAuthors() {
        if (!unsafeAttrs.authors) {
            return false;
        }

        if (!unsafeAttrs.authors.length) {
            return true;
        }

        return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
    }

    function isOwner() {
        let isCorrectOwner = true;

        if (!unsafeAttrs.authors) {
            return false;
        }

        if (unsafeAttrs.authors) {
            isCorrectOwner = isCorrectOwner && unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
        }

        return isCorrectOwner;
    }

    function isPrimaryAuthor() {
        return (context.user === postModel.related('authors').models[0].id);
    }

    function isCoAuthor() {
        return postModel.related('authors').models.map(author => author.id).includes(context.user);
    }

    if (isContributor && isEdit) {
        hasUserPermission = !isChangingAuthors() && isCoAuthor();
    } else if (isContributor && isAdd) {
        hasUserPermission = isOwner();
    } else if (isContributor && isDestroy) {
        hasUserPermission = isPrimaryAuthor();
    } else if (isAuthor && isEdit) {
        hasUserPermission = isCoAuthor() && !isChangingAuthors();
    } else if (isAuthor && isAdd) {
        hasUserPermission = isOwner();
    } else if (postModel) {
        hasUserPermission = hasUserPermission || isPrimaryAuthor();
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
            await ensureDefaultAuthor(model, options);
            return this._handleOptions('onCreating')(model, attrs, options);
        },

        onUpdating: function onUpdating(model, attrs, options) {
            return this._handleOptions('onUpdating')(model, attrs, options);
        },

        onSaving: function (model, attrs, options) {
            return handlePostSaving(model, attrs, options);
        },

        serialize: function serialize(options) {
            return serializePost(options);
        },

        matchAuthors: function matchAuthors(model, options) {
            return matchAuthors(model, options);
        },

        reassignByAuthor: async function reassignByAuthor(unfilteredOptions) {
            return reassignByAuthor.call(this, unfilteredOptions);
        },

        permissible: function permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            return checkPermissions.call(this, postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission);
        }
    });

    return Model;
};