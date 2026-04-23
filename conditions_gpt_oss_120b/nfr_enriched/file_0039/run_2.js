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
 * Adjust request options to ensure authors are fetched when needed.
 * @param {Object} model - The model being processed.
 * @param {Object} attrs - Attributes passed to the hook.
 * @param {Object} options - Query options.
 * @param {string} fnName - Name of the original hook.
 * @param {Object} proto - Original prototype methods.
 * @returns {Promise}
 */
function handleOptions(model, attrs, options, fnName, proto) {
    const originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));
    model._originalOptions = originalOptions;

    if (!options.withRelated) {
        options.withRelated = [];
    }

    replaceAuthorWithAuthors(options);
    ensureAuthorsForUpdate(options, fnName);

    return proto[fnName].call(this, model, attrs, options);
}

/**
 * Replace deprecated 'author' relation with 'authors'.
 * @param {Object} options
 */
function replaceAuthorWithAuthors(options) {
    const idx = options.withRelated.indexOf('author');
    if (idx !== -1) {
        options.withRelated.splice(idx, 1);
        options.withRelated.push('authors');
    }
}

/**
 * Ensure 'authors' relation is requested for fetches that need it.
 * @param {Object} options
 * @param {string} fnName
 */
function ensureAuthorsForUpdate(options, fnName) {
    if (options.forUpdate &&
        ['onFetching', 'onFetchingCollection'].includes(fnName) &&
        options.withRelated.indexOf('authors') === -1) {
        options.withRelated.push('authors');
    }
}

/**
 * Copy original options from collection to each model.
 * @param {Object} collection
 */
function propagateOriginalOptions(collection) {
    _.each(collection.models, model => {
        model._originalOptions = collection._originalOptions;
    });
}

/**
 * Ensure at least one author exists on creation.
 * @param {Object} model
 * @param {Object} options
 * @param {Function} contextUserFn
 */
async function ensureAuthorOnCreate(model, options, contextUserFn) {
    if (!model.get('authors')) {
        const userId = await contextUserFn(options);
        model.set('authors', [{id: userId}]);
    }
}

/**
 * Validate authors array before saving.
 * @param {Object} model
 */
function validateAuthors(model) {
    if (model.get('authors') && !model.get('authors').length) {
        throw new errors.ValidationError({
            message: 'At least one author is required.'
        });
    }
}

/**
 * Resolve author identifiers to user IDs and set them on the model.
 * @param {Object} model
 * @param {Object} options
 * @param {Object} ghostBookshelf
 * @returns {Promise}
 */
function matchAuthors(model, options, ghostBookshelf) {
    let ownerUser;
    const ops = [
        () => fetchOwnerUser(options, ghostBookshelf).then(user => {
            ownerUser = user;
        }),
        () => resolveAuthors(model, options, ghostBookshelf, ownerUser)
    ];
    return sequence(ops);
}

/**
 * Fetch the owner user.
 * @param {Object} options
 * @param {Object} ghostBookshelf
 * @returns {Promise}
 */
function fetchOwnerUser(options, ghostBookshelf) {
    return ghostBookshelf
        .model('User')
        .getOwnerUser(Object.assign({}, _.pick(options, 'transacting')));
}

/**
 * Resolve each author entry to a user ID.
 * @param {Object} model
 * @param {Object} options
 * @param {Object} ghostBookshelf
 * @param {Object} ownerUser
 * @returns {Promise}
 */
function resolveAuthors(model, options, ghostBookshelf, ownerUser) {
    const authors = model.get('authors') || [];
    const authorsToSet = [];

    return Promise.all(authors.map((author, index) => {
        const query = buildAuthorQuery(author);
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
    })).then(() => {
        model.set('authors', authorsToSet);
    });
}

/**
 * Build a query object from possible author identifiers.
 * @param {Object} author
 * @returns {Object}
 */
function buildAuthorQuery(author) {
    if (author.id) {
        return {id: author.id};
    }
    if (author.slug) {
        return {slug: author.slug};
    }
    if (author.email) {
        return {email: author.email};
    }
    return {};
}

/**
 * Serialize a post model, optionally removing authors and adding primary_author.
 * @param {Object} model
 * @param {Object} options
 * @param {Function} baseSerialize
 * @returns {Object}
 */
function serializeModel(model, options, baseSerialize) {
    let attrs = baseSerialize.call(model, options);

    if (!model._originalOptions) {
        model._originalOptions = {};
    }

    const withAuthors = model._originalOptions.withRelated && model._originalOptions.withRelated.includes('authors');
    if (!withAuthors) {
        delete attrs.authors;
    }

    if (!options.columns || options.columns.includes('primary_author')) {
        attrs.primary_author = (attrs.authors && attrs.authors.length) ? attrs.authors[0] : null;
    }

    return attrs;
}

