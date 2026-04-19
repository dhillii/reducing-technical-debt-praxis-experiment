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
 * Handles options for fetching and creating posts.
 * @param {string} fnName - The name of the function being wrapped.
 * @returns {Function} - Wrapped function that normalises options.
 */
function createOptionHandler(fnName) {
    return function (model, attrs, options) {
        model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

        if (!options.withRelated) {
            options.withRelated = [];
        }

        if (options.withRelated.includes('author')) {
            options.withRelated = options.withRelated.filter(r => r !== 'author');
            options.withRelated.push('authors');
        }

        if (options.forUpdate && ['onFetching', 'onFetchingCollection'].includes(fnName) && !options.withRelated.includes('authors')) {
            options.withRelated.push('authors');
        }

        return this[fnName].call(this, model, attrs, options);
    };
}

/**
 * Matches authors for a post.
 * @param {Object} model - The post model.
 * @param {Object} options - Options passed to the operation.
 * @returns {Promise<void>}
 */
async function matchAuthorsAsync(model, options) {
    const ownerUser = await ghostBookshelf
        .model('User')
        .getOwnerUser(_.pick(options, 'transacting'));

    const authors = model.get('authors') || [];
    const authorsToSet = [];

    await Promise.all(authors.map(async (author, index) => {
        const query = author.id ? {id: author.id} : author.slug ? {slug: author.slug} : author.email ? {email: author.email} : {};

        const user = await ghostBookshelf
            .model('User')
            .where(query)
            .fetch(_.assign({columns: ['id']}, _.pick(options, 'transacting')));

        const userId = user ? user.id : ownerUser.id;
        const exists = authorsToSet.some(a => a.id === userId);

        if (!exists) {
            authorsToSet[index] = {id: userId};
        }
    }));

    model.set('authors', authorsToSet);
}

/**
 * Permission strategy mapping for contributors and authors.
 */
const permissionStrategies = {
    contributor: {
        edit: (post, context, unsafeAttrs) => !isChangingAuthors(unsafeAttrs, post) && isCoAuthor(post, context),
        add: (post, context) => isOwner(post, context),
        destroy: (post, context) => isPrimaryAuthor(post, context)
    },
    author: {
        edit: (post, context, unsafeAttrs) => isCoAuthor(post, context) && !isChangingAuthors(unsafeAttrs, post),
        add: (post, context) => isOwner(post, context),
        destroy: (post, context) => isPrimaryAuthor(post, context)
    }
};

/**
 * Predicate helpers for permission checks.
 */
function isChangingAuthors(unsafeAttrs, post) {
    if (!unsafeAttrs.authors) return false;
    if (!unsafeAttrs.authors.length) return true;
    return unsafeAttrs.authors[0].id !== post.related('authors').models[0].id;
}

function isOwner(post, context) {
    if (!context.user) return false;
    const authors = post.related('authors').models;
    return authors.length && authors[0].id === context.user;
}

function isPrimaryAuthor(post, context) {
    return context.user === post.related('authors').models[0].id;
}

function isCoAuthor(post, context) {
    const authorIds = post.related('authors').models.map(a => a.id);
    return authorIds.includes(context.user);
}

/**
 * Reassign posts from one author to the owner.
 * @param {Object} options - Options containing id, context, transacting.
 * @returns {Promise<void>}
 */
