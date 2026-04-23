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

function cloneOriginalOptions(options) {
    return _.cloneDeep(_.pick(options, ['withRelated']));
}

function normalizeWithRelated(options) {
    if (!options.withRelated) {
        options.withRelated = [];
    }

    const idx = options.withRelated.indexOf('author');
    if (idx !== -1) {
        options.withRelated.splice(idx, 1);
        options.withRelated.push('authors');
    }
}

function ensureAuthorsRelated(fnName, options) {
    if (options.forUpdate && ['onFetching', 'onFetchingCollection'].includes(fnName) && !options.withRelated.includes('authors')) {
        options.withRelated.push('authors');
    }
}

function handleOptions(self, proto, fnName, model, attrs, options) {
    model._originalOptions = cloneOriginalOptions(options);
    normalizeWithRelated(options);
    ensureAuthorsRelated(fnName, options);
    return proto[fnName].call(self, model, attrs, options);
}

function onFetchedCollection(proto, collection, attrs, options) {
    _.each(collection.models, model => {
        model._originalOptions = collection._originalOptions;
    });
    return proto.onFetchedCollection.call(this, collection, attrs, options);
}

function onSavingSequence(self, model, attrs, options, proto) {
    const ops = [];

    model.unset('author');

    if (model.get('authors') && !model.get('authors').length) {
        throw new errors.ValidationError({message: 'At least one author is required.'});
    }

    if (model.get('authors')) {
        ops.push(() => self.matchAuthors(model, options));
    }

    ops.push(() => proto.onSaving.call(self, model, attrs, options));

    return sequence(ops);
}

function serializeAttrs(self, options, proto) {
    let attrs = proto.serialize.call(self, options);

    if (!self._originalOptions) {
        self._originalOptions = {};
    }

    const related = self._originalOptions.withRelated || [];
    if (!related.includes('authors')) {
        delete attrs.authors;
    }

    if (!options.columns || options.columns.includes('primary_author')) {
        attrs.primary_author = (attrs.authors && attrs.authors.length) ? attrs.authors[0] : null;
    }

    return attrs;
}

function fetchOwnerUser(ghostBookshelf, options) {
    return ghostBookshelf
        .model('User')
        .getOwnerUser(_.pick(options, 'transacting'));
}

function resolveAuthorIds(ghostBookshelf, authors, ownerUser, options) {
    const authorsToSet = [];

    return Promise.all(authors.map((author, index) => {
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
                if (!authorsToSet.find(a => a && a.id === userId)) {
                    authorsToSet[index] = {id: userId};
                }
            });
    })).then(() => authorsToSet);
}

function matchAuthors(self, model, options, ghostBookshelf) {
    let ownerUser;

    return sequence([
        () => fetchOwnerUser(ghostBookshelf, options).then(u => { ownerUser = u; }),
        () => resolveAuthorIds(ghostBookshelf, model.get('authors'), ownerUser, options)
            .then(authorsToSet => model.set('authors', authorsToSet))
    ]);
}

function reassignByAuthor(Model, ghostBookshelf, unfilteredOptions) {
    const options = Model.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
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

            await knex('posts_authors')
                .transacting(trx)
                .whereIn('post_id', primaryWithoutOwnerIds)
                .where('author_id', authorId)
                .update('author_id', ownerId);

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
}

function permissible(Model, postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
    const self = this;
    const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
    const isEdit = action === 'edit';
    const isAdd = action === 'add';
    const isDestroy = action === 'destroy';

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

    const postModel = postModelOrId;

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
        return Model.permissible.call(
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

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions(fnName) {
            const self = this;
            return (model, attrs, options) => handleOptions(self, proto, fnName, model, attrs, options);
        },

        onFetching(model, attrs, options) {
            return this._handleOptions('onFetching')(model, attrs, options);
        },

        onFetchingCollection(collection, attrs, options) {
            return this._handleOptions('onFetchingCollection')(collection, attrs, options);
        },

        onFetchedCollection(collection, attrs, options) {
            return onFetchedCollection.call(this, collection, attrs, options);
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
            return onSavingSequence(this, model, attrs, options, proto);
        },

        serialize(options) {
            return serializeAttrs(this, options, proto);
        },

        matchAuthors(model, options) {
            return matchAuthors(this, model, options, ghostBookshelf);
        }
    }, {
        reassignByAuthor(unfilteredOptions) {
            return reassignByAuthor(this, ghostBookshelf, unfilteredOptions);
        },

        permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            return permissible.call(this, postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission);
        }
    });

    return Model;
};
```