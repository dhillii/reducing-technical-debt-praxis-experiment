```javascript
const nql = require('@tryghost/nql');
const logging = require('@tryghost/logging');

class PostsExporter {
    #models;
    #getPostUrl;
    #settingsCache;
    #settingsHelpers;

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

        const newsletters = (await this.#models.Newsletter.findAll()).models;
        const labels = (await this.#models.Label.findAll()).models;
        const tiers = (await this.#models.Product.findAll()).models;

        const settings = this.#buildSettings(newsletters);
        const mapped = posts.data.map(post => this.#mapPost(post, newsletters, labels, tiers, settings));

        if (mapped.length) {
            this.#removeUnusedColumns(mapped, newsletters, settings);
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
            hasNewslettersWithFeedback: !!newsletters.find(n => n.get('feedback_enabled'))
        };
    }

    #mapPost(post, newsletters, labels, tiers, settings) {
        const email = this.#getPostEmail(post);
        const published = this.#isPostPublished(post);
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

    #getPostEmail(post) {
        let email = post.related('email');
        return email?.id ? email : null;
    }

    #isPostPublished(post) {
        const status = post.get('status');
        return status !== 'draft' && status !== 'scheduled';
    }

    #getNewsletterName(post, newsletters, email) {
        if (newsletters.length <= 1 || !post.get('newsletter_id') || !email) {
            return null;
        }
        return newsletters.find(n => n.get('id') === post.get('newsletter_id'))?.get('name') ?? null;
    }

    #removeUnusedColumns(mapped, newsletters, settings) {
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
            const tierNames = tiers.length === 0 ? 'none' : tiers.map(tier => tier.get('name')).join(', ');
            return `Specific tiers: ${tierNames}`;
        }

        return visibility;
    }

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

    filterToString(filter, allLabels, allTiers) {
        const strings = [];

        if (filter.$or) {
            for (const subfilter of filter.$or) {
                strings.push(...this.filterToString(subfilter, allLabels, allTiers));
            }
            return strings;
        }

        for (const key of Object.keys(filter)) {
            if (key === 'label' && typeof filter.label === 'string') {
                strings.push(this.#resolveLabelName(filter.label, allLabels));
            } else if (key === 'tier' && typeof filter.tier === 'string') {
                strings.push(this.#resolveTierName(filter.tier, allTiers));
            } else if (key === 'status') {
                strings.push(...this.#resolveStatusStrings(filter.status));
            }
        }

        return strings;
    }

    #resolveLabelName(labelSlug, allLabels) {
        const label = allLabels.find(l => l.get('slug') === labelSlug);
        return label ? label.get('name') : labelSlug;
    }

    #resolveTierName(tierSlug, allTiers) {
        const tier = allTiers.find(t => t.get('slug') === tierSlug);
        return tier ? tier.get('name') : tierSlug;
    }

    #resolveStatusStrings(status) {
        const statusMap = {
            'free': 'Free subscribers',
            'paid': 'Paid subscribers',
            'comped': 'Complimentary subscribers'
        };

        if (typeof status === 'string') {
            return [statusMap[status] ?? status];
        }

        const strings = [];
        if (status.$ne === 'free') {
            strings.push('Paid subscribers');
        }
        if (status.$ne === 'paid') {
            strings.push('Free subscribers');
        }
        return strings;
    }
}

module.exports = PostsExporter;
```