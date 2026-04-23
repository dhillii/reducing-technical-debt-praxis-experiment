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
 * Wrap model method with options handling logic.
 */
function wrapWithOptionHandler(proto, fnName) {
    return function (model, attrs, options) {
        model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

        if (!options.withRelated) {
            options.withRelated = [];
        }

        // replace legacy `author` with `authors`
        const authorIdx = options.withRelated.indexOf('author');
        if (authorIdx !== -1) {
            options.withRelated.splice(authorIdx, 1, 'authors');
        }

        // ensure authors are fetched on update related calls
        if (options.forUpdate && ['onFetching', 'onFetchingCollection'].includes(fnName) && !options.withRelated.includes('authors')) {
            options.withRelated.push('authors');
        }

        return proto[fnName].call(this, model, attrs, options);
    };
}

/**
 * Serialize post with optional primary author handling.
 */
function serializePost(proto, options) {
    let attrs = proto.serialize.call(this, options);

    if (!this._originalOptions) {
        this._originalOptions = {};
    }

    const withAuthors = this._originalOptions.withRelated && this._originalOptions.withRelated.includes('authors');
    if (!withAuthors) {
        delete attrs.authors;
    }

    if (!options.columns || options.columns.includes('primary_author')) {
        attrs.primary_author = (attrs.authors && attrs.authors.length) ? attrs.authors[0] : null;
    }

    return attrs;
}

/**
 * Validate and prepare authors before saving.
 */
async function prepareAuthorsOnSaving(model, options, proto, matchAuthors) {
    model.unset('author');

    if (model.get('authors') && !model.get('authors').length) {
        throw new errors.ValidationError({message: 'At least one author is required.'});
    }

    const ops = [];

    if (model.get('authors')) {
        ops.push(() => matchAuthors.call(this, model, options));
    }

    ops.push(() => proto.onSaving.call(this, model, null, options));

    return sequence(ops);
}

/**
 * Resolve authors to user IDs, falling back to owner if needed.
 */
function matchAuthorsHelper(ghostBookshelf) {
    return async function (model, options) {
        let ownerUser;
        const ops = [];

        // fetch owner user
        ops.push(() => ghostBookshelf
            .model('User')
            .getOwnerUser(_.pick(options, 'transacting'))
            .then(user => { ownerUser = user; })
        );

        // resolve each author entry
        ops.push(() => {
            const authors = model.get('authors') || [];
            const resolved = [];

            return Promise.all(authors.map(async (author, idx) => {
                const query = author.id ? {id: author.id}
                    : author.slug ? {slug: author.slug}
                    : author.email ? {email: author.email}
                    : {};

                const user = await ghostBookshelf
                    .model('User')
                    .where(query)
                    .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')));

                const userId = user ? user.id : ownerUser.id;
                if (!resolved.find(a => a.id === userId)) {
                    resolved[idx] = {id: userId};
                }
            })).then(() => {
                model.set('authors', resolved);
            });
        });

        return sequence(ops);
    };
}

/**
 * Reassign posts from a deleted author to the owner.
 */
function reassignByAuthorHelper(ghostBookshelf) {
    return async function (unfilteredOptions) {
        const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
        const authorId = options.id;

        if (!authorId) {
            return Promise.reject(new errors.NotFoundError({message: tpl(messages.noUserFound)}));
        }

        const runReassign = async () => {
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

                const primaryAuthors = authorsPosts.filter(p => p.sort_order === 0);
                const primaryWithOwner = _.intersectionBy(primaryAuthors, ownersPosts, 'post_id');
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

                const primaryWithoutOwner = _.differenceBy(primaryAuthors, primaryWithOwner, 'post_id');
                const primaryWithoutOwnerIds = primaryWithoutOwner.map(p => p.post_id);

                // swap author with owner on remaining primary posts
                await knex('posts_authors')
                    .transacting(trx)
                    .whereIn('post_id', primaryWithoutOwnerIds)
                    .where('author_id', authorId)
                    .update('author_id', ownerId);

                // delete any secondary author entries
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
                return runReassign();
            });
        }

        return runReassign();
    };
}

/**
 * Permission checks for post actions.
 */
function permissibleHelper(Post, setIsRoles) {
    return async function (postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
        const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
        const self = this;

        // Resolve model if only an ID was supplied
        if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
            const origArgs = _.toArray(arguments).slice(1);
            const found = await this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']});
            if (!found) {
                throw new errors.NotFoundError({message: tpl(messages.postNotFound)});
            }
            return self.permissible.apply(self, [found, ...origArgs]);
        }

        const postModel = postModelOrId;
        const isEdit = action === 'edit';
        const isAdd = action === 'add';
        const isDestroy = action === 'destroy';

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

        // Determine user permission based on role and action
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
            const {excludedAttrs} = await Post.permissible.call(
                this,
                postModelOrId,
                action,
                context,
                unsafeAttrs,
                loadedPermissions,
                hasUserPermission,
                hasApiKeyPermission
            );

            if (isContributor || isAuthor) {
                return {excludedAttrs: ['authors', ...excludedAttrs]};
            }
            return {excludedAttrs};
        }

        throw new errors.NoPermissionError({message: tpl(messages.notEnoughPermission)});
    };
}

/**
 * Extend Post model with author handling logic.
 */
module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;
    const matchAuthors = matchAuthorsHelper(ghostBookshelf);
    const reassignByAuthor = reassignByAuthorHelper(ghostBookshelf);
    const permissible = permissibleHelper(Post, setIsRoles);

    const Model = Post.extend({
        _handleOptions: function (fnName) {
            return wrapWithOptionHandler(proto, fnName).bind(this);
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
            return prepareAuthorsOnSaving.call(this, model, options, proto, matchAuthors);
        },

        serialize: function (options) {
            return serializePost.call(this, proto, options);
        },

        matchAuthors
    }, {
        reassignByAuthor,
        permissible
    });

    return Model;
};
```