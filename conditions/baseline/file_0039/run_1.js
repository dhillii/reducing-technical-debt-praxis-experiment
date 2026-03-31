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

const OWNER_ROLE = 'Owner';
const AUTHOR_RELATION = 'authors';
const LEGACY_AUTHOR_RELATION = 'author';

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

        const authorIndex = options.withRelated.indexOf(LEGACY_AUTHOR_RELATION);
        if (authorIndex !== -1) {
            options.withRelated.splice(authorIndex, 1);
            options.withRelated.push(AUTHOR_RELATION);
        }

        return options;
    }

    shouldFetchAuthorsForUpdate(options, fnName) {
        const fetchingFunctions = ['onFetching', 'onFetchingCollection'];
        return options.forUpdate &&
            fetchingFunctions.includes(fnName) &&
            !options.withRelated.includes(AUTHOR_RELATION);
    }

    handleOptions(fnName) {
        return (model, attrs, options) => {
            model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

            this.normalizeWithRelated(options);

            if (this.shouldFetchAuthorsForUpdate(options, fnName)) {
                options.withRelated.push(AUTHOR_RELATION);
            }

            return this.proto[fnName].call(this, model, attrs, options);
        };
    }

    async validateAuthors(model) {
        if (model.get(AUTHOR_RELATION) && !model.get(AUTHOR_RELATION).length) {
            throw new errors.ValidationError({
                message: 'At least one author is required.'
            });
        }
    }

    async matchAuthors(model, options) {
        const ownerUser = await this.ghostBookshelf
            .model('User')
            .getOwnerUser(_.pick(options, 'transacting'));

        const authors = model.get(AUTHOR_RELATION);
        const authorsToSet = [];

        await Promise.all(authors.map(async (author, index) => {
            const query = this.buildAuthorQuery(author);
            const user = await this.ghostBookshelf
                .model('User')
                .where(query)
                .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')));

            const userId = user ? user.id : ownerUser.id;

            if (!_.find(authorsToSet, {id: userId})) {
                authorsToSet[index] = {id: userId};
            }
        }));

        model.set(AUTHOR_RELATION, authorsToSet);
    }

    buildAuthorQuery(author) {
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

    getModel() {
        const self = this;

        return this.Post.extend({
            _handleOptions: function(fnName) {
                return self.handleOptions(fnName);
            },

            onFetching: function(model, attrs, options) {
                return this._handleOptions('onFetching')(model, attrs, options);
            },

            onFetchingCollection: function(collection, attrs, options) {
                return this._handleOptions('onFetchingCollection')(collection, attrs, options);
            },

            onFetchedCollection: function(collection, attrs, options) {
                _.each(collection.models, (model) => {
                    model._originalOptions = collection._originalOptions;
                });

                return self.proto.onFetchedCollection.call(this, collection, attrs, options);
            },

            onCreating: async function(model, attrs, options) {
                if (!model.get(AUTHOR_RELATION)) {
                    model.set(AUTHOR_RELATION, [{
                        id: await this.contextUser(options)
                    }]);
                }

                return this._handleOptions('onCreating')(model, attrs, options);
            },

            onUpdating: function(model, attrs, options) {
                return this._handleOptions('onUpdating')(model, attrs, options);
            },

            onSaving: async function(model, attrs, options) {
                model.unset('author');

                await self.validateAuthors(model);

                if (model.get(AUTHOR_RELATION)) {
                    await self.matchAuthors(model, options);
                }

                return self.proto.onSaving.call(this, model, attrs, options);
            },

            serialize: function(options) {
                let attrs = self.proto.serialize.call(this, options);

                if (!this._originalOptions) {
                    this._originalOptions = {};
                }

                const shouldIncludeAuthors = this._originalOptions?.withRelated?.includes(AUTHOR_RELATION);
                if (!shouldIncludeAuthors) {
                    delete attrs[AUTHOR_RELATION];
                }

                if (!options.columns || options.columns.includes('primary_author')) {
                    attrs.primary_author = attrs[AUTHOR_RELATION]?.length ? attrs[AUTHOR_RELATION][0] : null;
                }

                return attrs;
            },

            matchAuthors(model, options) {
                return self.matchAuthors(model, options);
            }
        }, {
            reassignByAuthor: async function(unfilteredOptions) {
                const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
                const authorId = options.id;

                if (!authorId) {
                    throw new errors.NotFoundError({
                        message: tpl(messages.noUserFound)
                    });
                }

                const reassignPost = async () => {
                    const trx = options.transacting;
                    const knex = self.ghostBookshelf.knex;

                    try {
                        const ownerId = await self.getOwnerId(knex, trx);
                        const authorsPosts = await self.getAuthorPosts(knex, trx, authorId);
                        const ownersPosts = await self.getAuthorPosts(knex, trx, ownerId);

                        await self.reassignPrimaryPosts(knex, trx, authorId, ownerId, authorsPosts, ownersPosts);
                        await self.reassignSecondaryPosts(knex, trx, authorId, ownerId, authorsPosts, ownersPosts);
                    } catch (err) {
                        throw new errors.InternalServerError({err});
                    }
                };

                if (!options.transacting) {
                    return self.ghostBookshelf.transaction((transacting) => {
                        options.transacting = transacting;
                        return reassignPost();
                    });
                }

                return reassignPost();
            },

            permissible: async function(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
                const self = this;

                if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                    const origArgs = _.toArray(arguments).slice(1);
                    const foundPostModel = await this.findOne({id: postModelOrId, status: 'all'}, {withRelated: [AUTHOR_RELATION]});

                    if (!foundPostModel) {
                        throw new errors.NotFoundError({
                            message: tpl(messages.postNotFound)
                        });
                    }

                    return self.permissible.apply(self, [foundPostModel].concat(origArgs));
                }

                const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
                const permissionChecker = new PermissionChecker(postModelOrId, action, context, unsafeAttrs, isContributor, isAuthor);

                hasUserPermission = permissionChecker.checkPermission();

                if (hasUserPermission && hasApiKeyPermission) {
                    const result = await self.Post.permissible.call(
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
                        result.excludedAttrs = [AUTHOR_RELATION].concat(result.excludedAttrs);
                    }

                    return result;
                }

                throw new errors.NoPermissionError({
                    message: tpl(messages.notEnoughPermission)
                });
            }
        });
    }

    async getOwnerId(knex, trx) {
        const ownerUser = await knex('roles')
            .transacting(trx)
            .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
            .where('roles.name', OWNER_ROLE)
            .select('roles_users.user_id');

        return ownerUser[0].user_id;
    }

    async getAuthorPosts(knex, trx, authorId) {
        return knex('posts_authors')
            .transacting(trx)
            .where('author_id', authorId)
            .select('post_id', 'sort_order');
    }

    async reassignPrimaryPosts(knex, trx, authorId, ownerId, authorsPosts, ownersPosts) {
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
    }

    async reassignSecondaryPosts(knex, trx, authorId, ownerId, authorsPosts, ownersPosts) {
        const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
        const primaryPostsWithOwnerCoauthor = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
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
        if (!this.unsafeAttrs[AUTHOR_RELATION]) {
            return false;
        }

        if (!this.unsafeAttrs[AUTHOR_RELATION].length) {
            return true;
        }

        return this.unsafeAttrs[AUTHOR_RELATION][0].id !== this.postModel.related(AUTHOR_RELATION).models[0].id;
    }

    isOwner() {
        if (!this.unsafeAttrs[AUTHOR_RELATION]) {
            return false;
        }

        return this.unsafeAttrs[AUTHOR_RELATION].length && 
               this.unsafeAttrs[AUTHOR_RELATION][0].id === this.context.user;
    }

    isPrimaryAuthor() {
        return this.context.user === this.postModel.related(AUTHOR_RELATION).models[0].id;
    }

    isCoAuthor() {
        return this.postModel.related(AUTHOR_RELATION).models
            .map(author => author.id)
            .includes(this.context.user);
    }

    checkPermission() {
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
    return extension.getModel();
};
```