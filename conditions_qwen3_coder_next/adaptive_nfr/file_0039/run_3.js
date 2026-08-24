const _ = require('lodash');
const tpl = require('@tryghost/tpl');
const errors = require('@ghost/errors');
const {sequence} = require('@tryghost/promise');
const {setIsRoles} = require('../role-utils');

const messages = {
    noUserFound: 'No user found',
    postNotFound: 'Post not found.',
    notEnoughPermission: 'You do not have permission to perform this action'
};

/**
 * Determines if the author relation is being requested
 * @param {Object} options - The request options containing withRelated
 * @returns {boolean}
 */
function hasAuthorOrAuthorsRelation(options) {
    return !!(options && options.withRelated && (
        options.withRelated.indexOf('author') !== -1 ||
        options.withRelated.indexOf('authors') !== -1
    ));
}

/**
 * Handles special author/author relationship mapping and option normalization
 * @param {Function} originalFn - Original prototype method
 * @param {Object} self - The current instance context
 * @returns {Function} - Wrapped handler function
 */
function createHandleOptionsProcessor(originalFn, self) {
    return function innerHandleOptions(model, attrs, options) {
        model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

        if (!options.withRelated) {
            options.withRelated = [];
        }

        // Normalize 'author' to 'authors'
        if (options.withRelated.indexOf('author') !== -1) {
            options.withRelated.splice(options.withRelated.indexOf('author'), 1);
            options.withRelated.push('authors');
        }

        // Ensure authors are fetched for write operations
        if (
            options.forUpdate &&
            ['onFetching', 'onFetchingCollection'].indexOf(originalFn.name) !== -1 &&
            options.withRelated.indexOf('authors') === -1
        ) {
            options.withRelated.push('authors');
        }

        return proto[originalFn.name].call(self, model, attrs, options);
    };
}

/**
 * Matches posted author identifiers to actual user IDs
 * @param {Object} model - The post model being saved
 * @param {Object} options - Context options including transacting
 * @returns {Promise} Resolves when authors are matched and set on model
 */
async function matchAuthors(model, options) {
    const ownerUser = await ghostBookshelf
        .model('User')
        .getOwnerUser(Object.assign({}, _.pick(options, 'transacting')));
    const authors = model.get('authors') || [];
    const authorsToSet = [];

    for (const author of authors) {
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

        // Avoid duplicate authors
        if (!authorsToSet.some(item => item && item.id === userId.id)) {
            authorsToSet.push({id: userId});
        }
    }

    model.set('authors', authorsToSet);
}

/**
 * Serializes model attributes with authors/primary_author handling
 * @param {Object} options - Serialization options
 * @returns {Object} Serialized attributes
 */
