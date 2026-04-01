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
            return this.#mapPostToExportRow(post, newsletters, labels, tiers, membersEnabled, membersTrackSources, paidMembersEnabled, trackOpens, trackClicks, hasNewslettersWithFeedback);
        });

        if (mapped.length) {
            this.#removeUnusedColumns(mapped, newsletters, membersEnabled, hasNewslettersWithFeedback, trackClicks, trackOpens, membersTrackSources, paidMembersEnabled);
        }

        return mapped;
    }

    /**
     * @private Map a post to an export row
     */
    #mapPostToExportRow(post, newsletters, labels, tiers, membersEnabled, membersTrackSources, paidMembersEnabled, trackOpens, trackClicks, hasNewslettersWithFeedback) {
        let email = post.related('email');

        if (!email.id) {
            email = null;
        }

        const {email: cleanedEmail, published} = this.#cleanEmailForStatus(post, email);
        email = cleanedEmail;

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
            email_recipients: email ? this.humanReadableEmailRecipientFilter(email?.get('recipient_filter'), labels, tiers) : null,
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

    /**
     * @private Clean email based on post status
     */
    #cleanEmailForStatus(post, email) {
        const isDraftOrScheduled = post.get('status') === 'draft' || post.get('status') === 'scheduled';
        
        if (isDraftOrScheduled) {
            return {email: null, published: false};
        }

        return {email, published: true};
    }

    /**
     * @private Get newsletter name if applicable
     */
    #getNewsletterName(newsletters, post, email) {
        const hasMultipleNewsletters = newsletters.length > 1;
        const hasNewsletterAssignment = post.get('newsletter_id') && email;

        if (!hasMultipleNewsletters || !hasNewsletterAssignment) {
            return null;
        }

        return newsletters.find(newsletter => newsletter.get('id') === post.get('newsletter_id'))?.get('name') ?? null;
    }

    /**
     * @private Remove unused columns from mapped data
     */
    #removeUnusedColumns(mapped, newsletters, membersEnabled, hasNewslettersWithFeedback, trackClicks, trackOpens, membersTrackSources, paidMembersEnabled) {
        const removeableColumns = this.#determineRemoveableColumns(newsletters, membersEnabled, hasNewslettersWithFeedback, trackClicks, trackOpens, membersTrackSources, paidMembersEnabled);

        for (const columnToRemove of removeableColumns) {
            for (const row of mapped) {
                delete row[columnToRemove];
            }
        }
    }

    /**
     * @private Determine which columns should be removed
     */
    #determineRemoveableColumns(newsletters, membersEnabled, hasNewslettersWithFeedback, trackClicks, trackOpens, membersTrackSources, paidMembersEnabled) {
        const removeableColumns = [];

        if (newsletters.length <= 1) {
            removeableColumns.push('newsletter_name');
        }

        if (!membersEnabled) {
            removeableColumns.push('email_recipients', 'sends', 'opens', 'clicks', 'feedback_more_like_this', 'feedback_less_like_this');
            return removeableColumns;
        }

        if (!hasNewslettersWithFeedback) {
            removeableColumns.push('feedback_more_like_this', 'feedback_less_like_this');
        }

        if (!trackClicks) {
            removeableColumns.push('clicks');
        }

        if (!trackOpens) {
            removeableColumns.push('opens');
        }

        if (!membersTrackSources) {
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
            return this.#formatTierAccess(post.related('tiers'));
        }

        return visibility;
    }

    /**
     * @private Format tier access string
     */
    #formatTierAccess(tiers) {
        if (tiers.length === 0) {
            return 'Specific tiers: none';
        }

        return 'Specific tiers: ' + tiers.map(tier => tier.get('name')).join(', ');
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
     * @returns
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
            this.#processFilterKey(key, filter, allLabels, allTiers, strings);
        }

        return strings;
    }

    /**
     * @private Process a single filter key
     */
    #processFilterKey(key, filter, allLabels, allTiers, strings) {
        if (key === 'label') {
            this.#processLabelFilter(filter.label, allLabels, strings);
        } else if (key === 'tier') {
            this.#processTierFilter(filter.tier, allTiers, strings);
        } else if (key === 'status') {
            this.#processStatusFilter(filter.status, strings);
        }
    }

    /**
     * @private Process label filter
     */
    #processLabelFilter(labelValue, allLabels, strings) {
        if (typeof labelValue !== 'string') {
            return;
        }

        const label = allLabels.find(l => l.get('slug') === labelValue);
        strings.push(label ? label.get('name') : labelValue);
    }

    /**
     * @private Process tier filter
     */
    #processTierFilter(tierValue, allTiers, strings) {
        if (typeof tierValue !== 'string') {
            return;
        }

        const tier = allTiers.find(t => t.get('slug') === tierValue);
        strings.push(tier ? tier.get('name') : tierValue);
    }

    /**
     * @private Process status filter
     */
    #processStatusFilter(statusValue, strings) {
        if (typeof statusValue === 'string') {
            this.#processStatusString(statusValue, strings);
        } else {
            this.#processStatusObject(statusValue, strings);
        }
    }

    /**
     * @private Process string status value
     */
    #processStatusString(status, strings) {
        if (status === 'free') {
            strings.push('Free subscribers');
        } else if (status === 'paid') {
            strings.push('Paid subscribers');
        } else if (status === 'comped') {
            strings.push('Complimentary subscribers');
        }
    }

    /**
     * @private Process object status value
     */
    #processStatusObject(statusObj, strings) {
        if (statusObj.$ne === 'free') {
            strings.push('Paid subscribers');
        }

        if (statusObj.$ne === 'paid') {
            strings.push('Free subscribers');
        }
    }
}

module.exports = PostsExporter;
```