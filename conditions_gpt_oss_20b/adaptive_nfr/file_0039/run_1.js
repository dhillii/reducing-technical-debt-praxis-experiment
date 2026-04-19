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
 * @private
 * @param {Object} options
 * @returns {Array<string>}
 */
function getWithRelated(options) {
    const withRelated = _.cloneDeep(_.pick(options, ['withRelated'])).withRelated || [];
    if (withRelated.includes('author')) {
        _.pull(withRelated, 'author');
        withRelated.push('authors');
    }
    if (options.forUpdate && !withRelated.includes('authors')) {
        withRelated.push('authors');
    }
    return withRelated;
}

/**
 * @private
 * @param {Object} model
 * @param {Object} options
 */
function setOriginalOptions(model, options) {
    model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));
}

/**
 * @private
 * @param {Object} model
 * @param {Object} options
 */
function ensureAuthorsExist(model, options) {
    if (!model.get('authors')) {
        model.set('authors', [{id: options.contextUser}]);
    }
}

/**
 * @private
 * @param {Object} model
 * @throws {errors.ValidationError}
 */
function validateAuthorsPresence(model) {
    if (model.get('authors') && !model.get('authors').length) {
        throw new errors.ValidationError({
            message: 'At least one author is required.'
        });
    }
}

/**
 * @private
 * @param {Object} model
 * @param {Object} options
 * @returns {Promise}
 */
async function matchAuthorsAsync(model, options) {
    const ownerUser = await ghostBookshelf
        .model('User')
        .getOwnerUser(_.pick(options, 'transacting'));

    const authors = model.get('authors');
    const authorsToSet = [];

    await Promise.all(authors.map(async (author, index) => {
        const query = author.id ? {id: author.id} : author.slug ? {slug: author.slug} : author.email ? {email: author.email} : {};

        const user = await ghostBookshelf
            .model('User')
            .where(query)
            .fetch(_.assign({columns: ['id']}, _.pick(options, 'transacting')));

        const userId = user ? user.id : ownerUser.id;
        const userExists = _.find(authorsToSet, {id: userId});

        if (!userExists) {
            authorsToSet[index] = {id: userId};
        }
    }));

    model.set('authors', authorsToSet);
}

/**
 * @private
 * @param {Object} options
 * @returns {Promise}
 */
async function reassignPostAsync(options) {
    const trx = options.transacting;
    const knex = ghostBookshelf.knex;

    const ownerUser = await knex('roles')
        .transacting(trx)
        .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
        .where('roles.name', 'Owner')
        .select('roles_users.user_id');

    const ownerId = ownerUser[0].user_id;

    const authorsPosts = await knex('posts_authors')
        .transacting(trx)
        .where('author_id', options.id)
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
        .where('author_id', options.id)
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
        .where('author_id', options.id)
        .update('author_id', ownerId);

    await knex('posts_authors')
        .transacting(trx)
        .where('author_id', options.id)
        .del();
}

/**
 * @private
 * @param {Object} postModel
 * @param {string} action
 * @param {Object} context
 * @param {Object} unsafeAttrs
 * @param {Object} loadedPermissions
 * @returns {boolean}
 */
function hasUserPermission(postModel, action, context, unsafeAttrs, loadedPermissions) {
    const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
    const isChangingAuthors = () => {
        if (!unsafeAttrs.authors) return false;
        if (!unsafeAttrs.authors.length) return true;
        return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
    };
    const isOwner = () => {
        if (!unsafeAttrs.authors) return false;
        return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
    };
    const isPrimaryAuthor = () => context.user === postModel.related('authors').models[0].id;
    const isCoAuthor = () => postModel.related('authors').models.map(a => a.id).includes(context.user);

    if (isContributor) {
        if (action === 'edit') return !isChangingAuthors() && isCoAuthor();
        if (action === 'add') return isOwner();
        if (action === 'destroy') return isPrimaryAuthor();
    }

    if (isAuthor) {
        if (action === 'edit') return isCoAuthor() && !isChangingAuthors();
        if (action === 'add') return isOwner();
    }

    if (postModel) {
        return isPrimaryAuthor();
    }

    return false;
}

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions(fnName) {
            const self = this;
            return function innerHandleOptions(model, attrs, options) {
                setOriginalOptions(model, options);
                options.withRelated = getWithRelated(options);
                return proto[fnName].call(self, model, attrs, options);
            };
        },

        onFetching: function onFetching(model, attrs, options) {
            return this._handleOptions('onFetching')(model, attrs, options);
        },

        onFetchingCollection: function onFetchingCollection(collection, attrs, options) {
            return this._handleOptions('onFetchingCollection')(collection, attrs, options);
        },

        onFetchedCollection(collection, attrs, options) {
            collection.models.forEach(model => {
                model._originalOptions = collection._originalOptions;
            });
            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        onCreating: async function onCreating(model, attrs, options) {
            ensureAuthorsExist(model, options);
            return this._handleOptions('onCreating')(model, attrs, options);
        },

        onUpdating: function onUpdating(model, attrs, options) {
            return this._handleOptions('onUpdating')(model, attrs, options);
        },

        onSaving(model, attrs, options) {
            const ops = [];

            model.unset('author');

            validateAuthorsPresence(model);

            if (model.get('authors')) {
                ops.push(() => matchAuthorsAsync(model, options));
            }

            ops.push(() => proto.onSaving.call(this, model, attrs, options));

            return sequence(ops);
        },

        serialize(options) {
            let attrs = proto.serialize.call(this, options);

            if (!this._originalOptions) {
                this._originalOptions = {};
            }

            if (!this._originalOptions.withRelated || !this._originalOptions.withRelated.includes('authors')) {
                delete attrs.authors;
            }

            if (!options.columns || options.columns.includes('primary_author')) {
                attrs.primary_author = (attrs.authors && attrs.authors.length) ? attrs.authors[0] : null;
            }

            return attrs;
        },

        matchAuthors(model, options) {
            return matchAuthorsAsync(model, options);
        }
    }, {
        reassignByAuthor: async function reassignByAuthor(unfilteredOptions) {
            const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
            if (!options.id) {
                return Promise.reject(new errors.NotFoundError({
                    message: tpl(messages.noUserFound)
                }));
            }

            const run = async () => {
                try {
                    await reassignPostAsync(options);
                } catch (err) {
                    throw new errors.InternalServerError({err});
                }
            };

            if (!options.transacting) {
                return ghostBookshelf.transaction(transacting => {
                    options.transacting = transacting;
                    return run();
                });
            }

            return run();
        },

        permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const postModel = postModelOrId;
            let origArgs;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
            let isEdit = action === 'edit';
            let isAdd = action === 'add';
            let isDestroy = action === 'destroy';

            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                origArgs = _.toArray(arguments).slice(1);
                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then(foundPostModel => {
                        if (!foundPostModel) {
                            throw new errors.NotFoundError({
                                message: tpl(messages.postNotFound)
                            });
                        }
                        const newArgs = [foundPostModel].concat(origArgs);
                        return self.permissible.apply(self, newArgs);
                    });
            }

            const userPerm = hasUserPermission || hasUserPermission === undefined
                ? hasUserPermission(postModel, action, context, unsafeAttrs, loadedPermissions)
                : hasUserPermission;

            if (userPerm && hasApiKeyPermission) {
                return Post.permissible.call(
                    this,
                    postModelOrId,
                    action, context,
                    unsafeAttrs,
                    loadedPermissions,
                    userPerm,
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