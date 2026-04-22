```javascript
import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject as service} from '@ember/service';

/**
 * Helper to parse member events.
 */
export default class ParseMemberEventHelper extends Helper {
    @service feature;
    @service utils;
    @service membersUtils;

    /**
     * Trim a string and convert to null if empty.
     * @param {string} value - The string to trim.
     * @returns {string|null} The trimmed string or null if empty.
     */
    trimString(value) {
        if (!value && value !== 0) {
            return null;
        }
        const trimmed = String(value).trim();
        return trimmed || null;
    }

    /**
     * Compute the parsed event data.
     * @param {Array} params - The event and hasMultipleNewsletters.
     * @returns {Object} The parsed event data.
     */
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
     * Get the subject of the event.
     * @param {Object} event - The event.
     * @param {string} memberName - The member name.
     * @returns {string} The subject of the event.
     */
    getSubject(event, memberName) {
        if (event.data.member) {
            return memberName || event.data.member.email;
        }
        return event.data.name || event.data.email || '';
    }

    /**
     * Get the icon for the event.
     * @param {Object} event - The event.
     * @returns {string} The icon for the event.
     */
    getIcon(event) {
        const iconMap = {
            'login_event': 'logged-in',
            'payment_event': 'subscriptions',
            'newsletter_event': event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email',
            'subscription_event': event.data.type === 'canceled' ? 'canceled-subscription' : 'subscriptions',
            'signup_event': 'signed-up',
            'email_opened_event': 'opened-email',
            'email_sent_event': 'sent-email',
            'automated_email_sent_event': 'sent-email',
            'email_delivered_event': 'received-email',
            'email_failed_event': 'email-delivery-failed',
            'email_complaint_event': 'email-delivery-spam',
            'comment_event': 'comment',
            'click_event': 'click',
            'aggregated_click_event': 'click',
            'feedback_event': event.data.score === 1 ? 'more-like-this' : 'less-like-this',
            'donation_event': 'subscriptions',
            'email_change_event': 'email-changed'
        };
        return 'event-' + (iconMap[event.type] || '');
    }

    /**
     * Get the action for the event.
     * @param {Object} event - The event.
     * @param {boolean} hasMultipleNewsletters - Whether there are multiple newsletters.
     * @returns {string} The action for the event.
     */
    getAction(event, hasMultipleNewsletters) {
        const actionMap = {
            'signup_event': 'signed up',
            'login_event': 'logged in',
            'payment_event': 'made payment',
            'newsletter_event': event.data.subscribed ? `subscribed to ${this.getNewsletterName(event, hasMultipleNewsletters)}` : `unsubscribed from ${this.getNewsletterName(event, hasMultipleNewsletters)}`,
            'subscription_event': this.getSubscriptionAction(event),
            'email_opened_event': 'opened email',
            'email_sent_event': 'sent email',
            'automated_email_sent_event': `received welcome email (${this.getEmailType(event)})`,
            'email_delivered_event': 'received email',
            'email_failed_event': 'bounced email',
            'email_complaint_event': 'email flagged as spam',
            'comment_event': event.data.parent ? 'replied to comment' : 'commented',
            'click_event': 'clicked link in email',
            'aggregated_click_event': event.data.count.clicks <= 1 ? 'clicked link in email' : `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`,
            'feedback_event': event.data.score === 1 ? 'more like this' : 'less like this',
            'email_change_event': this.getEmailChangeAction(event),
            'donation_event': 'Made a one-time payment'
        };
        return actionMap[event.type] || '';
    }

    /**
     * Get the newsletter name.
     * @param {Object} event - The event.
     * @param {boolean} hasMultipleNewsletters - Whether there are multiple newsletters.
     * @returns {string} The newsletter name.
     */
    getNewsletterName(event, hasMultipleNewsletters) {
        if (hasMultipleNewsletters && event.data.newsletter && event.data.newsletter.name) {
            return event.data.newsletter.name;
        }
        return 'newsletter';
    }

    /**
     * Get the subscription action.
     * @param {Object} event - The event.
     * @returns {string} The subscription action.
     */
    getSubscriptionAction(event) {
        const actions = {
            'created': 'started paid subscription',
            'updated': 'changed paid subscription',
            'canceled': 'canceled paid subscription',
            'reactivated': 'reactivated paid subscription',
            'expired': 'ended paid subscription'
        };
        return actions[event.data.type] || 'changed paid subscription';
    }

    /**
     * Get the email type.
     * @param {Object} event - The event.
     * @returns {string} The email type.
     */
    getEmailType(event) {
        const slug = event.data.automatedEmail?.slug || '';
        return slug.includes('paid') ? 'Paid' : 'Free';
    }

    /**
     * Get the email change action.
     * @param {Object} event - The event.
     * @returns {string} The email change action.
     */
    getEmailChangeAction(event) {
        if (event.data.from_email && event.data.to_email) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }
        return 'Email address changed';
    }

    /**
     * Get the join string.
     * @returns {string} The join string.
     */
    getJoin() {
        return '–';
    }

    /**
     * Get the object for the event.
     * @param {Object} event - The event.
     * @returns {string} The object for the event.
     */
    getObject(event) {
        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type)) {
            return event.data.attribution?.title || '';
        }
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type)) {
            return event.data.post?.title || '';
        }
        return '';
    }

    /**
     * Get the source for the event.
     * @param {Object} event - The event.
     * @returns {Object|null} The source for the event.
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
     * Get the info for the event.
     * @param {Object} event - The event.
     * @returns {string} The info for the event.
     */
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
        return '';
    }

    /**
     * Get the subscription info.
     * @param {Object} event - The event.
     * @returns {string} The subscription info.
     */
    getSubscriptionInfo(event) {
        const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
        if (mrrDelta === 0) {
            return '';
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
     * Get the donation info.
     * @param {Object} event - The event.
     * @returns {string} The donation info.
     */
    getDonationInfo(event) {
        const symbol = getSymbol(event.data.currency);
        const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
        return formattedAmount;
    }

    /**
     * Get the description for the event.
     * @param {Object} event - The event.
     * @returns {string} The description for the event.
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
        return '';
    }

    /**
     * Get the URL for the event.
     * @param {Object} event - The event.
     * @returns {string} The URL for the event.
     */
    getURL(event) {
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type)) {
            return event.data.post?.url || '';
        }
        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type)) {
            return event.data.attribution?.url || '';
        }
        return '';
    }

    /**
     * Get the route for the event.
     * @param {Object} event - The event.
     * @returns {Object} The route for the event.
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
        return null;
    }
}
```