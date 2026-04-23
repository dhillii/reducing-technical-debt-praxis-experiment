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

// Helper: Store original options from request
function storeOriginalOptions(model, options) {
    model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));
}

// Helper: Normalize author relation to authors
function normalizeAuthorRelation(options) {
    if (!options.withRelated) {
        options.withRelated = [];
    }

    if (options.withRelated.indexOf('author') !== -1) {
        options.withRelated.splice(options.withRelated.indexOf('author'), 1);
        options.withRelated.push('authors');
    }
}

// Helper: Add authors to withRelated if needed for update operations
function ensureAuthorsForUpdate(fnName, options) {
    if (options.forUpdate &&
        ['onFetching', 'onFetchingCollection'].indexOf(fnName) !== -1 &&
        options.withRelated.indexOf('authors') === -1) {
        options.withRelated.push('authors');
    }
}

// Helper: Process options for model hooks
function processModelOptions(fnName, options) {
    normalizeAuthorRelation(options);
    ensureAuthorsForUpdate(fnName, options);
}

// Helper: Get owner user from database
async function getOwnerUser(ghostBookshelf, options) {
    return ghostBookshelf
        .model('User')
        .getOwnerUser(Object.assign({}, _.pick(options, 'transacting')));
}

// Helper: Find user by id, slug, or email
async function findUserByAuthorData(ghostBookshelf, author, options) {
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
        .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')));
}

// Helper: Match and validate authors against existing users
async function matchAuthorToUser(ghostBookshelf, author, ownerUser, options) {
    const user = await findUserByAuthorData(ghostBookshelf, author, options);
    return user ? user.id : ownerUser.id;
}

// Helper: Build deduplicated authors list
function buildAuthorsSet(authorsToSet, userId, index) {
    const userExists = _.find(authorsToSet, {id: userId});

    if (!userExists) {
        authorsToSet[index] = {id: userId};
    }
}

// Helper: Validate authors exist and are not empty
function validateAuthorsPresent(model) {
    if (model.get('authors') && !model.get('authors').length) {
        throw new errors.ValidationError({
            message: 'At least one author is required.'
        });
    }
}

// Helper: Check if authors should be included in serialized output
function shouldIncludeAuthors(originalOptions) {
    if (!originalOptions || !originalOptions.withRelated) {
        return false;
    }
    return originalOptions.withRelated.indexOf('authors') !== -1;
}

// Helper: Set primary author in serialized output
function setPrimaryAuthor(attrs, options) {
    if (!options.columns || (options.columns && options.columns.indexOf('primary_author') > -1)) {
        if (attrs.authors && attrs.authors.length) {
            attrs.primary_author = attrs.authors[0];
        } else {
            attrs.primary_author = null;
        }
    }
}

// Helper: Get owner user ID from database
async function getOwnerUserId(ghostBookshelf, trx) {
    const knex = ghostBookshelf.knex;
    const ownerUser = await knex('roles')
        .transacting(trx)
        .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
        .where('roles.name', 'Owner')
        .select('roles_users.user_id');
    return ownerUser[0].user_id;
}

// Helper: Get author's posts with sort order
async function getAuthorsPosts(ghostBookshelf, authorId, trx) {
    const knex = ghostBookshelf.knex;
    return knex('posts_authors')
        .transacting(trx)
        .where('author_id', authorId)
        .select('post_id', 'sort_order');
}

// Helper: Get owner's posts
async function getOwnersPosts(ghostBookshelf, ownerId, trx) {
    const knex = ghostBookshelf.knex;
    return knex('posts_authors')
        .transacting(trx)
        .where('author_id', ownerId)
        .select('post_id');
}

// Helper: Remove author from primary posts where owner is coauthor
async function removeAuthorFromPrimaryPostsWithOwner(ghostBookshelf, authorId, ownerId, primaryPostsWithOwnerCoauthorIds, trx) {
    const knex = ghostBookshelf.knex;
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
}

// Helper: Replace author with owner in primary posts
async function replaceAuthorWithOwner(ghostBookshelf, authorId, ownerId, postsWithoutOwnerCoauthorIds, trx) {
    const knex = ghostBookshelf.knex;
    await knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', postsWithoutOwnerCoauthorIds)
        .where('author_id', authorId)
        .update('author_id', ownerId);
}

