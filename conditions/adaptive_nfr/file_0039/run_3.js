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
 * Why and when do we have to fetch `authors` by default?
 *
 * # CASE 1
 * We fetch the `authors` relations when you either request `withRelated=['authors']` or `withRelated=['author`].
 * The old `author` relation was removed, but we still have to support this case.
 *
 * ---
 *
 * It's impossible to implement a default `withRelated` feature nicely at the moment, because we can't hook into bookshelf
 * and support all model queries and collection queries (e.g. fetchAll). The hardest part is to remember
 * if the user requested the `authors` or not. Overriding `sync` does not work for collections.
 * And overriding the sync method of Collection does not trigger sync - probably a bookshelf bug, i have
 * not investigated.
 *
 * That's why we remember `_originalOptions` for now - only specific to posts.
 *
 * NOTE: If we fetch the multiple authors manually on the events, we run into the same problem. We have to remember
 * the original options. Plus: we would fetch the authors twice in some cases.
 */

/** @param {Array} withRelated - The withRelated array to modify */
function normalizeAuthorRelation(withRelated) {
    const authorIndex = withRelated.indexOf('author');
    if (authorIndex !== -1) {
        withRelated.splice(authorIndex, 1);
        withRelated.push('authors');
    }
}

/** @param {Array} withRelated - The withRelated array to check */
function shouldAddAuthorsForUpdate(withRelated) {
    return withRelated.indexOf('authors') === -1;
}

/** @param {string} fnName - The function name being called */
function isUpdateFunction(fnName) {
    return ['onFetching', 'onFetchingCollection'].indexOf(fnName) !== -1;
}

/** @param {Object} author - The author object to query */
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

/** @param {Array} authorsToSet - Array of authors already set */
function authorAlreadyExists(authorsToSet, userId) {
    return _.find(authorsToSet, {id: userId});
}

/** @param {Object} attrs - The attributes to check */
function hasAuthorsAttribute(attrs) {
    return attrs && attrs.authors;
}

/** @param {Array} authors - The authors array */
function hasAuthorsLength(authors) {
    return authors && authors.length;
}

/** @param {Object} postModel - The post model */
function getPrimaryAuthorId(postModel) {
    const authors = postModel.related('authors').models;
    return authors.length > 0 ? authors[0].id : null;
}

