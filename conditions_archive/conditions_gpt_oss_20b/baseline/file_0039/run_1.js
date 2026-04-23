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

    // Helper to handle options for fetching
    function handleOptions(self, fnName, model, attrs, options) {
        const original = proto[fnName];
        const opts = _.cloneDeep(_.pick(options, ['withRelated']));

        if (!options.withRelated) {
            options.withRelated = [];
        }

        if (options.withRelated.indexOf('author') !== -1) {
            options.withRelated.splice(options.withRelated.indexOf('author'), 1);
            options.withRelated.push('authors');
        }

        if (options.forUpdate && ['onFetching', 'onFetchingCollection'].indexOf(fnName) !== -1 && options.withRelated.indexOf('authors') === -1) {
            options.withRelated.push('authors');
        }

        model._originalOptions = opts;
        return original.call(self, model, attrs, options);
    }

    // Helper to match authors
    async function matchAuthors(model, options) {
        const ownerUser = await ghostBookshelf
            .model('User')
            .getOwnerUser(_.pick(options, 'transacting'));

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
                .fetch(_.assign({columns: ['id']}, _.pick(options, 'transacting')));

            const userId = user ? user.id : ownerUser.id;
            const exists = _.find(authorsToSet, {id: userId});

            if (!exists) {
                authorsToSet[index] = {id: userId};
            }
        }));

        model.set('authors', authorsToSet);
    }

    // Helper for reassigning posts by author
    async function reassignPost(options, authorId) {
        const trx = options.transacting;
        const knex = ghostBookshelf.knex;

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
        const primaryPostsWithOwnerCoauthor = _.intersectionBy(authorsPrimaryPosts, ownersPosts, 'post_id');
        const primaryPostsWithOwnerCoauthorIds = primaryPostsWithOwnerCoauthor.map(p => p.post_id);

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
        const postsWithoutOwnerCoauthorIds = primaryPostsWithoutOwnerCoauthor.map(p => p.post_id);

        await knex('posts_authors')
            .transacting(trx)
            .whereIn('post_id', postsWithoutOwnerCoauthorIds)
            .where('author_id', authorId)
            .update('author_id', ownerId);

        await knex('posts_authors')
            .transacting(trx)
            .where('author_id', authorId)
            .del();
    }

    // Helper functions for permissible
    function isChangingAuthors(unsafeAttrs, postModel) {
        if (!unsafeAttrs.authors) return false;
        if (!unsafeAttrs.authors.length) return true;
        return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
    }

    function isOwner(unsafeAttrs, context) {
        if (!unsafeAttrs.authors) return false;
        return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
    }

    function isPrimaryAuthor(postModel, context) {
        return context.user === postModel.related('authors').models[0].id;
    }

    function isCoAuthor(postModel, context) {
        return postModel.related('authors').models.map(a => a.id).includes(context.user);
    }

    const Model = Post.extend({
        onFetching(model, attrs, options) {
            return handleOptions(this, 'onFetching', model, attrs, options);
        },

        onFetchingCollection(collection, attrs, options) {
            return handleOptions(this, 'onFetchingCollection', collection, attrs, options);
        },

        onFetchedCollection(collection, attrs, options) {
            collection.models.forEach(m => {
                m._originalOptions = collection._originalOptions;
            });
            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        async onCreating(model, attrs, options) {
            if (!model.get('authors')) {
                model.set('authors', [{id: await this.contextUser(options)}]);
            }
            return handleOptions(this, 'onCreating', model, attrs, options);
        },

        onUpdating(model, attrs, options) {
            return handleOptions(this, 'onUpdating', model, attrs, options);
        },

        async onSaving(model, attrs, options) {
            model.unset('author');

            if (model.get('authors') && !model.get('authors').length) {
                throw new errors.ValidationError({message: 'At least one author is required.'});
            }

            if (model.get('authors')) {
                await matchAuthors(model, options);
            }

            return proto.onSaving.call(this, model, attrs, options);
        },

        serialize(options) {
            let attrs = proto.serialize.call(this, options);

            if (!this._originalOptions) {
                this._originalOptions = {};
            }

            if (!this._originalOptions.withRelated || this._originalOptions.withRelated.indexOf('authors') === -1) {
                delete attrs.authors;
            }

            if (!options.columns || options.columns.indexOf('primary_author') > -1) {
                attrs.primary_author = (attrs.authors && attrs.authors.length) ? attrs.authors[0] : null;
            }

            return attrs;
        },

        async matchAuthors(model, options) {
            await matchAuthors(model, options);
        }
    }, {
        async reassignByAuthor(unfilteredOptions) {
            const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
            const authorId = options.id;

            if (!authorId) {
                return Promise.reject(new errors.NotFoundError({message: tpl(messages.noUserFound)}));
            }

            const perform = async () => {
                try {
                    await reassignPost(options, authorId);
                } catch (err) {
                    throw new errors.InternalServerError({err});
                }
            };

            if (!options.transacting) {
                return ghostBookshelf.transaction(transacting => {
                    options.transacting = transacting;
                    return perform();
                });
            }

            return perform();
        },

        async permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const postModel = postModelOrId;
            const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
            let isEdit, isAdd, isDestroy;

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

            isEdit = action === 'edit';
            isAdd = action === 'add';
            isDestroy = action === 'destroy';

            if (isContributor && isEdit) {
                hasUserPermission = !isChangingAuthors(unsafeAttrs, postModel) && isCoAuthor(postModel, context);
            } else if (isContributor && isAdd) {
                hasUserPermission = isOwner(unsafeAttrs, context);
            } else if (isContributor && isDestroy) {
                hasUserPermission = isPrimaryAuthor(postModel, context);
            } else if (isAuthor && isEdit) {
                hasUserPermission = isCoAuthor(postModel, context) && !isChangingAuthors(unsafeAttrs, postModel);
            } else if (isAuthor && isAdd) {
                hasUserPermission = isOwner(unsafeAttrs, context);
            } else if (postModel) {
                hasUserPermission = hasUserPermission || isPrimaryAuthor(postModel, context);
            }

            if (hasUserPermission && hasApiKeyPermission) {
                const result = await Post.permissible.call(
                    this,
                    postModelOrId,
                    action,
                    context,
                    unsafeAttrs,
                    loadedPermissions,
                    hasUserPermission,
                    hasApiKeyPermission
                );
                const {excludedAttrs} = result;
                if (isContributor || isAuthor) {
                    return {excludedAttrs: ['authors'].concat(excludedAttrs)};
                }
                return {excludedAttrs};
            }

            return Promise.reject(new errors.NoPermissionError({message: tpl(messages.notEnoughPermission)}));
        }
    });

    return Model;
};