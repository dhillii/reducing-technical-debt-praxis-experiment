```javascript
const nql = require('@tryghost/nql');
const logging = require('@tryghost/logging');

class PostsExporter {
    #models;
    #getPostUrl;
    #settingsCache;
    #settingsHelpers;

    constructor({models, getPostUrl, settingsCache, settingsHelpers}) {
        this.#models = models;
        this.#getPostUrl = getPostUrl;
        this.#settingsCache = settingsCache;
        this.#settingsHelpers = settingsHelpers;
    }

    /**
     * Export posts with related data and apply column filtering based on settings
     * @param {object} options
     * @param {string} [options.filter]
     * @param {string} [options.order]
     * @param {string|number} [options.limit]
     * @returns {Promise<Array>}
     */
    async export({filter, order, limit}) {
        const [posts, newsletters, labels, tiers] = await Promise.all([
            this.#models.Post.findPage({
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
            }),
            this.#models.Newsletter.findAll(),
            this.#models.Label.findAll(),
            this.#models.Product.findAll()
        ]);

        const newslettersModels = newsletters.models;
        const labelsModels = labels.models;
        const tiersModels = tiers.models;
        const settings = this.#getSettings(newslettersModels);
        const mappedPosts = posts.data.map(post => this.#mapPost(post, newslettersModels, labelsModels, tiersModels, settings));

        const columnsToRemove = this.#determineColumnRemovals(newslettersModels, settings);
        this.#removeColumns(mappedPosts, columnsToRemove);

        return mappedPosts;
    }

    /**
     * Extract configuration settings from helpers and cache
     * @param {Array} newslettersModels
     * @returns {Object}
     */
    #getSettings(newslettersModels) {
        const membersEnabled = this.#settingsHelpers.isMembersEnabled();
        const membersTrackSources = membersEnabled && this.#settingsCache.get('members_track_sources');
        const paidMembersEnabled = membersEnabled && this.#settingsHelpers.arePaidMembersEnabled();
        const trackOpens = this.#settingsCache.get('email_track_opens');
        const trackClicks = this.#settingsCache.get('email_track_clicks');
        const hasNewslettersWithFeedback = this.#hasNewslettersWithFeedback(newslettersModels);

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
     * Check if any newsletter has feedback enabled
     * @param {Array} newslettersModels
     * @returns {boolean}
     */
    #hasNewslettersWithFeedback(newslettersModels) {
        return newslettersModels.some(newsletter => newsletter.get('feedback_enabled'));
    }

    /**
     * Map a single post to export format
     * @param {Object} post
     * @param {Array} newslettersModels
     * @param {Array} labelsModels
     * @param {Array} tiersModels
     * @param {Object} settings
     * @returns {Object}
     */
    #mapPost(post, newslettersModels, labelsModels, tiersModels, settings) {
        const email = post.related('email');
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
            email_recipients: email ? this.humanReadableEmailRecipientFilter(email?.get('recipient_filter'), labelsModels, tiersModels) : null,
            newsletter_name: this.#getNewsletterName(post, newslettersModels, email),
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
     * Check if post is published (not draft or scheduled)
     * @param {Object} post
     * @returns {boolean}
     */
    #isPostPublished(post) {
        return post.get('status') !== 'draft' && post.get('status') !== 'scheduled';
    }

    /**
     * Get newsletter name for a post if applicable
     * @param {Object} post
     * @param {Array} newslettersModels
     * @param {Object} email
     * @returns {string|null}
     */
    #getNewsletterName(post, newslettersModels, email) {
        if (newslettersModels.length > 1 && post.get('newsletter_id') && email) {
            const newsletter = newslettersModels.find(newsletter => newsletter.get('id') === post.get('newsletter_id'));
            return newsletter?.get('name') || null;
        }
        return null;
    }

    /**
     * Determine which columns should be removed based on settings
     * @param {Array} newslettersModels
     * @param {Object} settings
     * @returns {Array}
     */
    #determineColumnRemovals(newslettersModels, settings) {
        const columnsToRemove = [];

        if (newslettersModels.length <= 1) {
            columnsToRemove.push('newsletter_name');
        }

        if (!settings.membersEnabled) {
            columnsToRemove.push('email_recipients', 'sends', 'opens', 'clicks', 'feedback_more_like_this', 'feedback_less_like_this');
        } else if (!settings.hasNewslettersWithFeedback) {
            columnsToRemove.push('feedback_more_like_this', 'feedback_less_like_this');
        }

        if (settings.membersEnabled && !settings.trackClicks) {
            columnsToRemove.push('clicks');
        }

        if (settings.membersEnabled && !settings.trackOpens) {
            columnsToRemove.push('opens');
        }

        if (!settings.membersTrackSources || !settings.membersEnabled) {
            columnsToRemove.push('signups', 'paid_conversions');
        } else if (!settings.paidMembersEnabled) {
            columnsToRemove.push('paid_conversions');
        }

        return columnsToRemove;
    }

    /**
     * Remove specified columns from all posts
     * @param {Array} posts
     * @param {Array} columnsToRemove
     */
    #removeColumns(posts, columnsToRemove) {
        if (columnsToRemove.length === 0) {
            return;
        }

        for (const column of columnsToRemove) {
            for (const post of posts) {
                delete post[column];
            }
        }
    }

    /**
     * Map post status to export-friendly string
     * @param {string} status
     * @param {boolean} hasEmail
     * @returns {string}
     */
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

    /**
     * Convert post visibility to human-readable string
     * @param {Object} post
     * @returns {string}
     */
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
     * Convert email recipient filter to human-readable string
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
     * Convert parsed NQL filter to human-readable strings
     * @param {*} filter
     * @param {*} allLabels
     * @param {*} allTiers
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
```