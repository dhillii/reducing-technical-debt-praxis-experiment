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
 * Adjusts options for fetching authors relations.
 * @param {Object} options
 * @param {string} fnName
 * @returns {Object}
 */
function adjustOptions(options, fnName) {
    const opts = _.cloneDeep(_.pick(options, ['withRelated']));
    if (!options.withRelated) {
        options.withRelated = [];
    }
    if (options.withRelated.includes('author')) {
        options.withRelated = options.withRelated.filter(r => r !== 'author');
        options.withRelated.push('authors');
    }
    if (options.forUpdate && ['onFetching', 'onFetchingCollection'].includes(fnName) && !options.withRelated.includes('authors')) {
        options.withRelated.push('authors');
    }
    return opts;
}

/**
 * Handles options for model methods.
 * @param {string} fnName
 * @returns {Function}
 */
function createHandleOptions(fnName) {
    return function innerHandleOptions(model, attrs, options) {
        model._originalOptions = adjustOptions(options, fnName);
        return model.constructor.prototype[fnName].call(this, model, attrs, options);
    };
}

/**
 * Validates that at least one author exists.
 * @param {Object} model
 * @throws {errors.ValidationError}
 */
function validateAuthorsExist(model) {
    if (model.get('authors') && !model.get('authors').length) {
        throw new errors.ValidationError({
            message: 'At least one author is required.'
        });
    }
}

/**
 * Matches authors to existing users or owner.
 * @param {Object} model
 * @param {Object} options
 * @param {Object} ghostBookshelf
 * @returns {Promise}
 */
function matchAuthors(model, options, ghostBookshelf) {
    let ownerUser;
    const ops = [];

    ops.push(() => ghostBookshelf.model('User')
        .getOwnerUser(_.pick(options, 'transacting'))
        .then(u => { ownerUser = u; }));

    ops.push(() => {
        const authors = model.get('authors');
        const authorsToSet = [];

        return Promise.all(authors.map((author, index) => {
            const query = author.id ? {id: author.id} : author.slug ? {slug: author.slug} : author.email ? {email: author.email} : {};

            return ghostBookshelf.model('User')
                .where(query)
                .fetch({columns: ['id'], ..._.pick(options, 'transacting')})
                .then(user => {
                    const userId = user ? user.id : ownerUser.id;
                    if (!_.find(authorsToSet, {id: userId})) {
                        authorsToSet[index] = {id: userId};
                    }
                });
        })).then(() => {
            model.set('authors', authorsToSet);
        });
    });

    return sequence(ops);
}

/**
 * Permission strategy functions.
 * @param {Object} params
 * @returns {boolean}
 */
function contributorEdit(params) {
    return !params.isChangingAuthors && params.isCoAuthor;
}
function contributorAdd(params) {
    return params.isOwner;
}
function contributorDestroy(params) {
    return params.isPrimaryAuthor;
}
function authorEdit(params) {
    return params.isCoAuthor && !params.isChangingAuthors;
}
function authorAdd(params) {
    return params.isOwner;
}

/**
 * Strategy map for role-action combinations.
 */
const permissionStrategies = {
    contributor: {
        edit: contributorEdit,
        add: contributorAdd,
        destroy: contributorDestroy
    },
    author: {
        edit: authorEdit,
        add: authorAdd
    }
};

/**
 * Extracts predicates used in permissible.
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
function isPrimaryAuthor(context, postModel) {
    return context.user === postModel.related('authors').models[0].id;
}
function isCoAuthor(context, postModel) {
    return postModel.related('authors').models.map(a => a.id).includes(context.user);
}

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions: function _handleOptions(fnName) {
            return createHandleOptions.call(this, fnName);
        },

        onFetching: function onFetching(model, attrs, options) {
            return this._handleOptions('onFetching')(model, attrs, options);
        },

        onFetchingCollection: function onFetchingCollection(collection, attrs, options) {
            return this._handleOptions('onFetchingCollection')(collection, attrs, options);
        },

        onFetchedCollection: function (collection, attrs, options) {
            _.each(collection.models, model => {
                model._originalOptions = collection._originalOptions;
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

            model.unset('author');

            validateAuthorsExist(model);

            if (model.get('authors')) {
                ops.push(() => matchAuthors(model, options, ghostBookshelf));
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

        matchAuthors(model, options) {
            return matchAuthors(model, options, ghostBookshelf);
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

            const reassignPost = async () => {
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
            const origArgs = _.isNumber(postModelOrId) || _.isString(postModelOrId) ? _.toArray(arguments).slice(1) : null;

            if (origArgs) {
                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then(foundPostModel => {
                        if (!foundPostModel) {
                            throw new errors.NotFoundError({message: tpl(messages.postNotFound)});
                        }
                        const newArgs = [foundPostModel].concat(origArgs);
                        return self.permissible.apply(self, newArgs);
                    });
            }

            const params = {
                isChangingAuthors: isChangingAuthors(unsafeAttrs, postModel),
                isOwner: isOwner(unsafeAttrs, context),
                isPrimaryAuthor: isPrimaryAuthor(context, postModel),
                isCoAuthor: isCoAuthor(context, postModel)
            };

            if (isContributor) {
                if (action === 'edit') hasUserPermission = contributorEdit(params);
                else if (action === 'add') hasUserPermission = contributorAdd(params);
                else if (action === 'destroy') hasUserPermission = contributorDestroy(params);
            } else if (isAuthor) {
                if (action === 'edit') hasUserPermission = authorEdit(params);
                else if (action === 'add') hasUserPermission = authorAdd(params);
                else if (postModel) hasUserPermission = hasUserPermission || params.isPrimaryAuthor;
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