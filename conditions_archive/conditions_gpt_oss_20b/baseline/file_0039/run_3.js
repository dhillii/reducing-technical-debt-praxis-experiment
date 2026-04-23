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

function normalizeWithRelated(options, fnName) {
    const original = _.cloneDeep(_.pick(options, ['withRelated']));
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
    return original;
}

function ensureAuthorsOnCreate(model, options) {
    if (!model.get('authors')) {
        model.set('authors', [{id: options.contextUser}]);
    }
}

function validateAuthorsExist(model) {
    if (model.get('authors') && !model.get('authors').length) {
        throw new errors.ValidationError({
            message: 'At least one author is required.'
        });
    }
}

async function matchAuthorsAsync(model, options, ghostBookshelf) {
    const ownerUser = await ghostBookshelf.model('User')
        .getOwnerUser(_.pick(options, 'transacting'));

    const authors = model.get('authors');
    const authorsToSet = [];

    await Promise.all(authors.map(async (author, index) => {
        const query = author.id ? {id: author.id} : author.slug ? {slug: author.slug} : author.email ? {email: author.email} : {};

        const user = await ghostBookshelf.model('User')
            .where(query)
            .fetch({columns: ['id'], ..._.pick(options, 'transacting')});

        const userId = user ? user.id : ownerUser.id;
        const exists = authorsToSet.find(a => a.id === userId);
        if (!exists) {
            authorsToSet[index] = {id: userId};
        }
    }));

    model.set('authors', authorsToSet);
}

async function reassignPostAsync(authorId, trx, ghostBookshelf) {
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
    } catch (err) {
        throw new errors.InternalServerError({err});
    }
}

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

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions(fnName) {
            return (model, attrs, options) => {
                const original = normalizeWithRelated(options, fnName);
                return proto[fnName].call(this, model, attrs, options);
            };
        },

        onFetching(model, attrs, options) {
            return this._handleOptions('onFetching')(model, attrs, options);
        },

        onFetchingCollection(collection, attrs, options) {
            return this._handleOptions('onFetchingCollection')(collection, attrs, options);
        },

        onFetchedCollection(collection, attrs, options) {
            collection.models.forEach(m => {
                m._originalOptions = collection._originalOptions;
            });
            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        async onCreating(model, attrs, options) {
            ensureAuthorsOnCreate(model, options);
            return this._handleOptions('onCreating')(model, attrs, options);
        },

        onUpdating(model, attrs, options) {
            return this._handleOptions('onUpdating')(model, attrs, options);
        },

        async onSaving(model, attrs, options) {
            model.unset('author');
            validateAuthorsExist(model);

            if (model.get('authors')) {
                await matchAuthorsAsync(model, options, ghostBookshelf);
            }
            return proto.onSaving.call(this, model, attrs, options);
        },

        serialize(options) {
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

        async matchAuthors(model, options) {
            await matchAuthorsAsync(model, options, ghostBookshelf);
        }
    }, {
        async reassignByAuthor(unfilteredOptions) {
            const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
            const authorId = options.id;

            if (!authorId) {
                return Promise.reject(new errors.NotFoundError({
                    message: tpl(messages.noUserFound)
                }));
            }

            const run = async () => {
                await reassignPostAsync(authorId, options.transacting, ghostBookshelf);
            };

            if (!options.transacting) {
                return ghostBookshelf.transaction(trx => {
                    options.transacting = trx;
                    return run();
                });
            }
            return run();
        },

        async permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const postModel = postModelOrId;
            let origArgs;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
            let isEdit, isAdd, isDestroy;

            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                origArgs = _.toArray(arguments).slice(1);
                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then(found => {
                        if (!found) {
                            throw new errors.NotFoundError({message: tpl(messages.postNotFound)});
                        }
                        const newArgs = [found].concat(origArgs);
                        return self.permissible.apply(self, newArgs);
                    });
            }

            isEdit = action === 'edit';
            isAdd = action === 'add';
            isDestroy = action === 'destroy';

            if (isContributor && isEdit) {
                hasUserPermission = !isChangingAuthors(unsafeAttrs, postModel) && isCoAuthor(context, postModel);
            } else if (isContributor && isAdd) {
                hasUserPermission = isOwner(unsafeAttrs, context);
            } else if (isContributor && isDestroy) {
                hasUserPermission = isPrimaryAuthor(context, postModel);
            } else if (isAuthor && isEdit) {
                hasUserPermission = isCoAuthor(context, postModel) && !isChangingAuthors(unsafeAttrs, postModel);
            } else if (isAuthor && isAdd) {
                hasUserPermission = isOwner(unsafeAttrs, context);
            } else if (postModel) {
                hasUserPermission = hasUserPermission || isPrimaryAuthor(context, postModel);
            }

            if (hasUserPermission && hasApiKeyPermission) {
                const result = await Post.permissible.call(
                    this,
                    postModelOrId,
                    action,
                    context,
                    unsafeAttrs,
                    loadedPermissions,
                    hasUserPermission,
                    hasApiKeyPermission
                );
                const {excludedAttrs} = result;
                if (isContributor || isAuthor) {
                    return {excludedAttrs: ['authors', ...excludedAttrs]};
                }
                return {excludedAttrs};
            }

            return Promise.reject(new errors.NoPermissionError({
                message: tpl(messages.notEnoughPermission)
            }));
        }
    });

    return Model;
};