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

            if (this.#isDraftOrScheduled(post)) {
                email = null;
            }

            const feedbackEnabled = this.#isFeedbackEnabled(email, hasNewslettersWithFeedback);
            const showEmailClickAnalytics = this.#shouldShowEmailClickAnalytics(trackClicks, email);

            return {
                id: post.get('id'),
                title: post.get('title'),
                url: this.#getPostUrl(post),
                author: post.related('authors').map(author => author.get('name')).join(', '),
                status: this.mapPostStatus(post.get('status'), !!email),
                created_at: post.get('created_at'),
                updated_at: post.get('updated_at'),
                published_at: this.#getPublishedAt(post, email),
                featured: post.get('featured'),
                tags: post.related('tags').map(tag => tag.get('name')).join(', '),
                post_access: this.postAccessToString(post),
                email_recipients: email ? this.humanReadableEmailRecipientFilter(email?.get('recipient_filter'), labels, tiers) : null,
                newsletter_name: newsletters.length > 1 && post.get('newsletter_id') && email ? newsletters.find(newsletter => newsletter.get('id') === post.get('newsletter_id'))?.get('name') : null,
                sends: email?.get('email_count') ?? null,
                opens: trackOpens ? (email?.get('opened_count') ?? null) : null,
                clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
                signups: membersTrackSources && this.#isPublished(post) ? (post.get('count__signups') ?? 0) : null,
                paid_conversions: membersTrackSources && paidMembersEnabled && this.#isPublished(post) ? (post.get('count__paid_conversions') ?? 0) : null,
                feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
                feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
            };
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
     * @private
     */
    #isDraftOrScheduled(post) {
        const status = post.get('status');
        return status === 'draft' || status === 'scheduled';
    }

    /**
     * @private
     */
    #isFeedbackEnabled(email, hasNewslettersWithFeedback) {
        return email && email.get('feedback_enabled') && hasNewslettersWithFeedback;
    }

    /**
     * @private
     */
    #shouldShowEmailClickAnalytics(trackClicks, email) {
        return trackClicks && email && email.get('track_clicks');
    }

    /**
     * @private
     */
    #getPublishedAt(post, email) {
        if (this.#isDraftOrScheduled(post)) {
            return null;
        }
        return post.get('published_at');
    }

    /**
     * @private
     */
    #isPublished(post) {
        return post.get('status') === 'published';
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
     * @returns {string[]}
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

    /**
     * @private
     */
    #processLabelFilter(label, allLabels, strings) {
        if (typeof label !== 'string') {
            return;
        }

        const labelSlug = label;
        const labelModel = allLabels.find(l => l.get('slug') === labelSlug);
        if (labelModel) {
            strings.push(labelModel.get('name'));
        } else {
            strings.push(labelSlug);
        }
    }

    /**
     * @private
     */
    #processTierFilter(tier, allTiers, strings) {
        if (typeof tier !== 'string') {
            return;
        }

        const tierSlug = tier;
        const tierModel = allTiers.find(l => l.get('slug') === tierSlug);
        if (tierModel) {
            strings.push(tierModel.get('name'));
        } else {
            strings.push(tierSlug);
        }
    }

    /**
     * @private
     */
    #processStatusFilter(status, strings) {
        if (typeof status === 'string') {
            if (status === 'free') {
                strings.push('Free subscribers');
            } else if (status === 'paid') {
                strings.push('Paid subscribers');
            } else if (status === 'comped') {
                strings.push('Complimentary subscribers');
            }
            return;
        }

        if (status.$ne === 'free') {
            strings.push('Paid subscribers');
        }

        if (status.$ne === 'paid') {
            strings.push('Free subscribers');
        }
    }
}

module.exports = PostsExporter;