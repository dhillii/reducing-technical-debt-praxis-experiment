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

function handleOptions(fnName, proto, self) {
    return function (model, attrs, options) {
        model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

        if (!options.withRelated) {
            options.withRelated = [];
        }

        if (options.withRelated.indexOf('author') !== -1) {
            options.withRelated.splice(options.withRelated.indexOf('author'), 1);
            options.withRelated.push('authors');
        }

        if (options.forUpdate &&
            ['onFetching', 'onFetchingCollection'].indexOf(fnName) !== -1 &&
            options.withRelated.indexOf('authors') === -1) {
            options.withRelated.push('authors');
        }

        return proto[fnName].call(self, model, attrs, options);
    };
}

async function matchAuthorsAsync(model, options, ghostBookshelf) {
    const ownerUser = await ghostBookshelf
        .model('User')
        .getOwnerUser(_.pick(options, 'transacting'));

    const authors = model.get('authors') || [];
    const authorsToSet = [];

    await Promise.all(authors.map(async (author, index) => {
        const query = author.id ? {id: author.id} :
                      author.slug ? {slug: author.slug} :
                      author.email ? {email: author.email} : {};

        const user = await ghostBookshelf
            .model('User')
            .where(query)
            .fetch(_.assign({columns: ['id']}, _.pick(options, 'transacting')));

        const userId = user ? user.id : ownerUser.id;
        const exists = authorsToSet.find(a => a.id === userId);
        if (!exists) {
            authorsToSet[index] = {id: userId};
        }
    }));

    model.set('authors', authorsToSet);
}

async function reassignPostAsync(options, ghostBookshelf) {
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
    } catch (err) {
        throw new errors.InternalServerError({err});
    }
}

function permissibleHelpers(postModel, unsafeAttrs, context) {
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

    return {isChangingAuthors, isOwner, isPrimaryAuthor, isCoAuthor};
}

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        onFetching: function (model, attrs, options) {
            return handleOptions('onFetching', proto, this)(model, attrs, options);
        },

        onFetchingCollection: function (collection, attrs, options) {
            return handleOptions('onFetchingCollection', proto, this)(collection, attrs, options);
        },

        onFetchedCollection: function (collection, attrs, options) {
            collection.models.forEach(m => {
                m._originalOptions = collection._originalOptions;
            });
            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        onCreating: async function (model, attrs, options) {
            if (!model.get('authors')) {
                model.set('authors', [{id: await this.contextUser(options)}]);
            }
            return handleOptions('onCreating', proto, this)(model, attrs, options);
        },

        onUpdating: function (model, attrs, options) {
            return handleOptions('onUpdating', proto, this)(model, attrs, options);
        },

        onSaving: async function (model, attrs, options) {
            model.unset('author');

            if (model.get('authors') && !model.get('authors').length) {
                throw new errors.ValidationError({message: 'At least one author is required.'});
            }

            if (model.get('authors')) {
                await matchAuthorsAsync(model, options, ghostBookshelf);
            }

            return proto.onSaving.call(this, model, attrs, options);
        },

        serialize: function (options) {
            let attrs = proto.serialize.call(this, options);

            if (!this._originalOptions) this._originalOptions = {};

            if (!this._originalOptions.withRelated ||
                this._originalOptions.withRelated.indexOf('authors') === -1) {
                delete attrs.authors;
            }

            if (!options.columns || options.columns.indexOf('primary_author') > -1) {
                attrs.primary_author = (attrs.authors && attrs.authors.length) ? attrs.authors[0] : null;
            }

            return attrs;
        },

        matchAuthors: function (model, options) {
            return matchAuthorsAsync(model, options, ghostBookshelf);
        }
    }, {
        reassignByAuthor: async function (unfilteredOptions) {
            const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
            const authorId = options.id;

            if (!authorId) {
                return Promise.reject(new errors.NotFoundError({message: tpl(messages.noUserFound)}));
            }

            const run = () => reassignPostAsync(options, ghostBookshelf);

            if (!options.transacting) {
                return ghostBookshelf.transaction(transacting => {
                    options.transacting = transacting;
                    return run();
                });
            }

            return run();
        },

        permissible: function (postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const postModel = postModelOrId;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
            const isEdit = action === 'edit';
            const isAdd = action === 'add';
            const isDestroy = action === 'destroy';

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

            const {isChangingAuthors, isOwner, isPrimaryAuthor, isCoAuthor} = permissibleHelpers(postModel, unsafeAttrs, context);

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

            return Promise.reject(new errors.NoPermissionError({message: tpl(messages.notEnoughPermission)}));
        }
    });

    return Model;
};