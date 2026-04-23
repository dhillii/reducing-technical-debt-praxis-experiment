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
 * @private
 * Handles option normalization for fetching hooks.
 */
function createOptionHandler(proto, fnName) {
    return function (model, attrs, options) {
        model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

        if (!options.withRelated) {
            options.withRelated = [];
        }

        const authorIdx = options.withRelated.indexOf('author');
        if (authorIdx !== -1) {
            options.withRelated.splice(authorIdx, 1);
            options.withRelated.push('authors');
        }

        if (options.forUpdate &&
            ['onFetching', 'onFetchingCollection'].includes(fnName) &&
            !options.withRelated.includes('authors')) {
            options.withRelated.push('authors');
        }

        return proto[fnName].call(this, model, attrs, options);
    };
}

/**
 * @private
 * Extracts author matching logic.
 */
function matchAuthorsFactory(ghostBookshelf) {
    return async function (model, options) {
        let ownerUser;
        const ops = [];

        ops.push(() => {
            return ghostBookshelf
                .model('User')
                .getOwnerUser(_.pick(options, 'transacting'))
                .then((_ownerUser) => {
                    ownerUser = _ownerUser;
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
                    .then((user) => {
                        const userId = user ? user.id : ownerUser.id;

                        // Avoid duplicate authors
                        const exists = _.find(authorsToSet, {id: userId});
                        if (!exists) {
                            authorsToSet[index] = {id: userId};
                        }
                    });
            })).then(() => {
                model.set('authors', authorsToSet);
            });
        });

        return sequence(ops);
    };
}

/**
 * @private
 * Permission evaluation helpers.
 */
class PermissionEvaluator {
    /**
     * @param {Object} params
     * @param {Object} params.postModel
     * @param {string} params.action
     * @param {Object} params.context
     * @param {Object} params.unsafeAttrs
     * @param {Object} params.loadedPermissions
     * @param {boolean} params.hasUserPermission
     * @param {boolean} params.hasApiKeyPermission
     */
    constructor({postModel, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission}) {
        this.postModel = postModel;
        this.action = action;
        this.context = context;
        this.unsafeAttrs = unsafeAttrs;
        this.loadedPermissions = loadedPermissions;
        this.hasUserPermission = hasUserPermission;
        this.hasApiKeyPermission = hasApiKeyPermission;
        const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
        this.isContributor = isContributor;
        this.isAuthor = isAuthor;
    }

    isChangingAuthors() {
        if (!this.unsafeAttrs.authors) {
            return false;
        }
        if (!this.unsafeAttrs.authors.length) {
            return true;
        }
        const currentAuthorId = this.postModel.related('authors').models[0].id;
        return this.unsafeAttrs.authors[0].id !== currentAuthorId;
    }

    isOwner() {
        if (!this.unsafeAttrs.authors) {
            return false;
        }
        return this.unsafeAttrs.authors.length &&
            this.unsafeAttrs.authors[0].id === this.context.user;
    }

    isPrimaryAuthor() {
        return this.context.user === this.postModel.related('authors').models[0].id;
    }

    isCoAuthor() {
        return this.postModel.related('authors').models
            .map(author => author.id)
            .includes(this.context.user);
    }

    evaluate() {
        const {action, isContributor, isAuthor} = this;
        const isEdit = action === 'edit';
        const isAdd = action === 'add';
        const isDestroy = action === 'destroy';

        if (isContributor && isEdit) {
            this.hasUserPermission = !this.isChangingAuthors() && this.isCoAuthor();
        } else if (isContributor && isAdd) {
            this.hasUserPermission = this.isOwner();
        } else if (isContributor && isDestroy) {
            this.hasUserPermission = this.isPrimaryAuthor();
        } else if (isAuthor && isEdit) {
            this.hasUserPermission = this.isCoAuthor() && !this.isChangingAuthors();
        } else if (isAuthor && isAdd) {
            this.hasUserPermission = this.isOwner();
        } else if (this.postModel) {
            this.hasUserPermission = this.hasUserPermission || this.isPrimaryAuthor();
        }

        return this.hasUserPermission && this.hasApiKeyPermission;
    }
}

/**
 * Extends the Post model with author handling logic.
 */
