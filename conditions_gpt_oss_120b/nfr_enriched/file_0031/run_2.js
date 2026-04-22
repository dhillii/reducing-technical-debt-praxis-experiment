import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject as service} from '@ember/service';

export default class ParseMemberEventHelper extends Helper {
    @service feature;
    @service utils;
    @service membersUtils;

    /** Trim a value to a non‑empty string or null */
    trimString(value) {
        if (!value && value !== 0) {
            return null;
        }
        const trimmed = String(value).trim();
        return trimmed || null;
    }

    compute([event, hasMultipleNewsletters]) {
        const memberName = this.trimString(event.data.member?.name);
        const subject = event.data.member
            ? (memberName || event.data.member.email)
            : (event.data.name || event.data.email || '');

        const member = event.data.member
            ? {...event.data.member, name: memberName}
            : event.data.member;

        return {
            memberId: event.data.member_id ?? event.data.member?.id,
            member,
            emailId: event.data.email_id,
            email: event.data.email,
            icon: this._determineIcon(event),
            subject,
            action: this._determineAction(event, hasMultipleNewsletters),
            join: this._getJoin(),
            object: this._determineObject(event),
            source: this._determineSource(event),
            info: this._determineInfo(event),
            description: this._determineDescription(event),
            url: this._determineURL(event),
            route: this._determineRoute(event),
            timestamp: moment(event.data.created_at)
        };
    }

    /** Determine the icon name for an event */
    _determineIcon(event) {
        const type = event.type;
        let icon = '';

        switch (type) {
            case 'login_event':
                icon = 'logged-in';
                break;
            case 'payment_event':
            case 'donation_event':
                icon = 'subscriptions';
                break;
            case 'newsletter_event':
                icon = event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
                break;
            case 'subscription_event':
                icon = 'subscriptions';
                if (event.data.type === 'canceled') {
                    icon = 'canceled-subscription';
                }
                break;
            case 'signup_event':
                if (event.data?.type === 'created' && event.data.signup) {
                    // fall‑through to signed‑up
                }
                // intentional fall‑through
            case 'subscription_event':
                if (event.data?.type === 'created' && event.data.signup) {
                    icon = 'signed-up';
                }
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
            case 'email_change_event':
                icon = 'email-changed';
                break;
            default:
                icon = '';
        }

        return `event-${icon}`;
    }

    /** Determine the action description for an event */
    _determineAction(event, hasMultipleNewsletters) {
        const type = event.type;

        if (type === 'signup_event' || (type === 'subscription_event' && event.data.type === 'created' && event.data.signup)) {
            return 'signed up';
        }
        if (type === 'login_event') {
            return 'logged in';
        }
        if (type === 'payment_event') {
            return 'made payment';
        }
        if (type === 'newsletter_event') {
            const newsletter = (hasMultipleNewsletters && event.data.newsletter?.name) ? event.data.newsletter.name : 'newsletter';
            return event.data.subscribed ? `subscribed to ${newsletter}` : `unsubscribed from ${newsletter}`;
        }
        if (type === 'subscription_event') {
            const subType = event.data.type;
            const map = {
                created: 'started paid subscription',
                updated: 'changed paid subscription',
                canceled: 'canceled paid subscription',
                reactivated: 'reactivated paid subscription',
                expired: 'ended paid subscription'
            };
            return map[subType] || 'changed paid subscription';
        }
        if (type === 'email_opened_event') {
            return 'opened email';
        }
        if (type === 'email_sent_event') {
            return 'sent email';
        }
        if (type === 'automated_email_sent_event') {
            const slug = event.data.automatedEmail?.slug || '';
            const emailType = slug.includes('paid') ? 'Paid' : 'Free';
            return `received welcome email (${emailType})`;
        }
        if (type === 'email_delivered_event') {
            return 'received email';
        }
        if (type === 'email_failed_event') {
            return 'bounced email';
        }
        if (type === 'email_complaint_event') {
            return 'email flagged as spam';
        }
        if (type === 'comment_event') {
            return event.data.parent ? 'replied to comment' : 'commented';
        }
        if (type === 'click_event') {
            return 'clicked link in email';
        }
        if (type === 'aggregated_click_event') {
            return event.data.count.clicks <= 1
                ? 'clicked link in email'
                : `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
        }
        if (type === 'feedback_event') {
            return event.data.score === 1 ? 'more like this' : 'less like this';
        }
        if (type === 'email_change_event') {
            return (event.data.from_email && event.data.to_email)
                ? `Email address changed from ${event.data.from_email} to ${event.data.to_email}`
                : 'Email address changed';
        }
        if (type === 'donation_event') {
            return 'Made a one-time payment';
        }
    }

    /** Static join string */
    _getJoin() {
        return '–';
    }

    /** Determine the clickable object title */
    _determineObject(event) {
        const type = event.type;

        if (['signup_event', 'subscription_event', 'donation_event'].includes(type) && event.data.attribution?.title) {
            return event.data.attribution.title;
        }
        if (type === 'comment_event' && event.data.post) {
            return event.data.post.title;
        }
        if (['click_event', 'feedback_event'].includes(type) && event.data.post) {
            return event.data.post.title;
        }
        return '';
    }

    /** Determine source information */
    _determineSource(event) {
        const attribution = event.data?.attribution;
        if (attribution?.referrer_source) {
            return {
                name: attribution.referrer_source,
                url: attribution.referrer_url ?? null
            };
        }
        return null;
    }

    /** Determine additional info (e.g., MRR changes) */
    _determineInfo(event) {
        const type = event.type;

        if (type === 'subscription_event') {
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

        if (type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }

        if (type === 'donation_event') {
            const symbol = getSymbol(event.data.currency);
            return symbol + getNonDecimal(event.data.amount, event.data.currency);
        }
    }

    /** Determine description (e.g., cleaned URL for clicks) */
    _determineDescription(event) {
        if (event.type === 'click_event') {
            try {
                return this.utils.cleanTrackedUrl(event.data.link.to, true);
            } catch {
                return event.data.link.to;
            }
        }
    }

    /** Determine URL for clickable objects */
    _determineURL(event) {
        const type = event.type;

        if (['comment_event', 'click_event', 'feedback_event'].includes(type) && event.data.post) {
            return event.data.post.url;
        }
        if (['signup_event', 'subscription_event', 'donation_event'].includes(type) && event.data.attribution?.url) {
            return event.data.attribution.url;
        }
    }

    /** Determine internal route for clickable objects */
    _determineRoute(event) {
        const type = event.type;

        if (['click_event', 'feedback_event'].includes(type) && event.data.post) {
            return {name: 'posts-x', model: event.data.post.id};
        }
        if (['signup_event', 'subscription_event'].includes(type) && event.data.attribution_type === 'post') {
            return {name: 'posts-x', model: event.data.attribution_id};
        }
    }
}