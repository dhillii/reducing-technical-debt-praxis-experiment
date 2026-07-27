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
 * Resolve a user ID for a given author definition.
 *
 * @param {Object} author Author definition (may contain id, slug or email)
 * @param {Object} ownerUser Owner user fallback
 * @param {Object} options Query options
 * @param {Object} ghostBookshelf Bookshelf instance
 * @returns {Promise<Number>} Resolved user ID
 */
async function resolveAuthorUserId(author, ownerUser, options, ghostBookshelf) {
    const query = {};

    if (author.id) {
        query.id = author.id;
    } else if (author.slug) {
        query.slug = author.slug;
    } else if (author.email) {
        query.email = author.email;
    }

    const user = await ghostBookshelf
        .model('User')
        .where(query)
        .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')));

    return user ? user.id : ownerUser.id;
}

/**
 * Fetch the owner user for the current context.
 *
 * @param {Object} options Query options
 * @param {Object} ghostBookshelf Bookshelf instance
 * @returns {Promise<Object>} Owner user model
 */
function fetchOwnerUser(options, ghostBookshelf) {
    return ghostBookshelf
        .model('User')
        .getOwnerUser(Object.assign({}, _.pick(options, 'transacting')));
}

/**
 * Match authors supplied in the payload to existing users.
 *
 * @param {Object} model Post model
 * @param {Object} options Query options
 * @param {Object} ghostBookshelf Bookshelf instance
 * @returns {Promise<void>}
 */
async function matchAuthors(model, options, ghostBookshelf) {
    const ownerUser = await fetchOwnerUser(options, ghostBookshelf);
    const authors = model.get('authors') || [];
    const authorsToSet = [];

    for (let i = 0; i < authors.length; i++) {
        const author = authors[i];
        const userId = await resolveAuthorUserId(author, ownerUser, options, ghostBookshelf);

        // Avoid duplicates
        if (!authorsToSet.find(a => a.id === userId)) {
            authorsToSet[i] = {id: userId};
        }
    }

    model.set('authors', authorsToSet);
}

/**
 * Extract the original options from a collection or model.
 *
 * @param {Object} source Source model or collection
 * @returns {Object} Cloned original options
 */
function extractOriginalOptions(source) {
    return _.cloneDeep(_.pick(source._originalOptions || {}, ['withRelated']));
}

/**
 * Ensure the `withRelated` option contains `authors` when required.
 *
 * @param {Array} withRelated Existing withRelated array
 * @param {String} fnName Name of the lifecycle hook
 * @param {Object} options Options object (may contain forUpdate)
 */
function normalizeWithRelated(withRelated, fnName, options) {
    if (!withRelated) {
        withRelated = [];
    }

    const authorIdx = withRelated.indexOf('author');
    if (authorIdx !== -1) {
        withRelated.splice(authorIdx, 1);
        withRelated.push('authors');
    }

    if (options.forUpdate &&
        ['onFetching', 'onFetchingCollection'].includes(fnName) &&
        !withRelated.includes('authors')) {
        withRelated.push('authors');
    }

    return withRelated;
}

/**
 * Core model extension for Post.
 *
 * @param {Object} Post Post model class
 * @param {Object} Posts Posts collection class
 * @param {Object} ghostBookshelf Bookshelf instance
 * @returns {Object} Extended Post model
 */
module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions(fnName) {
            const self = this;

            return function innerHandleOptions(model, attrs, options) {
                model._originalOptions = extractOriginalOptions(options);
                options.withRelated = normalizeWithRelated(options.withRelated, fnName, options);
                return proto[fnName].call(self, model, attrs, options);
            };
        },

        onFetching(model, attrs, options) {
            return this._handleOptions('onFetching')(model, attrs, options);
        },

        onFetchingCollection(collection, attrs, options) {
            return this._handleOptions('onFetchingCollection')(collection, attrs, options);
        },

        onFetchedCollection(collection, attrs, options) {
            _.each(collection.models, model => {
                model._originalOptions = collection._originalOptions;
            });
            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        async onCreating(model, attrs, options) {
            if (!model.get('authors')) {
                model.set('authors', [{id: await this.contextUser(options)}]);
            }
            return this._handleOptions('onCreating')(model, attrs, options);
        },

        onUpdating(model, attrs, options) {
            return this._handleOptions('onUpdating')(model, attrs, options);
        },

        onSaving(model, attrs, options) {
            const ops = [];

            // Remove deprecated single author field
            model.unset('author');

            // Ensure at least one author exists
            if (model.get('authors') && !model.get('authors').length) {
                throw new errors.ValidationError({
                    message: 'At least one author is required.'
                });
            }

            // Resolve authors if present
            if (model.get('authors')) {
                ops.push(() => matchAuthors(model, options, ghostBookshelf));
            }

            // Continue with default saving logic
            ops.push(() => proto.onSaving.call(this, model, attrs, options));

            return sequence(ops);
        },

        serialize(options) {
            let attrs = proto.serialize.call(this, options);

            if (!this._originalOptions) {
                this._originalOptions = {};
            }

            const withRelated = this._originalOptions.withRelated || [];
            if (!withRelated.includes('authors')) {
                delete attrs.authors;
            }

            if (!options.columns || options.columns.includes('primary_author')) {
                attrs.primary_author = (attrs.authors && attrs.authors.length) ? attrs.authors[0] : null;
            }

            return attrs;
        },

        // Placeholder for future relation configuration
        matchAuthors
    }, {
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
                    const primaryWithOwner = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
                    const primaryWithOwnerIds = primaryWithOwner.map(p => p.post_id);

                    // Remove author from posts where owner is co‑author and promote owner
                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', primaryWithOwnerIds)
                        .where('author_id', authorId)
                        .del();

                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', primaryWithOwnerIds)
                        .where('author_id', ownerId)
                        .update('sort_order', 0);

                    const primaryWithoutOwner = _.differenceBy(authorsPrimaryPosts, primaryWithOwner, 'post_id');
                    const primaryWithoutOwnerIds = primaryWithoutOwner.map(p => p.post_id);

                    // Swap author with owner for primary posts without owner co‑author
                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', primaryWithoutOwnerIds)
                        .where('author_id', authorId)
                        .update('author_id', ownerId);

                    // Remove author from any remaining posts
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

        permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
            let postModel = postModelOrId;
            let origArgs;

            // Resolve model if an ID was supplied
            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                origArgs = _.toArray(arguments).slice(1);
                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then(found => {
                        if (!found) {
                            throw new errors.NotFoundError({
                                message: tpl(messages.postNotFound)
                            });
                        }
                        const newArgs = [found].concat(origArgs);
                        return self.permissible.apply(self, newArgs);
                    });
            }

            const isEdit = action === 'edit';
            const isAdd = action === 'add';
            const isDestroy = action === 'destroy';

            const isChangingAuthors = () => {
                if (!unsafeAttrs.authors) {
                    return false;
                }
                if (!unsafeAttrs.authors.length) {
                    return true;
                }
                return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
            };

            const isOwner = () => {
                if (!unsafeAttrs.authors) {
                    return false;
                }
                return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
            };

            const isPrimaryAuthor = () => context.user === postModel.related('authors').models[0].id;

            const isCoAuthor = () => postModel.related('authors').models.map(a => a.id).includes(context.user);

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

            return Promise.reject(new errors.NoPermissionError({
                message: tpl(messages.notEnoughPermission)
            }));
        }
    });

    return Model;
};