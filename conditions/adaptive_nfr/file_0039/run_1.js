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

/**
 * Normalizes withRelated options by replacing 'author' with 'authors'
 * @param {Array} withRelated - The withRelated array from options
 */
function normalizeAuthorRelation(withRelated) {
    const authorIndex = withRelated.indexOf('author');
    if (authorIndex !== -1) {
        withRelated.splice(authorIndex, 1);
        withRelated.push('authors');
    }
}

/**
 * Determines if authors should be added to withRelated for forUpdate operations
 * @param {string} fnName - The function name being called
 * @param {boolean} forUpdate - Whether this is a forUpdate operation
 * @param {Array} withRelated - The withRelated array
 */
function shouldAddAuthorsForUpdate(fnName, forUpdate, withRelated) {
    return forUpdate &&
        ['onFetching', 'onFetchingCollection'].indexOf(fnName) !== -1 &&
        withRelated.indexOf('authors') === -1;
}

/**
 * Checks if authors were requested in original options
 * @param {Object} originalOptions - The original options object
 * @returns {boolean}
 */
function authorsWereRequested(originalOptions) {
    return originalOptions && 
           originalOptions.withRelated && 
           originalOptions.withRelated.indexOf('authors') !== -1;
}

/**
 * Extracts author ID from author object using multiple fallback strategies
 * @param {Object} author - The author object
 * @returns {Object} Query object for finding the user
 */
function buildAuthorQuery(author) {
    if (author.id) {
        return {id: author.id};
    }
    if (author.slug) {
        return {slug: author.slug};
    }
    if (author.email) {
        return {email: author.email};
    }
    return {};
}

/**
 * Determines if a user already exists in the authors set
 * @param {Array} authorsToSet - Array of authors already set
 * @param {string} userId - The user ID to check
 * @returns {boolean}
 */
function userAlreadyExists(authorsToSet, userId) {
    return _.find(authorsToSet, {id: userId});
}

/**
 * Checks if primary author is being changed
 * @param {Object} unsafeAttrs - The unsafe attributes
 * @param {Object} postModel - The post model
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
 * Checks if the user is the owner of the post (first author)
 * @param {Object} unsafeAttrs - The unsafe attributes
 * @param {string} contextUser - The current user ID
 * @returns {boolean}
 */
function isOwner(unsafeAttrs, contextUser) {
    if (!unsafeAttrs.authors) {
        return false;
    }

    return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === contextUser;
}

/**
 * Checks if the user is the primary author
 * @param {Object} postModel - The post model
 * @param {string} contextUser - The current user ID
 * @returns {boolean}
 */
function isPrimaryAuthor(postModel, contextUser) {
    return contextUser === postModel.related('authors').models[0].id;
}

/**
 * Checks if the user is a co-author
 * @param {Object} postModel - The post model
 * @param {string} contextUser - The current user ID
 * @returns {boolean}
 */
function isCoAuthor(postModel, contextUser) {
    return postModel.related('authors').models.map(author => author.id).includes(contextUser);
}

/**
 * Permission strategy for contributor role
 * @param {boolean} isEdit - Whether action is edit
 * @param {boolean} isAdd - Whether action is add
 * @param {boolean} isDestroy - Whether action is destroy
 * @param {Object} context - The context object
 * @param {Object} postModel - The post model
 * @param {Object} unsafeAttrs - The unsafe attributes
 * @returns {boolean}
 */
function getContributorPermission(isEdit, isAdd, isDestroy, context, postModel, unsafeAttrs) {
    if (isEdit) {
        return !isChangingAuthors(unsafeAttrs, postModel) && isCoAuthor(postModel, context.user);
    }
    if (isAdd) {
        return isOwner(unsafeAttrs, context.user);
    }
    if (isDestroy) {
        return isPrimaryAuthor(postModel, context.user);
    }
    return false;
}

/**
 * Permission strategy for author role
 * @param {boolean} isEdit - Whether action is edit
 * @param {boolean} isAdd - Whether action is add
 * @param {Object} context - The context object
 * @param {Object} postModel - The post model
 * @param {Object} unsafeAttrs - The unsafe attributes
 * @returns {boolean}
 */
function getAuthorPermission(isEdit, isAdd, context, postModel, unsafeAttrs) {
    if (isEdit) {
        return isCoAuthor(postModel, context.user) && !isChangingAuthors(unsafeAttrs, postModel);
    }
    if (isAdd) {
        return isOwner(unsafeAttrs, context.user);
    }
    return false;
}

/**
 * Determines user permission based on role and action
 * @param {boolean} isContributor - Whether user is contributor
 * @param {boolean} isAuthor - Whether user is author
 * @param {boolean} isEdit - Whether action is edit
 * @param {boolean} isAdd - Whether action is add
 * @param {boolean} isDestroy - Whether action is destroy
 * @param {Object} context - The context object
 * @param {Object} postModel - The post model
 * @param {Object} unsafeAttrs - The unsafe attributes
 * @returns {boolean}
 */
function determineUserPermission(isContributor, isAuthor, isEdit, isAdd, isDestroy, context, postModel, unsafeAttrs) {
    if (isContributor) {
        return getContributorPermission(isEdit, isAdd, isDestroy, context, postModel, unsafeAttrs);
    }
    if (isAuthor) {
        return getAuthorPermission(isEdit, isAdd, context, postModel, unsafeAttrs);
    }
    if (postModel) {
        return isPrimaryAuthor(postModel, context.user);
    }
    return false;
}

/**
 * Determines excluded attributes based on role
 * @param {boolean} isContributor - Whether user is contributor
 * @param {boolean} isAuthor - Whether user is author
 * @param {Array} excludedAttrs - The excluded attributes from parent
 * @returns {Array}
 */
function getExcludedAttrs(isContributor, isAuthor, excludedAttrs) {
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
                model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

                if (!options.withRelated) {
                    options.withRelated = [];
                }

                normalizeAuthorRelation(options.withRelated);

                if (shouldAddAuthorsForUpdate(fnName, options.forUpdate, options.withRelated)) {
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

        onSaving: function (model, attrs, options) {
            const ops = [];

            model.unset('author');

            if (model.get('authors') && !model.get('authors').length) {
                throw new errors.ValidationError({
                    message: 'At least one author is required.'
                });
            }

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

            if (!authorsWereRequested(this._originalOptions)) {
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
                            let userId = user ? user.id : ownerUser.id;

                            if (!userAlreadyExists(authorsToSet, userId)) {
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
                        .whereIn('post_id', primary