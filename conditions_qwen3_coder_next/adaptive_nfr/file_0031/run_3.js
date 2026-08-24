import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject as service} from '@ember/service';

export default class ParseMemberEventHelper extends Helper {
    @service feature;
    @service utils;
    @service membersUtils;

    trimString(value) {
        // Always convert to null if the value is empty/null/undefined
        if (!value && value !== 0) {
            return null;
        }

        // Force to string and trim
        const trimmed = String(value).trim();

        // Convert empty strings or pure whitespace to null
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

        // Also ensure the member object has the transformed name
        const member = event.data.member ? {
            ...event.data.member,
            name: memberName
        } : event.data.member;

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

    // --- getIcon helpers ---
    _isLoginEvent(event) {
        return event.type === 'login_event';
    }

    _isPaymentEvent(event) {
        return event.type === 'payment_event';
    }

    _isNewsletterEvent(event) {
        return event.type === 'newsletter_event';
    }

    _isSubscribedNewsletter(event) {
        return event.data.subscribed;
    }

    _isSubscriptionEvent(event) {
        return event.type === 'subscription_event';
    }

    _isCanceledSubscription(event) {
        return event.type === 'subscription_event' && event.data.type === 'canceled';
    }

    _isSignupOrNewSubscription(event) {
        return event.type === 'signup_event' || (
            event.type === 'subscription_event' &&
            event.data.type === 'created' &&
            event.data.signup
        );
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

    _isPositiveFeedback(event) {
        return event.data.score === 1;
    }

    _isDonationEvent(event) {
        return event.type === 'donation_event';
    }

    _isEmailChangeEvent(event) {
        return event.type === 'email_change_event';
    }

    /**
     * @param {Object} event
     */
    getIcon(event) {
        if (this._isLoginEvent(event)) {
            return 'event-logged-in';
        }

        if (this._isPaymentEvent(event)) {
            return 'event-subscriptions';
        }

        if (this._isNewsletterEvent(event)) {
            return this._isSubscribedNewsletter(event) ? 'event-subscribed-to-email' : 'event-unsubscribed-from-email';
        }

        if (this._isSubscriptionEvent(event)) {
            if (this._isCanceledSubscription(event)) {
                return 'event-canceled-subscription';
            }
            return 'event-subscriptions';
        }

        if (this._isSignupOrNewSubscription(event)) {
            return 'event-signed-up';
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
            return this._isPositiveFeedback(event) ? 'event-more-like-this' : 'event-less-like-this';
        }

        if (this._isDonationEvent(event)) {
            return 'event-subscriptions';
        }

        if (this._isEmailChangeEvent(event)) {
            return 'event-email-changed';
        }

        return 'event-';
    }

    // --- getAction helpers ---
    _isSignupEvent(event) {
        return event.type === 'signup_event';
    }

    _isNewSubscriptionCreated(event) {
        return event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup;
    }

    _isLoginActionEvent(event) {
        return event.type === 'login_event';
    }

    _isPaymentEventForAction(event) {
        return event.type === 'payment_event';
    }

    _isNewsletterEventForAction(event) {
        return event.type === 'newsletter_event';
    }

    _isNewsletterSubscribed(actionEvent) {
        return actionEvent.data.subscribed;
    }

    _getNewsletterNameForAction(hasMultipleNewsletters, newsletter) {
        if (hasMultipleNewsletters && newsletter?.name) {
            return newsletter.name;
        }
        return 'newsletter';
    }

    _isSubscriptionEventType(event, type) {
        return event.type === 'subscription_event' && event.data.type === type;
    }

    _isCommentEventForAction(event) {
        return event.type === 'comment_event';
    }

    _hasParentComment(event) {
        return event.data.parent;
    }

    _isClickEventForAction(event) {
        return event.type === 'click_event';
    }

    _isAggregatedClickEvent(event) {
        return event.type === 'aggregated_click_event';
    }

    _isFeedbackEventForAction(event) {
        return event.type === 'feedback_event';
    }

    _isEmailChangeEventForAction(event) {
        return event.type === 'email_change_event';
    }

    _hasFromAndToEmail(event) {
        return event.data.from_email && event.data.to_email;
    }

    _getEmailTypeForWelcomeEmail(event) {
        const slug = event.data.automatedEmail?.slug || '';
        return slug.includes('paid') ? 'Paid' : 'Free';
    }

    /**
     * @param {Object} event
     * @param {Boolean} hasMultipleNewsletters
     */
    getAction(event, hasMultipleNewsletters) {
        if (this._isSignupEvent(event) || this._isNewSubscriptionCreated(event)) {
            return 'signed up';
        }

        if (this._isLoginActionEvent(event)) {
            return 'logged in';
        }

        if (this._isPaymentEventForAction(event)) {
            return 'made payment';
        }

        if (this._isNewsletterEventForAction(event)) {
            const newsletterName = this._getNewsletterNameForAction(hasMultipleNewsletters, event.data.newsletter);

            if (this._isNewsletterSubscribed(event)) {
                return 'subscribed to ' + newsletterName;
            }

            return 'unsubscribed from ' + newsletterName;
        }

        if (this._isSubscriptionEventType(event, 'created')) {
            return 'started paid subscription';
        }

        if (this._isSubscriptionEventType(event, 'updated')) {
            return 'changed paid subscription';
        }

        if (this._isSubscriptionEventType(event, 'canceled')) {
            return 'canceled paid subscription';
        }

        if (this._isSubscriptionEventType(event, 'reactivated')) {
            return 'reactivated paid subscription';
        }

        if (this._isSubscriptionEventType(event, 'expired')) {
            return 'ended paid subscription';
        }

        if (this._isSubscriptionEventType(event)) {
            return 'changed paid subscription';
        }

        if (event.type === 'email_opened_event') {
            return 'opened email';
        }

        if (event.type === 'email_sent_event') {
            return 'sent email';
        }

        if (event.type === 'automated_email_sent_event') {
            const emailType = this._getEmailTypeForWelcomeEmail(event);
            return `received welcome email (${emailType})`;
        }

        if (event.type === 'email_delivered_event') {
            return 'received email';
        }

        if (event.type === 'email_failed_event') {
            return 'bounced email';
        }

        if (event.type === 'email_complaint_event') {
            return 'email flagged as spam';
        }

        if (this._isCommentEventForAction(event)) {
            if (this._hasParentComment(event)) {
                return 'replied to comment';
            }
            return 'commented';
        }

        if (this._isClickEventForAction(event)) {
            return 'clicked link in email';
        }

        if (this._isAggregatedClickEvent(event)) {
            const clickCount = event.data.count?.clicks ?? 0;

            if (clickCount <= 1) {
                return 'clicked link in email';
            }
            return `clicked ${ghPluralize(clickCount, 'link')} in email`;
        }

        if (this._isFeedbackEventForAction(event)) {
            if (this._isPositiveFeedback(event)) {
                return 'more like this';
            }
            return 'less like this';
        }

        if (this._isEmailChangeEventForAction(event)) {
            if (this._hasFromAndToEmail(event)) {
                return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
            }
            return 'Email address changed';
        }

        if (event.type === 'donation_event') {
            return 'Made a one-time payment';
        }
    }

    /**
     * When we need to append the action and object in one sentence, you can add extra words here.
     * E.g.,
     *   action: 'Signed up'.
     *   object: 'My blog post'
     * When both words need to get appended, we'll add 'on'
     *  -> do this by returning 'on' in getJoin()
     * This string is not added when action and object are in a separate table column, or when the getObject/getURL is empty
     */
    getJoin() {
        return '–';
    }

    /**
     * Clickable object, shown between action and info, or in a separate column in some views
     */
    _isAttributableEvent(event) {
        return ['signup_event', 'subscription_event', 'donation_event'].includes(event.type);
    }

    /**
     * Clickable object, shown between action and info, or in a separate column in some views
     */
    getObject(event) {
        if (this._isAttributableEvent(event) && event.data.attribution?.title) {
            return event.data.attribution.title;
        }

        if (event.type === 'comment_event' && event.data.post) {
            return event.data.post.title;
        }

        if (['click_event', 'feedback_event'].includes(event.type) && event.data.post) {
            return event.data.post.title;
        }

        return '';
    }

    /**
     * @param {Object} event
     */
    getSource(event) {
        if (!event.data?.attribution?.referrer_source) {
            return null;
        }
        return {
            name: event.data.attribution.referrer_source,
            url: event.data.attribution.referrer_url ?? null
        };
    }

    /**
     * @param {Object} event
     */
    getInfo(event) {
        if (event.type === 'subscription_event') {
            const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
            if (mrrDelta === 0) {
                return;
            }
            const symbol = getSymbol(event.data.currency);

            if (this._isSubscriptionEventType(event, 'created')) {
                const sign = mrrDelta > 0 ? '' : '-';
                const tierName = this.membersUtils.hasMultipleTiers ? (event.data.tierName ?? 'Paid') : 'Paid';
                return `${tierName} ${sign}${symbol}${Math.abs(mrrDelta)}/month`;
            }
            const sign = mrrDelta > 0 ? '+' : '-';
            return `MRR ${sign}${symbol}${Math.abs(mrrDelta)}`;
        }

        if (event.type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }

        if (event.type === 'donation_event') {
            const symbol = getSymbol(event.data.currency);
            const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
            return formattedAmount;
        }

        return;
    }

    /**
     * @param {Object} event
     */
    getDescription(event) {
        if (event.type === 'click_event') {
            try {
                return this.utils.cleanTrackedUrl(event.data.link.to, true);
            } catch (e) {
                // Invalid URL
            }
            return event.data.link.to;
        }
        return;
    }

    /**
     * Make the object clickable
     */
    _isLinkableCommentClickFeedbackEvent(event) {
        return ['comment_event', 'click_event', 'feedback_event'].includes(event.type);
    }

    /**
     * Make the object clickable
     */
    _isLinkableMembershipEvent(event) {
        return ['signup_event', 'subscription_event', 'donation_event'].includes(event.type);
    }

    getURL(event) {
        if (this._isLinkableCommentClickFeedbackEvent(event) && event.data.post) {
            return event.data.post.url;
        }

        if (this._isLinkableMembershipEvent(event) && event.data.attribution?.url) {
            return event.data.attribution.url;
        }

        return;
    }

    /**
     * Get internal route props for a clickable object
     */
    _isRouteableClickFeedbackEvent(event) {
        return ['click_event', 'feedback_event'].includes(event.type);
    }

    _isRouteableMembershipEvent(event) {
        return ['signup_event', 'subscription_event'].includes(event.type);
    }

    getRoute(event) {
        if (this._isRouteableClickFeedbackEvent(event) && event.data.post) {
            return {
                name: 'posts-x',
                model: event.data.post.id
            };
        }

        if (this._isRouteableMembershipEvent(event) && event.data.attribution_type === 'post') {
            return {
                name: 'posts-x',
                model: event.data.attribution_id
            };
        }

        return;
    }
}