/** @param {Object} postModel - The post model */
function getAuthorIds(postModel) {
    return postModel.related('authors').models.map(author => author.id);
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

                normalizeAuthorRelation(options.withRelated);

                if (options.forUpdate && isUpdateFunction(fnName) && shouldAddAuthorsForUpdate(options.withRelated)) {
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

            if (!this._originalOptions || !this._originalOptions.withRelated || this._originalOptions.withRelated.indexOf('authors') === -1) {
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

        matchAuthors(model, options) {
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

            ops.push(() => {
                const authors = model.get('authors');
                const authorsToSet = [];

                return Promise.all(authors.map((author, index) => {
                    const query = buildAuthorQuery(author);

                    return ghostBookshelf
                        .model('User')
                        .where(query)
                        .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')))
                        .then((user) => {
                            let userId = user ? user.id : ownerUser.id;

                            const userExists = authorAlreadyExists(authorsToSet, userId.id);

                            if (!userExists) {
                                authorsToSet[index] = {};
                                authorsToSet[index].id = userId;
                            }
                        });
                })).then(() => {
                    model.set('authors', authorsToSet);
                });
            });

            return sequence(ops);
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
                    await this._reassignPostsForAuthor(knex, trx, authorId);
                } catch (err) {
                    throw new errors.InternalServerError({err: err});
                }
            }).bind(this);

            if (!options.transacting) {
                return ghostBookshelf.transaction((transacting) => {
                    options.transacting = transacting;
                    return reassignPost();
                });
            }

            return reassignPost();
        },

        _reassignPostsForAuthor: async function _reassignPostsForAuthor(knex, trx, authorId) {
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

            await this._handlePrimaryPostsWithOwnerCoauthor(knex, trx, authorsPosts, ownersPosts, authorId, ownerId);
            await this._handlePrimaryPostsWithoutOwnerCoauthor(knex, trx, authorsPosts, ownersPosts, authorId, ownerId);
            await this._removeAuthorAsSecondaryAuthor(knex, trx, authorId);
        },

        _handlePrimaryPostsWithOwnerCoauthor: async function _handlePrimaryPostsWithOwnerCoauthor(knex, trx, authorsPosts, ownersPosts, authorId, ownerId) {
            const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
            const primaryPostsWithOwnerCoauthor = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
            const primaryPostsWithOwnerCoauthorIds = primaryPostsWithOwnerCoauthor.map(post => post.post_id);

            if (primaryPostsWithOwnerCoauthorIds.length === 0) {
                return;
            }

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
        },

        _handlePrimaryPostsWithoutOwnerCoauthor: async function _handlePrimaryPostsWithoutOwnerCoauthor(knex, trx, authorsPosts, ownersPosts, authorId, ownerId) {
            const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
            const primaryPostsWithOwnerCoauthor = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
            const primaryPostsWithoutOwnerCoauthor = _.differenceBy(authorsPrimaryPosts, primaryPostsWithOwnerCoauthor, 'post_id');
            const postsWithoutOwnerCoauthorIds = primaryPostsWithoutOwnerCoauthor.map(post => post.post_id);

            if (postsWithoutOwnerCoauthorIds.length === 0) {
                return;
            }

            await knex('posts_authors')
                .transacting(trx)
                .whereIn('post_id', postsWithoutOwnerCoauthorIds)
                .where('author_id', authorId)
                .update('author_id', ownerId);
        },

        _removeAuthorAsSecondaryAuthor: async function _removeAuthorAsSecondaryAuthor(knex, trx, authorId) {
            await knex('posts_authors')
                .transacting(trx)
                .where('author_id', authorId)
                .del();
        },

        permissible: function permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const postModel = postModelOrId;
            let origArgs;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);

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

            const permissionStrategy = this._getPermissionStrategy(action, isContributor, isAuthor);
            hasUserPermission = permissionStrategy.call(this, postModel, context, unsafeAttrs, hasUserPermission);

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
        },

        _getPermissionStrategy: function _getPermissionStrategy(action, isContributor, isAuthor) {
            const strategies = {
                'contributor-edit': this._permissionContributorEdit.bind(this),
                'contributor-add': this._permissionContributorAdd.bind(this),
                'contributor-destroy': this._permissionContributorDestroy.bind(this),
                'author-edit': this._permissionAuthorEdit.bind(this),
                'author-add': this._permissionAuthorAdd.bind(this),
                'default': this._permissionDefault.bind(this)
            };

            if (isContributor && action === 'edit') {
                return strategies['contributor-edit'];
            }
            if (isContributor && action === 'add') {
                return strategies['contributor-add'];
            }
            if (isContributor && action === 'destroy') {
                return strategies['contributor-destroy'];
            }
            if (isAuthor && action === 'edit') {
                return strategies['author-edit'];
            }
            if (isAuthor && action === 'add') {
                return strategies['author-add'];
            }
            return strategies['default'];
        },

        _isChangingAuthors: function _isChangingAuthors(unsafeAttrs, postModel) {
            if (!hasAuthorsAttribute(unsafeAttrs)) {
                return false;
            }

            if (!hasAuthorsLength(unsafeAttrs.authors)) {
                return true;
            }

            return unsafeAttrs.authors[0].id !== getPrimaryAuthorId(postModel);
        },

        _isOwner: function _isOwner(unsafeAttrs, context) {
            if (!hasAuthorsAttribute(unsafeAttrs)) {
                return false;
            }

            if (!hasAuthorsLength(unsafeAttrs.authors)) {
                return false;
            }

            return unsafeAttrs.authors[0].id === context.user;
        },

        _isPrimaryAuthor: function _isPrimaryAuthor(context, postModel) {
            return context.user === getPrimaryAuthorId(postModel);
        },

        _isCoAuthor: function _isCoAuthor(context, postModel) {
            return getAuthorIds(postModel).includes(context.user);
        },

        _permissionContributorEdit: function _permissionContributorEdit(postModel, context, unsafeAttrs) {
            return !this._isChangingAuthors(unsafeAttrs, postModel) && this._isCoAuthor(context, postModel);
        },

        _permissionContributorAdd: function _permissionContributorAdd(postModel, context, unsafeAttrs) {
            return this._isOwner(unsafeAttrs, context);
        },

        _permissionContributorDestroy: function _permissionContributorDestroy(postModel, context, unsafeAttrs) {
            return this._isPrimaryAuthor(context, postModel);
        },

        _permissionAuthorEdit: function _permissionAuthorEdit(postModel, context, unsafeAttrs) {
            return this._isCoAuthor(context, postModel) && !this._isChangingAuthors(unsafeAttrs, postModel);
        },

        _permissionAuthorAdd: function _permissionAuthorAdd(postModel, context, unsafeAttrs) {
            return this._isOwner(unsafeAttrs, context);
        },

        _permissionDefault: function _permissionDefault(postModel, context, unsafeAttrs, hasUserPermission) {
            return hasUserPermission || this._isPrimaryAuthor(context, postModel);
        }
    });

    return Model;
};