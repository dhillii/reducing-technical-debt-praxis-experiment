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

/**
 * Normalise options for fetching authors.
 * @param {Object} options
 * @returns {Object}
 */
function normaliseOptions(options) {
    const opts = _.cloneDeep(_.pick(options, ['withRelated']));
    opts.withRelated = opts.withRelated || [];
    if (opts.withRelated.includes('author')) {
        opts.withRelated = opts.withRelated.filter(r => r !== 'author');
        opts.withRelated.push('authors');
    }
    return opts;
}

/**
 * Ensure authors relation is fetched when updating.
 * @param {string} fnName
 * @param {Object} options
 */
function ensureAuthorsOnUpdate(fnName, options) {
    if (options.forUpdate && ['onFetching', 'onFetchingCollection'].includes(fnName) && !options.withRelated.includes('authors')) {
        options.withRelated.push('authors');
    }
}

/**
 * Check if authors array is empty.
 * @param {Array} authors
 * @returns {boolean}
 */
function isAuthorsEmpty(authors) {
    return !authors || !authors.length;
}

/**
 * Build operations for matching authors.
 * @param {Object} model
 * @param {Object} options
 * @param {Object} ghostBookshelf
 * @returns {Array<Function>}
 */
function buildMatchAuthorsOps(model, options, ghostBookshelf) {
    const ops = [];
    let ownerUser;

    ops.push(() => ghostBookshelf.model('User')
        .getOwnerUser(_.pick(options, 'transacting'))
        .then(u => { ownerUser = u; }));

    ops.push(() => {
        const authors = model.get('authors');
        const authorsToSet = [];

        return Promise.all(authors.map((author, index) => {
            const query = author.id ? {id: author.id} : author.slug ? {slug: author.slug} : author.email ? {email: author.email} : {};

            return ghostBookshelf.model('User')
                .where(query)
                .fetch(_.assign({columns: ['id']}, _.pick(options, 'transacting')))
                .then(user => {
                    const userId = user ? user.id : ownerUser.id;
                    if (!_.find(authorsToSet, {id: userId})) {
                        authorsToSet[index] = {id: userId};
                    }
                });
        })).then(() => {
            model.set('authors', authorsToSet);
        });
    });

    return ops;
}

/**
 * Permission strategy mapping.
 * @type {Object}
 */
const permissionStrategy = {
    contributor: {
        edit: (post, ctx, attrs) => !isChangingAuthors(attrs) && isCoAuthor(post, ctx),
        add:  (post, ctx, attrs) => isOwner(post, ctx, attrs),
        destroy: (post, ctx, attrs) => isPrimaryAuthor(post, ctx)
    },
    author: {
        edit:   (post, ctx, attrs) => isCoAuthor(post, ctx) && !isChangingAuthors(attrs),
        add:    (post, ctx, attrs) => isOwner(post, ctx, attrs),
        default: (post, ctx, attrs) => isPrimaryAuthor(post, ctx)
    }
};

/**
 * Helper predicates for permissions.
 * @param {Object} post
 * @param {Object} ctx
 * @param {Object} attrs
 */
function isChangingAuthors(attrs) {
    if (!attrs.authors) return false;
    if (!attrs.authors.length) return true;
    return attrs.authors[0].id !== attrs.post.related('authors').models[0].id;
}
function isOwner(post, ctx, attrs) {
    if (!attrs.authors) return false;
    return attrs.authors.length && attrs.authors[0].id === ctx.user;
}
function isPrimaryAuthor(post, ctx) {
    return ctx.user === post.related('authors').models[0].id;
}
function isCoAuthor(post, ctx) {
    return post.related('authors').models.map(a => a.id).includes(ctx.user);
}

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions: function _handleOptions(fnName) {
            const self = this;
            return function innerHandleOptions(model, attrs, options) {
                model._originalOptions = normaliseOptions(options);
                ensureAuthorsOnUpdate(fnName, model._originalOptions);
                return proto[fnName].call(self, model, attrs, model._originalOptions);
            };
        },

        onFetching: function onFetching(model, attrs, options) {
            return this._handleOptions('onFetching')(model, attrs, options);
        },

        onFetchingCollection: function onFetchingCollection(collection, attrs, options) {
            return this._handleOptions('onFetchingCollection')(collection, attrs, options);
        },

        onFetchedCollection: function (collection, attrs, options) {
            _.each(collection.models, model => {
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

        onSaving: function (model, attrs, options) {
            const ops = [];

            model.unset('author');

            if (isAuthorsEmpty(model.get('authors'))) {
                throw new errors.ValidationError({
                    message: 'At least one author is required.'
                });
            }

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

            if (!this._originalOptions.withRelated || this._originalOptions.withRelated.indexOf('authors') === -1) {
                delete attrs.authors;
            }

            if (!options.columns || options.columns.includes('primary_author')) {
                attrs.primary_author = (attrs.authors && attrs.authors.length) ? attrs.authors[0] : null;
            }

            return attrs;
        },

        matchAuthors(model, options) {
            return sequence(buildMatchAuthorsOps(model, options, ghostBookshelf));
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
                    const ownerRows = await knex('roles')
                        .transacting(trx)
                        .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
                        .where('roles.name', 'Owner')
                        .select('roles_users.user_id');
                    const ownerId = ownerRows[0].user_id;

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

                    const primaryPostsWithoutOwnerCoauthor = _.differenceBy(authorsPrimaryPosts, primaryPostsWithOwnerCoauthor, 'post_id');
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
                } catch (err) {
                    throw new errors.InternalServerError({err});
                }
            };

            if (!options.transacting) {
                return ghostBookshelf.transaction(transacting => {
                    options.transacting = transacting;
                    return reassignPost();
                });
            }

            return reassignPost();
        },

        permissible: function permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const postModel = postModelOrId;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
            const isEdit = action === 'edit';
            const isAdd = action === 'add';
            const isDestroy = action === 'destroy';

            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                const origArgs = _.toArray(arguments).slice(1);
                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then(foundPostModel => {
                        if (!foundPostModel) {
                            throw new errors.NotFoundError({message: tpl(messages.postNotFound)});
                        }
                        const newArgs = [foundPostModel].concat(origArgs);
                        return self.permissible.apply(self, newArgs);
                    });
            }

            const strategy = isContributor ? permissionStrategy.contributor : permissionStrategy.author;
            const roleAction = strategy[action] || strategy.default;

            if (roleAction) {
                hasUserPermission = roleAction(postModel, context, unsafeAttrs);
            } else if (postModel) {
                hasUserPermission = hasUserPermission || isPrimaryAuthor(postModel, context);
            }

            if (hasUserPermission && hasApiKeyPermission) {
                return Post.permissible.call(
                    this,
                    postModelOrId,
                    action, context,
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
    });

    return Model;
};