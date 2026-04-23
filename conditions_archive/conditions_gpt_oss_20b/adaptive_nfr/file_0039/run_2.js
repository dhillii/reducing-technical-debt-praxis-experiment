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
 * Handles default `withRelated` options for posts.
 * @param {Object} options
 * @param {string} fnName
 * @returns {Object}
 */
function handleWithRelated(options, fnName) {
    const opts = _.cloneDeep(_.pick(options, ['withRelated']));
    if (!options.withRelated) {
        options.withRelated = [];
    }
    if (options.withRelated.includes('author')) {
        options.withRelated = options.withRelated.filter(r => r !== 'author');
        options.withRelated.push('authors');
    }
    if (['onFetching', 'onFetchingCollection'].includes(fnName) && options.forUpdate && !options.withRelated.includes('authors')) {
        options.withRelated.push('authors');
    }
    options._originalOptions = opts;
    return options;
}

/**
 * Validates that a post has at least one author.
 * @param {Object} model
 */
function validateAuthorsNotEmpty(model) {
    if (model.get('authors') && !model.get('authors').length) {
        throw new errors.ValidationError({
            message: 'At least one author is required.'
        });
    }
}

/**
 * Finds the owner user.
 * @param {Object} options
 * @returns {Promise<Object>}
 */
function findOwnerUser(options) {
    return ghostBookshelf
        .model('User')
        .getOwnerUser(_.pick(options, 'transacting'));
}

/**
 * Finds a user by id, slug or email.
 * @param {Object} query
 * @param {Object} options
 * @returns {Promise<Object|null>}
 */
function findUserByQuery(query, options) {
    return ghostBookshelf
        .model('User')
        .where(query)
        .fetch(_.assign({columns: ['id']}, _.pick(options, 'transacting')));
}

/**
 * Matches authors for a post.
 * @param {Object} model
 * @param {Object} options
 * @returns {Promise<void>}
 */
async function matchAuthors(model, options) {
    const ownerUser = await findOwnerUser(options);
    const authors = model.get('authors') || [];
    const authorsToSet = [];

    await Promise.all(authors.map(async (author, index) => {
        const query = author.id ? {id: author.id} : author.slug ? {slug: author.slug} : author.email ? {email: author.email} : null;
        if (!query) {
            authorsToSet[index] = {id: ownerUser.id};
            return;
        }
        const user = await findUserByQuery(query, options);
        const userId = user ? user.id : ownerUser.id;
        if (!authorsToSet.find(a => a.id === userId)) {
            authorsToSet[index] = {id: userId};
        }
    }));

    model.set('authors', authorsToSet);
}

/**
 * Permission check helpers.
 */
function isChangingAuthors(unsafeAttrs, postModel) {
    if (!unsafeAttrs.authors) return false;
    if (!unsafeAttrs.authors.length) return true;
    return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
}

function isOwner(unsafeAttrs, context) {
    if (!unsafeAttrs.authors) return false;
    return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
}

function isPrimaryAuthor(postModel, context) {
    return context.user === postModel.related('authors').models[0].id;
}

function isCoAuthor(postModel, context) {
    return postModel.related('authors').models.map(a => a.id).includes(context.user);
}

/**
 * Permission strategy mapping.
 */
const permissionStrategies = {
    contributor: {
        edit: (postModel, unsafeAttrs, context) => !isChangingAuthors(unsafeAttrs, postModel) && isCoAuthor(postModel, context),
        add: (postModel, unsafeAttrs, context) => isOwner(unsafeAttrs, context),
        destroy: (postModel, unsafeAttrs, context) => isPrimaryAuthor(postModel, context)
    },
    author: {
        edit: (postModel, unsafeAttrs, context) => isCoAuthor(postModel, context) && !isChangingAuthors(unsafeAttrs, postModel),
        add: (postModel, unsafeAttrs, context) => isOwner(unsafeAttrs, context)
    }
};

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions: function _handleOptions(fnName) {
            const self = this;
            return function innerHandleOptions(model, attrs, options) {
                handleWithRelated(options, fnName);
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
            if (!model.get('authors')) {
                model.set('authors', [{id: await this.contextUser(options)}]);
            }
            return this._handleOptions('onCreating')(model, attrs, options);
        },

        onUpdating: function onUpdating(model, attrs, options) {
            return this._handleOptions('onUpdating')(model, attrs, options);
        },

        onSaving: function (model, attrs, options) {
            const ops = [];

            // @deprecated: single authors was superceded by multiple authors in Ghost 1.22.0 - `author`, is unused in Ghost 3.0
            model.unset('author');

            validateAuthorsNotEmpty(model);

            if (model.get('authors')) {
                ops.push(() => matchAuthors(model, options));
            }

            ops.push(() => proto.onSaving.call(this, model, attrs, options));

            return sequence(ops);
        },

        serialize: function serialize(options) {
            let attrs = proto.serialize.call(this, options);

            if (!this._originalOptions) {
                this._originalOptions = {};
            }

            if (!this._originalOptions.withRelated || !this._originalOptions.withRelated.includes('authors')) {
                delete attrs.authors;
            }

            if (!options.columns || options.columns.includes('primary_author')) {
                attrs.primary_author = (attrs.authors && attrs.authors.length) ? attrs.authors[0] : null;
            }

            return attrs;
        },

        matchAuthors
    }, {
        reassignByAuthor: async function reassignByAuthor(unfilteredOptions) {
            const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
            const authorId = options.id;

            if (!authorId) {
                return Promise.reject(new errors.NotFoundError({
                    message: tpl(messages.noUserFound)
                }));
            }

            const reassignPost = async () => {
                const trx = options.transacting;
                const knex = ghostBookshelf.knex;

                try {
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

                    const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
                    const primaryPostsWithOwnerCoauthor = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
                    const primaryPostsWithOwnerCoauthorIds = primaryPostsWithOwnerCoauthor.map(p => p.post_id);

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
                    const postsWithoutOwnerCoauthorIds = primaryPostsWithoutOwnerCoauthor.map(p => p.post_id);

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
                    throw new errors.InternalServerError({err});
                }
            };

            if (!options.transacting) {
                return ghostBookshelf.transaction(transacting => {
                    options.transacting = transacting;
                    return reassignPost();
                });
            }

            return reassignPost();
        },

        permissible: function permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const postModel = postModelOrId;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);

            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                const origArgs = Array.prototype.slice.call(arguments, 1);
                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then(foundPostModel => {
                        if (!foundPostModel) {
                            throw new errors.NotFoundError({message: tpl(messages.postNotFound)});
                        }
                        const newArgs = [foundPostModel].concat(origArgs);
                        return self.permissible.apply(self, newArgs);
                    });
            }

            const isEdit = action === 'edit';
            const isAdd = action === 'add';
            const isDestroy = action === 'destroy';

            const role = isContributor ? 'contributor' : isAuthor ? 'author' : null;
            const strategy = role && permissionStrategies[role] ? permissionStrategies[role][action] : null;

            if (strategy) {
                hasUserPermission = strategy(postModel, unsafeAttrs, context);
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
                        return {excludedAttrs: ['authors'].concat(excludedAttrs)};
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