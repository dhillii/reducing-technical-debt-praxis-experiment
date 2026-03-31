```javascript
const nql = require('@tryghost/nql');
const logging = require('@tryghost/logging');

class PostsExporter {
    #models;
    #getPostUrl;
    #settingsCache;
    #settingsHelpers;

    #statusMap = {
        draft: 'draft',
        scheduled: 'scheduled',
        sent: 'emailed only',
        published: 'published'
    };

    #visibilityMap = {
        public: 'Public',
        members: 'Members-only',
        paid: 'Paid members-only'
    };

    #filterKeyHandlers = {
        label: (filter, allLabels) => this.#handleLabelFilter(filter, allLabels),
        tier: (filter, allTiers) => this.#handleTierFilter(filter, allTiers),
        status: (filter) => this.#handleStatusFilter(filter)
    };

    constructor({models, getPostUrl, settingsCache, settingsHelpers}) {
        this.#models = models;
        this.#getPostUrl = getPostUrl;
        this.#settingsCache = settingsCache;
        this.#settingsHelpers = settingsHelpers;
    }

    async export({filter, order, limit}) {
        const [posts, newsletters, labels, tiers] = await Promise.all([
            this.#models.Post.findPage({
                filter: filter ?? 'status:published,status:sent',
                order,
                limit,
                withRelated: [
                    'tiers', 'tags', 'authors',
                    'count.signups', 'count.paid_conversions', 'count.clicks',
                    'count.positive_feedback', 'count.negative_feedback', 'email'
                ]
            }),
            this.#models.Newsletter.findAll().then(result => result.models),
            this.#models.Label.findAll().then(result => result.models),
            this.#models.Product.findAll().then(result => result.models)
        ]);

        const settings = this.#buildSettings(newsletters);
        const mapped = posts.data.map(post => this.#mapPost(post, newsletters, labels, tiers, settings));

        if (mapped.length) {
            this.#removeConditionalColumns(mapped, newsletters, settings);
        }

        return mapped;
    }

    #buildSettings(newsletters) {
        const membersEnabled = this.#settingsHelpers.isMembersEnabled();
        const paidMembersEnabled = membersEnabled && this.#settingsHelpers.arePaidMembersEnabled();
        const membersTrackSources = membersEnabled && this.#settingsCache.get('members_track_sources');

        return {
            membersEnabled,
            paidMembersEnabled,
            membersTrackSources,
            trackOpens: this.#settingsCache.get('email_track_opens'),
            trackClicks: this.#settingsCache.get('email_track_clicks'),
            hasNewslettersWithFeedback: newsletters.some(n => n.get('feedback_enabled'))
        };
    }

    #mapPost(post, newsletters, labels, tiers, settings) {
        const email = this.#getValidEmail(post);
        const published = post.get('status') === 'published' || post.get('status') === 'sent';
        const feedbackEnabled = email && email.get('feedback_enabled') && settings.hasNewslettersWithFeedback;
        const showEmailClickAnalytics = settings.trackClicks && email && email.get('track_clicks');

        return {
            id: post.get('id'),
            title: post.get('title'),
            url: this.#getPostUrl(post),
            author: this.#getAuthorsString(post),
            status: this.#mapPostStatus(post.get('status'), !!email),
            created_at: post.get('created_at'),
            updated_at: post.get('updated_at'),
            published_at: published ? post.get('published_at') : null,
            featured: post.get('featured'),
            tags: this.#getTagsString(post),
            post_access: this.#mapPostAccess(post),
            email_recipients: email ? this.#humanizeEmailRecipientFilter(email.get('recipient_filter'), labels, tiers) : null,
            newsletter_name: this.#getNewsletterName(post, newsletters, email),
            sends: email?.get('email_count') ?? null,
            opens: settings.trackOpens ? (email?.get('opened_count') ?? null) : null,
            clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
            signups: settings.membersTrackSources && published ? (post.get('count__signups') ?? 0) : null,
            paid_conversions: settings.membersTrackSources && settings.paidMembersEnabled && published ? (post.get('count__paid_conversions') ?? 0) : null,
            feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
            feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
        };
    }

    #getValidEmail(post) {
        let email = post.related('email');
        if (!email.id) {
            return null;
        }

        if (['draft', 'scheduled'].includes(post.get('status'))) {
            return null;
        }

        return email;
    }

    #getAuthorsString(post) {
        return post.related('authors').map(author => author.get('name')).join(', ');
    }

    #getTagsString(post) {
        return post.related('tags').map(tag => tag.get('name')).join(', ');
    }

    #getNewsletterName(post, newsletters, email) {
        if (newsletters.length <= 1 || !post.get('newsletter_id') || !email) {
            return null;
        }
        return newsletters.find(n => n.get('id') === post.get('newsletter_id'))?.get('name') ?? null;
    }

    #mapPostStatus(status, hasEmail) {
        if (status === 'published') {
            return hasEmail ? 'published and emailed' : 'published only';
        }
        return this.#statusMap[status] ?? status;
    }

    #mapPostAccess(post) {
        const visibility = post.get('visibility');
        const mapped = this.#visibilityMap[visibility];

        if (mapped) {
            return mapped;
        }

        if (visibility === 'tiers') {
            return this.#mapTierAccess(post);
        }

        return visibility;
    }

    #mapTierAccess(post) {
        const tiers = post.related('tiers');
        if (tiers.length === 0) {
            return 'Specific tiers: none';
        }
        return 'Specific tiers: ' + tiers.map(tier => tier.get('name')).join(', ');
    }

    #humanizeEmailRecipientFilter(recipientFilter, allLabels, allTiers) {
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

    #filterToString(filter, allLabels, allTiers) {
        const strings = [];

        if (filter.$or) {
            for (const subfilter of filter.$or) {
                strings.push(...this.#filterToString(subfilter, allLabels, allTiers));
            }
            return strings;
        }

        for (const key of Object.keys(filter)) {
            const handler = this.#filterKeyHandlers[key];
            if (handler) {
                const result = handler.call(this, filter, key === 'tier' ? allTiers : allLabels);
                if (result) {
                    strings.push(result);
                }
            }
        }

        return strings;
    }

    #handleLabelFilter(filter, allLabels) {
        if (typeof filter.label !== 'string') {
            return null;
        }
        const label = allLabels.find(l => l.get('slug') === filter.label);
        return label?.get('name') ?? filter.label;
    }

    #handleTierFilter(filter, allTiers) {
        if (typeof filter.tier !== 'string') {
            return null;
        }
        const tier = allTiers.find(t => t.get('slug') === filter.tier);
        return tier?.get('name') ?? filter.tier;
    }

    #handleStatusFilter(filter) {
        if (typeof filter.status === 'string') {
            const statusMap = {free: 'Free subscribers', paid: 'Paid subscribers', comped: 'Complimentary subscribers'};
            return statusMap[filter.status] ?? null;
        }

        if (filter.status.$ne === 'free') {
            return 'Paid subscribers';
        }
        if (filter.status.$ne === 'paid') {
            return 'Free subscribers';
        }

        return null;
    }

    #removeConditionalColumns(mapped, newsletters, settings) {
        const removeableColumns = [];

        if (newsletters.length <= 1) {
            removeableColumns.push('newsletter_name');
        }

        if (!settings.membersEnabled) {
            removeableColumns.push('email_recipients', 'sends', 'opens', 'clicks', 'feedback_more_like_this', 'feedback_less_like_this');
        } else {
            if (!settings.hasNewslettersWithFeedback) {
                removeableColumns.push('feedback_more_like_this', 'feedback_less_like_this');
            }
            if (!settings.trackClicks) {
                removeableColumns.push('clicks');
            }
            if (!settings.trackOpens) {
                removeableColumns.push('opens');
            }
        }

        if (!settings.membersTrackSources || !settings.membersEnabled) {
            removeableColumns.push('signups', 'paid_conversions');
        } else if (!settings.paidMembersEnabled) {
            removeableColumns.push('paid_conversions');
        }

        for (const column of removeableColumns) {
            for (const row of mapped) {
                delete row[column];
            }
        }
    }
}

module.exports = PostsExporter;
```