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

    getIcon(event) {
        if (this.isSignupEvent(event)) {
            return 'event-signed-up';
        }

        if (event.type === 'login_event') {
            return 'event-logged-in';
        }

        if (event.type === 'payment_event') {
            return 'event-subscriptions';
        }

        if (this.isNewsletterEvent(event)) {
            return event.data.subscribed ? 'event-subscribed-to-email' : 'event-unsubscribed-from-email';
        }

        if (this.isSubscriptionEvent(event)) {
            return event.data.type === 'canceled' ? 'event-canceled-subscription' : 'event-subscriptions';
        }

        if (event.type === 'email_opened_event') {
            return 'event-opened-email';
        }

        if (event.type === 'email_sent_event') {
            return 'event-sent-email';
        }

        if (event.type === 'automated_email_sent_event') {
            return 'event-sent-email';
        }

        if (event.type === 'email_delivered_event') {
            return 'event-received-email';
        }

        if (event.type === 'email_failed_event') {
            return 'event-email-delivery-failed';
        }

        if (event.type === 'email_complaint_event') {
            return 'event-email-delivery-spam';
        }

        if (event.type === 'comment_event') {
            return 'event-comment';
        }

        if (event.type === 'click_event' || event.type === 'aggregated_click_event') {
            return 'event-click';
        }

        if (event.type === 'feedback_event') {
            return event.data.score === 1 ? 'event-more-like-this' : 'event-less-like-this';
        }

        if (event.type === 'donation_event') {
            return 'event-subscriptions';
        }

        if (event.type === 'email_change_event') {
            return 'event-email-changed';
        }

        return 'event-unknown';
    }

    getAction(event, hasMultipleNewsletters) {
        if (this.isSignupEvent(event)) {
            return 'signed up';
        }

        if (event.type === 'login_event') {
            return 'logged in';
        }

        if (event.type === 'payment_event') {
            return 'made payment';
        }

        if (this.isNewsletterEvent(event)) {
            return this.getNewsletterAction(event, hasMultipleNewsletters);
        }

        if (this.isSubscriptionEvent(event)) {
            return this.getSubscriptionAction(event);
        }

        if (event.type === 'email_opened_event') {
            return 'opened email';
        }

        if (event.type === 'email_sent_event') {
            return 'sent email';
        }

        if (event.type === 'automated_email_sent_event') {
            return this.getAutomatedEmailAction(event);
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
            return event.data.parent ? 'replied to comment' : 'commented';
        }

        if (event.type === 'click_event') {
            return 'clicked link in email';
        }

        if (event.type === 'aggregated_click_event') {
            return this.getAggregatedClickAction(event);
        }

        if (event.type === 'feedback_event') {
            return event.data.score === 1 ? 'more like this' : 'less like this';
        }

        if (event.type === 'email_change_event') {
            return this.getEmailChangeAction(event);
        }

        if (event.type === 'donation_event') {
            return 'Made a one-time payment';
        }
    }

    /**
     * Get action text for newsletter events
     */
    getNewsletterAction(event, hasMultipleNewsletters) {
        let newsletter = 'newsletter';
        if (hasMultipleNewsletters && event.data.newsletter && event.data.newsletter.name) {
            newsletter = event.data.newsletter.name;
        }

        return event.data.subscribed ? `subscribed to ${newsletter}` : `unsubscribed from ${newsletter}`;
    }

    /**
     * Get action text for subscription events
     */
    getSubscriptionAction(event) {
        const actionMap = {
            'created': 'started paid subscription',
            'updated': 'changed paid subscription',
            'canceled': 'canceled paid subscription',
            'reactivated': 'reactivated paid subscription',
            'expired': 'ended paid subscription'
        };

        return actionMap[event.data.type] || 'changed paid subscription';
    }

    /**
     * Get action text for automated email events
     */
    getAutomatedEmailAction(event) {
        const slug = event.data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    /**
     * Get action text for aggregated click events
     */
    getAggregatedClickAction(event) {
        if (event.data.count.clicks <= 1) {
            return 'clicked link in email';
        }
        return `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
    }

    /**
     * Get action text for email change events
     */
    getEmailChangeAction(event) {
        if (event.data.from_email && event.data.to_email) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }
        return 'Email address changed';
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
     * Get source information from event attribution
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
     * Get info text for subscription events
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
     * Get info text for donation events
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

        if (event.type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }

        if (event.type === 'donation_event') {
            return this.getDonationInfo(event);
        }

        return;
    }

    getDescription(event) {
        if (event.type === 'click_event') {
            return this.getClickEventDescription(event);
        }
        return;
    }

    /**
     * Get description for click events
     */
    getClickEventDescription(event) {
        try {
            return this.utils.cleanTrackedUrl(event.data.link.to, true);
        } catch (e) {
            // Invalid URL
        }
        return event.data.link.to;
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
        return;
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
        return;
    }
}
```