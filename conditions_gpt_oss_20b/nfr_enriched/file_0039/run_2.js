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
 * Handle options for fetching authors.
 * @private
 */
function handleOptions(fnName, model, attrs, options) {
    const self = this;
    const original = _.cloneDeep(_.pick(options, ['withRelated']));
    model._originalOptions = original;

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

    return proto[fnName].call(self, model, attrs, options);
}

/**
 * Match authors to existing users or fallback to owner.
 * @private
 */
async function matchAuthors(model, options, ghostBookshelf) {
    const ownerUser = await ghostBookshelf
        .model('User')
        .getOwnerUser(_.pick(options, 'transacting'));

    const authors = model.get('authors') || [];
    const authorsToSet = await Promise.all(authors.map(async (author, index) => {
        const query = author.id ? {id: author.id} :
                      author.slug ? {slug: author.slug} :
                      author.email ? {email: author.email} : {};

        const user = await ghostBookshelf
            .model('User')
            .where(query)
            .fetch(_.assign({columns: ['id']}, _.pick(options, 'transacting')));

        const userId = user ? user.id : ownerUser.id;
        return {id: userId};
    }));

    model.set('authors', authorsToSet);
}

/**
 * Reassign posts from one author to the owner.
 * @private
 */
async function reassignPost(options, ghostBookshelf, ownerId, authorId) {
    const trx = options.transacting;
    const knex = ghostBookshelf.knex;

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
    const withoutOwnerIds = primaryWithoutOwner.map(p => p.post_id);

    await knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', withoutOwnerIds)
        .where('author_id', authorId)
        .update('author_id', ownerId);

    await knex('posts_authors')
        .transacting(trx)
        .where('author_id', authorId)
        .del();
}

/**
 * Permission helper functions.
 * @private
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

function isPrimaryAuthor(postModel, context) {
    return context.user === postModel.related('authors').models[0].id;
}

function isCoAuthor(postModel, context) {
    return postModel.related('authors').models.map(a => a.id).includes(context.user);
}

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        onFetching: function (model, attrs, options) {
            return handleOptions.call(this, 'onFetching', model, attrs, options);
        },

        onFetchingCollection: function (collection, attrs, options) {
            return handleOptions.call(this, 'onFetchingCollection', collection, attrs, options);
        },

        onFetchedCollection: function (collection, attrs, options) {
            collection.models.forEach(m => { m._originalOptions = collection._originalOptions; });
            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        onCreating: async function (model, attrs, options) {
            if (!model.get('authors')) {
                model.set('authors', [{id: await this.contextUser(options)}]);
            }
            return handleOptions.call(this, 'onCreating', model, attrs, options);
        },

        onUpdating: function (model, attrs, options) {
            return handleOptions.call(this, 'onUpdating', model, attrs, options);
        },

        onSaving: async function (model, attrs, options) {
            model.unset('author');

            if (model.get('authors') && !model.get('authors').length) {
                throw new errors.ValidationError({message: 'At least one author is required.'});
            }

            if (model.get('authors')) {
                await matchAuthors.call(this, model, options, ghostBookshelf);
            }

            return proto.onSaving.call(this, model, attrs, options);
        },

        serialize: function (options) {
            const attrs = proto.serialize.call(this, options);

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
            return matchAuthors.call(this, model, options, ghostBookshelf);
        }
    }, {
        reassignByAuthor: async function (unfilteredOptions) {
            const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
            const authorId = options.id;

            if (!authorId) {
                return Promise.reject(new errors.NotFoundError({message: tpl(messages.noUserFound)}));
            }

            const trx = options.transacting;
            const knex = ghostBookshelf.knex;

            const ownerUser = await knex('roles')
                .transacting(trx)
                .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
                .where('roles.name', 'Owner')
                .select('roles_users.user_id');

            const ownerId = ownerUser[0].user_id;

            const reassign = async () => {
                await reassignPost(options, ghostBookshelf, ownerId, authorId);
            };

            if (!options.transacting) {
                return ghostBookshelf.transaction(transacting => {
                    options.transacting = transacting;
                    return reassign();
                });
            }

            return reassign();
        },

        permissible: function (postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const postModel = postModelOrId;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);

            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                const origArgs = _.toArray(arguments).slice(1);
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

            if (isContributor && isEdit) {
                hasUserPermission = !isChangingAuthors(unsafeAttrs, postModel) && isCoAuthor(postModel, context);
            } else if (isContributor && isAdd) {
                hasUserPermission = isOwner(unsafeAttrs, context);
            } else if (isContributor && isDestroy) {
                hasUserPermission = isPrimaryAuthor(postModel, context);
            } else if (isAuthor && isEdit) {
                hasUserPermission = isCoAuthor(postModel, context) && !isChangingAuthors(unsafeAttrs, postModel);
            } else if (isAuthor && isAdd) {
                hasUserPermission = isOwner(unsafeAttrs, context);
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
```