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
        const data = event.data || {};
        const memberName = this.trimString(data.member?.name);
        const subject = data.member ? (memberName || data.member.email) : (data.name || data.email || '');
        const icon = this.getIcon(event);
        const action = this.getAction(event, hasMultipleNewsletters);
        const info = this.getInfo(event);
        const description = this.getDescription(event);
        const join = this.getJoin();
        const object = this.getObject(event);
        const url = this.getURL(event);
        const route = this.getRoute(event);
        const timestamp = moment(data.created_at);
        const source = this.getSource(event);
        const member = data.member ? {...data.member, name: memberName} : data.member;

        return {
            memberId: event.data.member_id ?? data.member?.id,
            member,
            emailId: data.email_id,
            email: data.email,
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

    getIcon(event) {
        const type = event.type;
        let icon = '';
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
                icon = event.data.type === 'canceled' ? 'canceled-subscription' : 'subscriptions';
                break;
            case 'signup_event':
                icon = 'signed-up';
                break;
            case 'subscription_event':
                if (event.data.type === 'created' && event.data.signup) {
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
            case 'donation_event':
                icon = 'subscriptions';
                break;
            case 'email_change_event':
                icon = 'email-changed';
                break;
        }
        return 'event-' + icon;
    }

    getAction(event, hasMultipleNewsletters) {
        const type = event.type;
        const data = event.data;
        switch (type) {
            case 'signup_event':
                return 'signed up';
            case 'login_event':
                return 'logged in';
            case 'payment_event':
                return 'made payment';
            case 'newsletter_event':
                const newsletter = hasMultipleNewsletters && data.newsletter?.name ? data.newsletter.name : 'newsletter';
                return data.subscribed ? `subscribed to ${newsletter}` : `unsubscribed from ${newsletter}`;
            case 'subscription_event':
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
            case 'email_opened_event':
                return 'opened email';
            case 'email_sent_event':
                return 'sent email';
            case 'automated_email_sent_event':
                const slug = data.automatedEmail?.slug || '';
                const emailType = slug.includes('paid') ? 'Paid' : 'Free';
                return `received welcome email (${emailType})`;
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
                return data.count.clicks <= 1 ? 'clicked link in email' : `clicked ${ghPluralize(data.count.clicks, 'link')} in email`;
            case 'feedback_event':
                return data.score === 1 ? 'more like this' : 'less like this';
            case 'email_change_event':
                if (data.from_email && data.to_email) {
                    return `Email address changed from ${data.from_email} to ${data.to_email}`;
                }
                return 'Email address changed';
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
        const type = event.type;
        const data = event.data;
        if (['signup_event', 'subscription_event', 'donation_event'].includes(type)) {
            return data.attribution?.title ?? '';
        }
        if (['comment_event', 'click_event', 'feedback_event'].includes(type)) {
            return data.post?.title ?? '';
        }
        return '';
    }

    getSource(event) {
        if (event.data?.attribution?.referrer_source) {
            return {
                name: event.data.attribution.referrer_source,
                url: event.data.attribution.referrer_url ?? null
            };
        }
        return null;
    }

    getInfo(event) {
        const type = event.type;
        const data = event.data;
        if (type === 'subscription_event') {
            const mrrDelta = getNonDecimal(data.mrr_delta, data.currency);
            if (!mrrDelta) return;
            const symbol = getSymbol(data.currency);
            if (data.type === 'created') {
                const tierName = this.membersUtils.hasMultipleTiers ? (data.tierName ?? 'Paid') : 'Paid';
                const sign = mrrDelta > 0 ? '' : '-';
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
    }

    getDescription(event) {
        if (event.type === 'click_event') {
            try {
                return this.utils.cleanTrackedUrl(event.data.link.to, true);
            } catch {
                // Invalid URL
            }
            return event.data.link.to;
        }
    }

    getURL(event) {
        const type = event.type;
        const data = event.data;
        if (['comment_event', 'click_event', 'feedback_event'].includes(type) && data.post) {
            return data.post.url;
        }
        if (['signup_event', 'subscription_event', 'donation_event'].includes(type) && data.attribution?.url) {
            return data.attribution.url;
        }
    }

    getRoute(event) {
        const type = event.type;
        const data = event.data;
        if (['click_event', 'feedback_event'].includes(type) && data.post) {
            return {name: 'posts-x', model: data.post.id};
        }
        if (['signup_event', 'subscription_event'].includes(type) && data.attribution_type === 'post') {
            return {name: 'posts-x', model: data.attribution_id};
        }
    }
}