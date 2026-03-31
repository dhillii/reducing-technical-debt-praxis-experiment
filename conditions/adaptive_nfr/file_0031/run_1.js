```javascript
import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject as service} from '@ember/service';

const ICON_MAP = {
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

const SUBSCRIPTION_ACTION_MAP = {
    created: 'started paid subscription',
    updated: 'changed paid subscription',
    canceled: 'canceled paid subscription',
    reactivated: 'reactivated paid subscription',
    expired: 'ended paid subscription'
};

const isSignupEvent = event =>
    event.type === 'signup_event' ||
    (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup);

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
        const member = event.data.member ? {...event.data.member, name: memberName} : event.data.member;
        const subject = event.data.member
            ? (memberName || event.data.member.email)
            : (event.data.name || event.data.email || '');

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
        let icon = ICON_MAP[event.type];

        if (isSignupEvent(event)) {
            icon = 'signed-up';
        } else if (event.type === 'newsletter_event') {
            icon = event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
        } else if (event.type === 'subscription_event') {
            icon = event.data.type === 'canceled' ? 'canceled-subscription' : 'subscriptions';
        } else if (event.type === 'feedback_event') {
            icon = event.data.score === 1 ? 'more-like-this' : 'less-like-this';
        }

        return `event-${icon}`;
    }

    getAction(event, hasMultipleNewsletters) {
        if (isSignupEvent(event)) {
            return 'signed up';
        }

        const simpleActions = {
            login_event: 'logged in',
            payment_event: 'made payment',
            email_opened_event: 'opened email',
            email_sent_event: 'sent email',
            email_delivered_event: 'received email',
            email_failed_event: 'bounced email',
            email_complaint_event: 'email flagged as spam',
            donation_event: 'Made a one-time payment'
        };

        if (simpleActions[event.type]) {
            return simpleActions[event.type];
        }

        if (event.type === 'newsletter_event') {
            return this.getNewsletterAction(event, hasMultipleNewsletters);
        }

        if (event.type === 'subscription_event') {
            return SUBSCRIPTION_ACTION_MAP[event.data.type] ?? 'changed paid subscription';
        }

        if (event.type === 'automated_email_sent_event') {
            const emailType = event.data.automatedEmail?.slug?.includes('paid') ? 'Paid' : 'Free';
            return `received welcome email (${emailType})`;
        }

        if (event.type === 'comment_event') {
            return event.data.parent ? 'replied to comment' : 'commented';
        }

        if (event.type === 'click_event') {
            return 'clicked link in email';
        }

        if (event.type === 'aggregated_click_event') {
            return event.data.count.clicks <= 1
                ? 'clicked link in email'
                : `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
        }

        if (event.type === 'feedback_event') {
            return event.data.score === 1 ? 'more like this' : 'less like this';
        }

        if (event.type === 'email_change_event') {
            return event.data.from_email && event.data.to_email
                ? `Email address changed from ${event.data.from_email} to ${event.data.to_email}`
                : 'Email address changed';
        }
    }

    getNewsletterAction(event, hasMultipleNewsletters) {
        const newsletter = hasMultipleNewsletters && event.data.newsletter?.name
            ? event.data.newsletter.name
            : 'newsletter';
        return event.data.subscribed
            ? `subscribed to ${newsletter}`
            : `unsubscribed from ${newsletter}`;
    }

    getJoin() {
        return '–';
    }

    getObject(event) {
        const postTitleTypes = ['comment_event', 'click_event', 'feedback_event'];
        const attributionTypes = ['signup_event', 'subscription_event', 'donation_event'];

        if (attributionTypes.includes(event.type) && event.data.attribution?.title) {
            return event.data.attribution.title;
        }

        if (postTitleTypes.includes(event.type) && event.data.post) {
            return event.data.post.title;
        }

        return '';
    }

    getSource(event) {
        const source = event.data?.attribution?.referrer_source;
        if (!source) {
            return null;
        }
        return {
            name: source,
            url: event.data.attribution.referrer_url ?? null
        };
    }

    getInfo(event) {
        if (event.type === 'subscription_event') {
            return this.getSubscriptionInfo(event);
        }

        if (event.type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }

        if (event.type === 'donation_event') {
            const symbol = getSymbol(event.data.currency);
            return symbol + getNonDecimal(event.data.amount, event.data.currency);
        }
    }

    getSubscriptionInfo(event) {
        const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
        if (mrrDelta === 0) {
            return;
        }

        const symbol = getSymbol(event.data.currency);
        const absValue = Math.abs(mrrDelta);

        if (event.data.type === 'created') {
            const sign = mrrDelta > 0 ? '' : '-';
            const tierName = this.membersUtils.hasMultipleTiers ? (event.data.tierName ?? 'Paid') : 'Paid';
            return `${tierName} ${sign}${symbol}${absValue}/month`;
        }

        const sign = mrrDelta > 0 ? '+' : '-';
        return `MRR ${sign}${symbol}${absValue}`;
    }

    getDescription(event) {
        if (event.type !== 'click_event') {
            return;
        }
        try {
            return this.utils.cleanTrackedUrl(event.data.link.to, true);
        } catch (e) {
            return event.data.link.to;
        }
    }

    getURL(event) {
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type) && event.data.post) {
            return event.data.post.url;
        }

        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type) && event.data.attribution?.url) {
            return event.data.attribution.url;
        }
    }

    getRoute(event) {
        if (['click_event', 'feedback_event'].includes(event.type) && event.data.post) {
            return {name: 'posts-x', model: event.data.post.id};
        }

        if (['signup_event', 'subscription_event'].includes(event.type) && event.data.attribution_type === 'post') {
            return {name: 'posts-x', model: event.data.attribution_id};
        }
    }
}
```