/**
 * Reassign posts from a deleted author to the owner.
 * @param {Object} Model - Posts model.
 * @param {Object} ghostBookshelf
 * @param {Object} unfilteredOptions
 * @returns {Promise}
 */
async function reassignByAuthor(Model, ghostBookshelf, unfilteredOptions) {
    const options = Model.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
    const authorId = options.id;

    if (!authorId) {
        return Promise.reject(new errors.NotFoundError({
            message: tpl(messages.noUserFound)
        }));
    }

    const exec = async () => {
        const trx = options.transacting;
        const knex = ghostBookshelf.knex;

        const ownerId = await fetchOwnerId(knex, trx);
        const {authorsPosts, ownersPosts} = await fetchAuthorPosts(knex, trx, authorId, ownerId);
        const primaryPosts = authorsPosts.filter(p => p.sort_order === 0);

        const primaryWithOwner = _.intersectionBy(primaryPosts, ownersPosts, 'post_id');
        const primaryWithOwnerIds = primaryWithOwner.map(p => p.post_id);
        await removeAuthorFromPrimary(knex, trx, primaryWithOwnerIds, authorId);
        await promoteOwnerToPrimary(knex, trx, primaryWithOwnerIds, ownerId);

        const primaryWithoutOwner = _.differenceBy(primaryPosts, primaryWithOwner, 'post_id');
        const primaryWithoutOwnerIds = primaryWithoutOwner.map(p => p.post_id);
        await swapAuthorWithOwner(knex, trx, primaryWithoutOwnerIds, authorId, ownerId);
        await removeSecondaryAuthor(knex, trx, authorId);
    };

    if (!options.transacting) {
        return ghostBookshelf.transaction(transacting => {
            options.transacting = transacting;
            return exec();
        });
    }

    return exec();
}

/**
 * Fetch the owner user ID.
 * @param {Object} knex
 * @param {Object} trx
 * @returns {Promise<number>}
 */
function fetchOwnerId(knex, trx) {
    return knex('roles')
        .transacting(trx)
        .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
        .where('roles.name', 'Owner')
        .select('roles_users.user_id')
        .then(rows => rows[0].user_id);
}

/**
 * Fetch posts authored by the target author and the owner.
 * @param {Object} knex
 * @param {Object} trx
 * @param {number} authorId
 * @param {number} ownerId
 * @returns {Promise<Object>}
 */
function fetchAuthorPosts(knex, trx, authorId, ownerId) {
    const authorsPostsPromise = knex('posts_authors')
        .transacting(trx)
        .where('author_id', authorId)
        .select('post_id', 'sort_order');

    const ownersPostsPromise = knex('posts_authors')
        .transacting(trx)
        .where('author_id', ownerId)
        .select('post_id');

    return Promise.all([authorsPostsPromise, ownersPostsPromise])
        .then(([authorsPosts, ownersPosts]) => ({authorsPosts, ownersPosts}));
}

/**
 * Remove the deleted author from primary author positions.
 */
function removeAuthorFromPrimary(knex, trx, postIds, authorId) {
    return knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', postIds)
        .where('author_id', authorId)
        .del();
}

/**
 * Promote the owner to primary author for given posts.
 */
function promoteOwnerToPrimary(knex, trx, postIds, ownerId) {
    return knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', postIds)
        .where('author_id', ownerId)
        .update('sort_order', 0);
}

/**
 * Swap the deleted author with the owner for non‑primary posts.
 */
function swapAuthorWithOwner(knex, trx, postIds, authorId, ownerId) {
    return knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', postIds)
        .where('author_id', authorId)
        .update('author_id', ownerId);
}

/**
 * Remove the deleted author from any secondary author positions.
 */
function removeSecondaryAuthor(knex, trx, authorId) {
    return knex('posts_authors')
        .transacting(trx)
        .where('author_id', authorId)
        .del();
}

/**
 * Determine permission for a post operation.
 * @param {Object} Model - Posts model.
 * @param {Object} postModelOrId
 * @param {string} action
 * @param {Object} context
 * @param {Object} unsafeAttrs
 * @param {Object} loadedPermissions
 * @param {boolean} hasUserPermission
 * @param {boolean} hasApiKeyPermission
 * @returns {Promise}
 */
