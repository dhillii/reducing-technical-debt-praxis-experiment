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

/**
 * Create a wrapper that normalises `withRelated` options for the given hook.
 *
 * @param {Object} proto - The original prototype.
 * @param {string} fnName - Name of the hook method.
 * @returns {Function}
 */
function createHandleOptions(proto, fnName) {
    return function (model, attrs, options) {
        model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

        if (!options.withRelated) {
            options.withRelated = [];
        }

        // replace legacy `author` with `authors`
        const authorIdx = options.withRelated.indexOf('author');
        if (authorIdx !== -1) {
            options.withRelated.splice(authorIdx, 1);
            options.withRelated.push('authors');
        }

        // ensure authors are fetched on update/fetch hooks
        if (options.forUpdate && ['onFetching', 'onFetchingCollection'].includes(fnName) && !options.withRelated.includes('authors')) {
            options.withRelated.push('authors');
        }

        return proto[fnName].call(this, model, attrs, options);
    };
}

/**
 * Resolve author identifiers to user IDs and de‑duplicate them.
 *
 * @param {Object} model - Post model.
 * @param {Object} options - Query options.
 * @param {Object} ghostBookshelf - Bookshelf instance.
 * @returns {Promise<void>}
 */
async function resolveAuthors(model, options, ghostBookshelf) {
    const ownerUser = await ghostBookshelf
        .model('User')
        .getOwnerUser(_.pick(options, 'transacting'));

    const authors = model.get('authors') || [];
    const resolved = [];

    await Promise.all(authors.map(async (author, idx) => {
        const query = author.id ? {id: author.id}
            : author.slug ? {slug: author.slug}
            : author.email ? {email: author.email}
            : {};

        const user = await ghostBookshelf
            .model('User')
            .where(query)
            .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')));

        const userId = user ? user.id : ownerUser.id;

        // avoid duplicates
        if (!resolved.find(a => a.id === userId)) {
            resolved[idx] = {id: userId};
        }
    }));

    model.set('authors', resolved);
}

/**
 * Predicate helpers for permission checks.
 */
function isChangingAuthors(unsafeAttrs, postModel, contextUser) {
    if (!unsafeAttrs.authors) {
        return false;
    }
    if (!unsafeAttrs.authors.length) {
        return true;
    }
    return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
}
function isOwner(unsafeAttrs, contextUser) {
    if (!unsafeAttrs.authors) {
        return false;
    }
    return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === contextUser;
}
function isPrimaryAuthor(postModel, contextUser) {
    return contextUser === postModel.related('authors').models[0].id;
}
function isCoAuthor(postModel, contextUser) {
    return postModel.related('authors').models.map(a => a.id).includes(contextUser);
}

/**
 * Evaluate whether a user has permission based on role and action.
 *
 * @param {Object} params - Evaluation parameters.
 * @returns {boolean}
 */
function evaluatePermission({roleFlags, action, unsafeAttrs, postModel, contextUser}) {
    const {isContributor, isAuthor} = roleFlags;

    if (isContributor) {
        if (action === 'edit') {
            return !isChangingAuthors(unsafeAttrs, postModel, contextUser) && isCoAuthor(postModel, contextUser);
        }
        if (action === 'add') {
            return isOwner(unsafeAttrs, contextUser);
        }
        if (action === 'destroy') {
            return isPrimaryAuthor(postModel, contextUser);
        }
    }

    if (isAuthor) {
        if (action === 'edit') {
            return isCoAuthor(postModel, contextUser) && !isChangingAuthors(unsafeAttrs, postModel, contextUser);
        }
        if (action === 'add') {
            return isOwner(unsafeAttrs, contextUser);
        }
    }

    // fallback for owners / admins etc.
    if (postModel) {
        return isPrimaryAuthor(postModel, contextUser);
    }

    return false;
}

/**
 * Extend the Post model with author‑specific behaviour.
 *
 * @param {Object} Post - Bookshelf model.
 * @param {Object} Posts - Collection.
 * @param {Object} ghostBookshelf - Bookshelf instance.
 * @returns {Object}
 */
