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
            this.#models.Newsletter.findAll(),
            this.#models.Label.findAll(),
            this.#models.Product.findAll()
        ]);

        const settings = this.#buildSettings(newsletters.models);
        const mapped = posts.data.map(post => this.#mapPost(post, newsletters.models, labels.models, tiers.models, settings));

        return this.#removeDisabledColumns(mapped, settings);
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
            hasNewslettersWithFeedback: newsletters.some(n => n.get('feedback_enabled')),
            multipleNewsletters: newsletters.length > 1
        };
    }

    #mapPost(post, newsletters, labels, tiers, settings) {
        const email = this.#getPostEmail(post);
        const published = post.get('status') === 'published' || post.get('status') === 'sent';

        return {
            id: post.get('id'),
            title: post.get('title'),
            url: this.#getPostUrl(post),
            author: post.related('authors').map(a => a.get('name')).join(', '),
            status: this.#mapPostStatus(post.get('status'), !!email),
            created_at: post.get('created_at'),
            updated_at: post.get('updated_at'),
            published_at: published ? post.get('published_at') : null,
            featured: post.get('featured'),
            tags: post.related('tags').map(t => t.get('name')).join(', '),
            post_access: this.#mapPostAccess(post),
            email_recipients: email ? this.#humanReadableEmailRecipientFilter(email.get('recipient_filter'), labels, tiers) : null,
            newsletter_name: this.#getNewsletterName(post, newsletters, email, settings),
            sends: email?.get('email_count') ?? null,
            opens: settings.trackOpens ? (email?.get('opened_count') ?? null) : null,
            clicks: this.#shouldShowClickAnalytics(email, settings) ? (post.get('count__clicks') ?? 0) : null,
            signups: settings.membersTrackSources && published ? (post.get('count__signups') ?? 0) : null,
            paid_conversions: settings.membersTrackSources && settings.paidMembersEnabled && published ? (post.get('count__paid_conversions') ?? 0) : null,
            feedback_more_like_this: this.#shouldShowFeedback(email, settings) ? (post.get('count__positive_feedback') ?? 0) : null,
            feedback_less_like_this: this.#shouldShowFeedback(email, settings) ? (post.get('count__negative_feedback') ?? 0) : null
        };
    }

    #getPostEmail(post) {
        let email = post.related('email');
        if (!email.id) {
            return null;
        }

        if (post.get('status') === 'draft' || post.get('status') === 'scheduled') {
            return null;
        }

        return email;
    }

    #getNewsletterName(post, newsletters, email, settings) {
        if (!settings.multipleNewsletters || !post.get('newsletter_id') || !email) {
            return null;
        }
        return newsletters.find(n => n.get('id') === post.get('newsletter_id'))?.get('name') ?? null;
    }

    #shouldShowClickAnalytics(email, settings) {
        return settings.trackClicks && email && email.get('track_clicks');
    }

    #shouldShowFeedback(email, settings) {
        return email && email.get('feedback_enabled') && settings.hasNewslettersWithFeedback;
    }

    #mapPostStatus(status, hasEmail) {
        if (status === 'published') {
            return hasEmail ? 'published and emailed' : 'published only';
        }
        return this.#statusMap[status] ?? status;
    }

    #mapPostAccess(post) {
        const visibility = post.get('visibility');

        if (this.#visibilityMap[visibility]) {
            return this.#visibilityMap[visibility];
        }

        if (visibility === 'tiers') {
            const tiers = post.related('tiers');
            const tierNames = tiers.length > 0 ? tiers.map(t => t.get('name')).join(', ') : 'none';
            return `Specific tiers: ${tierNames}`;
        }

        return visibility;
    }

    #removeDisabledColumns(mapped, settings) {
        if (mapped.length === 0) {
            return mapped;
        }

        const removeableColumns = this.#determineRemoveableColumns(settings);

        for (const column of removeableColumns) {
            for (const row of mapped) {
                delete row[column];
            }
        }

        return mapped;
    }

    #determineRemoveableColumns(settings) {
        const columns = [];

        if (!settings.multipleNewsletters) {
            columns.push('newsletter_name');
        }

        if (!settings.membersEnabled) {
            columns.push('email_recipients', 'sends', 'opens', 'clicks', 'feedback_more_like_this', 'feedback_less_like_this');
        } else {
            if (!settings.hasNewslettersWithFeedback) {
                columns.push('feedback_more_like_this', 'feedback_less_like_this');
            }
            if (!settings.trackClicks) {
                columns.push('clicks');
            }
            if (!settings.trackOpens) {
                columns.push('opens');
            }
        }

        if (!settings.membersTrackSources || !settings.membersEnabled) {
            columns.push('signups', 'paid_conversions');
        } else if (!settings.paidMembersEnabled) {
            columns.push('paid_conversions');
        }

        return columns;
    }

    #humanReadableEmailRecipientFilter(recipientFilter, allLabels, allTiers) {
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
            const statusMap = {
                free: 'Free subscribers',
                paid: 'Paid subscribers',
                comped: 'Complimentary subscribers'
            };
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
}

module.exports = PostsExporter;
```