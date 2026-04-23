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

/** @param {Object} authors - The authors array to validate */
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

/** @param {number} userId - The user ID to check */
function userAlreadyExists(userId, authorsToSet) {
    return _.find(authorsToSet, {id: userId});
}

/** @param {Object} attrs - The serialized attributes */
function shouldRemoveAuthors(attrs, originalOptions) {
    if (!originalOptions || !originalOptions.withRelated) {
        return true;
    }
    return originalOptions.withRelated.indexOf('authors') === -1;
}

/** @param {Object} attrs - The serialized attributes */
function attachPrimaryAuthor(attrs, options) {
    if (!options.columns || (options.columns && options.columns.indexOf('primary_author') > -1)) {
        if (attrs.authors && attrs.authors.length) {
            attrs.primary_author = attrs.authors[0];
        } else {
            attrs.primary_author = null;
        }
    }
}

/** @param {Object} author - Author object to match */
function createAuthorMatchOperation(ghostBookshelf, author, index, authorsToSet, ownerUser, options) {
    return function matchAuthor() {
        const query = buildAuthorQuery(author);

        return ghostBookshelf
            .model('User')
            .where(query)
            .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')))
            .then((user) => {
                const userId = user ? user.id : ownerUser.id;

                if (!userAlreadyExists(userId, authorsToSet)) {
                    authorsToSet[index] = {};
                    authorsToSet[index].id = userId;
                }
            });
    };
}

/** @param {Object} ap - Author post object */
function isPrimaryPost(ap) {
    return ap.sort_order === 0;
}

/** @param {Array} posts - Posts array to map */
function extractPostIds(posts) {
    return posts.map(post => post.post_id);
}

/** @param {Object} knex - Knex instance */
function getOwnerUserQuery(knex, trx) {
    return knex('roles')
        .transacting(trx)
        .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
        .where('roles.name', 'Owner')
        .select('roles_users.user_id');
}

/** @param {Object} knex - Knex instance */
function getAuthorPostsQuery(knex, trx, authorId) {
    return knex('posts_authors')
        .transacting(trx)
        .where('author_id', authorId)
        .select('post_id', 'sort_order');
}

/** @param {Object} knex - Knex instance */
function getOwnerPostsQuery(knex, trx, ownerId) {
    return knex('posts_authors')
        .transacting(trx)
        .where('author_id', ownerId)
        .select('post_id');
}

/** @param {Object} knex - Knex instance */
function removeAuthorFromPrimaryPosts(knex, trx, postIds, authorId) {
    return knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', postIds)
        .where('author_id', authorId)
        .del();
}

/** @param {Object} knex - Knex instance */
function makeOwnerPrimaryAuthor(knex, trx, postIds, ownerId) {
    return knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', postIds)
        .where('author_id', ownerId)
        .update('sort_order', 0);
}

/** @param {Object} knex - Knex instance */
function replaceAuthorWithOwner(knex, trx, postIds, authorId, ownerId) {
    return knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', postIds)
        .where('author_id', authorId)
        .update('author_id', ownerId);
}

/** @param {Object} knex - Knex instance */
function removeAuthorAsSecondary(knex, trx, authorId) {
    return knex('posts_authors')
        .transacting(trx)
        .where('author_id', authorId)
        .del();
}

/** @param {Object} unsafeAttrs - The unsafe attributes */
function isChangingAuthors(unsafeAttrs, postModel) {
    if (!unsafeAttrs.authors) {
        return false;
    }

    if (!unsafeAttrs.authors.length) {
        return true;
    }

    return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
}

/** @param {Object} unsafeAttrs - The unsafe attributes */
function isOwner(unsafeAttrs, context) {
    if (!unsafeAttrs.authors) {
        return false;
    }

    return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
}

/** @param {Object} postModel - The post model */
function isPrimaryAuthor(context, postModel) {
    return context.user === postModel.related('authors').models[0].id;
}

/** @param {Object} postModel - The post model */
function isCoAuthor(context, postModel) {
    return postModel.related('authors').models.map(author => author.id).includes(context.user);
}

/** @param {string} action - The action being performed */
function isEditAction(action) {
    return action === 'edit';
}

/** @param {string} action - The action being performed */
function isAddAction(action) {
    return action === 'add';
}

