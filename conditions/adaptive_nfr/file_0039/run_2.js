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
 * Why and when do we have to fetch `authors` by default?
 *
 * # CASE 1
 * We fetch the `authors` relations when you either request `withRelated=['authors']` or `withRelated=['author`].
 * The old `author` relation was removed, but we still have to support this case.
 *
 * ---
 *
 * It's impossible to implement a default `withRelated` feature nicely at the moment, because we can't hook into bookshelf
 * and support all model queries and collection queries (e.g. fetchAll). The hardest part is to remember
 * if the user requested the `authors` or not. Overriding `sync` does not work for collections.
 * And overriding the sync method of Collection does not trigger sync - probably a bookshelf bug, i have
 * not investigated.
 *
 * That's why we remember `_originalOptions` for now - only specific to posts.
 *
 * NOTE: If we fetch the multiple authors manually on the events, we run into the same problem. We have to remember
 * the original options. Plus: we would fetch the authors twice in some cases.
 */

/** @param {Array} withRelated - The withRelated array from options */
function normalizeAuthorRelation(withRelated) {
    const authorIndex = withRelated.indexOf('author');
    if (authorIndex !== -1) {
        withRelated.splice(authorIndex, 1);
        withRelated.push('authors');
    }
}

/** @param {Array} withRelated - The withRelated array from options */
function ensureAuthorsForUpdate(withRelated, fnName, forUpdate) {
    if (forUpdate && ['onFetching', 'onFetchingCollection'].indexOf(fnName) !== -1 && withRelated.indexOf('authors') === -1) {
        withRelated.push('authors');
    }
}

/** @param {string} fnName - The function name being called */
function createHandleOptions(proto, fnName) {
    return function innerHandleOptions(model, attrs, options) {
        model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

        if (!options.withRelated) {
            options.withRelated = [];
        }

        normalizeAuthorRelation(options.withRelated);
        ensureAuthorsForUpdate(options.withRelated, fnName, options.forUpdate);

        return proto[fnName].call(this, model, attrs, options);
    };
}

/** @param {Object} authors - The authors array from model */
function validateAuthorsNotEmpty(authors) {
    if (authors && !authors.length) {
        throw new errors.ValidationError({
            message: 'At least one author is required.'
        });
    }
}

/** @param {Object} author - Author object with id, slug, or email */
function buildAuthorQuery(author) {
    const query = {};
    if (author.id) {
        query.id = author.id;
    } else if (author.slug) {
        query.slug = author.slug;
    } else if (author.email) {
        query.email = author.email;
    }
    return query;
}

/** @param {string} userId - The user ID to check */
function userAlreadyExists(userId, authorsToSet) {
    return _.find(authorsToSet, {id: userId.id});
}

/** @param {Object} user - The found user object */
function getUserId(user, ownerUser) {
    return user ? user.id : ownerUser.id;
}

/** @param {Object} context - The permission context */
function isOwnerUser(context, unsafeAttrs) {
    if (!unsafeAttrs.authors) {
        return false;
    }
    return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
}

/** @param {Object} postModel - The post model */
function getPrimaryAuthorId(postModel) {
    return postModel.related('authors').models[0].id;
}

/** @param {Object} postModel - The post model */
function getCoAuthorIds(postModel) {
    return postModel.related('authors').models.map(author => author.id);
}

/** @param {Object} unsafeAttrs - Attributes being set */
function hasAuthorChanges(unsafeAttrs) {
    return unsafeAttrs.authors && unsafeAttrs.authors.length;
}

/** @param {Object} unsafeAttrs - Attributes being set */
function getNewPrimaryAuthorId(unsafeAttrs) {
    return unsafeAttrs.authors[0].id;
}

/** @param {Object} postModel - The post model */
function getCurrentPrimaryAuthorId(postModel) {
    return postModel.related('authors').models[0].id;
}

/** @param {string} userId - User ID to check */
function isPrimaryAuthorCheck(userId, postModel) {
    return userId === getPrimaryAuthorId(postModel);
}

/** @param {string} userId - User ID to check */
function isCoAuthorCheck(userId, postModel) {
    return getCoAuthorIds(postModel).includes(userId);
}

/** @param {Object} unsafeAttrs - Attributes being set */
function isChangingAuthorsCheck(unsafeAttrs, postModel) {
    if (!hasAuthorChanges(unsafeAttrs)) {
        return false;
    }
    return getNewPrimaryAuthorId(unsafeAttrs) !== getCurrentPrimaryAuthorId(postModel);
}

const permissionStrategies = {
    contributorEdit: (context, unsafeAttrs, postModel) => {
        return !isChangingAuthorsCheck(unsafeAttrs, postModel) && isCoAuthorCheck(context.user, postModel);
    },
    contributorAdd: (context, unsafeAttrs) => {
        return isOwnerUser(context, unsafeAttrs);
    },
    contributorDestroy: (context, postModel) => {
        return isPrimaryAuthorCheck(context.user, postModel);
    },
    authorEdit: (context, unsafeAttrs, postModel) => {
        return isCoAuthorCheck(context.user, postModel) && !isChangingAuthorsCheck(unsafeAttrs, postModel);
    },
    authorAdd: (context, unsafeAttrs) => {
        return isOwnerUser(context, unsafeAttrs);
    },
    defaultCheck: (context, postModel) => {
        return isPrimaryAuthorCheck(context.user, postModel);
    }
};

