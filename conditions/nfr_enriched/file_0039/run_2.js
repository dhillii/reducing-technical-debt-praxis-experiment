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

// Helper: Add authors to withRelated for forUpdate queries
function addAuthorsForUpdate(fnName, options) {
    if (options.forUpdate &&
        ['onFetching', 'onFetchingCollection'].indexOf(fnName) !== -1 &&
        options.withRelated.indexOf('authors') === -1) {
        options.withRelated.push('authors');
    }
}

// Helper: Prepare options for model operations
function prepareOptions(fnName, options) {
    normalizeAuthorRelation(options);
    addAuthorsForUpdate(fnName, options);
}

// Helper: Check if authors array is empty
function validateAuthorsNotEmpty(authors) {
    if (authors && !authors.length) {
        throw new errors.ValidationError({
            message: 'At least one author is required.'
        });
    }
}

// Helper: Build query for finding user by id, slug, or email
function buildUserQuery(author) {
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

// Helper: Fetch owner user
function fetchOwnerUser(ghostBookshelf, options) {
    return ghostBookshelf
        .model('User')
        .getOwnerUser(Object.assign({}, _.pick(options, 'transacting')));
}

// Helper: Fetch user by query
function fetchUserByQuery(ghostBookshelf, query, options) {
    return ghostBookshelf
        .model('User')
        .where(query)
        .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')));
}

// Helper: Process single author and return user id
function processSingleAuthor(ghostBookshelf, author, ownerUser, options) {
    const query = buildUserQuery(author);
    
    return fetchUserByQuery(ghostBookshelf, query, options)
        .then((user) => {
            return user ? user.id : ownerUser.id;
        });
}

// Helper: Match authors to existing users
function matchAuthorsToUsers(ghostBookshelf, authors, ownerUser, options) {
    return Promise.all(authors.map((author) => {
        return processSingleAuthor(ghostBookshelf, author, ownerUser, options);
    })).then((userIds) => {
        const authorsToSet = [];
        userIds.forEach((userId, index) => {
            const userExists = _.find(authorsToSet, {id: userId});
            if (!userExists) {
                authorsToSet[index] = {id: userId};
            }
        });
        return authorsToSet;
    });
}

// Helper: Get owner user id from database
async function getOwnerUserId(knex, trx) {
    const ownerUser = await knex('roles')
        .transacting(trx)
        .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
        .where('roles.name', 'Owner')
        .select('roles_users.user_id');
    return ownerUser[0].user_id;
}

// Helper: Fetch author posts
async function fetchAuthorPosts(knex, trx, authorId) {
    return knex('posts_authors')
        .transacting(trx)
        .where('author_id', authorId)
        .select('post_id', 'sort_order');
}

// Helper: Fetch owner posts
async function fetchOwnerPosts(knex, trx, ownerId) {
    return knex('posts_authors')
        .transacting(trx)
        .where('author_id', ownerId)
        .select('post_id');
}

// Helper: Remove author from posts and promote owner
async function removeAuthorAndPromoteOwner(knex, trx, authorId, ownerId, postIds) {
    await knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', postIds)
        .where('author_id', authorId)
        .del();

    await knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', postIds)
        .where('author_id', ownerId)
        .update('sort_order', 0);
}

// Helper: Replace author with owner in posts
async function replaceAuthorWithOwner(knex, trx, authorId, ownerId, postIds) {
    await knex('posts_authors')
        .transacting(trx)
        .whereIn('post_id', postIds)
        .where('author_id', authorId)
        .update('author_id', ownerId);
}

// Helper: Remove author from all remaining posts
async function removeAuthorFromAllPosts(knex, trx, authorId) {
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

// Helper: Check if user is co-author
function isCoAuthor(context, postModel) {
    return postModel.related('authors').models.map(author => author.id).includes(context.user);
}

// Helper: Determine user permission based on role and action
function determineUserPermission(isContributor, isAuthor, action, unsafeAttrs, context, postModel) {
    const isEdit = action === 'edit';
    const isAdd = action === 'add';
    const isDestroy = action === 'destroy';

    if (isContributor && isEdit) {
        return !isChangingAuthors(unsafeAttrs, postModel) && isCoAuthor(context, postModel);
    }
    if (isContributor && isAdd) {
        return isOwner(unsafeAttrs, context);
    }
    if (isContributor && isDestroy) {
        return isPrimaryAuthor(context, postModel);
    }
    if (isAuthor && isEdit) {
        return isCoAuthor(context, postModel) && !isChangingAuthors(unsafeAttrs, postModel);
    }
    if (isAuthor && isAdd) {
        return isOwner(unsafeAttrs, context);
    }
    if (postModel) {
        return isPrimaryAuthor(context, postModel);
    }
    return false;
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
                prepareOptions(fnName, options);
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
                return fetchOwnerUser(ghostBookshelf, options)
                    .then((_ownerUser) => {
                        ownerUser = _ownerUser;
                    });
            });

            ops.push(() => {
                const authors = model.get('authors');
                return matchAuthorsToUsers(ghostBookshelf, authors, ownerUser, options)
                    .then((authorsToSet) => {
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
                    const ownerId = await getOwnerUserId(knex, trx);
                    const authorsPosts = await fetchAuthorPosts(knex, trx, authorId);
                    const ownersPosts = await fetchOwnerPosts(knex, trx, ownerId);

                    const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
                    const primaryPostsWithOwnerCoauthor = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
                    const primaryPostsWithOwnerCoauthorIds = primaryPostsWithOwnerCoauthor.map(post => post.post_id);

                    await removeAuthorAndPromoteOwner(knex, trx, authorId, ownerId, primaryPostsWithOwnerCoauthorIds);

                    const primaryPostsWithoutOwnerCoauthor = _.differenceBy(authorsPrimaryPosts, primaryPostsWithOwnerCoauthor, 'post_id');
                    const postsWithoutOwnerCoauthorIds = primaryPostsWithoutOwnerCoauthor.map(post => post.post_id);

                    await replaceAuthorWithOwner(knex, trx, authorId, ownerId, postsWithoutOwnerCoauthorIds);
                    await removeAuthorFromAllPosts(knex, trx, authorId);
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

            hasUserPermission = determineUserPermission(isContributor, isAuthor, action, unsafeAttrs, context, postModel) || hasUserPermission;

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