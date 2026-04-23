import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject as service} from '@ember/service';

export default class ParseMemberEventHelper extends Helper {
    @service feature;
    @service utils;
    @service membersUtils;

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
            ? {
                  ...event.data.member,
                  name: memberName,
              }
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
            timestamp,
        };
    }

    getIcon(event) {
        const type = event.type;

        switch (type) {
            case 'login_event':
                return 'logged-in';
            case 'payment_event':
                return 'subscriptions';
            case 'newsletter_event':
                return event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
            case 'subscription_event':
                return event.data.type === 'canceled' ? 'canceled-subscription' : 'subscriptions';
            case 'signup_event':
            case 'subscription_event':
                if (type === 'subscription_event' && event.data.type === 'created' && event.data.signup) {
                    return 'signed-up';
                }
                return 'signed-up';
            case 'email_opened_event':
                return 'opened-email';
            case 'email_sent_event':
            case 'automated_email_sent_event':
                return 'sent-email';
            case 'email_delivered_event':
                return 'received-email';
            case 'email_failed_event':
                return 'email-delivery-failed';
            case 'email_complaint_event':
                return 'email-delivery-spam';
            case 'comment_event':
                return 'comment';
            case 'click_event':
            case 'aggregated_click_event':
                return 'click';
            case 'feedback_event':
                return event.data.score === 1 ? 'more-like-this' : 'less-like-this';
            case 'donation_event':
                return 'subscriptions';
            case 'email_change_event':
                return 'email-changed';
            default:
                return 'event-unknown';
        }
    }

    getAction(event, hasMultipleNewsletters) {
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
            const newsletter = hasMultipleNewsletters && event.data.newsletter?.name
                ? event.data.newsletter.name
                : 'newsletter';
            return event.data.subscribed
                ? `subscribed to ${newsletter}`
                : `unsubscribed from ${newsletter}`;
        }
        if (type === 'subscription_event') {
            const t = event.data.type;
            switch (t) {
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
            const count = event.data.count.clicks;
            return count <= 1 ? 'clicked link in email' : `clicked ${ghPluralize(count, 'link')} in email`;
        }
        if (type === 'feedback_event') {
            return event.data.score === 1 ? 'more like this' : 'less like this';
        }
        if (type === 'email_change_event') {
            if (event.data.from_email && event.data.to_email) {
                return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
            }
            return 'Email address changed';
        }
        if (type === 'donation_event') {
            return 'Made a one-time payment';
        }
        return '';
    }

    getJoin() {
        return '–';
    }

    getObject(event) {
        const type = event.type;
        const data = event.data;

        if (['signup_event', 'subscription_event', 'donation_event'].includes(type)) {
            if (data.attribution?.title) {
                return data.attribution.title;
            }
        }
        if (type === 'comment_event' && data.post) {
            return data.post.title;
        }
        if (['click_event', 'feedback_event'].includes(type) && data.post) {
            return data.post.title;
        }
        return '';
    }

    getSource(event) {
        if (event.data?.attribution?.referrer_source) {
            return {
                name: event.data.attribution.referrer_source,
                url: event.data.attribution.referrer_url ?? null,
            };
        }
        return null;
    }

    getInfo(event) {
        const type = event.type;
        const data = event.data;

        if (type === 'subscription_event') {
            const mrrDelta = getNonDecimal(data.mrr_delta, data.currency);
            if (mrrDelta === 0) {
                return;
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
            const formattedAmount = symbol + getNonDecimal(data.amount, data.currency);
            return formattedAmount;
        }
        return;
    }

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

    getURL(event) {
        const type = event.type;
        const data = event.data;

        if (['comment_event', 'click_event', 'feedback_event'].includes(type)) {
            if (data.post) {
                return data.post.url;
            }
        }
        if (['signup_event', 'subscription_event', 'donation_event'].includes(type)) {
            if (data.attribution && data.attribution.url) {
                return data.attribution.url;
            }
        }
        return;
    }

    getRoute(event) {
        const type = event.type;
        const data = event.data;

        if (['click_event', 'feedback_event'].includes(type)) {
            if (data.post) {
                return {
                    name: 'posts-x',
                    model: data.post.id,
                };
            }
        }
        if (['signup_event', 'subscription_event'].includes(type)) {
            if (data.attribution_type === 'post') {
                return {
                    name: 'posts-x',
                    model: data.attribution_id,
                };
            }
        }
        return;
    }
}