/** @param {Object} params - Permission check parameters */
function checkPermissionStrategy(params) {
    const {isContributor, isAuthor, action, context, unsafeAttrs, postModel} = params;

    if (isContributor && action === 'edit') {
        return permissionStrategies.contributorEdit(context, unsafeAttrs, postModel);
    }
    if (isContributor && action === 'add') {
        return permissionStrategies.contributorAdd(context, unsafeAttrs);
    }
    if (isContributor && action === 'destroy') {
        return permissionStrategies.contributorDestroy(context, postModel);
    }
    if (isAuthor && action === 'edit') {
        return permissionStrategies.authorEdit(context, unsafeAttrs, postModel);
    }
    if (isAuthor && action === 'add') {
        return permissionStrategies.authorAdd(context, unsafeAttrs);
    }
    if (postModel) {
        return permissionStrategies.defaultCheck(context, postModel);
    }
    return false;
}

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions: function _handleOptions(fnName) {
            const self = this;
            return createHandleOptions.call(self, proto, fnName);
        },

        onFetching: function onFetching(model, attrs, options) {
            return this._handleOptions('onFetching')(model, attrs, options);
        },

        onFetchingCollection: function onFetchingCollection(collection, attrs, options) {
            return this._handleOptions('onFetchingCollection')(collection, attrs, options);
        },

        onFetchedCollection: function (collection, attrs, options) {
            _.each(collection.models, ((model) => {
                model._originalOptions = collection._originalOptions;
            }));

            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        onCreating: async function onCreating(model, attrs, options) {
            if (!model.get('authors')) {
                model.set('authors', [{
                    id: await this.contextUser(options)
                }]);
            }

            return this._handleOptions('onCreating')(model, attrs, options);
        },

        onUpdating: function onUpdating(model, attrs, options) {
            return this._handleOptions('onUpdating')(model, attrs, options);
        },

        onSaving: function (model, attrs, options) {
            const ops = [];

            model.unset('author');

            validateAuthorsNotEmpty(model.get('authors'));

            if (model.get('authors')) {
                ops.push(() => {
                    return this.matchAuthors(model, options);
                });
            }

            ops.push(() => {
                return proto.onSaving.call(this, model, attrs, options);
            });

            return sequence(ops);
        },

        serialize: function serialize(options) {
            let attrs = proto.serialize.call(this, options);

            if (!this._originalOptions) {
                this._originalOptions = {};
            }

            if (!this._originalOptions || !this._originalOptions.withRelated || this._originalOptions.withRelated.indexOf('authors') === -1) {
                delete attrs.authors;
            }

            if (!options.columns || (options.columns && options.columns.indexOf('primary_author') > -1)) {
                if (attrs.authors && attrs.authors.length) {
                    attrs.primary_author = attrs.authors[0];
                } else {
                    attrs.primary_author = null;
                }
            }

            return attrs;
        },

        matchAuthors(model, options) {
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
                    const query = buildAuthorQuery(author);

                    return ghostBookshelf
                        .model('User')
                        .where(query)
                        .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')))
                        .then((user) => {
                            let userId = getUserId(user, ownerUser);

                            if (!userAlreadyExists(userId, authorsToSet)) {
                                authorsToSet[index] = {};
                                authorsToSet[index].id = userId;
                            }
                        });
                })).then(() => {
                    model.set('authors', authorsToSet);
                });
            });

            return sequence(ops);
        }
    }, {
        /**
         * ### reassignByAuthor
         * @param  {Object} unfilteredOptions has context and id. Context is the user doing the destroy, id is the user to destroy
         * @param {string} unfilteredOptions.id
         * @param {Object} unfilteredOptions.context
         * @param {Object} unfilteredOptions.transacting
         */
        reassignByAuthor: async function reassignByAuthor(unfilteredOptions) {
            let options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
            let authorId = options.id;

            if (!authorId) {
                return Promise.reject(new errors.NotFoundError({
                    message: tpl(messages.noUserFound)
                }));
            }

            const reassignPost = (async () => {
                let trx = options.transacting;
                let knex = ghostBookshelf.knex;

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
                    const primaryPostsWithOwnerCoauthorIds = primaryPostsWithOwnerCoauthor.map(post => post.post_id);

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

                    const primaryPostsWithoutOwnerCoauthor = _.differenceBy(authorsPrimaryPosts, primaryPostsWithOwnerCoauthor, 'post_id');
                    const postsWithoutOwnerCoauthorIds = primaryPostsWithoutOwnerCoauthor.map(post => post.post_id);

                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', postsWithoutOwnerCoauthorIds)
                        .where('author_id', authorId)
                        .update('author_id', ownerId);

                    await knex('posts_authors')
                        .transacting(trx)
                        .where('author_id', authorId)
                        .del();
                } catch (err) {
                    throw new errors.InternalServerError({err: err});
                }
            });

            if (!options.transacting) {
                return ghostBookshelf.transaction((transacting) => {
                    options.transacting = transacting;
                    return reassignPost();
                });
            }

            return reassignPost();
        },

        permissible: function permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const postModel = postModelOrId;
            let origArgs;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);

            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                origArgs = _.toArray(arguments).slice(1);

                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then(function then(foundPostModel) {
                        if (!foundPostModel) {
                            throw new errors.NotFoundError({
                                message: tpl(messages.postNotFound)
                            });
                        }

                        const newArgs = [foundPostModel].concat(origArgs);
                        return self.permissible.apply(self, newArgs);
                    });
            }

            hasUserPermission = checkPermissionStrategy({
                isContributor,
                isAuthor,
                action,
                context,
                unsafeAttrs,
                postModel
            }) || hasUserPermission;

            if (hasUserPermission && hasApiKeyPermission) {
                return Post.permissible.call(
                    this,
                    postModelOrId,
                    action, context,
                    unsafeAttrs,
                    loadedPermissions,
                    hasUserPermission,
                    hasApiKeyPermission
                ).then(({excludedAttrs}) => {
                    if (isContributor || isAuthor) {
                        return {
                            excludedAttrs: ['authors'].concat(excludedAttrs)
                        };
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