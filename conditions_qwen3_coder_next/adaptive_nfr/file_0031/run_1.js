trimString(value) {
        if (!value && value !== 0) {
            return null;
        }

        const trimmed = String(value).trim();
        return trimmed || null;
    }

    compute([event, hasMultipleNewsletters]) {
        let memberName = event.data.member?.name;
        memberName = this.trimString(memberName);

        const subject = event.data.member ? (memberName || event.data.member.email) : (event.data.name || event.data.email || '');
        const icon = this.getIcon(event);
        const action = this.getAction(event, hasMultipleNewsletters);
        const info = this.getInfo(event);
        const description = this.getDescription(event);

        const join = this.getJoin(event);
        const object = this.getObject(event);
        const url = this.getURL(event);
        const route = this.getRoute(event);
        const timestamp = moment(event.data.created_at);
        const source = this.getSource(event);

        const member = this._getMemberWithTrimmedName(event, memberName);

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

    _getMemberWithTrimmedName(event, memberName) {
        if (!event.data.member) {
            return event.data.member;
        }

        return {
            ...event.data.member,
            name: memberName
        };
    }

    getIcon(event) {
        if (this._isLoginEvent(event)) {
            return 'event-logged-in';
        }

        if (this._isPaymentEvent(event)) {
            return 'event-subscriptions';
        }

        if (this._isNewsletterEvent(event)) {
            if (event.data.subscribed) {
                return 'event-subscribed-to-email';
            } else {
                return 'event-unsubscribed-from-email';
            }
        }

        if (this._isSubscriptionEvent(event)) {
            const baseIcon = 'event-subscriptions';

            if (this._isSubscriptionCancelEvent(event)) {
                return 'event-canceled-subscription';
            }

            if (this._isSignupEvent(event)) {
                return 'event-signed-up';
            }

            return baseIcon;
        }

        if (this._isEmailOpenedEvent(event)) {
            return 'event-opened-email';
        }

        if (this._isEmailSentEvent(event)) {
            return 'event-sent-email';
        }

        if (this._isAutomatedEmailSentEvent(event)) {
            return 'event-sent-email';
        }

        if (this._isEmailDeliveredEvent(event)) {
            return 'event-received-email';
        }

        if (this._isEmailFailedEvent(event)) {
            return 'event-email-delivery-failed';
        }

        if (this._isEmailComplaintEvent(event)) {
            return 'event-email-delivery-spam';
        }

        if (this._isCommentEvent(event)) {
            return 'event-comment';
        }

        if (this._isClickEvent(event)) {
            return 'event-click';
        }

        if (this._isFeedbackEvent(event)) {
            if (event.data.score === 1) {
                return 'event-more-like-this';
            } else {
                return 'event-less-like-this';
            }
        }

        if (this._isDonationEvent(event)) {
            return 'event-subscriptions';
        }

        if (this._isEmailChangeEvent(event)) {
            return 'event-email-changed';
        }

        return 'event-';
    }

    getAction(event, hasMultipleNewsletters) {
        if (this._isSignupEvent(event)) {
            return 'signed up';
        }

        if (this._isLoginEvent(event)) {
            return 'logged in';
        }

        if (this._isPaymentEvent(event)) {
            return 'made payment';
        }

        if (this._isNewsletterEvent(event)) {
            return this._getNewsletterAction(event, hasMultipleNewsletters);
        }

        if (this._isSubscriptionEvent(event)) {
            return this._getSubscriptionAction(event);
        }

        if (this._isEmailOpenedEvent(event)) {
            return 'opened email';
        }

        if (this._isEmailSentEvent(event)) {
            return 'sent email';
        }

        if (this._isAutomatedEmailSentEvent(event)) {
            return this._getAutomatedEmailSentAction(event);
        }

        if (this._isEmailDeliveredEvent(event)) {
            return 'received email';
        }

        if (this._isEmailFailedEvent(event)) {
            return 'bounced email';
        }

        if (this._isEmailComplaintEvent(event)) {
            return 'email flagged as spam';
        }

        if (this._isCommentEvent(event)) {
            return this._getCommentAction(event);
        }

        if (this._isClickEvent(event)) {
            return this._getClickAction(event);
        }

        if (this._isFeedbackEvent(event)) {
            return this._getFeedbackAction(event);
        }

        if (this._isEmailChangeEvent(event)) {
            return this._getEmailChangeAction(event);
        }

        if (this._isDonationEvent(event)) {
            return 'Made a one-time payment';
        }
    }

    getJoin() {
        return '–';
    }

    getObject(event) {
        if (this._isAttributionSubjectEvent(event)) {
            if (event.data.attribution?.title) {
                return event.data.attribution.title;
            }
        }

        if (this._isCommentEvent(event) || this._isClickEvent(event) || this._isFeedbackEvent(event)) {
            if (event.data.post) {
                return event.data.post.title;
            }
        }

        return '';
    }

    getSource(event) {
        if (!event.data?.attribution?.referrer_source) {
            return null;
        }

        return {
            name: event.data.attribution.referrer_source,
            url: event.data.attribution.referrer_url ?? null
        };
    }

    getInfo(event) {
        if (this._isSubscriptionEvent(event)) {
            return this._getSubscriptionInfo(event);
        }

        if (this._isSignupEvent(event) && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }

        if (this._isDonationEvent(event)) {
            const symbol = getSymbol(event.data.currency);
            const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
            return formattedAmount;
        }

        return;
    }

    getDescription(event) {
        if (this._isClickEvent(event)) {
            try {
                return this.utils.cleanTrackedUrl(event.data.link.to, true);
            } catch (e) {
                // Invalid URL
            }
            return event.data.link.to;
        }

        return;
    }

    getURL(event) {
        if (this._isCommentOrClickOrFeedbackEvent(event)) {
            if (event.data.post) {
                return event.data.post.url;
            }
        }

        if (this._isAttributionSubjectEvent(event)) {
            if (event.data.attribution && event.data.attribution.url) {
                return event.data.attribution.url;
            }
        }

        return;
    }

    getRoute(event) {
        if (this._isClickOrFeedbackEvent(event)) {
            if (event.data.post) {
                return {
                    name: 'posts-x',
                    model: event.data.post.id
                };
            }
        }

        if (this._isSignupOrSubscriptionEvent(event)) {
            if (event.data.attribution_type === 'post') {
                return {
                    name: 'posts-x',
                    model: event.data.attribution_id
                };
            }
        }

        return;
    }

    /* Predicate functions */

    _isLoginEvent(event) {
        return event.type === 'login_event';
    }

    _isPaymentEvent(event) {
        return event.type === 'payment_event';
    }

    _isNewsletterEvent(event) {
        return event.type === 'newsletter_event';
    }

    _isSubscriptionEvent(event) {
        return event.type === 'subscription_event';
    }

    _isEmailOpenedEvent(event) {
        return event.type === 'email_opened_event';
    }

    _isEmailSentEvent(event) {
        return event.type === 'email_sent_event';
    }

    _isAutomatedEmailSentEvent(event) {
        return event.type === 'automated_email_sent_event';
    }

    _isEmailDeliveredEvent(event) {
        return event.type === 'email_delivered_event';
    }

    _isEmailFailedEvent(event) {
        return event.type === 'email_failed_event';
    }

    _isEmailComplaintEvent(event) {
        return event.type === 'email_complaint_event';
    }

    _isCommentEvent(event) {
        return event.type === 'comment_event';
    }

    _isClickEvent(event) {
        return event.type === 'click_event' || event.type === 'aggregated_click_event';
    }

    _isFeedbackEvent(event) {
        return event.type === 'feedback_event';
    }

    _isDonationEvent(event) {
        return event.type === 'donation_event';
    }

    _isEmailChangeEvent(event) {
        return event.type === 'email_change_event';
    }

    _isSignupEvent(event) {
        return event.type === 'signup_event' || (this._isSubscriptionEvent(event) && event.data.type === 'created' && event.data.signup);
    }

    _isSubscriptionCancelEvent(event) {
        return this._isSubscriptionEvent(event) && event.data.type === 'canceled';
    }

    _isAttributionSubjectEvent(event) {
        return event.type === 'signup_event' || event.type === 'subscription_event' || event.type === 'donation_event';
    }

    _isCommentOrClickOrFeedbackEvent(event) {
        return ['comment_event', 'click_event', 'feedback_event'].includes(event.type);
    }

    _isClickOrFeedbackEvent(event) {
        return ['click_event', 'feedback_event'].includes(event.type);
    }

    _isSignupOrSubscriptionEvent(event) {
        return ['signup_event', 'subscription_event'].includes(event.type);
    }

    /* Action helper methods */

    _getNewsletterAction(event, hasMultipleNewsletters) {
        let newsletter = 'newsletter';

        if (hasMultipleNewsletters && event.data.newsletter && event.data.newsletter.name) {
            newsletter = event.data.newsletter.name;
        }

        if (event.data.subscribed) {
            return 'subscribed to ' + newsletter;
        }

        return 'unsubscribed from ' + newsletter;
    }

    _getSubscriptionAction(event) {
        const type = event.data.type;

        switch (type) {
            case 'created':
                return 'started paid subscription';
            case 'updated':
                return 'changed paid subscription';
            case 'canceled':
                return 'canceled paid subscription';
            case 'reactivated':
                return 'reactivated paid subscription';
            case 'expired':
                return 'ended paid subscription';
            default:
                return 'changed paid subscription';
        }
    }

    _getAutomatedEmailSentAction(event) {
        const slug = event.data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    _getCommentAction(event) {
        if (event.data.parent) {
            return 'replied to comment';
        }
        return 'commented';
    }

    _getClickAction(event) {
        if (event.type === 'click_event') {
            return 'clicked link in email';
        }

        const clicks = event.data.count.clicks || 0;
        if (clicks <= 1) {
            return 'clicked link in email';
        }
        return `clicked ${ghPluralize(clicks, 'link')} in email`;
    }

    _getFeedbackAction(event) {
        if (event.data.score === 1) {
            return 'more like this';
        }
        return 'less like this';
    }

    _getEmailChangeAction(event) {
        if (event.data.from_email && event.data.to_email) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }
        return 'Email address changed';
    }

    _getSubscriptionInfo(event) {
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