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

module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    /**
     * Normalise the `withRelated` option for posts.
     * @param {Object} options
     * @param {string} fnName
     */
    function _handleOptions(fnName) {
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
    }

    /**
     * Validate that at least one author is present.
     * @param {Object} model
     */
    function validateAuthorsPresence(model) {
        if (model.get('authors') && !model.get('authors').length) {
            throw new errors.ValidationError({
                message: 'At least one author is required.'
            });
        }
    }

    /**
     * Determine if the `authors` relation should be removed from the serialized output.
     * @param {Object} model
     * @returns {boolean}
     */
    function shouldRemoveAuthors(model) {
        const opts = model._originalOptions || {};
        return !opts.withRelated || opts.withRelated.indexOf('authors') === -1;
    }

    /**
     * Compute the primary author for serialization.
     * @param {Object} attrs
     */
    function computePrimaryAuthor(attrs) {
        if (attrs.authors && attrs.authors.length) {
            attrs.primary_author = attrs.authors[0];
        } else {
            attrs.primary_author = null;
        }
    }

    /**
     * Fetch the owner user once.
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    function fetchOwnerUser(options) {
        return ghostBookshelf
            .model('User')
            .getOwnerUser(Object.assign({}, _.pick(options, 'transacting')));
    }

    /**
     * Map authors to user IDs, ensuring no duplicates.
     * @param {Array} authors
     * @param {Object} ownerUser
     * @param {Object} options
     * @returns {Promise<Array>}
     */
    function mapAuthorsToIds(authors, ownerUser, options) {
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
                    const userId = user ? user.id : ownerUser.id;
                    const exists = _.find(authorsToSet, {id: userId});
                    if (!exists) {
                        authorsToSet[index] = {id: userId};
                    }
                });
        })).then(() => authorsToSet);
    }

    /**
     * Perform the author reassignment logic.
     * @param {Object} options
     * @returns {Promise<void>}
     */
    async function performReassignPost(options) {
        const trx = options.transacting;
        const knex = ghostBookshelf.knex;

        try {
            const ownerRows = await knex('roles')
                .transacting(trx)
                .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
                .where('roles.name', 'Owner')
                .select('roles_users.user_id');
            const ownerId = ownerRows[0].user_id;

            const authorsPosts = await knex('posts_authors')
                .transacting(trx)
                .where('author_id', options.id)
                .select('post_id', 'sort_order');

            const ownersPosts = await knex('posts_authors')
                .transacting(trx)
                .where('author_id', ownerId)
                .select('post_id');

            const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
            const primaryWithOwner = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
            const primaryWithOwnerIds = primaryWithOwner.map(p => p.post_id);

            await knex('posts_authors')
                .transacting(trx)
                .whereIn('post_id', primaryWithOwnerIds)
                .where('author_id', options.id)
                .del();

            await knex('posts_authors')
                .transacting(trx)
                .whereIn('post_id', primaryWithOwnerIds)
                .where('author_id', ownerId)
                .update('sort_order', 0);

            const primaryWithoutOwner = _.differenceBy(authorsPrimaryPosts, primaryWithOwner, 'post_id');
            const withoutOwnerIds = primaryWithoutOwner.map(p => p.post_id);

            await knex('posts_authors')
                .transacting(trx)
                .whereIn('post_id', withoutOwnerIds)
                .where('author_id', options.id)
                .update('author_id', ownerId);

            await knex('posts_authors')
                .transacting(trx)
                .where('author_id', options.id)
                .del();
        } catch (err) {
            throw new errors.InternalServerError({err});
        }
    }

    /**
     * Determine if the authors array is changing.
     * @param {Object} unsafeAttrs
     * @param {Object} postModel
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
     * Determine if the current user is the owner of the post.
     * @param {Object} unsafeAttrs
     * @param {Object} context
     * @returns {boolean}
     */
    function isOwner(unsafeAttrs, context) {
        if (!unsafeAttrs.authors) {
            return false;
        }
        return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
    }

    /**
     * Determine if the current user is the primary author.
     * @param {Object} context
     * @param {Object} postModel
     * @returns {boolean}
     */
    function isPrimaryAuthor(context, postModel) {
        return context.user === postModel.related('authors').models[0].id;
    }

    /**
     * Determine if the current user is a co-author.
     * @param {Object} context
     * @param {Object} postModel
     * @returns {boolean}
     */
    function isCoAuthor(context, postModel) {
        return postModel.related('authors').models.map(a => a.id).includes(context.user);
    }

    /**
     * Evaluate permissions for contributor role.
     * @param {string} action
     * @param {Object} unsafeAttrs
     * @param {Object} context
     * @param {Object} postModel
     * @returns {boolean}
     */
    function evaluateContributorPermissions(action, unsafeAttrs, context, postModel) {
        if (action === 'edit') {
            return !isChangingAuthors(unsafeAttrs, postModel) && isCoAuthor(context, postModel);
        }
        if (action === 'add') {
            return isOwner(unsafeAttrs, context);
        }
        if (action === 'destroy') {
            return isPrimaryAuthor(context, postModel);
        }
        return false;
    }

    /**
     * Evaluate permissions for author role.
     * @param {string} action
     * @param {Object} unsafeAttrs
     * @param {Object} context
     * @param {Object} postModel
     * @returns {boolean}
     */
    function evaluateAuthorPermissions(action, unsafeAttrs, context, postModel) {
        if (action === 'edit') {
            return isCoAuthor(context, postModel) && !isChangingAuthors(unsafeAttrs, postModel);
        }
        if (action === 'add') {
            return isOwner(unsafeAttrs, context);
        }
        return false;
    }

    /**
     * Evaluate permissions for other roles.
     * @param {Object} postModel
     * @param {Object} context
     * @returns {boolean}
     */
    function evaluateOtherPermissions(postModel, context) {
        return context.user === postModel.related('authors').models[0].id;
    }

    const Model = Post.extend({
        _handleOptions,

        onFetching: function onFetching(model, attrs, options) {
            return this._handleOptions('onFetching')(model, attrs, options);
        },

        onFetchingCollection: function onFetchingCollection(collection, attrs, options) {
            return this._handleOptions('onFetchingCollection')(collection, attrs, options);
        },

        onFetchedCollection: function (collection, attrs, options) {
            _.each(collection.models, (model) => {
                model._originalOptions = collection._originalOptions;
            });
            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        onCreating: async function onCreating(model, attrs, options) {
            if (!model.get('authors')) {
                model.set('authors', [{id: await this.contextUser(options)}]);
            }
            return this._handleOptions('onCreating')(model, attrs, options);
        },

        onUpdating: function onUpdating(model, attrs, options) {
            return this._handleOptions('onUpdating')(model, attrs, options);
        },

        onSaving: function (model, attrs, options) {
            const ops = [];
            model.unset('author');
            validateAuthorsPresence(model);
            if (model.get('authors')) {
                ops.push(() => this.matchAuthors(model, options));
            }
            ops.push(() => proto.onSaving.call(this, model, attrs, options));
            return sequence(ops);
        },

        serialize: function serialize(options) {
            let attrs = proto.serialize.call(this, options);
            if (!this._originalOptions) {
                this._originalOptions = {};
            }
            if (shouldRemoveAuthors(this)) {
                delete attrs.authors;
            }
            if (!options.columns || options.columns.indexOf('primary_author') > -1) {
                computePrimaryAuthor(attrs);
            }
            return attrs;
        },

        matchAuthors(model, options) {
            const ops = [];
            let ownerUser;
            ops.push(() => fetchOwnerUser(options).then((u) => { ownerUser = u; }));
            ops.push(() => {
                const authors = model.get('authors');
                return mapAuthorsToIds(authors, ownerUser, options).then((ids) => {
                    model.set('authors', ids);
                });
            });
            return sequence(ops);
        }
    }, {
        reassignByAuthor: async function reassignByAuthor(unfilteredOptions) {
            const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
            const authorId = options.id;
            if (!authorId) {
                return Promise.reject(new errors.NotFoundError({
                    message: tpl(messages.noUserFound)
                }));
            }

            const perform = () => performReassignPost(options);

            if (!options.transacting) {
                return ghostBookshelf.transaction((transacting) => {
                    options.transacting = transacting;
                    return perform();
                });
            }
            return perform();
        },

        permissible: function permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const postModel = postModelOrId;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
            let isEdit = (action === 'edit');
            let isAdd = (action === 'add');
            let isDestroy = (action === 'destroy');

            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                const origArgs = _.toArray(arguments).slice(1);
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

            if (isContributor) {
                hasUserPermission = evaluateContributorPermissions(action, unsafeAttrs, context, postModel);
            } else if (isAuthor) {
                hasUserPermission = evaluateAuthorPermissions(action, unsafeAttrs, context, postModel);
            } else if (postModel) {
                hasUserPermission = evaluateOtherPermissions(postModel, context);
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
    });

    return Model;
};