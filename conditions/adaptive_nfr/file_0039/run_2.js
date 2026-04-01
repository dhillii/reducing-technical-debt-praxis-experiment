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
 * Checks if authors should be fetched for update operations
 * @param {boolean} forUpdate - Whether this is a forUpdate operation
 * @param {string} fnName - The function name being called
 * @param {Array} withRelated - The withRelated array
 * @returns {boolean} True if authors should be added to withRelated
 */
function shouldFetchAuthorsForUpdate(forUpdate, fnName, withRelated) {
    return forUpdate &&
        ['onFetching', 'onFetchingCollection'].indexOf(fnName) !== -1 &&
        withRelated.indexOf('authors') === -1;
}

/**
 * Checks if authors were requested in original options
 * @param {Object} originalOptions - The original options object
 * @returns {boolean} True if authors were requested
 */
function authorsWereRequested(originalOptions) {
    return originalOptions && 
           originalOptions.withRelated && 
           originalOptions.withRelated.indexOf('authors') !== -1;
}

/**
 * Extracts author identifier from author object
 * @param {Object} author - The author object
 * @returns {Object} Query object with id, slug, or email
 */
function extractAuthorQuery(author) {
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

/**
 * Checks if user already exists in authors set
 * @param {Array} authorsToSet - Array of authors to be set
 * @param {string} userId - User ID to check
 * @returns {boolean} True if user exists
 */
function userExistsInAuthors(authorsToSet, userId) {
    return _.find(authorsToSet, {id: userId});
}

/**
 * Determines if primary author should be set based on column settings
 * @param {Object} options - Serialize options
 * @returns {boolean} True if primary_author should be included
 */
function shouldIncludePrimaryAuthor(options) {
    return !options.columns || (options.columns && options.columns.indexOf('primary_author') > -1);
}

/**
 * Sets primary author from authors array
 * @param {Object} attrs - Attributes object to modify
 */
function setPrimaryAuthor(attrs) {
    if (attrs.authors && attrs.authors.length) {
        attrs.primary_author = attrs.authors[0];
    } else {
        attrs.primary_author = null;
    }
}

/**
 * Checks if authors are being changed in unsafe attributes
 * @param {Object} unsafeAttrs - Unsafe attributes
 * @param {Object} postModel - Post model
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
 * Checks if user is the owner in unsafe attributes
 * @param {Object} unsafeAttrs - Unsafe attributes
 * @param {string} contextUser - Current user ID
 * @returns {boolean} True if user is owner
 */
function isOwner(unsafeAttrs, contextUser) {
    if (!unsafeAttrs.authors) {
        return false;
    }

    return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === contextUser;
}

/**
 * Checks if user is primary author
 * @param {Object} postModel - Post model
 * @param {string} contextUser - Current user ID
 * @returns {boolean} True if user is primary author
 */
function isPrimaryAuthor(postModel, contextUser) {
    return contextUser === postModel.related('authors').models[0].id;
}

/**
 * Checks if user is co-author
 * @param {Object} postModel - Post model
 * @param {string} contextUser - Current user ID
 * @returns {boolean} True if user is co-author
 */
function isCoAuthor(postModel, contextUser) {
    return postModel.related('authors').models.map(author => author.id).includes(contextUser);
}

/**
 * Permission strategy for contributor role
 * @param {boolean} isEdit - Is edit action
 * @param {boolean} isAdd - Is add action
 * @param {boolean} isDestroy - Is destroy action
 * @param {Object} unsafeAttrs - Unsafe attributes
 * @param {Object} postModel - Post model
 * @param {string} contextUser - Current user ID
 * @returns {boolean|null} Permission result or null if not applicable
 */
function getContributorPermission(isEdit, isAdd, isDestroy, unsafeAttrs, postModel, contextUser) {
    if (isEdit) {
        return !isChangingAuthors(unsafeAttrs, postModel) && isCoAuthor(postModel, contextUser);
    }
    if (isAdd) {
        return isOwner(unsafeAttrs, contextUser);
    }
    if (isDestroy) {
        return isPrimaryAuthor(postModel, contextUser);
    }
    return null;
}

/**
 * Permission strategy for author role
 * @param {boolean} isEdit - Is edit action
 * @param {boolean} isAdd - Is add action
 * @param {Object} unsafeAttrs - Unsafe attributes
 * @param {Object} postModel - Post model
 * @param {string} contextUser - Current user ID
 * @returns {boolean|null} Permission result or null if not applicable
 */
function getAuthorPermission(isEdit, isAdd, unsafeAttrs, postModel, contextUser) {
    if (isEdit) {
        return isCoAuthor(postModel, contextUser) && !isChangingAuthors(unsafeAttrs, postModel);
    }
    if (isAdd) {
        return isOwner(unsafeAttrs, contextUser);
    }
    return null;
}

/**
 * Determines user permission based on role and action
 * @param {boolean} isContributor - Is contributor role
 * @param {boolean} isAuthor - Is author role
 * @param {boolean} isEdit - Is edit action
 * @param {boolean} isAdd - Is add action
 * @param {boolean} isDestroy - Is destroy action
 * @param {Object} unsafeAttrs - Unsafe attributes
 * @param {Object} postModel - Post model
 * @param {string} contextUser - Current user ID
 * @returns {boolean} Final permission result
 */
function determineUserPermission(isContributor, isAuthor, isEdit, isAdd, isDestroy, unsafeAttrs, postModel, contextUser) {
    if (isContributor) {
        const permission = getContributorPermission(isEdit, isAdd, isDestroy, unsafeAttrs, postModel, contextUser);
        if (permission !== null) {
            return permission;
        }
    }

    if (isAuthor) {
        const permission = getAuthorPermission(isEdit, isAdd, unsafeAttrs, postModel, contextUser);
        if (permission !== null) {
            return permission;
        }
    }

    if (postModel) {
        return isPrimaryAuthor(postModel, contextUser);
    }

    return false;
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

                if (shouldFetchAuthorsForUpdate(options.forUpdate, fnName, options.withRelated)) {
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

            if (shouldIncludePrimaryAuthor(options)) {
                setPrimaryAuthor(attrs);
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
                    const query = extractAuthorQuery(author);

                    return ghostBookshelf
                        .model('User')
                        .where(query)
                        .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')))
                        .then((user) => {
                            let userId = user ? user.id : ownerUser.id;

                            if (!userExistsInAuthors(authorsToSet, userId)) {
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
                        .transacting(