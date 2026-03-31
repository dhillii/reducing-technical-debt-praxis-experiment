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

    async #fetchData({filter, order, limit}) {
        const posts = await this.#models.Post.findPage({
            filter: filter ?? 'status:published,status:sent',
            order,
            limit,
            withRelated: [
                'tiers', 'tags', 'authors',
                'count.signups', 'count.paid_conversions',
                'count.clicks', 'count.positive_feedback',
                'count.negative_feedback', 'email'
            ]
        });

        const [newsletters, labels, tiers] = await Promise.all([
            this.#models.Newsletter.findAll().then(r => r.models),
            this.#models.Label.findAll().then(r => r.models),
            this.#models.Product.findAll().then(r => r.models)
        ]);

        return {posts, newsletters, labels, tiers};
    }

    #buildSettings() {
        const membersEnabled = this.#settingsHelpers.isMembersEnabled();
        const membersTrackSources = membersEnabled && this.#settingsCache.get('members_track_sources');
        const paidMembersEnabled = membersEnabled && this.#settingsHelpers.arePaidMembersEnabled();
        const trackOpens = this.#settingsCache.get('email_track_opens');
        const trackClicks = this.#settingsCache.get('email_track_clicks');

        return {membersEnabled, membersTrackSources, paidMembersEnabled, trackOpens, trackClicks};
    }

    #resolvePostEmail(post) {
        const status = post.get('status');
        const isDraftOrScheduled = status === 'draft' || status === 'scheduled';

        if (isDraftOrScheduled) {
            return null;
        }

        const email = post.related('email');
        return email?.id ? email : null;
    }

    #mapPost(post, {newsletters, labels, tiers, settings}) {
        const {membersEnabled, membersTrackSources, paidMembersEnabled, trackOpens, trackClicks} = settings;
        const email = this.#resolvePostEmail(post);
        const published = email !== null || (post.get('status') !== 'draft' && post.get('status') !== 'scheduled');
        const hasNewslettersWithFeedback = newsletters.some(n => n.get('feedback_enabled'));
        const feedbackEnabled = email && email.get('feedback_enabled') && hasNewslettersWithFeedback;
        const showEmailClickAnalytics = trackClicks && email?.get('track_clicks');
        const multipleNewsletters = newsletters.length > 1;

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
            email_recipients: email
                ? this.humanReadableEmailRecipientFilter(email.get('recipient_filter'), labels, tiers)
                : null,
            newsletter_name: multipleNewsletters && post.get('newsletter_id') && email
                ? newsletters.find(n => n.get('id') === post.get('newsletter_id'))?.get('name') ?? null
                : null,
            sends: email?.get('email_count') ?? null,
            opens: trackOpens ? (email?.get('opened_count') ?? null) : null,
            clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
            signups: membersTrackSources && published ? (post.get('count__signups') ?? 0) : null,
            paid_conversions: membersTrackSources && paidMembersEnabled && published
                ? (post.get('count__paid_conversions') ?? 0)
                : null,
            feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
            feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
        };
    }

    #getRemoveableColumns({newsletters, settings, hasNewslettersWithFeedback}) {
        const {membersEnabled, membersTrackSources, paidMembersEnabled, trackOpens, trackClicks} = settings;
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
        for (const row of rows) {
            for (const col of columns) {
                delete row[col];
            }
        }
    }

    /**
     * @param {object} options
     * @param {string} [options.filter]
     * @param {string} [options.order]
     * @param {string|number} [options.limit]
     */
    async export({filter, order, limit}) {
        const {posts, newsletters, labels, tiers} = await this.#fetchData({filter, order, limit});
        const settings = this.#buildSettings();
        const hasNewslettersWithFeedback = newsletters.some(n => n.get('feedback_enabled'));

        const mapped = posts.data.map(post =>
            this.#mapPost(post, {newsletters, labels, tiers, settings})
        );

        if (mapped.length) {
            const removeableColumns = this.#getRemoveableColumns({newsletters, settings, hasNewslettersWithFeedback});
            this.#removeColumns(mapped, removeableColumns);
        }

        return mapped;
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
     * @private
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

    #resolveModelName(slug, models) {
        const model = models.find(m => m.get('slug') === slug);
        return model ? model.get('name') : slug;
    }

    #statusFilterToString(statusFilter) {
        if (typeof statusFilter === 'string') {
            return STATUS_STRING_MAP[statusFilter] ? [STATUS_STRING_MAP[statusFilter]] : [];
        }

        const neValue = statusFilter.$ne;
        return STATUS_NE_MAP[neValue] ? [STATUS_NE_MAP[neValue]] : [];
    }

    /**
     * @private
     */
    filterToString(filter, allLabels, allTiers) {
        if (filter.$or) {
            return filter.$or.flatMap(sub => this.filterToString(sub, allLabels, allTiers));
        }

        if (filter.$and) {
            return [];
        }

        const strings = [];

        for (const [key, value] of Object.entries(filter)) {
            if (key === 'label' && typeof value === 'string') {
                strings.push(this.#resolveModelName(value, allLabels));
            } else if (key === 'tier' && typeof value === 'string') {
                strings.push(this.#resolveModelName(value, allTiers));
            } else if (key === 'status') {
                strings.push(...this.#statusFilterToString(value));
            }
        }

        return strings;
    }
}

module.exports = PostsExporter;
```