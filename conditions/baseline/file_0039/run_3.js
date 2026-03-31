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

    createModel() {
        const self = this;
        const proto = this.proto;

        return this.Post.extend({
            onFetching(model, attrs, options) {
                return self.handleOptions('onFetching')(model, attrs, options);
            },

            onFetchingCollection(collection, attrs, options) {
                return self.handleOptions('onFetchingCollection')(collection, attrs, options);
            },

            onFetchedCollection(collection, attrs, options) {
                _.each(collection.models, (model) => {
                    model._originalOptions = collection._originalOptions;
                });

                return proto.onFetchedCollection.call(this, collection, attrs, options);
            },

            async onCreating(model, attrs, options) {
                if (!model.get(AUTHOR_RELATION)) {
                    model.set(AUTHOR_RELATION, [{
                        id: await this.contextUser(options)
                    }]);
                }

                return self.handleOptions('onCreating')(model, attrs, options);
            },

            onUpdating(model, attrs, options) {
                return self.handleOptions('onUpdating')(model, attrs, options);
            },

            onSaving(model, attrs, options) {
                model.unset('author');

                if (model.get(AUTHOR_RELATION) && !model.get(AUTHOR_RELATION).length) {
                    throw new errors.ValidationError({
                        message: 'At least one author is required.'
                    });
                }

                const ops = [];

                if (model.get(AUTHOR_RELATION)) {
                    ops.push(() => self.matchAuthors(model, options));
                }

                ops.push(() => proto.onSaving.call(this, model, attrs, options));

                return sequence(ops);
            },

            serialize(options) {
                let attrs = proto.serialize.call(this, options);

                if (!this._originalOptions) {
                    this._originalOptions = {};
                }

                const shouldExcludeAuthors = !this._originalOptions?.withRelated?.includes(AUTHOR_RELATION);
                if (shouldExcludeAuthors) {
                    delete attrs.authors;
                }

                if (!options.columns || options.columns.includes('primary_author')) {
                    attrs.primary_author = attrs.authors?.length ? attrs.authors[0] : null;
                }

                return attrs;
            },

            matchAuthors(model, options) {
                return self.matchAuthors(model, options);
            }
        }, {
            reassignByAuthor: async function reassignByAuthor(unfilteredOptions) {
                return self.reassignByAuthor.call(this, unfilteredOptions);
            },

            permissible: function permissible(...args) {
                return self.permissible.call(this, ...args);
            }
        });
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
                .fetch({columns: ['id'], ..._.pick(options, 'transacting')});

            const userId = user?.id || ownerUser.id;
            const userExists = _.find(authorsToSet, {id: userId});

            if (!userExists) {
                authorsToSet[index] = {id: userId};
            }
        }));

        model.set(AUTHOR_RELATION, authorsToSet);
    }

    buildAuthorQuery(author) {
        if (author.id) return {id: author.id};
        if (author.slug) return {slug: author.slug};
        if (author.email) return {email: author.email};
        return {};
    }

    async reassignByAuthor(unfilteredOptions) {
        const options = this.Post.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
        const authorId = options.id;

        if (!authorId) {
            throw new errors.NotFoundError({message: tpl(messages.noUserFound)});
        }

        const reassignPost = async () => {
            const trx = options.transacting;
            const knex = this.ghostBookshelf.knex;

            try {
                const ownerId = await this.getOwnerId(knex, trx);
                const authorsPosts = await this.getAuthorsPosts(knex, trx, authorId);
                const ownersPosts = await this.getAuthorsPosts(knex, trx, ownerId);

                await this.reassignPrimaryPosts(knex, trx, authorsPosts, ownersPosts, authorId, ownerId);
                await this.reassignSecondaryPosts(knex, trx, authorsPosts, ownersPosts, authorId, ownerId);
                await this.removeAuthorFromOtherPosts(knex, trx, authorId);
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
    }

    async getOwnerId(knex, trx) {
        const ownerUser = await knex('roles')
            .transacting(trx)
            .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
            .where('roles.name', OWNER_ROLE)
            .select('roles_users.user_id');
        return ownerUser[0].user_id;
    }

    async getAuthorsPosts(knex, trx, authorId) {
        return knex('posts_authors')
            .transacting(trx)
            .where('author_id', authorId)
            .select('post_id', 'sort_order');
    }

    async reassignPrimaryPosts(knex, trx, authorsPosts, ownersPosts, authorId, ownerId) {
        const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
        const primaryPostsWithOwnerCoauthor = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
        const postIds = primaryPostsWithOwnerCoauthor.map(post => post.post_id);

        if (postIds.length === 0) return;

        await knex('posts_authors')
            .transacting(trx)
            .whereIn('post_id', postIds)
            .where('author_id', authorId)
            .del();

        await knex('posts_authors')
            .transacting(trx)
            .whereIn('post_id', postIds)
            .where('author_id', ownerId)
            .update('sort_order', 0);
    }

    async reassignSecondaryPosts(knex, trx, authorsPosts, ownersPosts, authorId, ownerId) {
        const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
        const primaryPostsWithOwnerCoauthor = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
        const primaryPostsWithoutOwnerCoauthor = _.differenceBy(authorsPrimaryPosts, primaryPostsWithOwnerCoauthor, 'post_id');
        const postIds = primaryPostsWithoutOwnerCoauthor.map(post => post.post_id);

        if (postIds.length === 0) return;

        await knex('posts_authors')
            .transacting(trx)
            .whereIn('post_id', postIds)
            .where('author_id', authorId)
            .update('author_id', ownerId);
    }

    async removeAuthorFromOtherPosts(knex, trx, authorId) {
        await knex('posts_authors')
            .transacting(trx)
            .where('author_id', authorId)
            .del();
    }

    permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
        if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
            return this.handlePostIdPermissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission);
        }

        return this.handlePostModelPermissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission);
    }

    handlePostIdPermissible(postId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
        const origArgs = _.toArray(arguments).slice(1);

        return this.Post.findOne({id: postId, status: 'all'}, {withRelated: [AUTHOR_RELATION]})
            .then((foundPostModel) => {
                if (!foundPostModel) {
                    throw new errors.NotFoundError({message: tpl(messages.postNotFound)});
                }

                const newArgs = [foundPostModel].concat(origArgs);
                return this.permissible.apply(this, newArgs);
            });
    }

    handlePostModelPermissible(postModel, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
        const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
        const permissionChecks = new PermissionChecks(postModel, context, unsafeAttrs);

        hasUserPermission = this.evaluateUserPermission(action, isContributor, isAuthor, permissionChecks, hasUserPermission);

        if (hasUserPermission && hasApiKeyPermission) {
            return this.Post.permissible.call(
                this,
                postModel,
                action,
                context,
                unsafeAttrs,
                loadedPermissions,
                hasUserPermission,
                hasApiKeyPermission
            ).then(({excludedAttrs}) => {
                if (isContributor || isAuthor) {
                    return {excludedAttrs: [AUTHOR_RELATION].concat(excludedAttrs)};
                }
                return {excludedAttrs};
            });
        }

        return Promise.reject(new errors.NoPermissionError({
            message: tpl(messages.notEnoughPermission)
        }));
    }

    evaluateUserPermission(action, isContributor, isAuthor, checks, hasUserPermission) {
        if (isContributor && action === 'edit') {
            return !checks.isChangingAuthors() && checks.isCoAuthor();
        }
        if (isContributor && action === 'add') {
            return checks.isOwner();
        }
        if (isContributor && action === 'destroy') {
            return checks.isPrimaryAuthor();
        }
        if (isAuthor && action === 'edit') {
            return checks.isCoAuthor() && !checks.isChangingAuthors();
        }
        if (isAuthor && action === 'add') {
            return checks.isOwner();
        }
        return hasUserPermission || checks.isPrimaryAuthor();
    }
}

class PermissionChecks {
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

        return this.unsafeAttrs.authors[0].id !== this.postModel.related(AUTHOR_RELATION).models[0].id;
    }

    isOwner() {
        if (!this.unsafeAttrs.authors) {
            return false;
        }

        return this.unsafeAttrs.authors.length && this.unsafeAttrs.authors[0].id === this.context.user;
    }

    isPrimaryAuthor() {
        return this.context.user === this.postModel.related(AUTHOR_RELATION).models[0].id;
    }

    isCoAuthor() {
        const authorIds = this.postModel.related(AUTHOR_RELATION).models.map(author => author.id);
        return authorIds.includes(this.context.user);
    }
}

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const extension = new PostModelExtension(Post, Posts, ghostBookshelf);
    return extension.createModel();
};
```