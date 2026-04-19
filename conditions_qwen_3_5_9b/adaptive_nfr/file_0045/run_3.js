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
        const hasNewslettersWithFeedback = this.hasNewslettersWithFeedback(newsletters);

        const mapped = posts.data.map((post) => {
            const email = this.getPostEmail(post);
            const published = this.isPostPublished(post);

            const feedbackEnabled = this.isFeedbackEnabled(email, hasNewslettersWithFeedback);
            const showEmailClickAnalytics = this.shouldShowEmailClickAnalytics(trackClicks, email);

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
                newsletter_name: this.getNewsletterName(newsletters, post, email),
                sends: email?.get('email_count') ?? null,
                opens: trackOpens ? (email?.get('opened_count') ?? null) : null,
                clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
                signups: membersTrackSources && published ? (post.get('count__signups') ?? 0) : null,
                paid_conversions: membersTrackSources && paidMembersEnabled && published ? (post.get('count__paid_conversions') ?? 0) : null,
                feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
                feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
            };
        });

        if (mapped.length) {
            const removeableColumns = this.getRemoveableColumns(newsletters, membersEnabled, hasNewslettersWithFeedback, trackClicks, trackOpens, membersTrackSources, paidMembersEnabled);

            for (const columnToRemove of removeableColumns) {
                for (const row of mapped) {
                    delete row[columnToRemove];
                }
            }
        }

        return mapped;
    }

    hasNewslettersWithFeedback(newsletters) {
        return !!newsletters.find(newsletter => newsletter.get('feedback_enabled'));
    }

    getPostEmail(post) {
        let email = post.related('email');

        if (!email.id) {
            email = null;
        }

        return email;
    }

    isPostPublished(post) {
        const status = post.get('status');
        return status !== 'draft' && status !== 'scheduled';
    }

    isFeedbackEnabled(email, hasNewslettersWithFeedback) {
        return email && email.get('feedback_enabled') && hasNewslettersWithFeedback;
    }

    shouldShowEmailClickAnalytics(trackClicks, email) {
        return trackClicks && email && email.get('track_clicks');
    }

    getNewsletterName(newsletters, post, email) {
        if (newsletters.length > 1 && post.get('newsletter_id') && email) {
            const newsletter = newsletters.find(newsletter => newsletter.get('id') === post.get('newsletter_id'));
            return newsletter?.get('name') ?? null;
        }
        return null;
    }

    getRemoveableColumns(newsletters, membersEnabled, hasNewslettersWithFeedback, trackClicks, trackOpens, membersTrackSources, paidMembersEnabled) {
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

    filterToString(filter, allLabels, allTiers) {
        const strings = [];

        if (filter.$or) {
            for (const subfilter of filter.$or) {
                strings.push(...this.filterToString(subfilter, allLabels, allTiers));
            }
        } else {
            for (const key of Object.keys(filter)) {
                if (key === 'label') {
                    this.processLabelFilter(filter.label, allLabels, strings);
                }

                if (key === 'tier') {
                    this.processTierFilter(filter.tier, allTiers, strings);
                }

                if (key === 'status') {
                    this.processStatusFilter(filter.status, strings);
                }
            }
        }

        return strings;
    }

    processLabelFilter(label, allLabels, strings) {
        if (typeof label === 'string') {
            const labelSlug = label;
            const label = allLabels.find(l => l.get('slug') === labelSlug);
            if (label) {
                strings.push(label.get('name'));
            } else {
                strings.push(labelSlug);
            }
        }
    }

    processTierFilter(tier, allTiers, strings) {
        if (typeof tier === 'string') {
            const tierSlug = tier;
            const tier = allTiers.find(l => l.get('slug') === tierSlug);
            if (tier) {
                strings.push(tier.get('name'));
            } else {
                strings.push(tierSlug);
            }
        }
    }

    processStatusFilter(status, strings) {
        if (typeof status === 'string') {
            if (status === 'free') {
                strings.push('Free subscribers');
            } else if (status === 'paid') {
                strings.push('Paid subscribers');
            } else if (status === 'comped') {
                strings.push('Complimentary subscribers');
            }
        } else {
            if (status.$ne === 'free') {
                strings.push('Paid subscribers');
            }

            if (status.$ne === 'paid') {
                strings.push('Free subscribers');
            }
        }
    }
}

module.exports = PostsExporter;
```