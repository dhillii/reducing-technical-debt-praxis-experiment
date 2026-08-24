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
                ops.push(() => this.matchAuthors(model, options));
            }

            ops.push(() => proto.onSaving.call(this, model, attrs, options));

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

            if (!options.columns || options.columns.indexOf('primary_author') > -1) {
                attrs.primary_author = attrs.authors && attrs.authors.length ? attrs.authors[0] : null;
            }

            return attrs;
        },

        matchAuthors(model, options) {
            let ownerUser;
            const ops = [];

            ops.push(() => this._fetchOwnerUser(options).then((_ownerUser) => {
                ownerUser = _ownerUser;
            }));

            ops.push(() => this._processAuthors(model, ownerUser, options));

            return sequence(ops);
        },

        _fetchOwnerUser(options) {
            return ghostBookshelf
                .model('User')
                .getOwnerUser(Object.assign({}, _.pick(options, 'transacting')));
        },

        _processAuthors(model, ownerUser, options) {
            const authors = model.get('authors');
            const authorsToSet = [];

            const authorPromises = authors.map((author, index) => {
                const query = this._buildAuthorQuery(author);
                return this._fetchAuthorId(query, ownerUser, options)
                    .then((userId) => this._addUniqueAuthor(authorsToSet, userId));
            });

            return Promise.all(authorPromises).then(() => {
                model.set('authors', authorsToSet);
            });
        },

        _buildAuthorQuery(author) {
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
        },

        _fetchAuthorId(query, ownerUser, options) {
            return ghostBookshelf
                .model('User')
                .where(query)
                .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')))
                .then((user) => (user ? user.id : ownerUser.id));
        },

        _addUniqueAuthor(authorsToSet, userId) {
            const exists = authorsToSet.find(author => author && author.id === userId);
            if (!exists) {
                authorsToSet.push({id: userId});
            }
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

            async function performReassign() {
                let trx = options.transacting;
                let knex = ghostBookshelf.knex;

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
            }

            if (!options.transacting) {
                return ghostBookshelf.transaction((transacting) => {
                    options.transacting = transacting;
                    return performReassign();
                });
            }

            return performReassign();
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

            function isChangingAuthors() {
                if (!unsafeAttrs.authors || !unsafeAttrs.authors.length) {
                    return true;
                }
                return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
            }

            function isOwner() {
                return unsafeAttrs.authors?.length && unsafeAttrs.authors[0].id === context.user;
            }

            function isPrimaryAuthor() {
                return context.user === postModel.related('authors').models[0].id;
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
    });

    return Model;
};