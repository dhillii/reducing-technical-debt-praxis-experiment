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

    function handleOptions(fnName, model, attrs, options) {
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

        return proto[fnName].call(model, model, attrs, options);
    }

    const Model = Post.extend({
        onFetching: function (model, attrs, options) {
            return handleOptions('onFetching', this, model, attrs, options);
        },

        onFetchingCollection: function (collection, attrs, options) {
            return handleOptions('onFetchingCollection', this, collection, attrs, options);
        },

        onFetchedCollection: function (collection, attrs, options) {
            _.each(collection.models, (model) => {
                model._originalOptions = collection._originalOptions;
            });

            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        onCreating: async function (model, attrs, options) {
            if (!model.get('authors')) {
                model.set('authors', [{ id: await this.contextUser(options) }]);
            }

            return handleOptions('onCreating', this, model, attrs, options);
        },

        onUpdating: function (model, attrs, options) {
            return handleOptions('onUpdating', this, model, attrs, options);
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

        serialize: function (options) {
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

        matchAuthors: async function (model, options) {
            const ownerUser = await ghostBookshelf
                .model('User')
                .getOwnerUser(_.pick(options, 'transacting'));

            const authors = model.get('authors');
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

                const userExists = _.find(authorsToSet, {id: userId});

                if (!userExists) {
                    authorsToSet[index] = { id: userId };
                }
            }));

            model.set('authors', authorsToSet);
        }
    }, {
        reassignByAuthor: async function (unfilteredOptions) {
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
                    throw new errors.InternalServerError({err});
                }
            };

            if (!options.transacting) {
                return ghostBookshelf.transaction((transacting) => {
                    options.transacting = transacting;
                    return reassignPost();
                });
            }

            return reassignPost();
        },

        permissible: function (postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const postModel = postModelOrId;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
            let isEdit, isAdd, isDestroy;

            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                const origArgs = _.toArray(arguments).slice(1);

                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then(function (foundPostModel) {
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
                if (!unsafeAttrs.authors) {
                    return false;
                }
                return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
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
                    action,
                    context,
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