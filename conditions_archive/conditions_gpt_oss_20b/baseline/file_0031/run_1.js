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
        if (!value && value !== 0) return null;
        const trimmed = String(value).trim();
        return trimmed || null;
    }

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
    getIcon(event) {
        const { type, data } = event;
        const base = {
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
            email_change_event: 'email-changed',
            signup_event: 'signed-up',
            subscription_event: 'subscriptions'
        }[type];

        if (type === 'newsletter_event') {
            return data.subscribed ? 'event-subscribed-to-email' : 'event-unsubscribed-from-email';
        }

        if (type === 'subscription_event' && data.type === 'canceled') {
            return 'event-canceled-subscription';
        }

        if (type === 'feedback_event') {
            return data.score === 1 ? 'event-more-like-this' : 'event-less-like-this';
        }

        return `event-${base}`;
    }

    getAction(event, hasMultipleNewsletters) {
        const { type, data } = event;

        switch (type) {
            case 'signup_event':
                return 'signed up';
            case 'subscription_event':
                if (data.type === 'created' && data.signup) return 'signed up';
                switch (data.type) {
                    case 'created': return 'started paid subscription';
                    case 'updated': return 'changed paid subscription';
                    case 'canceled': return 'canceled paid subscription';
                    case 'reactivated': return 'reactivated paid subscription';
                    case 'expired': return 'ended paid subscription';
                    default: return 'changed paid subscription';
                }
            case 'login_event':
                return 'logged in';
            case 'payment_event':
                return 'made payment';
            case 'newsletter_event': {
                const newsletter = hasMultipleNewsletters && data.newsletter?.name
                    ? data.newsletter.name
                    : 'newsletter';
                return data.subscribed
                    ? `subscribed to ${newsletter}`
                    : `unsubscribed from ${newsletter}`;
            }
            case 'email_opened_event':
                return 'opened email';
            case 'email_sent_event':
                return 'sent email';
            case 'automated_email_sent_event': {
                const slug = data.automatedEmail?.slug || '';
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
                return '';
        }
    }

    getJoin() {
        return '–';
    }

    getObject(event) {
        const { type, data } = event;
        if (['signup_event', 'subscription_event', 'donation_event'].includes(type)) {
            return data.attribution?.title ?? '';
        }
        if (['comment_event', 'click_event', 'feedback_event'].includes(type)) {
            return data.post?.title ?? '';
        }
        return '';
    }

    getSource(event) {
        const referrer = event.data?.attribution?.referrer_source;
        if (!referrer) return null;
        return {
            name: referrer,
            url: event.data.attribution.referrer_url ?? null
        };
    }

    getInfo(event) {
        const { type, data } = event;
        if (type === 'subscription_event') {
            const mrrDelta = getNonDecimal(data.mrr_delta, data.currency);
            if (!mrrDelta) return;
            const symbol = getSymbol(data.currency);
            const sign = data.type === 'created'
                ? (mrrDelta > 0 ? '' : '-')
                : (mrrDelta > 0 ? '+' : '-');
            if (data.type === 'created') {
                const tierName = this.membersUtils.hasMultipleTiers
                    ? (data.tierName ?? 'Paid')
                    : 'Paid';
                return `${tierName} ${sign}${symbol}${Math.abs(mrrDelta)}/month`;
            }
            return `MRR ${sign}${symbol}${Math.abs(mrrDelta)}`;
        }
        if (type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }
        if (type === 'donation_event') {
            const symbol = getSymbol(data.currency);
            return symbol + getNonDecimal(data.amount, data.currency);
        }
    }

    getDescription(event) {
        if (event.type === 'click_event') {
            try {
                return this.utils.cleanTrackedUrl(event.data.link.to, true);
            } catch {
                // ignore
            }
            return event.data.link.to;
        }
    }

    getURL(event) {
        const { type, data } = event;
        if (['comment_event', 'click_event', 'feedback_event'].includes(type)) {
            return data.post?.url;
        }
        if (['signup_event', 'subscription_event', 'donation_event'].includes(type)) {
            return data.attribution?.url;
        }
    }

    getRoute(event) {
        const { type, data } = event;
        if (['click_event', 'feedback_event'].includes(type) && data.post) {
            return { name: 'posts-x', model: data.post.id };
        }
        if (['signup_event', 'subscription_event'].includes(type) && data.attribution_type === 'post') {
            return { name: 'posts-x', model: data.attribution_id };
        }
    }
}