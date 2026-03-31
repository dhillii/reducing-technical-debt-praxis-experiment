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

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function shouldEnsureAuthors(fnName, options) {
    const fetchingHooks = ['onFetching', 'onFetchingCollection'];
    return options.forUpdate &&
        fetchingHooks.includes(fnName) &&
        !options.withRelated.includes('authors');
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

// ─── Author Matching ─────────────────────────────────────────────────────────

async function fetchOwnerUser(ghostBookshelf, options) {
    return ghostBookshelf
        .model('User')
        .getOwnerUser(Object.assign({}, pickTransacting(options)));
}

async function resolveAuthor(ghostBookshelf, author, ownerUser, options) {
    const query = buildAuthorQuery(author);
    const user = await ghostBookshelf
        .model('User')
        .where(query)
        .fetch(Object.assign({columns: ['id']}, pickTransacting(options)));

    return user ? user.id : ownerUser.id;
}

async function matchAuthors(model, options, ghostBookshelf) {
    const ownerUser = await fetchOwnerUser(ghostBookshelf, options);
    const authors = model.get('authors');
    const authorsToSet = [];

    await Promise.all(authors.map(async (author, index) => {
        const userId = await resolveAuthor(ghostBookshelf, author, ownerUser, options);
        const alreadyAdded = _.find(authorsToSet, {id: userId.id});

        if (!alreadyAdded) {
            authorsToSet[index] = {id: userId};
        }
    }));

    model.set('authors', authorsToSet);
}

// ─── Reassign Helpers ────────────────────────────────────────────────────────

async function fetchOwnerId(knex, trx) {
    const rows = await knex('roles')
        .transacting(trx)
        .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
        .where('roles.name', 'Owner')
        .select('roles_users.user_id');
    return rows[0].user_id;
}

async function reassignPostsToOwner(knex, trx, authorId, ownerId) {
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

    // Remove author from co-authored primary posts and promote owner to primary
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

    // Swap author with owner on sole-author primary posts
    const primaryPostsWithoutOwner = _.differenceBy(authorsPrimaryPosts, primaryPostsWithOwnerCoauthor, 'post_id');
    const postsWithoutOwnerIds = primaryPostsWithoutOwner.map(p => p.post_id);

    await knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', postsWithoutOwnerIds)
        .where('author_id', authorId)
        .update('author_id', ownerId);

    // Remove author as secondary author from remaining posts
    await knex('posts_authors')
        .transacting(trx)
        .where('author_id', authorId)
        .del();
}

// ─── Permissible Helpers ─────────────────────────────────────────────────────

function isChangingAuthors(unsafeAttrs, postModel) {
    if (!unsafeAttrs.authors) return false;
    if (!unsafeAttrs.authors.length) return true;
    return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
}

function isOwner(unsafeAttrs, context) {
    if (!unsafeAttrs.authors) return false;
    return unsafeAttrs.authors.length > 0 && unsafeAttrs.authors[0].id === context.user;
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

// ─── Model Extension ─────────────────────────────────────────────────────────

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions: function _handleOptions(fnName) {
            const self = this;

            return function innerHandleOptions(model, attrs, options) {
                model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

                normaliseWithRelated(options);

                if (shouldEnsureAuthors(fnName, options)) {
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
            // @deprecated: `author` superseded by multiple authors since Ghost 1.22.0
            model.unset('author');

            if (model.get('authors') && !model.get('authors').length) {
                throw new errors.ValidationError({
                    message: 'At least one author is required.'
                });
            }

            const ops = [];

            if (model.get('authors')) {
                ops.push(() => matchAuthors(model, options, ghostBookshelf));
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

            const doReassign = async () => {
                const trx = options.transacting;
                const knex = ghostBookshelf.knex;

                try {
                    const ownerId = await fetchOwnerId(knex, trx);
                    await reassignPostsToOwner(knex, trx, authorId, ownerId);
                } catch (err) {
                    throw new errors.InternalServerError({err});
                }
            };

            if (!options.transacting) {
                return ghostBookshelf.transaction((transacting) => {
                    options.transacting = transacting;
                    return doReassign();
                });
            }

            return doReassign();
        },

        permissible: function permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);

            // Resolve model from id/string before checking permissions
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
                isContributor, isAuthor, isEdit, isAdd, isDestroy,
                postModel, unsafeAttrs, context, hasUserPermission
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