async function reassignPostAsync(options) {
    const trx = options.transacting;
    const knex = ghostBookshelf.knex;

    const ownerRows = await knex('roles')
        .transacting(trx)
        .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
        .where('roles.name', 'Owner')
        .select('roles_users.user_id');

    const ownerId = ownerRows[0].user_id;

    const authorsPosts = await knex('posts_authors')
        .transacting(trx)
        .where('author_id', options.id)
        .select('post_id', 'sort_order');

    const ownersPosts = await knex('posts_authors')
        .transacting(trx)
        .where('author_id', ownerId)
        .select('post_id');

    const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
    const primaryWithOwner = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
    const primaryWithOwnerIds = primaryWithOwner.map(p => p.post_id);

    await knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', primaryWithOwnerIds)
        .where('author_id', options.id)
        .del();

    await knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', primaryWithOwnerIds)
        .where('author_id', ownerId)
        .update('sort_order', 0);

    const primaryWithoutOwner = _.differenceBy(authorsPrimaryPosts, primaryWithOwner, 'post_id');
    const withoutOwnerIds = primaryWithoutOwner.map(p => p.post_id);

    await knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', withoutOwnerIds)
        .where('author_id', options.id)
        .update('author_id', ownerId);

    await knex('posts_authors')
        .transacting(trx)
        .where('author_id', options.id)
        .del();
}

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        onFetching: function (model, attrs, options) {
            return createOptionHandler('onFetching').call(this, model, attrs, options);
        },

        onFetchingCollection: function (collection, attrs, options) {
            return createOptionHandler('onFetchingCollection').call(this, collection, attrs, options);
        },

        onFetchedCollection: function (collection, attrs, options) {
            collection.models.forEach(m => { m._originalOptions = collection._originalOptions; });
            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        onCreating: async function (model, attrs, options) {
            if (!model.get('authors')) {
                model.set('authors', [{id: await this.contextUser(options)}]);
            }
            return createOptionHandler('onCreating').call(this, model, attrs, options);
        },

        onUpdating: function (model, attrs, options) {
            return createOptionHandler('onUpdating').call(this, model, attrs, options);
        },

        onSaving: function (model, attrs, options) {
            const ops = [];

            // Remove legacy single author field
            model.unset('author');

            if (model.get('authors') && !model.get('authors').length) {
                throw new errors.ValidationError({message: 'At least one author is required.'});
            }

            if (model.get('authors')) {
                ops.push(() => matchAuthorsAsync(model, options));
            }

            ops.push(() => proto.onSaving.call(this, model, attrs, options));

            return sequence(ops);
        },

        serialize: function (options) {
            let attrs = proto.serialize.call(this, options);

            if (!this._originalOptions) this._originalOptions = {};

            if (!this._originalOptions.withRelated || !this._originalOptions.withRelated.includes('authors')) {
                delete attrs.authors;
            }

            if (!options.columns || options.columns.includes('primary_author')) {
                attrs.primary_author = (attrs.authors && attrs.authors.length) ? attrs.authors[0] : null;
            }

            return attrs;
        },

        matchAuthors: function (model, options) {
            return matchAuthorsAsync(model, options);
        }
    }, {
        reassignByAuthor: async function (unfilteredOptions) {
            const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
            const authorId = options.id;

            if (!authorId) {
                return Promise.reject(new errors.NotFoundError({message: tpl(messages.noUserFound)}));
            }

            const exec = async () => {
                try {
                    await reassignPostAsync(options);
                } catch (err) {
                    throw new errors.InternalServerError({err});
                }
            };

            if (!options.transacting) {
                return ghostBookshelf.transaction(transacting => {
                    options.transacting = transacting;
                    return exec();
                });
            }

            return exec();
        },

        permissible: function (postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const postModel = postModelOrId;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);

            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                const origArgs = Array.prototype.slice.call(arguments, 1);
                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then(found => {
                        if (!found) {
                            throw new errors.NotFoundError({message: tpl(messages.postNotFound)});
                        }
                        const newArgs = [found].concat(origArgs);
                        return self.permissible.apply(self, newArgs);
                    });
            }

            const isEdit = action === 'edit';
            const isAdd = action === 'add';
            const isDestroy = action === 'destroy';

            const strategy = isContributor ? permissionStrategies.contributor : permissionStrategies.author;
            const check = strategy[action];

            if (check) {
                hasUserPermission = check(postModel, context, unsafeAttrs);
            } else if (postModel) {
                hasUserPermission = hasUserPermission || isPrimaryAuthor(postModel, context);
            }

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
                        return {excludedAttrs: ['authors'].concat(excludedAttrs)};
                    }
                    return {excludedAttrs};
                });
            }

            return Promise.reject(new errors.NoPermissionError({message: tpl(messages.notEnoughPermission)}));
        }
    });

    return Model;
};