module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;
    const matchAuthors = matchAuthorsFactory(ghostBookshelf);

    const Model = Post.extend({
        _handleOptions: function (fnName) {
            return createOptionHandler(proto, fnName).bind(this);
        },

        onFetching: function (model, attrs, options) {
            return this._handleOptions('onFetching')(model, attrs, options);
        },

        onFetchingCollection: function (collection, attrs, options) {
            return this._handleOptions('onFetchingCollection')(collection, attrs, options);
        },

        onFetchedCollection: function (collection, attrs, options) {
            _.each(collection.models, model => {
                model._originalOptions = collection._originalOptions;
            });
            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        onCreating: async function (model, attrs, options) {
            if (!model.get('authors')) {
                model.set('authors', [{id: await this.contextUser(options)}]);
            }
            return this._handleOptions('onCreating')(model, attrs, options);
        },

        onUpdating: function (model, attrs, options) {
            return this._handleOptions('onUpdating')(model, attrs, options);
        },

        onSaving: function (model, attrs, options) {
            const ops = [];

            // Remove deprecated single author field
            model.unset('author');

            // Ensure at least one author exists
            if (model.get('authors') && !model.get('authors').length) {
                throw new errors.ValidationError({message: 'At least one author is required.'});
            }

            if (model.get('authors')) {
                ops.push(() => matchAuthors.call(this, model, options));
            }

            ops.push(() => proto.onSaving.call(this, model, attrs, options));

            return sequence(ops);
        },

        serialize: function (options) {
            let attrs = proto.serialize.call(this, options);

            if (!this._originalOptions) {
                this._originalOptions = {};
            }

            if (!this._originalOptions.withRelated || !this._originalOptions.withRelated.includes('authors')) {
                delete attrs.authors;
            }

            if (!options.columns || options.columns.includes('primary_author')) {
                attrs.primary_author = (attrs.authors && attrs.authors.length) ? attrs.authors[0] : null;
            }

            return attrs;
        },

        matchAuthors
    }, {
        reassignByAuthor: async function (unfilteredOptions) {
            const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
            const authorId = options.id;

            if (!authorId) {
                return Promise.reject(new errors.NotFoundError({message: tpl(messages.noUserFound)}));
            }

            const reassignPost = async () => {
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
                        .where('author_id', authorId)
                        .select('post_id', 'sort_order');

                    const ownersPosts = await knex('posts_authors')
                        .transacting(trx)
                        .where('author_id', ownerId)
                        .select('post_id');

                    const authorsPrimaryPosts = authorsPosts.filter(ap => ap.sort_order === 0);
                    const primaryWithOwner = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
                    const primaryWithOwnerIds = primaryWithOwner.map(p => p.post_id);

                    // Remove author from primary posts where owner is co‑author
                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', primaryWithOwnerIds)
                        .where('author_id', authorId)
                        .del();

                    // Promote owner to primary author on those posts
                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', primaryWithOwnerIds)
                        .where('author_id', ownerId)
                        .update('sort_order', 0);

                    const primaryWithoutOwner = _.differenceBy(authorsPrimaryPosts, primaryWithOwner, 'post_id');
                    const primaryWithoutOwnerIds = primaryWithoutOwner.map(p => p.post_id);

                    // Swap author with owner on primary posts without owner co‑author
                    await knex('posts_authors')
                        .transacting(trx)
                        .whereIn('post_id', primaryWithoutOwnerIds)
                        .where('author_id', authorId)
                        .update('author_id', ownerId);

                    // Remove author from any secondary author positions
                    await knex('posts_authors')
                        .transacting(trx)
                        .where('author_id', authorId)
                        .del();
                } catch (err) {
                    throw new errors.InternalServerError({err});
                }
            };

            if (!options.transacting) {
                return ghostBookshelf.transaction(transacting => {
                    options.transacting = transacting;
                    return reassignPost();
                });
            }

            return reassignPost();
        },

        permissible: function (postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;

            // Resolve id to model if necessary
            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                const origArgs = _.toArray(arguments).slice(1);
                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then(found => {
                        if (!found) {
                            throw new errors.NotFoundError({message: tpl(messages.postNotFound)});
                        }
                        const newArgs = [found].concat(origArgs);
                        return self.permissible.apply(self, newArgs);
                    });
            }

            const evaluator = new PermissionEvaluator({
                postModel: postModelOrId,
                action,
                context,
                unsafeAttrs,
                loadedPermissions,
                hasUserPermission,
                hasApiKeyPermission
            });

            const permissionGranted = evaluator.evaluate();

            if (permissionGranted) {
                return Post.permissible.call(
                    this,
                    postModelOrId,
                    action,
                    context,
                    unsafeAttrs,
                    loadedPermissions,
                    evaluator.hasUserPermission,
                    evaluator.hasApiKeyPermission
                ).then(({excludedAttrs}) => {
                    if (evaluator.isContributor || evaluator.isAuthor) {
                        return {excludedAttrs: ['authors', ...excludedAttrs]};
                    }
                    return {excludedAttrs};
                });
            }

            return Promise.reject(new errors.NoPermissionError({message: tpl(messages.notEnoughPermission)}));
        }
    });

    return Model;
};