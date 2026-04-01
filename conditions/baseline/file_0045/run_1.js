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

        const settings = this.#buildSettings(newsletters);
        const mapped = posts.data.map((post) => this.#mapPost(post, newsletters, labels, tiers, settings));

        if (mapped.length) {
            this.#removeUnusedColumns(mapped, newsletters, settings);
        }

        return mapped;
    }

    #buildSettings(newsletters) {
        const membersEnabled = this.#settingsHelpers.isMembersEnabled();
        return {
            membersEnabled,
            membersTrackSources: membersEnabled && this.#settingsCache.get('members_track_sources'),
            paidMembersEnabled: membersEnabled && this.#settingsHelpers.arePaidMembersEnabled(),
            trackOpens: this.#settingsCache.get('email_track_opens'),
            trackClicks: this.#settingsCache.get('email_track_clicks'),
            hasNewslettersWithFeedback: !!newsletters.find(newsletter => newsletter.get('feedback_enabled'))
        };
    }

    #mapPost(post, newsletters, labels, tiers, settings) {
        let email = post.related('email');

        if (!email.id) {
            email = null;
        }

        const published = !['draft', 'scheduled'].includes(post.get('status'));
        if (!published) {
            email = null;
        }

        const feedbackEnabled = email && email.get('feedback_enabled') && settings.hasNewslettersWithFeedback;
        const showEmailClickAnalytics = settings.trackClicks && email && email.get('track_clicks');

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
            opens: settings.trackOpens ? (email?.get('opened_count') ?? null) : null,
            clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
            signups: settings.membersTrackSources && published ? (post.get('count__signups') ?? 0) : null,
            paid_conversions: settings.membersTrackSources && settings.paidMembersEnabled && published ? (post.get('count__paid_conversions') ?? 0) : null,
            feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
            feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
        };
    }

    #removeUnusedColumns(mapped, newsletters, settings) {
        const removeableColumns = [];

        if (newsletters.length <= 1) {
            removeableColumns.push('newsletter_name');
        }

        if (!settings.membersEnabled) {
            removeableColumns.push('email_recipients', 'sends', 'opens', 'clicks', 'feedback_more_like_this', 'feedback_less_like_this');
        } else if (!settings.hasNewslettersWithFeedback) {
            removeableColumns.push('feedback_more_like_this', 'feedback_less_like_this');
        }

        if (settings.membersEnabled && !settings.trackClicks) {
            removeableColumns.push('clicks');
        }

        if (settings.membersEnabled && !settings.trackOpens) {
            removeableColumns.push('opens');
        }

        if (!settings.membersTrackSources || !settings.membersEnabled) {
            removeableColumns.push('signups', 'paid_conversions');
        } else if (!settings.paidMembersEnabled) {
            removeableColumns.push('paid_conversions');
        }

        for (const columnToRemove of removeableColumns) {
            for (const row of mapped) {
                delete row[columnToRemove];
            }
        }
    }

    mapPostStatus(status, hasEmail) {
        const statusMap = {
            'draft': 'draft',
            'scheduled': 'scheduled',
            'sent': 'emailed only',
            'published': hasEmail ? 'published and emailed' : 'published only'
        };

        return statusMap[status] ?? status;
    }

    postAccessToString(post) {
        const visibility = post.get('visibility');
        const visibilityMap = {
            'public': 'Public',
            'members': 'Members-only',
            'paid': 'Paid members-only'
        };

        if (visibilityMap[visibility]) {
            return visibilityMap[visibility];
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
                    strings.push(this.#getLabelName(filter.label, allLabels));
                } else if (key === 'tier' && typeof filter.tier === 'string') {
                    strings.push(this.#getTierName(filter.tier, allTiers));
                } else if (key === 'status') {
                    strings.push(...this.#getStatusStrings(filter.status));
                }
            }
        }

        return strings;
    }

    #getLabelName(labelSlug, allLabels) {
        const label = allLabels.find(l => l.get('slug') === labelSlug);
        return label ? label.get('name') : labelSlug;
    }

    #getTierName(tierSlug, allTiers) {
        const tier = allTiers.find(l => l.get('slug') === tierSlug);
        return tier ? tier.get('name') : tierSlug;
    }

    #getStatusStrings(status) {
        const strings = [];
        if (typeof status === 'string') {
            const statusMap = {
                'free': 'Free subscribers',
                'paid': 'Paid subscribers',
                'comped': 'Complimentary subscribers'
            };
            if (statusMap[status]) {
                strings.push(statusMap[status]);
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
```