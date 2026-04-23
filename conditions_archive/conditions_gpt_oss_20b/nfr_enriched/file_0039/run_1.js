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
 * Normalise the `withRelated` option.
 * Ensures it is an array, replaces deprecated `author` with `authors`,
 * and adds `authors` when required for updates.
 *
 * @param {Object} options
 * @param {string} fnName
 * @returns {Object}
 */
function normaliseWithRelated(options, fnName) {
    const opts = _.cloneDeep(_.pick(options, ['withRelated']));

    if (!opts.withRelated) {
        opts.withRelated = [];
    }

    if (opts.withRelated.includes('author')) {
        opts.withRelated = opts.withRelated.filter(r => r !== 'author');
        opts.withRelated.push('authors');
    }

    if (options.forUpdate && ['onFetching', 'onFetchingCollection'].includes(fnName) && !opts.withRelated.includes('authors')) {
        opts.withRelated.push('authors');
    }

    return opts;
}

/**
 * Ensure a post has at least one author on creation.
 *
 * @param {Object} model
 * @param {Object} options
 */
async function ensureAuthorsOnCreate(model, options) {
    if (!model.get('authors')) {
        model.set('authors', [{id: await model.contextUser(options)}]);
    }
}

/**
 * Validate that a post has at least one author.
 *
 * @param {Object} model
 */
function validateAuthorsExist(model) {
    if (model.get('authors') && !model.get('authors').length) {
        throw new errors.ValidationError({
            message: 'At least one author is required.'
        });
    }
}

/**
 * Build the sequence of operations for onSaving.
 *
 * @param {Object} model
 * @param {Object} options
 * @returns {Array<Function>}
 */
function buildOnSavingOps(model, options) {
    const ops = [];

    // Remove deprecated single author field
    model.unset('author');

    validateAuthorsExist(model);

    if (model.get('authors')) {
        ops.push(() => model.matchAuthors(options));
    }

    ops.push(() => model.proto.onSaving.call(model, model, null, options));

    return ops;
}

/**
 * Remove authors from serialized attributes if not requested.
 *
 * @param {Object} attrs
 * @param {Object} originalOptions
 */
function removeAuthorsIfNotRequested(attrs, originalOptions) {
    if (!originalOptions || !originalOptions.withRelated || !originalOptions.withRelated.includes('authors')) {
        delete attrs.authors;
    }
}

/**
 * Attach primary_author to serialized attributes if requested.
 *
 * @param {Object} attrs
 * @param {Object} options
 */
function attachPrimaryAuthor(attrs, options) {
    if (!options.columns || options.columns.includes('primary_author')) {
        attrs.primary_author = (attrs.authors && attrs.authors.length) ? attrs.authors[0] : null;
    }
}

/**
 * Fetch the owner user.
 *
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function fetchOwnerUser(options) {
    return ghostBookshelf
        .model('User')
        .getOwnerUser(_.pick(options, 'transacting'));
}

/**
 * Map authors to user IDs, falling back to owner if not found.
 *
 * @param {Array} authors
 * @param {Object} ownerUser
 * @param {Object} options
 * @returns {Promise<Array>}
 */
async function mapAuthorsToUsers(authors, ownerUser, options) {
    const authorsToSet = [];

    await Promise.all(authors.map(async (author, index) => {
        const query = {};

        if (author.id) {
            query.id = author.id;
        } else if (author.slug) {
            query.slug = author.slug;
        } else if (author.email) {
            query.email = author.email;
        }

        const user = await ghostBookshelf
            .model('User')
            .where(query)
            .fetch(_.assign({columns: ['id']}, _.pick(options, 'transacting')));

        const userId = user ? user.id : ownerUser.id;

        // Avoid duplicate authors
        if (!authorsToSet.find(a => a.id === userId)) {
            authorsToSet[index] = {id: userId};
        }
    }));

    return authorsToSet;
}

/**
 * Reassign posts from an author to the owner.
 *
 * @param {Object} options
 * @returns {Promise<void>}
 */
