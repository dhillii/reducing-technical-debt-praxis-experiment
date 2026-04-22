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
     *
     * @param {object} options
     * @param {string} [options.filter]
     * @param {string} [options.order]
     * @param {string|number} [options.limit]
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
        const hasNewslettersWithFeedback = !!newsletters.find(newsletter => newsletter.get('feedback_enabled'));

        const mapped = posts.data.map(post => this.#mapPost(post, {
            newsletters,
            labels,
            tiers,
            membersEnabled,
            membersTrackSources,
            paidMembersEnabled,
            trackOpens,
            trackClicks,
            hasNewslettersWithFeedback
        }));

        if (mapped.length) {
            const removable = this.#computeRemovableColumns({
                newsletters,
                membersEnabled,
                hasNewslettersWithFeedback,
                trackClicks,
                trackOpens,
                membersTrackSources,
                paidMembersEnabled
            });

            for (const column of removable) {
                for (const row of mapped) {
                    delete row[column];
                }
            }
        }

        return mapped;
    }

    /**
     * Map a single post to export format.
     * @private
     */
    #mapPost(post, ctx) {
        let email = post.related('email');

        if (this.#isEmailMissing(email)) {
            email = null;
        }

        if (this.#isDraftOrScheduled(post.get('status'))) {
            email = null;
        }

        const feedbackEnabled = this.#isFeedbackEnabled(email, ctx.hasNewslettersWithFeedback);
        const showEmailClickAnalytics = this.#shouldShowEmailClickAnalytics(ctx.trackClicks, email);
        const published = !(post.get('status') === 'draft' || post.get('status') === 'scheduled');

        return {
            id: post.get('id'),
            title: post.get('title'),
            url: this.#getPostUrl(post),
            author: post.related('authors').map(author => author.get('name')).join(', '),
            status: this.mapPostStatus(post.get('status'), !!email),
            created_at: post.get('created_at'),
            updated_at: post.get('updated_at'),
            published_at: published ? post.get('published_at') : null,
            featured: post.get('featured'),
            tags: post.related('tags').map(tag => tag.get('name')).join(', '),
            post_access: this.postAccessToString(post),
            email_recipients: email ? this.humanReadableEmailRecipientFilter(email?.get('recipient_filter'), ctx.labels, ctx.tiers) : null,
            newsletter_name: ctx.newsletters.length > 1 && post.get('newsletter_id') && email
                ? ctx.newsletters.find(newsletter => newsletter.get('id') === post.get('newsletter_id'))?.get('name')
                : null,
            sends: email?.get('email_count') ?? null,
            opens: ctx.trackOpens ? (email?.get('opened_count') ?? null) : null,
            clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
            signups: ctx.membersTrackSources && published ? (post.get('count__signups') ?? 0) : null,
            paid_conversions: ctx.membersTrackSources && ctx.paidMembersEnabled && published
                ? (post.get('count__paid_conversions') ?? 0)
                : null,
            feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
            feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
        };
    }

    /**
     * Guard: email missing its id.
     * @private
     * @param {Object} email
     * @returns {boolean}
     */
    #isEmailMissing(email) {
        return !email?.id;
    }

    /**
     * Guard: post status is draft or scheduled.
     * @private
     * @param {string} status
     * @returns {boolean}
     */
    #isDraftOrScheduled(status) {
        return status === 'draft' || status === 'scheduled';
    }

    /**
     * Guard: feedback enabled for email and at least one newsletter has feedback.
     * @private
     * @param {Object|null} email
     * @param {boolean} hasNewslettersWithFeedback
     * @returns {boolean}
     */
    #isFeedbackEnabled(email, hasNewslettersWithFeedback) {
        return !!email && email.get('feedback_enabled') && hasNewslettersWithFeedback;
    }

    /**
     * Guard: should show click analytics.
     * @private
     * @param {boolean} trackClicks
     * @param {Object|null} email
     * @returns {boolean}
     */
    #shouldShowEmailClickAnalytics(trackClicks, email) {
        return trackClicks && !!email && email.get('track_clicks');
    }

    /**
     * Compute columns that must be removed based on settings.
     * @private
     * @param {Object} opts
     * @returns {string[]}
     */
    #computeRemovableColumns(opts) {
        const cols = [];

        if (opts.newsletters.length <= 1) {
            cols.push('newsletter_name');
        }

        if (!opts.membersEnabled) {
            cols.push('email_recipients', 'sends', 'opens', 'clicks', 'feedback_more_like_this', 'feedback_less_like_this');
        } else if (!opts.hasNewslettersWithFeedback) {
            cols.push('feedback_more_like_this', 'feedback_less_like_this');
        }

        if (opts.membersEnabled && !opts.trackClicks) {
            cols.push('clicks');
        }

        if (opts.membersEnabled && !opts.trackOpens) {
            cols.push('opens');
        }

        if (!opts.membersTrackSources || !opts.membersEnabled) {
            cols.push('signups', 'paid_conversions');
        } else if (!opts.paidMembersEnabled) {
            cols.push('paid_conversions');
        }

        return cols;
    }

    mapPostStatus(status, hasEmail) {
        if (status === 'draft') {
            return 'draft';
        }
        if (status === 'scheduled') {
            return 'scheduled';
        }
        if (status === 'sent') {
            return 'emailed only';
        }
        if (status === 'published') {
            return hasEmail ? 'published and emailed' : 'published only';
        }
        return status;
    }

    postAccessToString(post) {
        const visibility = post.get('visibility');
        if (visibility === 'public') {
            return 'Public';
        }
        if (visibility === 'members') {
            return 'Members-only';
        }
        if (visibility === 'paid') {
            return 'Paid members-only';
        }
        if (visibility === 'tiers') {
            const tiers = post.related('tiers');
            if (tiers.length === 0) {
                return 'Specific tiers: none';
            }
            return 'Specific tiers: ' + tiers.map(tier => tier.get('name')).join(', ');
        }
        return visibility;
    }

    /**
     * @private Convert an email filter to a human readable string
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
            const strings = this.#filterToString(parsed, allLabels, allTiers);
            return strings.join(', ');
        } catch (e) {
            logging.error(e);
            return recipientFilter;
        }
    }

    /**
     * @private Convert a parsed NQL filter to string fragments.
     * @param {*} filter
     * @param {*} allLabels
     * @param {*} allTiers
     * @returns {string[]}
     */
    #filterToString(filter, allLabels, allTiers) {
        const strings = [];

        if (filter.$or) {
            for (const sub of filter.$or) {
                strings.push(...this.#filterToString(sub, allLabels, allTiers));
            }
            return strings;
        }

        for (const key of Object.keys(filter)) {
            if (key === 'label') {
                strings.push(...this.#handleLabel(filter, allLabels));
            } else if (key === 'tier') {
                strings.push(...this.#handleTier(filter, allTiers));
            } else if (key === 'status') {
                strings.push(...this.#handleStatus(filter));
            }
        }

        return strings;
    }

    /**
     * Handle label filter.
     * @private
     * @param {*} filter
     * @param {*} allLabels
     * @returns {string[]}
     */
    #handleLabel(filter, allLabels) {
        if (typeof filter.label !== 'string') {
            return [];
        }
        const label = allLabels.find(l => l.get('slug') === filter.label);
        return [label ? label.get('name') : filter.label];
    }

    /**
     * Handle tier filter.
     * @private
     * @param {*} filter
     * @param {*} allTiers
     * @returns {string[]}
     */
    #handleTier(filter, allTiers) {
        if (typeof filter.tier !== 'string') {
            return [];
        }
        const tier = allTiers.find(t => t.get('slug') === filter.tier);
        return [tier ? tier.get('name') : filter.tier];
    }

    /**
     * Handle status filter.
     * @private
     * @param {*} filter
     * @returns {string[]}
     */
    #handleStatus(filter) {
        if (typeof filter.status === 'string') {
            if (filter.status === 'free') return ['Free subscribers'];
            if (filter.status === 'paid') return ['Paid subscribers'];
            if (filter.status === 'comped') return ['Complimentary subscribers'];
            return [];
        }

        const strings = [];
        if (filter.status?.$ne === 'free') {
            strings.push('Paid subscribers');
        }
        if (filter.status?.$ne === 'paid') {
            strings.push('Free subscribers');
        }
        return strings;
    }
}

module.exports = PostsExporter;
```