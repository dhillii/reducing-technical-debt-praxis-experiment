import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import { getNonDecimal, getSymbol } from 'ghost-admin/utils/currency';
import { ghPluralize } from 'ghost-admin/helpers/gh-pluralize';
import { inject as service } from '@ember/service';

export default class ParseMemberEventHelper extends Helper {
    @service feature;
    @service utils;
    @service membersUtils;

    trimString(value) {
        if (value == null || value === 0) return null;
        const trimmed = String(value).trim();
        return trimmed || null;
    }

    compute([event, hasMultipleNewsletters]) {
        const memberName = this.trimString(event.data.member?.name);
        const subject = event.data.member
            ? memberName || event.data.member.email
            : event.data.name || event.data.email || '';
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
    getIcon(event) {
        const type = event.type;
        switch (type) {
            case 'login_event':
                return 'event-logged-in';
            case 'payment_event':
                return 'event-subscriptions';
            case 'newsletter_event':
                return event.data.subscribed
                    ? 'event-subscribed-to-email'
                    : 'event-unsubscribed-from-email';
            case 'subscription_event':
                if (event.data.type === 'canceled') return 'event-canceled-subscription';
                return 'event-subscriptions';
            case 'signup_event':
            case 'subscription_event':
                if (event.data.type === 'created' && event.data.signup) return 'event-signed-up';
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
                return event.data.score === 1 ? 'event-more-like-this' : 'event-less-like-this';
            case 'donation_event':
                return 'event-subscriptions';
            case 'email_change_event':
                return 'event-email-changed';
            default:
                return 'event-unknown';
        }
    }

    getAction(event, hasMultipleNewsletters) {
        const type = event.type;
        switch (type) {
            case 'signup_event':
            case 'subscription_event':
                if (event.data.type === 'created' && event.data.signup) return 'signed up';
                return 'signed up';
            case 'login_event':
                return 'logged in';
            case 'payment_event':
                return 'made payment';
            case 'newsletter_event': {
                const newsletter = hasMultipleNewsletters && event.data.newsletter?.name
                    ? event.data.newsletter.name
                    : 'newsletter';
                return event.data.subscribed
                    ? `subscribed to ${newsletter}`
                    : `unsubscribed from ${newsletter}`;
            }
            case 'subscription_event': {
                const map = {
                    created: 'started paid subscription',
                    updated: 'changed paid subscription',
                    canceled: 'canceled paid subscription',
                    reactivated: 'reactivated paid subscription',
                    expired: 'ended paid subscription'
                };
                return map[event.data.type] ?? 'changed paid subscription';
            }
            case 'email_opened_event':
                return 'opened email';
            case 'email_sent_event':
                return 'sent email';
            case 'automated_email_sent_event': {
                const slug = event.data.automatedEmail?.slug ?? '';
                const emailType = slug.includes('paid') ? 'Paid' : 'Free';
                return `received welcome email (${emailType})`;
            }
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
                return undefined;
        }
    }

    getJoin() {
        return '–';
    }

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

    getSource(event) {
        const ref = event.data?.attribution?.referrer_source;
        if (!ref) return null;
        return {
            name: ref,
            url: event.data.attribution.referrer_url ?? null
        };
    }

    getInfo(event) {
        const type = event.type;
        if (type === 'subscription_event') {
            const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
            if (mrrDelta === 0) return;
            const symbol = getSymbol(event.data.currency);
            if (event.data.type === 'created') {
                const sign = mrrDelta > 0 ? '' : '-';
                const tierName = this.membersUtils.hasMultipleTiers
                    ? event.data.tierName ?? 'Paid'
                    : 'Paid';
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

    getDescription(event) {
        if (event.type !== 'click_event') return;
        try {
            return this.utils.cleanTrackedUrl(event.data.link.to, true);
        } catch {
            return event.data.link.to;
        }
    }

    getURL(event) {
        const type = event.type;
        if (['comment_event', 'click_event', 'feedback_event'].includes(type)) {
            return event.data.post?.url;
        }
        if (['signup_event', 'subscription_event', 'donation_event'].includes(type)) {
            return event.data.attribution?.url;
        }
    }

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
    }
}