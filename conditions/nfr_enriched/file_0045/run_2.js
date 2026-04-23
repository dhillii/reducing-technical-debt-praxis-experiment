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

        const settings = this.#buildExportSettings(newsletters);
        const mapped = posts.data.map((post) => this.#mapPostToExportRow(post, newsletters, labels, tiers, settings));

        if (mapped.length) {
            this.#removeUnusedColumns(mapped, newsletters, settings);
        }

        return mapped;
    }

    /**
     * Build settings object for export based on configuration
     * @private
     */
    #buildExportSettings(newsletters) {
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
     * Map a single post to export row format
     * @private
     */
    #mapPostToExportRow(post, newsletters, labels, tiers, settings) {
        const email = this.#getPostEmail(post);
        const published = this.#isPostPublished(post);
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
            newsletter_name: this.#getNewsletterName(post, newsletters, email),
            sends: email?.get('email_count') ?? null,
            opens: settings.trackOpens ? (email?.get('opened_count') ?? null) : null,
            clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
            signups: settings.membersTrackSources && published ? (post.get('count__signups') ?? 0) : null,
            paid_conversions: settings.membersTrackSources && settings.paidMembersEnabled && published ? (post.get('count__paid_conversions') ?? 0) : null,
            feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
            feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
        };
    }

    /**
     * Get email for post, handling bookshelf quirks
     * @private
     */
    #getPostEmail(post) {
        let email = post.related('email');
        if (!email.id) {
            return null;
        }
        return email;
    }

    /**
     * Determine if post is published
     * @private
     */
    #isPostPublished(post) {
        const status = post.get('status');
        return status !== 'draft' && status !== 'scheduled';
    }

    /**
     * Get newsletter name for post if applicable
     * @private
     */
    #getNewsletterName(post, newsletters, email) {
        if (newsletters.length <= 1 || !post.get('newsletter_id') || !email) {
            return null;
        }
        return newsletters.find(newsletter => newsletter.get('id') === post.get('newsletter_id'))?.get('name') ?? null;
    }

    /**
     * Remove columns that are not applicable based on settings
     * @private
     */
    #removeUnusedColumns(mapped, newsletters, settings) {
        const removeableColumns = [];

        if (newsletters.length <= 1) {
            removeableColumns.push('newsletter_name');
        }

        if (!settings.membersEnabled) {
            removeableColumns.push('email_recipients', 'sends', 'opens', 'clicks', 'feedback_more_like_this', 'feedback_less_like_this');
        } else {
            if (!settings.hasNewslettersWithFeedback) {
                removeableColumns.push('feedback_more_like_this', 'feedback_less_like_this');
            }
            if (!settings.trackClicks) {
                removeableColumns.push('clicks');
            }
            if (!settings.trackOpens) {
                removeableColumns.push('opens');
            }
        }

        if (!settings.membersTrackSources || !settings.membersEnabled) {
            removeableColumns.push('signups', 'paid_conversions');
        } else if (!settings.paidMembersEnabled) {
            removeableColumns.push('paid_conversions');
        }

        for (const columnToRemove of removeableColumns) {
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
        // Examples: "label:test"; "label:test,label:batch1"; "status:-free,label:test", "all"
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
                if (key === 'label') {
                    this.#processLabelFilter(filter.label, allLabels, strings);
                }
                if (key === 'tier') {
                    this.#processTierFilter(filter.tier, allTiers, strings);
                }
                if (key === 'status') {
                    this.#processStatusFilter(filter.status, strings);
                }
            }
        }

        return strings;
    }

    /**
     * Process label filter and add to strings
     * @private
     */
    #processLabelFilter(labelFilter, allLabels, strings) {
        if (typeof labelFilter === 'string') {
            const labelSlug = labelFilter;
            const label = allLabels.find(l => l.get('slug') === labelSlug);
            if (label) {
                strings.push(label.get('name'));
            } else {
                strings.push(labelSlug);
            }
        }
    }

    /**
     * Process tier filter and add to strings
     * @private
     */
    #processTierFilter(tierFilter, allTiers, strings) {
        if (typeof tierFilter === 'string') {
            const tierSlug = tierFilter;
            const tier = allTiers.find(l => l.get('slug') === tierSlug);
            if (tier) {
                strings.push(tier.get('name'));
            } else {
                strings.push(tierSlug);
            }
        }
    }

    /**
     * Process status filter and add to strings
     * @private
     */
    #processStatusFilter(statusFilter, strings) {
        if (typeof statusFilter === 'string') {
            if (statusFilter === 'free') {
                strings.push('Free subscribers');
            } else if (statusFilter === 'paid') {
                strings.push('Paid subscribers');
            } else if (statusFilter === 'comped') {
                strings.push('Complimentary subscribers');
            }
        } else {
            if (statusFilter.$ne === 'free') {
                strings.push('Paid subscribers');
            }

            if (statusFilter.$ne === 'paid') {
                strings.push('Free subscribers');
            }
        }
    }
}

module.exports = PostsExporter;