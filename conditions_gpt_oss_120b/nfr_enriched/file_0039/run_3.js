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
 * Clone only the needed options for later reference.
 */
function captureOriginalOptions(options) {
    return _.cloneDeep(_.pick(options, ['withRelated']));
}

/**
 * Normalise the `withRelated` option to always use `authors`.
 */
function normaliseWithRelated(options) {
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
 * Ensure `authors` relation is requested when needed.
 */
function ensureAuthorsRelation(options, fnName) {
    if (options.forUpdate && ['onFetching', 'onFetchingCollection'].includes(fnName) && !options.withRelated.includes('authors')) {
        options.withRelated.push('authors');
    }
}

/**
 * Wrap a model method to handle option normalisation.
 */
function wrapHandleOptions(proto, fnName) {
    return function (model, attrs, options) {
        model._originalOptions = captureOriginalOptions(options);
        normaliseWithRelated(options);
        ensureAuthorsRelation(options, fnName);
        return proto[fnName].call(this, model, attrs, options);
    };
}

/**
 * Remove duplicate authors and resolve each author to a user id.
 */
function resolveAuthors(ghostBookshelf, model, options) {
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
        const authors = model.get('authors') || [];
        const resolved = [];

        return Promise.all(authors.map((author, idx) => {
            const query = author.id ? {id: author.id}
                : author.slug ? {slug: author.slug}
                : author.email ? {email: author.email}
                : {};

            return ghostBookshelf
                .model('User')
                .where(query)
                .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')))
                .then(user => {
                    const userId = user ? user.id : ownerUser.id;
                    if (!resolved.find(a => a.id === userId)) {
                        resolved[idx] = {id: userId};
                    }
                });
        })).then(() => {
            model.set('authors', resolved);
        });
    });

    return sequence(ops);
}

/**
 * Determine if the request is trying to delete all authors.
 */
function validateAuthorsPresence(model) {
    if (model.get('authors') && !model.get('authors').length) {
        throw new errors.ValidationError({
            message: 'At least one author is required.'
        });
    }
}

/**
 * Helper for permissible checks.
 */
function buildPermissionHelpers(postModel, unsafeAttrs, context) {
    const hasAuthors = !!unsafeAttrs.authors;
    const firstUnsafeAuthor = hasAuthors && unsafeAttrs.authors[0];
    const currentAuthors = postModel.related('authors').models.map(a => a.id);
    const primaryAuthorId = postModel.related('authors').models[0].id;

    return {
        isChangingAuthors() {
            if (!hasAuthors) return false;
            if (!unsafeAttrs.authors.length) return true;
            return firstUnsafeAuthor.id !== primaryAuthorId;
        },
        isOwner() {
            return hasAuthors && unsafeAttrs.authors.length && firstUnsafeAuthor.id === context.user;
        },
        isPrimaryAuthor() {
            return context.user === primaryAuthorId;
        },
        isCoAuthor() {
            return currentAuthors.includes(context.user);
        }
    };
}

/**
 * Serialize post with optional primary_author field.
 */
function serializePost(proto, postInstance, options) {
    let attrs = proto.serialize.call(postInstance, options);

    if (!postInstance._originalOptions) {
        postInstance._originalOptions = {};
    }

    const withAuthors = postInstance._originalOptions.withRelated && postInstance._originalOptions.withRelated.includes('authors');
    if (!withAuthors) {
        delete attrs.authors;
    }

    const includePrimary = !options.columns || options.columns.includes('primary_author');
    if (includePrimary) {
        attrs.primary_author = (attrs.authors && attrs.authors.length) ? attrs.authors[0] : null;
    }

    return attrs;
}

/**
 * Reassign posts from a departing author to the owner.
 */
async function reassignPostsByAuthor(ghostBookshelf, unfilteredOptions) {
    const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
    const authorId = options.id;

    if (!authorId) {
        return Promise.reject(new errors.NotFoundError({message: tpl(messages.noUserFound)}));
    }

    const trx = options.transacting;
    const knex = ghostBookshelf.knex;

    try {
        const ownerRow = await knex('roles')
            .transacting(trx)
            .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
            .where('roles.name', 'Owner')
            .select('roles_users.user_id')
            .first();

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

        // Remove author from primary posts where owner is co‑author
        await knex('posts_authors')
            .transacting(trx)
            .whereIn('post_id', primaryWithOwnerIds)
            .where('author_id', authorId)
            .del();

        // Promote owner to primary author
        await knex('posts_authors')
            .transacting(trx)
            .whereIn('post_id', primaryWithOwnerIds)
            .where('author_id', ownerId)
            .update('sort_order', 0);

        const primaryWithoutOwner = _.differenceBy(authorsPrimary, primaryWithOwner, 'post_id');
        const primaryWithoutOwnerIds = primaryWithoutOwner.map(p => p.post_id);

        // Swap author with owner on remaining primary posts
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
}

/**
 * Main model extension.
 */
module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        onFetching(model, attrs, options) {
            return wrapHandleOptions(proto, 'onFetching').call(this, model, attrs, options);
        },

        onFetchingCollection(collection, attrs, options) {
            return wrapHandleOptions(proto, 'onFetchingCollection').call(this, collection, attrs, options);
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
            return wrapHandleOptions(proto, 'onCreating').call(this, model, attrs, options);
        },

        onUpdating(model, attrs, options) {
            return wrapHandleOptions(proto, 'onUpdating').call(this, model, attrs, options);
        },

        onSaving(model, attrs, options) {
            const ops = [];

            // Remove deprecated single author field
            model.unset('author');

            // Validate at least one author
            validateAuthorsPresence(model);

            if (model.get('authors')) {
                ops.push(() => resolveAuthors(ghostBookshelf, model, options));
            }

            ops.push(() => proto.onSaving.call(this, model, attrs, options));

            return sequence(ops);
        },

        serialize(options) {
            return serializePost(proto, this, options);
        },

        matchAuthors(model, options) {
            return resolveAuthors(ghostBookshelf, model, options);
        }
    }, {
        async reassignByAuthor(unfilteredOptions) {
            if (!unfilteredOptions.transacting) {
                return ghostBookshelf.transaction(trx => {
                    unfilteredOptions.transacting = trx;
                    return reassignPostsByAuthor.call(this, ghostBookshelf, unfilteredOptions);
                });
            }
            return reassignPostsByAuthor.call(this, ghostBookshelf, unfilteredOptions);
        },

        permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;

            // Resolve id to model if needed
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
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
            const isEdit = action === 'edit';
            const isAdd = action === 'add';
            const isDestroy = action === 'destroy';

            const {
                isChangingAuthors,
                isOwner,
                isPrimaryAuthor,
                isCoAuthor
            } = buildPermissionHelpers(postModel, unsafeAttrs, context);

            if (isContributor) {
                if (isEdit) {
                    hasUserPermission = !isChangingAuthors() && isCoAuthor();
                } else if (isAdd) {
                    hasUserPermission = isOwner();
                } else if (isDestroy) {
                    hasUserPermission = isPrimaryAuthor();
                }
            } else if (isAuthor) {
                if (isEdit) {
                    hasUserPermission = isCoAuthor() && !isChangingAuthors();
                } else if (isAdd) {
                    hasUserPermission = isOwner();
                }
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