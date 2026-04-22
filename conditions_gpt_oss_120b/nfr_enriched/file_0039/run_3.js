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
 * Extract and normalize `withRelated` option.
 */
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

/**
 * Ensure `authors` relation is requested for update operations.
 */
function ensureAuthorsForUpdate(fnName, options) {
    if (options.forUpdate && ['onFetching', 'onFetchingCollection'].includes(fnName) && !options.withRelated.includes('authors')) {
        options.withRelated.push('authors');
    }
}

/**
 * Wrap model lifecycle method to handle options.
 */
function wrapHandleOptions(proto, fnName) {
    return function (model, attrs, options) {
        model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));
        normalizeWithRelated(options);
        ensureAuthorsForUpdate(fnName, options);
        return proto[fnName].call(this, model, attrs, options);
    };
}

/**
 * Build ops for onSaving lifecycle.
 */
function buildOnSavingOps(context, model, options, proto) {
    const ops = [];

    // Remove deprecated single author field
    model.unset('author');

    // Validate authors presence
    if (model.get('authors') && !model.get('authors').length) {
        throw new errors.ValidationError({message: 'At least one author is required.'});
    }

    // Match authors if present
    if (model.get('authors')) {
        ops.push(() => context.matchAuthors(model, options));
    }

    // Continue with default onSaving
    ops.push(() => proto.onSaving.call(context, model, null, options));

    return ops;
}

/**
 * Resolve owner user and match authors to existing users.
 */
function buildMatchAuthorsOps(ghostBookshelf, model, options) {
    let ownerUser;
    const ops = [];

    // Get owner user
    ops.push(() => {
        return ghostBookshelf
            .model('User')
            .getOwnerUser(_.pick(options, 'transacting'))
            .then(user => {
                ownerUser = user;
            });
    });

    // Resolve each author entry
    ops.push(() => {
        const authors = model.get('authors');
        const authorsToSet = [];

        return Promise.all(authors.map((author, index) => {
            const query = {};
            if (author.id) query.id = author.id;
            else if (author.slug) query.slug = author.slug;
            else if (author.email) query.email = author.email;

            return ghostBookshelf
                .model('User')
                .where(query)
                .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')))
                .then(user => {
                    const userId = user ? user.id : ownerUser.id;
                    const exists = _.find(authorsToSet, {id: userId});
                    if (!exists) {
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
 * Permission helpers for `permissible`.
 */
function isChangingAuthors(unsafeAttrs, postModel) {
    if (!unsafeAttrs.authors) return false;
    if (!unsafeAttrs.authors.length) return true;
    return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
}
function isOwner(unsafeAttrs, context) {
    if (!unsafeAttrs.authors) return false;
    return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
}
function isPrimaryAuthor(context, postModel) {
    return context.user === postModel.related('authors').models[0].id;
}
function isCoAuthor(context, postModel) {
    return postModel.related('authors').models.map(a => a.id).includes(context.user);
}

/**
 * Resolve permission based on role and action.
 */
function evaluatePermission(params) {
    const {
        action,
        context,
        unsafeAttrs,
        postModel,
        loadedPermissions,
        hasUserPermission,
        hasApiKeyPermission
    } = params;

    const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
    const isEdit = action === 'edit';
    const isAdd = action === 'add';
    const isDestroy = action === 'destroy';

    if (isContributor && isEdit) {
        return !isChangingAuthors(unsafeAttrs, postModel) && isCoAuthor(context, postModel);
    }
    if (isContributor && isAdd) {
        return isOwner(unsafeAttrs, context);
    }
    if (isContributor && isDestroy) {
        return isPrimaryAuthor(context, postModel);
    }
    if (isAuthor && isEdit) {
        return isCoAuthor(context, postModel) && !isChangingAuthors(unsafeAttrs, postModel);
    }
    if (isAuthor && isAdd) {
        return isOwner(unsafeAttrs, context);
    }
    if (postModel) {
        return hasUserPermission || isPrimaryAuthor(context, postModel);
    }
    return false;
}

/**
 * Extend Post model with custom behaviour.
 */
module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions: function _handleOptions(fnName) {
            return wrapHandleOptions.call(this, proto, fnName);
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
            const ops = buildOnSavingOps(this, model, options, proto);
            return sequence(ops);
        },

        serialize: function (options) {
            let attrs = proto.serialize.call(this, options);

            if (!this._originalOptions) this._originalOptions = {};

            const withAuthors = this._originalOptions.withRelated && this._originalOptions.withRelated.includes('authors');
            if (!withAuthors) delete attrs.authors;

            if (!options.columns || options.columns.includes('primary_author')) {
                attrs.primary_author = (attrs.authors && attrs.authors.length) ? attrs.authors[0] : null;
            }

            return attrs;
        },

        matchAuthors: function (model, options) {
            const ops = buildMatchAuthorsOps(ghostBookshelf, model, options);
            return sequence(ops);
        }
    }, {
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

                    const authorsPrimary = authorsPosts.filter(p => p.sort_order === 0);
                    const primaryWithOwner = _.intersectionBy(authorsPrimary, ownersPosts, 'post_id');
                    const primaryWithOwnerIds = primaryWithOwner.map(p => p.post_id);

                    // Remove author from posts where owner is already co‑author and promote owner
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

                    const primaryWithoutOwner = _.differenceBy(authorsPrimary, primaryWithOwner, 'post_id');
                    const primaryWithoutOwnerIds = primaryWithoutOwner.map(p => p.post_id);

                    // Swap author with owner for primary posts without owner co‑author
                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', primaryWithoutOwnerIds)
                        .where('author_id', authorId)
                        .update('author_id', ownerId);

                    // Remove author from any secondary posts
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

        permissible: function (postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;

            // Resolve model if an ID was passed
            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                const origArgs = _.toArray(arguments).slice(1);
                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then(found => {
                        if (!found) {
                            throw new errors.NotFoundError({message: tpl(messages.postNotFound)});
                        }
                        return self.permissible.apply(self, [found].concat(origArgs));
                    });
            }

            const postModel = postModelOrId;
            const permissionGranted = evaluatePermission({
                action,
                context,
                unsafeAttrs,
                postModel,
                loadedPermissions,
                hasUserPermission,
                hasApiKeyPermission
            });

            if (permissionGranted && hasApiKeyPermission) {
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
                    if (setIsRoles(loadedPermissions).isContributor || setIsRoles(loadedPermissions).isAuthor) {
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
```