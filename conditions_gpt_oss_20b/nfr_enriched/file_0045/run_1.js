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

        const [newsletters, labels, tiers] = await Promise.all([
            this.#models.Newsletter.findAll().then(r => r.models),
            this.#models.Label.findAll().then(r => r.models),
            this.#models.Product.findAll().then(r => r.models)
        ]);

        const settings = this.#computeSettings();

        const mapped = posts.data.map(post => this.#mapPost(post, newsletters, labels, tiers, settings));

        if (mapped.length) {
            const removeableColumns = this.#getRemoveableColumns(mapped, newsletters, settings);
            this.#removeColumns(mapped, removeableColumns);
        }

        return mapped;
    }

    /**
     * Compute global settings used during export
     */
    #computeSettings() {
        const membersEnabled = this.#settingsHelpers.isMembersEnabled();
        const membersTrackSources = membersEnabled && this.#settingsCache.get('members_track_sources');
        const paidMembersEnabled = membersEnabled && this.#settingsHelpers.arePaidMembersEnabled();
        const trackOpens = this.#settingsCache.get('email_track_opens');
        const trackClicks = this.#settingsCache.get('email_track_clicks');
        const hasNewslettersWithFeedback = !!(await this.#models.Newsletter.findAll()).models.find(n => n.get('feedback_enabled'));

        return {
            membersEnabled,
            membersTrackSources,
            paidMembersEnabled,
            trackOpens,
            trackClicks,
            hasNewslettersWithFeedback
        };
    }

    /**
     * Map a single post to export format
     */
    #mapPost(post, newsletters, labels, tiers, settings) {
        let email = post.related('email');
        if (!email.id) {
            email = null;
        }

        let published = true;
        if (post.get('status') === 'draft' || post.get('status') === 'scheduled') {
            email = null;
            published = false;
        }

        const feedbackEnabled = email && email.get('feedback_enabled') && settings.hasNewslettersWithFeedback;
        const showEmailClickAnalytics = settings.trackClicks && email && email.get('track_clicks');

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
            email_recipients: email ? this.humanReadableEmailRecipientFilter(email.get('recipient_filter'), labels, tiers) : null,
            newsletter_name: this.#computeNewsletterName(post, newsletters, email),
            sends: email?.get('email_count') ?? null,
            opens: settings.trackOpens ? (email?.get('opened_count') ?? null) : null,
            clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
            signups: settings.membersTrackSources && published ? (post.get('count__signups') ?? 0) : null,
            paid_conversions: settings.membersTrackSources && settings.paidMembersEnabled && published ? (post.get('count__paid_conversions') ?? 0) : null,
            feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
            feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
        };
    }

    /**
     * Determine newsletter name for a post
     */
    #computeNewsletterName(post, newsletters, email) {
        if (newsletters.length <= 1 || !post.get('newsletter_id') || !email) {
            return null;
        }
        const newsletter = newsletters.find(n => n.get('id') === post.get('newsletter_id'));
        return newsletter?.get('name') ?? null;
    }

    /**
     * Determine columns that can be removed based on settings
     */
    #getRemoveableColumns(mapped, newsletters, settings) {
        const columns = [];

        if (newsletters.length <= 1) {
            columns.push('newsletter_name');
        }

        if (!settings.membersEnabled) {
            columns.push('email_recipients', 'sends', 'opens', 'clicks', 'feedback_more_like_this', 'feedback_less_like_this');
        } else if (!settings.hasNewslettersWithFeedback) {
            columns.push('feedback_more_like_this', 'feedback_less_like_this');
        }

        if (settings.membersEnabled && !settings.trackClicks) {
            columns.push('clicks');
        }

        if (settings.membersEnabled && !settings.trackOpens) {
            columns.push('opens');
        }

        if (!settings.membersTrackSources || !settings.membersEnabled) {
            columns.push('signups', 'paid_conversions');
        } else if (!settings.paidMembersEnabled) {
            columns.push('paid_conversions');
        }

        return columns;
    }

    /**
     * Remove specified columns from all rows
     */
    #removeColumns(mapped, columns) {
        for (const column of columns) {
            for (const row of mapped) {
                delete row[column];
            }
        }
    }

    mapPostStatus(status, hasEmail) {
        switch (status) {
            case 'draft':
                return 'draft';
            case 'scheduled':
                return 'scheduled';
            case 'sent':
                return 'emailed only';
            case 'published':
                return hasEmail ? 'published and emailed' : 'published only';
            default:
                return status;
        }
    }

    postAccessToString(post) {
        const visibility = post.get('visibility');
        switch (visibility) {
            case 'public':
                return 'Public';
            case 'members':
                return 'Members-only';
            case 'paid':
                return 'Paid members-only';
            case 'tiers':
                const tiers = post.related('tiers');
                if (tiers.length === 0) {
                    return 'Specific tiers: none';
                }
                return 'Specific tiers: ' + tiers.map(t => t.get('name')).join(', ');
            default:
                return visibility;
        }
    }

    /**
     * @private Convert an email filter to a human readable string
     * @param {string} recipientFilter
     * @param {*} allLabels
     * @param {*} allTiers
     * @returns
     */
    humanReadableEmailRecipientFilter(recipientFilter, allLabels, allTiers) {
        if (recipientFilter === 'all') {
            return 'All subscribers';
        }

        try {
            const parsed = nql(recipientFilter).parse();
            const strings = this.filterToString(parsed, allLabels, allTiers);
            return strings.join(', ');
        } catch (e) {
            logging.error(e);
            return recipientFilter;
        }
    }

    /**
     * @private Convert an email filter to a human readable string
     * @param {*} filter Parsed NQL filter
     * @param {*} allLabels All available member labels
     * @returns
     */
    filterToString(filter, allLabels, allTiers) {
        const strings = [];
        if (filter.$and) {
            // Not supported
        } else if (filter.$or) {
            for (const subfilter of filter.$or) {
                strings.push(...this.filterToString(subfilter, allLabels, allTiers));
            }
        } else {
            for (const key of Object.keys(filter)) {
                if (key === 'label') {
                    if (typeof filter.label === 'string') {
                        const labelSlug = filter.label;
                        const label = allLabels.find(l => l.get('slug') === labelSlug);
                        if (label) {
                            strings.push(label.get('name'));
                        } else {
                            strings.push(labelSlug);
                        }
                    }
                }
                if (key === 'tier') {
                    if (typeof filter.tier === 'string') {
                        const tierSlug = filter.tier;
                        const tier = allTiers.find(l => l.get('slug') === tierSlug);
                        if (tier) {
                            strings.push(tier.get('name'));
                        } else {
                            strings.push(tierSlug);
                        }
                    }
                }
                if (key === 'status') {
                    if (typeof filter.status === 'string') {
                        if (filter.status === 'free') {
                            strings.push('Free subscribers');
                        } else if (filter.status === 'paid') {
                            strings.push('Paid subscribers');
                        } else if (filter.status === 'comped') {
                            strings.push('Complimentary subscribers');
                        }
                    } else {
                        if (filter.status.$ne === 'free') {
                            strings.push('Paid subscribers');
                        }

                        if (filter.status.$ne === 'paid') {
                            strings.push('Free subscribers');
                        }
                    }
                }
            }
        }

        return strings;
    }
}

module.exports = PostsExporter;