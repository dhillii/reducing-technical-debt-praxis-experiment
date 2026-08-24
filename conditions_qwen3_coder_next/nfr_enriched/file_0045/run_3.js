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
            const email = this.#normalizeEmail(post.related('email'));
            const isPublished = this.#isPublishedPost(post);
            if (!isPublished) {
                return this.#mapUnpublishedPost(post);
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
                published_at: post.get('published_at'),
                featured: post.get('featured'),
                tags: post.related('tags').map(tag => tag.get('name')).join(', '),
                post_access: this.postAccessToString(post),
                email_recipients: email ? this.humanReadableEmailRecipientFilter(email.get('recipient_filter'), labels, tiers) : null,
                newsletter_name: newsletters.length > 1 && post.get('newsletter_id') && email ? newsletters.find(newsletter => newsletter.get('id') === post.get('newsletter_id'))?.get('name') : null,
                sends: email?.get('email_count') ?? null,
                opens: trackOpens ? (email?.get('opened_count') ?? null) : null,
                clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
                signups: membersTrackSources && published ? (post.get('count__signups') ?? 0) : null,
                paid_conversions: membersTrackSources && paidMembersEnabled && published ? (post.get('count__paid_conversions') ?? 0) : null,
                feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
                feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
            };
        });

        if (mapped.length) {
            const removeableColumns = this.#getRemoveableColumns(newsletters, membersEnabled, hasNewslettersWithFeedback, trackClicks, trackOpens, membersTrackSources, paidMembersEnabled);
            this.#removeColumns(mapped, removeableColumns);
        }

        return mapped;
    }

    #normalizeEmail(email) {
        if (!email || !email.id) {
            return null;
        }
        return email;
    }

    #isPublishedPost(post) {
        return post.get('status') !== 'draft' && post.get('status') !== 'scheduled';
    }

    #mapUnpublishedPost(post) {
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
            newsletter_name: null,
            sends: null,
            opens: null,
            clicks: null,
            signups: null,
            paid_conversions: null,
            feedback_more_like_this: null,
            feedback_less_like_this: null
        };
    }

    #getRemoveableColumns(newsletters, membersEnabled, hasNewslettersWithFeedback, trackClicks, trackOpens, membersTrackSources, paidMembersEnabled) {
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

    #removeColumns(mapped, columns) {
        for (const columnToRemove of columns) {
            for (const row of mapped) {
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
     * @param {*} allTiers All available member tiers
     * @returns {string[]} Array of human-readable filter strings
     */
    filterToString(filter, allLabels, allTiers) {
        const strings = [];

        if (filter.$and) {
            // Not supported
            return strings;
        }

        if (filter.$or) {
            for (const subfilter of filter.$or) {
                strings.push(...this.filterToString(subfilter, allLabels, allTiers));
            }
            return strings;
        }

        for (const key of Object.keys(filter)) {
            this.#processFilterKey(key, filter[key], allLabels, allTiers, strings);
        }

        return strings;
    }

    /**
     * @private Process a single filter key and push corresponding human-readable strings
     * @param {string} key
     * @param {string|Object} value
     * @param {*} allLabels
     * @param {*} allTiers
     * @param {string[]} strings
     */
    #processFilterKey(key, value, allLabels, allTiers, strings) {
        if (key === 'label') {
            this.#processLabelFilter(value, allLabels, strings);
        } else if (key === 'tier') {
            this.#processTierFilter(value, allTiers, strings);
        } else if (key === 'status') {
            this.#processStatusFilter(value, strings);
        }
    }

    /**
     * @private Process label filter value
     * @param {string} value
     * @param {*} allLabels
     * @param {string[]} strings
     */
    #processLabelFilter(value, allLabels, strings) {
        if (typeof value === 'string') {
            const label = allLabels.find(l => l.get('slug') === value);
            strings.push(label ? label.get('name') : value);
        }
    }

    /**
     * @private Process tier filter value
     * @param {string} value
     * @param {*} allTiers
     * @param {string[]} strings
     */
    #processTierFilter(value, allTiers, strings) {
        if (typeof value === 'string') {
            const tier = allTiers.find(l => l.get('slug') === value);
            strings.push(tier ? tier.get('name') : value);
        }
    }

    /**
     * @private Process status filter value
     * @param {string|Object} value
     * @param {string[]} strings
     */
    #processStatusFilter(value, strings) {
        if (typeof value === 'string') {
            if (value === 'free') {
                strings.push('Free subscribers');
            } else if (value === 'paid') {
                strings.push('Paid subscribers');
            } else if (value === 'comped') {
                strings.push('Complimentary subscribers');
            }
        } else {
            if (value.$ne === 'free') {
                strings.push('Paid subscribers');
            }
            if (value.$ne === 'paid') {
                strings.push('Free subscribers');
            }
        }
    }
}

module.exports = PostsExporter;