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

        const mapped = posts.data.map((post) => {
            return this.mapPostToExportRow(post, newsletters, labels, tiers, membersEnabled, membersTrackSources, paidMembersEnabled, trackOpens, trackClicks, hasNewslettersWithFeedback);
        });

        if (mapped.length) {
            this.removeUnusedColumns(mapped, newsletters, membersEnabled, hasNewslettersWithFeedback, trackClicks, trackOpens, membersTrackSources, paidMembersEnabled);
        }

        return mapped;
    }

    mapPostToExportRow(post, newsletters, labels, tiers, membersEnabled, membersTrackSources, paidMembersEnabled, trackOpens, trackClicks, hasNewslettersWithFeedback) {
        let email = post.related('email');

        // Weird bookshelf thing fix
        if (!email.id) {
            email = null;
        }

        let published = true;
        if (post.get('status') === 'draft' || post.get('status') === 'scheduled') {
            // Manually clear it to avoid including information for a post that was reverted to draft
            email = null;
            published = false;
        }

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
            email_recipients: email ? this.humanReadableEmailRecipientFilter(email?.get('recipient_filter'), labels, tiers) : null,
            newsletter_name: newsletters.length > 1 && post.get('newsletter_id') && email ? newsletters.find(newsletter => newsletter.get('id') === post.get('newsletter_id'))?.get('name') : null,
            sends: email?.get('email_count') ?? null,
            opens: trackOpens ? (email?.get('opened_count') ?? null) : null,
            clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
            signups: membersTrackSources && published ? (post.get('count__signups') ?? 0) : null,
            paid_conversions: membersTrackSources && paidMembersEnabled && published ? (post.get('count__paid_conversions') ?? 0) : null,
            feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
            feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
        };
    }

    removeUnusedColumns(mapped, newsletters, membersEnabled, hasNewslettersWithFeedback, trackClicks, trackOpens, membersTrackSources, paidMembersEnabled) {
        const removeableColumns = [];

        if (newsletters.length <= 1) {
            removeableColumns.push('newsletter_name');
        }

        if (!membersEnabled) {
            removeableColumns.push('email_recipients', 'sends', 'opens', 'clicks', 'feedback_more_like_this', 'feedback_less_like_this');
        } else if (!hasNewslettersWithFeedback) {
            removeableColumns.push('feedback_more_like_this', 'feedback_less_like_this');
        }

        if (membersEnabled && !trackClicks) {
            removeableColumns.push('clicks');
        }

        if (membersEnabled && !trackOpens) {
            removeableColumns.push('opens');
        }

        if (!membersTrackSources || !membersEnabled) {
            removeableColumns.push('signups', 'paid_conversions');
        } else if (!paidMembersEnabled) {
            removeableColumns.push('paid_conversions');
        }

        for (const columnToRemove of removeableColumns) {
            for (const row of mapped) {
                delete row[columnToRemove];
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
     * @private Convert an email filter to a human readable string
     * @param {string} recipientFilter
     * @param {*} allLabels
     * @param {*} allTiers
     * @returns
     */
    humanReadableEmailRecipientFilter(recipientFilter, allLabels, allTiers) {
        // Examples: "label:test"; "label:test,label:batch1"; "status:-free,label:test", "all"
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
                if (key === 'label' && typeof filter.label === 'string') {
                    strings.push(this.getLabelString(filter.label, allLabels));
                } else if (key === 'tier' && typeof filter.tier === 'string') {
                    strings.push(this.getTierString(filter.tier, allTiers));
                } else if (key === 'status') {
                    strings.push(...this.getStatusStrings(filter.status));
                }
            }
        }

        return strings;
    }

    getLabelString(labelSlug, allLabels) {
        const label = allLabels.find(l => l.get('slug') === labelSlug);
        return label ? label.get('name') : labelSlug;
    }

    getTierString(tierSlug, allTiers) {
        const tier = allTiers.find(l => l.get('slug') === tierSlug);
        return tier ? tier.get('name') : tierSlug;
    }

    getStatusStrings(status) {
        const strings = [];
        if (typeof status === 'string') {
            if (status === 'free') {
                strings.push('Free subscribers');
            } else if (status === 'paid') {
                strings.push('Paid subscribers');
            } else if (status === 'comped') {
                strings.push('Complimentary subscribers');
            }
        } else {
            if (status.$ne === 'free') {
                strings.push('Paid subscribers');
            }

            if (status.$ne === 'paid') {
                strings.push('Free subscribers');
            }
        }
        return strings;
    }
}

module.exports = PostsExporter;