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
     * Export posts with optional filtering, ordering and limiting.
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
        const hasNewslettersWithFeedback = !!newsletters.find(nl => nl.get('feedback_enabled'));

        const mapped = posts.data.map(post => this.#mapPost(
            post,
            newsletters,
            labels,
            tiers,
            {
                membersEnabled,
                membersTrackSources,
                paidMembersEnabled,
                trackOpens,
                trackClicks,
                hasNewslettersWithFeedback
            }
        ));

        if (mapped.length) {
            const columnsToRemove = this.#determineRemovableColumns({
                newsletters,
                membersEnabled,
                trackOpens,
                trackClicks,
                membersTrackSources,
                paidMembersEnabled,
                hasNewslettersWithFeedback
            });

            for (const column of columnsToRemove) {
                for (const row of mapped) {
                    delete row[column];
                }
            }
        }

        return mapped;
    }

    /**
     * Map a single post to the export format.
     *
     * @private
     * @param {Object} post
     * @param {Array<Object>} newsletters
     * @param {Array<Object>} labels
     * @param {Array<Object>} tiers
     * @param {Object} flags
     * @returns {Object}
     */
    #mapPost(post, newsletters, labels, tiers, flags) {
        let email = post.related('email');
        if (!email.id) {
            email = null;
        }

        let published = true;
        if (post.get('status') === 'draft' || post.get('status') === 'scheduled') {
            email = null;
            published = false;
        }

        const feedbackEnabled = email && email.get('feedback_enabled') && flags.hasNewslettersWithFeedback;
        const showEmailClickAnalytics = flags.trackClicks && email && email.get('track_clicks');

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
            email_recipients: email ? this.humanReadableEmailRecipientFilter(email?.get('recipient_filter'), labels, tiers) : null,
            newsletter_name: this.#resolveNewsletterName(post, newsletters, email),
            sends: email?.get('email_count') ?? null,
            opens: flags.trackOpens ? (email?.get('opened_count') ?? null) : null,
            clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
            signups: flags.membersTrackSources && published ? (post.get('count__signups') ?? 0) : null,
            paid_conversions: flags.membersTrackSources && flags.paidMembersEnabled && published ? (post.get('count__paid_conversions') ?? 0) : null,
            feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
            feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
        };
    }

    /**
     * Resolve newsletter name for a post when applicable.
     *
     * @private
     * @param {Object} post
     * @param {Array<Object>} newsletters
     * @param {Object|null} email
     * @returns {string|null}
     */
    #resolveNewsletterName(post, newsletters, email) {
        if (newsletters.length <= 1 || !post.get('newsletter_id') || !email) {
            return null;
        }
        const nl = newsletters.find(n => n.get('id') === post.get('newsletter_id'));
        return nl?.get('name') ?? null;
    }

    /**
     * Determine which columns should be removed based on settings.
     *
     * @private
     * @param {Object} opts
     * @param {Array<Object>} opts.newsletters
     * @param {boolean} opts.membersEnabled
     * @param {boolean} opts.trackOpens
     * @param {boolean} opts.trackClicks
     * @param {boolean} opts.membersTrackSources
     * @param {boolean} opts.paidMembersEnabled
     * @param {boolean} opts.hasNewslettersWithFeedback
     * @returns {Array<string>}
     */
    #determineRemovableColumns(opts) {
        const cols = [];

        if (opts.newsletters.length <= 1) {
            cols.push('newsletter_name');
        }

        if (!opts.membersEnabled) {
            cols.push('email_recipients', 'sends', 'opens', 'clicks', 'feedback_more_like_this', 'feedback_less_like_this');
        } else if (!opts.hasNewslettersWithFeedback) {
            cols.push('feedback_more_like_this', 'feedback_less_like_this');
        }

        if (opts.membersEnabled && !opts.trackClicks) {
            cols.push('clicks');
        }

        if (opts.membersEnabled && !opts.trackOpens) {
            cols.push('opens');
        }

        if (!opts.membersTrackSources || !opts.membersEnabled) {
            cols.push('signups', 'paid_conversions');
        } else if (!opts.paidMembersEnabled) {
            cols.push('paid_conversions');
        }

        return cols;
    }

    mapPostStatus(status, hasEmail) {
        if (status === 'draft') return 'draft';
        if (status === 'scheduled') return 'scheduled';
        if (status === 'sent') return 'emailed only';
        if (status === 'published') {
            return hasEmail ? 'published and emailed' : 'published only';
        }
        return status;
    }

    postAccessToString(post) {
        const visibility = post.get('visibility');
        if (visibility === 'public') return 'Public';
        if (visibility === 'members') return 'Members-only';
        if (visibility === 'paid') return 'Paid members-only';
        if (visibility === 'tiers') {
            const tiers = post.related('tiers');
            if (tiers.length === 0) return 'Specific tiers: none';
            return 'Specific tiers: ' + tiers.map(t => t.get('name')).join(', ');
        }
        return visibility;
    }

    /**
     * Convert an email filter to a human readable string.
     *
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
     * Convert a parsed NQL filter to a human readable string.
     *
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
            for (const sub of filter.$or) {
                strings.push(...this.filterToString(sub, allLabels, allTiers));
            }
        } else {
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
        }

        return strings;
    }
}

module.exports = PostsExporter;
```