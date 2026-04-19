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
        // Always convert to null if the value is empty/null/undefined
        if (!value && value !== 0) {
            return null;
        }

        // Force to string and trim
        const trimmed = String(value).trim();

        // Convert empty strings or pure whitespace to null
        return trimmed || null;
    }

    compute([event, hasMultipleNewsletters]) {
        let memberName = event.data.member?.name;
        memberName = this.trimString(memberName);

        const subject = this.getSubject(event, memberName);
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

        // Also ensure the member object has the transformed name
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

    getSubject(event, memberName) {
        return event.data.member ? (memberName || event.data.member.email) : (event.data.name || event.data.email || '');
    }

    getIcon(event) {
        const getIconForType = (type) => {
            switch (type) {
                case 'login_event':
                    return 'logged-in';
                case 'payment_event':
                    return 'subscriptions';
                case 'newsletter_event':
                    return event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
                case 'subscription_event':
                    return 'subscriptions';
                case 'signup_event':
                case 'subscription_event':
                    return event.data.type === 'created' && event.data.signup ? 'signed-up' : 'changed-paid-subscription';
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
                    return event.data.parent ? 'replied-to-comment' : 'commented';
                case 'click_event':
                case 'aggregated_click_event':
                    return event.data.count.clicks <= 1 ? 'clicked-link-in-email' : `clicked-${ghPluralize(event.data.count.clicks, 'link')}in-email`;
                case 'feedback_event':
                    return event.data.score === 1 ? 'more-like-this' : 'less-like-this';
                case 'email_change_event':
                    return event.data.from_email && event.data.to_email ? `Email address changed from ${event.data.from_email} to ${event.data.to_email}` : 'Email address changed';
                case 'donation_event':
                    return 'made-a-one-time-payment';
                default:
                    return 'event-' + (event.type || 'unknown');
            }
        };

        return getIconForType(event.type);
    }

    getAction(event, hasMultipleNewsletters) {
        const getActionForType = (type) => {
            switch (type) {
                case 'signup_event':
                case 'subscription_event':
                    return event.data.type === 'created' && event.data.signup ? 'signed-up' : 'changed-paid-subscription';
                case 'login_event':
                    return 'logged-in';
                case 'payment_event':
                    return 'made-payment';
                case 'newsletter_event':
                    return event.data.subscribed ? 'subscribed-to-newsletter' : 'unsubscribed-from-newsletter';
                case 'subscription_event':
                    return {
                        created: 'started-paid-subscription',
                        updated: 'changed-paid-subscription',
                        canceled: 'canceled-paid-subscription',
                        reactivated: 'reactivated-paid-subscription',
                        expired: 'ended-paid-subscription'
                    }[event.data.type] || 'changed-paid-subscription';
                case 'email_opened_event':
                    return 'opened-email';
                case 'email_sent_event':
                case 'automated_email_sent_event':
                    return 'sent-email';
                case 'email_delivered_event':
                    return 'received-email';
                case 'email_failed_event':
                    return 'bounced-email';
                case 'email_complaint_event':
                    return 'email-flagged-as-spam';
                case 'comment_event':
                    return event.data.parent ? 'replied-to-comment' : 'commented';
                case 'click_event':
                case 'aggregated_click_event':
                    return event.data.count.clicks <= 1 ? 'clicked-link-in-email' : `clicked-${ghPluralize(event.data.count.clicks, 'link')}in-email`;
                case 'feedback_event':
                    return event.data.score === 1 ? 'more-like-this' : 'less-like-this';
                case 'email_change_event':
                    return event.data.from_email && event.data.to_email ? `Email address changed from ${event.data.from_email} to ${event.data.to_email}` : 'Email address changed';
                case 'donation_event':
                    return 'made-a-one-time-payment';
                default:
                    return 'unknown-action';
            }
        };

        return getActionForType(event.type);
    }

    getJoin() {
        return '–';
    }

    getObject(event) {
        const getObjectForType = (type) => {
            switch (type) {
                case 'signup_event':
                case 'subscription_event':
                case 'donation_event':
                    return event.data.attribution?.title || '';
                case 'comment_event':
                    return event.data.post?.title || '';
                case 'click_event':
                case 'feedback_event':
                    return event.data.post?.title || '';
                default:
                    return '';
            }
        };

        return getObjectForType(event.type);
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
        const getInfoForType = (type) => {
            switch (type) {
                case 'subscription_event':
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
                case 'signup_event':
                    if (this.membersUtils.paidMembersEnabled) {
                        return 'Free';
                    }
                    break;
                case 'donation_event':
                    const symbol = getSymbol(event.data.currency);
                    const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
                    return formattedAmount;
            }
        };

        return getInfoForType(event.type);
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
        const getURLForType = (type) => {
            switch (type) {
                case 'comment_event':
                case 'click_event':
                case 'feedback_event':
                    return event.data.post?.url || '';
                case 'signup_event':
                case 'subscription_event':
                    return event.data.attribution?.url || '';
            }
        };

        return getURLForType(event.type);
    }

    getRoute(event) {
        const getRouteForType = (type) => {
            switch (type) {
                case 'click_event':
                case 'feedback_event':
                    return event.data.post ? {name: 'posts-x', model: event.data.post.id} : null;
                case 'signup_event':
                case 'subscription_event':
                    return event.data.attribution_type === 'post' ? {name: 'posts-x', model: event.data.attribution_id} : null;
            }
        };

        return getRouteForType(event.type);
    }
}