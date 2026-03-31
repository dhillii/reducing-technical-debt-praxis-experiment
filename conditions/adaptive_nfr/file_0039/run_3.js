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

    async getContextUser(options) {
        return this.ghostBookshelf.model('User').contextUser(options);
    }

    validateAuthors(model) {
        if (model.get('authors') && !model.get('authors').length) {
            throw new errors.ValidationError({
                message: 'At least one author is required.'
            });
        }
    }

    async matchAuthors(model, options) {
        const ownerUser = await this.ghostBookshelf
            .model('User')
            .getOwnerUser(_.pick(options, 'transacting'));

        const authors = model.get('authors');
        const authorsToSet = [];

        await Promise.all(authors.map(async (author, index) => {
            const query = this.buildAuthorQuery(author);
            const user = await this.ghostBookshelf
                .model('User')
                .where(query)
                .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')));

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
        return originalOptions &&
            originalOptions.withRelated &&
            originalOptions.withRelated.includes('authors');
    }

    attachPrimaryAuthor(attrs, options) {
        if (!options.columns || options.columns.includes('primary_author')) {
            attrs.primary_author = attrs.authors?.length ? attrs.authors[0] : null;
        }
    }
}

class PostPermissions {
    constructor(Post, ghostBookshelf) {
        this.Post = Post;
        this.ghostBookshelf = ghostBookshelf;
    }

    async getOwnerUserId(trx) {
        const ownerUser = await this.ghostBookshelf.knex('roles')
            .transacting(trx)
            .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
            .where('roles.name', 'Owner')
            .select('roles_users.user_id');
        return ownerUser[0].user_id;
    }

    async getAuthorsPosts(authorId, trx) {
        return this.ghostBookshelf.knex('posts_authors')
            .transacting(trx)
            .where('author_id', authorId)
            .select('post_id', 'sort_order');
    }

    async getOwnersPosts(ownerId, trx) {
        return this.ghostBookshelf.knex('posts_authors')
            .transacting(trx)
            .where('author_id', ownerId)
            .select('post_id');
    }

    async removeAuthorFromPosts(postIds, authorId, trx) {
        await this.ghostBookshelf.knex('posts_authors')
            .transacting(trx)
            .whereIn('post_id', postIds)
            .where('author_id', authorId)
            .del();
    }

    async updateAuthorSortOrder(postIds, authorId, sortOrder, trx) {
        await this.ghostBookshelf.knex('posts_authors')
            .transacting(trx)
            .whereIn('post_id', postIds)
            .where('author_id', authorId)
            .update('sort_order', sortOrder);
    }

    async replaceAuthor(postIds, oldAuthorId, newAuthorId, trx) {
        await this.ghostBookshelf.knex('posts_authors')
            .transacting(trx)
            .whereIn('post_id', postIds)
            .where('author_id', oldAuthorId)
            .update('author_id', newAuthorId);
    }
}

class PostPermissionChecker {
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

        const currentPrimaryAuthorId = this.postModel.related('authors').models[0]?.id;
        return this.unsafeAttrs.authors[0].id !== currentPrimaryAuthorId;
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
}

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const extension = new PostModelExtension(Post, Posts, ghostBookshelf);
    const proto = extension.proto;

    const Model = Post.extend({
        _handleOptions(fnName) {
            return extension.createHandleOptions(fnName);
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
                const userId = await extension.getContextUser(options);
                model.set('authors', [{id: userId}]);
            }

            return this._handleOptions('onCreating')(model, attrs, options);
        },

        onUpdating(model, attrs, options) {
            return this._handleOptions('onUpdating')(model, attrs, options);
        },

        onSaving(model, attrs, options) {
            model.unset('author');
            extension.validateAuthors(model);

            const ops = [];

            if (model.get('authors')) {
                ops.push(() => extension.matchAuthors(model, options));
            }

            ops.push(() => proto.onSaving.call(this, model, attrs, options));

            return sequence(ops);
        },

        serialize(options) {
            let attrs = proto.serialize.call(this, options);

            this._originalOptions = this._originalOptions || {};

            if (!extension.shouldIncludeAuthorsInSerialization(this._originalOptions)) {
                delete attrs.authors;
            }

            extension.attachPrimaryAuthor(attrs, options);

            return attrs;
        }
    }, {
        async reassignByAuthor(unfilteredOptions) {
            const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
            const authorId = options.id;

            if (!authorId) {
                throw new errors.NotFoundError({message: tpl(messages.noUserFound)});
            }

            const permissions = new PostPermissions(Post, ghostBookshelf);

            const reassignPost = async () => {
                try {
                    const trx = options.transacting;
                    const ownerId = await permissions.getOwnerUserId(trx);
                    const authorsPosts = await permissions.getAuthorsPosts(authorId, trx);
                    const ownersPosts = await permissions.getOwnersPosts(ownerId, trx);

                    const primaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
                    const primaryWithOwner = _.intersectionBy(primaryPosts, ownersPosts, 'post_id');
                    const primaryWithoutOwner = _.differenceBy(primaryPosts, primaryWithOwner, 'post_id');

                    const primaryWithOwnerIds = primaryWithOwner.map(p => p.post_id);
                    const primaryWithoutOwnerIds = primaryWithoutOwner.map(p => p.post_id);

                    await permissions.removeAuthorFromPosts(primaryWithOwnerIds, authorId, trx);
                    await permissions.updateAuthorSortOrder(primaryWithOwnerIds, ownerId, 0, trx);
                    await permissions.replaceAuthor(primaryWithoutOwnerIds, authorId, ownerId, trx);
                    await permissions.removeAuthorFromPosts(null, authorId, trx);
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

        async permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                const foundPostModel = await this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']});

                if (!foundPostModel) {
                    throw new errors.NotFoundError({message: tpl(messages.postNotFound)});
                }

                const origArgs = _.toArray(arguments).slice(1);
                const newArgs = [foundPostModel].concat(origArgs);
                return this.permissible.apply(this, newArgs);
            }

            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
            const checker = new PostPermissionChecker(postModelOrId, context, unsafeAttrs);

            const isEdit = action === 'edit';
            const isAdd = action === 'add';
            const isDestroy = action === 'destroy';

            if (isContributor && isEdit) {
                hasUserPermission = !checker.isChangingAuthors() && checker.isCoAuthor();
            } else if (isContributor && isAdd) {
                hasUserPermission = checker.isOwner();
            } else if (isContributor && isDestroy) {
                hasUserPermission = checker.isPrimaryAuthor();
            } else if (isAuthor && isEdit) {
                hasUserPermission = checker.isCoAuthor() && !checker.isChangingAuthors();
            } else if (isAuthor && isAdd) {
                hasUserPermission = checker.isOwner();
            } else if (postModelOrId) {
                hasUserPermission = hasUserPermission || checker.isPrimaryAuthor();
            }

            if (hasUserPermission && hasApiKeyPermission) {
                const result = await Post.permissible.call(
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
                    return {
                        excludedAttrs: ['authors'].concat(result.excludedAttrs)
                    };
                }

                return result;
            }

            throw new errors.NoPermissionError({message: tpl(messages.notEnoughPermission)});
        }
    });

    return Model;
};
```