function serializeWithAuthors(options) {
    let attrs = proto.serialize.call(this, options);

    // Initialize originalOptions if missing
    if (!this._originalOptions) {
        this._originalOptions = {};
    }

    // Conditionally remove authors from response
    if (!this._originalOptions || !this._originalOptions.withRelated || !hasAuthorOrAuthorsRelation(this._originalOptions)) {
        delete attrs.authors;
    }

    // Attach primary_author if needed
    if (!options.columns || (options.columns && options.columns.indexOf('primary_author') > -1)) {
        attrs.primary_author = attrs.authors && attrs.authors.length ? attrs.authors[0] : null;
    }

    return attrs;
}

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        onFetching: function onFetching(model, attrs, options) {
            return createHandleOptionsProcessor({name: 'onFetching'}, this)(model, attrs, options);
        },

        onFetchingCollection: function onFetchingCollection(collection, attrs, options) {
            return createHandleOptionsProcessor({name: 'onFetchingCollection'}, this)(collection, attrs, options);
        },

        onFetchedCollection: function onFetchedCollection(collection, attrs, options) {
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

            return createHandleOptionsProcessor({name: 'onCreating'}, this)(model, attrs, options);
        },

        onUpdating: function onUpdating(model, attrs, options) {
            return createHandleOptionsProcessor({name: 'onUpdating'}, this)(model, attrs, options);
        },

        onSaving: async function onSaving(model, attrs, options) {
            model.unset('author');

            if (model.get('authors') && !model.get('authors').length) {
                throw new errors.ValidationError({
                    message: 'At least one author is required.'
                });
            }

            const ops = [];

            if (model.get('authors')) {
                ops.push(() => matchAuthors(model, options));
            }

            ops.push(() => proto.onSaving.call(this, model, attrs, options));

            return sequence(ops);
        },

        serialize: serializeWithAuthors
    }, {
        reassignByAuthor: async function reassignByAuthor(unfilteredOptions) {
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

                // Get owner user
                const ownerUser = await knex('roles')
                    .transacting(trx)
                    .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
                    .where('roles.name', 'Owner')
                    .select('roles_users.user_id');
                const ownerId = ownerUser[0].user_id;

                // Fetch authors' posts
                const authorsPosts = await knex('posts_authors')
                    .transacting(trx)
                    .where('author_id', authorId)
                    .select('post_id', 'sort_order');

                const ownersPosts = await knex('posts_authors')
                    .transacting(trx)
                    .where('author_id', ownerId)
                    .select('post_id');

                // Identify primary posts with owner co-author
                const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
                const primaryPostsWithOwnerCoauthor = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
                const primaryPostsWithOwnerCoauthorIds = primaryPostsWithOwnerCoauthor.map(post => post.post_id);

                // Handle primary posts with owner co-author
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

                // Handle primary posts without owner co-author
                const primaryPostsWithoutOwnerCoauthor = _.differenceBy(authorsPrimaryPosts, primaryPostsWithOwnerCoauthor, 'post_id');
                const postsWithoutOwnerCoauthorIds = primaryPostsWithoutOwnerCoauthor.map(post => post.post_id);

                await knex('posts_authors')
                    .transacting(trx)
                    .whereIn('post_id', postsWithoutOwnerCoauthorIds)
                    .where('author_id', authorId)
                    .update('author_id', ownerId);

                // Remove author as secondary author
                await knex('posts_authors')
                    .transacting(trx)
                    .where('author_id', authorId)
                    .del();
            };

            try {
                if (!options.transacting) {
                    return ghostBookshelf.transaction((transacting) => {
                        options.transacting = transacting;
                        return reassignPost();
                    });
                }

                await reassignPost();
            } catch (err) {
                throw new errors.InternalServerError({err});
            }
        },

        permissible: function permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            let origArgs;

            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                origArgs = _.toArray(arguments).slice(1);

                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then((foundPostModel) => {
                        if (!foundPostModel) {
                            throw new errors.NotFoundError({
                                message: tpl(messages.postNotFound)
                            });
                        }

                        const newArgs = [foundPostModel].concat(origArgs);
                        return self.permissible.apply(self, newArgs);
                    });
            }

            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
            const postModel = postModelOrId;
            const isEdit = (action === 'edit');
            const isAdd = (action === 'add');
            const isDestroy = (action === 'destroy');

            function isChangingAuthors() {
                return !!(unsafeAttrs.authors && (
                    !unsafeAttrs.authors.length ||
                    unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id
                ));
            }

            function isOwner() {
                return !!(unsafeAttrs.authors && unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user);
            }

            function isPrimaryAuthor() {
                return context.user === postModel.related('authors').models[0].id;
            }

            function isCoAuthor() {
                return postModel.related('authors').models.map(author => author.id).includes(context.user);
            }

            if (isContributor) {
                if (isEdit) {
                    hasUserPermission = !isChangingAuthors() && isCoAuthor();
                } else if (isAdd) {
                    hasUserPermission = isOwner();
                } else if (isDestroy) {
                    hasUserPermission = isPrimaryAuthor();
                }
            } else if (isAuthor) {
                if (isEdit) {
                    hasUserPermission = isCoAuthor() && !isChangingAuthors();
                } else if (isAdd) {
                    hasUserPermission = isOwner();
                }
            } else if (postModel) {
                hasUserPermission = hasUserPermission || isPrimaryAuthor();
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
                        return {excludedAttrs: ['authors'].concat(excludedAttrs)};
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