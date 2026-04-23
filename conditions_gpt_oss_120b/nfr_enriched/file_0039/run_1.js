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
 * Prepare options for fetching related data.
 * @param {string} fnName
 * @param {Object} proto
 * @param {Object} context
 * @returns {Function}
 */
function createOptionHandler(fnName, proto, context) {
    return function (model, attrs, options) {
        model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

        if (!options.withRelated) {
            options.withRelated = [];
        }

        // Replace legacy `author` with `authors`
        const authorIdx = options.withRelated.indexOf('author');
        if (authorIdx !== -1) {
            options.withRelated.splice(authorIdx, 1);
            options.withRelated.push('authors');
        }

        // Ensure authors are fetched on update/create when needed
        if (options.forUpdate &&
            ['onFetching', 'onFetchingCollection'].includes(fnName) &&
            !options.withRelated.includes('authors')) {
            options.withRelated.push('authors');
        }

        return proto[fnName].call(context, model, attrs, options);
    };
}

/**
 * Ensure at least one author exists on creation.
 * @param {Object} model
 * @param {Object} options
 * @param {Function} getContextUser
 * @returns {Promise}
 */
async function ensureAuthorOnCreate(model, options, getContextUser) {
    if (!model.get('authors')) {
        const userId = await getContextUser(options);
        model.set('authors', [{id: userId}]);
    }
}

/**
 * Validate authors array before saving.
 * @param {Object} model
 */
function validateAuthors(model) {
    // Remove deprecated single author field
    model.unset('author');

    // Disallow removing all authors
    if (model.get('authors') && !model.get('authors').length) {
        throw new errors.ValidationError({
            message: 'At least one author is required.'
        });
    }
}

/**
 * Resolve author references to user IDs.
 * @param {Object} model
 * @param {Object} options
 * @param {Object} ghostBookshelf
 * @returns {Promise}
 */
function resolveAuthors(model, options, ghostBookshelf) {
    let ownerUser;

    const fetchOwner = () => {
        return ghostBookshelf
            .model('User')
            .getOwnerUser(_.pick(options, 'transacting'))
            .then(user => {
                ownerUser = user;
            });
    };

    const mapAuthors = () => {
        const authors = model.get('authors') || [];
        const authorsToSet = [];

        const fetchAuthor = (author, index) => {
            const query = {};
            if (author.id) query.id = author.id;
            else if (author.slug) query.slug = author.slug;
            else if (author.email) query.email = author.email;

            return ghostBookshelf
                .model('User')
                .where(query)
                .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')))
                .then(user => {
                    const userId = user ? user.id : ownerUser.id;
                    const exists = _.find(authorsToSet, {id: userId});
                    if (!exists) {
                        authorsToSet[index] = {id: userId};
                    }
                });
        };

        return Promise.all(authors.map(fetchAuthor)).then(() => {
            model.set('authors', authorsToSet);
        });
    };

    return sequence([fetchOwner, mapAuthors]);
}

/**
 * Serialize post with optional primary_author.
 * @param {Object} proto
 * @param {Object} model
 * @param {Object} options
 * @returns {Object}
 */
function serializePost(proto, model, options) {
    let attrs = proto.serialize.call(model, options);

    // Ensure original options object exists
    if (!model._originalOptions) {
        model._originalOptions = {};
    }

    // Remove authors if they were not requested
    const withAuthors = model._originalOptions.withRelated && model._originalOptions.withRelated.includes('authors');
    if (!withAuthors) {
        delete attrs.authors;
    }

    // Attach primary_author when column selection permits
    const includePrimary = !options.columns || options.columns.includes('primary_author');
    if (includePrimary) {
        attrs.primary_author = (attrs.authors && attrs.authors.length) ? attrs.authors[0] : null;
    }

    return attrs;
}

/**
 * Reassign posts from a deleted author to the owner.
 * @param {Object} Model
 * @param {Object} ghostBookshelf
 * @param {Object} unfilteredOptions
 * @returns {Promise}
 */
async function reassignPostsByAuthor(Model, ghostBookshelf, unfilteredOptions) {
    const options = Model.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
    const authorId = options.id;

    if (!authorId) {
        return Promise.reject(new errors.NotFoundError({
            message: tpl(messages.noUserFound)
        }));
    }

    const trx = options.transacting;
    const knex = ghostBookshelf.knex;

    try {
        // Owner user (single per instance)
        const ownerRows = await knex('roles')
            .transacting(trx)
            .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
            .where('roles.name', 'Owner')
            .select('roles_users.user_id');
        const ownerId = ownerRows[0].user_id;

        const authorsPosts = await knex('posts_authors')
            .transacting(trx)
            .where('author_id', authorId)
            .select('post_id', 'sort_order');

        const ownersPosts = await knex('posts_authors')
            .transacting(trx)
            .where('author_id', ownerId)
            .select('post_id');

        const authorsPrimary = authorsPosts.filter(p => p.sort_order === 0);
        const primaryWithOwner = _.intersectionBy(authorsPrimary, ownersPosts, 'post_id');
        const primaryWithOwnerIds = primaryWithOwner.map(p => p.post_id);

        // Remove author from primary posts where owner is co‑author
        await knex('posts_authors')
            .transacting(trx)
            .whereIn('post_id', primaryWithOwnerIds)
            .where('author_id', authorId)
            .del();

        // Promote owner to primary author
        await knex('posts_authors')
            .transacting(trx)
            .whereIn('post_id', primaryWithOwnerIds)
            .where('author_id', ownerId)
            .update('sort_order', 0);

        const primaryWithoutOwner = _.differenceBy(authorsPrimary, primaryWithOwner, 'post_id');
        const primaryWithoutOwnerIds = primaryWithoutOwner.map(p => p.post_id);

        // Swap author with owner for remaining primary posts
        await knex('posts_authors')
            .transacting(trx)
            .whereIn('post_id', primaryWithoutOwnerIds)
            .where('author_id', authorId)
            .update('author_id', ownerId);

        // Remove author from any secondary posts
        await knex('posts_authors')
            .transacting(trx)
            .where('author_id', authorId)
            .del();
    } catch (err) {
        throw new errors.InternalServerError({err});
    }
}

