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
        const hasNewslettersWithFeedback = this.#hasNewslettersWithFeedback(newsletters);

        const mapped = posts.data.map(post => this.#mapPost(post, newsletters, labels, tiers, membersTrackSources, paidMembersEnabled, trackOpens, trackClicks, hasNewslettersWithFeedback));

        if (mapped.length) {
            this.#removeUnusedColumns(mapped, newsletters, membersEnabled, hasNewslettersWithFeedback, trackClicks, trackOpens, membersTrackSources, paidMembersEnabled);
        }

        return mapped;
    }

    #hasNewslettersWithFeedback(newsletters) {
        return !!newsletters.find(newsletter => newsletter.get('feedback_enabled'));
    }

    /**
     * @param {Object} post
     * @param {Array} newsletters
     * @param {Array} labels
     * @param {Array} tiers
     * @param {boolean} membersTrackSources
     * @param {boolean} paidMembersEnabled
     * @param {boolean} trackOpens
     * @param {boolean} trackClicks
     * @param {boolean} hasNewslettersWithFeedback
     */
    #mapPost(post, newsletters, labels, tiers, membersTrackSources, paidMembersEnabled, trackOpens, trackClicks, hasNewslettersWithFeedback) {
        let email = post.related('email');

        // Weird bookshelf thing fix
        if (!email.id) {
            email = null;
        }

        let published = true;
        if (post.get('status') === 'draft' || post.get('status') === 'scheduled') {
            // Manually clear it to avoid including information for a post that was reverted to draft
            email = null;
            published = false;
        }

        const feedbackEnabled = email && email.get('feedback_enabled') && hasNewslettersWithFeedback;
        const showEmailClickAnalytics = trackClicks && email && email.get('track_clicks');

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
            email_recipients: email ? this.humanReadableEmailRecipientFilter(email.get('recipient_filter'), labels, tiers) : null,
            newsletter_name: this.#getNewsletterName(newsletters, post, email),
            sends: email?.get('email_count') ?? null,
            opens: trackOpens ? (email?.get('opened_count') ?? null) : null,
            clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
            signups: membersTrackSources && published ? (post.get('count__signups') ?? 0) : null,
            paid_conversions: membersTrackSources && paidMembersEnabled && published ? (post.get('count__paid_conversions') ?? 0) : null,
            feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
            feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
        };
    }

    #getNewsletterName(newsletters, post, email) {
        if (newsletters.length <= 1 || !post.get('newsletter_id') || !email) {
            return null;
        }
        const newsletter = newsletters.find(n => n.get('id') === post.get('newsletter_id'));
        return newsletter?.get('name') ?? null;
    }

    /**
     * Remove columns that are not relevant based on current configuration and settings
     * @param {Array} mappedPosts
     * @param {Array} newsletters
     * @param {boolean} membersEnabled
     * @param {boolean} hasNewslettersWithFeedback
     * @param {boolean} trackClicks
     * @param {boolean} trackOpens
     * @param {boolean} membersTrackSources
     * @param {boolean} paidMembersEnabled
     */
    #removeUnusedColumns(mappedPosts, newsletters, membersEnabled, hasNewslettersWithFeedback, trackClicks, trackOpens, membersTrackSources, paidMembersEnabled) {
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
            for (const row of mappedPosts) {
                delete row[columnToRemove];
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
     * @param {*} allTiers All available product tiers
     * @returns {Array}
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
                strings.push(...this.#parseFilterKey(key, filter[key], allLabels, allTiers));
            }
        }

        return strings;
    }

    /**
     * @private Convert a single filter key to human readable strings
     * @param {string} key
     * @param {string|Object} value
     * @param {*} allLabels
     * @param {*} allTiers
     * @returns {Array}
     */
    #parseFilterKey(key, value, allLabels, allTiers) {
        const strings = [];

        if (key === 'label') {
            strings.push(this.#getLabelName(value, allLabels));
        } else if (key === 'tier') {
            strings.push(this.#getTierName(value, allTiers));
        } else if (key === 'status') {
            strings.push(...this.#parseStatusFilter(value));
        }

        return strings;
    }

    /**
     * @private Get label display name from filter value
     * @param {string} value
     * @param {*} allLabels
     * @returns {string}
     */
    #getLabelName(value, allLabels) {
        const slug = typeof value === 'string' ? value : null;
        if (!slug) {
            return '';
        }
        const label = allLabels.find(l => l.get('slug') === slug);
        return label ? label.get('name') : slug;
    }

    /**
     * @private Get tier display name from filter value
     * @param {string} value
     * @param {*} allTiers
     * @returns {string}
     */
    #getTierName(value, allTiers) {
        const slug = typeof value === 'string' ? value : null;
        if (!slug) {
            return '';
        }
        const tier = allTiers.find(t => t.get('slug') === slug);
        return tier ? tier.get('name') : slug;
    }

    /**
     * @private Parse status filter into human readable strings
     * @param {string|string[]} value
     * @returns {string[]}
     */
    #parseStatusFilter(value) {
        const strings = [];

        if (typeof value === 'string') {
            if (value === 'free') {
                strings.push('Free subscribers');
            } else if (value === 'paid') {
                strings.push('Paid subscribers');
            } else if (value === 'comped') {
                strings.push('Complimentary subscribers');
            }
        } else if (value.$ne === 'free') {
            strings.push('Paid subscribers');
        } else if (value.$ne === 'paid') {
            strings.push('Free subscribers');
        }

        return strings;
    }
}

module.exports = PostsExporter;