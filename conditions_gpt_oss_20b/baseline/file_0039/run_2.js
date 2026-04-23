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

    function handleOptions(fnName) {
        return function (model, attrs, options) {
            model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

            if (!options.withRelated) {
                options.withRelated = [];
            }

            if (options.withRelated.includes('author')) {
                options.withRelated = options.withRelated.filter(r => r !== 'author');
                options.withRelated.push('authors');
            }

            if (options.forUpdate && ['onFetching', 'onFetchingCollection'].includes(fnName) && !options.withRelated.includes('authors')) {
                options.withRelated.push('authors');
            }

            return proto[fnName].call(this, model, attrs, options);
        };
    }

    const Model = Post.extend({
        onFetching: function (model, attrs, options) {
            return handleOptions('onFetching').call(this, model, attrs, options);
        },

        onFetchingCollection: function (collection, attrs, options) {
            return handleOptions('onFetchingCollection').call(this, collection, attrs, options);
        },

        onFetchedCollection: function (collection, attrs, options) {
            collection.models.forEach(m => { m._originalOptions = collection._originalOptions; });
            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        onCreating: async function (model, attrs, options) {
            if (!model.get('authors')) {
                model.set('authors', [{ id: await this.contextUser(options) }]);
            }
            return handleOptions('onCreating').call(this, model, attrs, options);
        },

        onUpdating: function (model, attrs, options) {
            return handleOptions('onUpdating').call(this, model, attrs, options);
        },

        onSaving: async function (model, attrs, options) {
            model.unset('author');

            if (model.get('authors') && !model.get('authors').length) {
                throw new errors.ValidationError({ message: 'At least one author is required.' });
            }

            if (model.get('authors')) {
                await this.matchAuthors(model, options);
            }

            return proto.onSaving.call(this, model, attrs, options);
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

        async matchAuthors(model, options) {
            const ownerUser = await ghostBookshelf.model('User')
                .getOwnerUser(_.pick(options, 'transacting'));

            const authors = model.get('authors') || [];
            const authorsToSet = [];

            for (let i = 0; i < authors.length; i++) {
                const author = authors[i];
                const query = author.id ? { id: author.id } : author.slug ? { slug: author.slug } : author.email ? { email: author.email } : {};

                const user = await ghostBookshelf.model('User')
                    .where(query)
                    .fetch({ columns: ['id'], ..._.pick(options, 'transacting') });

                const userId = user ? user.id : ownerUser.id;

                if (!authorsToSet.find(a => a.id === userId)) {
                    authorsToSet[i] = { id: userId };
                }
            }

            model.set('authors', authorsToSet);
        }
    }, {
        async reassignByAuthor(unfilteredOptions) {
            const options = this.filterOptions(unfilteredOptions, 'reassignByAuthor', { extraAllowedProperties: ['id'] });
            const authorId = options.id;

            if (!authorId) {
                return Promise.reject(new errors.NotFoundError({ message: tpl(messages.noUserFound) }));
            }

            const trx = options.transacting;
            const knex = ghostBookshelf.knex;

            const exec = async () => {
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

                await knex('posts_authors')
                    .transacting(trx)
                    .whereIn('post_id', primaryWithOwnerIds)
                    .where('author_id', authorId)
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
                    .where('author_id', authorId)
                    .update('author_id', ownerId);

                await knex('posts_authors')
                    .transacting(trx)
                    .where('author_id', authorId)
                    .del();
            };

            if (!trx) {
                return ghostBookshelf.transaction(t => {
                    options.transacting = t;
                    return exec();
                });
            }

            return exec();
        },

        async permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            const self = this;
            const postModel = postModelOrId;
            const { isContributor, isAuthor } = setIsRoles(loadedPermissions);
            let isEdit, isAdd, isDestroy;

            if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
                const origArgs = Array.prototype.slice.call(arguments, 1);
                const foundPostModel = await this.findOne({ id: postModelOrId, status: 'all' }, { withRelated: ['authors'] });

                if (!foundPostModel) {
                    throw new errors.NotFoundError({ message: tpl(messages.postNotFound) });
                }

                const newArgs = [foundPostModel].concat(origArgs);
                return self.permissible.apply(self, newArgs);
            }

            isEdit = action === 'edit';
            isAdd = action === 'add';
            isDestroy = action === 'destroy';

            const isChangingAuthors = () => {
                if (!unsafeAttrs.authors) return false;
                if (!unsafeAttrs.authors.length) return true;
                return unsafeAttrs.authors[0].id !== postModel.related('authors').models[0].id;
            };

            const isOwner = () => {
                if (!unsafeAttrs.authors) return false;
                return unsafeAttrs.authors.length && unsafeAttrs.authors[0].id === context.user;
            };

            const isPrimaryAuthor = () => context.user === postModel.related('authors').models[0].id;
            const isCoAuthor = () => postModel.related('authors').models.map(a => a.id).includes(context.user);

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
                const { excludedAttrs } = result;
                if (isContributor || isAuthor) {
                    return { excludedAttrs: ['authors'].concat(excludedAttrs) };
                }
                return { excludedAttrs };
            }

            throw new errors.NoPermissionError({ message: tpl(messages.notEnoughPermission) });
        }
    });

    return Model;
};