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
 * Adjust request options to ensure authors are fetched correctly.
 * @param {Object} model   Model instance
 * @param {Object} attrs   Attributes
 * @param {Object} options Query options
 * @param {string} fnName  Name of the original Bookshelf hook
 * @param {Object} proto   Original prototype methods
 * @returns {Promise}
 */
function handleOptions(model, attrs, options, fnName, proto) {
    model._originalOptions = _.cloneDeep(_.pick(options, ['withRelated']));

    if (!options.withRelated) {
        options.withRelated = [];
    }

    // replace legacy `author` with `authors`
    const authorIdx = options.withRelated.indexOf('author');
    if (authorIdx !== -1) {
        options.withRelated.splice(authorIdx, 1);
        options.withRelated.push('authors');
    }

    // ensure authors are fetched on updates
    if (options.forUpdate && ['onFetching', 'onFetchingCollection'].includes(fnName) && !options.withRelated.includes('authors')) {
        options.withRelated.push('authors');
    }

    return proto[fnName].call(this, model, attrs, options);
}

/**
 * Copy original options from collection to each model.
 * @param {Object} collection Bookshelf collection
 */
function propagateOriginalOptions(collection) {
    _.each(collection.models, model => {
        model._originalOptions = collection._originalOptions;
    });
}

/**
 * Ensure at least one author exists on create.
 * @param {Object} model   Model instance
 * @param {Object} options Query options
 * @param {Function} contextUserFn Function to resolve current user id
 * @returns {Promise}
 */
async function ensureAuthorOnCreate(model, options, contextUserFn) {
    if (!model.get('authors')) {
        model.set('authors', [{id: await contextUserFn(options)}]);
    }
}

/**
 * Validate authors array and match them to existing users.
 * @param {Object} model   Model instance
 * @param {Object} options Query options
 * @param {Object} ghostBookshelf Ghost Bookshelf instance
 * @returns {Promise}
 */
function matchAuthors(model, options, ghostBookshelf) {
    let ownerUser;
    const ops = [];

    // fetch owner user
    ops.push(() => ghostBookshelf
        .model('User')
        .getOwnerUser(_.pick(options, 'transacting'))
        .then(user => { ownerUser = user; })
    );

    // resolve each author entry to a user id
    ops.push(() => {
        const authors = model.get('authors') || [];
        const resolved = [];

        return Promise.all(authors.map((author, idx) => {
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
                    if (!resolved.find(u => u.id === userId)) {
                        resolved[idx] = {id: userId};
                    }
                });
        })).then(() => {
            model.set('authors', resolved);
        });
    });

    return sequence(ops);
}

/**
 * Serialize a post, optionally stripping authors and adding primary_author.
 * @param {Object} proto   Original prototype
 * @param {Object} post    Post instance (`this`)
 * @param {Object} options Serialization options
 * @returns {Object}
 */
function serializePost(proto, post, options) {
    let attrs = proto.serialize.call(post, options);

    if (!post._originalOptions) {
        post._originalOptions = {};
    }

    const withAuthors = post._originalOptions.withRelated && post._originalOptions.withRelated.includes('authors');
    if (!withAuthors) {
        delete attrs.authors;
    }

    if (!options.columns || options.columns.includes('primary_author')) {
        attrs.primary_author = (attrs.authors && attrs.authors.length) ? attrs.authors[0] : null;
    }

    return attrs;
}

/**
 * Reassign posts from a deleted author to the owner.
 * @param {Object} Model            Posts model (static context)
 * @param {Object} ghostBookshelf   Ghost Bookshelf instance
 * @param {Object} unfilteredOptions Options containing author id and context
 * @returns {Promise}
 */
async function reassignByAuthor(Model, ghostBookshelf, unfilteredOptions) {
    const options = Model.filterOptions(unfilteredOptions, 'reassignByAuthor', {extraAllowedProperties: ['id']});
    const authorId = options.id;

    if (!authorId) {
        return Promise.reject(new errors.NotFoundError({message: tpl(messages.noUserFound)}));
    }

    const trx = options.transacting;
    const knex = ghostBookshelf.knex;

    const reassign = async () => {
        try {
            const ownerRow = await knex('roles')
                .transacting(trx)
                .join('roles_users', 'roles.id', '=', 'roles_users.role_id')
                .where('roles.name', 'Owner')
                .select('roles_users.user_id')
                .first();

            const ownerId = ownerRow.user_id;

            const authorsPosts = await knex('posts_authors')
                .transacting(trx)
                .where('author_id', authorId)
                .select('post_id', 'sort_order');

            const ownersPosts = await knex('posts_authors')
                .transacting(trx)
                .where('author_id', ownerId)
                .select('post_id');

            const authorsPrimary = authorsPosts.filter(p => p.sort_order === 0);
            const primaryWithOwner = _.intersectionBy(authorsPrimary, ownersPosts, 'post_id');
            const primaryWithOwnerIds = primaryWithOwner.map(p => p.post_id);

            // remove author from primary posts where owner is co‑author
            await knex('posts_authors')
                .transacting(trx)
                .whereIn('post_id', primaryWithOwnerIds)
                .where('author_id', authorId)
                .del();

            // promote owner to primary author
            await knex('posts_authors')
                .transacting(trx)
                .whereIn('post_id', primaryWithOwnerIds)
                .where('author_id', ownerId)
                .update('sort_order', 0);

            const primaryWithoutOwner = _.differenceBy(authorsPrimary, primaryWithOwner, 'post_id');
            const primaryWithoutOwnerIds = primaryWithoutOwner.map(p => p.post_id);

            // swap author with owner on remaining primary posts
            await knex('posts_authors')
                .transacting(trx)
                .whereIn('post_id', primaryWithoutOwnerIds)
                .where('author_id', authorId)
                .update('author_id', ownerId);

            // delete any remaining secondary author rows
            await knex('posts_authors')
                .transacting(trx)
                .where('author_id', authorId)
                .del();
        } catch (err) {
            throw new errors.InternalServerError({err});
        }
    };

    if (!trx) {
        return ghostBookshelf.transaction(t => {
            options.transacting = t;
            return reassign();
        });
    }

    return reassign();
}

