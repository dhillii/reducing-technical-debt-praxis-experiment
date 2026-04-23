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
        const posts = await this.fetchPosts(filter, order, limit);
        const newsletters = await this.fetchNewsletters();
        const labels = await this.fetchLabels();
        const tiers = await this.fetchTiers();

        const settings = this.getSettings();
        const mappedPosts = this.mapPosts(posts, newsletters, labels, tiers, settings);

        return this.removeUnusedColumns(mappedPosts, settings, newsletters);
    }

    async fetchPosts(filter, order, limit) {
        return await this.#models.Post.findPage({
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
    }

    async fetchNewsletters() {
        return (await this.#models.Newsletter.findAll()).models;
    }

    async fetchLabels() {
        return (await this.#models.Label.findAll()).models;
    }

    async fetchTiers() {
        return (await this.#models.Product.findAll()).models;
    }

    getSettings() {
        return {
            membersEnabled: this.#settingsHelpers.isMembersEnabled(),
            membersTrackSources: this.#settingsHelpers.isMembersEnabled() && this.#settingsCache.get('members_track_sources'),
            paidMembersEnabled: this.#settingsHelpers.isMembersEnabled() && this.#settingsHelpers.arePaidMembersEnabled(),
            trackOpens: this.#settingsCache.get('email_track_opens'),
            trackClicks: this.#settingsCache.get('email_track_clicks'),
        };
    }

    mapPosts(posts, newsletters, labels, tiers, settings) {
        return posts.data.map((post) => {
            const email = this.getEmail(post);
            const published = this.isPostPublished(post);
            const feedbackEnabled = this.isFeedbackEnabled(email, newsletters);
            const showEmailClickAnalytics = this.shouldShowEmailClickAnalytics(settings, email);

            return {
                id: post.get('id'),
                title: post.get('title'),
                url: this.#getPostUrl(post),
                author: this.getAuthor(post),
                status: this.mapPostStatus(post.get('status'), !!email),
                created_at: post.get('created_at'),
                updated_at: post.get('updated_at'),
                published_at: published ? post.get('published_at') : null,
                featured: post.get('featured'),
                tags: this.getTags(post),
                post_access: this.postAccessToString(post),
                email_recipients: email ? this.humanReadableEmailRecipientFilter(email.get('recipient_filter'), labels, tiers) : null,
                newsletter_name: this.getNewsletterName(post, newsletters, email),
                sends: email?.get('email_count') ?? null,
                opens: settings.trackOpens ? (email?.get('opened_count') ?? null) : null,
                clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
                signups: settings.membersTrackSources && published ? (post.get('count__signups') ?? 0) : null,
                paid_conversions: settings.membersTrackSources && settings.paidMembersEnabled && published ? (post.get('count__paid_conversions') ?? 0) : null,
                feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
                feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
            };
        });
    }

    getEmail(post) {
        let email = post.related('email');
        if (!email.id) {
            email = null;
        }
        return email;
    }

    isPostPublished(post) {
        if (post.get('status') === 'draft' || post.get('status') === 'scheduled') {
            return false;
        }
        return true;
    }

    isFeedbackEnabled(email, newsletters) {
        return email && email.get('feedback_enabled') && !!newsletters.find(newsletter => newsletter.get('feedback_enabled'));
    }

    shouldShowEmailClickAnalytics(settings, email) {
        return settings.trackClicks && email && email.get('track_clicks');
    }

    getAuthor(post) {
        return post.related('authors').map(author => author.get('name')).join(', ');
    }

    getTags(post) {
        return post.related('tags').map(tag => tag.get('name')).join(', ');
    }

    getNewsletterName(post, newsletters, email) {
        if (newsletters.length > 1 && post.get('newsletter_id') && email) {
            return newsletters.find(newsletter => newsletter.get('id') === post.get('newsletter_id'))?.get('name');
        }
        return null;
    }

    removeUnusedColumns(mappedPosts, settings, newsletters) {
        if (mappedPosts.length) {
            const removeableColumns = this.getRemoveableColumns(settings, newsletters);
            for (const columnToRemove of removeableColumns) {
                for (const row of mappedPosts) {
                    delete row[columnToRemove];
                }
            }
        }
        return mappedPosts;
    }

    getRemoveableColumns(settings, newsletters) {
        const removeableColumns = [];

        if (newsletters.length <= 1) {
            removeableColumns.push('newsletter_name');
        }

        if (!settings.membersEnabled) {
            removeableColumns.push('email_recipients', 'sends', 'opens', 'clicks', 'feedback_more_like_this', 'feedback_less_like_this');
        } else if (!this.hasNewslettersWithFeedback(newsletters)) {
            removeableColumns.push('feedback_more_like_this', 'feedback_less_like_this');
        }

        if (settings.membersEnabled && !settings.trackClicks) {
            removeableColumns.push('clicks');
        }

        if (settings.membersEnabled && !settings.trackOpens) {
            removeableColumns.push('opens');
        }

        if (!settings.membersTrackSources || !settings.membersEnabled) {
            removeableColumns.push('signups', 'paid_conversions');
        } else if (!settings.paidMembersEnabled) {
            removeableColumns.push('paid_conversions');
        }

        return removeableColumns;
    }

    hasNewslettersWithFeedback(newsletters) {
        return !!newsletters.find(newsletter => newsletter.get('feedback_enabled'));
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
                    if (typeof filter.label === 'string') {
                        const labelSlug = filter.label;
                        const label = allLabels.find(l => l.get('slug') === labelSlug);
                        if (label) {
                            strings.push(label.get('name'));
                        } else {
                            strings.push(labelSlug);
                        }
                    }
                }
                if (key === 'tier') {
                    if (typeof filter.tier === 'string') {
                        const tierSlug = filter.tier;
                        const tier = allTiers.find(l => l.get('slug') === tierSlug);
                        if (tier) {
                            strings.push(tier.get('name'));
                        } else {
                            strings.push(tierSlug);
                        }
                    }
                }
                if (key === 'status') {
                    if (typeof filter.status === 'string') {
                        if (filter.status === 'free') {
                            strings.push('Free subscribers');
                        } else if (filter.status === 'paid') {
                            strings.push('Paid subscribers');
                        } else if (filter.status === 'comped') {
                            strings.push('Complimentary subscribers');
                        }
                    } else {
                        if (filter.status.$ne === 'free') {
                            strings.push('Paid subscribers');
                        }

                        if (filter.status.$ne === 'paid') {
                            strings.push('Free subscribers');
                        }
                    }
                }
            }
        }

        return strings;
    }
}

module.exports = PostsExporter;