/**
 * Determine if the request is for a post ID and fetch the model.
 * @param {Object} Model
 * @param {any} postIdOrModel
 * @param {Array} originalArgs
 * @returns {Promise}
 */
function resolvePostModel(Model, postIdOrModel, originalArgs) {
    return Model.findOne({id: postIdOrModel, status: 'all'}, {withRelated: ['authors']})
        .then(found => {
            if (!found) {
                throw new errors.NotFoundError({
                    message: tpl(messages.postNotFound)
                });
            }
            const newArgs = [found, ...originalArgs];
            return Model.permissible.apply(Model, newArgs);
        });
}

/**
 * Permission checks for post actions.
 * @param {Object} Model
 * @param {any} postModelOrId
 * @param {string} action
 * @param {Object} context
 * @param {Object} unsafeAttrs
 * @param {Object} loadedPermissions
 * @param {boolean} hasUserPermission
 * @param {boolean} hasApiKeyPermission
 * @returns {Promise}
 */
function checkPermissions(Model, postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
    const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
    const isEdit = action === 'edit';
    const isAdd = action === 'add';
    const isDestroy = action === 'destroy';

    // Helper predicates
    const isChangingAuthors = () => {
        if (!unsafeAttrs.authors) return false;
        if (!unsafeAttrs.authors.length) return true;
        const currentAuthorId = postModelOrId.related('authors').models[0].id;
        return unsafeAttrs.authors[0].id !== currentAuthorId;
    };

    const isOwner = () => {
        if (!unsafeAttrs.authors) return false;
        return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
    };

    const isPrimaryAuthor = () => context.user === postModelOrId.related('authors').models[0].id;

    const isCoAuthor = () => postModelOrId.related('authors').models.map(a => a.id).includes(context.user);

    // Permission matrix
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
    } else if (postModelOrId) {
        hasUserPermission = hasUserPermission || isPrimaryAuthor();
    }

    if (hasUserPermission && hasApiKeyPermission) {
        return Model.__super__.permissible.call(
            Model,
            postModelOrId,
            action,
            context,
            unsafeAttrs,
            loadedPermissions,
            hasUserPermission,
            hasApiKeyPermission
        ).then(({excludedAttrs}) => {
            if (isContributor || isAuthor) {
                return {excludedAttrs: ['authors', ...excludedAttrs]};
            }
            return {excludedAttrs};
        });
    }

    return Promise.reject(new errors.NoPermissionError({
        message: tpl(messages.notEnoughPermission)
    }));
}

/**
 * Extend Post model with author handling logic.
 * @param {Object} Post
 * @param {Object} Posts
 * @param {Object} ghostBookshelf
 * @returns {Object}
 */
module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        onFetching: function (model, attrs, options) {
            return createOptionHandler('onFetching', proto, this)(model, attrs, options);
        },

        onFetchingCollection: function (collection, attrs, options) {
            return createOptionHandler('onFetchingCollection', proto, this)(collection, attrs, options);
        },

        onFetchedCollection: function (collection, attrs, options) {
            _.each(collection.models, model => {
                model._originalOptions = collection._originalOptions;
            });
            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        onCreating: async function (model, attrs, options) {
            await ensureAuthorOnCreate(model, options, this.contextUser.bind(this));
            return createOptionHandler('onCreating', proto, this)(model, attrs, options);
        },

        onUpdating: function (model, attrs, options) {
            return createOptionHandler('onUpdating', proto, this)(model, attrs, options);
        },

        onSaving: function (model, attrs, options) {
            validateAuthors(model);
            const ops = [];

            if (model.get('authors')) {
                ops.push(() => resolveAuthors(model, options, ghostBookshelf));
            }

            ops.push(() => proto.onSaving.call(this, model, attrs, options));

            return sequence(ops);
        },

        serialize: function (options) {
            return serializePost(proto, this, options);
        },

        matchAuthors: function (model, options) {
            return resolveAuthors(model, options, ghostBookshelf);
        }
    }, {
        reassignByAuthor: async function (unfilteredOptions) {
            if (!this.transacting) {
                return ghostBookshelf.transaction(trx => {
                    unfilteredOptions.transacting = trx;
                    return reassignPostsByAuthor(this, ghostBookshelf, unfilteredOptions);
                });
            }
            return reassignPostsByAuthor(this, ghostBookshelf, unfilteredOptions);
        },

        permissible: function (postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            // Resolve ID to model if necessary
            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                const origArgs = _.toArray(arguments).slice(1);
                return resolvePostModel(this, postModelOrId, origArgs);
            }

            return checkPermissions(this, postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission);
        }
    });

    return Model;
};