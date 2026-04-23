import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject as service} from '@ember/service';

export default class ParseMemberEventHelper extends Helper {
    @service feature;
    @service utils;
    @service membersUtils;

    /** Trim a value to a non‑empty string or return null */
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

    /** Determine the icon name for an event */
    _determineIcon(event) {
        const {type, data} = event;
        switch (type) {
            case 'login_event':
                return 'event-logged-in';
            case 'payment_event':
            case 'donation_event':
                return 'event-subscriptions';
            case 'newsletter_event':
                return 'event-' + (data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email');
            case 'subscription_event':
                return data.type === 'canceled'
                    ? 'event-canceled-subscription'
                    : 'event-subscriptions';
            case 'signup_event':
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
                return 'event-' + (data.score === 1 ? 'more-like-this' : 'less-like-this');
            case 'email_change_event':
                return 'event-email-changed';
            default:
                return '';
        }
    }

    /** Determine the human‑readable action description for an event */
    _determineAction(event, hasMultipleNewsletters) {
        const {type, data} = event;
        switch (type) {
            case 'signup_event':
                return 'signed up';
            case 'login_event':
                return 'logged in';
            case 'payment_event':
                return 'made payment';
            case 'newsletter_event':
                return this._newsletterAction(data, hasMultipleNewsletters);
            case 'subscription_event':
                return this._subscriptionAction(data);
            case 'email_opened_event':
                return 'opened email';
            case 'email_sent_event':
                return 'sent email';
            case 'automated_email_sent_event':
                return this._automatedEmailAction(data);
            case 'email_delivered_event':
                return 'received email';
            case 'email_failed_event':
                return 'bounced email';
            case 'email_complaint_event':
                return 'email flagged as spam';
            case 'comment_event':
                return data.parent ? 'replied to comment' : 'commented';
            case 'click_event':
                return 'clicked link in email';
            case 'aggregated_click_event':
                return data.count.clicks <= 1
                    ? 'clicked link in email'
                    : `clicked ${ghPluralize(data.count.clicks, 'link')} in email`;
            case 'feedback_event':
                return data.score === 1 ? 'more like this' : 'less like this';
            case 'email_change_event':
                return data.from_email && data.to_email
                    ? `Email address changed from ${data.from_email} to ${data.to_email}`
                    : 'Email address changed';
            case 'donation_event':
                return 'Made a one-time payment';
            default:
                return undefined;
        }
    }

    /** Action text for newsletter events */
    _newsletterAction(data, hasMultipleNewsletters) {
        let newsletter = 'newsletter';
        if (hasMultipleNewsletters && data.newsletter?.name) {
            newsletter = data.newsletter.name;
        }
        return data.subscribed
            ? `subscribed to ${newsletter}`
            : `unsubscribed from ${newsletter}`;
    }

    /** Action text for subscription events */
    _subscriptionAction(data) {
        switch (data.type) {
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

    /** Action text for automated email events */
    _automatedEmailAction(data) {
        const slug = data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    /** Static join string */
    getJoin() {
        return '–';
    }

    /** Determine the clickable object title */
    getObject(event) {
        const {type, data} = event;
        if (['signup_event', 'subscription_event', 'donation_event'].includes(type) && data.attribution?.title) {
            return data.attribution.title;
        }
        if (type === 'comment_event' && data.post) {
            return data.post.title;
        }
        if (['click_event', 'feedback_event'].includes(type) && data.post) {
            return data.post.title;
        }
        return '';
    }

    /** Extract source information if available */
    getSource(event) {
        const source = event.data?.attribution?.referrer_source;
        if (source) {
            return {
                name: source,
                url: event.data.attribution.referrer_url ?? null
            };
        }
        return null;
    }

    /** Determine additional info such as MRR changes or donation amount */
    _determineInfo(event) {
        const {type, data} = event;
        if (type === 'subscription_event') {
            const mrrDelta = getNonDecimal(data.mrr_delta, data.currency);
            if (mrrDelta === 0) {
                return undefined;
            }
            const symbol = getSymbol(data.currency);
            if (data.type === 'created') {
                const sign = mrrDelta > 0 ? '' : '-';
                const tierName = this.membersUtils.hasMultipleTiers ? (data.tierName ?? 'Paid') : 'Paid';
                return `${tierName} ${sign}${symbol}${Math.abs(mrrDelta)}/month`;
            }
            const sign = mrrDelta > 0 ? '+' : '-';
            return `MRR ${sign}${symbol}${Math.abs(mrrDelta)}`;
        }

        if (type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }

        if (type === 'donation_event') {
            const symbol = getSymbol(data.currency);
            return symbol + getNonDecimal(data.amount, data.currency);
        }

        return undefined;
    }

    /** Clean description for click events */
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

    /** URL for clickable objects */
    getURL(event) {
        const {type, data} = event;
        if (['comment_event', 'click_event', 'feedback_event'].includes(type) && data.post) {
            return data.post.url;
        }
        if (['signup_event', 'subscription_event', 'donation_event'].includes(type) && data.attribution?.url) {
            return data.attribution.url;
        }
        return undefined;
    }

    /** Internal route for clickable objects */
    getRoute(event) {
        const {type, data} = event;
        if (['click_event', 'feedback_event'].includes(type) && data.post) {
            return {name: 'posts-x', model: data.post.id};
        }
        if (['signup_event', 'subscription_event'].includes(type) && data.attribution_type === 'post') {
            return {name: 'posts-x', model: data.attribution_id};
        }
        return undefined;
    }
}