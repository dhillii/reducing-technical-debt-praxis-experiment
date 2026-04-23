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

    /**
     * Extracts the subject line from event data
     */
    getSubject(event, memberName) {
        if (event.data.member) {
            return memberName || event.data.member.email;
        }
        return event.data.name || event.data.email || '';
    }

    /**
     * Determines the icon based on event type and data
     */
    getIcon(event) {
        if (this.isLoginEvent(event)) {
            return 'logged-in';
        }

        if (this.isPaymentEvent(event)) {
            return 'subscriptions';
        }

        if (this.isNewsletterEvent(event)) {
            return this.getNewsletterIcon(event);
        }

        if (this.isSubscriptionEvent(event)) {
            return this.getSubscriptionIcon(event);
        }

        if (this.isSignupEvent(event)) {
            return 'signed-up';
        }

        if (this.isEmailOpenedEvent(event)) {
            return 'opened-email';
        }

        if (this.isEmailSentEvent(event)) {
            return 'sent-email';
        }

        if (this.isAutomatedEmailSentEvent(event)) {
            return 'sent-email';
        }

        if (this.isEmailDeliveredEvent(event)) {
            return 'received-email';
        }

        if (this.isEmailFailedEvent(event)) {
            return 'email-delivery-failed';
        }

        if (this.isEmailComplaintEvent(event)) {
            return 'email-delivery-spam';
        }

        if (this.isCommentEvent(event)) {
            return 'comment';
        }

        if (this.isClickEvent(event)) {
            return 'click';
        }

        if (this.isFeedbackEvent(event)) {
            return this.getFeedbackIcon(event);
        }

        if (this.isDonationEvent(event)) {
            return 'subscriptions';
        }

        if (this.isEmailChangeEvent(event)) {
            return 'email-changed';
        }

        return 'event-' + 'default';
    }

    /**
     * Checks if event is a login event
     */
    isLoginEvent(event) {
        return event.type === 'login_event';
    }

    /**
     * Checks if event is a payment event
     */
    isPaymentEvent(event) {
        return event.type === 'payment_event';
    }

    /**
     * Checks if event is a newsletter event
     */
    isNewsletterEvent(event) {
        return event.type === 'newsletter_event';
    }

    /**
     * Checks if event is a subscription event
     */
    isSubscriptionEvent(event) {
        return event.type === 'subscription_event';
    }

    /**
     * Checks if event is a signup event
     */
    isSignupEvent(event) {
        return event.type === 'signup_event' ||
            (event.type === 'subscription_event' &&
                event.data.type === 'created' &&
                event.data.signup);
    }

    /**
     * Checks if event is an email opened event
     */
    isEmailOpenedEvent(event) {
        return event.type === 'email_opened_event';
    }

    /**
     * Checks if event is an email sent event
     */
    isEmailSentEvent(event) {
        return event.type === 'email_sent_event';
    }

    /**
     * Checks if event is an automated email sent event
     */
    isAutomatedEmailSentEvent(event) {
        return event.type === 'automated_email_sent_event';
    }

    /**
     * Checks if event is an email delivered event
     */
    isEmailDeliveredEvent(event) {
        return event.type === 'email_delivered_event';
    }

    /**
     * Checks if event is an email failed event
     */
    isEmailFailedEvent(event) {
        return event.type === 'email_failed_event';
    }

    /**
     * Checks if event is an email complaint event
     */
    isEmailComplaintEvent(event) {
        return event.type === 'email_complaint_event';
    }

    /**
     * Checks if event is a comment event
     */
    isCommentEvent(event) {
        return event.type === 'comment_event';
    }

    /**
     * Checks if event is a click event
     */
    isClickEvent(event) {
        return event.type === 'click_event' || event.type === 'aggregated_click_event';
    }

    /**
     * Checks if event is a feedback event
     */
    isFeedbackEvent(event) {
        return event.type === 'feedback_event';
    }

    /**
     * Checks if event is a donation event
     */
    isDonationEvent(event) {
        return event.type === 'donation_event';
    }

    /**
     * Checks if event is an email change event
     */
    isEmailChangeEvent(event) {
        return event.type === 'email_change_event';
    }

    /**
     * Gets the icon for newsletter events
     */
    getNewsletterIcon(event) {
        if (event.data.subscribed) {
            return 'subscribed-to-email';
        }
        return 'unsubscribed-from-email';
    }

    /**
     * Gets the icon for subscription events
     */
    getSubscriptionIcon(event) {
        if (event.data.type === 'canceled') {
            return 'canceled-subscription';
        }
        return 'subscriptions';
    }

    /**
     * Gets the icon for feedback events
     */
    getFeedbackIcon(event) {
        if (event.data.score === 1) {
            return 'more-like-this';
        }
        return 'less-like-this';
    }

    /**
     * Determines the action text based on event type and data
     */
    getAction(event, hasMultipleNewsletters) {
        if (this.isSignupEvent(event)) {
            return 'signed up';
        }

        if (this.isLoginEvent(event)) {
            return 'logged in';
        }

        if (this.isPaymentEvent(event)) {
            return 'made payment';
        }

        if (this.isNewsletterEvent(event)) {
            return this.getNewsletterAction(event, hasMultipleNewsletters);
        }

        if (this.isSubscriptionEvent(event)) {
            return this.getSubscriptionAction(event);
        }

        if (this.isEmailOpenedEvent(event)) {
            return 'opened email';
        }

        if (this.isEmailSentEvent(event)) {
            return 'sent email';
        }

        if (this.isAutomatedEmailSentEvent(event)) {
            return this.getAutomatedEmailAction(event);
        }

        if (this.isEmailDeliveredEvent(event)) {
            return 'received email';
        }

        if (this.isEmailFailedEvent(event)) {
            return 'bounced email';
        }

        if (this.isEmailComplaintEvent(event)) {
            return 'email flagged as spam';
        }

        if (this.isCommentEvent(event)) {
            return this.getCommentAction(event);
        }

        if (this.isClickEvent(event)) {
            return this.getClickAction(event);
        }

        if (this.isFeedbackEvent(event)) {
            return this.getFeedbackAction(event);
        }

        if (this.isEmailChangeEvent(event)) {
            return this.getEmailChangeAction(event);
        }

        if (this.isDonationEvent(event)) {
            return 'Made a one-time payment';
        }

        return '';
    }

    /**
     * Gets the action text for newsletter events
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
     * Gets the action text for subscription events
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
     * Gets the action text for automated email events
     */
    getAutomatedEmailAction(event) {
        const slug = event.data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    /**
     * Gets the action text for comment events
     */
    getCommentAction(event) {
        if (event.data.parent) {
            return 'replied to comment';
        }
        return 'commented';
    }

    /**
     * Gets the action text for click events
     */
    getClickAction(event) {
        if (event.type === 'aggregated_click_event') {
            if (event.data.count.clicks <= 1) {
                return 'clicked link in email';
            }
            return `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
        }
        return 'clicked link in email';
    }

    /**
     * Gets the action text for feedback events
     */
    getFeedbackAction(event) {
        if (event.data.score === 1) {
            return 'more like this';
        }
        return 'less like this';
    }

    /**
     * Gets the action text for email change events
     */
    getEmailChangeAction(event) {
        if (event.data.from_email && event.data.to_email) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }
        return 'Email address changed';
    }

    /**
     * Returns the join string between action and object
     */
    getJoin() {
        return '–';
    }

    /**
     * Gets the clickable object for the event
     */
    getObject(event) {
        if (this.isSignupEvent(event) || this.isSubscriptionEvent(event) || this.isDonationEvent(event)) {
            if (event.data.attribution?.title) {
                return event.data.attribution.title;
            }
        }

        if (this.isCommentEvent(event)) {
            if (event.data.post) {
                return event.data.post.title;
            }
        }

        if (this.isClickEvent(event) || this.isFeedbackEvent(event)) {
            if (event.data.post) {
                return event.data.post.title;
            }
        }

        return '';
    }

    /**
     * Gets the source information for the event
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
     * Gets the info text for the event
     */
    getInfo(event) {
        if (this.isSubscriptionEvent(event)) {
            return this.getSubscriptionInfo(event);
        }

        if (this.isSignupEvent(event) && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }

        if (this.isDonationEvent(event)) {
            return this.getDonationInfo(event);
        }

        return;
    }

    /**
     * Gets the info text for subscription events
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
     * Gets the info text for donation events
     */
    getDonationInfo(event) {
        const symbol = getSymbol(event.data.currency);
        const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
        return formattedAmount;
    }

    /**
     * Gets the description for the event
     */
    getDescription(event) {
        if (this.isClickEvent(event)) {
            return this.getClickDescription(event);
        }
        return;
    }

    /**
     * Gets the description for click events
     */
    getClickDescription(event) {
        // Clean URL
        try {
            return this.utils.cleanTrackedUrl(event.data.link.to, true);
        } catch (e) {
            // Invalid URL
        }
        return event.data.link.to;
    }

    /**
     * Gets the URL for the event
     */
    getURL(event) {
        if (this.isCommentEvent(event) || this.isClickEvent(event) || this.isFeedbackEvent(event)) {
            if (event.data.post) {
                return event.data.post.url;
            }
        }

        if (this.isSignupEvent(event) || this.isSubscriptionEvent(event) || this.isDonationEvent(event)) {
            if (event.data.attribution && event.data.attribution.url) {
                return event.data.attribution.url;
            }
        }
        return;
    }

    /**
     * Gets the route for the event
     */
    getRoute(event) {
        if (this.isClickEvent(event) || this.isFeedbackEvent(event)) {
            if (event.data.post) {
                return {
                    name: 'posts-x',
                    model: event.data.post.id
                };
            }
        }

        if (this.isSignupEvent(event) || this.isSubscriptionEvent(event)) {
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