// Helper: Remove author from all remaining posts
async function removeAuthorFromAllPosts(ghostBookshelf, authorId, trx) {
    const knex = ghostBookshelf.knex;
    await knex('posts_authors')
        .transacting(trx)
        .where('author_id', authorId)
        .del();
}

// Helper: Check if user is changing authors
function isChangingAuthors(unsafeAttrs, postModel) {
    if (!unsafeAttrs.authors) {
        return false;
    }

    if (!unsafeAttrs.authors.length) {
        return true;
    }

    return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
}

// Helper: Check if user is the owner of the post
function isOwner(unsafeAttrs, context) {
    if (!unsafeAttrs.authors) {
        return false;
    }

    return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
}

// Helper: Check if user is primary author
function isPrimaryAuthor(context, postModel) {
    return context.user === postModel.related('authors').models[0].id;
}

// Helper: Check if user is coauthor
function isCoAuthor(context, postModel) {
    return postModel.related('authors').models.map(author => author.id).includes(context.user);
}

// Helper: Determine user permission based on role and action
function determineUserPermission(isContributor, isAuthor, isEdit, isAdd, isDestroy, unsafeAttrs, context, postModel) {
    let hasUserPermission = false;

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
        hasUserPermission = isPrimaryAuthor(context, postModel);
    }

    return hasUserPermission;
}

// Helper: Build excluded attributes based on role
function buildExcludedAttrs(isContributor, isAuthor, excludedAttrs) {
    if (isContributor || isAuthor) {
        return ['authors'].concat(excludedAttrs);
    }
    return excludedAttrs;
}

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions: function _handleOptions(fnName) {
            const self = this;

            return function innerHandleOptions(model, attrs, options) {
                storeOriginalOptions(model, options);
                processModelOptions(fnName, options);
                return proto[fnName].call(self, model, attrs, options);
            };
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
            validateAuthorsPresent(model);

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

            if (!shouldIncludeAuthors(this._originalOptions)) {
                delete attrs.authors;
            }

            setPrimaryAuthor(attrs, options);

            return attrs;
        },

        matchAuthors(model, options) {
            let ownerUser;
            const ops = [];

            ops.push(() => {
                return getOwnerUser(ghostBookshelf, options)
                    .then((_ownerUser) => {
                        ownerUser = _ownerUser;
                    });
            });

            ops.push(async () => {
                const authors = model.get('authors');
                const authorsToSet = [];

                await Promise.all(authors.map(async (author, index) => {
                    const userId = await matchAuthorToUser(ghostBookshelf, author, ownerUser, options);
                    buildAuthorsSet(authorsToSet, userId, index);
                }));

                model.set('authors', authorsToSet);
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

                try {
                    const ownerId = await getOwnerUserId(ghostBookshelf, trx);
                    const authorsPosts = await getAuthorsPosts(ghostBookshelf, authorId, trx);
                    const ownersPosts = await getOwnersPosts(ghostBookshelf, ownerId, trx);

                    const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
                    const primaryPostsWithOwnerCoauthor = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
                    const primaryPostsWithOwnerCoauthorIds = primaryPostsWithOwnerCoauthor.map(post => post.post_id);

                    await removeAuthorFromPrimaryPostsWithOwner(ghostBookshelf, authorId, ownerId, primaryPostsWithOwnerCoauthorIds, trx);

                    const primaryPostsWithoutOwnerCoauthor = _.differenceBy(authorsPrimaryPosts, primaryPostsWithOwnerCoauthor, 'post_id');
                    const postsWithoutOwnerCoauthorIds = primaryPostsWithoutOwnerCoauthor.map(post => post.post_id);

                    await replaceAuthorWithOwner(ghostBookshelf, authorId, ownerId, postsWithoutOwnerCoauthorIds, trx);
                    await removeAuthorFromAllPosts(ghostBookshelf, authorId, trx);
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
            let isEdit;
            let isAdd;
            let isDestroy;

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

            isEdit = (action === 'edit');
            isAdd = (action === 'add');
            isDestroy = (action === 'destroy');

            hasUserPermission = determineUserPermission(isContributor, isAuthor, isEdit, isAdd, isDestroy, unsafeAttrs, context, postModel);

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
                    return {
                        excludedAttrs: buildExcludedAttrs(isContributor, isAuthor, excludedAttrs)
                    };
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