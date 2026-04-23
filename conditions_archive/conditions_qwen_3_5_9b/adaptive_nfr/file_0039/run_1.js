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
 * Permission strategy for Contributor role
 */
const contributorStrategy = {
    edit: (isChangingAuthors, isCoAuthor) => !isChangingAuthors && isCoAuthor,
    add: (isOwner) => isOwner,
    destroy: (isPrimaryAuthor) => isPrimaryAuthor
};

/**
 * Permission strategy for Author role
 */
const authorStrategy = {
    edit: (isCoAuthor, isChangingAuthors) => isCoAuthor && !isChangingAuthors,
    add: (isOwner) => isOwner,
    destroy: (isPrimaryAuthor) => isPrimaryAuthor
};

/**
 * Permission strategy for default/other roles
 */
const defaultStrategy = {
    edit: (isPrimaryAuthor) => isPrimaryAuthor,
    add: (isOwner) => isOwner,
    destroy: (isPrimaryAuthor) => isPrimaryAuthor
};

/**
 * Get permission strategy based on user role
 * @param {Object} loadedPermissions - The loaded permissions object
 * @returns {Object} - The appropriate permission strategy
 */
function getPermissionStrategy(loadedPermissions) {
    const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
    
    if (isContributor) {
        return contributorStrategy;
    }
    
    if (isAuthor) {
        return authorStrategy;
    }
    
    return defaultStrategy;
}

/**
 * Check if user is changing authors in the post
 * @param {Object} unsafeAttrs - The unsafe attributes object
 * @param {Object} postModel - The post model
 * @returns {boolean} - True if authors are being changed
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
 * Check if user is the owner of the post
 * @param {Object} unsafeAttrs - The unsafe attributes object
 * @param {Object} context - The context object
 * @returns {boolean} - True if user is the owner
 */
function isOwner(unsafeAttrs, context) {
    if (!unsafeAttrs.authors) {
        return false;
    }
    
    if (unsafeAttrs.authors) {
        return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
    }
    
    return false;
}

/**
 * Check if user is the primary author of the post
 * @param {Object} context - The context object
 * @param {Object} postModel - The post model
 * @returns {boolean} - True if user is the primary author
 */
function isPrimaryAuthor(context, postModel) {
    return context.user === postModel.related('authors').models[0].id;
}

/**
 * Check if user is a co-author of the post
 * @param {Object} context - The context object
 * @param {Object} postModel - The post model
 * @returns {boolean} - True if user is a co-author
 */
function isCoAuthor(context, postModel) {
    return postModel.related('authors').models.map(author => author.id).includes(context.user);
}

/**
 * Check if user has permission to perform the action
 * @param {Object} strategy - The permission strategy
 * @param {string} action - The action being performed
 * @param {boolean} isChangingAuthors - Whether authors are being changed
 * @param {boolean} isOwner - Whether user is the owner
 * @param {boolean} isPrimaryAuthor - Whether user is the primary author
 * @param {boolean} isCoAuthor - Whether user is a co-author
 * @returns {boolean} - True if user has permission
 */
function checkPermission(strategy, action, isChangingAuthors, isOwner, isPrimaryAuthor, isCoAuthor) {
    return strategy[action](isChangingAuthors, isOwner, isPrimaryAuthor, isCoAuthor);
}

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions: function _handleOptions(fnName) {
            const self = this;

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

            const authorsRequested = this._originalOptions.withRelated && 
                this._originalOptions.withRelated.indexOf('authors') !== -1;

            if (!authorsRequested) {
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
            let ownerUser;
            const ops = [];

            ops.push(() => {
                return ghostBookshelf
                    .model('User')
                    .getOwnerUser(Object.assign({}, _.pick(options, 'transacting')))
                    .then((_ownerUser) => {
                        ownerUser = _ownerUser;
                    });
            });

            return Promise.all(ops).then(() => {
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
                            let userId = user ? user.id : ownerUser.id;

                            const userExists = _.find(authorsToSet, {id: userId.id});

                            if (!userExists) {
                                authorsToSet[index] = {};
                                authorsToSet[index].id = userId;
                            }
                        });
                })).then(() => {
                    model.set('authors', authorsToSet);
                });
            });
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

            const isChangingAuthors = isChangingAuthors(unsafeAttrs, postModel);
            const isOwner = isOwner(unsafeAttrs, context);
            const isPrimaryAuthor = isPrimaryAuthor(context, postModel);
            const isCoAuthor = isCoAuthor(context, postModel);

            const strategy = getPermissionStrategy(loadedPermissions);
            const hasPermission = checkPermission(strategy, action, isChangingAuthors, isOwner, isPrimaryAuthor, isCoAuthor);

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
    }, {
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
            });

            if (!options.transacting) {
                return ghostBookshelf.transaction((transacting) => {
                    options.transacting = transacting;
                    return reassignPost();
                });
            }

            return reassignPost();
        }
    });

    return Model;
};