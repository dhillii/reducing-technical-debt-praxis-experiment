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

const normalizeWithRelated = (options) => {
    if (!options.withRelated) {
        options.withRelated = [];
    }

    const authorIndex = options.withRelated.indexOf('author');
    if (authorIndex !== -1) {
        options.withRelated.splice(authorIndex, 1);
        options.withRelated.push('authors');
    }
};

const shouldAddAuthorsForUpdate = (fnName, options) =>
    options.forUpdate &&
    ['onFetching', 'onFetchingCollection'].includes(fnName) &&
    !options.withRelated.includes('authors');

const buildUserQuery = (author) => {
    if (author.id) return {id: author.id};
    if (author.slug) return {slug: author.slug};
    if (author.email) return {email: author.email};
    return {};
};

const fetchUserOrOwner = async (ghostBookshelf, query, ownerUser, options) => {
    const user = await ghostBookshelf
        .model('User')
        .where(query)
        .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')));

    return user ? user.id : ownerUser.id;
};

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions: function _handleOptions(fnName) {
            return (model, attrs, options) => {
                model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

                normalizeWithRelated(options);

                if (shouldAddAuthorsForUpdate(fnName, options)) {
                    options.withRelated.push('authors');
                }

                return proto[fnName].call(this, model, attrs, options);
            };
        },

        onFetching: function onFetching(model, attrs, options) {
            return this._handleOptions('onFetching')(model, attrs, options);
        },

        onFetchingCollection: function onFetchingCollection(collection, attrs, options) {
            return this._handleOptions('onFetchingCollection')(collection, attrs, options);
        },

        onFetchedCollection: function onFetchedCollection(collection, attrs, options) {
            collection.models.forEach((model) => {
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

            const authors = model.get('authors');

            if (authors && !authors.length) {
                throw new errors.ValidationError({
                    message: 'At least one author is required.'
                });
            }

            const ops = [];

            if (authors) {
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

            const shouldIncludePrimaryAuthor = !options.columns || options.columns.includes('primary_author');

            if (shouldIncludePrimaryAuthor) {
                attrs.primary_author = (attrs.authors && attrs.authors.length) ? attrs.authors[0] : null;
            }

            return attrs;
        },

        matchAuthors: async function matchAuthors(model, options) {
            const transactingOption = _.pick(options, 'transacting');

            const ownerUser = await ghostBookshelf
                .model('User')
                .getOwnerUser(Object.assign({}, transactingOption));

            const authors = model.get('authors');
            const authorsToSet = [];

            await Promise.all(authors.map(async (author, index) => {
                const query = buildUserQuery(author);
                const userId = await fetchUserOrOwner(ghostBookshelf, query, ownerUser, options);
                const userExists = _.find(authorsToSet, {id: userId});

                if (!userExists) {
                    authorsToSet[index] = {id: userId};
                }
            }));

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

            const reassignPost = async () => {
                const {transacting: trx} = options;
                const knex = ghostBookshelf.knex;

                try {
                    await this._performReassignment(knex, trx, authorId);
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

        _performReassignment: async function _performReassignment(knex, trx, authorId) {
            const ownerUser = await knex('roles')
                .transacting(trx)
                .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
                .where('roles.name', 'Owner')
                .select('roles_users.user_id');

            const ownerId = ownerUser[0].user_id;

            const [authorsPosts, ownersPosts] = await Promise.all([
                knex('posts_authors').transacting(trx).where('author_id', authorId).select('post_id', 'sort_order'),
                knex('posts_authors').transacting(trx).where('author_id', ownerId).select('post_id')
            ]);

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
        },

        permissible: async function permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                return this._permissibleById(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission);
            }

            const postModel = postModelOrId;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
            const isEdit = action === 'edit';
            const isAdd = action === 'add';
            const isDestroy = action === 'destroy';

            const isChangingAuthors = () => {
                if (!unsafeAttrs.authors) return false;
                if (!unsafeAttrs.authors.length) return true;
                return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
            };

            const isOwner = () => {
                if (!unsafeAttrs.authors || !unsafeAttrs.authors.length) return false;
                return unsafeAttrs.authors[0].id === context.user;
            };

            const isPrimaryAuthor = () => context.user === postModel.related('authors').models[0].id;

            const isCoAuthor = () => postModel.related('authors').models.map(a => a.id).includes(context.user);

            hasUserPermission = this._resolveUserPermission({
                isContributor, isAuthor, isEdit, isAdd, isDestroy,
                hasUserPermission, postModel,
                isChangingAuthors, isOwner, isPrimaryAuthor, isCoAuthor
            });

            if (!hasUserPermission || !hasApiKeyPermission) {
                return Promise.reject(new errors.NoPermissionError({
                    message: tpl(messages.notEnoughPermission)
                }));
            }

            const result = await Post.permissible.call(
                this, postModelOrId, action, context,
                unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission
            );

            if (isContributor || isAuthor) {
                return {excludedAttrs: ['authors'].concat(result.excludedAttrs)};
            }

            return result;
        },

        _permissibleById: function _permissibleById(postModelOrId, ...args) {
            const self = this;

            return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                .then((foundPostModel) => {
                    if (!foundPostModel) {
                        throw new errors.NotFoundError({
                            message: tpl(messages.postNotFound)
                        });
                    }

                    return self.permissible(foundPostModel, ...args);
                });
        },

        _resolveUserPermission: function _resolveUserPermission({
            isContributor, isAuthor, isEdit, isAdd, isDestroy,
            hasUserPermission, postModel,
            isChangingAuthors, isOwner, isPrimaryAuthor, isCoAuthor
        }) {
            if (isContributor && isEdit) return !isChangingAuthors() && isCoAuthor();
            if (isContributor && isAdd) return isOwner();
            if (isContributor && isDestroy) return isPrimaryAuthor();
            if (isAuthor && isEdit) return isCoAuthor() && !isChangingAuthors();
            if (isAuthor && isAdd) return isOwner();
            if (postModel) return hasUserPermission || isPrimaryAuthor();
            return hasUserPermission;
        }
    });

    return Model;
};
```