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

    validateAuthors(model) {
        if (model.get('authors') && !model.get('authors').length) {
            throw new errors.ValidationError({
                message: 'At least one author is required.'
            });
        }
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
                .fetch({columns: ['id'], ..._.pick(options, 'transacting')});

            const userId = user ? user.id : ownerUser.id;
            const userExists = _.find(authorsToSet, {id: userId});

            if (!userExists) {
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

    shouldIncludeAuthorsInSerialization(originalOptions) {
        return originalOptions?.withRelated?.includes('authors');
    }

    attachPrimaryAuthor(attrs, options) {
        if (!options.columns || options.columns.includes('primary_author')) {
            attrs.primary_author = attrs.authors?.length ? attrs.authors[0] : null;
        }
    }

    buildModel() {
        return this.Post.extend({
            _handleOptions: (fnName) => this.createHandleOptions(fnName),

            onFetching: function(model, attrs, options) {
                return this._handleOptions('onFetching')(model, attrs, options);
            },

            onFetchingCollection: function(collection, attrs, options) {
                return this._handleOptions('onFetchingCollection')(collection, attrs, options);
            },

            onFetchedCollection: (collection, attrs, options) => {
                _.each(collection.models, (model) => {
                    model._originalOptions = collection._originalOptions;
                });
                return this.proto.onFetchedCollection.call(this, collection, attrs, options);
            },

            onCreating: async function(model, attrs, options) {
                if (!model.get('authors')) {
                    const userId = await this.contextUser(options);
                    model.set('authors', [{id: userId}]);
                }
                return this._handleOptions('onCreating')(model, attrs, options);
            },

            onUpdating: function(model, attrs, options) {
                return this._handleOptions('onUpdating')(model, attrs, options);
            },

            onSaving: (model, attrs, options) => {
                model.unset('author');
                this.validateAuthors(model);

                const ops = [];
                if (model.get('authors')) {
                    ops.push(() => this.matchAuthors(model, options));
                }
                ops.push(() => this.proto.onSaving.call(this, model, attrs, options));

                return sequence(ops);
            },

            serialize: (options) => {
                let attrs = this.proto.serialize.call(this, options);

                this._originalOptions = this._originalOptions || {};

                if (!this.shouldIncludeAuthorsInSerialization(this._originalOptions)) {
                    delete attrs.authors;
                }

                this.attachPrimaryAuthor(attrs, options);
                return attrs;
            }
        }, {
            reassignByAuthor: async function(unfilteredOptions) {
                const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {
                    extraAllowedProperties: ['id']
                });

                if (!options.id) {
                    throw new errors.NotFoundError({message: tpl(messages.noUserFound)});
                }

                const reassignPost = async () => {
                    const extension = new PostModelExtension(this, null, this.ghostBookshelf);
                    await extension.performAuthorReassignment(options);
                };

                if (!options.transacting) {
                    return this.ghostBookshelf.transaction((transacting) => {
                        options.transacting = transacting;
                        return reassignPost();
                    });
                }

                return reassignPost();
            },

            permissible: async function(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
                if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                    const foundPostModel = await this.findOne(
                        {id: postModelOrId, status: 'all'},
                        {withRelated: ['authors']}
                    );

                    if (!foundPostModel) {
                        throw new errors.NotFoundError({message: tpl(messages.postNotFound)});
                    }

                    return this.permissible(foundPostModel, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission);
                }

                const extension = new PostModelExtension(this, null, null);
                const permissionChecker = new PermissionChecker(postModelOrId, action, context, unsafeAttrs, loadedPermissions);

                const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
                hasUserPermission = permissionChecker.checkPermissions(isContributor, isAuthor, hasUserPermission);

                if (hasUserPermission && hasApiKeyPermission) {
                    const result = await this.constructor.permissible.call(
                        this, postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission
                    );

                    if (isContributor || isAuthor) {
                        return {excludedAttrs: ['authors'].concat(result.excludedAttrs)};
                    }
                    return result;
                }

                throw new errors.NoPermissionError({message: tpl(messages.notEnoughPermission)});
            }
        });
    }

    async performAuthorReassignment(options) {
        const authorId = options.id;
        const trx = options.transacting;
        const knex = this.ghostBookshelf.knex;

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
}

class PermissionChecker {
    constructor(postModel, action, context, unsafeAttrs, loadedPermissions) {
        this.postModel = postModel;
        this.action = action;
        this.context = context;
        this.unsafeAttrs = unsafeAttrs;
        this.isEdit = action === 'edit';
        this.isAdd = action === 'add';
        this.isDestroy = action === 'destroy';
    }

    isChangingAuthors() {
        if (!this.unsafeAttrs.authors) return false;
        if (!this.unsafeAttrs.authors.length) return true;
        return this.unsafeAttrs.authors[0].id !== this.postModel.related('authors').models[0].id;
    }

    isOwner() {
        return this.unsafeAttrs.authors?.length && 
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

    checkPermissions(isContributor, isAuthor, hasUserPermission) {
        if (isContributor && this.isEdit) {
            return !this.isChangingAuthors() && this.isCoAuthor();
        }
        if (isContributor && this.isAdd) {
            return this.isOwner();
        }
        if (isContributor && this.isDestroy) {
            return this.isPrimaryAuthor();
        }
        if (isAuthor && this.isEdit) {
            return this.isCoAuthor() && !this.isChangingAuthors();
        }
        if (isAuthor && this.isAdd) {
            return this.isOwner();
        }
        if (this.postModel) {
            return hasUserPermission || this.isPrimaryAuthor();
        }
        return hasUserPermission;
    }
}

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const extension = new PostModelExtension(Post, Posts, ghostBookshelf);
    return extension.buildModel();
};
```