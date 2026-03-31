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

const STATUS_STRING_MAP = {
    free: 'Free subscribers',
    paid: 'Paid subscribers',
    comped: 'Complimentary subscribers'
};

const STATUS_NE_MAP = {
    free: 'Paid subscribers',
    paid: 'Free subscribers'
};

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
     * @param {object} options
     * @param {string} [options.filter]
     * @param {string} [options.order]
     * @param {string|number} [options.limit]
     */
    async export({filter, order, limit}) {
        const [posts, newsletters, labels, tiers] = await Promise.all([
            this.#models.Post.findPage({
                filter: filter ?? 'status:published,status:sent',
                order,
                limit,
                withRelated: [
                    'tiers', 'tags', 'authors',
                    'count.signups', 'count.paid_conversions',
                    'count.clicks', 'count.positive_feedback',
                    'count.negative_feedback', 'email'
                ]
            }),
            this.#models.Newsletter.findAll().then(r => r.models),
            this.#models.Label.findAll().then(r => r.models),
            this.#models.Product.findAll().then(r => r.models)
        ]);

        const settings = this.#resolveSettings(newsletters);
        const mapped = posts.data.map(post => this.#mapPost(post, newsletters, labels, tiers, settings));

        if (mapped.length) {
            this.#removeColumns(mapped, newsletters, settings);
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

    #resolvePostEmail(post) {
        const status = post.get('status');
        const isDraftOrScheduled = status === 'draft' || status === 'scheduled';

        if (isDraftOrScheduled) {
            return {email: null, published: false};
        }

        const email = post.related('email');
        return {
            email: email?.id ? email : null,
            published: true
        };
    }

    #mapPost(post, newsletters, labels, tiers, settings) {
        const {email, published} = this.#resolvePostEmail(post);
        const {trackClicks, trackOpens, membersTrackSources, paidMembersEnabled, hasNewslettersWithFeedback} = settings;

        const feedbackEnabled = email && email.get('feedback_enabled') && hasNewslettersWithFeedback;
        const showEmailClickAnalytics = trackClicks && email && email.get('track_clicks');
        const newsletterName = this.#resolveNewsletterName(post, email, newsletters);

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

    #resolveNewsletterName(post, email, newsletters) {
        if (newsletters.length <= 1 || !post.get('newsletter_id') || !email) {
            return null;
        }
        return newsletters.find(n => n.get('id') === post.get('newsletter_id'))?.get('name') ?? null;
    }

    #removeColumns(mapped, newsletters, settings) {
        const {membersEnabled, membersTrackSources, paidMembersEnabled, trackOpens, trackClicks, hasNewslettersWithFeedback} = settings;

        const columnsToRemove = [
            newsletters.length <= 1 && 'newsletter_name',
            !membersEnabled && ['email_recipients', 'sends', 'opens', 'clicks', 'feedback_more_like_this', 'feedback_less_like_this'],
            membersEnabled && !hasNewslettersWithFeedback && ['feedback_more_like_this', 'feedback_less_like_this'],
            membersEnabled && !trackClicks && 'clicks',
            membersEnabled && !trackOpens && 'opens',
            (!membersTrackSources || !membersEnabled) && ['signups', 'paid_conversions'],
            membersEnabled && membersTrackSources && !paidMembersEnabled && 'paid_conversions'
        ].flat().filter(Boolean);

        const uniqueColumns = [...new Set(columnsToRemove)];

        for (const column of uniqueColumns) {
            for (const row of mapped) {
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
            return tiers.length === 0
                ? 'Specific tiers: none'
                : 'Specific tiers: ' + tiers.map(t => t.get('name')).join(', ');
        }

        return visibility;
    }

    /**
     * @private Convert an email filter to a human readable string
     * @param {string} recipientFilter
     * @param {*} allLabels
     * @param {*} allTiers
     */
    humanReadableEmailRecipientFilter(recipientFilter, allLabels, allTiers) {
        if (recipientFilter === 'all') {
            return 'All subscribers';
        }

        try {
            const parsed = nql(recipientFilter).parse();
            return this.filterToString(parsed, allLabels, allTiers).join(', ');
        } catch (e) {
            logging.error(e);
            return recipientFilter;
        }
    }

    /**
     * @private Convert a parsed NQL filter to human readable strings
     * @param {*} filter Parsed NQL filter
     * @param {*} allLabels All available member labels
     * @param {*} allTiers All available tiers
     */
    filterToString(filter, allLabels, allTiers) {
        if (filter.$and) {
            return [];
        }

        if (filter.$or) {
            return filter.$or.flatMap(sub => this.filterToString(sub, allLabels, allTiers));
        }

        return Object.keys(filter).flatMap(key => this.#filterKeyToStrings(key, filter[key], allLabels, allTiers));
    }

    #filterKeyToStrings(key, value, allLabels, allTiers) {
        if (key === 'label' && typeof value === 'string') {
            return [this.#resolveSlugName(value, allLabels)];
        }

        if (key === 'tier' && typeof value === 'string') {
            return [this.#resolveSlugName(value, allTiers)];
        }

        if (key === 'status') {
            return this.#statusFilterToStrings(value);
        }

        return [];
    }

    #resolveSlugName(slug, collection) {
        return collection.find(item => item.get('slug') === slug)?.get('name') ?? slug;
    }

    #statusFilterToStrings(value) {
        if (typeof value === 'string') {
            return STATUS_STRING_MAP[value] ? [STATUS_STRING_MAP[value]] : [];
        }

        if (value.$ne && STATUS_NE_MAP[value.$ne]) {
            return [STATUS_NE_MAP[value.$ne]];
        }

        return [];
    }
}

module.exports = PostsExporter;
```