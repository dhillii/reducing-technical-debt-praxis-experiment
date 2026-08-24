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

        const membersEnabled = this.#settingsHelpers.isMembersEnabled();
        const membersTrackSources = membersEnabled && this.#settingsCache.get('members_track_sources');
        const paidMembersEnabled = membersEnabled && this.#settingsHelpers.arePaidMembersEnabled();
        const trackOpens = this.#settingsCache.get('email_track_opens');
        const trackClicks = this.#settingsCache.get('email_track_clicks');
        const hasNewslettersWithFeedback = !!newsletters.find(newsletter => newsletter.get('feedback_enabled'));

        const mapped = posts.data.map((post) => {
            let email = post.related('email');

            if (!this.#isValidEmail(email)) {
                email = null;
            }

            if (!this.#isPublishedPost(post)) {
                email = null;
            }

            if (email?.get('status') !== 'sent') {
                email = null;
            }

            const feedbackEnabled = email?.get('feedback_enabled') && hasNewslettersWithFeedback;
            const showEmailClickAnalytics = trackClicks && email?.get('track_clicks');

            return {
                id: post.get('id'),
                title: post.get('title'),
                url: this.#getPostUrl(post),
                author: post.related('authors').map(author => author.get('name')).join(', '),
                status: this.mapPostStatus(post.get('status'), !!email),
                created_at: post.get('created_at'),
                updated_at: post.get('updated_at'),
                published_at: email ? post.get('published_at') : null,
                featured: post.get('featured'),
                tags: post.related('tags').map(tag => tag.get('name')).join(', '),
                post_access: this.postAccessToString(post),
                email_recipients: email ? this.humanReadableEmailRecipientFilter(email?.get('recipient_filter'), labels, tiers) : null,
                newsletter_name: this.#getNewsletterName(post, newsletters, email),
                sends: email?.get('email_count') ?? null,
                opens: trackOpens ? (email?.get('opened_count') ?? null) : null,
                clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
                signups: membersTrackSources && email ? (post.get('count__signups') ?? 0) : null,
                paid_conversions: membersTrackSources && paidMembersEnabled && email ? (post.get('count__paid_conversions') ?? 0) : null,
                feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
                feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
            };
        });

        if (mapped.length) {
            const removeableColumns = this.#computeRemovableColumns(newsletters, membersEnabled, hasNewslettersWithFeedback, trackClicks, trackOpens, membersTrackSources, paidMembersEnabled);

            for (const columnToRemove of removeableColumns) {
                for (const row of mapped) {
                    delete row[columnToRemove];
                }
            }
        }

        return mapped;
    }

    /**
     * @private Check if email instance has a valid id
     * @param {Object} email
     * @returns {boolean}
     */
    #isValidEmail(email) {
        return email && email.id;
    }

    /**
     * @private Check if post status indicates it's published
     * @param {Object} post
     * @returns {boolean}
     */
    #isPublishedPost(post) {
        return post.get('status') !== 'draft' && post.get('status') !== 'scheduled';
    }

    /**
     * @private Get newsletter name for post if applicable
     * @param {Object} post
     * @param {Array} newsletters
     * @param {Object|null} email
     * @returns {string|null}
     */
    #getNewsletterName(post, newsletters, email) {
        if (newsletters.length <= 1) {
            return null;
        }
        if (!post.get('newsletter_id') || !email) {
            return null;
        }

        return newsletters.find(newsletter => newsletter.get('id') === post.get('newsletter_id'))?.get('name') ?? null;
    }

    /**
     * @private Compute list of columns that can be removed based on settings
     * @param {Array} newsletters
     * @param {boolean} membersEnabled
     * @param {boolean} hasNewslettersWithFeedback
     * @param {boolean} trackClicks
     * @param {boolean} trackOpens
     * @param {boolean} membersTrackSources
     * @param {boolean} paidMembersEnabled
     * @returns {string[]}
     */
    #computeRemovableColumns(newsletters, membersEnabled, hasNewslettersWithFeedback, trackClicks, trackOpens, membersTrackSources, paidMembersEnabled) {
        const removeableColumns = [];

        if (newsletters.length <= 1) {
            removeableColumns.push('newsletter_name');
        }

        if (!membersEnabled) {
            removeableColumns.push('email_recipients', 'sends', 'opens', 'clicks', 'feedback_more_like_this', 'feedback_less_like_this');
        } else if (!hasNewslettersWithFeedback) {
            removeableColumns.push('feedback_more_like_this', 'feedback_less_like_this');
        }

        if (membersEnabled && !trackClicks) {
            removeableColumns.push('clicks');
        }

        if (membersEnabled && !trackOpens) {
            removeableColumns.push('opens');
        }

        if (!membersTrackSources || !membersEnabled) {
            removeableColumns.push('signups', 'paid_conversions');
        } else if (!paidMembersEnabled) {
            removeableColumns.push('paid_conversions');
        }

        return removeableColumns;
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
     * @param {*} allTiers All available member products/tiers
     * @returns {string[]}
     */
    filterToString(filter, allLabels, allTiers) {
        const strings = [];

        if (filter.$and) {
            return strings;
        }

        if (filter.$or) {
            for (const subfilter of filter.$or) {
                strings.push(...this.filterToString(subfilter, allLabels, allTiers));
            }
            return strings;
        }

        for (const key of Object.keys(filter)) {
            if (key === 'label') {
                this.#handleLabelFilter(filter.label, allLabels, strings);
            }
            if (key === 'tier') {
                this.#handleTierFilter(filter.tier, allTiers, strings);
            }
            if (key === 'status') {
                this.#handleStatusFilter(filter.status, strings);
            }
        }

        return strings;
    }

    /**
     * @private Handle label filter key extraction
     * @param {*} labelFilter
     * @param {Array} allLabels
     * @param {string[]} accumulatedStrings
     */
    #handleLabelFilter(labelFilter, allLabels, accumulatedStrings) {
        if (typeof labelFilter === 'string') {
            const label = allLabels.find(l => l.get('slug') === labelFilter);
            if (label) {
                accumulatedStrings.push(label.get('name'));
            } else {
                accumulatedStrings.push(labelFilter);
            }
        }
    }

    /**
     * @private Handle tier filter key extraction
     * @param {*} tierFilter
     * @param {Array} allTiers
     * @param {string[]} accumulatedStrings
     */
    #handleTierFilter(tierFilter, allTiers, accumulatedStrings) {
        if (typeof tierFilter === 'string') {
            const tier = allTiers.find(t => t.get('slug') === tierFilter);
            if (tier) {
                accumulatedStrings.push(tier.get('name'));
            } else {
                accumulatedStrings.push(tierFilter);
            }
        }
    }

    /**
     * @private Handle status filter key extraction
     * @param {*} statusFilter
     * @param {string[]} accumulatedStrings
     */
    #handleStatusFilter(statusFilter, accumulatedStrings) {
        if (typeof statusFilter === 'string') {
            if (statusFilter === 'free') {
                accumulatedStrings.push('Free subscribers');
            } else if (statusFilter === 'paid') {
                accumulatedStrings.push('Paid subscribers');
            } else if (statusFilter === 'comped') {
                accumulatedStrings.push('Complimentary subscribers');
            }
            return;
        }

        if (statusFilter.$ne === 'free') {
            accumulatedStrings.push('Paid subscribers');
        }

        if (statusFilter.$ne === 'paid') {
            accumulatedStrings.push('Free subscribers');
        }
    }
}

module.exports = PostsExporter;