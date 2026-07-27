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
module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        /**
         * Handles options for the model.
         * @param {string} fnName - The name of the function to handle options for.
         * @returns {function} A function that handles options for the given function name.
         */
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

        // @NOTE: `post.author` was always ignored [unsupported]
        // @NOTE: triggered before creating and before updating
        onSaving: function (model, attrs, options) {
            const ops = [];

            /**
             * @deprecated: single authors was superceded by multiple authors in Ghost 1.22.0 - `author`, is unused in Ghost 3.0
             */
            model.unset('author');

            // CASE: you can't delete all authors
            if (model.get('authors') && !model.get('authors').length) {
                throw new errors.ValidationError({
                    message: 'At least one author is required.'
                });
            }

            /**
             * @NOTE:
             *
             * Try to find a user with either id, slug or email if "authors" is present.
             * Otherwise fallback to owner user.
             *
             * You cannot create an author via posts!
             * Ghost uses the invite flow to create users.
             */
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

            // CASE: e.g. you stub model response in the test
            // CASE: you delete a model without fetching before
            if (!this._originalOptions) {
                this._originalOptions = {};
            }

            // CASE: `posts.authors` was not requested, but fetched in specific cases (see top)
            if (!this._originalOptions || !this._originalOptions.withRelated || this._originalOptions.withRelated.indexOf('authors') === -1) {
                delete attrs.authors;
            }

            // If the current column settings allow it...
            if (!options.columns || (options.columns && options.columns.indexOf('primary_author') > -1)) {
                // ... attach a computed property of primary_author which is the first author
                if (attrs.authors && attrs.authors.length) {
                    attrs.primary_author = attrs.authors[0];
                } else {
                    attrs.primary_author = null;
                }
            }

            return attrs;
        },

        /**
         * Matches authors for the given model and options.
         * @param {Object} model - The model to match authors for.
         * @param {Object} options - The options for matching authors.
         * @returns {Promise} A promise that resolves when authors have been matched.
         */
        matchAuthors: async function matchAuthors(model, options) {
            const ownerUser = await this.getOwnerUser(options);
            const authors = model.get('authors');
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

                let userId = user ? user.id : ownerUser.id;

                // CASE: avoid attaching duplicate authors relation
                const userExists = _.find(authorsToSet, {id: userId});

                if (!userExists) {
                    authorsToSet[index] = {};
                    authorsToSet[index].id = userId;
                }
            }));

            model.set('authors', authorsToSet);
        },

        /**
         * Gets the owner user for the given options.
         * @param {Object} options - The options for getting the owner user.
         * @returns {Promise} A promise that resolves with the owner user.
         */
        getOwnerUser: async function getOwnerUser(options) {
            const trx = options.transacting;
            const knex = ghostBookshelf.knex;

            const ownerUser = await knex('roles')
                .transacting(trx)
                .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
                .where('roles.name', 'Owner')
                .select('roles_users.user_id');

            return ownerUser[0].user_id;
        },

        /**
         * Reassigns posts by author.
         * @param {Object} unfilteredOptions - The unfiltered options for reassigning posts.
         * @returns {Promise} A promise that resolves when posts have been reassigned.
         */
        reassignByAuthor: async function reassignByAuthor(unfilteredOptions) {
            const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
            const authorId = options.id;

            if (!authorId) {
                return Promise.reject(new errors.NotFoundError({
                    message: tpl(messages.noUserFound)
                }));
            }

            const reassignPost = async () => {
                const trx = options.transacting;
                const knex = ghostBookshelf.knex;

                try {
                    const ownerUser = await this.getOwnerUser(options);
                    const authorsPosts = await knex('posts_authors')
                        .transacting(trx)
                        .where('author_id', authorId)
                        .select('post_id', 'sort_order');

                    const ownersPosts = await knex('posts_authors')
                        .transacting(trx)
                        .where('author_id', ownerUser)
                        .select('post_id');

                    const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
                    const primaryPostsWithOwnerCoauthor = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
                    const primaryPostsWithOwnerCoauthorIds = primaryPostsWithOwnerCoauthor.map(post => post.post_id);

                    // remove author and bump owner's sort_order to 0 to make them a primary author
                    // remove author from posts
                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
                        .where('author_id', authorId)
                        .del();

                    // make the owner a primary author
                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', primaryPostsWithOwnerCoauthorIds)
                        .where('author_id', ownerUser)
                        .update('sort_order', 0);

                    const primaryPostsWithoutOwnerCoauthor = _.differenceBy(authorsPrimaryPosts, primaryPostsWithOwnerCoauthor, 'post_id');
                    const postsWithoutOwnerCoauthorIds = primaryPostsWithoutOwnerCoauthor.map(post => post.post_id);

                    // swap out current author with the owner
                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', postsWithoutOwnerCoauthorIds)
                        .where('author_id', authorId)
                        .update('author_id', ownerUser);

                    // remove author as secondary author from any other posts
                    await knex('posts_authors')
                        .transacting(trx)
                        .where('author_id', authorId)
                        .del();
                } catch (err) {
                    throw new errors.InternalServerError({err: err});
                }
            };

            if (!options.transacting) {
                return ghostBookshelf.transaction((transacting) => {
                    options.transacting = transacting;
                    return reassignPost();
                });
            }

            return reassignPost();
        },

        /**
         * Checks if the given action is permissible for the given post model or id.
         * @param {Object|number|string} postModelOrId - The post model or id to check.
         * @param {string} action - The action to check.
         * @param {Object} context - The context for the action.
         * @param {Object} unsafeAttrs - The unsafe attributes for the action.
         * @param {Object} loadedPermissions - The loaded permissions for the action.
         * @param {boolean} hasUserPermission - Whether the user has permission for the action.
         * @param {boolean} hasApiKeyPermission - Whether the API key has permission for the action.
         * @returns {Promise} A promise that resolves with the result of the permission check.
         */
        permissible: async function permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            let postModel;

            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                postModel = await this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']});

                if (!postModel) {
                    throw new errors.NotFoundError({
                        message: tpl(messages.postNotFound)
                    });
                }
            } else {
                postModel = postModelOrId;
            }

            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
            let isEdit = action === 'edit';
            let isAdd = action === 'add';
            let isDestroy = action === 'destroy';

            const isChangingAuthors = () => {
                if (!unsafeAttrs.authors) {
                    return false;
                }

                if (!unsafeAttrs.authors.length) {
                    return true;
                }

                return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
            };

            const isOwner = () => {
                let isCorrectOwner = true;

                if (!unsafeAttrs.authors) {
                    return false;
                }

                if (unsafeAttrs.authors) {
                    isCorrectOwner = isCorrectOwner && unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
                }

                return isCorrectOwner;
            };

            const isPrimaryAuthor = () => {
                return (context.user === postModel.related('authors').models[0].id);
            };

            const isCoAuthor = () => {
                return postModel.related('authors').models.map(author => author.id).includes(context.user);
            };

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
                    postModel,
                    action, context,
                    unsafeAttrs,
                    loadedPermissions,
                    hasUserPermission,
                    hasApiKeyPermission
                ).then(({excludedAttrs}) => {
                    // @TODO: we need a concept for making a diff between incoming authors and existing authors
                    // @TODO: for now we simply re-use the new concept of `excludedAttrs`
                    // We only check the primary author of `authors`, any other change will be ignored.
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
    }, {
    });

    return Model;
};