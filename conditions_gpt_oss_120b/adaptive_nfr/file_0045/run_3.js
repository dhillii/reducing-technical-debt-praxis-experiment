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
        const hasNewslettersWithFeedback = !!newsletters.find(newsletter => newsletter.get('feedback_enabled'));

        const mapped = posts.data.map(post => this._mapPostToRow(
            post,
            newsletters,
            labels,
            tiers,
            membersEnabled,
            membersTrackSources,
            paidMembersEnabled,
            trackOpens,
            trackClicks,
            hasNewslettersWithFeedback
        ));

        if (mapped.length) {
            const removeableColumns = this._computeRemoveableColumns({
                newsletters,
                membersEnabled,
                hasNewslettersWithFeedback,
                trackClicks,
                trackOpens,
                membersTrackSources,
                paidMembersEnabled
            });

            for (const column of removeableColumns) {
                for (const row of mapped) {
                    delete row[column];
                }
            }
        }

        return mapped;
    }

    /**
     * Convert a post model into a plain object for export.
     *
     * @private
     * @param {*} post
     * @param {Array} newsletters
     * @param {Array} labels
     * @param {Array} tiers
     * @param {boolean} membersEnabled
     * @param {boolean} membersTrackSources
     * @param {boolean} paidMembersEnabled
     * @param {boolean} trackOpens
     * @param {boolean} trackClicks
     * @param {boolean} hasNewslettersWithFeedback
     * @returns {Object}
     */
    _mapPostToRow(
        post,
        newsletters,
        labels,
        tiers,
        membersEnabled,
        membersTrackSources,
        paidMembersEnabled,
        trackOpens,
        trackClicks,
        hasNewslettersWithFeedback
    ) {
        let email = post.related('email');

        if (!this._isValidEmail(email)) {
            email = null;
        }

        const isDraftOrScheduled = this._isDraftOrScheduled(post.get('status'));
        if (isDraftOrScheduled) {
            email = null;
        }

        const published = !isDraftOrScheduled;
        const feedbackEnabled = email && email.get('feedback_enabled') && hasNewslettersWithFeedback;
        const showEmailClickAnalytics = trackClicks && email && email.get('track_clicks');

        const row = {
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
            email_recipients: email ? this.humanReadableEmailRecipientFilter(email.get('recipient_filter'), labels, tiers) : null,
            newsletter_name: this._resolveNewsletterName(newsletters, post, email),
            sends: email ? email.get('email_count') : null,
            opens: trackOpens && email ? email.get('opened_count') : null,
            clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
            signups: membersTrackSources && published ? (post.get('count__signups') ?? 0) : null,
            paid_conversions: membersTrackSources && paidMembersEnabled && published ? (post.get('count__paid_conversions') ?? 0) : null,
            feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
            feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
        };

        return row;
    }

    /**
     * Determine the newsletter name for a post when applicable.
     *
     * @private
     * @param {Array} newsletters
     * @param {*} post
     * @param {*} email
     * @returns {string|null}
     */
    _resolveNewsletterName(newsletters, post, email) {
        if (newsletters.length <= 1) {
            return null;
        }
        if (!post.get('newsletter_id') || !email) {
            return null;
        }
        const newsletter = newsletters.find(nl => nl.get('id') === post.get('newsletter_id'));
        return newsletter ? newsletter.get('name') : null;
    }

    /**
     * Compute which columns should be removed based on settings.
     *
     * @private
     * @param {Object} params
     * @param {Array} params.newsletters
     * @param {boolean} params.membersEnabled
     * @param {boolean} params.hasNewslettersWithFeedback
     * @param {boolean} params.trackClicks
     * @param {boolean} params.trackOpens
     * @param {boolean} params.membersTrackSources
     * @param {boolean} params.paidMembersEnabled
     * @returns {Array<string>}
     */
    _computeRemoveableColumns({
        newsletters,
        membersEnabled,
        hasNewslettersWithFeedback,
        trackClicks,
        trackOpens,
        membersTrackSources,
        paidMembersEnabled
    }) {
        const columns = [];

        if (newsletters.length <= 1) {
            columns.push('newsletter_name');
        }

        if (!membersEnabled) {
            columns.push('email_recipients', 'sends', 'opens', 'clicks', 'feedback_more_like_this', 'feedback_less_like_this');
        } else if (!hasNewslettersWithFeedback) {
            columns.push('feedback_more_like_this', 'feedback_less_like_this');
        }

        if (membersEnabled && !trackClicks) {
            columns.push('clicks');
        }

        if (membersEnabled && !trackOpens) {
            columns.push('opens');
        }

        if (!membersTrackSources || !membersEnabled) {
            columns.push('signups', 'paid_conversions');
        } else if (!paidMembersEnabled) {
            columns.push('paid_conversions');
        }

        return columns;
    }

    /**
     * @private
     * @param {*} email
     * @returns {boolean}
     */
    _isValidEmail(email) {
        return email && email.id;
    }

    /**
     * @private
     * @param {string} status
     * @returns {boolean}
     */
    _isDraftOrScheduled(status) {
        return status === 'draft' || status === 'scheduled';
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
            if (hasEmail) {
                return 'published and emailed';
            }
            return 'published only';
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
     * Convert a parsed NQL filter to a list of human readable strings.
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
            if (key === 'label') {
                this._processLabelFilter(filter, allLabels, strings);
            } else if (key === 'tier') {
                this._processTierFilter(filter, allTiers, strings);
            } else if (key === 'status') {
                this._processStatusFilter(filter, strings);
            }
        }

        return strings;
    }

    /**
     * @private
     */
    _processLabelFilter(filter, allLabels, strings) {
        if (typeof filter.label !== 'string') {
            return;
        }
        const labelSlug = filter.label;
        const label = allLabels.find(l => l.get('slug') === labelSlug);
        strings.push(label ? label.get('name') : labelSlug);
    }

    /**
     * @private
     */
    _processTierFilter(filter, allTiers, strings) {
        if (typeof filter.tier !== 'string') {
            return;
        }
        const tierSlug = filter.tier;
        const tier = allTiers.find(t => t.get('slug') === tierSlug);
        strings.push(tier ? tier.get('name') : tierSlug);
    }

    /**
     * @private
     */
    _processStatusFilter(filter, strings) {
        if (typeof filter.status === 'string') {
            if (filter.status === 'free') {
                strings.push('Free subscribers');
            } else if (filter.status === 'paid') {
                strings.push('Paid subscribers');
            } else if (filter.status === 'comped') {
                strings.push('Complimentary subscribers');
            }
        } else if (filter.status && filter.status.$ne) {
            if (filter.status.$ne === 'free') {
                strings.push('Paid subscribers');
            }
            if (filter.status.$ne === 'paid') {
                strings.push('Free subscribers');
            }
        }
    }
}

module.exports = PostsExporter;