```javascript
const nql = require('@tryghost/nql');
const logging = require('@tryghost/logging');

class PostsExporter {
    #models;
    #getPostUrl;
    #settingsCache;
    #settingsHelpers;

    /**
     * @param {Object} dependencies
     * @param {Object} dependencies.models
     * @param {Object} dependencies.models.Post
     * @param {Object} dependencies.models.Newsletter
     * @param {Object} dependencies.models.Label
     * @param {Object} dependencies.models.Product
     * @param {Object} dependencies.getPostUrl
     * @param {Object} dependencies.settingsCache
     * @param {Object} dependencies.settingsHelpers
     */
    constructor({models, getPostUrl, settingsCache, settingsHelpers}) {
        this.#models = models;
        this.#getPostUrl = getPostUrl;
        this.#settingsCache = settingsCache;
        this.#settingsHelpers = settingsHelpers;
    }

    /**
     * Export posts with optional filtering, ordering and limiting.
     *
     * @param {object} options
     * @param {string} [options.filter]
     * @param {string} [options.order]
     * @param {string|number} [options.limit]
     * @returns {Promise<Array<Object>>}
     */
    async export({filter, order, limit}) {
        const posts = await this.#models.Post.findPage({
            filter: filter ?? 'status:published,status:sent',
            order,
            limit,
            withRelated: [
                'tiers',
                'tags',
                'authors',
                'count.signups',
                'count.paid_conversions',
                'count.clicks',
                'count.positive_feedback',
                'count.negative_feedback',
                'email'
            ]
        });

        const newsletters = (await this.#models.Newsletter.findAll()).models;
        const labels = (await this.#models.Label.findAll()).models;
        const tiers = (await this.#models.Product.findAll()).models;

        const membersEnabled = this.#settingsHelpers.isMembersEnabled();
        const membersTrackSources = membersEnabled && this.#settingsCache.get('members_track_sources');
        const paidMembersEnabled = membersEnabled && this.#settingsHelpers.arePaidMembersEnabled();
        const trackOpens = this.#settingsCache.get('email_track_opens');
        const trackClicks = this.#settingsCache.get('email_track_clicks');
        const hasNewslettersWithFeedback = !!newsletters.find(nl => nl.get('feedback_enabled'));

        const context = {
            newsletters,
            labels,
            tiers,
            membersEnabled,
            membersTrackSources,
            paidMembersEnabled,
            trackOpens,
            trackClicks,
            hasNewslettersWithFeedback
        };

        const mapped = posts.data.map(post => this.#mapPost(post, context));

        if (mapped.length) {
            const columnsToRemove = this.#determineRemovableColumns(context);
            this.#removeColumns(mapped, columnsToRemove);
        }

        return mapped;
    }

    /**
     * Map a single post to the export format.
     *
     * @private
     * @param {Object} post
     * @param {Object} ctx
     * @returns {Object}
     */
    #mapPost(post, ctx) {
        const {email, published} = this.#extractEmailAndPublishState(post);
        const feedbackEnabled = email && email.get('feedback_enabled') && ctx.hasNewslettersWithFeedback;
        const showEmailClickAnalytics = ctx.trackClicks && email && email.get('track_clicks');

        return {
            id: post.get('id'),
            title: post.get('title'),
            url: this.#getPostUrl(post),
            author: post.related('authors').map(a => a.get('name')).join(', '),
            status: this.mapPostStatus(post.get('status'), !!email),
            created_at: post.get('created_at'),
            updated_at: post.get('updated_at'),
            published_at: published ? post.get('published_at') : null,
            featured: post.get('featured'),
            tags: post.related('tags').map(t => t.get('name')).join(', '),
            post_access: this.postAccessToString(post),
            email_recipients: email ? this.humanReadableEmailRecipientFilter(email?.get('recipient_filter'), ctx.labels, ctx.tiers) : null,
            newsletter_name: this.#resolveNewsletterName(post, email, ctx.newsletters),
            sends: email?.get('email_count') ?? null,
            opens: ctx.trackOpens ? (email?.get('opened_count') ?? null) : null,
            clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
            signups: ctx.membersTrackSources && published ? (post.get('count__signups') ?? 0) : null,
            paid_conversions: ctx.membersTrackSources && ctx.paidMembersEnabled && published ? (post.get('count__paid_conversions') ?? 0) : null,
            feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
            feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
        };
    }

    /**
     * Extract email relation and determine if the post is considered published.
     *
     * @private
     * @param {Object} post
     * @returns {{email: Object|null, published: boolean}}
     */
    #extractEmailAndPublishState(post) {
        let email = post.related('email');

        // Weird bookshelf thing fix
        if (!email.id) {
            email = null;
        }

        let published = true;
        if (post.get('status') === 'draft' || post.get('status') === 'scheduled') {
            email = null;
            published = false;
        }

        return {email, published};
    }

    /**
     * Resolve newsletter name when multiple newsletters exist.
     *
     * @private
     * @param {Object} post
     * @param {Object|null} email
     * @param {Array<Object>} newsletters
     * @returns {string|null}
     */
    #resolveNewsletterName(post, email, newsletters) {
        if (newsletters.length <= 1 || !post.get('newsletter_id') || !email) {
            return null;
        }
        const nl = newsletters.find(n => n.get('id') === post.get('newsletter_id'));
        return nl?.get('name') ?? null;
    }

    /**
     * Determine which columns should be removed based on settings.
     *
     * @private
     * @param {Object} ctx
     * @returns {Array<string>}
     */
    #determineRemovableColumns(ctx) {
        const cols = [];

        if (ctx.newsletters.length <= 1) {
            cols.push('newsletter_name');
        }

        if (!ctx.membersEnabled) {
            cols.push('email_recipients', 'sends', 'opens', 'clicks', 'feedback_more_like_this', 'feedback_less_like_this');
        } else if (!ctx.hasNewslettersWithFeedback) {
            cols.push('feedback_more_like_this', 'feedback_less_like_this');
        }

        if (ctx.membersEnabled && !ctx.trackClicks) {
            cols.push('clicks');
        }

        if (ctx.membersEnabled && !ctx.trackOpens) {
            cols.push('opens');
        }

        if (!ctx.membersTrackSources || !ctx.membersEnabled) {
            cols.push('signups', 'paid_conversions');
        } else if (!ctx.paidMembersEnabled) {
            cols.push('paid_conversions');
        }

        return cols;
    }

    /**
     * Remove specified columns from each row.
     *
     * @private
     * @param {Array<Object>} rows
     * @param {Array<string>} columns
     */
    #removeColumns(rows, columns) {
        for (const col of columns) {
            for (const row of rows) {
                delete row[col];
            }
        }
    }

    mapPostStatus(status, hasEmail) {
        if (status === 'draft') return 'draft';
        if (status === 'scheduled') return 'scheduled';
        if (status === 'sent') return 'emailed only';
        if (status === 'published') {
            return hasEmail ? 'published and emailed' : 'published only';
        }
        return status;
    }

    postAccessToString(post) {
        const visibility = post.get('visibility');
        if (visibility === 'public') return 'Public';
        if (visibility === 'members') return 'Members-only';
        if (visibility === 'paid') return 'Paid members-only';
        if (visibility === 'tiers') {
            const tiers = post.related('tiers');
            if (!tiers.length) return 'Specific tiers: none';
            return 'Specific tiers: ' + tiers.map(t => t.get('name')).join(', ');
        }
        return visibility;
    }

    /**
     * Convert an email filter to a human readable string.
     *
     * @param {string} recipientFilter
     * @param {*} allLabels
     * @param {*} allTiers
     * @returns {string}
     */
    humanReadableEmailRecipientFilter(recipientFilter, allLabels, allTiers) {
        if (recipientFilter === 'all') {
            return 'All subscribers';
        }

        try {
            const parsed = nql(recipientFilter).parse();
            const parts = this.#filterToString(parsed, allLabels, allTiers);
            return parts.join(', ');
        } catch (e) {
            logging.error(e);
            return recipientFilter;
        }
    }

    /**
     * Convert a parsed NQL filter to an array of readable strings.
     *
     * @private
     * @param {*} filter Parsed NQL filter
     * @param {*} allLabels
     * @param {*} allTiers
     * @returns {Array<string>}
     */
    #filterToString(filter, allLabels, allTiers) {
        const result = [];

        if (filter.$or) {
            for (const sub of filter.$or) {
                result.push(...this.#filterToString(sub, allLabels, allTiers));
            }
            return result;
        }

        for (const key of Object.keys(filter)) {
            if (key === 'label') {
                result.push(...this.#handleLabel(filter.label, allLabels));
            } else if (key === 'tier') {
                result.push(...this.#handleTier(filter.tier, allTiers));
            } else if (key === 'status') {
                result.push(...this.#handleStatus(filter.status));
            }
        }

        return result;
    }

    /**
     * Handle label filter conversion.
     *
     * @private
     * @param {string|Array<string>} labelFilter
     * @param {*} allLabels
     * @returns {Array<string>}
     */
    #handleLabel(labelFilter, allLabels) {
        const out = [];
        if (typeof labelFilter === 'string') {
            const label = allLabels.find(l => l.get('slug') === labelFilter);
            out.push(label ? label.get('name') : labelFilter);
        }
        return out;
    }

    /**
     * Handle tier filter conversion.
     *
     * @private
     * @param {string|Array<string>} tierFilter
     * @param {*} allTiers
     * @returns {Array<string>}
     */
    #handleTier(tierFilter, allTiers) {
        const out = [];
        if (typeof tierFilter === 'string') {
            const tier = allTiers.find(t => t.get('slug') === tierFilter);
            out.push(tier ? tier.get('name') : tierFilter);
        }
        return out;
    }

    /**
     * Handle status filter conversion.
     *
     * @private
     * @param {string|Object} statusFilter
     * @returns {Array<string>}
     */
    #handleStatus(statusFilter) {
        const out = [];
        if (typeof statusFilter === 'string') {
            if (statusFilter === 'free') out.push('Free subscribers');
            else if (statusFilter === 'paid') out.push('Paid subscribers');
            else if (statusFilter === 'comped') out.push('Complimentary subscribers');
        } else if (statusFilter && typeof statusFilter === 'object') {
            if (statusFilter.$ne === 'free') out.push('Paid subscribers');
            if (statusFilter.$ne === 'paid') out.push('Free subscribers');
        }
        return out;
    }
}

module.exports = PostsExporter;
```