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
 * Permission strategy for different user roles and actions
 */
const permissionStrategies = {
    contributor: {
        edit: {
            isChangingAuthors: (unsafeAttrs, authors) => {
                if (!unsafeAttrs.authors) {
                    return false;
                }
                if (!unsafeAttrs.authors.length) {
                    return true;
                }
                return unsafeAttrs.authors[0].id !== authors[0].id;
            },
            isCoAuthor: (authors, userId) => authors.some(author => author.id === userId),
            isPrimaryAuthor: (authors, userId) => authors[0].id === userId,
            check: (action, unsafeAttrs, authors, userId) => {
                if (action === 'edit') {
                    return !this.isChangingAuthors(unsafeAttrs, authors) && this.isCoAuthor(authors, userId);
                }
                if (action === 'add') {
                    return this.isOwner(unsafeAttrs, authors, userId);
                }
                if (action === 'destroy') {
                    return this.isPrimaryAuthor(authors, userId);
                }
                return false;
            }
        },
        add: {
            isOwner: (unsafeAttrs, authors, userId) => {
                if (!unsafeAttrs.authors) {
                    return false;
                }
                if (!unsafeAttrs.authors.length) {
                    return false;
                }
                return unsafeAttrs.authors[0].id === userId;
            },
            check: (action, unsafeAttrs, authors, userId) => this.isOwner(unsafeAttrs, authors, userId)
        },
        destroy: {
            isPrimaryAuthor: (authors, userId) => authors[0].id === userId,
            check: (action, unsafeAttrs, authors, userId) => this.isPrimaryAuthor(authors, userId)
        }
    },
    author: {
        edit: {
            isChangingAuthors: (unsafeAttrs, authors) => {
                if (!unsafeAttrs.authors) {
                    return false;
                }
                if (!unsafeAttrs.authors.length) {
                    return true;
                }
                return unsafeAttrs.authors[0].id !== authors[0].id;
            },
            isCoAuthor: (authors, userId) => authors.some(author => author.id === userId),
            isPrimaryAuthor: (authors, userId) => authors[0].id === userId,
            check: (action, unsafeAttrs, authors, userId) => {
                if (action === 'edit') {
                    return this.isCoAuthor(authors, userId) && !this.isChangingAuthors(unsafeAttrs, authors);
                }
                if (action === 'add') {
                    return this.isOwner(unsafeAttrs, authors, userId);
                }
                return false;
            }
        },
        add: {
            isOwner: (unsafeAttrs, authors, userId) => {
                if (!unsafeAttrs.authors) {
                    return false;
                }
                if (!unsafeAttrs.authors.length) {
                    return false;
                }
                return unsafeAttrs.authors[0].id === userId;
            },
            check: (action, unsafeAttrs, authors, userId) => this.isOwner(unsafeAttrs, authors, userId)
        },
        destroy: {
            isPrimaryAuthor: (authors, userId) => authors[0].id === userId,
            check: (action, unsafeAttrs, authors, userId) => this.isPrimaryAuthor(authors, userId)
        }
    }
};

/**
 * Extracts the owner user from the database
 */
const getOwnerUser = (options, ghostBookshelf) => {
    return ghostBookshelf
        .model('User')
        .getOwnerUser(Object.assign({}, _.pick(options, 'transacting')));
};

/**
 * Matches authors to users based on id, slug, or email
 */
const matchAuthors = (model, options, ghostBookshelf) => {
    const ops = [];

    ops.push(() => {
        return getOwnerUser(options, ghostBookshelf)
            .then(_ownerUser => {
                return _ownerUser;
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
                .then(user => {
                    let userId = user ? user.id : options.ownerUser.id;

                    const userExists = _.find(authorsToSet, {id: userId});

                    if (!userExists) {
                        authorsToSet[index] = {};
                        authorsToSet[index].id = userId;
                    }
                });
            }));
    });

    return sequence(ops);
};

/**
 * Handles options for model operations
 */
const handleOptions = (Post, fnName) => {
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

        return Post.prototype[fnName].call(this, model, attrs, options);
    };
};

/**
 * Validates that at least one author exists
 */
const validateAuthors = (model) => {
    if (model.get('authors') && !model.get('authors').length) {
        throw new errors.ValidationError({
            message: 'At least one author is required.'
        });
    }
};

/**
 * Serializes post attributes with author handling
 */
const serializePost = (Post, options) => {
    let attrs = Post.prototype.serialize.call(this, options);

    if (!this._originalOptions) {
        this._originalOptions = {};
    }

    if (!this._originalOptions.withRelated || this._originalOptions.withRelated.indexOf('authors') === -1) {
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
};

/**
 * Reassigns posts from one author to the owner
 */
const reassignByAuthor = async (unfilteredOptions, ghostBookshelf) => {
    let options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
    let authorId = options.id;

    if (!authorId) {
        return Promise.reject(new errors.NotFoundError({
            message: tpl(messages.noUserFound)
        }));
    }

    const reassignPost = async () => {
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
    };

    if (!options.transacting) {
        return ghostBookshelf.transaction((transacting) => {
            options.transacting = transacting;
            return reassignPost();
        });
    }

    return reassignPost();
};

/**
 * Checks if user has permission to perform action on post
 */
const checkPermission = (action, unsafeAttrs, authors, userId, role) => {
    const strategy = permissionStrategies[role];
    if (!strategy) {
        return false;
    }

    const actionStrategy = strategy[action];
    if (!actionStrategy) {
        return false;
    }

    return actionStrategy.check(action, unsafeAttrs, authors, userId);
};

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions: function _handleOptions(fnName) {
            return handleOptions(Post, fnName);
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

            validateAuthors(model);

            if (model.get('authors')) {
                ops.push(() => {
                    return this.matchAuthors(model, options, ghostBookshelf);
                });
            }

            ops.push(() => {
                return proto.onSaving.call(this, model, attrs, options);
            });

            return sequence(ops);
        },

        serialize: function serialize(options) {
            return serializePost(Post, options);
        },

        matchAuthors: function matchAuthors(model, options) {
            return matchAuthors(model, options, ghostBookshelf);
        },

        reassignByAuthor: async function reassignByAuthor(unfilteredOptions) {
            return reassignByAuthor(unfilteredOptions, ghostBookshelf);
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

            const authors = postModel.related('authors').models;
            const userId = context.user;

            if (isContributor && isEdit) {
                hasUserPermission = checkPermission('edit', unsafeAttrs, authors, userId, 'contributor');
            } else if (isContributor && isAdd) {
                hasUserPermission = checkPermission('add', unsafeAttrs, authors, userId, 'contributor');
            } else if (isContributor && isDestroy) {
                hasUserPermission = checkPermission('destroy', unsafeAttrs, authors, userId, 'contributor');
            } else if (isAuthor && isEdit) {
                hasUserPermission = checkPermission('edit', unsafeAttrs, authors, userId, 'author');
            } else if (isAuthor && isAdd) {
                hasUserPermission = checkPermission('add', unsafeAttrs, authors, userId, 'author');
            } else if (postModel) {
                hasUserPermission = hasUserPermission || checkPermission('edit', unsafeAttrs, authors, userId, 'author');
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
        reassignByAuthor: async function reassignByAuthor(unfilteredOptions) {
            return reassignByAuthor(unfilteredOptions, ghostBookshelf);
        }
    });

    return Model;
};