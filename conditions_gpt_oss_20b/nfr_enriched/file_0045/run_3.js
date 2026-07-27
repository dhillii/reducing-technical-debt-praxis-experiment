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
            const email = this.getEmail(post);
            const published = this.isPublished(post);
            const feedbackEnabled = this.getFeedbackEnabled(email, hasNewslettersWithFeedback);
            const showEmailClickAnalytics = this.getShowEmailClickAnalytics(trackClicks, email);

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
                email_recipients: this.getEmailRecipients(email, labels, tiers),
                newsletter_name: this.getNewsletterName(post, newsletters, email),
                sends: this.getSends(email),
                opens: this.getOpens(email, trackOpens),
                clicks: this.getClicks(post, showEmailClickAnalytics),
                signups: this.getSignups(post, membersTrackSources, published),
                paid_conversions: this.getPaidConversions(post, membersTrackSources, paidMembersEnabled, published),
                feedback_more_like_this: this.getFeedbackMoreLikeThis(post, feedbackEnabled),
                feedback_less_like_this: this.getFeedbackLessLikeThis(post, feedbackEnabled)
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
     * @returns {string[]}
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

    /**
     * @private Retrieve the email relation for a post, handling special cases.
     * @param {Object} post
     * @returns {Object|null}
     */
    getEmail(post) {
        let email = post.related('email');

        if (!email.id) {
            return null;
        }

        if (post.get('status') === 'draft' || post.get('status') === 'scheduled') {
            return null;
        }

        return email;
    }

    /**
     * @private Determine if a post is considered published.
     * @param {Object} post
     * @returns {boolean}
     */
    isPublished(post) {
        return !(post.get('status') === 'draft' || post.get('status') === 'scheduled');
    }

    /**
     * @private Check if feedback is enabled for a post.
     * @param {Object|null} email
     * @param {boolean} hasNewslettersWithFeedback
     * @returns {boolean}
     */
    getFeedbackEnabled(email, hasNewslettersWithFeedback) {
        return email && email.get('feedback_enabled') && hasNewslettersWithFeedback;
    }

    /**
     * @private Determine if email click analytics should be shown.
     * @param {boolean} trackClicks
     * @param {Object|null} email
     * @returns {boolean}
     */
    getShowEmailClickAnalytics(trackClicks, email) {
        return trackClicks && email && email.get('track_clicks');
    }

    /**
     * @private Retrieve the newsletter name for a post if applicable.
     * @param {Object} post
     * @param {Array} newsletters
     * @param {Object|null} email
     * @returns {string|null}
     */
    getNewsletterName(post, newsletters, email) {
        if (newsletters.length <= 1 || !post.get('newsletter_id') || !email) {
            return null;
        }
        const newsletter = newsletters.find(n => n.get('id') === post.get('newsletter_id'));
        return newsletter?.get('name') ?? null;
    }

    /**
     * @private Get human readable email recipients string.
     * @param {Object|null} email
     * @param {Array} allLabels
     * @param {Array} allTiers
     * @returns {string|null}
     */
    getEmailRecipients(email, allLabels, allTiers) {
        if (!email) {
            return null;
        }
        return this.humanReadableEmailRecipientFilter(email.get('recipient_filter'), allLabels, allTiers);
    }

    /**
     * @private Get the number of sends for an email.
     * @param {Object|null} email
     * @returns {number|null}
     */
    getSends(email) {
        return email?.get('email_count') ?? null;
    }

    /**
     * @private Get the number of opens for an email.
     * @param {Object|null} email
     * @param {boolean} trackOpens
     * @returns {number|null}
     */
    getOpens(email, trackOpens) {
        return trackOpens ? (email?.get('opened_count') ?? null) : null;
    }

    /**
     * @private Get the number of clicks for a post.
     * @param {Object} post
     * @param {boolean} showEmailClickAnalytics
     * @returns {number|null}
     */
    getClicks(post, showEmailClickAnalytics) {
        return showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null;
    }

    /**
     * @private Get the number of signups for a post.
     * @param {Object} post
     * @param {boolean} membersTrackSources
     * @param {boolean} published
     * @returns {number|null}
     */
    getSignups(post, membersTrackSources, published) {
        return membersTrackSources && published ? (post.get('count__signups') ?? 0) : null;
    }

    /**
     * @private Get the number of paid conversions for a post.
     * @param {Object} post
     * @param {boolean} membersTrackSources
     * @param {boolean} paidMembersEnabled
     * @param {boolean} published
     * @returns {number|null}
     */
    getPaidConversions(post, membersTrackSources, paidMembersEnabled, published) {
        return membersTrackSources && paidMembersEnabled && published ? (post.get('count__paid_conversions') ?? 0) : null;
    }

    /**
     * @private Get the number of positive feedback for a post.
     * @param {Object} post
     * @param {boolean} feedbackEnabled
     * @returns {number|null}
     */
    getFeedbackMoreLikeThis(post, feedbackEnabled) {
        return feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null;
    }

    /**
     * @private Get the number of negative feedback for a post.
     * @param {Object} post
     * @param {boolean} feedbackEnabled
     * @returns {number|null}
     */
    getFeedbackLessLikeThis(post, feedbackEnabled) {
        return feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null;
    }
}

module.exports = PostsExporter;