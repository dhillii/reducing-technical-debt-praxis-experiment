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
     * Trim a value to a string or null.
     */
    trimString(value) {
        if (!value && value !== 0) {
            return null;
        }
        const trimmed = String(value).trim();
        return trimmed || null;
    }

    /**
     * Main entry point for the helper.
     */
    compute([event, hasMultipleNewsletters]) {
        const memberName = this.trimString(event.data.member?.name);
        const subject = event.data.member
            ? (memberName || event.data.member.email)
            : (event.data.name || event.data.email || '');

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

        const member = event.data.member
            ? {...event.data.member, name: memberName}
            : event.data.member;

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
     * Determine the icon for an event.
     */
    getIcon(event) {
        switch (event.type) {
            case 'login_event':
                return 'event-logged-in';
            case 'payment_event':
                return 'event-subscriptions';
            case 'newsletter_event':
                return event.data.subscribed
                    ? 'event-subscribed-to-email'
                    : 'event-unsubscribed-from-email';
            case 'subscription_event':
                if (event.data.type === 'canceled') {
                    return 'event-canceled-subscription';
                }
                return 'event-subscriptions';
            case 'signup_event':
            case 'subscription_event':
                if (event.data.type === 'created' && event.data.signup) {
                    return 'event-signed-up';
                }
                return 'event-signed-up';
            case 'email_opened_event':
                return 'event-opened-email';
            case 'email_sent_event':
            case 'automated_email_sent_event':
                return 'event-sent-email';
            case 'email_delivered_event':
                return 'event-received-email';
            case 'email_failed_event':
                return 'event-email-delivery-failed';
            case 'email_complaint_event':
                return 'event-email-delivery-spam';
            case 'comment_event':
                return 'event-comment';
            case 'click_event':
            case 'aggregated_click_event':
                return 'event-click';
            case 'feedback_event':
                return event.data.score === 1
                    ? 'event-more-like-this'
                    : 'event-less-like-this';
            case 'donation_event':
                return 'event-subscriptions';
            case 'email_change_event':
                return 'event-email-changed';
            default:
                return 'event-unknown';
        }
    }

    /**
     * Determine the action description for an event.
     */
    getAction(event, hasMultipleNewsletters) {
        switch (event.type) {
            case 'signup_event':
            case 'subscription_event':
                if (event.data.type === 'created' && event.data.signup) {
                    return 'signed up';
                }
                return 'signed up';
            case 'login_event':
                return 'logged in';
            case 'payment_event':
                return 'made payment';
            case 'newsletter_event':
                let newsletter = 'newsletter';
                if (
                    hasMultipleNewsletters &&
                    event.data.newsletter &&
                    event.data.newsletter.name
                ) {
                    newsletter = event.data.newsletter.name;
                }
                return event.data.subscribed
                    ? `subscribed to ${newsletter}`
                    : `unsubscribed from ${newsletter}`;
            case 'subscription_event':
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
            case 'email_opened_event':
                return 'opened email';
            case 'email_sent_event':
                return 'sent email';
            case 'automated_email_sent_event':
                const slug = event.data.automatedEmail?.slug || '';
                const emailType = slug.includes('paid') ? 'Paid' : 'Free';
                return `received welcome email (${emailType})`;
            case 'email_delivered_event':
                return 'received email';
            case 'email_failed_event':
                return 'bounced email';
            case 'email_complaint_event':
                return 'email flagged as spam';
            case 'comment_event':
                return event.data.parent ? 'replied to comment' : 'commented';
            case 'click_event':
                return 'clicked link in email';
            case 'aggregated_click_event':
                if (event.data.count.clicks <= 1) {
                    return 'clicked link in email';
                }
                return `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
            case 'feedback_event':
                return event.data.score === 1 ? 'more like this' : 'less like this';
            case 'email_change_event':
                if (event.data.from_email && event.data.to_email) {
                    return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
                }
                return 'Email address changed';
            case 'donation_event':
                return 'Made a one-time payment';
            default:
                return '';
        }
    }

    /**
     * Join string for action and object.
     */
    getJoin() {
        return '–';
    }

    /**
     * Clickable object for the event.
     */
    getObject(event) {
        if (
            event.type === 'signup_event' ||
            event.type === 'subscription_event' ||
            event.type === 'donation_event'
        ) {
            if (event.data.attribution?.title) {
                return event.data.attribution.title;
            }
        }

        if (event.type === 'comment_event' && event.data.post) {
            return event.data.post.title;
        }

        if (
            (event.type === 'click_event' || event.type === 'feedback_event') &&
            event.data.post
        ) {
            return event.data.post.title;
        }

        return '';
    }

    /**
     * Source information for the event.
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
     * Additional info for the event.
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
                const tierName = this.membersUtils.hasMultipleTiers
                    ? (event.data.tierName ?? 'Paid')
                    : 'Paid';
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
    }

    /**
     * Description for the event.
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
    }

    /**
     * URL for the clickable object.
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
        return;
    }

    /**
     * Route for the clickable object.
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