/**
 * Determine permission for a post operation.
 * @param {Object} Model            Posts model (static context)
 * @param {Object} postModelOrId    Post model instance or id
 * @param {string} action          Action name ('edit', 'add', 'destroy')
 * @param {Object} context          Context containing user id
 * @param {Object} unsafeAttrs     Attributes being changed
 * @param {Object} loadedPermissions Permissions object
 * @param {boolean} hasUserPermission   Previously calculated user permission
 * @param {boolean} hasApiKeyPermission Previously calculated API key permission
 * @returns {Promise}
 */
function permissible(Model, postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
    const self = this;
    const {isContributor, isAuthor} = setIsRoles(loadedPermissions);
    const isEdit = action === 'edit';
    const isAdd = action === 'add';
    const isDestroy = action === 'destroy';

    // Resolve id to model if needed
    if (_.isNumber(postModelOrId) || _.isString(postModelOrId)) {
        const origArgs = _.toArray(arguments).slice(1);
        return this.findOne({id: postModelOrId, status: 'all'}, {withRelated: ['authors']})
            .then(found => {
                if (!found) {
                    throw new errors.NotFoundError({message: tpl(messages.postNotFound)});
                }
                return self.permissible.apply(self, [found].concat(origArgs));
            });
    }

    const postModel = postModelOrId;

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

    // Contributor rules
    if (isContributor && isEdit) {
        hasUserPermission = !isChangingAuthors() && isCoAuthor();
    } else if (isContributor && isAdd) {
        hasUserPermission = isOwner();
    } else if (isContributor && isDestroy) {
        hasUserPermission = isPrimaryAuthor();
    }
    // Author rules
    else if (isAuthor && isEdit) {
        hasUserPermission = isCoAuthor() && !isChangingAuthors();
    } else if (isAuthor && isAdd) {
        hasUserPermission = isOwner();
    } else if (postModel) {
        hasUserPermission = hasUserPermission || isPrimaryAuthor();
    }

    if (hasUserPermission && hasApiKeyPermission) {
        return Model.permissible.call(
            this,
            postModelOrId,
            action,
            context,
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

    return Promise.reject(new errors.NoPermissionError({message: tpl(messages.notEnoughPermission)}));
}

/**
 * Extend the Post model with author‑aware behaviour.
 */
module.exports.extendModel = function extendModel(Post, Posts, ghostBookshelf) {
    const proto = Post.prototype;

    const Model = Post.extend({
        onFetching(model, attrs, options) {
            return handleOptions.call(this, model, attrs, options, 'onFetching', proto);
        },

        onFetchingCollection(collection, attrs, options) {
            return handleOptions.call(this, collection, attrs, options, 'onFetchingCollection', proto);
        },

        onFetchedCollection(collection, attrs, options) {
            propagateOriginalOptions(collection);
            return proto.onFetchedCollection.call(this, collection, attrs, options);
        },

        async onCreating(model, attrs, options) {
            await ensureAuthorOnCreate(model, options, this.contextUser.bind(this));
            return handleOptions.call(this, model, attrs, options, 'onCreating', proto);
        },

        onUpdating(model, attrs, options) {
            return handleOptions.call(this, model, attrs, options, 'onUpdating', proto);
        },

        onSaving(model, attrs, options) {
            const ops = [];

            // Remove deprecated single author field
            model.unset('author');

            // Validate authors array
            if (model.get('authors') && !model.get('authors').length) {
                throw new errors.ValidationError({message: 'At least one author is required.'});
            }

            // Resolve authors if present
            if (model.get('authors')) {
                ops.push(() => matchAuthors(model, options, ghostBookshelf));
            }

            // Continue with default saving logic
            ops.push(() => proto.onSaving.call(this, model, attrs, options));

            return sequence(ops);
        },

        serialize(options) {
            return serializePost(proto, this, options);
        },

        /**
         * Match provided author identifiers to existing users.
         * @param {Object} model   Model instance
         * @param {Object} options Query options
         * @returns {Promise}
         */
        matchAuthors(model, options) {
            return matchAuthors(model, options, ghostBookshelf);
        }
    }, {
        /**
         * Reassign all posts from a given author to the owner.
         * @param {Object} unfilteredOptions Options containing author id and context
         * @returns {Promise}
         */
        reassignByAuthor(unfilteredOptions) {
            return reassignByAuthor(this, ghostBookshelf, unfilteredOptions);
        },

        /**
         * Permission check for post actions.
         */
        permissible(postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission) {
            return permissible.call(this, this, postModelOrId, action, context, unsafeAttrs, loadedPermissions, hasUserPermission, hasApiKeyPermission);
        }
    });

    return Model;
};
```