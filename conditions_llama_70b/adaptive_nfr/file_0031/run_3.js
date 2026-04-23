import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject as service} from '@ember/service';

export default class ParseMemberEventHelper extends Helper {
    @service feature;
    @service utils;
    @service membersUtils;

    /**
     * Trim a string and convert it to null if it's empty.
     * @param {string} value
     * @returns {string|null}
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
     * @param {object[]} params
     * @param {object} params[0].event
     * @param {boolean} params[0].hasMultipleNewsletters
     * @returns {object}
     */
    compute([event, hasMultipleNewsletters]) {
        const memberName = this.trimString(event.data.member?.name);
        const subject = this.getSubject(event, memberName);
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
     * @param {object} event
     * @param {string|null} memberName
     * @returns {string}
     */
    getSubject(event, memberName) {
        if (event.data.member) {
            return memberName || event.data.member.email;
        }
        return event.data.name || event.data.email || '';
    }

    /**
     * Get the icon for the event.
     * @param {object} event
     * @returns {string}
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
     * @param {object} event
     * @param {boolean} hasMultipleNewsletters
     * @returns {string}
     */
    getAction(event, hasMultipleNewsletters) {
        const actionMap = {
            'signup_event': 'signed up',
            'login_event': 'logged in',
            'payment_event': 'made payment',
            'newsletter_event': event.data.subscribed ? `subscribed to ${hasMultipleNewsletters && event.data.newsletter && event.data.newsletter.name ? event.data.newsletter.name : 'newsletter'}` : `unsubscribed from ${hasMultipleNewsletters && event.data.newsletter && event.data.newsletter.name ? event.data.newsletter.name : 'newsletter'}`,
            'subscription_event': this.getSubscriptionAction(event),
            'email_opened_event': 'opened email',
            'email_sent_event': 'sent email',
            'automated_email_sent_event': `received welcome email (${event.data.automatedEmail?.slug.includes('paid') ? 'Paid' : 'Free'})`,
            'email_delivered_event': 'received email',
            'email_failed_event': 'bounced email',
            'email_complaint_event': 'email flagged as spam',
            'comment_event': event.data.parent ? 'replied to comment' : 'commented',
            'click_event': 'clicked link in email',
            'aggregated_click_event': event.data.count.clicks <= 1 ? 'clicked link in email' : `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`,
            'feedback_event': event.data.score === 1 ? 'more like this' : 'less like this',
            'email_change_event': event.data.from_email && event.data.to_email ? `Email address changed from ${event.data.from_email} to ${event.data.to_email}` : 'Email address changed',
            'donation_event': 'Made a one-time payment'
        };
        return actionMap[event.type] || '';
    }

    /**
     * Get the subscription action.
     * @param {object} event
     * @returns {string}
     */
    getSubscriptionAction(event) {
        const subscriptionActions = {
            'created': 'started paid subscription',
            'updated': 'changed paid subscription',
            'canceled': 'canceled paid subscription',
            'reactivated': 'reactivated paid subscription',
            'expired': 'ended paid subscription'
        };
        return subscriptionActions[event.data.type] || 'changed paid subscription';
    }

    /**
     * Get the join string.
     * @param {object} event
     * @returns {string}
     */
    getJoin() {
        return '–';
    }

    /**
     * Get the object for the event.
     * @param {object} event
     * @returns {string}
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
     * @param {object} event
     * @returns {object|null}
     */
    getSource(event) {
        if (event.data.attribution?.referrer_source) {
            return {
                name: event.data.attribution.referrer_source,
                url: event.data.attribution.referrer_url ?? null
            };
        }
        return null;
    }

    /**
     * Get the info for the event.
     * @param {object} event
     * @returns {string|null}
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
        return null;
    }

    /**
     * Get the subscription info.
     * @param {object} event
     * @returns {string|null}
     */
    getSubscriptionInfo(event) {
        const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
        if (mrrDelta === 0) {
            return null;
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
     * @param {object} event
     * @returns {string}
     */
    getDonationInfo(event) {
        const symbol = getSymbol(event.data.currency);
        const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
        return formattedAmount;
    }

    /**
     * Get the description for the event.
     * @param {object} event
     * @returns {string|null}
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
        return null;
    }

    /**
     * Get the URL for the event.
     * @param {object} event
     * @returns {string|null}
     */
    getURL(event) {
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type)) {
            return event.data.post?.url || null;
        }
        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type)) {
            return event.data.attribution?.url || null;
        }
        return null;
    }

    /**
     * Get the route for the event.
     * @param {object} event
     * @returns {object|null}
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