async function reassignPostLogic(options) {
    const trx = options.transacting;
    const knex = ghostBookshelf.knex;

    try {
        const ownerUser = await knex('roles')
            .transacting(trx)
            .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
            .where('roles.name', 'Owner')
            .select('roles_users.user_id');

        const ownerId = ownerUser[0].user_id;

        const authorsPosts = await knex('posts_authors')
            .transacting(trx)
            .where('author_id', options.id)
            .select('post_id', 'sort_order');

        const ownersPosts = await knex('posts_authors')
            .transacting(trx)
            .where('author_id', ownerId)
            .select('post_id');

        const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
        const primaryPostsWithOwnerCoauthor = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
        const primaryPostsWithOwnerCoauthorIds = primaryPostsWithOwnerCoauthor.map(p => p.post_id);

        // Remove author from primary posts where owner is coauthor
        await knex('posts_authors')
            .transacting(trx)
            .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
            .where('author_id', options.id)
            .del();

        // Make owner primary author
        await knex('posts_authors')
            .transacting(trx)
            .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
            .where('author_id', ownerId)
            .update('sort_order', 0);

        const primaryPostsWithoutOwnerCoauthor = _.differenceBy(authorsPrimaryPosts, primaryPostsWithOwnerCoauthor, 'post_id');
        const postsWithoutOwnerCoauthorIds = primaryPostsWithoutOwnerCoauthor.map(p => p.post_id);

        // Swap author with owner on posts where owner is not coauthor
        await knex('posts_authors')
            .transacting(trx)
            .whereIn('post_id', postsWithoutOwnerCoauthorIds)
            .where('author_id', options.id)
            .update('author_id', ownerId);

        // Remove author from all other posts
        await knex('posts_authors')
            .transacting(trx)
            .where('author_id', options.id)
            .del();
    } catch (err) {
        throw new errors.InternalServerError({err});
    }
}

/**
 * Permission helper functions.
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

function isOwner(unsafeAttrs, context) {
    if (!unsafeAttrs.authors) {
        return false;
    }
    return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
}

function isPrimaryAuthor(postModel, context) {
    return context.user === postModel.related('authors').models[0].id;
}

function isCoAuthor(postModel, context) {
    return postModel.related('authors').models.map(a => a.id).includes(context.user);
}

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions: function _handleOptions(fnName) {
            const self = this;
            return function innerHandleOptions(model, attrs, options) {
                model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));
                const opts = normaliseWithRelated(options, fnName);
                options.withRelated = opts.withRelated;
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
            collection.models.forEach(m => {
                m._originalOptions = collection._originalOptions;
            });
            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        onCreating: async function onCreating(model, attrs, options) {
            await ensureAuthorsOnCreate(model, options);
            return this._handleOptions('onCreating')(model, attrs, options);
        },

        onUpdating: function onUpdating(model, attrs, options) {
            return this._handleOptions('onUpdating')(model, attrs, options);
        },

        onSaving: async function (model, attrs, options) {
            const ops = buildOnSavingOps(model, options);
            await sequence(ops);
            return;
        },

        serialize: function serialize(options) {
            let attrs = proto.serialize.call(this, options);

            if (!this._originalOptions) {
                this._originalOptions = {};
            }

            removeAuthorsIfNotRequested(attrs, this._originalOptions);
            attachPrimaryAuthor(attrs, options);

            return attrs;
        },

        matchAuthors: async function matchAuthors(options) {
            const ownerUser = await fetchOwnerUser(options);
            const authors = this.get('authors');
            const authorsToSet = await mapAuthorsToUsers(authors, ownerUser, options);
            this.set('authors', authorsToSet);
        }
    }, {
        reassignByAuthor: async function reassignByAuthor(unfilteredOptions) {
            const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
            const authorId = options.id;

            if (!authorId) {
                return Promise.reject(new errors.NotFoundError({
                    message: tpl(messages.noUserFound)
                }));
            }

            const reassign = async () => {
                await reassignPostLogic(options);
            };

            if (!options.transacting) {
                return ghostBookshelf.transaction(transacting => {
                    options.transacting = transacting;
                    return reassign();
                });
            }

            return reassign();
        },

        permissible: function permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const postModel = postModelOrId;
            let origArgs;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
            let isEdit, isAdd, isDestroy;

            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                origArgs = _.toArray(arguments).slice(1);
                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then(foundPostModel => {
                        if (!foundPostModel) {
                            throw new errors.NotFoundError({
                                message: tpl(messages.postNotFound)
                            });
                        }
                        const newArgs = [foundPostModel].concat(origArgs);
                        return self.permissible.apply(self, newArgs);
                    });
            }

            isEdit = action === 'edit';
            isAdd = action === 'add';
            isDestroy = action === 'destroy';

            if (isContributor && isEdit) {
                hasUserPermission = !isChangingAuthors(unsafeAttrs, postModel) && isCoAuthor(postModel, context);
            } else if (isContributor && isAdd) {
                hasUserPermission = isOwner(unsafeAttrs, context);
            } else if (isContributor && isDestroy) {
                hasUserPermission = isPrimaryAuthor(postModel, context);
            } else if (isAuthor && isEdit) {
                hasUserPermission = isCoAuthor(postModel, context) && !isChangingAuthors(unsafeAttrs, postModel);
            } else if (isAuthor && isAdd) {
                hasUserPermission = isOwner(unsafeAttrs, context);
            } else if (postModel) {
                hasUserPermission = hasUserPermission || isPrimaryAuthor(postModel, context);
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