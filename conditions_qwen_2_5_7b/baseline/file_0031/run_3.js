```javascript
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
        return String(value).trim() || null;
    }

    compute([event, hasMultipleNewsletters]) {
        const memberName = this.trimString(event.data.member?.name);
        const subject = memberName || event.data.member?.email || (event.data.name || event.data.email || '');
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

    getIcon(event) {
        const icons = {
            'login_event': 'logged-in',
            'payment_event': 'subscriptions',
            'newsletter_event': event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email',
            'subscription_event': 'subscriptions',
            'signup_event': event.data.type === 'created' && event.data.signup ? 'signed-up' : 'started-paid-subscription',
            'email_opened_event': 'opened-email',
            'email_sent_event': 'sent-email',
            'automated_email_sent_event': 'sent-email',
            'email_delivered_event': 'received-email',
            'email_failed_event': 'email-delivery-failed',
            'email_complaint_event': 'email-delivery-spam',
            'comment_event': event.data.parent ? 'replied-to-comment' : 'commented',
            'click_event': event.data.count.clicks <= 1 ? 'clicked-link-in-email' : `clicked-${ghPluralize(event.data.count.clicks, 'link')}s-in-email`,
            'feedback_event': event.data.score === 1 ? 'more-like-this' : 'less-like-this',
            'email_change_event': event.data.from_email && event.data.to_email ? `email-address-changed-from-${event.data.from_email}-to-${event.data.to_email}` : 'email-address-changed',
            'donation_event': 'made-a-one-time-payment'
        };

        return `event-${icons[event.type]}`;
    }

    getAction(event, hasMultipleNewsletters) {
        const actions = {
            'signup_event': event.data.type === 'created' && event.data.signup ? 'signed-up' : 'started-paid-subscription',
            'login_event': 'logged-in',
            'payment_event': 'made-payment',
            'newsletter_event': event.data.subscribed ? 'subscribed-to-newsletter' : 'unsubscribed-from-newsletter',
            'subscription_event': {
                'created': 'started-paid-subscription',
                'updated': 'changed-paid-subscription',
                'canceled': 'canceled-paid-subscription',
                'reactivated': 'reactivated-paid-subscription',
                'expired': 'ended-paid-subscription'
            },
            'email_opened_event': 'opened-email',
            'email_sent_event': 'sent-email',
            'automated_email_sent_event': `received-welcome-email-${event.data.automatedEmail?.slug.includes('paid') ? 'paid' : 'free'}`,
            'email_delivered_event': 'received-email',
            'email_failed_event': 'bounced-email',
            'email_complaint_event': 'email-flagged-as-spam',
            'comment_event': event.data.parent ? 'replied-to-comment' : 'commented',
            'click_event': event.data.count.clicks <= 1 ? 'clicked-link-in-email' : `clicked-${ghPluralize(event.data.count.clicks, 'link')}s-in-email`,
            'feedback_event': event.data.score === 1 ? 'more-like-this' : 'less-like-this',
            'email_change_event': event.data.from_email && event.data.to_email ? `email-address-changed-from-${event.data.from_email}-to-${event.data.to_email}` : 'email-address-changed',
            'donation_event': 'made-a-one-time-payment'
        };

        return actions[event.type] || actions[event.type][event.data.type] || actions[event.type];
    }

    getJoin() {
        return '–';
    }

    getObject(event) {
        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type)) {
            return event.data.attribution?.title || '';
        }
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type)) {
            return event.data.post?.title || '';
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
        if (event.type === 'subscription_event') {
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
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type)) {
            return event.data.post?.url || '';
        }
        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type)) {
            return event.data.attribution?.url || '';
        }
        return;
    }

    getRoute(event) {
        if (['click_event', 'feedback_event'].includes(event.type)) {
            return event.data.post ? {name: 'posts-x', model: event.data.post.id} : null;
        }
        if (['signup_event', 'subscription_event'].includes(event.type)) {
            return event.data.attribution_type === 'post' ? {name: 'posts-x', model: event.data.attribution_id} : null;
        }
        return null;
    }
}
```