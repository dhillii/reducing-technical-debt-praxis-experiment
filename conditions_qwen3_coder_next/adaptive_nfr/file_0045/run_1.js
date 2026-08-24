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

            if (!email.id) {
                email = null;
            }

            if (!this.isPublishedStatus(post.get('status'))) {
                email = null;
                return {
                    id: post.get('id'),
                    title: post.get('title'),
                    url: this.#getPostUrl(post),
                    author: post.related('authors').map(author => author.get('name')).join(', '),
                    status: this.mapPostStatus(post.get('status'), false),
                    created_at: post.get('created_at'),
                    updated_at: post.get('updated_at'),
                    published_at: null,
                    featured: post.get('featured'),
                    tags: post.related('tags').map(tag => tag.get('name')).join(', '),
                    post_access: this.postAccessToString(post),
                    email_recipients: null,
                    newsletter_name: this.getNewsletterName(post, newsletters, null),
                    sends: null,
                    opens: null,
                    clicks: null,
                    signups: null,
                    paid_conversions: null,
                    feedback_more_like_this: null,
                    feedback_less_like_this: null
                };
            }

            if (!email) {
                return this.buildPostResponse(post, null, membersTrackSources, paidMembersEnabled, trackOpens, trackClicks, hasNewslettersWithFeedback, newsletters);
            }

            const feedbackEnabled = this.isFeedbackEnabled(email, hasNewslettersWithFeedback);
            const showEmailClickAnalytics = this.shouldShowClickAnalytics(trackClicks, email);

            return this.buildPostResponse(post, email, membersTrackSources, paidMembersEnabled, trackOpens, trackClicks, hasNewslettersWithFeedback, newsletters, feedbackEnabled, showEmailClickAnalytics);
        });

        if (mapped.length) {
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

            for (const columnToRemove of removeableColumns) {
                for (const row of mapped) {
                    delete row[columnToRemove];
                }
            }
        }

        return mapped;
    }

    /**
     * @param {string} status
     * @returns {boolean}
     */
    isPublishedStatus(status) {
        return status === 'published' || status === 'sent';
    }

    /**
     * @param {Object} email
     * @param {boolean} hasNewslettersWithFeedback
     * @returns {boolean}
     */
    isFeedbackEnabled(email, hasNewslettersWithFeedback) {
        return email.get('feedback_enabled') && hasNewslettersWithFeedback;
    }

    /**
     * @param {boolean} trackClicks
     * @param {Object} email
     * @returns {boolean}
     */
    shouldShowClickAnalytics(trackClicks, email) {
        return trackClicks && email.get('track_clicks');
    }

    /**
     * @param {Object} post
     * @param {Object|null} email
     * @param {boolean} membersTrackSources
     * @param {boolean} paidMembersEnabled
     * @param {boolean} trackOpens
     * @param {boolean} trackClicks
     * @param {boolean} hasNewslettersWithFeedback
     * @param {Object[]} newsletters
     * @param {boolean} [feedbackEnabled=false]
     * @param {boolean} [showEmailClickAnalytics=false]
     * @returns {Object}
     */
    buildPostResponse(
        post,
        email,
        membersTrackSources,
        paidMembersEnabled,
        trackOpens,
        trackClicks,
        hasNewslettersWithFeedback,
        newsletters,
        feedbackEnabled = false,
        showEmailClickAnalytics = false
    ) {
        return {
            id: post.get('id'),
            title: post.get('title'),
            url: this.#getPostUrl(post),
            author: post.related('authors').map(author => author.get('name')).join(', '),
            status: this.mapPostStatus(post.get('status'), !!email),
            created_at: post.get('created_at'),
            updated_at: post.get('updated_at'),
            published_at: post.get('published_at'),
            featured: post.get('featured'),
            tags: post.related('tags').map(tag => tag.get('name')).join(', '),
            post_access: this.postAccessToString(post),
            email_recipients: email ? this.humanReadableEmailRecipientFilter(email.get('recipient_filter'), this, tiers) : null,
            newsletter_name: this.getNewsletterName(post, newsletters, email),
            sends: email.get('email_count') ?? null,
            opens: trackOpens ? (email.get('opened_count') ?? null) : null,
            clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
            signups: membersTrackSources && this.isPublishedStatus(post.get('status')) ? (post.get('count__signups') ?? 0) : null,
            paid_conversions: membersTrackSources && paidMembersEnabled && this.isPublishedStatus(post.get('status')) ? (post.get('count__paid_conversions') ?? 0) : null,
            feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
            feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
        };
    }

    /**
     * @param {Object} post
     * @param {Object[]} newsletters
     * @param {Object|null} email
     * @returns {string|null}
     */
    getNewsletterName(post, newsletters, email) {
        if (newsletters.length <= 1 || !post.get('newsletter_id') || !email) {
            return null;
        }
        const newsletter = newsletters.find(n => n.get('id') === post.get('newsletter_id'));
        return newsletter?.get('name') ?? null;
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
     * @param {*} allTiers All available member tiers
     * @returns {string[]} Array of human-readable strings
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
                this.addLabelString(strings, filter.label, allLabels);
            } else if (key === 'tier') {
                this.addTierString(strings, filter.tier, allTiers);
            } else if (key === 'status') {
                this.addStatusString(strings, filter.status);
            }
        }

        return strings;
    }

    /**
     * @private
     */
    addLabelString(strings, labelSlug, allLabels) {
        if (typeof labelSlug !== 'string') {
            return;
        }
        const label = allLabels.find(l => l.get('slug') === labelSlug);
        if (label) {
            strings.push(label.get('name'));
        } else {
            strings.push(labelSlug);
        }
    }

    /**
     * @private
     */
    addTierString(strings, tierSlug, allTiers) {
        if (typeof tierSlug !== 'string') {
            return;
        }
        const tier = allTiers.find(t => t.get('slug') === tierSlug);
        if (tier) {
            strings.push(tier.get('name'));
        } else {
            strings.push(tierSlug);
        }
    }

    /**
     * @private
     */
    addStatusString(strings, statusFilter) {
        if (typeof statusFilter === 'string') {
            if (statusFilter === 'free') {
                strings.push('Free subscribers');
            } else if (statusFilter === 'paid') {
                strings.push('Paid subscribers');
            } else if (statusFilter === 'comped') {
                strings.push('Complimentary subscribers');
            }
            return;
        }

        if (statusFilter.$ne === 'free') {
            strings.push('Paid subscribers');
        }

        if (statusFilter.$ne === 'paid') {
            strings.push('Free subscribers');
        }
    }
}

module.exports = PostsExporter;