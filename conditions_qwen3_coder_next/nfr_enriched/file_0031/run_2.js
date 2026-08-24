trimString(value) {
        if (!value && value !== 0) {
            return null;
        }

        const trimmed = String(value).trim();
        return trimmed || null;
    }

    compute([event, hasMultipleNewsletters]) {
        const memberName = this.trimString(event.data.member?.name);
        const subject = this.getSubject(event, memberName);
        const icon = this.getIcon(event);
        const action = this.getAction(event, hasMultipleNewsletters);
        const info = this.getInfo(event);
        const description = this.getDescription(event);
        const join = this.getJoin();
        const object = this.getObject(event);
        const url = this.getURL(event);
        const route = this.getRoute(event);
        const timestamp = moment(event.data.created_at);
        const source = this.getSource(event);

        const member = this.adjustMemberName(event.data.member, memberName);

        return {
            memberId: event.data.member_id ?? event.data.member?.id,
            member,
            emailId: event.data.email_id,
            email: event.data.email,
            icon,
            subject,
            action,
            join,
            object,
            source,
            info,
            description,
            url,
            route,
            timestamp
        };
    }

    getSubject(event, memberName) {
        if (event.data.member) {
            return memberName || event.data.member.email;
        }

        return event.data.name || event.data.email || '';
    }

    adjustMemberName(member, memberName) {
        if (!member) {
            return member;
        }

        return {
            ...member,
            name: memberName
        };
    }

    /* internal helper functions */
    getIcon(event) {
        const iconMap = this.buildIconMap(event);
        const icon = iconMap[event.type] || '';

        return 'event-' + icon;
    }

    buildIconMap(event) {
        return {
            login_event: 'logged-in',
            payment_event: 'subscriptions',
            newsletter_event: this.getNewsletterIcon(event),
            subscription_event: this.getSubscriptionIcon(event),
            signup_event: 'signed-up',
            email_opened_event: 'opened-email',
            email_sent_event: 'sent-email',
            automated_email_sent_event: 'sent-email',
            email_delivered_event: 'received-email',
            email_failed_event: 'email-delivery-failed',
            email_complaint_event: 'email-delivery-spam',
            comment_event: 'comment',
            click_event: 'click',
            aggregated_click_event: 'click',
            feedback_event: this.getFeedbackIcon(event),
            donation_event: 'subscriptions',
            email_change_event: 'email-changed'
        };
    }

    getNewsletterIcon(event) {
        if (event.data.subscribed) {
            return 'subscribed-to-email';
        }
        return 'unsubscribed-from-email';
    }

    getSubscriptionIcon(event) {
        if (event.data.type === 'canceled') {
            return 'canceled-subscription';
        }
        return 'subscriptions';
    }

    getFeedbackIcon(event) {
        if (event.data.score === 1) {
            return 'more-like-this';
        }
        return 'less-like-this';
    }

    getAction(event, hasMultipleNewsletters) {
        const actionMap = this.buildActionMap(event, hasMultipleNewsletters);
        const actionFn = actionMap[event.type];

        return actionFn ? actionFn() : '';
    }

    buildActionMap(event, hasMultipleNewsletters) {
        return {
            signup_event: () => 'signed up',
            subscription_event: () => this.getSubscriptionAction(event),
            login_event: () => 'logged in',
            payment_event: () => 'made payment',
            newsletter_event: () => this.getNewsletterAction(event, hasMultipleNewsletters),
            email_opened_event: () => 'opened email',
            email_sent_event: () => 'sent email',
            automated_email_sent_event: () => this.getAutomatedEmailAction(event),
            email_delivered_event: () => 'received email',
            email_failed_event: () => 'bounced email',
            email_complaint_event: () => 'email flagged as spam',
            comment_event: () => this.getCommentAction(event),
            click_event: () => 'clicked link in email',
            aggregated_click_event: () => this.getAggregatedClickAction(event),
            feedback_event: () => this.getFeedbackAction(event),
            email_change_event: () => this.getEmailChangeAction(event),
            donation_event: () => 'Made a one-time payment'
        };
    }

    getSubscriptionAction(event) {
        const type = event.data.type;

        switch (type) {
            case 'created': return 'started paid subscription';
            case 'updated': return 'changed paid subscription';
            case 'canceled': return 'canceled paid subscription';
            case 'reactivated': return 'reactivated paid subscription';
            case 'expired': return 'ended paid subscription';
            default: return 'changed paid subscription';
        }
    }

    getNewsletterAction(event, hasMultipleNewsletters) {
        let newsletter = 'newsletter';

        if (hasMultipleNewsletters && event.data.newsletter?.name) {
            newsletter = event.data.newsletter.name;
        }

        return event.data.subscribed
            ? `subscribed to ${newsletter}`
            : `unsubscribed from ${newsletter}`;
    }

    getAutomatedEmailAction(event) {
        const slug = event.data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    getCommentAction(event) {
        return event.data.parent ? 'replied to comment' : 'commented';
    }

    getAggregatedClickAction(event) {
        const count = event.data.count.clicks;
        const pluralized = ghPluralize(count, 'link');

        if (count <= 1) {
            return 'clicked link in email';
        }
        return `clicked ${pluralized} in email`;
    }

    getFeedbackAction(event) {
        return event.data.score === 1 ? 'more like this' : 'less like this';
    }

    getEmailChangeAction(event) {
        if (event.data.from_email && event.data.to_email) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }
        return 'Email address changed';
    }

    /**
     * When we need to append the action and object in one sentence, you can add extra words here.
     */
    getJoin() {
        return '–';
    }

    getObject(event) {
        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type)) {
            return event.data.attribution?.title ?? '';
        }

        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type)) {
            return event.data.post?.title ?? '';
        }

        return '';
    }

    getSource(event) {
        if (event.data?.attribution?.referrer_source) {
            return {
                name: event.data.attribution.referrer_source,
                url: event.data.attribution.referrer_url ?? null
            };
        }

        return null;
    }

    getInfo(event) {
        if (event.type === 'subscription_event') {
            return this.getSubscriptionInfo(event);
        }

        if (event.type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }

        if (event.type === 'donation_event') {
            return this.getDonationInfo(event);
        }

        return;
    }

    getSubscriptionInfo(event) {
        const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);

        if (mrrDelta === 0) {
            return;
        }

        const symbol = getSymbol(event.data.currency);

        if (event.data.type === 'created') {
            const sign = mrrDelta > 0 ? '' : '-';
            const tierName = this.membersUtils.hasMultipleTiers ? (event.data.tierName ?? 'Paid') : 'Paid';
            return `${tierName} ${sign}${symbol}${Math.abs(mrrDelta)}/month`;
        }

        const sign = mrrDelta > 0 ? '+' : '-';
        return `MRR ${sign}${symbol}${Math.abs(mrrDelta)}`;
    }

    getDonationInfo(event) {
        const symbol = getSymbol(event.data.currency);
        const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
        return formattedAmount;
    }

    getDescription(event) {
        if (event.type === 'click_event') {
            try {
                return this.utils.cleanTrackedUrl(event.data.link.to, true);
            } catch (e) {
                // Invalid URL, fallthrough
            }
            return event.data.link.to;
        }
        return;
    }

    getURL(event) {
        const postTypes = ['comment_event', 'click_event', 'feedback_event'];
        if (postTypes.includes(event.type) && event.data.post) {
            return event.data.post.url;
        }

        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type)) {
            return event.data.attribution?.url ?? '';
        }

        return;
    }

    getRoute(event) {
        const postTypes = ['click_event', 'feedback_event'];
        if (postTypes.includes(event.type) && event.data.post) {
            return {
                name: 'posts-x',
                model: event.data.post.id
            };
        }

        if (['signup_event', 'subscription_event'].includes(event.type)) {
            if (event.data.attribution_type === 'post') {
                return {
                    name: 'posts-x',
                    model: event.data.attribution_id
                };
            }
        }

        return;
    }
}