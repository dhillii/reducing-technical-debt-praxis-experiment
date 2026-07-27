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

        const flags = {
            membersEnabled,
            membersTrackSources,
            paidMembersEnabled,
            trackOpens,
            trackClicks,
            hasNewslettersWithFeedback
        };

        const mapped = posts.data.map(post => this.#mapPost(post, newsletters, labels, tiers, flags));

        if (mapped.length) {
            const columnsToRemove = this.#determineRemovableColumns({
                newsletters,
                membersEnabled,
                membersTrackSources,
                paidMembersEnabled,
                trackClicks,
                trackOpens,
                hasNewslettersWithFeedback
            });
            this.#removeColumns(mapped, columnsToRemove);
        }

        return mapped;
    }

    /**
     * Map a single post to the export format.
     *
     * @private
     * @param {*} post
     * @param {Array} newsletters
     * @param {Array} labels
     * @param {Array} tiers
     * @param {Object} flags
     * @returns {Object}
     */
    #mapPost(post, newsletters, labels, tiers, flags) {
        let email = post.related('email');
        if (!email.id) {
            email = null;
        }

        const status = post.get('status');
        let published = true;
        if (status === 'draft' || status === 'scheduled') {
            email = null;
            published = false;
        }

        const feedbackEnabled = email && email.get('feedback_enabled') && flags.hasNewslettersWithFeedback;
        const showEmailClickAnalytics = flags.trackClicks && email && email.get('track_clicks');

        const result = {
            id: post.get('id'),
            title: post.get('title'),
            url: this.#getPostUrl(post),
            author: post.related('authors').map(author => author.get('name')).join(', '),
            status: this.mapPostStatus(status, !!email),
            created_at: post.get('created_at'),
            updated_at: post.get('updated_at'),
            published_at: published ? post.get('published_at') : null,
            featured: post.get('featured'),
            tags: post.related('tags').map(tag => tag.get('name')).join(', '),
            post_access: this.postAccessToString(post),
            email_recipients: email ? this.humanReadableEmailRecipientFilter(email.get('recipient_filter'), labels, tiers) : null,
            newsletter_name: null,
            sends: null,
            opens: null,
            clicks: null,
            signups: null,
            paid_conversions: null,
            feedback_more_like_this: null,
            feedback_less_like_this: null
        };

        if (newsletters.length > 1 && post.get('newsletter_id') && email) {
            const nl = newsletters.find(newsletter => newsletter.get('id') === post.get('newsletter_id'));
            result.newsletter_name = nl ? nl.get('name') : null;
        }

        if (email) {
            result.sends = email.get('email_count') ?? null;
        }

        if (flags.trackOpens && email) {
            result.opens = email.get('opened_count') ?? null;
        }

        if (showEmailClickAnalytics) {
            result.clicks = post.get('count__clicks') ?? 0;
        }

        if (flags.membersTrackSources && published) {
            result.signups = post.get('count__signups') ?? 0;
        }

        if (flags.membersTrackSources && flags.paidMembersEnabled && published) {
            result.paid_conversions = post.get('count__paid_conversions') ?? 0;
        }

        if (feedbackEnabled) {
            result.feedback_more_like_this = post.get('count__positive_feedback') ?? 0;
            result.feedback_less_like_this = post.get('count__negative_feedback') ?? 0;
        }

        return result;
    }

    /**
     * Determine which columns should be removed based on settings.
     *
     * @private
     * @param {Object} params
     * @param {Array} params.newsletters
     * @param {boolean} params.membersEnabled
     * @param {boolean} params.membersTrackSources
     * @param {boolean} params.paidMembersEnabled
     * @param {boolean} params.trackClicks
     * @param {boolean} params.trackOpens
     * @param {boolean} params.hasNewslettersWithFeedback
     * @returns {Array<string>}
     */
    #determineRemovableColumns({newsletters, membersEnabled, membersTrackSources, paidMembersEnabled, trackClicks, trackOpens, hasNewslettersWithFeedback}) {
        const columns = [];

        if (newsletters.length <= 1) {
            columns.push('newsletter_name');
        }

        if (!membersEnabled) {
            columns.push('email_recipients', 'sends', 'opens', 'clicks', 'feedback_more_like_this', 'feedback_less_like_this');
            return columns;
        }

        if (!hasNewslettersWithFeedback) {
            columns.push('feedback_more_like_this', 'feedback_less_like_this');
        }

        if (!trackClicks) {
            columns.push('clicks');
        }

        if (!trackOpens) {
            columns.push('opens');
        }

        if (!membersTrackSources) {
            columns.push('signups', 'paid_conversions');
        } else if (!paidMembersEnabled) {
            columns.push('paid_conversions');
        }

        return columns;
    }

    /**
     * Remove specified columns from each row.
     *
     * @private
     * @param {Array<Object>} rows
     * @param {Array<string>} columns
     */
    #removeColumns(rows, columns) {
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
     * @returns {string}
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
     * @param {*} allTiers All available member tiers
     * @returns {Array<string>}
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