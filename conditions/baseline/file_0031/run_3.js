```javascript
import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject as service} from '@ember/service';

const EVENT_ICON_MAP = {
    login_event: 'logged-in',
    payment_event: 'subscriptions',
    email_opened_event: 'opened-email',
    email_sent_event: 'sent-email',
    automated_email_sent_event: 'sent-email',
    email_delivered_event: 'received-email',
    email_failed_event: 'email-delivery-failed',
    email_complaint_event: 'email-delivery-spam',
    comment_event: 'comment',
    donation_event: 'subscriptions',
    email_change_event: 'email-changed'
};

const EVENT_ACTION_MAP = {
    login_event: 'logged in',
    payment_event: 'made payment',
    email_opened_event: 'opened email',
    email_sent_event: 'sent email',
    email_delivered_event: 'received email',
    email_failed_event: 'bounced email',
    email_complaint_event: 'email flagged as spam'
};

const OBJECT_EVENT_TYPES = ['signup_event', 'subscription_event', 'donation_event', 'comment_event', 'click_event', 'feedback_event'];
const URL_EVENT_TYPES = ['comment_event', 'click_event', 'feedback_event', 'signup_event', 'subscription_event', 'donation_event'];
const ROUTE_EVENT_TYPES = ['click_event', 'feedback_event', 'signup_event', 'subscription_event'];

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
        const subject = event.data.member ? (memberName || event.data.member.email) : (event.data.name || event.data.email || '');
        const member = event.data.member ? {...event.data.member, name: memberName} : event.data.member;

        return {
            memberId: event.data.member_id ?? event.data.member?.id,
            member,
            emailId: event.data.email_id,
            email: event.data.email,
            icon: this.getIcon(event),
            subject,
            action: this.getAction(event, hasMultipleNewsletters),
            join: this.getJoin(),
            object: this.getObject(event),
            source: this.getSource(event),
            info: this.getInfo(event),
            description: this.getDescription(event),
            url: this.getURL(event),
            route: this.getRoute(event),
            timestamp: moment(event.data.created_at)
        };
    }

    getIcon(event) {
        const {type, data} = event;

        // Check simple mappings first
        if (EVENT_ICON_MAP[type]) {
            return `event-${EVENT_ICON_MAP[type]}`;
        }

        // Handle conditional icons
        if (type === 'newsletter_event') {
            const icon = data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
            return `event-${icon}`;
        }

        if (type === 'subscription_event') {
            const icon = data.type === 'canceled' ? 'canceled-subscription' : 'subscriptions';
            return `event-${icon}`;
        }

        if (type === 'signup_event' || (type === 'subscription_event' && data.type === 'created' && data.signup)) {
            return 'event-signed-up';
        }

        if (type === 'click_event' || type === 'aggregated_click_event') {
            return 'event-click';
        }

        if (type === 'feedback_event') {
            const icon = data.score === 1 ? 'more-like-this' : 'less-like-this';
            return `event-${icon}`;
        }

        return 'event-unknown';
    }

    getAction(event, hasMultipleNewsletters) {
        const {type, data} = event;

        // Check simple mappings first
        if (EVENT_ACTION_MAP[type]) {
            return EVENT_ACTION_MAP[type];
        }

        if (type === 'signup_event' || (type === 'subscription_event' && data.type === 'created' && data.signup)) {
            return 'signed up';
        }

        if (type === 'newsletter_event') {
            const newsletter = hasMultipleNewsletters && data.newsletter?.name ? data.newsletter.name : 'newsletter';
            return data.subscribed ? `subscribed to ${newsletter}` : `unsubscribed from ${newsletter}`;
        }

        if (type === 'subscription_event') {
            const subscriptionActions = {
                created: 'started paid subscription',
                updated: 'changed paid subscription',
                canceled: 'canceled paid subscription',
                reactivated: 'reactivated paid subscription',
                expired: 'ended paid subscription'
            };
            return subscriptionActions[data.type] || 'changed paid subscription';
        }

        if (type === 'automated_email_sent_event') {
            const emailType = data.automatedEmail?.slug?.includes('paid') ? 'Paid' : 'Free';
            return `received welcome email (${emailType})`;
        }

        if (type === 'comment_event') {
            return data.parent ? 'replied to comment' : 'commented';
        }

        if (type === 'click_event') {
            return 'clicked link in email';
        }

        if (type === 'aggregated_click_event') {
            return data.count.clicks <= 1 ? 'clicked link in email' : `clicked ${ghPluralize(data.count.clicks, 'link')} in email`;
        }

        if (type === 'feedback_event') {
            return data.score === 1 ? 'more like this' : 'less like this';
        }

        if (type === 'email_change_event') {
            return data.from_email && data.to_email
                ? `Email address changed from ${data.from_email} to ${data.to_email}`
                : 'Email address changed';
        }

        if (type === 'donation_event') {
            return 'Made a one-time payment';
        }
    }

    getJoin() {
        return '–';
    }

    getObject(event) {
        const {type, data} = event;

        if (['signup_event', 'subscription_event', 'donation_event'].includes(type) && data.attribution?.title) {
            return data.attribution.title;
        }

        if (['comment_event', 'click_event', 'feedback_event'].includes(type) && data.post?.title) {
            return data.post.title;
        }

        return '';
    }

    getSource(event) {
        const {attribution} = event.data;
        if (attribution?.referrer_source) {
            return {
                name: attribution.referrer_source,
                url: attribution.referrer_url ?? null
            };
        }
        return null;
    }

    getInfo(event) {
        const {type, data} = event;

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
            return symbol + getNonDecimal(data.amount, data.currency);
        }
    }

    getDescription(event) {
        if (event.type === 'click_event') {
            try {
                return this.utils.cleanTrackedUrl(event.data.link.to, true);
            } catch (e) {
                return event.data.link.to;
            }
        }
    }

    getURL(event) {
        const {type, data} = event;

        if (['comment_event', 'click_event', 'feedback_event'].includes(type) && data.post?.url) {
            return data.post.url;
        }

        if (['signup_event', 'subscription_event', 'donation_event'].includes(type) && data.attribution?.url) {
            return data.attribution.url;
        }
    }

    getRoute(event) {
        const {type, data} = event;

        if (['click_event', 'feedback_event'].includes(type) && data.post?.id) {
            return {
                name: 'posts-x',
                model: data.post.id
            };
        }

        if (['signup_event', 'subscription_event'].includes(type) && data.attribution_type === 'post') {
            return {
                name: 'posts-x',
                model: data.attribution_id
            };
        }
    }
}
```