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
     * Export posts with optional filtering.
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
        const hasNewslettersWithFeedback = !!newsletters.find(n => n.get('feedback_enabled'));

        const mapped = this._mapPosts(posts.data, {
            newsletters,
            labels,
            tiers,
            membersEnabled,
            membersTrackSources,
            paidMembersEnabled,
            trackOpens,
            trackClicks,
            hasNewslettersWithFeedback
        });

        if (!mapped.length) {
            return mapped;
        }

        const columnsToRemove = this._determineRemovableColumns({
            newsletters,
            membersEnabled,
            membersTrackSources,
            paidMembersEnabled,
            trackOpens,
            trackClicks,
            hasNewslettersWithFeedback
        });

        this._removeColumns(mapped, columnsToRemove);
        return mapped;
    }

    /**
     * Map raw post models to export rows.
     *
     * @private
     * @param {Array<Object>} posts
     * @param {Object} ctx
     * @returns {Array<Object>}
     */
    _mapPosts(posts, ctx) {
        return posts.map(post => {
            let email = post.related('email');
            if (this._isEmailInvalid(email)) {
                email = null;
            }

            const isDraftOrScheduled = this._isDraftOrScheduled(post.get('status'));
            if (isDraftOrScheduled) {
                email = null;
            }

            const published = !isDraftOrScheduled;
            const feedbackEnabled = this._isFeedbackEnabled(email, ctx.hasNewslettersWithFeedback);
            const showEmailClickAnalytics = this._shouldShowEmailClickAnalytics(ctx.trackClicks, email);

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
                email_recipients: email ? this.humanReadableEmailRecipientFilter(email?.get('recipient_filter'), ctx.labels, ctx.tiers) : null,
                newsletter_name: this._resolveNewsletterName(ctx.newsletters, post, email),
                sends: email?.get('email_count') ?? null,
                opens: ctx.trackOpens ? (email?.get('opened_count') ?? null) : null,
                clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
                signups: this._includeSignups(ctx.membersTrackSources, published, post),
                paid_conversions: this._includePaidConversions(ctx.membersTrackSources, ctx.paidMembersEnabled, published, post),
                feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
                feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
            };
        });
    }

    /**
     * Determine which columns should be removed based on settings.
     *
     * @private
     * @param {Object} ctx
     * @returns {Array<string>}
     */
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

    /**
     * Remove specified columns from each row.
     *
     * @private
     * @param {Array<Object>} rows
     * @param {Array<string>} columns
     */
    _removeColumns(rows, columns) {
        for (const col of columns) {
            for (const row of rows) {
                delete row[col];
            }
        }
    }

    /**
     * @private
     * @param {Object} email
     * @returns {boolean}
     */
    _isEmailInvalid(email) {
        return !email || !email.id;
    }

    /**
     * @private
     * @param {string} status
     * @returns {boolean}
     */
    _isDraftOrScheduled(status) {
        return status === 'draft' || status === 'scheduled';
    }

    /**
     * @private
     * @param {Object|null} email
     * @param {boolean} hasFeedback
     * @returns {boolean}
     */
    _isFeedbackEnabled(email, hasFeedback) {
        return !!email && email.get('feedback_enabled') && hasFeedback;
    }

    /**
     * @private
     * @param {boolean} trackClicks
     * @param {Object|null} email
     * @returns {boolean}
     */
    _shouldShowEmailClickAnalytics(trackClicks, email) {
        return trackClicks && !!email && email.get('track_clicks');
    }

    /**
     * @private
     * @param {Array<Object>} newsletters
     * @param {Object} post
     * @param {Object|null} email
     * @returns {string|null}
     */
    _resolveNewsletterName(newsletters, post, email) {
        if (newsletters.length > 1 && post.get('newsletter_id') && email) {
            const nl = newsletters.find(n => n.get('id') === post.get('newsletter_id'));
            return nl?.get('name') ?? null;
        }
        return null;
    }

    /**
     * @private
     * @param {boolean} membersTrackSources
     * @param {boolean} published
     * @param {Object} post
     * @returns {number|null}
     */
    _includeSignups(membersTrackSources, published, post) {
        return membersTrackSources && published ? (post.get('count__signups') ?? 0) : null;
    }

    /**
     * @private
     * @param {boolean} membersTrackSources
     * @param {boolean} paidMembersEnabled
     * @param {boolean} published
     * @param {Object} post
     * @returns {number|null}
     */
    _includePaidConversions(membersTrackSources, paidMembersEnabled, published, post) {
        return membersTrackSources && paidMembersEnabled && published ? (post.get('count__paid_conversions') ?? 0) : null;
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
     * Convert an email filter to a human readable string.
     *
     * @private
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
     * Convert a parsed NQL filter to readable strings.
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
            for (const sub of filter.$or) {
                strings.push(...this.filterToString(sub, allLabels, allTiers));
            }
            return strings;
        }

        for (const key of Object.keys(filter)) {
            if (key === 'label' && typeof filter.label === 'string') {
                const label = allLabels.find(l => l.get('slug') === filter.label);
                strings.push(label ? label.get('name') : filter.label);
            }

            if (key === 'tier' && typeof filter.tier === 'string') {
                const tier = allTiers.find(t => t.get('slug') === filter.tier);
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

        return strings;
    }
}

module.exports = PostsExporter;
```