const nql = require('@tryghost/nql');
const logging = require('@tryghost/logging');

class PostsExporter {
    #models;
    #getPostUrl;
    #settingsCache;
    #settingsHelpers;

    constructor({ models, getPostUrl, settingsCache, settingsHelpers }) {
        this.#models = models;
        this.#getPostUrl = getPostUrl;
        this.#settingsCache = settingsCache;
        this.#settingsHelpers = settingsHelpers;
    }

    async export({ filter, order, limit }) {
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

        const settings = this.#getSettings();

        const mapped = posts.data.map(post => this.#mapPost(post, newsletters, labels, tiers, settings));

        if (mapped.length) {
            const removeableColumns = this.#getRemoveableColumns(newsletters, settings);
            this.#applyRemoveableColumns(mapped, removeableColumns);
        }

        return mapped;
    }

    #getSettings() {
        const membersEnabled = this.#settingsHelpers.isMembersEnabled();
        const membersTrackSources = membersEnabled && this.#settingsCache.get('members_track_sources');
        const paidMembersEnabled = membersEnabled && this.#settingsHelpers.arePaidMembersEnabled();
        const trackOpens = this.#settingsCache.get('email_track_opens');
        const trackClicks = this.#settingsCache.get('email_track_clicks');
        const hasNewslettersWithFeedback = !!(this.#models.Newsletter.findAll().then(r => r.models).then(news => news.find(n => n.get('feedback_enabled'))));

        return {
            membersEnabled,
            membersTrackSources,
            paidMembersEnabled,
            trackOpens,
            trackClicks,
            hasNewslettersWithFeedback
        };
    }

    #mapPost(post, newsletters, labels, tiers, settings) {
        let email = post.related('email');
        if (!email?.id) email = null;

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

    #getNewsletterName(post, newsletters, email) {
        if (newsletters.length <= 1 || !post.get('newsletter_id') || !email) return null;
        const newsletter = newsletters.find(n => n.get('id') === post.get('newsletter_id'));
        return newsletter?.get('name') ?? null;
    }

    #getRemoveableColumns(newsletters, settings) {
        const cols = [];

        if (newsletters.length <= 1) cols.push('newsletter_name');

        if (!settings.membersEnabled) {
            cols.push('email_recipients', 'sends', 'opens', 'clicks', 'feedback_more_like_this', 'feedback_less_like_this');
        } else if (!settings.hasNewslettersWithFeedback) {
            cols.push('feedback_more_like_this', 'feedback_less_like_this');
        }

        if (settings.membersEnabled && !settings.trackClicks) cols.push('clicks');
        if (settings.membersEnabled && !settings.trackOpens) cols.push('opens');

        if (!settings.membersTrackSources || !settings.membersEnabled) {
            cols.push('signups', 'paid_conversions');
        } else if (!settings.paidMembersEnabled) {
            cols.push('paid_conversions');
        }

        return cols;
    }

    #applyRemoveableColumns(mapped, columns) {
        for (const col of columns) {
            for (const row of mapped) {
                delete row[col];
            }
        }
    }

    mapPostStatus(status, hasEmail) {
        if (status === 'draft') return 'draft';
        if (status === 'scheduled') return 'scheduled';
        if (status === 'sent') return 'emailed only';
        if (status === 'published') return hasEmail ? 'published and emailed' : 'published only';
        return status;
    }

    postAccessToString(post) {
        const visibility = post.get('visibility');
        if (visibility === 'public') return 'Public';
        if (visibility === 'members') return 'Members-only';
        if (visibility === 'paid') return 'Paid members-only';
        if (visibility === 'tiers') {
            const tiers = post.related('tiers');
            if (tiers.length === 0) return 'Specific tiers: none';
            return 'Specific tiers: ' + tiers.map(t => t.get('name')).join(', ');
        }
        return visibility;
    }

    humanReadableEmailRecipientFilter(recipientFilter, allLabels, allTiers) {
        if (recipientFilter === 'all') return 'All subscribers';
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
        if (filter.$and) {
            // Not supported
        } else if (filter.$or) {
            for (const subfilter of filter.$or) {
                strings.push(...this.filterToString(subfilter, allLabels, allTiers));
            }
        } else {
            for (const key of Object.keys(filter)) {
                if (key === 'label' && typeof filter.label === 'string') {
                    const label = allLabels.find(l => l.get('slug') === filter.label);
                    strings.push(label?.get('name') ?? filter.label);
                }
                if (key === 'tier' && typeof filter.tier === 'string') {
                    const tier = allTiers.find(t => t.get('slug') === filter.tier);
                    strings.push(tier?.get('name') ?? filter.tier);
                }
                if (key === 'status') {
                    if (typeof filter.status === 'string') {
                        switch (filter.status) {
                            case 'free': strings.push('Free subscribers'); break;
                            case 'paid': strings.push('Paid subscribers'); break;
                            case 'comped': strings.push('Complimentary subscribers'); break;
                        }
                    } else {
                        if (filter.status.$ne === 'free') strings.push('Paid subscribers');
                        if (filter.status.$ne === 'paid') strings.push('Free subscribers');
                    }
                }
            }
        }
        return strings;
    }
}

module.exports = PostsExporter;