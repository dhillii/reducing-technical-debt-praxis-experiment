```javascript
import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import { getNonDecimal, getSymbol } from 'ghost-admin/utils/currency';
import { ghPluralize } from 'ghost-admin/helpers/gh-pluralize';
import { inject as service } from '@ember/service';

export default class ParseMemberEventHelper extends Helper {
    @service feature;
    @service utils;
    @service membersUtils;

    /**
     * Trim and normalize a string value.
     * @param {string} value - The value to trim.
     * @returns {string|null} The trimmed value or null if empty.
     */
    trimString(value) {
        if (!value && value !== 0) {
            return null;
        }
        const trimmed = String(value).trim();
        return trimmed || null;
    }

    /**
     * Compute the parsed member event data.
     * @param {Array} params - The event and hasMultipleNewsletters parameters.
     * @param {Object} params[0] - The event object.
     * @param {boolean} params[1] - Whether there are multiple newsletters.
     * @returns {Object} The parsed member event data.
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

        const member = event.data.member ? { ...event.data.member, name: memberName } : event.data.member;

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
     * Get the subject for the event.
     * @param {Object} event - The event object.
     * @param {string} memberName - The member name.
     * @returns {string} The subject.
     */
    getSubject(event, memberName) {
        return event.data.member ? (memberName || event.data.member.email) : (event.data.name || event.data.email || '');
    }

    /**
     * Get the icon for the event.
     * @param {Object} event - The event object.
     * @returns {string} The icon.
     */
    getIcon(event) {
        const iconMap = {
            login_event: 'logged-in',
            payment_event: 'subscriptions',
            newsletter_event: event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email',
            subscription_event: event.data.type === 'canceled' ? 'canceled-subscription' : 'subscriptions',
            signup_event: 'signed-up',
            email_opened_event: 'opened-email',
            email_sent_event: 'sent-email',
            automated_email_sent_event: 'sent-email',
            email_delivered_event: 'received-email',
            email_failed_event: 'email-delivery-failed',
            email_complaint_event: 'email-delivery-spam',
            comment_event: 'comment',
            click_event: 'click',
            feedback_event: event.data.score === 1 ? 'more-like-this' : 'less-like-this',
            donation_event: 'subscriptions',
            email_change_event: 'email-changed'
        };

        return `event-${iconMap[event.type] || ''}`;
    }

    /**
     * Get the action for the event.
     * @param {Object} event - The event object.
     * @param {boolean} hasMultipleNewsletters - Whether there are multiple newsletters.
     * @returns {string} The action.
     */
    getAction(event, hasMultipleNewsletters) {
        const actionMap = {
            signup_event: 'signed up',
            login_event: 'logged in',
            payment_event: 'made payment',
            newsletter_event: event.data.subscribed ? `subscribed to ${hasMultipleNewsletters && event.data.newsletter && event.data.newsletter.name ? event.data.newsletter.name : 'newsletter'}` : `unsubscribed from ${hasMultipleNewsletters && event.data.newsletter && event.data.newsletter.name ? event.data.newsletter.name : 'newsletter'}`,
            subscription_event: {
                created: 'started paid subscription',
                updated: 'changed paid subscription',
                canceled: 'canceled paid subscription',
                reactivated: 'reactivated paid subscription',
                expired: 'ended paid subscription'
            }[event.data.type] || 'changed paid subscription',
            email_opened_event: 'opened email',
            email_sent_event: 'sent email',
            automated_email_sent_event: `received welcome email (${event.data.automatedEmail?.slug.includes('paid') ? 'Paid' : 'Free'})`,
            email_delivered_event: 'received email',
            email_failed_event: 'bounced email',
            email_complaint_event: 'email flagged as spam',
            comment_event: event.data.parent ? 'replied to comment' : 'commented',
            click_event: 'clicked link in email',
            feedback_event: event.data.score === 1 ? 'more like this' : 'less like this',
            email_change_event: event.data.from_email && event.data.to_email ? `Email address changed from ${event.data.from_email} to ${event.data.to_email}` : 'Email address changed',
            donation_event: 'Made a one-time payment'
        };

        return actionMap[event.type] || '';
    }

    /**
     * Get the join string for the event.
     * @returns {string} The join string.
     */
    getJoin() {
        return '–';
    }

    /**
     * Get the object for the event.
     * @param {Object} event - The event object.
     * @returns {string} The object.
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
     * @param {Object} event - The event object.
     * @returns {Object|null} The source.
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
     * @param {Object} event - The event object.
     * @returns {string} The info.
     */
    getInfo(event) {
        if (event.type === 'subscription_event') {
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
     * Get the description for the event.
     * @param {Object} event - The event object.
     * @returns {string} The description.
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
     * Get the URL for the event.
     * @param {Object} event - The event object.
     * @returns {string} The URL.
     */
    getURL(event) {
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type)) {
            return event.data.post?.url || '';
        }

        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type)) {
            return event.data.attribution?.url || '';
        }
        return;
    }

    /**
     * Get the route for the event.
     * @param {Object} event - The event object.
     * @returns {Object} The route.
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
        return;
    }
}
```