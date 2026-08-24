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
 * Returns the normalized authors array, ensuring at least one author exists (defaults to owner)
 * @param {Object} model - The post model instance
 * @param {Object} options - Arguments including transacting context
 * @param {Function} contextUser - Function to retrieve current user ID
 * @returns {Promise<Array>} - Normalized authors array
 */
async function normalizeAuthorInput(model, options, contextUser) {
    if (!model.get('authors')) {
        const userId = await contextUser(options);
        model.set('authors', [{id: userId}]);
    }

    if (model.get('authors') && !model.get('authors').length) {
        throw new errors.ValidationError({
            message: 'At least one author is required.'
        });
    }
}

/**
 * Matches author input (id/slug/email) to actual user records
 * @param {Object} model - The post model instance
 * @param {Object} options - Arguments including transacting context
 * @param {Object} ghostBookshelf - Bookshelf instance
 * @param {Object} ownerUser - Owner user object
 * @returns {Promise<void>}
 */
async function matchAuthors(model, options, ghostBookshelf, ownerUser) {
    const authors = model.get('authors') || [];
    const authorsToSet = [];

    await Promise.all(authors.map(async (author, index) => {
        const query = {};
        if (author.id) {
            query.id = author.id;
        } else if (author.slug) {
            query.slug = author.slug;
        } else if (author.email) {
            query.email = author.email;
        }

        const user = await ghostBookshelf
            .model('User')
            .where(query)
            .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')));

        const userId = user ? user.id : ownerUser.id;
        const userExists = authorsToSet.find(a => a && a.id === userId.id);

        if (!userExists) {
            authorsToSet[index] = {id: userId};
        }
    }));

    model.set('authors', authorsToSet);
}

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
module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const contextUser = (options) => {
        if (options.context && options.context.user) {
            return Promise.resolve(options.context.user);
        }
        return ghostBookshelf.model('User').getOwnerUser(_.pick(options, 'transacting'));
    };

    const Model = Post.extend({
        _handleOptions: function _handleOptions(fnName) {
            const self = this;

            return function innerHandleOptions(model, attrs, options) {
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
        },

        onFetching: function onFetching(model, attrs, options) {
            return this._handleOptions('onFetching')(model, attrs, options);
        },

        onFetchingCollection: function onFetchingCollection(collection, attrs, options) {
            return this._handleOptions('onFetchingCollection')(collection, attrs, options);
        },

        onFetchedCollection: function onFetchedCollection(collection, attrs, options) {
            _.each(collection.models, (model) => {
                model._originalOptions = collection._originalOptions;
            });

            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        onCreating: async function onCreating(model, attrs, options) {
            await normalizeAuthorInput(model, options, contextUser.bind(this));
            return this._handleOptions('onCreating')(model, attrs, options);
        },

        onUpdating: function onUpdating(model, attrs, options) {
            return this._handleOptions('onUpdating')(model, attrs, options);
        },

        onSaving: async function onSaving(model, attrs, options) {
            model.unset('author');

            const ops = [];

            ops.push(() => normalizeAuthorInput(model, options, contextUser.bind(this)));

            if (model.get('authors') && model.get('authors').length > 0) {
                ops.push(async () => {
                    const ownerUser = await ghostBookshelf
                        .model('User')
                        .getOwnerUser(Object.assign({}, _.pick(options, 'transacting')));
                    await matchAuthors(model, options, ghostBookshelf, ownerUser);
                });
            }

            ops.push(() => proto.onSaving.call(this, model, attrs, options));

            return sequence(ops);
        },

        serialize: function serialize(options) {
            let attrs = proto.serialize.call(this, options);

            if (!this._originalOptions) {
                this._originalOptions = {};
            }

            if (!this._originalOptions.withRelated || this._originalOptions.withRelated.indexOf('authors') === -1) {
                delete attrs.authors;
            }

            if (!options.columns || options.columns.indexOf('primary_author') > -1) {
                attrs.primary_author = attrs.authors && attrs.authors.length ? attrs.authors[0] : null;
            }

            return attrs;
        },

        matchAuthors: function matchAuthorsWrapper(model, options) {
            return ghostBookshelf
                .model('User')
                .getOwnerUser(Object.assign({}, _.pick(options, 'transacting')))
                .then(ownerUser => {
                    return matchAuthors(model, options, ghostBookshelf, ownerUser);
                });
        }
    }, {
        reassignByAuthor: async function reassignByAuthor(unfilteredOptions) {
            let options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {
                extraAllowedProperties: ['id']
            });
            let authorId = options.id;

            if (!authorId) {
                throw new errors.NotFoundError({
                    message: tpl(messages.noUserFound)
                });
            }

            const updatePostAuthors = async () => {
                const trx = options.transacting;
                const knex = ghostBookshelf.knex;

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
            };

            try {
                if (!options.transacting) {
                    return await ghostBookshelf.transaction(updatePostAuthors);
                }
                return await updatePostAuthors();
            } catch (err) {
                throw new errors.InternalServerError({err});
            }
        },

        permissible: function permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            let origArgs;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
            const isEdit = (action === 'edit');
            const isAdd = (action === 'add');
            const isDestroy = (action === 'destroy');

            function getPostModel(postModelOrId) {
                if (!_.isNumber(postModelOrId) && !_.isString(postModelOrId)) {
                    return Promise.resolve(postModelOrId);
                }

                origArgs = _.toArray(arguments).slice(1);
                return self.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then((foundPostModel) => {
                        if (!foundPostModel) {
                            throw new errors.NotFoundError({message: tpl(messages.postNotFound)});
                        }

                        const newArgs = [foundPostModel].concat(origArgs);
                        return self.permissible.apply(self, newArgs);
                    });
            }

            function isChangingAuthors() {
                if (!unsafeAttrs?.authors) {
                    return false;
                }

                if (!unsafeAttrs.authors.length) {
                    return true;
                }

                const existingPrimaryAuthor = postModel?.related('authors')?.models?.[0];
                return unsafeAttrs.authors[0].id !== existingPrimaryAuthor?.id;
            }

            function isOwner() {
                if (!unsafeAttrs?.authors?.length) {
                    return false;
                }
                return unsafeAttrs.authors[0].id === context.user;
            }

            function isPrimaryAuthor() {
                return context.user === postModel?.related('authors')?.models?.[0]?.id;
            }

            function isCoAuthor() {
                return postModel?.related('authors')?.models
                    ?.map(author => author.id)
                    ?.includes(context.user) || false;
            }

            return getPostModel(postModelOrId).then(postModel => {
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

                return Promise.reject(new errors.NoPermissionError({
                    message: tpl(messages.notEnoughPermission)
                }));
            });
        }
    });

    return Model;
};