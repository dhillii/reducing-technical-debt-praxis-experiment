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
 * @param {Object} model
 * @param {Object} options
 * @returns {Promise<void>}
 */
async function ensureAuthorExists(model, options) {
    if (!model.get('authors')) {
        model.set('authors', [{id: await this.contextUser(options)}]);
    }
}

/**
 * @param {Object} model
 * @param {Object} options
 * @returns {Promise<void>}
 */
function validateAuthorsPresence(model) {
    if (model.get('authors') && !model.get('authors').length) {
        throw new errors.ValidationError({
            message: 'At least one author is required.'
        });
    }
}

/**
 * @param {Object} model
 * @param {Object} options
 * @returns {Promise<void>}
 */
function unsetLegacyAuthor(model) {
    model.unset('author');
}

/**
 * @param {Object} model
 * @param {Object} options
 * @returns {Promise<void>}
 */
function matchAuthors(model, options) {
    let ownerUser;
    const ops = [];

    ops.push(() => {
        return ghostBookshelf
            .model('User')
            .getOwnerUser(Object.assign({}, _.pick(options, 'transacting')))
            .then((_ownerUser) => {
                ownerUser = _ownerUser;
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
                .then((user) => {
                    const userId = user ? user.id : ownerUser.id;

                    // Avoid duplicate authors
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
}

/**
 * @param {Object} unsafeAttrs
 * @param {Object} postModel
 * @param {Object} context
 * @returns {boolean}
 */
function isChangingAuthors(unsafeAttrs, postModel) {
    if (!unsafeAttrs.authors) {
        return false;
    }
    if (!unsafeAttrs.authors.length) {
        return true;
    }
    return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
}

/**
 * @param {Object} unsafeAttrs
 * @param {Object} context
 * @returns {boolean}
 */
function isOwner(unsafeAttrs, context) {
    if (!unsafeAttrs.authors) {
        return false;
    }
    return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
}

/**
 * @param {Object} postModel
 * @param {Object} context
 * @returns {boolean}
 */
function isPrimaryAuthor(postModel, context) {
    return context.user === postModel.related('authors').models[0].id;
}

/**
 * @param {Object} postModel
 * @param {Object} context
 * @returns {boolean}
 */
function isCoAuthor(postModel, context) {
    return postModel.related('authors').models.map(author => author.id).includes(context.user);
}

/**
 * Permission strategy map based on role and action.
 */
const permissionStrategies = {
    contributor: {
        edit: (postModel, unsafeAttrs, context) => !isChangingAuthors(unsafeAttrs, postModel) && isCoAuthor(postModel, context),
        add: (postModel, unsafeAttrs, context) => isOwner(unsafeAttrs, context),
        destroy: (postModel) => isPrimaryAuthor(postModel, context)
    },
    author: {
        edit: (postModel, unsafeAttrs, context) => isCoAuthor(postModel, context) && !isChangingAuthors(unsafeAttrs, postModel),
        add: (postModel, unsafeAttrs, context) => isOwner(unsafeAttrs, context)
    }
};

/**
 * @param {Object} postModel
 * @param {string} action
 * @param {Object} context
 * @param {Object} unsafeAttrs
 * @param {Object} roleFlags
 * @returns {boolean}
 */
function evaluatePermission(postModel, action, context, unsafeAttrs, roleFlags) {
    const {isContributor, isAuthor} = roleFlags;

    if (isContributor && permissionStrategies.contributor[action]) {
        return permissionStrategies.contributor[action](postModel, unsafeAttrs, context);
    }

    if (isAuthor && permissionStrategies.author[action]) {
        return permissionStrategies.author[action](postModel, unsafeAttrs, context);
    }

    // Fallback for owners or other roles
    if (postModel) {
        return isPrimaryAuthor(postModel, context);
    }

    return false;
}

/**
 * @param {Object} unfilteredOptions
 * @returns {Promise<void>}
 */
async function reassignByAuthorLogic(unfilteredOptions) {
    const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
    const authorId = options.id;

    if (!authorId) {
        return Promise.reject(new errors.NotFoundError({
            message: tpl(messages.noUserFound)
        }));
    }

    const trx = options.transacting;
    const knex = ghostBookshelf.knex;

    try {
        const ownerUser = await knex('roles')
            .transacting(trx)
            .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
            .where('roles.name', 'Owner')
            .select('roles_users.user_id');

        const ownerId = ownerUser[0].user_id;

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

        // Remove author from primary posts where owner is co‑author
        await knex('posts_authors')
            .transacting(trx)
            .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
            .where('author_id', authorId)
            .del();

        // Promote owner to primary author
        await knex('posts_authors')
            .transacting(trx)
            .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
            .where('author_id', ownerId)
            .update('sort_order', 0);

        const primaryPostsWithoutOwnerCoauthor = _.differenceBy(authorsPrimaryPosts, primaryPostsWithOwnerCoauthor, 'post_id');
        const postsWithoutOwnerCoauthorIds = primaryPostsWithoutOwnerCoauthor.map(p => p.post_id);

        // Swap author with owner for posts without owner co‑author
        await knex('posts_authors')
            .transacting(trx)
            .whereIn('post_id', postsWithoutOwnerCoauthorIds)
            .where('author_id', authorId)
            .update('author_id', ownerId);

        // Remove author as secondary author from any other posts
        await knex('posts_authors')
            .transacting(trx)
            .where('author_id', authorId)
            .del();
    } catch (err) {
        throw new errors.InternalServerError({err});
    }
}

/**
 * @param {Object} Post
 * @param {Object} Posts
 * @param {Object} ghostBookshelf
 * @returns {Object}
 */
module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions(fnName) {
            const self = this;
            return function innerHandleOptions(model, attrs, options) {
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

                return proto[fnName].call(self, model, attrs, options);
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
            await ensureAuthorExists.call(this, model, options);
            return this._handleOptions('onCreating')(model, attrs, options);
        },

        onUpdating(model, attrs, options) {
            return this._handleOptions('onUpdating')(model, attrs, options);
        },

        onSaving(model, attrs, options) {
            const ops = [];

            unsetLegacyAuthor(model);
            validateAuthorsPresence(model);

            if (model.get('authors')) {
                ops.push(() => matchAuthors.call(this, model, options));
            }

            ops.push(() => proto.onSaving.call(this, model, attrs, options));

            return sequence(ops);
        },

        serialize(options) {
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

        matchAuthors
    }, {
        async reassignByAuthor(unfilteredOptions) {
            const exec = async () => reassignByAuthorLogic.call(this, unfilteredOptions);
            if (!unfilteredOptions.transacting) {
                return ghostBookshelf.transaction(transacting => {
                    unfilteredOptions.transacting = transacting;
                    return exec();
                });
            }
            return exec();
        },

        permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);

            // Resolve id to model if needed
            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                const origArgs = _.toArray(arguments).slice(1);
                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then(foundPostModel => {
                        if (!foundPostModel) {
                            throw new errors.NotFoundError({
                                message: tpl(messages.postNotFound)
                            });
                        }
                        const newArgs = [foundPostModel, ...origArgs];
                        return self.permissible.apply(self, newArgs);
                    });
            }

            const postModel = postModelOrId;
            const hasPermission = evaluatePermission(postModel, action, context, unsafeAttrs, {isContributor, isAuthor});

            if (hasPermission && hasApiKeyPermission) {
                return Post.permissible.call(
                    this,
                    postModelOrId,
                    action,
                    context,
                    unsafeAttrs,
                    loadedPermissions,
                    hasPermission,
                    hasApiKeyPermission
                ).then(({excludedAttrs}) => {
                    if (isContributor || isAuthor) {
                        return {excludedAttrs: ['authors', ...excludedAttrs]};
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