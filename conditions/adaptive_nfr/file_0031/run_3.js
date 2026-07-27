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

    /** @private Determines icon for login events */
    _getLoginEventIcon() {
        return 'logged-in';
    }

    /** @private Determines icon for payment events */
    _getPaymentEventIcon() {
        return 'subscriptions';
    }

    /** @private Determines icon for newsletter events */
    _getNewsletterEventIcon(event) {
        return event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
    }

    /** @private Determines icon for subscription events */
    _getSubscriptionEventIcon(event) {
        if (event.data.type === 'canceled') {
            return 'canceled-subscription';
        }
        return 'subscriptions';
    }

    /** @private Checks if event is a signup or subscription creation with signup flag */
    _isSignupEvent(event) {
        return event.type === 'signup_event' || (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup);
    }

    /** @private Determines icon for email opened events */
    _getEmailOpenedEventIcon() {
        return 'opened-email';
    }

    /** @private Determines icon for email sent events */
    _getEmailSentEventIcon() {
        return 'sent-email';
    }

    /** @private Determines icon for automated email sent events */
    _getAutomatedEmailSentEventIcon() {
        return 'sent-email';
    }

    /** @private Determines icon for email delivered events */
    _getEmailDeliveredEventIcon() {
        return 'received-email';
    }

    /** @private Determines icon for email failed events */
    _getEmailFailedEventIcon() {
        return 'email-delivery-failed';
    }

    /** @private Determines icon for email complaint events */
    _getEmailComplaintEventIcon() {
        return 'email-delivery-spam';
    }

    /** @private Determines icon for comment events */
    _getCommentEventIcon() {
        return 'comment';
    }

    /** @private Checks if event is a click event */
    _isClickEvent(event) {
        return event.type === 'click_event' || event.type === 'aggregated_click_event';
    }

    /** @private Determines icon for click events */
    _getClickEventIcon() {
        return 'click';
    }

    /** @private Determines icon for feedback events */
    _getFeedbackEventIcon(event) {
        return event.data.score === 1 ? 'more-like-this' : 'less-like-this';
    }

    /** @private Determines icon for donation events */
    _getDonationEventIcon() {
        return 'subscriptions';
    }

    /** @private Determines icon for email change events */
    _getEmailChangeEventIcon() {
        return 'email-changed';
    }

    getIcon(event) {
        let icon;

        if (event.type === 'login_event') {
            icon = this._getLoginEventIcon();
        } else if (event.type === 'payment_event') {
            icon = this._getPaymentEventIcon();
        } else if (event.type === 'newsletter_event') {
            icon = this._getNewsletterEventIcon(event);
        } else if (event.type === 'subscription_event') {
            icon = this._getSubscriptionEventIcon(event);
        } else if (this._isSignupEvent(event)) {
            icon = 'signed-up';
        } else if (event.type === 'email_opened_event') {
            icon = this._getEmailOpenedEventIcon();
        } else if (event.type === 'email_sent_event') {
            icon = this._getEmailSentEventIcon();
        } else if (event.type === 'automated_email_sent_event') {
            icon = this._getAutomatedEmailSentEventIcon();
        } else if (event.type === 'email_delivered_event') {
            icon = this._getEmailDeliveredEventIcon();
        } else if (event.type === 'email_failed_event') {
            icon = this._getEmailFailedEventIcon();
        } else if (event.type === 'email_complaint_event') {
            icon = this._getEmailComplaintEventIcon();
        } else if (event.type === 'comment_event') {
            icon = this._getCommentEventIcon();
        } else if (this._isClickEvent(event)) {
            icon = this._getClickEventIcon();
        } else if (event.type === 'feedback_event') {
            icon = this._getFeedbackEventIcon(event);
        } else if (event.type === 'donation_event') {
            icon = this._getDonationEventIcon();
        } else if (event.type === 'email_change_event') {
            icon = this._getEmailChangeEventIcon();
        }

        return 'event-' + icon;
    }

    /** @private Checks if event is a signup event */
    _isSignupEventAction(event) {
        return event.type === 'signup_event' || (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup);
    }

    /** @private Gets newsletter name for action text */
    _getNewsletterName(event, hasMultipleNewsletters) {
        if (hasMultipleNewsletters && event.data.newsletter && event.data.newsletter.name) {
            return event.data.newsletter.name;
        }
        return 'newsletter';
    }

    /** @private Gets newsletter subscription action text */
    _getNewsletterAction(event, hasMultipleNewsletters) {
        const newsletter = this._getNewsletterName(event, hasMultipleNewsletters);
        return event.data.subscribed ? `subscribed to ${newsletter}` : `unsubscribed from ${newsletter}`;
    }

    /** @private Gets subscription event action text */
    _getSubscriptionAction(event) {
        const typeMap = {
            'created': 'started paid subscription',
            'updated': 'changed paid subscription',
            'canceled': 'canceled paid subscription',
            'reactivated': 'reactivated paid subscription',
            'expired': 'ended paid subscription'
        };
        return typeMap[event.data.type] || 'changed paid subscription';
    }

    /** @private Gets automated email sent action text */
    _getAutomatedEmailSentAction(event) {
        const slug = event.data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    /** @private Gets comment event action text */
    _getCommentAction(event) {
        return event.data.parent ? 'replied to comment' : 'commented';
    }

    /** @private Gets aggregated click event action text */
    _getAggregatedClickAction(event) {
        if (event.data.count.clicks <= 1) {
            return 'clicked link in email';
        }
        return `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
    }

    /** @private Gets feedback event action text */
    _getFeedbackAction(event) {
        return event.data.score === 1 ? 'more like this' : 'less like this';
    }

    /** @private Gets email change event action text */
    _getEmailChangeAction(event) {
        if (event.data.from_email && event.data.to_email) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }
        return 'Email address changed';
    }

    getAction(event, hasMultipleNewsletters) {
        if (this._isSignupEventAction(event)) {
            return 'signed up';
        }

        if (event.type === 'login_event') {
            return 'logged in';
        }

        if (event.type === 'payment_event') {
            return 'made payment';
        }

        if (event.type === 'newsletter_event') {
            return this._getNewsletterAction(event, hasMultipleNewsletters);
        }

        if (event.type === 'subscription_event') {
            return this._getSubscriptionAction(event);
        }

        if (event.type === 'email_opened_event') {
            return 'opened email';
        }

        if (event.type === 'email_sent_event') {
            return 'sent email';
        }

        if (event.type === 'automated_email_sent_event') {
            return this._getAutomatedEmailSentAction(event);
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

        if (event.type === 'comment_event') {
            return this._getCommentAction(event);
        }

        if (event.type === 'click_event') {
            return 'clicked link in email';
        }

        if (event.type === 'aggregated_click_event') {
            return this._getAggregatedClickAction(event);
        }

        if (event.type === 'feedback_event') {
            return this._getFeedbackAction(event);
        }

        if (event.type === 'email_change_event') {
            return this._getEmailChangeAction(event);
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

    /** @private Checks if event has attribution title */
    _hasAttributionTitle(event) {
        return event.data.attribution?.title;
    }

    /** @private Checks if event has post data */
    _hasPostData(event) {
        return event.data.post;
    }

    /** @private Gets object for signup/subscription/donation events */
    _getAttributionObject(event) {
        if (this._hasAttributionTitle(event)) {
            return event.data.attribution.title;
        }
        return '';
    }

    /** @private Gets object for comment/click/feedback events */
    _getPostObject(event) {
        if (this._hasPostData(event)) {
            return event.data.post.title;
        }
        return '';
    }

    /**
     * Clickable object, shown between action and info, or in a separate column in some views
     */
    getObject(event) {
        if (event.type === 'signup_event' || event.type === 'subscription_event' || event.type === 'donation_event') {
            return this._getAttributionObject(event);
        }

        if (event.type === 'comment_event') {
            return this._getPostObject(event);
        }

        if (event.type === 'click_event' || event.type === 'feedback_event') {
            return this._getPostObject(event);
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

    /** @private Gets info for subscription events */
    _getSubscriptionInfo(event) {
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

    /** @private Gets info for donation events */
    _getDonationInfo(event) {
        const symbol = getSymbol(event.data.currency);
        const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
        return formattedAmount;
    }

    getInfo(event) {
        if (event.type === 'subscription_event') {
            return this._getSubscriptionInfo(event);
        }

        if (event.type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }

        if (event.type === 'donation_event') {
            return this._getDonationInfo(event);
        }

        return;
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
        return;
    }

    /** @private Checks if event type is in the provided list */
    _isEventType(event, types) {
        return types.includes(event.type);
    }

    /** @private Gets URL for comment/click/feedback events */
    _getPostUrl(event) {
        if (this._hasPostData(event)) {
            return event.data.post.url;
        }
        return;
    }

    /** @private Gets URL for signup/subscription/donation events */
    _getAttributionUrl(event) {
        if (event.data.attribution && event.data.attribution.url) {
            return event.data.attribution.url;
        }
        return;
    }

    /**
     * Make the object clickable
     */
    getURL(event) {
        if (this._isEventType(event, ['comment_event', 'click_event', 'feedback_event'])) {
            return this._getPostUrl(event);
        }

        if (this._isEventType(event, ['signup_event', 'subscription_event', 'donation_event'])) {
            return this._getAttributionUrl(event);
        }
        return;
    }

    /** @private Gets route for click/feedback events */
    _getPostRoute(event) {
        if (this._hasPostData(event)) {
            return {
                name: 'posts-x',
                model: event.data.post.id
            };
        }
        return;
    }

    /** @private Gets route for signup/subscription events */
    _getAttributionRoute(event) {
        if (event.data.attribution_type === 'post') {
            return {
                name: 'posts-x',
                model: event.data.attribution_id
            };
        }
        return;
    }

    /**
     * Get internal route props for a clickable object
     */
    getRoute(event) {
        if (this._isEventType(event, ['click_event', 'feedback_event'])) {
            return this._getPostRoute(event);
        }

        if (this._isEventType(event, ['signup_event', 'subscription_event'])) {
            return this._getAttributionRoute(event);
        }
        return;
    }
}