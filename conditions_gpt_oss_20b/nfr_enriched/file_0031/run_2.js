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
     * Convert empty, null, or undefined values to null.
     * Trim whitespace from strings.
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
     * Builds a structured representation of a member event.
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
            ? { ...event.data.member, name: memberName }
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

    /* internal helper functions */

    /**
     * Determine the icon class for an event.
     */
    getIcon(event) {
        const type = event.type;
        let icon;

        switch (type) {
            case 'login_event':
                icon = 'logged-in';
                break;
            case 'payment_event':
                icon = 'subscriptions';
                break;
            case 'newsletter_event':
                icon = event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
                break;
            case 'subscription_event':
                if (event.data.type === 'canceled') {
                    icon = 'canceled-subscription';
                } else if (event.data.type === 'created' && event.data.signup) {
                    icon = 'signed-up';
                } else {
                    icon = 'subscriptions';
                }
                break;
            case 'signup_event':
                icon = 'signed-up';
                break;
            case 'email_opened_event':
                icon = 'opened-email';
                break;
            case 'email_sent_event':
            case 'automated_email_sent_event':
                icon = 'sent-email';
                break;
            case 'email_delivered_event':
                icon = 'received-email';
                break;
            case 'email_failed_event':
                icon = 'email-delivery-failed';
                break;
            case 'email_complaint_event':
                icon = 'email-delivery-spam';
                break;
            case 'comment_event':
                icon = 'comment';
                break;
            case 'click_event':
            case 'aggregated_click_event':
                icon = 'click';
                break;
            case 'feedback_event':
                icon = event.data.score === 1 ? 'more-like-this' : 'less-like-this';
                break;
            case 'donation_event':
                icon = 'subscriptions';
                break;
            case 'email_change_event':
                icon = 'email-changed';
                break;
            default:
                icon = 'unknown';
        }

        return 'event-' + icon;
    }

    /**
     * Determine the action description for an event.
     */
    getAction(event, hasMultipleNewsletters) {
        const type = event.type;

        switch (type) {
            case 'signup_event':
            case 'subscription_event':
                if (event.data.type === 'created' && event.data.signup) {
                    return 'signed up';
                }
                // fall through to subscription_event handling
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
            case 'login_event':
                return 'logged in';
            case 'payment_event':
                return 'made payment';
            case 'newsletter_event':
                const newsletter = hasMultipleNewsletters && event.data.newsletter && event.data.newsletter.name
                    ? event.data.newsletter.name
                    : 'newsletter';
                return event.data.subscribed
                    ? `subscribed to ${newsletter}`
                    : `unsubscribed from ${newsletter}`;
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
                return event.data.count.clicks <= 1
                    ? 'clicked link in email'
                    : `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
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
     * Join string used when action and object are in the same sentence.
     */
    getJoin() {
        return '–';
    }

    /**
     * Clickable object title for the event.
     */
    getObject(event) {
        const type = event.type;
        if (['signup_event', 'subscription_event', 'donation_event'].includes(type)) {
            return event.data.attribution?.title ?? '';
        }
        if (['comment_event', 'click_event', 'feedback_event'].includes(type)) {
            return event.data.post?.title ?? '';
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
     * Additional info string for the event.
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

        return;
    }

    /**
     * Description for click events.
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
     * URL for the clickable object.
     */
    getURL(event) {
        const type = event.type;
        if (['comment_event', 'click_event', 'feedback_event'].includes(type)) {
            return event.data.post?.url;
        }
        if (['signup_event', 'subscription_event', 'donation_event'].includes(type)) {
            return event.data.attribution?.url;
        }
        return;
    }

    /**
     * Route for the clickable object.
     */
    getRoute(event) {
        const type = event.type;
        if (['click_event', 'feedback_event'].includes(type)) {
            return event.data.post
                ? { name: 'posts-x', model: event.data.post.id }
                : undefined;
        }
        if (['signup_event', 'subscription_event'].includes(type) && event.data.attribution_type === 'post') {
            return { name: 'posts-x', model: event.data.attribution_id };
        }
        return;
    }
}