function permissible(Model, postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
    const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
    const self = Model;

    if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
        const origArgs = _.toArray(arguments).slice(1);
        return Model.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
            .then(found => {
                if (!found) {
                    throw new errors.NotFoundError({message: tpl(messages.postNotFound)});
                }
                const newArgs = [found].concat(origArgs);
                return permissible.apply(self, newArgs);
            });
    }

    const isEdit = action === 'edit';
    const isAdd = action === 'add';
    const isDestroy = action === 'destroy';
    const postModel = postModelOrId;

    const changingAuthors = isChangingAuthors(unsafeAttrs, postModel);
    const ownerCheck = isOwner(unsafeAttrs, context);
    const primaryAuthor = isPrimaryAuthor(postModel, context);
    const coAuthor = isCoAuthor(postModel, context);

    if (isContributor && isEdit) {
        hasUserPermission = !changingAuthors && coAuthor;
    } else if (isContributor && isAdd) {
        hasUserPermission = ownerCheck;
    } else if (isContributor && isDestroy) {
        hasUserPermission = primaryAuthor;
    } else if (isAuthor && isEdit) {
        hasUserPermission = coAuthor && !changingAuthors;
    } else if (isAuthor && isAdd) {
        hasUserPermission = ownerCheck;
    } else if (postModel) {
        hasUserPermission = hasUserPermission || primaryAuthor;
    }

    if (hasUserPermission && hasApiKeyPermission) {
        return Model.permissible.call(
            self,
            postModelOrId,
            action,
            context,
            unsafeAttrs,
            loadedPermissions,
            hasUserPermission,
            hasApiKeyPermission
        ).then(({excludedAttrs}) => {
            if (isContributor || isAuthor) {
                return {excludedAttrs: ['authors'].concat(excludedAttrs)};
            }
            return {excludedAttrs};
        });
    }

    return Promise.reject(new errors.NoPermissionError({
        message: tpl(messages.notEnoughPermission)
    }));
}

/**
 * Check if authors are being changed.
 */
function isChangingAuthors(unsafeAttrs, postModel) {
    if (!unsafeAttrs.authors) {
        return false;
    }
    if (!unsafeAttrs.authors.length) {
        return true;
    }
    const currentFirst = postModel.related('authors').models[0];
    return unsafeAttrs.authors[0].id !== (currentFirst && currentFirst.id);
}

/**
 * Verify the user is the owner of the post.
 */
function isOwner(unsafeAttrs, context) {
    if (!unsafeAttrs.authors) {
        return false;
    }
    return unsafeAttrs.authors.length &&
        unsafeAttrs.authors[0].id === context.user;
}

/**
 * Determine if the context user is the primary author.
 */
function isPrimaryAuthor(postModel, context) {
    const primary = postModel.related('authors').models[0];
    return primary && context.user === primary.id;
}

/**
 * Determine if the context user is a co‑author.
 */
function isCoAuthor(postModel, context) {
    return postModel.related('authors').models
        .map(author => author.id)
        .includes(context.user);
}

/**
 * Extend the Post model with author handling logic.
 * @param {Object} Post
 * @param {Object} Posts
 * @param {Object} ghostBookshelf
 * @returns {Object}
 */
module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions(fnName) {
            const self = this;
            return function (model, attrs, options) {
                return handleOptions.call(self, model, attrs, options, fnName, proto);
            };
        },

        onFetching(model, attrs, options) {
            return this._handleOptions('onFetching')(model, attrs, options);
        },

        onFetchingCollection(collection, attrs, options) {
            return this._handleOptions('onFetchingCollection')(collection, attrs, options);
        },

        onFetchedCollection(collection, attrs, options) {
            propagateOriginalOptions(collection);
            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        async onCreating(model, attrs, options) {
            await ensureAuthorOnCreate(model, options, this.contextUser.bind(this));
            return this._handleOptions('onCreating')(model, attrs, options);
        },

        onUpdating(model, attrs, options) {
            return this._handleOptions('onUpdating')(model, attrs, options);
        },

        onSaving(model, attrs, options) {
            validateAuthors(model);
            const ops = [];

            if (model.get('authors')) {
                ops.push(() => matchAuthors(model, options, ghostBookshelf));
            }

            ops.push(() => proto.onSaving.call(this, model, attrs, options));
            return sequence(ops);
        },

        serialize(options) {
            return serializeModel(this, options, proto.serialize);
        },

        matchAuthors(model, options) {
            return matchAuthors(model, options, ghostBookshelf);
        }
    }, {
        reassignByAuthor: function (unfilteredOptions) {
            return reassignByAuthor(this, ghostBookshelf, unfilteredOptions);
        },

        permissible: function (postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            return permissible(this, postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission);
        }
    });

    return Model;
};