/** @param {string} action - The action being performed */
function isDestroyAction(action) {
    return action === 'destroy';
}

const permissionStrategies = {
    contributor: {
        edit: (hasUserPermission, isChangingAuthors, isCoAuthor) => !isChangingAuthors && isCoAuthor,
        add: (hasUserPermission, isOwner) => isOwner,
        destroy: (hasUserPermission, isPrimaryAuthor) => isPrimaryAuthor
    },
    author: {
        edit: (hasUserPermission, isCoAuthor, isChangingAuthors) => isCoAuthor && !isChangingAuthors,
        add: (hasUserPermission, isOwner) => isOwner,
        destroy: (hasUserPermission, isPrimaryAuthor) => isPrimaryAuthor
    }
};

/** @param {Object} params - Permission check parameters */
function evaluatePermission(params) {
    const {isContributor, isAuthor, isEdit, isAdd, isDestroy, isChangingAuthorsVal, isOwnerVal, isPrimaryAuthorVal, isCoAuthorVal, postModel} = params;

    if (isContributor && isEdit) {
        return !isChangingAuthorsVal && isCoAuthorVal;
    }
    if (isContributor && isAdd) {
        return isOwnerVal;
    }
    if (isContributor && isDestroy) {
        return isPrimaryAuthorVal;
    }
    if (isAuthor && isEdit) {
        return isCoAuthorVal && !isChangingAuthorsVal;
    }
    if (isAuthor && isAdd) {
        return isOwnerVal;
    }
    if (postModel) {
        return isPrimaryAuthorVal;
    }

    return false;
}

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions: function _handleOptions(fnName) {
            const self = this;
            return createHandleOptions(proto, fnName).bind(self);
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

            if (shouldRemoveAuthors(attrs, this._originalOptions)) {
                delete attrs.authors;
            }

            attachPrimaryAuthor(attrs, options);

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
                    return createAuthorMatchOperation(ghostBookshelf, author, index, authorsToSet, ownerUser, options)();
                })).then(() => {
                    model.set('authors', authorsToSet);
                });
            });

            return sequence(ops);
        }
    }, {
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
                    const ownerUserResult = await getOwnerUserQuery(knex, trx);
                    const ownerId = ownerUserResult[0].user_id;

                    const authorsPosts = await getAuthorPostsQuery(knex, trx, authorId);
                    const ownersPosts = await getOwnerPostsQuery(knex, trx, ownerId);

                    const authorsPrimaryPosts = authorsPosts.filter(isPrimaryPost);
                    const primaryPostsWithOwnerCoauthor = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
                    const primaryPostsWithOwnerCoauthorIds = extractPostIds(primaryPostsWithOwnerCoauthor);

                    await removeAuthorFromPrimaryPosts(knex, trx, primaryPostsWithOwnerCoauthorIds, authorId);
                    await makeOwnerPrimaryAuthor(knex, trx, primaryPostsWithOwnerCoauthorIds, ownerId);

                    const primaryPostsWithoutOwnerCoauthor = _.differenceBy(authorsPrimaryPosts, primaryPostsWithOwnerCoauthor, 'post_id');
                    const postsWithoutOwnerCoauthorIds = extractPostIds(primaryPostsWithoutOwnerCoauthor);

                    await replaceAuthorWithOwner(knex, trx, postsWithoutOwnerCoauthorIds, authorId, ownerId);
                    await removeAuthorAsSecondary(knex, trx, authorId);
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

            const isEdit = isEditAction(action);
            const isAdd = isAddAction(action);
            const isDestroy = isDestroyAction(action);

            const isChangingAuthorsVal = isChangingAuthors(unsafeAttrs, postModel);
            const isOwnerVal = isOwner(unsafeAttrs, context);
            const isPrimaryAuthorVal = isPrimaryAuthor(context, postModel);
            const isCoAuthorVal = isCoAuthor(context, postModel);

            const userPermission = evaluatePermission({
                isContributor,
                isAuthor,
                isEdit,
                isAdd,
                isDestroy,
                isChangingAuthorsVal,
                isOwnerVal,
                isPrimaryAuthorVal,
                isCoAuthorVal,
                postModel
            });

            hasUserPermission = userPermission;

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