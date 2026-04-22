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
     * Export posts with optional filtering, ordering and limiting.
     *
     * @param {object} options
     * @param {string} [options.filter]
     * @param {string} [options.order]
     * @param {string|number} [options.limit]
     * @returns {Promise<Array<Object>>}
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

        const flags = {
            membersEnabled,
            membersTrackSources,
            paidMembersEnabled,
            trackOpens,
            trackClicks,
            hasNewslettersWithFeedback
        };

        const mapped = posts.data.map(post => this._mapPostRow(post, newsletters, labels, tiers, flags));

        if (mapped.length) {
            const removeableColumns = this._determineRemovableColumns(newsletters, flags);
            for (const column of removeableColumns) {
                for (const row of mapped) {
                    delete row[column];
                }
            }
        }

        return mapped;
    }

    /**
     * Build a row representation for a single post.
     *
     * @private
     * @param {Object} post
     * @param {Array<Object>} newsletters
     * @param {Array<Object>} labels
     * @param {Array<Object>} tiers
     * @param {Object} flags
     * @returns {Object}
     */
    _mapPostRow(post, newsletters, labels, tiers, flags) {
        let email = post.related('email');
        if (!email.id) {
            email = null;
        }

        let published = true;
        if (post.get('status') === 'draft' || post.get('status') === 'scheduled') {
            email = null;
            published = false;
        }

        const feedbackEnabled = email && email.get('feedback_enabled') && flags.hasNewslettersWithFeedback;
        const showEmailClickAnalytics = flags.trackClicks && email && email.get('track_clicks');

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
            newsletter_name: newsletters.length > 1 && post.get('newsletter_id') && email
                ? newsletters.find(newsletter => newsletter.get('id') === post.get('newsletter_id'))?.get('name')
                : null,
            sends: email?.get('email_count') ?? null,
            opens: flags.trackOpens ? (email?.get('opened_count') ?? null) : null,
            clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
            signups: flags.membersTrackSources && published ? (post.get('count__signups') ?? 0) : null,
            paid_conversions: flags.membersTrackSources && flags.paidMembersEnabled && published
                ? (post.get('count__paid_conversions') ?? 0)
                : null,
            feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
            feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
        };
    }

    /**
     * Determine which columns should be removed based on settings and newsletters.
     *
     * @private
     * @param {Array<Object>} newsletters
     * @param {Object} flags
     * @returns {Array<string>}
     */
    _determineRemovableColumns(newsletters, flags) {
        const columns = [];

        if (newsletters.length <= 1) {
            columns.push('newsletter_name');
        }

        if (!flags.membersEnabled) {
            columns.push('email_recipients', 'sends', 'opens', 'clicks', 'feedback_more_like_this', 'feedback_less_like_this');
        } else if (!flags.hasNewslettersWithFeedback) {
            columns.push('feedback_more_like_this', 'feedback_less_like_this');
        }

        if (flags.membersEnabled && !flags.trackClicks) {
            columns.push('clicks');
        }

        if (flags.membersEnabled && !flags.trackOpens) {
            columns.push('opens');
        }

        if (!flags.membersTrackSources || !flags.membersEnabled) {
            columns.push('signups', 'paid_conversions');
        } else if (!flags.paidMembersEnabled) {
            columns.push('paid_conversions');
        }

        return columns;
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
     * Convert an email filter to a human readable string.
     *
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
     * Convert a parsed NQL filter to an array of human readable strings.
     *
     * @private
     * @param {*} filter Parsed NQL filter
     * @param {*} allLabels All available member labels
     * @param {*} allTiers All available member tiers
     * @returns {Array<string>}
     */
    filterToString(filter, allLabels, allTiers) {
        const strings = [];

        if (filter.$or) {
            for (const subfilter of filter.$or) {
                strings.push(...this.filterToString(subfilter, allLabels, allTiers));
            }
            return strings;
        }

        for (const key of Object.keys(filter)) {
            const value = filter[key];
            if (key === 'label' && typeof value === 'string') {
                const label = allLabels.find(l => l.get('slug') === value);
                strings.push(label ? label.get('name') : value);
            }

            if (key === 'tier' && typeof value === 'string') {
                const tier = allTiers.find(t => t.get('slug') === value);
                strings.push(tier ? tier.get('name') : value);
            }

            if (key === 'status') {
                if (typeof value === 'string') {
                    strings.push(this._statusString(value));
                } else if (value.$ne) {
                    strings.push(this._inverseStatusString(value.$ne));
                }
            }
        }

        return strings;
    }

    /**
     * Map a status value to a readable string.
     *
     * @private
     * @param {string} status
     * @returns {string}
     */
    _statusString(status) {
        if (status === 'free') return 'Free subscribers';
        if (status === 'paid') return 'Paid subscribers';
        if (status === 'comped') return 'Complimentary subscribers';
        return status;
    }

    /**
     * Map an inverse status filter to a readable string.
     *
     * @private
     * @param {string} status
     * @returns {string}
     */
    _inverseStatusString(status) {
        if (status === 'free') return 'Paid subscribers';
        if (status === 'paid') return 'Free subscribers';
        return status;
    }
}

module.exports = PostsExporter;
```