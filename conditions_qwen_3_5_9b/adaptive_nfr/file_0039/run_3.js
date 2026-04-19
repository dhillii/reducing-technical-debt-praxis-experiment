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
 * Extracts the owner user from the database based on role permissions.
 * @param {Object} options - Options containing transacting transaction
 * @returns {Promise<Object>} The owner user model
 */
function getOwnerUser(options) {
    return ghostBookshelf
        .model('User')
        .getOwnerUser(Object.assign({}, _.pick(options, 'transacting')));
}

/**
 * Matches authors to users based on id, slug, or email.
 * @param {Object} model - The post model
 * @param {Object} options - Options containing transacting transaction
 * @returns {Promise<void>}
 */
function matchAuthors(model, options) {
    const ops = [];

    ops.push(() => {
        return getOwnerUser(options);
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
                    let userId = user ? user.id : options.transacting ? options.transacting : null;

                    // CASE: avoid attaching duplicate authors relation
                    const userExists = _.find(authorsToSet, {id: userId});

                    if (!userExists) {
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

/**
 * Determines if the action is changing authors.
 * @param {Object} unsafeAttrs - The unsafe attributes being set
 * @param {Object} postModel - The post model
 * @returns {boolean} True if authors are being changed
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
 * Determines if the user is the owner of the post.
 * @param {Object} unsafeAttrs - The unsafe attributes being set
 * @param {Object} context - The context object containing user
 * @returns {boolean} True if user is the owner
 */
function isOwner(unsafeAttrs, context) {
    if (!unsafeAttrs.authors) {
        return false;
    }

    if (unsafeAttrs.authors) {
        return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
    }

    return false;
}

/**
 * Determines if the user is the primary author.
 * @param {Object} context - The context object containing user
 * @param {Object} postModel - The post model
 * @returns {boolean} True if user is the primary author
 */
function isPrimaryAuthor(context, postModel) {
    return context.user === postModel.related('authors').models[0].id;
}

/**
 * Determines if the user is a co-author of the post.
 * @param {Object} context - The context object containing user
 * @param {Object} postModel - The post model
 * @returns {boolean} True if user is a co-author
 */
function isCoAuthor(context, postModel) {
    return postModel.related('authors').models.map(author => author.id).includes(context.user);
}

/**
 * Permission strategy for contributor role.
 * @param {string} action - The action being performed
 * @param {boolean} isChangingAuthors - Whether authors are being changed
 * @param {boolean} isCoAuthor - Whether user is a co-author
 * @returns {boolean} Whether user has permission
 */
function contributorPermissionStrategy(action, isChangingAuthors, isCoAuthor) {
    switch (action) {
        case 'edit':
            return !isChangingAuthors && isCoAuthor;
        case 'add':
            return isOwner(undefined, undefined);
        case 'destroy':
            return isPrimaryAuthor(undefined, undefined);
        default:
            return false;
    }
}

/**
 * Permission strategy for author role.
 * @param {string} action - The action being performed
 * @param {boolean} isChangingAuthors - Whether authors are being changed
 * @param {boolean} isCoAuthor - Whether user is a co-author
 * @returns {boolean} Whether user has permission
 */
function authorPermissionStrategy(action, isChangingAuthors, isCoAuthor) {
    switch (action) {
        case 'edit':
            return isCoAuthor && !isChangingAuthors;
        case 'add':
            return isOwner(undefined, undefined);
        default:
            return false;
    }
}

/**
 * Permission strategy for general post model.
 * @param {boolean} hasUserPermission - Whether user has permission
 * @returns {boolean} Whether user has permission
 */
function generalPostPermissionStrategy(hasUserPermission) {
    return hasUserPermission || isPrimaryAuthor(undefined, undefined);
}

/**
 * Determines if the user has permission based on their role and action.
 * @param {string} role - The user's role (contributor or author)
 * @param {string} action - The action being performed
 * @param {boolean} isChangingAuthors - Whether authors are being changed
 * @param {boolean} isCoAuthor - Whether user is a co-author
 * @param {boolean} hasUserPermission - Whether user has base permission
 * @returns {boolean} Whether user has permission
 */
function determinePermission(role, action, isChangingAuthors, isCoAuthor, hasUserPermission) {
    const permissionStrategies = {
        contributor: contributorPermissionStrategy,
        author: authorPermissionStrategy,
        general: generalPostPermissionStrategy
    };

    const strategy = permissionStrategies[role] || permissionStrategies.general;
    return strategy(action, isChangingAuthors, isCoAuthor);
}

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

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
         * Authors relation is special. You cannot add new authors via relations.
         * But you can for the tags relation. That's why we have to sort this out before
         * we trigger bookshelf-relations.
         *
         * @TODO: Add a feature to bookshelf-relations to configure if relations can be added or should be matched only.
         */
        matchAuthors: matchAuthors,

        /**
         * Reassigns posts from one author to the owner user.
         * @param  {Object} unfilteredOptions - Options containing context and id. Context is the user doing the destroy, id is the user to destroy
         * @param {string} unfilteredOptions.id - The author ID to reassign from
         * @param {Object} unfilteredOptions.context - The context object
         * @param {Object} unfilteredOptions.transacting - The transaction object
         * @returns {Promise<void>}
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
                    // There's only one possible owner per Ghost instance
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
                        .where('author_id', ownerId)
                        .update('sort_order', 0);

                    const primaryPostsWithoutOwnerCoauthor = _.differenceBy(authorsPrimaryPosts, primaryPostsWithOwnerCoauthor, 'post_id');
                    const postsWithoutOwnerCoauthorIds = primaryPostsWithoutOwnerCoauthor.map(post => post.post_id);

                    // swap out current author with the owner
                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', postsWithoutOwnerCoauthorIds)
                        .where('author_id', authorId)
                        .update('author_id', ownerId);

                    // remove author as secondary author from any other posts
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
            let isEdit;
            let isAdd;
            let isDestroy;

            // If we passed in an id instead of a model, get the model
            // then check the permissions
            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                // Grab the original args without the first one
                origArgs = _.toArray(arguments).slice(1);

                // Get the actual post model
                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then(function then(foundPostModel) {
                        if (!foundPostModel) {
                            throw new errors.NotFoundError({
                                message: tpl(messages.postNotFound)
                            });
                        }

                        // Build up the original args but substitute with actual model
                        const newArgs = [foundPostModel].concat(origArgs);
                        return self.permissible.apply(self, newArgs);
                    });
            }

            isEdit = (action === 'edit');
            isAdd = (action === 'add');
            isDestroy = (action === 'destroy');

            if (isContributor && isEdit) {
                hasUserPermission = determinePermission('contributor', action, isChangingAuthors(unsafeAttrs, postModel), isCoAuthor(context, postModel), hasUserPermission);
            } else if (isContributor && isAdd) {
                hasUserPermission = isOwner(unsafeAttrs, context);
            } else if (isContributor && isDestroy) {
                hasUserPermission = isPrimaryAuthor(context, postModel);
            } else if (isAuthor && isEdit) {
                hasUserPermission = determinePermission('author', action, isChangingAuthors(unsafeAttrs, postModel), isCoAuthor(context, postModel), hasUserPermission);
            } else if (isAuthor && isAdd) {
                hasUserPermission = isOwner(unsafeAttrs, context);
            } else if (postModel) {
                hasUserPermission = determinePermission('general', action, isChangingAuthors(unsafeAttrs, postModel), isCoAuthor(context, postModel), hasUserPermission);
            }

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
    });

    return Model;
};