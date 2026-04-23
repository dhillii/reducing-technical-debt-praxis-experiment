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
     * Export posts with optional filtering.
     *
     * @param {object} options
     * @param {string} [options.filter]
     * @param {string} [options.order]
     * @param {string|number} [options.limit]
     * @returns {Promise<Array<Object>>}
     */
    async export({filter, order, limit}) {
        const posts = await this.#fetchPosts({filter, order, limit});
        const newsletters = await this.#fetchNewsletters();
        const labels = await this.#fetchLabels();
        const tiers = await this.#fetchTiers();

        const membersEnabled = this.#settingsHelpers.isMembersEnabled();
        const membersTrackSources = membersEnabled && this.#settingsCache.get('members_track_sources');
        const paidMembersEnabled = membersEnabled && this.#settingsHelpers.arePaidMembersEnabled();
        const trackOpens = this.#settingsCache.get('email_track_opens');
        const trackClicks = this.#settingsCache.get('email_track_clicks');
        const hasNewslettersWithFeedback = this.#hasNewslettersWithFeedback(newsletters);

        const mapped = posts.map(post => this.#mapPost(post, {
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
            const columnsToRemove = this.#determineRemoveableColumns({
                newsletters,
                membersEnabled,
                hasNewslettersWithFeedback,
                trackClicks,
                trackOpens,
                membersTrackSources,
                paidMembersEnabled
            });
            this.#removeColumns(mapped, columnsToRemove);
        }

        return mapped;
    }

    /**
     * Fetch posts with default filter.
     *
     * @private
     * @param {object} opts
     * @returns {Promise<Array<Object>>}
     */
    async #fetchPosts({filter, order, limit}) {
        const result = await this.#models.Post.findPage({
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
        return result.data;
    }

    /** @private */
    async #fetchNewsletters() {
        return (await this.#models.Newsletter.findAll()).models;
    }

    /** @private */
    async #fetchLabels() {
        return (await this.#models.Label.findAll()).models;
    }

    /** @private */
    async #fetchTiers() {
        return (await this.#models.Product.findAll()).models;
    }

    /**
     * Determine if any newsletter has feedback enabled.
     *
     * @private
     * @param {Array<Object>} newsletters
     * @returns {boolean}
     */
    #hasNewslettersWithFeedback(newsletters) {
        return !!newsletters.find(newsletter => newsletter.get('feedback_enabled'));
    }

    /**
     * Map a single post to export format.
     *
     * @private
     * @param {Object} post
     * @param {object} ctx
     * @returns {Object}
     */
    #mapPost(post, ctx) {
        const {
            newsletters,
            labels,
            tiers,
            membersEnabled,
            membersTrackSources,
            paidMembersEnabled,
            trackOpens,
            trackClicks,
            hasNewslettersWithFeedback
        } = ctx;

        let email = post.related('email');
        if (!email.id) {
            email = null;
        }

        if (this.#isDraftOrScheduled(post)) {
            email = null;
        }

        const published = !this.#isDraftOrScheduled(post);
        const feedbackEnabled = email && email.get('feedback_enabled') && hasNewslettersWithFeedback;
        const showEmailClickAnalytics = trackClicks && email && email.get('track_clicks');

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
            email_recipients: email ? this.humanReadableEmailRecipientFilter(email.get('recipient_filter'), labels, tiers) : null,
            newsletter_name: this.#resolveNewsletterName(newsletters, post, email),
            sends: email?.get('email_count') ?? null,
            opens: trackOpens ? (email?.get('opened_count') ?? null) : null,
            clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
            signups: membersTrackSources && published ? (post.get('count__signups') ?? 0) : null,
            paid_conversions: membersTrackSources && paidMembersEnabled && published ? (post.get('count__paid_conversions') ?? 0) : null,
            feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
            feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
        };
    }

    /**
     * Guard to check if post is draft or scheduled.
     *
     * @private
     * @param {Object} post
     * @returns {boolean}
     */
    #isDraftOrScheduled(post) {
        const status = post.get('status');
        return status === 'draft' || status === 'scheduled';
    }

    /**
     * Resolve newsletter name when applicable.
     *
     * @private
     * @param {Array<Object>} newsletters
     * @param {Object} post
     * @param {Object|null} email
     * @returns {string|null}
     */
    #resolveNewsletterName(newsletters, post, email) {
        if (newsletters.length <= 1) {
            return null;
        }
        if (!post.get('newsletter_id') || !email) {
            return null;
        }
        const newsletter = newsletters.find(nl => nl.get('id') === post.get('newsletter_id'));
        return newsletter?.get('name') ?? null;
    }

    /**
     * Compute columns that should be removed based on settings.
     *
     * @private
     * @param {object} opts
     * @returns {Array<string>}
     */
    #determineRemoveableColumns(opts) {
        const {
            newsletters,
            membersEnabled,
            hasNewslettersWithFeedback,
            trackClicks,
            trackOpens,
            membersTrackSources,
            paidMembersEnabled
        } = opts;

        const columns = [];

        if (newsletters.length <= 1) {
            columns.push('newsletter_name');
        }

        if (!membersEnabled) {
            columns.push('email_recipients', 'sends', 'opens', 'clicks', 'feedback_more_like_this', 'feedback_less_like_this');
            return columns;
        }

        if (!hasNewslettersWithFeedback) {
            columns.push('feedback_more_like_this', 'feedback_less_like_this');
        }

        if (!trackClicks) {
            columns.push('clicks');
        }

        if (!trackOpens) {
            columns.push('opens');
        }

        if (!membersTrackSources) {
            columns.push('signups', 'paid_conversions');
            return columns;
        }

        if (!paidMembersEnabled) {
            columns.push('paid_conversions');
        }

        return columns;
    }

    /**
     * Remove specified columns from each row.
     *
     * @private
     * @param {Array<Object>} rows
     * @param {Array<string>} columns
     */
    #removeColumns(rows, columns) {
        for (const column of columns) {
            for (const row of rows) {
                delete row[column];
            }
        }
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
     * Convert an email filter to a human readable string.
     *
     * @private
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
     * Convert a parsed NQL filter to readable strings.
     *
     * @private
     * @param {*} filter
     * @param {*} allLabels
     * @param {*} allTiers
     * @returns {Array<string>}
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
                strings.push(...this.#labelToString(filter.label, allLabels));
            } else if (key === 'tier') {
                strings.push(...this.#tierToString(filter.tier, allTiers));
            } else if (key === 'status') {
                strings.push(...this.#statusToString(filter.status));
            }
        }

        return strings;
    }

    /**
     * Convert label filter to string.
     *
     * @private
     * @param {string|Object} labelFilter
     * @param {*} allLabels
     * @returns {Array<string>}
     */
    #labelToString(labelFilter, allLabels) {
        if (typeof labelFilter !== 'string') {
            return [];
        }
        const label = allLabels.find(l => l.get('slug') === labelFilter);
        return [label ? label.get('name') : labelFilter];
    }

    /**
     * Convert tier filter to string.
     *
     * @private
     * @param {string|Object} tierFilter
     * @param {*} allTiers
     * @returns {Array<string>}
     */
    #tierToString(tierFilter, allTiers) {
        if (typeof tierFilter !== 'string') {
            return [];
        }
        const tier = allTiers.find(t => t.get('slug') === tierFilter);
        return [tier ? tier.get('name') : tierFilter];
    }

    /**
     * Convert status filter to string.
     *
     * @private
     * @param {string|Object} statusFilter
     * @returns {Array<string>}
     */
    #statusToString(statusFilter) {
        if (typeof statusFilter === 'string') {
            if (statusFilter === 'free') return ['Free subscribers'];
            if (statusFilter === 'paid') return ['Paid subscribers'];
            if (statusFilter === 'comped') return ['Complimentary subscribers'];
            return [];
        }
        const strings = [];
        if (statusFilter.$ne === 'free') {
            strings.push('Paid subscribers');
        }
        if (statusFilter.$ne === 'paid') {
            strings.push('Free subscribers');
        }
        return strings;
    }
}

module.exports = PostsExporter;