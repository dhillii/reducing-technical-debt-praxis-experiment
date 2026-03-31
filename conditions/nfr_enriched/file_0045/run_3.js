```javascript
const nql = require('@tryghost/nql');
const logging = require('@tryghost/logging');

const POST_STATUS_MAP = {
    draft: 'draft',
    scheduled: 'scheduled',
    sent: 'emailed only'
};

const VISIBILITY_MAP = {
    public: 'Public',
    members: 'Members-only',
    paid: 'Paid members-only'
};

const STATUS_FILTER_MAP = {
    free: 'Free subscribers',
    paid: 'Paid subscribers',
    comped: 'Complimentary subscribers'
};

const STATUS_NEGATION_MAP = {
    free: 'Paid subscribers',
    paid: 'Free subscribers'
};

const DEFAULT_POST_FILTER = 'status:published,status:sent';

const POST_RELATIONS = [
    'tiers',
    'tags',
    'authors',
    'count.signups',
    'count.paid_conversions',
    'count.clicks',
    'count.positive_feedback',
    'count.negative_feedback',
    'email'
];

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
     * @param {Function} dependencies.getPostUrl
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
     * @param {object} options
     * @param {string} [options.filter]
     * @param {string} [options.order]
     * @param {string|number} [options.limit]
     */
    async export({filter, order, limit}) {
        const [posts, newsletters, labels, tiers] = await Promise.all([
            this.#models.Post.findPage({
                filter: filter ?? DEFAULT_POST_FILTER,
                order,
                limit,
                withRelated: POST_RELATIONS
            }),
            this.#models.Newsletter.findAll().then(r => r.models),
            this.#models.Label.findAll().then(r => r.models),
            this.#models.Product.findAll().then(r => r.models)
        ]);

        const settings = this.#resolveSettings(newsletters);
        const mapped = posts.data.map(post => this.#mapPost(post, newsletters, labels, tiers, settings));

        if (mapped.length) {
            const columnsToRemove = this.#resolveRemovableColumns(newsletters, settings);
            this.#removeColumns(mapped, columnsToRemove);
        }

        return mapped;
    }

    #resolveSettings(newsletters) {
        const membersEnabled = this.#settingsHelpers.isMembersEnabled();
        return {
            membersEnabled,
            membersTrackSources: membersEnabled && this.#settingsCache.get('members_track_sources'),
            paidMembersEnabled: membersEnabled && this.#settingsHelpers.arePaidMembersEnabled(),
            trackOpens: this.#settingsCache.get('email_track_opens'),
            trackClicks: this.#settingsCache.get('email_track_clicks'),
            hasNewslettersWithFeedback: newsletters.some(n => n.get('feedback_enabled'))
        };
    }

    #resolveEmail(post) {
        const email = post.related('email');
        const isPublishable = !['draft', 'scheduled'].includes(post.get('status'));
        return (isPublishable && email?.id) ? email : null;
    }

    #mapPost(post, newsletters, labels, tiers, settings) {
        const email = this.#resolveEmail(post);
        const status = post.get('status');
        const published = !['draft', 'scheduled'].includes(status);
        const {membersTrackSources, paidMembersEnabled, trackOpens, trackClicks, hasNewslettersWithFeedback} = settings;

        const feedbackEnabled = email && email.get('feedback_enabled') && hasNewslettersWithFeedback;
        const showEmailClickAnalytics = trackClicks && email?.get('track_clicks');
        const newsletterName = this.#resolveNewsletterName(post, newsletters, email);

        return {
            id: post.get('id'),
            title: post.get('title'),
            url: this.#getPostUrl(post),
            author: post.related('authors').map(a => a.get('name')).join(', '),
            status: this.mapPostStatus(status, !!email),
            created_at: post.get('created_at'),
            updated_at: post.get('updated_at'),
            published_at: published ? post.get('published_at') : null,
            featured: post.get('featured'),
            tags: post.related('tags').map(t => t.get('name')).join(', '),
            post_access: this.postAccessToString(post),
            email_recipients: email ? this.humanReadableEmailRecipientFilter(email.get('recipient_filter'), labels, tiers) : null,
            newsletter_name: newsletterName,
            sends: email?.get('email_count') ?? null,
            opens: trackOpens ? (email?.get('opened_count') ?? null) : null,
            clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
            signups: membersTrackSources && published ? (post.get('count__signups') ?? 0) : null,
            paid_conversions: membersTrackSources && paidMembersEnabled && published ? (post.get('count__paid_conversions') ?? 0) : null,
            feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
            feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
        };
    }

    #resolveNewsletterName(post, newsletters, email) {
        if (newsletters.length <= 1 || !post.get('newsletter_id') || !email) {
            return null;
        }
        return newsletters.find(n => n.get('id') === post.get('newsletter_id'))?.get('name') ?? null;
    }

    #resolveRemovableColumns(newsletters, {membersEnabled, membersTrackSources, paidMembersEnabled, trackOpens, trackClicks, hasNewslettersWithFeedback}) {
        const columns = [];

        if (newsletters.length <= 1) {
            columns.push('newsletter_name');
        }

        if (!membersEnabled) {
            columns.push('email_recipients', 'sends', 'opens', 'clicks', 'feedback_more_like_this', 'feedback_less_like_this');
        } else {
            if (!hasNewslettersWithFeedback) {
                columns.push('feedback_more_like_this', 'feedback_less_like_this');
            }
            if (!trackClicks) {
                columns.push('clicks');
            }
            if (!trackOpens) {
                columns.push('opens');
            }
        }

        if (!membersTrackSources || !membersEnabled) {
            columns.push('signups', 'paid_conversions');
        } else if (!paidMembersEnabled) {
            columns.push('paid_conversions');
        }

        return columns;
    }

    #removeColumns(rows, columns) {
        for (const column of columns) {
            for (const row of rows) {
                delete row[column];
            }
        }
    }

    mapPostStatus(status, hasEmail) {
        if (status in POST_STATUS_MAP) {
            return POST_STATUS_MAP[status];
        }
        if (status === 'published') {
            return hasEmail ? 'published and emailed' : 'published only';
        }
        return status;
    }

    postAccessToString(post) {
        const visibility = post.get('visibility');

        if (visibility in VISIBILITY_MAP) {
            return VISIBILITY_MAP[visibility];
        }

        if (visibility === 'tiers') {
            const tiers = post.related('tiers');
            const tierNames = tiers.map(t => t.get('name')).join(', ');
            return tiers.length === 0 ? 'Specific tiers: none' : `Specific tiers: ${tierNames}`;
        }

        return visibility;
    }

    humanReadableEmailRecipientFilter(recipientFilter, allLabels, allTiers) {
        if (recipientFilter === 'all') {
            return 'All subscribers';
        }

        try {
            const parsed = nql(recipientFilter).parse();
            return this.#filterToString(parsed, allLabels, allTiers).join(', ');
        } catch (e) {
            logging.error(e);
            return recipientFilter;
        }
    }

    #filterToString(filter, allLabels, allTiers) {
        if (filter.$or) {
            return filter.$or.flatMap(sub => this.#filterToString(sub, allLabels, allTiers));
        }

        if (filter.$and) {
            return [];
        }

        return Object.keys(filter).flatMap(key => this.#filterKeyToString(key, filter[key], allLabels, allTiers));
    }

    #filterKeyToString(key, value, allLabels, allTiers) {
        if (key === 'label' && typeof value === 'string') {
            return [this.#resolveModelName(value, allLabels)];
        }

        if (key === 'tier' && typeof value === 'string') {
            return [this.#resolveModelName(value, allTiers)];
        }

        if (key === 'status') {
            return this.#statusFilterToString(value);
        }

        return [];
    }

    #resolveModelName(slug, models) {
        return models.find(m => m.get('slug') === slug)?.get('name') ?? slug;
    }

    #statusFilterToString(value) {
        if (typeof value === 'string') {
            return value in STATUS_FILTER_MAP ? [STATUS_FILTER_MAP[value]] : [];
        }

        if (value.$ne && value.$ne in STATUS_NEGATION_MAP) {
            return [STATUS_NEGATION_MAP[value.$ne]];
        }

        return [];
    }
}

module.exports = PostsExporter;
```