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
 * Clone original options and ensure `authors` relation is present when needed.
 * @param {Object} model
 * @param {Object} attrs
 * @param {Object} options
 * @param {string} fnName
 * @param {Object} proto
 * @returns {Promise}
 */
function handleOptions(model, attrs, options, fnName, proto) {
    model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

    if (!options.withRelated) {
        options.withRelated = [];
    }

    const authorIdx = options.withRelated.indexOf('author');
    if (authorIdx !== -1) {
        options.withRelated.splice(authorIdx, 1);
        options.withRelated.push('authors');
    }

    if (options.forUpdate &&
        ['onFetching', 'onFetchingCollection'].includes(fnName) &&
        !options.withRelated.includes('authors')) {
        options.withRelated.push('authors');
    }

    return proto[fnName].call(this, model, attrs, options);
}

/**
 * Validate authors array and delegate to matchAuthors if needed.
 * @param {Object} model
 * @param {Object} options
 * @param {Object} proto
 * @param {Object} context
 * @returns {Promise}
 */
function onSavingOps(model, options, proto, context) {
    model.unset('author');

    if (model.get('authors') && !model.get('authors').length) {
        throw new errors.ValidationError({
            message: 'At least one author is required.'
        });
    }

    const ops = [];

    if (model.get('authors')) {
        ops.push(() => context.matchAuthors(model, options));
    }

    ops.push(() => proto.onSaving.call(context, model, null, options));

    return sequence(ops);
}

/**
 * Resolve author identifiers to user IDs and set on model.
 * @param {Object} model
 * @param {Object} options
 * @param {Object} ghostBookshelf
 * @returns {Promise}
 */
function matchAuthorsFactory(ghostBookshelf) {
    return async function matchAuthors(model, options) {
        let ownerUser;
        const ops = [];

        ops.push(() => {
            return ghostBookshelf
                .model('User')
                .getOwnerUser(Object.assign({}, _.pick(options, 'transacting')))
                .then(u => {
                    ownerUser = u;
                });
        });

        ops.push(() => {
            const authors = model.get('authors');
            const authorsToSet = [];

            return Promise.all(authors.map((author, index) => {
                const query = {};

                if (author.id) {
                    query.id = author.id;
                } else if (author.slug) {
                    query.slug = author.slug;
                } else if (author.email) {
                    query.email = author.email;
                }

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

        return sequence(ops);
    };
}

/**
 * Permission predicates
 */
function isChangingAuthors(unsafeAttrs, postModel, context) {
    if (!unsafeAttrs.authors) {
        return false;
    }
    if (!unsafeAttrs.authors.length) {
        return true;
    }
    return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
}
function isOwner(unsafeAttrs, context) {
    if (!unsafeAttrs.authors) {
        return false;
    }
    return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
}
function isPrimaryAuthor(postModel, context) {
    return context.user === postModel.related('authors').models[0].id;
}
function isCoAuthor(postModel, context) {
    return postModel.related('authors').models.map(a => a.id).includes(context.user);
}

/**
 * Permission lookup based on role and action
 */
const permissionMatrix = {
    contributor: {
        edit: (postModel, unsafeAttrs, context) => !isChangingAuthors(unsafeAttrs, postModel, context) && isCoAuthor(postModel, context),
        add: (postModel, unsafeAttrs, context) => isOwner(unsafeAttrs, context),
        destroy: (postModel, unsafeAttrs, context) => isPrimaryAuthor(postModel, context)
    },
    author: {
        edit: (postModel, unsafeAttrs, context) => isCoAuthor(postModel, context) && !isChangingAuthors(unsafeAttrs, postModel, context),
        add: (postModel, unsafeAttrs, context) => isOwner(unsafeAttrs, context)
    }
};

/**
 * Resolve permission based on role/action matrix.
 * @param {string} role
 * @param {string} action
 * @param {Object} postModel
 * @param {Object} unsafeAttrs
 * @param {Object} context
 * @returns {boolean}
 */
function evaluatePermission(role, action, postModel, unsafeAttrs, context) {
    const roleMap = permissionMatrix[role];
    if (!roleMap) {
        return false;
    }
    const evaluator = roleMap[action];
    if (!evaluator) {
        return false;
    }
    return evaluator(postModel, unsafeAttrs, context);
}

/**
 * Serialize helper to attach primary_author when needed.
 * @param {Object} attrs
 * @param {Object} options
 * @param {Object} originalOptions
 * @returns {Object}
 */
function serializeAttrs(attrs, options, originalOptions) {
    if (!originalOptions || !originalOptions.withRelated || !originalOptions.withRelated.includes('authors')) {
        delete attrs.authors;
    }

    if (!options.columns || options.columns.includes('primary_author')) {
        attrs.primary_author = (attrs.authors && attrs.authors.length) ? attrs.authors[0] : null;
    }

    return attrs;
}

/**
 * Model extension
 */
module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;
    const matchAuthors = matchAuthorsFactory(ghostBookshelf);

    const Model = Post.extend({
        _handleOptions(fnName) {
            const self = this;
            return function (model, attrs, options) {
                return handleOptions.call(self, model, attrs, options, fnName, proto);
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
            return onSavingOps.call(this, model, options, proto, this);
        },

        serialize(options) {
            const attrs = proto.serialize.call(this, options);
            const originalOptions = this._originalOptions || {};
            return serializeAttrs(attrs, options, originalOptions);
        },

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
                return ghostBookshelf.transaction(transacting => {
                    options.transacting = transacting;
                    return reassign();
                });
            }

            return reassign();
        },

        permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);

            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                const origArgs = _.toArray(arguments).slice(1);
                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then(found => {
                        if (!found) {
                            throw new errors.NotFoundError({
                                message: tpl(messages.postNotFound)
                            });
                        }
                        return self.permissible.apply(self, [found].concat(origArgs));
                    });
            }

            const postModel = postModelOrId;
            const role = isContributor ? 'contributor' : isAuthor ? 'author' : null;
            const permissionGranted = role ? evaluatePermission(role, action, postModel, unsafeAttrs, context) : false;

            const finalPermission = permissionGranted || (postModel && isPrimaryAuthor(postModel, context));

            if (finalPermission && hasApiKeyPermission) {
                return Post.permissible.call(
                    this,
                    postModelOrId,
                    action,
                    context,
                    unsafeAttrs,
                    loadedPermissions,
                    finalPermission,
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
```