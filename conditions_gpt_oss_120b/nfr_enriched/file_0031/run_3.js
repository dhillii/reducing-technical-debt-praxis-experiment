import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject as service} from '@ember/service';

const SIMPLE_ICON_MAP = {
    login_event: 'logged-in',
    payment_event: 'subscriptions',
    email_opened_event: 'opened-email',
    email_sent_event: 'sent-email',
    automated_email_sent_event: 'sent-email',
    email_delivered_event: 'received-email',
    email_failed_event: 'email-delivery-failed',
    email_complaint_event: 'email-delivery-spam',
    comment_event: 'comment',
    click_event: 'click',
    aggregated_click_event: 'click',
    donation_event: 'subscriptions',
    email_change_event: 'email-changed'
};

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

        const icon = this._determineIcon(event);
        const action = this._determineAction(event, hasMultipleNewsletters);
        const info = this._determineInfo(event);
        const description = this._determineDescription(event);
        const join = this._getJoin();
        const object = this._determineObject(event);
        const url = this._determineURL(event);
        const route = this._determineRoute(event);
        const timestamp = moment(event.data.created_at);
        const source = this._determineSource(event);

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

    /** Resolve the appropriate icon for an event */
    _determineIcon(event) {
        if (event.type === 'newsletter_event') {
            return 'event-' + (event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email');
        }
        if (event.type === 'subscription_event') {
            if (event.data.type === 'canceled') {
                return 'event-canceled-subscription';
            }
            return 'event-subscriptions';
        }
        if (event.type === 'signup_event' || (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup)) {
            return 'event-signed-up';
        }
        if (event.type === 'feedback_event') {
            return 'event-' + (event.data.score === 1 ? 'more-like-this' : 'less-like-this');
        }
        const simpleIcon = SIMPLE_ICON_MAP[event.type];
        return simpleIcon ? `event-${simpleIcon}` : '';
    }

    /** Resolve the appropriate action description for an event */
    _determineAction(event, hasMultipleNewsletters) {
        switch (event.type) {
            case 'signup_event':
                if (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup) {
                    return 'signed up';
                }
                return 'signed up';
            case 'login_event':
                return 'logged in';
            case 'payment_event':
                return 'made payment';
            case 'newsletter_event':
                return this._newsletterAction(event, hasMultipleNewsletters);
            case 'subscription_event':
                return this._subscriptionAction(event);
            case 'email_opened_event':
                return 'opened email';
            case 'email_sent_event':
                return 'sent email';
            case 'automated_email_sent_event':
                return this._automatedEmailAction(event);
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
                return event.data.from_email && event.data.to_email
                    ? `Email address changed from ${event.data.from_email} to ${event.data.to_email}`
                    : 'Email address changed';
            case 'donation_event':
                return 'Made a one-time payment';
            default:
                return undefined;
        }
    }

    /** Action text for newsletter events */
    _newsletterAction(event, hasMultipleNewsletters) {
        let newsletter = 'newsletter';
        if (hasMultipleNewsletters && event.data.newsletter?.name) {
            newsletter = event.data.newsletter.name;
        }
        return event.data.subscribed
            ? `subscribed to ${newsletter}`
            : `unsubscribed from ${newsletter}`;
    }

    /** Action text for subscription events */
    _subscriptionAction(event) {
        const typeMap = {
            created: 'started paid subscription',
            updated: 'changed paid subscription',
            canceled: 'canceled paid subscription',
            reactivated: 'reactivated paid subscription',
            expired: 'ended paid subscription'
        };
        return typeMap[event.data.type] || 'changed paid subscription';
    }

    /** Action text for automated welcome emails */
    _automatedEmailAction(event) {
        const slug = event.data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    /** Static join string */
    _getJoin() {
        return '–';
    }

    /** Determine the clickable object title */
    _determineObject(event) {
        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type) && event.data.attribution?.title) {
            return event.data.attribution.title;
        }
        if (event.type === 'comment_event' && event.data.post) {
            return event.data.post.title;
        }
        if (['click_event', 'feedback_event'].includes(event.type) && event.data.post) {
            return event.data.post.title;
        }
        return '';
    }

    /** Determine source information if available */
    _determineSource(event) {
        if (event.data?.attribution?.referrer_source) {
            return {
                name: event.data.attribution.referrer_source,
                url: event.data.attribution.referrer_url ?? null
            };
        }
        return null;
    }

    /** Determine informational text for certain events */
    _determineInfo(event) {
        if (event.type === 'subscription_event') {
            const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
            if (mrrDelta === 0) {
                return undefined;
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
            return symbol + getNonDecimal(event.data.amount, event.data.currency);
        }
        return undefined;
    }

    /** Determine description for click events */
    _determineDescription(event) {
        if (event.type === 'click_event') {
            try {
                return this.utils.cleanTrackedUrl(event.data.link.to, true);
            } catch {
                return event.data.link.to;
            }
        }
        return undefined;
    }

    /** Determine URL for clickable objects */
    _determineURL(event) {
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type) && event.data.post) {
            return event.data.post.url;
        }
        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type) && event.data.attribution?.url) {
            return event.data.attribution.url;
        }
        return undefined;
    }

    /** Determine internal route for clickable objects */
    _determineRoute(event) {
        if (['click_event', 'feedback_event'].includes(event.type) && event.data.post) {
            return {name: 'posts-x', model: event.data.post.id};
        }
        if (['signup_event', 'subscription_event'].includes(event.type) && event.data.attribution_type === 'post') {
            return {name: 'posts-x', model: event.data.attribution_id};
        }
        return undefined;
    }
}