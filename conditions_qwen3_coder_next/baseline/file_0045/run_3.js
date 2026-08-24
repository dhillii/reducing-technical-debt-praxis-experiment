const trackClicks = this.#settingsCache.get('email_track_clicks');
        const hasNewslettersWithFeedback = !!newsletters.find(newsletter => newsletter.get('feedback_enabled'));

        const mapped = posts.data.map((post) => {
            let email = post.related('email');

            // Weird bookshelf thing fix
            if (!email.id) {
                email = null;
            }

            let published = true;
            if (post.get('status') === 'draft' || post.get('status') === 'scheduled') {
                // Manually clear it to avoid including information for a post that was reverted to draft
                email = null;
                published = false;
            }

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
                newsletter_name: newsletters.length > 1 && post.get('newsletter_id') && email ? newsletters.find(newsletter => newsletter.get('id') === post.get('newsletter_id'))?.get('name') : null,
                sends: email?.get('email_count') ?? null,
                opens: trackOpens ? (email?.get('opened_count') ?? null) : null,
                clicks: showEmailClickAnalytics ? (post.get('count__clicks') ?? 0) : null,
                signups: membersTrackSources && published ? (post.get('count__signups') ?? 0) : null,
                paid_conversions: membersTrackSources && paidMembersEnabled && published ? (post.get('count__paid_conversions') ?? 0) : null,
                feedback_more_like_this: feedbackEnabled ? (post.get('count__positive_feedback') ?? 0) : null,
                feedback_less_like_this: feedbackEnabled ? (post.get('count__negative_feedback') ?? 0) : null
            };
        });