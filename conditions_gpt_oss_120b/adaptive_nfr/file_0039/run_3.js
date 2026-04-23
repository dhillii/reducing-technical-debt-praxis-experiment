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
 * Determine if the authors attribute is being changed.
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
    const currentAuthorId = postModel.related('authors').models[0].id;
    return unsafeAttrs.authors[0].id !== currentAuthorId;
}

/**
 * Determine if the current user is the owner based on unsafe attributes.
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
 * Determine if the current user is the primary author of the post.
 * @param {Object} postModel
 * @param {Object} context
 * @returns {boolean}
 */
function isPrimaryAuthor(postModel, context) {
    return context.user === postModel.related('authors').models[0].id;
}

/**
 * Determine if the current user is a co‑author of the post.
 * @param {Object} postModel
 * @param {Object} context
 * @returns {boolean}
 */
function isCoAuthor(postModel, context) {
    return postModel.related('authors').models.map(author => author.id).includes(context.user);
}

/**
 * Compute user permission based on role, action and post state.
 * @param {Object} params
 * @param {boolean} params.isContributor
 * @param {boolean} params.isAuthor
 * @param {string} params.action
 * @param {Object} params.postModel
 * @param {Object} params.unsafeAttrs
 * @param {Object} params.context
 * @returns {boolean}
 */
function computeUserPermission({isContributor, isAuthor, action, postModel, unsafeAttrs, context}) {
    const isEdit = action === 'edit';
    const isAdd = action === 'add';
    const isDestroy = action === 'destroy';

    if (isContributor && isEdit) {
        return !isChangingAuthors(unsafeAttrs, postModel) && isCoAuthor(postModel, context);
    }
    if (isContributor && isAdd) {
        return isOwner(unsafeAttrs, context);
    }
    if (isContributor && isDestroy) {
        return isPrimaryAuthor(postModel, context);
    }
    if (isAuthor && isEdit) {
        return isCoAuthor(postModel, context) && !isChangingAuthors(unsafeAttrs, postModel);
    }
    if (isAuthor && isAdd) {
        return isOwner(unsafeAttrs, context);
    }
    if (postModel) {
        return isPrimaryAuthor(postModel, context);
    }
    return false;
}

/**
 * Execute the reassign post logic.
 * @param {Object} options
 * @param {Object} ghostBookshelf
 * @param {string} authorId
 * @returns {Promise<void>}
 */
async function executeReassignPost(options, ghostBookshelf, authorId) {
    const trx = options.transacting;
    const knex = ghostBookshelf.knex;

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
        throw new errors.InternalServerError({err});
    }
}

/**
 * Extend the Post model with Ghost‑specific behaviour.
 * @param {Object} Post
 * @param {Object} Posts
 * @param {Object} ghostBookshelf
 * @returns {Object}
 */
module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        _handleOptions(fnName) {
            const self = this;
            return function innerHandleOptions(model, attrs, options) {
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

                return proto[fnName].call(self, model, attrs, options);
            };
        },

        onFetching(model, attrs, options) {
            return this._handleOptions('onFetching')(model, attrs, options);
        },

        onFetchingCollection(collection, attrs, options) {
            return this._handleOptions('onFetchingCollection')(collection, attrs, options);
        },

        onFetchedCollection(collection, attrs, options) {
            _.each(collection.models, model => {
                model._originalOptions = collection._originalOptions;
            });
            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        async onCreating(model, attrs, options) {
            if (!model.get('authors')) {
                model.set('authors', [{id: await this.contextUser(options)}]);
            }
            return this._handleOptions('onCreating')(model, attrs, options);
        },

        onUpdating(model, attrs, options) {
            return this._handleOptions('onUpdating')(model, attrs, options);
        },

        onSaving(model, attrs, options) {
            const ops = [];

            model.unset('author');

            if (model.get('authors') && !model.get('authors').length) {
                throw new errors.ValidationError({message: 'At least one author is required.'});
            }

            if (model.get('authors')) {
                ops.push(() => this.matchAuthors(model, options));
            }

            ops.push(() => proto.onSaving.call(this, model, attrs, options));

            return sequence(ops);
        },

        serialize(options) {
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

        matchAuthors(model, options) {
            let ownerUser;
            const ops = [];

            ops.push(() => ghostBookshelf
                .model('User')
                .getOwnerUser(_.pick(options, 'transacting'))
                .then(_ownerUser => {
                    ownerUser = _ownerUser;
                })
            );

            ops.push(() => {
                const authors = model.get('authors');
                const authorsToSet = [];

                return Promise.all(authors.map((author, index) => {
                    const query = {};
                    if (author.id) query.id = author.id;
                    else if (author.slug) query.slug = author.slug;
                    else if (author.email) query.email = author.email;

                    return ghostBookshelf
                        .model('User')
                        .where(query)
                        .fetch(Object.assign({columns: ['id']}, _.pick(options, 'transacting')))
                        .then(user => {
                            const userId = user ? user.id : ownerUser.id;
                            const exists = _.find(authorsToSet, {id: userId.id});
                            if (!exists) {
                                authorsToSet[index] = {id: userId};
                            }
                        });
                })).then(() => {
                    model.set('authors', authorsToSet);
                });
            });

            return sequence(ops);
        }
    }, {
        async reassignByAuthor(unfilteredOptions) {
            const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
            const authorId = options.id;

            if (!authorId) {
                return Promise.reject(new errors.NotFoundError({message: tpl(messages.noUserFound)}));
            }

            const reassign = async () => executeReassignPost(options, ghostBookshelf, authorId);

            if (!options.transacting) {
                return ghostBookshelf.transaction(transacting => {
                    options.transacting = transacting;
                    return reassign();
                });
            }

            return reassign();
        },

        permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);

            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                const origArgs = _.toArray(arguments).slice(1);
                return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
                    .then(foundPostModel => {
                        if (!foundPostModel) {
                            throw new errors.NotFoundError({message: tpl(messages.postNotFound)});
                        }
                        const newArgs = [foundPostModel].concat(origArgs);
                        return self.permissible.apply(self, newArgs);
                    });
            }

            const postModel = postModelOrId;
            const userPermission = computeUserPermission({
                isContributor,
                isAuthor,
                action,
                postModel,
                unsafeAttrs,
                context
            });

            const finalPermission = userPermission && hasApiKeyPermission;

            if (finalPermission) {
                return Post.permissible.call(
                    this,
                    postModelOrId,
                    action,
                    context,
                    unsafeAttrs,
                    loadedPermissions,
                    userPermission,
                    hasApiKeyPermission
                ).then(({excludedAttrs}) => {
                    if (isContributor || isAuthor) {
                        return {excludedAttrs: ['authors'].concat(excludedAttrs)};
                    }
                    return {excludedAttrs};
                });
            }

            return Promise.reject(new errors.NoPermissionError({message: tpl(messages.notEnoughPermission)}));
        }
    });

    return Model;
};