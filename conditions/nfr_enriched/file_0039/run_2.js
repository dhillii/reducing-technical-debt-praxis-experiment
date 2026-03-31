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

    onFetching(model, attrs, options) {
        return this.handleOptions('onFetching')(model, attrs, options);
    }

    onFetchingCollection(collection, attrs, options) {
        return this.handleOptions('onFetchingCollection')(collection, attrs, options);
    }

    onFetchedCollection(collection, attrs, options) {
        _.each(collection.models, (model) => {
            model._originalOptions = collection._originalOptions;
        });

        return this.proto.onFetchedCollection.call(this, collection, attrs, options);
    }

    async onCreating(model, attrs, options) {
        if (!model.get('authors')) {
            model.set('authors', [{
                id: await this.contextUser(options)
            }]);
        }

        return this.handleOptions('onCreating')(model, attrs, options);
    }

    onUpdating(model, attrs, options) {
        return this.handleOptions('onUpdating')(model, attrs, options);
    }

    validateAuthors(model) {
        model.unset('author');

        if (model.get('authors') && !model.get('authors').length) {
            throw new errors.ValidationError({
                message: 'At least one author is required.'
            });
        }
    }

    onSaving(model, attrs, options) {
        const ops = [];

        this.validateAuthors(model);

        if (model.get('authors')) {
            ops.push(() => this.matchAuthors(model, options));
        }

        ops.push(() => this.proto.onSaving.call(this, model, attrs, options));

        return sequence(ops);
    }

    serializeAuthors(attrs, options) {
        if (!this._originalOptions) {
            this._originalOptions = {};
        }

        const shouldIncludeAuthors = this._originalOptions?.withRelated?.includes('authors');
        if (!shouldIncludeAuthors) {
            delete attrs.authors;
        }

        return attrs;
    }

    serializePrimaryAuthor(attrs, options) {
        const shouldIncludePrimaryAuthor = !options.columns || options.columns.includes('primary_author');

        if (shouldIncludePrimaryAuthor) {
            attrs.primary_author = attrs.authors?.length ? attrs.authors[0] : null;
        }

        return attrs;
    }

    serialize(options) {
        let attrs = this.proto.serialize.call(this, options);

        attrs = this.serializeAuthors(attrs, options);
        attrs = this.serializePrimaryAuthor(attrs, options);

        return attrs;
    }

    async fetchOwnerUser(options) {
        return this.ghostBookshelf
            .model('User')
            .getOwnerUser(_.pick(options, 'transacting'));
    }

    async findAuthorByIdentifier(author, ownerUser, options) {
        const query = this.buildAuthorQuery(author);

        const user = await this.ghostBookshelf
            .model('User')
            .where(query)
            .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')));

        return user ? user.id : ownerUser.id;
    }

    buildAuthorQuery(author) {
        if (author.id) return {id: author.id};
        if (author.slug) return {slug: author.slug};
        if (author.email) return {email: author.email};
        return {};
    }

    async matchAuthors(model, options) {
        const ownerUser = await this.fetchOwnerUser(options);
        const authors = model.get('authors');
        const authorsToSet = [];

        await Promise.all(authors.map(async (author, index) => {
            const userId = await this.findAuthorByIdentifier(author, ownerUser, options);
            const userExists = _.find(authorsToSet, {id: userId});

            if (!userExists) {
                authorsToSet[index] = {id: userId};
            }
        }));

        model.set('authors', authorsToSet);
    }
}

class PostPermissions {
    constructor(ghostBookshelf) {
        this.ghostBookshelf = ghostBookshelf;
    }

