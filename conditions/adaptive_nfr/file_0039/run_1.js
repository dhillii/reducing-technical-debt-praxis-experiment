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
    }

    shouldFetchAuthorsForUpdate(fnName, options) {
        return options.forUpdate &&
            ['onFetching', 'onFetchingCollection'].includes(fnName) &&
            !options.withRelated.includes('authors');
    }

    createHandleOptions(fnName) {
        return (model, attrs, options) => {
            model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

            this.normalizeWithRelated(options);

            if (this.shouldFetchAuthorsForUpdate(fnName, options)) {
                options.withRelated.push('authors');
            }

            return this.proto[fnName].call(this, model, attrs, options);
        };
    }

    async contextUser(options) {
        const user = await this.ghostBookshelf.model('User').getOwnerUser(
            _.pick(options, 'transacting')
        );
        return user.id;
    }

    async matchAuthors(model, options) {
        const ownerUser = await this.ghostBookshelf.model('User').getOwnerUser(
            _.pick(options, 'transacting')
        );

        const authors = model.get('authors');
        const authorsToSet = [];

        await Promise.all(authors.map(async (author, index) => {
            const query = this.buildAuthorQuery(author);
            const user = await this.ghostBookshelf.model('User')
                .where(query)
                .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')));

            const userId = user ? user.id : ownerUser.id;

            if (!_.find(authorsToSet, {id: userId})) {
                authorsToSet[index] = {id: userId};
            }
        }));

        model.set('authors', authorsToSet);
    }

    buildAuthorQuery(author) {
        if (author.id) return {id: author.id};
        if (author.slug) return {slug: author.slug};
        if (author.email) return {email: author.email};
        return {};
    }

    validateAuthors(model) {
        if (model.get('authors') && !model.get('authors').length) {
            throw new errors.ValidationError({
                message: 'At least one author is required.'
            });
        }
    }

    buildSerializeAttrs(attrs, options) {
        if (!this._originalOptions) {
            this._originalOptions = {};
        }

        if (!this._originalOptions.withRelated?.includes('authors')) {
            delete attrs.authors;
        }

        if (!options.columns || options.columns.includes('primary_author')) {
            attrs.primary_author = attrs.authors?.length ? attrs.authors[0] : null;
        }

        return attrs;
    }

    createModel() {
        const self = this;
        const proto = this.proto;
        const ghostBookshelf = this.ghostBookshelf;

        return this.Post.extend({
            _handleOptions(fnName) {
                return self.createHandleOptions(fnName);
            },

            onFetching(model, attrs, options) {
                return this._handleOptions('onFetching')(model, attrs, options);
            },

            onFetchingCollection(collection, attrs, options) {
                return this._handleOptions('onFetchingCollection')(collection, attrs, options);
            },

            onFetchedCollection(collection, attrs, options) {
                _.each(collection.models, (model) => {
                    model._originalOptions = collection._originalOptions;
                });
                return proto.onFetchedCollection.call(this, collection, attrs, options);
            },

            async onCreating(model, attrs, options) {
                if (!model.get('authors')) {
                    model.set('authors', [{
                        id: await self.contextUser(options)
                    }]);
                }
                return this._handleOptions('onCreating')(model, attrs, options);
            },

            onUpdating(model, attrs, options) {
                return this._handleOptions('onUpdating')(model, attrs, options);
            },

            onSaving(model, attrs, options) {
                model.unset('author');
                self.validateAuthors(model);

                const ops = [];

                if (model.get('authors')) {
                    ops.push(() => self.matchAuthors(model, options));
                }

                ops.push(() => proto.onSaving.call(this, model, attrs, options));

                return sequence(ops);
            },

            serialize(options) {
                const attrs = proto.serialize.call(this, options);
                return self.buildSerializeAttrs.call(this, attrs, options);
            },

            matchAuthors(model, options) {
                return self.matchAuthors(model, options);
            }
        }, {
            async reassignByAuthor(unfilteredOptions) {
                const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {
                    extraAllowedProperties: ['id']
                });

                if (!options.id) {
                    throw new errors.NotFoundError({
                        message: tpl(messages.noUserFound)
                    });
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
                        const authorId = options.id;

                        await self.reassignAuthorPosts(knex, trx, authorId, ownerId);
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

            async reassignAuthorPosts(knex, trx, authorId, ownerId) {
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

                const primaryPostsWithoutOwnerCoauthor = _.differenceBy(
                    authorsPrimaryPosts,
                    primaryPostsWithOwnerCoauthor,
                    'post_id'
                );
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
            },

            async permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
                if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                    const foundPostModel = await this.findOne(
                        {id: postModelOrId, status: 'all'},
                        {withRelated: ['authors']}
                    );

                    if (!foundPostModel) {
                        throw new errors.NotFoundError({
                            message: tpl(messages.postNotFound)
                        });
                    }

                    const args = _.toArray(arguments).slice(1);
                    return this.permissible.apply(this, [foundPostModel, ...args]);
                }

                const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
                const permissionChecker = new PermissionChecker(
                    postModelOrId,
                    action,
                    context,
                    unsafeAttrs,
                    isContributor,
                    isAuthor
                );

                hasUserPermission = permissionChecker.check();

                if (hasUserPermission && hasApiKeyPermission) {
                    const result = await this.constructor.permissible.call(
                        this,
                        postModelOrId,
                        action,
                        context,
                        unsafeAttrs,
                        loadedPermissions,
                        hasUserPermission,
                        hasApiKeyPermission
                    );

                    if (isContributor || isAuthor) {
                        result.excludedAttrs = ['authors'].concat(result.excludedAttrs);
                    }

                    return result;
                }

                throw new errors.NoPermissionError({
                    message: tpl(messages.notEnoughPermission)
                });
            }
        });
    }
}

class PermissionChecker {
    constructor(postModel, action, context, unsafeAttrs, isContributor, isAuthor) {
        this.postModel = postModel;
        this.action = action;
        this.context = context;
        this.unsafeAttrs = unsafeAttrs;
        this.isContributor = isContributor;
        this.isAuthor = isAuthor;
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

    check() {
        const isEdit = this.action === 'edit';
        const isAdd = this.action === 'add';
        const isDestroy = this.action === 'destroy';

        if (this.isContributor && isEdit) {
            return !this.isChangingAuthors() && this.isCoAuthor();
        }
        if (this.isContributor && isAdd) {
            return this.isOwner();
        }
        if (this.isContributor && isDestroy) {
            return this.isPrimaryAuthor();
        }
        if (this.isAuthor && isEdit) {
            return this.isCoAuthor() && !this.isChangingAuthors();
        }
        if (this.isAuthor && isAdd) {
            return this.isOwner();
        }
        if (this.postModel) {
            return this.isPrimaryAuthor();
        }
        return false;
    }
}

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const extension = new PostModelExtension(Post, Posts, ghostBookshelf);
    return extension.createModel();
};
```