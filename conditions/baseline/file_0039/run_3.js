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

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    // -------------------------------------------------------------------------
    // Helper utilities
    // -------------------------------------------------------------------------

    function normalizeWithRelated(options) {
        if (!options.withRelated) {
            options.withRelated = [];
        }

        const authorIndex = options.withRelated.indexOf('author');
        if (authorIndex !== -1) {
            options.withRelated.splice(authorIndex, 1);
            options.withRelated.push('authors');
        }
    }

    function shouldFetchAuthorsForUpdate(fnName, options) {
        const updateHooks = ['onFetching', 'onFetchingCollection'];
        return options.forUpdate &&
            updateHooks.includes(fnName) &&
            !options.withRelated.includes('authors');
    }

    function buildAuthorQuery(author) {
        if (author.id) return {id: author.id};
        if (author.slug) return {slug: author.slug};
        if (author.email) return {email: author.email};
        return {};
    }

    async function resolveAuthor(author, ownerUser, authorsToSet, index, options) {
        const query = buildAuthorQuery(author);
        const user = await ghostBookshelf
            .model('User')
            .where(query)
            .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')));

        const userId = user ? user.id : ownerUser.id;
        const alreadyAdded = _.find(authorsToSet, {id: userId});

        if (!alreadyAdded) {
            authorsToSet[index] = {id: userId};
        }
    }

    async function getOwnerUser(options) {
        return ghostBookshelf
            .model('User')
            .getOwnerUser(Object.assign({}, _.pick(options, 'transacting')));
    }

    // -------------------------------------------------------------------------
    // Reassign helpers
    // -------------------------------------------------------------------------

    async function getOwnerId(knex, trx) {
        const ownerUser = await knex('roles')
            .transacting(trx)
            .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
            .where('roles.name', 'Owner')
            .select('roles_users.user_id');
        return ownerUser[0].user_id;
    }

    async function getAuthorPosts(knex, trx, authorId) {
        return knex('posts_authors')
            .transacting(trx)
            .where('author_id', authorId)
            .select('post_id', 'sort_order');
    }

    async function getOwnerPostIds(knex, trx, ownerId) {
        return knex('posts_authors')
            .transacting(trx)
            .where('author_id', ownerId)
            .select('post_id');
    }

    async function promoteOwnerAsPrimaryAuthor(knex, trx, postIds, authorId, ownerId) {
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

    async function swapAuthorWithOwner(knex, trx, postIds, authorId, ownerId) {
        await knex('posts_authors')
            .transacting(trx)
            .whereIn('post_id', postIds)
            .where('author_id', authorId)
            .update('author_id', ownerId);
    }

    async function removeAuthorFromAllPosts(knex, trx, authorId) {
        await knex('posts_authors')
            .transacting(trx)
            .where('author_id', authorId)
            .del();
    }

    async function performReassign(knex, trx, authorId) {
        const ownerId = await getOwnerId(knex, trx);
        const authorsPosts = await getAuthorPosts(knex, trx, authorId);
        const ownersPosts = await getOwnerPostIds(knex, trx, ownerId);

        const primaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
        const postsWithOwnerCoauthor = _.intersectionBy(primaryPosts, ownersPosts, 'post_id');
        const postsWithOwnerCoauthorIds = postsWithOwnerCoauthor.map(p => p.post_id);

        await promoteOwnerAsPrimaryAuthor(knex, trx, postsWithOwnerCoauthorIds, authorId, ownerId);

        const postsWithoutOwnerCoauthor = _.differenceBy(primaryPosts, postsWithOwnerCoauthor, 'post_id');
        const postsWithoutOwnerCoauthorIds = postsWithoutOwnerCoauthor.map(p => p.post_id);

        await swapAuthorWithOwner(knex, trx, postsWithoutOwnerCoauthorIds, authorId, ownerId);
        await removeAuthorFromAllPosts(knex, trx, authorId);
    }

    // -------------------------------------------------------------------------
    // Permissible helpers
    // -------------------------------------------------------------------------

    function isChangingAuthors(unsafeAttrs, postModel) {
        if (!unsafeAttrs.authors) return false;
        if (!unsafeAttrs.authors.length) return true;
        return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
    }

    function isOwner(unsafeAttrs, context) {
        if (!unsafeAttrs.authors || !unsafeAttrs.authors.length) return false;
        return unsafeAttrs.authors[0].id === context.user;
    }

    function isPrimaryAuthor(postModel, context) {
        return context.user === postModel.related('authors').models[0].id;
    }

    function isCoAuthor(postModel, context) {
        return postModel.related('authors').models.map(a => a.id).includes(context.user);
    }

    function resolveUserPermission({isContributor, isAuthor, isEdit, isAdd, isDestroy, postModel, unsafeAttrs, context, hasUserPermission}) {
        if (isContributor && isEdit) {
            return !isChangingAuthors(unsafeAttrs, postModel) && isCoAuthor(postModel, context);
        }
        if (isContributor && isAdd) {
            return isOwner(unsafeAttrs, context);
        }
        if (isContributor && isDestroy) {
            return isPrimaryAuthor(postModel, context);
        }
        if (isAuthor && isEdit) {
            return isCoAuthor(postModel, context) && !isChangingAuthors(unsafeAttrs, postModel);
        }
        if (isAuthor && isAdd) {
            return isOwner(unsafeAttrs, context);
        }
        if (postModel) {
            return hasUserPermission || isPrimaryAuthor(postModel, context);
        }
        return hasUserPermission;
    }

    // -------------------------------------------------------------------------
    // Model definition
    // -------------------------------------------------------------------------

    const Model = Post.extend({
        _handleOptions: function _handleOptions(fnName) {
            const self = this;

            return function innerHandleOptions(model, attrs, options) {
                model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

                normalizeWithRelated(options);

                if (shouldFetchAuthorsForUpdate(fnName, options)) {
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

        onFetchedCollection: function onFetchedCollection(collection, attrs, options) {
            _.each(collection.models, (model) => {
                model._originalOptions = collection._originalOptions;
            });
            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        onCreating: async function onCreating(model, attrs, options) {
            if (!model.get('authors')) {
                model.set('authors', [{id: await this.contextUser(options)}]);
            }
            return this._handleOptions('onCreating')(model, attrs, options);
        },

        onUpdating: function onUpdating(model, attrs, options) {
            return this._handleOptions('onUpdating')(model, attrs, options);
        },

        onSaving: function onSaving(model, attrs, options) {
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

            ops.push(() => proto.onSaving.call(this, model, attrs, options));

            return sequence(ops);
        },

        serialize: function serialize(options) {
            const attrs = proto.serialize.call(this, options);
            const originalOptions = this._originalOptions || {};
            const requestedAuthors = originalOptions.withRelated && originalOptions.withRelated.includes('authors');

            if (!requestedAuthors) {
                delete attrs.authors;
            }

            const includesPrimaryAuthor = !options.columns || options.columns.includes('primary_author');
            if (includesPrimaryAuthor) {
                attrs.primary_author = (attrs.authors && attrs.authors.length) ? attrs.authors[0] : null;
            }

            return attrs;
        },

        matchAuthors: async function matchAuthors(model, options) {
            const ownerUser = await getOwnerUser(options);
            const authors = model.get('authors');
            const authorsToSet = [];

            await Promise.all(
                authors.map((author, index) =>
                    resolveAuthor(author, ownerUser, authorsToSet, index, options)
                )
            );

            model.set('authors', authorsToSet);
        }
    }, {
        reassignByAuthor: async function reassignByAuthor(unfilteredOptions) {
            const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
            const authorId = options.id;

            if (!authorId) {
                return Promise.reject(new errors.NotFoundError({
                    message: tpl(messages.noUserFound)
                }));
            }

            const runReassign = async () => {
                try {
                    await performReassign(ghostBookshelf.knex, options.transacting, authorId);
                } catch (err) {
                    throw new errors.InternalServerError({err});
                }
            };

            if (!options.transacting) {
                return ghostBookshelf.transaction((transacting) => {
                    options.transacting = transacting;
                    return runReassign();
                });
            }

            return runReassign();
        },

        permissible: function permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);

            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                const origArgs = _.toArray(arguments).slice(1);
                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then((foundPostModel) => {
                        if (!foundPostModel) {
                            throw new errors.NotFoundError({message: tpl(messages.postNotFound)});
                        }
                        return self.permissible.apply(self, [foundPostModel].concat(origArgs));
                    });
            }

            const postModel = postModelOrId;
            const isEdit = action === 'edit';
            const isAdd = action === 'add';
            const isDestroy = action === 'destroy';

            hasUserPermission = resolveUserPermission({
                isContributor,
                isAuthor,
                isEdit,
                isAdd,
                isDestroy,
                postModel,
                unsafeAttrs,
                context,
                hasUserPermission
            });

            if (!hasUserPermission || !hasApiKeyPermission) {
                return Promise.reject(new errors.NoPermissionError({
                    message: tpl(messages.notEnoughPermission)
                }));
            }

            return Post.permissible.call(
                this, postModelOrId, action, context,
                unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission
            ).then(({excludedAttrs}) => {
                if (isContributor || isAuthor) {
                    return {excludedAttrs: ['authors'].concat(excludedAttrs)};
                }
                return {excludedAttrs};
            });
        }
    });

    return Model;
};
```