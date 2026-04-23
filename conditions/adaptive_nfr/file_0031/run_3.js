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

    /* internal helper functions */

    /** @private */
    isLoginEvent(event) {
        return event.type === 'login_event';
    }

    /** @private */
    isPaymentEvent(event) {
        return event.type === 'payment_event';
    }

    /** @private */
    isNewsletterEvent(event) {
        return event.type === 'newsletter_event';
    }

    /** @private */
    isSubscriptionEvent(event) {
        return event.type === 'subscription_event';
    }

    /** @private */
    isSignupEvent(event) {
        return event.type === 'signup_event';
    }

    /** @private */
    isSignupOrNewSubscription(event) {
        return this.isSignupEvent(event) || (this.isSubscriptionEvent(event) && event.data.type === 'created' && event.data.signup);
    }

    /** @private */
    isEmailOpenedEvent(event) {
        return event.type === 'email_opened_event';
    }

    /** @private */
    isEmailSentEvent(event) {
        return event.type === 'email_sent_event';
    }

    /** @private */
    isAutomatedEmailSentEvent(event) {
        return event.type === 'automated_email_sent_event';
    }

    /** @private */
    isEmailDeliveredEvent(event) {
        return event.type === 'email_delivered_event';
    }

    /** @private */
    isEmailFailedEvent(event) {
        return event.type === 'email_failed_event';
    }

    /** @private */
    isEmailComplaintEvent(event) {
        return event.type === 'email_complaint_event';
    }

    /** @private */
    isCommentEvent(event) {
        return event.type === 'comment_event';
    }

    /** @private */
    isClickEvent(event) {
        return event.type === 'click_event';
    }

    /** @private */
    isAggregatedClickEvent(event) {
        return event.type === 'aggregated_click_event';
    }

    /** @private */
    isFeedbackEvent(event) {
        return event.type === 'feedback_event';
    }

    /** @private */
    isDonationEvent(event) {
        return event.type === 'donation_event';
    }

    /** @private */
    isEmailChangeEvent(event) {
        return event.type === 'email_change_event';
    }

    /** @private */
    getIconForLogin() {
        return 'event-logged-in';
    }

    /** @private */
    getIconForPayment() {
        return 'event-subscriptions';
    }

    /** @private */
    getIconForNewsletter(event) {
        const baseIcon = event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
        return 'event-' + baseIcon;
    }

    /** @private */
    getIconForSubscription(event) {
        if (event.data.type === 'canceled') {
            return 'event-canceled-subscription';
        }
        return 'event-subscriptions';
    }

    /** @private */
    getIconForSignup() {
        return 'event-signed-up';
    }

    /** @private */
    getIconForEmailOpened() {
        return 'event-opened-email';
    }

    /** @private */
    getIconForEmailSent() {
        return 'event-sent-email';
    }

    /** @private */
    getIconForEmailDelivered() {
        return 'event-received-email';
    }

    /** @private */
    getIconForEmailFailed() {
        return 'event-email-delivery-failed';
    }

    /** @private */
    getIconForEmailComplaint() {
        return 'event-email-delivery-spam';
    }

    /** @private */
    getIconForComment() {
        return 'event-comment';
    }

    /** @private */
    getIconForClick() {
        return 'event-click';
    }

    /** @private */
    getIconForFeedback(event) {
        const baseIcon = event.data.score === 1 ? 'more-like-this' : 'less-like-this';
        return 'event-' + baseIcon;
    }

    /** @private */
    getIconForDonation() {
        return 'event-subscriptions';
    }

    /** @private */
    getIconForEmailChange() {
        return 'event-email-changed';
    }

    getIcon(event) {
        if (this.isLoginEvent(event)) {
            return this.getIconForLogin();
        }

        if (this.isPaymentEvent(event)) {
            return this.getIconForPayment();
        }

        if (this.isNewsletterEvent(event)) {
            return this.getIconForNewsletter(event);
        }

        if (this.isSubscriptionEvent(event)) {
            return this.getIconForSubscription(event);
        }

        if (this.isSignupOrNewSubscription(event)) {
            return this.getIconForSignup();
        }

        if (this.isEmailOpenedEvent(event)) {
            return this.getIconForEmailOpened();
        }

        if (this.isEmailSentEvent(event)) {
            return this.getIconForEmailSent();
        }

        if (this.isAutomatedEmailSentEvent(event)) {
            return this.getIconForEmailSent();
        }

        if (this.isEmailDeliveredEvent(event)) {
            return this.getIconForEmailDelivered();
        }

        if (this.isEmailFailedEvent(event)) {
            return this.getIconForEmailFailed();
        }

        if (this.isEmailComplaintEvent(event)) {
            return this.getIconForEmailComplaint();
        }

        if (this.isCommentEvent(event)) {
            return this.getIconForComment();
        }

        if (this.isClickEvent(event) || this.isAggregatedClickEvent(event)) {
            return this.getIconForClick();
        }

        if (this.isFeedbackEvent(event)) {
            return this.getIconForFeedback(event);
        }

        if (this.isDonationEvent(event)) {
            return this.getIconForDonation();
        }

        if (this.isEmailChangeEvent(event)) {
            return this.getIconForEmailChange();
        }

        return 'event-unknown';
    }

    /** @private */
    getActionForSignup() {
        return 'signed up';
    }

    /** @private */
    getActionForLogin() {
        return 'logged in';
    }

    /** @private */
    getActionForPayment() {
        return 'made payment';
    }

    /** @private */
    getActionForNewsletter(event, hasMultipleNewsletters) {
        let newsletter = 'newsletter';
        if (hasMultipleNewsletters && event.data.newsletter && event.data.newsletter.name) {
            newsletter = event.data.newsletter.name;
        }

        if (event.data.subscribed) {
            return 'subscribed to ' + newsletter;
        }
        return 'unsubscribed from ' + newsletter;
    }

    /** @private */
    getActionForSubscription(event) {
        const typeActions = {
            'created': 'started paid subscription',
            'updated': 'changed paid subscription',
            'canceled': 'canceled paid subscription',
            'reactivated': 'reactivated paid subscription',
            'expired': 'ended paid subscription'
        };

        return typeActions[event.data.type] || 'changed paid subscription';
    }

    /** @private */
    getActionForEmailOpened() {
        return 'opened email';
    }

    /** @private */
    getActionForEmailSent() {
        return 'sent email';
    }

    /** @private */
    getActionForAutomatedEmailSent(event) {
        const slug = event.data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    /** @private */
    getActionForEmailDelivered() {
        return 'received email';
    }

    /** @private */
    getActionForEmailFailed() {
        return 'bounced email';
    }

    /** @private */
    getActionForEmailComplaint() {
        return 'email flagged as spam';
    }

    /** @private */
    getActionForComment(event) {
        if (event.data.parent) {
            return 'replied to comment';
        }
        return 'commented';
    }

    /** @private */
    getActionForClick() {
        return 'clicked link in email';
    }

    /** @private */
    getActionForAggregatedClick(event) {
        if (event.data.count.clicks <= 1) {
            return 'clicked link in email';
        }
        return `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
    }

    /** @private */
    getActionForFeedback(event) {
        if (event.data.score === 1) {
            return 'more like this';
        }
        return 'less like this';
    }

    /** @private */
    getActionForEmailChange(event) {
        if (event.data.from_email && event.data.to_email) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }
        return 'Email address changed';
    }

    /** @private */
    getActionForDonation() {
        return 'Made a one-time payment';
    }

    getAction(event, hasMultipleNewsletters) {
        if (this.isSignupOrNewSubscription(event)) {
            return this.getActionForSignup();
        }

        if (this.isLoginEvent(event)) {
            return this.getActionForLogin();
        }

        if (this.isPaymentEvent(event)) {
            return this.getActionForPayment();
        }

        if (this.isNewsletterEvent(event)) {
            return this.getActionForNewsletter(event, hasMultipleNewsletters);
        }

        if (this.isSubscriptionEvent(event)) {
            return this.getActionForSubscription(event);
        }

        if (this.isEmailOpenedEvent(event)) {
            return this.getActionForEmailOpened();
        }

        if (this.isEmailSentEvent(event)) {
            return this.getActionForEmailSent();
        }

        if (this.isAutomatedEmailSentEvent(event)) {
            return this.getActionForAutomatedEmailSent(event);
        }

        if (this.isEmailDeliveredEvent(event)) {
            return this.getActionForEmailDelivered();
        }

        if (this.isEmailFailedEvent(event)) {
            return this.getActionForEmailFailed();
        }

        if (this.isEmailComplaintEvent(event)) {
            return this.getActionForEmailComplaint();
        }

        if (this.isCommentEvent(event)) {
            return this.getActionForComment(event);
        }

        if (this.isClickEvent(event)) {
            return this.getActionForClick();
        }

        if (this.isAggregatedClickEvent(event)) {
            return this.getActionForAggregatedClick(event);
        }

        if (this.isFeedbackEvent(event)) {
            return this.getActionForFeedback(event);
        }

        if (this.isEmailChangeEvent(event)) {
            return this.getActionForEmailChange(event);
        }

        if (this.isDonationEvent(event)) {
            return this.getActionForDonation();
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

    /** @private */
    hasAttributionTitle(event) {
        return event.data.attribution?.title;
    }

    /** @private */
    hasPostTitle(event) {
        return event.data.post?.title;
    }

    /**
     * Clickable object, shown between action and info, or in a separate column in some views
     */
    getObject(event) {
        if (this.isSignupEvent(event) || this.isSubscriptionEvent(event) || this.isDonationEvent(event)) {
            if (this.hasAttributionTitle(event)) {
                return event.data.attribution.title;
            }
        }

        if (this.isCommentEvent(event)) {
            if (this.hasPostTitle(event)) {
                return event.data.post.title;
            }
        }

        if (this.isClickEvent(event) || this.isFeedbackEvent(event)) {
            if (this.hasPostTitle(event)) {
                return event.data.post.title;
            }
        }

        return '';
    }

    /**
     * Clickable object, shown between action and info, or in a separate column in some views
     */
    getSource(event) {
        if (event.data?.attribution?.referrer_source) {
            return {
                name: event.data.attribution.referrer_source,
                url: event.data.attribution.referrer_url ?? null
            };
        }

        return null;
    }

    /** @private */
    getInfoForSubscription(event) {
        let mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
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

    /** @private */
    getInfoForSignup() {
        if (this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }
    }

    /** @private */
    getInfoForDonation(event) {
        const symbol = getSymbol(event.data.currency);
        const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
        return formattedAmount;
    }

    getInfo(event) {
        if (this.isSubscriptionEvent(event)) {
            return this.getInfoForSubscription(event);
        }

        if (this.isSignupEvent(event)) {
            return this.getInfoForSignup();
        }

        if (this.isDonationEvent(event)) {
            return this.getInfoForDonation(event);
        }
    }

    getDescription(event) {
        if (this.isClickEvent(event)) {
            // Clean URL
            try {
                return this.utils.cleanTrackedUrl(event.data.link.to, true);
            } catch (e) {
                // Invalid URL
            }
            return event.data.link.to;
        }
    }

    /**
     * Make the object clickable
     */
    getURL(event) {
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type)) {
            if (event.data.post) {
                return event.data.post.url;
            }
        }

        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type)) {
            if (event.data.attribution && event.data.attribution.url) {
                return event.data.attribution.url;
            }
        }
    }

    /**
     * Get internal route props for a clickable object
     */
    getRoute(event) {
        if (['click_event', 'feedback_event'].includes(event.type)) {
            if (event.data.post) {
                return {
                    name: 'posts-x',
                    model: event.data.post.id
                };
            }
        }

        if (['signup_event', 'subscription_event'].includes(event.type)) {
            if (event.data.attribution_type === 'post') {
                return {
                    name: 'posts-x',
                    model: event.data.attribution_id
                };
            }
        }
    }
}