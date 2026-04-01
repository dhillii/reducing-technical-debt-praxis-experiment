```javascript
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

    /**
     * Determines if event is a signup event
     */
    isSignupEvent(event) {
        return event.type === 'signup_event' || (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup);
    }

    /**
     * Determines if event is a newsletter subscription event
     */
    isNewsletterEvent(event) {
        return event.type === 'newsletter_event';
    }

    /**
     * Determines if event is a subscription event
     */
    isSubscriptionEvent(event) {
        return event.type === 'subscription_event';
    }

    /**
     * Determines if event is an email event
     */
    isEmailEvent(event) {
        return ['email_opened_event', 'email_sent_event', 'automated_email_sent_event', 'email_delivered_event', 'email_failed_event', 'email_complaint_event'].includes(event.type);
    }

    /**
     * Determines if event is a click or feedback event
     */
    isClickOrFeedbackEvent(event) {
        return ['click_event', 'aggregated_click_event', 'feedback_event'].includes(event.type);
    }

    /**
     * Determines if event is a post-related event
     */
    isPostRelatedEvent(event) {
        return ['comment_event', 'click_event', 'feedback_event'].includes(event.type);
    }

    /**
     * Determines if event is an attribution event
     */
    isAttributionEvent(event) {
        return ['signup_event', 'subscription_event', 'donation_event'].includes(event.type);
    }

    /**
     * Gets icon for login event
     */
    getLoginIcon() {
        return 'event-logged-in';
    }

    /**
     * Gets icon for payment event
     */
    getPaymentIcon() {
        return 'event-subscriptions';
    }

    /**
     * Gets icon for newsletter event
     */
    getNewsletterIcon(event) {
        const icon = event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
        return 'event-' + icon;
    }

    /**
     * Gets icon for subscription event
     */
    getSubscriptionIcon(event) {
        if (event.data.type === 'canceled') {
            return 'event-canceled-subscription';
        }
        return 'event-subscriptions';
    }

    /**
     * Gets icon for signup event
     */
    getSignupIcon() {
        return 'event-signed-up';
    }

    /**
     * Gets icon for email opened event
     */
    getEmailOpenedIcon() {
        return 'event-opened-email';
    }

    /**
     * Gets icon for email sent event
     */
    getEmailSentIcon() {
        return 'event-sent-email';
    }

    /**
     * Gets icon for email delivered event
     */
    getEmailDeliveredIcon() {
        return 'event-received-email';
    }

    /**
     * Gets icon for email failed event
     */
    getEmailFailedIcon() {
        return 'event-email-delivery-failed';
    }

    /**
     * Gets icon for email complaint event
     */
    getEmailComplaintIcon() {
        return 'event-email-delivery-spam';
    }

    /**
     * Gets icon for comment event
     */
    getCommentIcon() {
        return 'event-comment';
    }

    /**
     * Gets icon for click event
     */
    getClickIcon() {
        return 'event-click';
    }

    /**
     * Gets icon for feedback event
     */
    getFeedbackIcon(event) {
        const icon = event.data.score === 1 ? 'more-like-this' : 'less-like-this';
        return 'event-' + icon;
    }

    /**
     * Gets icon for donation event
     */
    getDonationIcon() {
        return 'event-subscriptions';
    }

    /**
     * Gets icon for email change event
     */
    getEmailChangeIcon() {
        return 'event-email-changed';
    }

    getIcon(event) {
        if (event.type === 'login_event') {
            return this.getLoginIcon();
        }

        if (event.type === 'payment_event') {
            return this.getPaymentIcon();
        }

        if (this.isNewsletterEvent(event)) {
            return this.getNewsletterIcon(event);
        }

        if (this.isSubscriptionEvent(event)) {
            return this.getSubscriptionIcon(event);
        }

        if (this.isSignupEvent(event)) {
            return this.getSignupIcon();
        }

        if (event.type === 'email_opened_event') {
            return this.getEmailOpenedIcon();
        }

        if (event.type === 'email_sent_event') {
            return this.getEmailSentIcon();
        }

        if (event.type === 'automated_email_sent_event') {
            return this.getEmailSentIcon();
        }

        if (event.type === 'email_delivered_event') {
            return this.getEmailDeliveredIcon();
        }

        if (event.type === 'email_failed_event') {
            return this.getEmailFailedIcon();
        }

        if (event.type === 'email_complaint_event') {
            return this.getEmailComplaintIcon();
        }

        if (event.type === 'comment_event') {
            return this.getCommentIcon();
        }

        if (event.type === 'click_event' || event.type === 'aggregated_click_event') {
            return this.getClickIcon();
        }

        if (event.type === 'feedback_event') {
            return this.getFeedbackIcon(event);
        }

        if (event.type === 'donation_event') {
            return this.getDonationIcon();
        }

        if (event.type === 'email_change_event') {
            return this.getEmailChangeIcon();
        }

        return 'event-unknown';
    }

    /**
     * Gets action for signup event
     */
    getSignupAction() {
        return 'signed up';
    }

    /**
     * Gets action for login event
     */
    getLoginAction() {
        return 'logged in';
    }

    /**
     * Gets action for payment event
     */
    getPaymentAction() {
        return 'made payment';
    }

    /**
     * Gets action for newsletter event
     */
    getNewsletterAction(event, hasMultipleNewsletters) {
        let newsletter = 'newsletter';
        if (hasMultipleNewsletters && event.data.newsletter && event.data.newsletter.name) {
            newsletter = event.data.newsletter.name;
        }

        if (event.data.subscribed) {
            return 'subscribed to ' + newsletter;
        }
        return 'unsubscribed from ' + newsletter;
    }

    /**
     * Gets action for subscription event
     */
    getSubscriptionAction(event) {
        switch (event.data.type) {
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

    /**
     * Gets action for email opened event
     */
    getEmailOpenedAction() {
        return 'opened email';
    }

    /**
     * Gets action for email sent event
     */
    getEmailSentAction() {
        return 'sent email';
    }

    /**
     * Gets action for automated email sent event
     */
    getAutomatedEmailSentAction(event) {
        const slug = event.data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    /**
     * Gets action for email delivered event
     */
    getEmailDeliveredAction() {
        return 'received email';
    }

    /**
     * Gets action for email failed event
     */
    getEmailFailedAction() {
        return 'bounced email';
    }

    /**
     * Gets action for email complaint event
     */
    getEmailComplaintAction() {
        return 'email flagged as spam';
    }

    /**
     * Gets action for comment event
     */
    getCommentAction(event) {
        if (event.data.parent) {
            return 'replied to comment';
        }
        return 'commented';
    }

    /**
     * Gets action for click event
     */
    getClickAction() {
        return 'clicked link in email';
    }

    /**
     * Gets action for aggregated click event
     */
    getAggregatedClickAction(event) {
        if (event.data.count.clicks <= 1) {
            return 'clicked link in email';
        }
        return `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
    }

    /**
     * Gets action for feedback event
     */
    getFeedbackAction(event) {
        if (event.data.score === 1) {
            return 'more like this';
        }
        return 'less like this';
    }

    /**
     * Gets action for email change event
     */
    getEmailChangeAction(event) {
        if (event.data.from_email && event.data.to_email) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }
        return 'Email address changed';
    }

    /**
     * Gets action for donation event
     */
    getDonationAction() {
        return 'Made a one-time payment';
    }

    getAction(event, hasMultipleNewsletters) {
        if (this.isSignupEvent(event)) {
            return this.getSignupAction();
        }

        if (event.type === 'login_event') {
            return this.getLoginAction();
        }

        if (event.type === 'payment_event') {
            return this.getPaymentAction();
        }

        if (this.isNewsletterEvent(event)) {
            return this.getNewsletterAction(event, hasMultipleNewsletters);
        }

        if (this.isSubscriptionEvent(event)) {
            return this.getSubscriptionAction(event);
        }

        if (event.type === 'email_opened_event') {
            return this.getEmailOpenedAction();
        }

        if (event.type === 'email_sent_event') {
            return this.getEmailSentAction();
        }

        if (event.type === 'automated_email_sent_event') {
            return this.getAutomatedEmailSentAction(event);
        }

        if (event.type === 'email_delivered_event') {
            return this.getEmailDeliveredAction();
        }

        if (event.type === 'email_failed_event') {
            return this.getEmailFailedAction();
        }

        if (event.type === 'email_complaint_event') {
            return this.getEmailComplaintAction();
        }

        if (event.type === 'comment_event') {
            return this.getCommentAction(event);
        }

        if (event.type === 'click_event') {
            return this.getClickAction();
        }

        if (event.type === 'aggregated_click_event') {
            return this.getAggregatedClickAction(event);
        }

        if (event.type === 'feedback_event') {
            return this.getFeedbackAction(event);
        }

        if (event.type === 'email_change_event') {
            return this.getEmailChangeAction(event);
        }

        if (event.type === 'donation_event') {
            return this.getDonationAction();
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
    getObject(event) {
        if (this.isAttributionEvent(event)) {
            if (event.data.attribution?.title) {
                return event.data.attribution.title;
            }
        }

        if (event.type === 'comment_event') {
            if (event.data.post) {
                return event.data.post.title;
            }
        }

        if (event.type === 'click_event' || event.type === 'feedback_event') {
            if (event.data.post) {
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

    /**
     * Gets info for subscription event
     */
    getSubscriptionInfo(event) {
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

    /**
     * Gets info for signup event
     */
    getSignupInfo() {
        if (this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }
    }

    /**
     * Gets info for donation event
     */
    getDonationInfo(event) {
        const symbol = getSymbol(event.data.currency);
        const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
        return formattedAmount;
    }

    getInfo(event) {
        if (this.isSubscriptionEvent(event)) {
            return this.getSubscriptionInfo(event);
        }

        if (event.type === 'signup_event') {
            return this.getSignupInfo();
        }

        if (event.type === 'donation_event') {
            return this.getDonationInfo(event);
        }
    }

    getDescription(event) {
        if (event.type === 'click_event') {
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
        if (this.isPostRelatedEvent(event)) {
            if (event.data.post) {
                return event.data.post.url;
            }
        }

        if (this.isAttributionEvent(event)) {
            if (event.data.attribution && event.data.attribution.url) {
                return event.data.attribution.url;
            }
        }
    }

    /**
     * Get internal route props for a clickable object
     */
    getRoute(event) {
        if (event.type === 'click_event' || event.type === 'feedback_event') {
            if (event.data.post) {
                return {
                    name: 'posts-x',
                    model: event.data.post.id
                };
            }
        }

        if (event.type === 'signup_event' || event.type === 'subscription_event') {
            if (event.data.attribution_type === 'post') {
                return {
                    name: 'posts-x',
                    model: event.data.attribution_id
                };
            }
        }
    }
}
```