module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions: function (fnName) {
            return createHandleOptions(proto, fnName).bind(this);
        },

        onFetching: function (model, attrs, options) {
            return this._handleOptions('onFetching')(model, attrs, options);
        },

        onFetchingCollection: function (collection, attrs, options) {
            return this._handleOptions('onFetchingCollection')(collection, attrs, options);
        },

        onFetchedCollection: function (collection, attrs, options) {
            _.each(collection.models, model => {
                model._originalOptions = collection._originalOptions;
            });
            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        onCreating: async function (model, attrs, options) {
            if (!model.get('authors')) {
                model.set('authors', [{id: await this.contextUser(options)}]);
            }
            return this._handleOptions('onCreating')(model, attrs, options);
        },

        onUpdating: function (model, attrs, options) {
            return this._handleOptions('onUpdating')(model, attrs, options);
        },

        onSaving: function (model, attrs, options) {
            const ops = [];

            // deprecated single author field
            model.unset('author');

            // ensure at least one author
            if (model.get('authors') && !model.get('authors').length) {
                throw new errors.ValidationError({message: 'At least one author is required.'});
            }

            if (model.get('authors')) {
                ops.push(() => resolveAuthors(model, options, ghostBookshelf));
            }

            ops.push(() => proto.onSaving.call(this, model, attrs, options));

            return sequence(ops);
        },

        serialize: function (options) {
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

        /**
         * Resolve author identifiers to actual users.
         *
         * @param {Object} model
         * @param {Object} options
         * @returns {Promise<void>}
         */
        matchAuthors: function (model, options) {
            return resolveAuthors(model, options, ghostBookshelf);
        }
    }, {
        /**
         * Reassign posts from a deleted author to the owner.
         *
         * @param {Object} unfilteredOptions
         * @returns {Promise<void>}
         */
        reassignByAuthor: async function (unfilteredOptions) {
            const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
            const authorId = options.id;

            if (!authorId) {
                return Promise.reject(new errors.NotFoundError({message: tpl(messages.noUserFound)}));
            }

            const reassign = async () => {
                const trx = options.transacting;
                const knex = ghostBookshelf.knex;

                try {
                    const [ownerRow] = await knex('roles')
                        .transacting(trx)
                        .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
                        .where('roles.name', 'Owner')
                        .select('roles_users.user_id');

                    const ownerId = ownerRow.user_id;

                    const authorsPosts = await knex('posts_authors')
                        .transacting(trx)
                        .where('author_id', authorId)
                        .select('post_id', 'sort_order');

                    const ownersPosts = await knex('posts_authors')
                        .transacting(trx)
                        .where('author_id', ownerId)
                        .select('post_id');

                    const authorsPrimary = authorsPosts.filter(p => p.sort_order === 0);
                    const primaryWithOwner = _.intersectionBy(authorsPrimary, ownersPosts, 'post_id');
                    const primaryWithOwnerIds = primaryWithOwner.map(p => p.post_id);

                    // remove author from primary posts where owner is co‑author
                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', primaryWithOwnerIds)
                        .where('author_id', authorId)
                        .del();

                    // promote owner to primary author
                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', primaryWithOwnerIds)
                        .where('author_id', ownerId)
                        .update('sort_order', 0);

                    const primaryWithoutOwner = _.differenceBy(authorsPrimary, primaryWithOwner, 'post_id');
                    const primaryWithoutOwnerIds = primaryWithoutOwner.map(p => p.post_id);

                    // swap author with owner on remaining primary posts
                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', primaryWithoutOwnerIds)
                        .where('author_id', authorId)
                        .update('author_id', ownerId);

                    // delete any remaining secondary author rows
                    await knex('posts_authors')
                        .transacting(trx)
                        .where('author_id', authorId)
                        .del();
                } catch (err) {
                    throw new errors.InternalServerError({err});
                }
            };

            if (!options.transacting) {
                return ghostBookshelf.transaction(trx => {
                    options.transacting = trx;
                    return reassign();
                });
            }

            return reassign();
        },

        /**
         * Permission check for posts.
         *
         * @param {Object|number|string} postModelOrId
         * @param {string} action
         * @param {Object} context
         * @param {Object} unsafeAttrs
         * @param {Object} loadedPermissions
         * @param {boolean} hasUserPermission
         * @param {boolean} hasApiKeyPermission
         * @returns {Promise<Object>}
         */
        permissible: function (postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;

            // Resolve id → model if needed
            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                const origArgs = _.toArray(arguments).slice(1);
                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then(found => {
                        if (!found) {
                            throw new errors.NotFoundError({message: tpl(messages.postNotFound)});
                        }
                        return self.permissible.apply(self, [found, ...origArgs]);
                    });
            }

            const roleFlags = setIsRoles(loadedPermissions);
            const postModel = postModelOrId;
            const contextUser = context.user;

            const userHasPermission = evaluatePermission({
                roleFlags,
                action,
                unsafeAttrs,
                postModel,
                contextUser
            });

            if (userHasPermission && hasApiKeyPermission) {
                return Post.permissible.call(
                    this,
                    postModelOrId,
                    action,
                    context,
                    unsafeAttrs,
                    loadedPermissions,
                    userHasPermission,
                    hasApiKeyPermission
                ).then(({excludedAttrs}) => {
                    if (roleFlags.isContributor || roleFlags.isAuthor) {
                        return {excludedAttrs: ['authors', ...excludedAttrs]};
                    }
                    return {excludedAttrs};
                });
            }

            return Promise.reject(new errors.NoPermissionError({message: tpl(messages.notEnoughPermission)}));
        }
    });

    return Model;
};
```