```javascript
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

class PostModelExtension {
    constructor(Post, Posts, ghostBookshelf) {
        this.Post = Post;
        this.Posts = Posts;
        this.ghostBookshelf = ghostBookshelf;
        this.proto = Post.prototype;
    }

    normalizeWithRelated(options) {
        if (!options.withRelated) {
            options.withRelated = [];
        }

        const authorIndex = options.withRelated.indexOf('author');
        if (authorIndex !== -1) {
            options.withRelated.splice(authorIndex, 1);
            options.withRelated.push('authors');
        }

        return options;
    }

    shouldFetchAuthorsForUpdate(options, fnName) {
        const updateFunctions = ['onFetching', 'onFetchingCollection'];
        return options.forUpdate &&
               updateFunctions.includes(fnName) &&
               !options.withRelated.includes('authors');
    }

    handleOptions(fnName) {
        return (model, attrs, options) => {
            model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

            this.normalizeWithRelated(options);

            if (this.shouldFetchAuthorsForUpdate(options, fnName)) {
                options.withRelated.push('authors');
            }

            return this.proto[fnName].call(this, model, attrs, options);
        };
    }

    getInstanceMethods() {
        return {
            onFetching: (model, attrs, options) => {
                return this.handleOptions('onFetching')(model, attrs, options);
            },

            onFetchingCollection: (collection, attrs, options) => {
                return this.handleOptions('onFetchingCollection')(collection, attrs, options);
            },

            onFetchedCollection: (collection, attrs, options) => {
                _.each(collection.models, (model) => {
                    model._originalOptions = collection._originalOptions;
                });
                return this.proto.onFetchedCollection.call(this, collection, attrs, options);
            },

            onCreating: async function(model, attrs, options) {
                if (!model.get('authors')) {
                    model.set('authors', [{
                        id: await this.contextUser(options)
                    }]);
                }
                return this.handleOptions('onCreating')(model, attrs, options);
            },

            onUpdating: (model, attrs, options) => {
                return this.handleOptions('onUpdating')(model, attrs, options);
            },

            onSaving: (model, attrs, options) => {
                model.unset('author');

                if (model.get('authors') && !model.get('authors').length) {
                    throw new errors.ValidationError({
                        message: 'At least one author is required.'
                    });
                }

                const ops = [];

                if (model.get('authors')) {
                    ops.push(() => this.matchAuthors(model, options));
                }

                ops.push(() => this.proto.onSaving.call(this, model, attrs, options));

                return sequence(ops);
            },

            serialize: function(options) {
                let attrs = this.proto.serialize.call(this, options);

                this._originalOptions = this._originalOptions || {};

                const shouldExcludeAuthors = !this._originalOptions?.withRelated?.includes('authors');
                if (shouldExcludeAuthors) {
                    delete attrs.authors;
                }

                if (!options.columns || options.columns.includes('primary_author')) {
                    attrs.primary_author = attrs.authors?.length ? attrs.authors[0] : null;
                }

                return attrs;
            },

            matchAuthors: (model, options) => {
                let ownerUser;
                const ops = [];

                ops.push(() => {
                    return this.ghostBookshelf
                        .model('User')
                        .getOwnerUser(_.pick(options, 'transacting'))
                        .then((_ownerUser) => {
                            ownerUser = _ownerUser;
                        });
                });

                ops.push(() => {
                    const authors = model.get('authors');
                    const authorsToSet = [];

                    return Promise.all(authors.map((author, index) => {
                        const query = this.buildAuthorQuery(author);

                        return this.ghostBookshelf
                            .model('User')
                            .where(query)
                            .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')))
                            .then((user) => {
                                const userId = user ? user.id : ownerUser.id;
                                const userExists = _.find(authorsToSet, {id: userId});

                                if (!userExists) {
                                    authorsToSet[index] = {id: userId};
                                }
                            });
                    })).then(() => {
                        model.set('authors', authorsToSet);
                    });
                });

                return sequence(ops);
            },

            buildAuthorQuery: (author) => {
                if (author.id) return {id: author.id};
                if (author.slug) return {slug: author.slug};
                if (author.email) return {email: author.email};
                return {};
            }
        };
    }

    getStaticMethods() {
        return {
            reassignByAuthor: async (unfilteredOptions) => {
                const options = this.Post.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
                const authorId = options.id;

                if (!authorId) {
                    return Promise.reject(new errors.NotFoundError({
                        message: tpl(messages.noUserFound)
                    }));
                }

                const reassignPost = async () => {
                    try {
                        const trx = options.transacting;
                        const knex = this.ghostBookshelf.knex;

                        const ownerUser = await this.getOwnerUser(knex, trx);
                        const ownerId = ownerUser[0].user_id;

                        const authorsPosts = await this.getAuthorsPosts(knex, trx, authorId);
                        const ownersPosts = await this.getOwnersPosts(knex, trx, ownerId);

                        const primaryPostsWithOwnerCoauthor = this.findPrimaryPostsWithOwnerCoauthor(
                            authorsPosts,
                            ownersPosts
                        );
                        const primaryPostsWithoutOwnerCoauthor = this.findPrimaryPostsWithoutOwnerCoauthor(
                            authorsPosts,
                            primaryPostsWithOwnerCoauthor
                        );

                        await this.removeAuthorFromPrimaryPosts(knex, trx, primaryPostsWithOwnerCoauthor, authorId);
                        await this.makeOwnerPrimaryAuthor(knex, trx, primaryPostsWithOwnerCoauthor, ownerId);
                        await this.replaceAuthorWithOwner(knex, trx, primaryPostsWithoutOwnerCoauthor, authorId, ownerId);
                        await this.removeAuthorFromSecondaryPosts(knex, trx, authorId);
                    } catch (err) {
                        throw new errors.InternalServerError({err});
                    }
                };

                if (!options.transacting) {
                    return this.ghostBookshelf.transaction((transacting) => {
                        options.transacting = transacting;
                        return reassignPost();
                    });
                }

                return reassignPost();
            },

            getOwnerUser: (knex, trx) => {
                return knex('roles')
                    .transacting(trx)
                    .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
                    .where('roles.name', 'Owner')
                    .select('roles_users.user_id');
            },

            getAuthorsPosts: (knex, trx, authorId) => {
                return knex('posts_authors')
                    .transacting(trx)
                    .where('author_id', authorId)
                    .select('post_id', 'sort_order');
            },

            getOwnersPosts: (knex, trx, ownerId) => {
                return knex('posts_authors')
                    .transacting(trx)
                    .where('author_id', ownerId)
                    .select('post_id');
            },

            findPrimaryPostsWithOwnerCoauthor: (authorsPosts, ownersPosts) => {
                const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
                return _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
            },

            findPrimaryPostsWithoutOwnerCoauthor: (authorsPosts, primaryPostsWithOwnerCoauthor) => {
                const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
                return _.differenceBy(authorsPrimaryPosts, primaryPostsWithOwnerCoauthor, 'post_id');
            },

            removeAuthorFromPrimaryPosts: (knex, trx, primaryPostsWithOwnerCoauthor, authorId) => {
                const postIds = primaryPostsWithOwnerCoauthor.map(post => post.post_id);
                return knex('posts_authors')
                    .transacting(trx)
                    .whereIn('post_id', postIds)
                    .where('author_id', authorId)
                    .del();
            },

            makeOwnerPrimaryAuthor: (knex, trx, primaryPostsWithOwnerCoauthor, ownerId) => {
                const postIds = primaryPostsWithOwnerCoauthor.map(post => post.post_id);
                return knex('posts_authors')
                    .transacting(trx)
                    .whereIn('post_id', postIds)
                    .where('author_id', ownerId)
                    .update('sort_order', 0);
            },

            replaceAuthorWithOwner: (knex, trx, primaryPostsWithoutOwnerCoauthor, authorId, ownerId) => {
                const postIds = primaryPostsWithoutOwnerCoauthor.map(post => post.post_id);
                return knex('posts_authors')
                    .transacting(trx)
                    .whereIn('post_id', postIds)
                    .where('author_id', authorId)
                    .update('author_id', ownerId);
            },

            removeAuthorFromSecondaryPosts: (knex, trx, authorId) => {
                return knex('posts_authors')
                    .transacting(trx)
                    .where('author_id', authorId)
                    .del();
            },

            permissible: function(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
                const self = this;
                const {isContributor, isAuthor} = setIsRoles(loadedPermissions);

                if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                    const origArgs = _.toArray(arguments).slice(1);
                    return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                        .then((foundPostModel) => {
                            if (!foundPostModel) {
                                throw new errors.NotFoundError({
                                    message: tpl(messages.postNotFound)
                                });
                            }
                            return self.permissible.apply(self, [foundPostModel].concat(origArgs));
                        });
                }

                const postModel = postModelOrId;
                const isEdit = action === 'edit';
                const isAdd = action === 'add';
                const isDestroy = action === 'destroy';

                const permissionChecker = new PermissionChecker(postModel, context, unsafeAttrs);

                if (isContributor && isEdit) {
                    hasUserPermission = !permissionChecker.isChangingAuthors() && permissionChecker.isCoAuthor();
                } else if (isContributor && isAdd) {
                    hasUserPermission = permissionChecker.isOwner();
                } else if (isContributor && isDestroy) {
                    hasUserPermission = permissionChecker.isPrimaryAuthor();
                } else if (isAuthor && isEdit) {
                    hasUserPermission = permissionChecker.isCoAuthor() && !permissionChecker.isChangingAuthors();
                } else if (isAuthor && isAdd) {
                    hasUserPermission = permissionChecker.isOwner();
                } else if (postModel) {
                    hasUserPermission = hasUserPermission || permissionChecker.isPrimaryAuthor();
                }

                if (hasUserPermission && hasApiKeyPermission) {
                    return this.constructor.permissible.call(
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
                            return {excludedAttrs: ['authors'].concat(excludedAttrs)};
                        }
                        return {excludedAttrs};
                    });
                }

                return Promise.reject(new errors.NoPermissionError({
                    message: tpl(messages.notEnoughPermission)
                }));
            }
        };
    }
}

class PermissionChecker {
    constructor(postModel, context, unsafeAttrs) {
        this.postModel = postModel;
        this.context = context;
        this.unsafeAttrs = unsafeAttrs;
    }

    isChangingAuthors() {
        if (!this.unsafeAttrs.authors) {
            return false;
        }

        if (!this.unsafeAttrs.authors.length) {
            return true;
        }

        return this.unsafeAttrs.authors[0].id !== this.postModel.related('authors').models[0].id;
    }

    isOwner() {
        if (!this.unsafeAttrs.authors) {
            return false;
        }

        return this.unsafeAttrs.authors.length && 
               this.unsafeAttrs.authors[0].id === this.context.user;
    }

    isPrimaryAuthor() {
        return this.context.user === this.postModel.related('authors').models[0].id;
    }

    isCoAuthor() {
        return this.postModel.related('authors').models
            .map(author => author.id)
            .includes(this.context.user);
    }
}

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const extension = new PostModelExtension(Post, Posts, ghostBookshelf);

    const Model = Post.extend(
        extension.getInstanceMethods(),
        extension.getStaticMethods()
    );

    return Model;
};
```