    async reassignByAuthor(unfilteredOptions) {
        const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
        const authorId = options.id;

        if (!authorId) {
            return Promise.reject(new errors.NotFoundError({
                message: tpl(messages.noUserFound)
            }));
        }

        const reassignPost = async () => {
            const trx = options.transacting;
            const knex = this.ghostBookshelf.knex;

            try {
                const ownerId = await this.getOwnerId(knex, trx);
                const authorsPosts = await this.getAuthorsPosts(knex, trx, authorId);
                const ownersPosts = await this.getOwnersPosts(knex, trx, ownerId);

                await this.reassignPrimaryPosts(knex, trx, authorId, ownerId, authorsPosts, ownersPosts);
                await this.reassignSecondaryPosts(knex, trx, authorId, ownerId, authorsPosts, ownersPosts);
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
            .where('roles.name', 'Owner')
            .select('roles_users.user_id');
        return ownerUser[0].user_id;
    }

    async getAuthorsPosts(knex, trx, authorId) {
        return knex('posts_authors')
            .transacting(trx)
            .where('author_id', authorId)
            .select('post_id', 'sort_order');
    }

    async getOwnersPosts(knex, trx, ownerId) {
        return knex('posts_authors')
            .transacting(trx)
            .where('author_id', ownerId)
            .select('post_id');
    }

    async reassignPrimaryPosts(knex, trx, authorId, ownerId, authorsPosts, ownersPosts) {
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

    async reassignSecondaryPosts(knex, trx, authorId, ownerId, authorsPosts, ownersPosts) {
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
}

class PostPermissionChecker {
    constructor(Post, context, postModel, unsafeAttrs) {
        this.Post = Post;
        this.context = context;
        this.postModel = postModel;
        this.unsafeAttrs = unsafeAttrs;
    }

    isChangingAuthors() {
        if (!this.unsafeAttrs.authors) {
            return false;
        }

        if (!this.unsafeAttrs.authors.length) {
            return true;
        }

        const currentAuthorId = this.postModel.related('authors').models[0]?.id;
        return this.unsafeAttrs.authors[0].id !== currentAuthorId;
    }

    isOwner() {
        if (!this.unsafeAttrs.authors?.length) {
            return false;
        }

        return this.unsafeAttrs.authors[0].id === this.context.user;
    }

    isPrimaryAuthor() {
        const primaryAuthorId = this.postModel.related('authors').models[0]?.id;
        return this.context.user === primaryAuthorId;
    }

    isCoAuthor() {
        const authorIds = this.postModel.related('authors').models.map(author => author.id);
        return authorIds.includes(this.context.user);
    }

    checkPermission(action, isContributor, isAuthor) {
        if (isContributor && action === 'edit') {
            return !this.isChangingAuthors() && this.isCoAuthor();
        }
        if (isContributor && action === 'add') {
            return this.isOwner();
        }
        if (isContributor && action === 'destroy') {
            return this.isPrimaryAuthor();
        }
        if (isAuthor && action === 'edit') {
            return this.isCoAuthor() && !this.isChangingAuthors();
        }
        if (isAuthor && action === 'add') {
            return this.isOwner();
        }
        return this.isPrimaryAuthor();
    }
}

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const extension = new PostModelExtension(Post, Posts, ghostBookshelf);
    const permissions = new PostPermissions(ghostBookshelf);

    const Model = Post.extend({
        onFetching(model, attrs, options) {
            return extension.onFetching.call(extension, model, attrs, options);
        },

        onFetchingCollection(collection, attrs, options) {
            return extension.onFetchingCollection.call(extension, collection, attrs, options);
        },

        onFetchedCollection(collection, attrs, options) {
            return extension.onFetchedCollection.call(extension, collection, attrs, options);
        },

        onCreating(model, attrs, options) {
            return extension.onCreating.call(extension, model, attrs, options);
        },

        onUpdating(model, attrs, options) {
            return extension.onUpdating.call(extension, model, attrs, options);
        },

        onSaving(model, attrs, options) {
            return extension.onSaving.call(extension, model, attrs, options);
        },

        serialize(options) {
            return extension.serialize.call(this, options);
        },

        matchAuthors(model, options) {
            return extension.matchAuthors.call(extension, model, options);
        }
    }, {
        reassignByAuthor(unfilteredOptions) {
            return permissions.reassignByAuthor.call(permissions, unfilteredOptions);
        },

        permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
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

                        const newArgs = [foundPostModel].concat(origArgs);
                        return self.permissible.apply(self, newArgs);
                    });
            }

            const checker = new PostPermissionChecker(Post, context, postModelOrId, unsafeAttrs);
            const userHasPermission = checker.checkPermission(action, isContributor, isAuthor);
            hasUserPermission = hasUserPermission || userHasPermission;

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

            return Promise.reject(new