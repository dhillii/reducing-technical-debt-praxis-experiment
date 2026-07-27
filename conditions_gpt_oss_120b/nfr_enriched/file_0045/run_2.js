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

        const settings = this._gatherSettings(newsletters);
        const mapped = this._mapPosts(posts.data, newsletters, labels, tiers, settings);

        if (mapped.length) {
            const columnsToRemove = this._determineRemovableColumns(newsletters, settings);
            this._removeColumns(mapped, columnsToRemove);
        }

        return mapped;
    }

    /**
     * Collects all relevant settings for export processing.
     * @param {Array} newsletters
     * @returns {Object}
     */
    _gatherSettings(newsletters) {
        const membersEnabled = this.#settingsHelpers.isMembersEnabled();
        const membersTrackSources = membersEnabled && this.#settingsCache.get('members_track_sources');
        const paidMembersEnabled = membersEnabled && this.#settingsHelpers.arePaidMembersEnabled();
        const trackOpens = this.#settingsCache.get('email_track_opens');
        const trackClicks = this.#settingsCache.get('email_track_clicks');
        const hasNewslettersWithFeedback = !!newsletters.find(newsletter => newsletter.get('feedback_enabled'));

        return {
            membersEnabled,
            membersTrackSources,
            paidMembersEnabled,
            trackOpens,
            trackClicks,
            hasNewslettersWithFeedback
        };
    }

    /**
     * Maps raw post models to export rows.
     * @param {Array} posts
     * @param {Array} newsletters
     * @param {Array} labels
     * @param {Array} tiers
     * @param {Object} settings
     * @returns {Array}
     */
    _mapPosts(posts, newsletters, labels, tiers, settings) {
        return posts.map(post => {
            const email = this._resolveEmail(post);
            const published = this._isPublished(post);
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
                newsletter_name: newsletters.length > 1 && post.get('newsletter_id') && email
                    ? newsletters.find(newsletter => newsletter.get('id') === post.get('newsletter_id'))?.get('name')
                    : null,
                sends: email?.get('email_count') ?? null,
                opens: settings.trackOpens ? (email?.get('opened_count') ?? null) : null,
                clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
                signups: settings.membersTrackSources && published ? (post.get('count__signups') ?? 0) : null,
                paid_conversions: settings.membersTrackSources && settings.paidMembersEnabled && published
                    ? (post.get('count__paid_conversions') ?? 0)
                    : null,
                feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
                feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
            };
        });
    }

    /**
     * Resolves the email relation, handling bookshelf edge‑case.
     * @param {Object} post
     * @returns {Object|null}
     */
    _resolveEmail(post) {
        let email = post.related('email');
        if (!email.id) {
            return null;
        }
        return email;
    }

    /**
     * Determines if a post should be considered published.
     * @param {Object} post
     * @returns {boolean}
     */
    _isPublished(post) {
        const status = post.get('status');
        return !(status === 'draft' || status === 'scheduled');
    }

    /**
     * Calculates which columns should be removed based on settings.
     * @param {Array} newsletters
     * @param {Object} settings
     * @returns {Array}
     */
    _determineRemovableColumns(newsletters, settings) {
        const columns = [];

        if (newsletters.length <= 1) {
            columns.push('newsletter_name');
        }

        if (!settings.membersEnabled) {
            columns.push('email_recipients', 'sends', 'opens', 'clicks', 'feedback_more_like_this', 'feedback_less_like_this');
        } else if (!settings.hasNewslettersWithFeedback) {
            columns.push('feedback_more_like_this', 'feedback_less_like_this');
        }

        if (settings.membersEnabled && !settings.trackClicks) {
            columns.push('clicks');
        }

        if (settings.membersEnabled && !settings.trackOpens) {
            columns.push('opens');
        }

        if (!settings.membersTrackSources || !settings.membersEnabled) {
            columns.push('signups', 'paid_conversions');
        } else if (!settings.paidMembersEnabled) {
            columns.push('paid_conversions');
        }

        return columns;
    }

    /**
     * Removes specified columns from each row.
     * @param {Array} rows
     * @param {Array} columns
     */
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
                    const label = allLabels.find(l => l.get('slug') === filter.label);
                    strings.push(label ? label.get('name') : filter.label);
                }
                if (key === 'tier' && typeof filter.tier === 'string') {
                    const tier = allTiers.find(l => l.get('slug') === filter.tier);
                    strings.push(tier ? tier.get('name') : filter.tier);
                }
                if (key === 'status') {
                    if (typeof filter.status === 'string') {
                        if (filter.status === 'free') strings.push('Free subscribers');
                        else if (filter.status === 'paid') strings.push('Paid subscribers');
                        else if (filter.status === 'comped') strings.push('Complimentary subscribers');
                    } else if (filter.status.$ne) {
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