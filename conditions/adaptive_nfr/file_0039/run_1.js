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

    // --- Helpers ---

    function normalizeWithRelated(options) {
        if (!options.withRelated) {
            options.withRelated = [];
        }

        const authorIdx = options.withRelated.indexOf('author');
        if (authorIdx !== -1) {
            options.withRelated.splice(authorIdx, 1);
            options.withRelated.push('authors');
        }
    }

    function shouldForceAuthors(fnName, options) {
        return (
            options.forUpdate &&
            ['onFetching', 'onFetchingCollection'].includes(fnName) &&
            !options.withRelated.includes('authors')
        );
    }

    function buildAuthorQuery(author) {
        if (author.id) return {id: author.id};
        if (author.slug) return {slug: author.slug};
        if (author.email) return {email: author.email};
        return {};
    }

    function pickTransacting(options) {
        return _.pick(options, 'transacting');
    }

    async function fetchOwnerUserId(knex, trx) {
        const ownerUser = await knex('roles')
            .transacting(trx)
            .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
            .where('roles.name', 'Owner')
            .select('roles_users.user_id');
        return ownerUser[0].user_id;
    }

    async function fetchAuthorPosts(knex, trx, authorId) {
        return knex('posts_authors')
            .transacting(trx)
            .where('author_id', authorId)
            .select('post_id', 'sort_order');
    }

    async function fetchOwnerPosts(knex, trx, ownerId) {
        return knex('posts_authors')
            .transacting(trx)
            .where('author_id', ownerId)
            .select('post_id');
    }

    async function reassignPrimaryPostsWithOwnerCoauthor(knex, trx, postIds, authorId, ownerId) {
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

    async function reassignPrimaryPostsWithoutOwnerCoauthor(knex, trx, postIds, authorId, ownerId) {
        await knex('posts_authors')
            .transacting(trx)
            .whereIn('post_id', postIds)
            .where('author_id', authorId)
            .update('author_id', ownerId);
    }

    async function removeRemainingAuthorPosts(knex, trx, authorId) {
        await knex('posts_authors')
            .transacting(trx)
            .where('author_id', authorId)
            .del();
    }

    // --- Model Definition ---

    const Model = Post.extend({
        _handleOptions: function _handleOptions(fnName) {
            const self = this;

            return function innerHandleOptions(model, attrs, options) {
                model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

                normalizeWithRelated(options);

                if (shouldForceAuthors(fnName, options)) {
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
            let attrs = proto.serialize.call(this, options);

            if (!this._originalOptions) {
                this._originalOptions = {};
            }

            const authorsWereRequested = (
                this._originalOptions.withRelated &&
                this._originalOptions.withRelated.includes('authors')
            );

            if (!authorsWereRequested) {
                delete attrs.authors;
            }

            const shouldIncludePrimaryAuthor = (
                !options.columns || options.columns.includes('primary_author')
            );

            if (shouldIncludePrimaryAuthor) {
                attrs.primary_author = (attrs.authors && attrs.authors.length)
                    ? attrs.authors[0]
                    : null;
            }

            return attrs;
        },

        matchAuthors: function matchAuthors(model, options) {
            let ownerUser;

            const ops = [
                () => ghostBookshelf
                    .model('User')
                    .getOwnerUser(Object.assign({}, pickTransacting(options)))
                    .then((_ownerUser) => {
                        ownerUser = _ownerUser;
                    }),

                () => {
                    const authors = model.get('authors');
                    const authorsToSet = [];

                    return Promise.all(authors.map((author, index) => {
                        const query = buildAuthorQuery(author);

                        return ghostBookshelf
                            .model('User')
                            .where(query)
                            .fetch(Object.assign({columns: ['id']}, pickTransacting(options)))
                            .then((user) => {
                                const userId = user ? user.id : ownerUser.id;
                                const userExists = _.find(authorsToSet, {id: userId.id});

                                if (!userExists) {
                                    authorsToSet[index] = {id: userId};
                                }
                            });
                    })).then(() => {
                        model.set('authors', authorsToSet);
                    });
                }
            ];

            return sequence(ops);
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

            const reassignPost = async () => {
                const trx = options.transacting;
                const knex = ghostBookshelf.knex;

                try {
                    const ownerId = await fetchOwnerUserId(knex, trx);
                    const authorsPosts = await fetchAuthorPosts(knex, trx, authorId);
                    const ownersPosts = await fetchOwnerPosts(knex, trx, ownerId);

                    const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);

                    const primaryPostsWithOwnerCoauthor = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
                    const primaryPostsWithOwnerCoauthorIds = primaryPostsWithOwnerCoauthor.map(p => p.post_id);

                    await reassignPrimaryPostsWithOwnerCoauthor(knex, trx, primaryPostsWithOwnerCoauthorIds, authorId, ownerId);

                    const primaryPostsWithoutOwnerCoauthor = _.differenceBy(authorsPrimaryPosts, primaryPostsWithOwnerCoauthor, 'post_id');
                    const postsWithoutOwnerCoauthorIds = primaryPostsWithoutOwnerCoauthor.map(p => p.post_id);

                    await reassignPrimaryPostsWithoutOwnerCoauthor(knex, trx, postsWithoutOwnerCoauthorIds, authorId, ownerId);
                    await removeRemainingAuthorPosts(knex, trx, authorId);
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

        permissible: function permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
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

            function isChangingAuthors() {
                if (!unsafeAttrs.authors) return false;
                if (!unsafeAttrs.authors.length) return true;
                return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
            }

            function isOwner() {
                if (!unsafeAttrs.authors) return false;
                return unsafeAttrs.authors.length > 0 && unsafeAttrs.authors[0].id === context.user;
            }

            function isPrimaryAuthor() {
                return context.user === postModel.related('authors').models[0].id;
            }

            function isCoAuthor() {
                return postModel.related('authors').models.map(a => a.id).includes(context.user);
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

            if (!hasUserPermission || !hasApiKeyPermission) {
                return Promise.reject(new errors.NoPermissionError({
                    message: tpl(messages.notEnoughPermission)
                }));
            }

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
                    return {excludedAttrs: ['authors'].concat(excludedAttrs)};
                }
                return {excludedAttrs};
            });
        }
    });

    return Model;
};
```