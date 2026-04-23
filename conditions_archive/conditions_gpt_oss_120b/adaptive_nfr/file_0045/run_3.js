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
        const hasNewslettersWithFeedback = !!newsletters.find(n => n.get('feedback_enabled'));

        const mapped = posts.data.map(post => this._mapPost(post, {
            newsletters,
            labels,
            tiers,
            membersEnabled,
            membersTrackSources,
            paidMembersEnabled,
            trackOpens,
            trackClicks,
            hasNewslettersWithFeedback
        }));

        if (!mapped.length) {
            return mapped;
        }

        const removableColumns = this._determineRemovableColumns({
            newsletters,
            membersEnabled,
            membersTrackSources,
            paidMembersEnabled,
            trackOpens,
            trackClicks,
            hasNewslettersWithFeedback
        });

        this._removeColumns(mapped, removableColumns);
        return mapped;
    }

    _mapPost(post, ctx) {
        let email = post.related('email');

        if (!email.id) {
            email = null;
        }

        if (this._isDraftOrScheduled(post.get('status'))) {
            email = null;
        }

        const feedbackEnabled = this._isFeedbackEnabled(email, ctx.hasNewslettersWithFeedback);
        const showEmailClickAnalytics = this._shouldShowEmailClickAnalytics(ctx.trackClicks, email);
        const published = !(post.get('status') === 'draft' || post.get('status') === 'scheduled');

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
            email_recipients: email ? this.humanReadableEmailRecipientFilter(email.get('recipient_filter'), ctx.labels, ctx.tiers) : null,
            newsletter_name: this._resolveNewsletterName(post, ctx.newsletters, email),
            sends: email?.get('email_count') ?? null,
            opens: ctx.trackOpens ? (email?.get('opened_count') ?? null) : null,
            clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
            signups: this._shouldIncludeSignups(ctx.membersTrackSources, published) ? (post.get('count__signups') ?? 0) : null,
            paid_conversions: this._shouldIncludePaidConversions(ctx.membersTrackSources, ctx.paidMembersEnabled, published) ? (post.get('count__paid_conversions') ?? 0) : null,
            feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
            feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
        };
    }

    _isDraftOrScheduled(status) {
        return status === 'draft' || status === 'scheduled';
    }

    _isFeedbackEnabled(email, hasNewslettersWithFeedback) {
        return email && email.get('feedback_enabled') && hasNewslettersWithFeedback;
    }

    _shouldShowEmailClickAnalytics(trackClicks, email) {
        return trackClicks && email && email.get('track_clicks');
    }

    _shouldIncludeSignups(membersTrackSources, published) {
        return membersTrackSources && published;
    }

    _shouldIncludePaidConversions(membersTrackSources, paidMembersEnabled, published) {
        return membersTrackSources && paidMembersEnabled && published;
    }

    _resolveNewsletterName(post, newsletters, email) {
        if (newsletters.length <= 1) {
            return null;
        }
        if (!post.get('newsletter_id') || !email) {
            return null;
        }
        const newsletter = newsletters.find(n => n.get('id') === post.get('newsletter_id'));
        return newsletter?.get('name') ?? null;
    }

    _determineRemovableColumns(ctx) {
        const cols = [];

        if (ctx.newsletters.length <= 1) {
            cols.push('newsletter_name');
        }

        if (!ctx.membersEnabled) {
            cols.push('email_recipients', 'sends', 'opens', 'clicks', 'feedback_more_like_this', 'feedback_less_like_this');
        } else if (!ctx.hasNewslettersWithFeedback) {
            cols.push('feedback_more_like_this', 'feedback_less_like_this');
        }

        if (ctx.membersEnabled && !ctx.trackClicks) {
            cols.push('clicks');
        }

        if (ctx.membersEnabled && !ctx.trackOpens) {
            cols.push('opens');
        }

        if (!ctx.membersTrackSources || !ctx.membersEnabled) {
            cols.push('signups', 'paid_conversions');
        } else if (!ctx.paidMembersEnabled) {
            cols.push('paid_conversions');
        }

        return cols;
    }

    _removeColumns(rows, columns) {
        for (const column of columns) {
            for (const row of rows) {
                delete row[column];
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
            if (!tiers.length) {
                return 'Specific tiers: none';
            }
            return 'Specific tiers: ' + tiers.map(t => t.get('name')).join(', ');
        }
        return visibility;
    }

    /**
     * @private Convert an email filter to a human readable string
     * @param {string} recipientFilter
     * @param {*} allLabels
     * @param {*} allTiers
     * @returns {string}
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
     * @param {*} allTiers All available member tiers
     * @returns {string[]}
     */
    filterToString(filter, allLabels, allTiers) {
        const strings = [];

        if (filter.$or) {
            for (const sub of filter.$or) {
                strings.push(...this.filterToString(sub, allLabels, allTiers));
            }
            return strings;
        }

        for (const key of Object.keys(filter)) {
            if (key === 'label') {
                strings.push(this._labelToString(filter.label, allLabels));
            } else if (key === 'tier') {
                strings.push(this._tierToString(filter.tier, allTiers));
            } else if (key === 'status') {
                strings.push(...this._statusToString(filter.status));
            }
        }

        return strings;
    }

    /**
     * @private Convert a label filter to a readable string
     * @param {string|object} labelFilter
     * @param {*} allLabels
     * @returns {string}
     */
    _labelToString(labelFilter, allLabels) {
        if (typeof labelFilter !== 'string') {
            return '';
        }
        const label = allLabels.find(l => l.get('slug') === labelFilter);
        return label ? label.get('name') : labelFilter;
    }

    /**
     * @private Convert a tier filter to a readable string
     * @param {string|object} tierFilter
     * @param {*} allTiers
     * @returns {string}
     */
    _tierToString(tierFilter, allTiers) {
        if (typeof tierFilter !== 'string') {
            return '';
        }
        const tier = allTiers.find(t => t.get('slug') === tierFilter);
        return tier ? tier.get('name') : tierFilter;
    }

    /**
     * @private Convert a status filter to readable strings
     * @param {string|object} statusFilter
     * @returns {string[]}
     */
    _statusToString(statusFilter) {
        const result = [];
        if (typeof statusFilter === 'string') {
            if (statusFilter === 'free') result.push('Free subscribers');
            else if (statusFilter === 'paid') result.push('Paid subscribers');
            else if (statusFilter === 'comped') result.push('Complimentary subscribers');
        } else if (statusFilter && statusFilter.$ne) {
            if (statusFilter.$ne === 'free') result.push('Paid subscribers');
            if (statusFilter.$ne === 'paid') result.push('Free subscribers');
        }
        return result;
    }
}

module.exports = PostsExporter;
```