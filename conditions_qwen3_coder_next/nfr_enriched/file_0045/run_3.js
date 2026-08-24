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

        const mapped = posts.data.map((post) => {
            const email = this.#getValidEmail(post);
            const published = this.#isPostPublished(post, email);
            const feedbackEnabled = this.#isFeedbackEnabled(email, hasNewslettersWithFeedback);
            const showEmailClickAnalytics = this.#shouldShowClickAnalytics(trackClicks, email);
            const isMembersTrackSources = membersTrackSources && published;

            return {
                id: post.get('id'),
                title: post.get('title'),
                url: this.#getPostUrl(post),
                author: this.#concatenateAuthors(post),
                status: this.mapPostStatus(post.get('status'), !!email),
                created_at: post.get('created_at'),
                updated_at: post.get('updated_at'),
                published_at: published ? post.get('published_at') : null,
                featured: post.get('featured'),
                tags: this.#concatenateTags(post),
                post_access: this.postAccessToString(post),
                email_recipients: email ? this.humanReadableEmailRecipientFilter(email.get('recipient_filter'), labels, tiers) : null,
                newsletter_name: this.#getNewsletterName(newsletters, post, email),
                sends: email?.get('email_count') ?? null,
                opens: trackOpens ? (email?.get('opened_count') ?? null) : null,
                clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
                signups: isMembersTrackSources ? (post.get('count__signups') ?? 0) : null,
                paid_conversions: isMembersTrackSources && paidMembersEnabled ? (post.get('count__paid_conversions') ?? 0) : null,
                feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
                feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
            };
        });

        this.#removeUnnecessaryColumns(mapped, newsletters, membersEnabled, trackClicks, trackOpens, membersTrackSources, paidMembersEnabled, hasNewslettersWithFeedback);

        return mapped;
    }

    #hasNewslettersWithFeedback(newsletters) {
        return !!newsletters.find(newsletter => newsletter.get('feedback_enabled'));
    }

    #getValidEmail(post) {
        let email = post.related('email');
        if (!email.id) {
            email = null;
        }
        return email;
    }

    #isPostPublished(post, email) {
        if (post.get('status') === 'draft' || post.get('status') === 'scheduled') {
            email = null;
            return false;
        }
        return true;
    }

    #isFeedbackEnabled(email, hasNewslettersWithFeedback) {
        return email && email.get('feedback_enabled') && hasNewslettersWithFeedback;
    }

    #shouldShowClickAnalytics(trackClicks, email) {
        return trackClicks && email && email.get('track_clicks');
    }

    #concatenateAuthors(post) {
        return post.related('authors').map(author => author.get('name')).join(', ');
    }

    #concatenateTags(post) {
        return post.related('tags').map(tag => tag.get('name')).join(', ');
    }

    #getNewsletterName(newsletters, post, email) {
        if (newsletters.length <= 1 || !post.get('newsletter_id') || !email) {
            return null;
        }
        return newsletters.find(newsletter => newsletter.get('id') === post.get('newsletter_id'))?.get('name');
    }

    #removeUnnecessaryColumns(mapped, newsletters, membersEnabled, trackClicks, trackOpens, membersTrackSources, paidMembersEnabled, hasNewslettersWithFeedback) {
        if (!mapped.length) {
            return;
        }
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
            return this.filterToString(parsed, allLabels, allTiers).join(', ');
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
     * @returns {string[]} Array of human-readable filter parts
     */
    filterToString(filter, allLabels, allTiers) {
        const strings = [];

        if (filter.$and) {
            // And is not supported
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
                this.#processLabelFilter(filter.label, allLabels, strings);
            }
            if (key === 'tier') {
                this.#processTierFilter(filter.tier, allTiers, strings);
            }
            if (key === 'status') {
                this.#processStatusFilter(filter.status, strings);
            }
        }

        return strings;
    }

    #processLabelFilter(labelValue, allLabels, strings) {
        if (typeof labelValue !== 'string') {
            return;
        }
        const label = allLabels.find(l => l.get('slug') === labelValue);
        strings.push(label ? label.get('name') : labelValue);
    }

    #processTierFilter(tierValue, allTiers, strings) {
        if (typeof tierValue !== 'string') {
            return;
        }
        const tier = allTiers.find(t => t.get('slug') === tierValue);
        strings.push(tier ? tier.get('name') : tierValue);
    }

    #processStatusFilter(statusValue, strings) {
        if (typeof statusValue === 'string') {
            switch (statusValue) {
            case 'free':
                strings.push('Free subscribers');
                break;
            case 'paid':
                strings.push('Paid subscribers');
                break;
            case 'comped':
                strings.push('Complimentary subscribers');
                break;
            }
        } else if (statusValue?.$ne) {
            if (statusValue.$ne === 'free') {
                strings.push('Paid subscribers');
            }
            if (statusValue.$ne === 'paid') {
                strings.push('Free subscribers');
            }
        }
    }
}

module.exports = PostsExporter;