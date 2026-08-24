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
     * Export posts with email and analytics data
     * @param {Object} options
     * @param {string} [options.filter]
     * @param {string} [options.order]
     * @param {string|number} [options.limit]
     * @returns {Promise<Object[]>}
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

        const settings = this.#collectSettings();
        const hasNewslettersWithFeedback = this.#hasNewslettersWithFeedback(newsletters);

        const mapped = posts.data.map((post) => {
            const email = this.#normalizeEmail(post.related('email'));
            const published = this.#isPublished(posts.data, post);

            if (!published) {
                return this.#createBasePostObject(post, null, settings, hasNewslettersWithFeedback);
            }

            return this.#createBasePostObject(post, email, settings, hasNewslettersWithFeedback);
        });

        return this.#applyColumnRemoval(mapped, newsletters, settings);
    }

    #collectSettings() {
        const membersEnabled = this.#settingsHelpers.isMembersEnabled();
        return {
            membersEnabled,
            trackSources: membersEnabled && this.#settingsCache.get('members_track_sources'),
            paidMembersEnabled: membersEnabled && this.#settingsHelpers.arePaidMembersEnabled(),
            trackOpens: this.#settingsCache.get('email_track_opens'),
            trackClicks: this.#settingsCache.get('email_track_clicks')
        };
    }

    #hasNewslettersWithFeedback(newsletters) {
        return newsletters.some(newsletter => newsletter.get('feedback_enabled'));
    }

    #normalizeEmail(email) {
        return email && email.id ? email : null;
    }

    #isPublished(posts, post) {
        const status = post.get('status');
        return status === 'published';
    }

    #createBasePostObject(post, email, settings, hasNewslettersWithFeedback) {
        const feedbackEnabled = email && email.get('feedback_enabled') && hasNewslettersWithFeedback;
        const showEmailClickAnalytics = settings.trackClicks && email && email.get('track_clicks');

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
            email_recipients: email ? this.humanReadableEmailRecipientFilter(email.get('recipient_filter'), settings.labels, settings.tiers) : null,
            newsletter_name: this.#getNewsletterName(post, email, settings.newsletters),
            sends: email?.get('email_count') ?? null,
            opens: settings.trackOpens ? (email?.get('opened_count') ?? null) : null,
            clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
            signups: settings.trackSources && settings.membersEnabled ? (post.get('count__signups') ?? 0) : null,
            paid_conversions: settings.trackSources && settings.membersEnabled && settings.paidMembersEnabled ? (post.get('count__paid_conversions') ?? 0) : null,
            feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
            feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
        };
    }

    #getNewsletterName(post, email, newsletters) {
        if (newsletterName => {
            return newsletters.length > 1 && post.get('newsletter_id') && email ?
                newsletters.find(n => n.get('id') === post.get('newsletter_id'))?.get('name') : null;
        };
    }

    #applyColumnRemoval(mapped, newsletters, settings) {
        if (!mapped.length) {
            return mapped;
        }

        const removeableColumns = this.#getRemoveableColumns(newsletters, settings);

        for (const columnToRemove of removeableColumns) {
            for (const row of mapped) {
                delete row[columnToRemove];
            }
        }

        return mapped;
    }

    #getRemoveableColumns(newsletters, settings) {
        const removeableColumns = [];

        if (newsletters.length <= 1) {
            removeableColumns.push('newsletter_name');
        }

        if (!settings.membersEnabled) {
            removeableColumns.push('email_recipients', 'sends', 'opens', 'clicks', 'feedback_more_like_this', 'feedback_less_like_this');
        } else {
            if (!settings.trackOpens) {
                removeableColumns.push('opens');
            }

            if (!settings.trackClicks) {
                removeableColumns.push('clicks');
            }

            if (!settings.trackSources) {
                removeableColumns.push('signups', 'paid_conversions');
            } else if (!settings.paidMembersEnabled) {
                removeableColumns.push('paid_conversions');
            }
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
     * @param {Array} allLabels
     * @param {Array} allTiers
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
     * @private Convert an email filter to a human readable string
     * @param {Object} filter Parsed NQL filter
     * @param {Array} allLabels All available member labels
     * @param {Array} allTiers All available member tiers
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
            this.#parseFilterSegments(filter, allLabels, allTiers, strings);
        }

        return strings;
    }

    /**
     * @private Parse individual filter segments and convert to readable strings
     * @param {Object} filter
     * @param {Array} allLabels
     * @param {Array} allTiers
     * @param {Array} strings Accumulator for resulting strings
     */
    #parseFilterSegments(filter, allLabels, allTiers, strings) {
        for (const key of Object.keys(filter)) {
            if (key === 'label') {
                this.#processLabelFilter(filter.label, allLabels, strings);
            } else if (key === 'tier') {
                this.#processTierFilter(filter.tier, allTiers, strings);
            } else if (key === 'status') {
                this.#processStatusFilter(filter.status, strings);
            }
        }
    }

    /**
     * @private Process label filter and append readable label name
     * @param {string|string[]} labelSlug
     * @param {Array} allLabels
     * @param {Array} strings
     */
    #processLabelFilter(labelSlug, allLabels, strings) {
        if (typeof labelSlug === 'string') {
            const label = allLabels.find(l => l.get('slug') === labelSlug);
            strings.push(label ? label.get('name') : labelSlug);
        }
    }

    /**
     * @private Process tier filter and append readable tier name
     * @param {string|string[]} tierSlug
     * @param {Array} allTiers
     * @param {Array} strings
     */
    #processTierFilter(tierSlug, allTiers, strings) {
        if (typeof tierSlug === 'string') {
            const tier = allTiers.find(l => l.get('slug') === tierSlug);
            strings.push(tier ? tier.get('name') : tierSlug);
        }
    }

    /**
     * @private Process status filter and append readable status description
     * @param {string|Object} filterStatus
     * @param {Array} strings
     */
    #processStatusFilter(filterStatus, strings) {
        if (typeof filterStatus === 'string') {
            switch (filterStatus) {
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
        } else {
            if (filterStatus.$ne === 'free') {
                strings.push('Paid subscribers');
            }

            if (filterStatus.$ne === 'paid') {
                strings.push('Free subscribers');
            }
        }
    }
}

module.exports = PostsExporter;