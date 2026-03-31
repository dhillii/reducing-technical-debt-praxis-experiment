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

const CLICKABLE_EVENT_TYPES = ['comment_event', 'click_event', 'feedback_event'];
const ATTRIBUTION_EVENT_TYPES = ['signup_event', 'subscription_event', 'donation_event'];

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
        const subject = this.getSubject(event, memberName);
        const member = this.getMember(event, memberName);

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

    getSubject(event, memberName) {
        if (event.data.member) {
            return memberName || event.data.member.email;
        }
        return event.data.name || event.data.email || '';
    }

    getMember(event, memberName) {
        if (!event.data.member) {
            return event.data.member;
        }
        return {
            ...event.data.member,
            name: memberName
        };
    }

    getIcon(event) {
        const baseIcon = this.getBaseIcon(event);
        return baseIcon ? `event-${baseIcon}` : 'event-';
    }

    getBaseIcon(event) {
        if (EVENT_ICON_MAP[event.type]) {
            return EVENT_ICON_MAP[event.type];
        }

        if (event.type === 'newsletter_event') {
            return event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
        }

        if (event.type === 'subscription_event') {
            if (event.data.type === 'canceled') {
                return 'canceled-subscription';
            }
            if (event.data.type === 'created' && event.data.signup) {
                return 'signed-up';
            }
            return 'subscriptions';
        }

        if (event.type === 'signup_event' || (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup)) {
            return 'signed-up';
        }

        if (event.type === 'click_event' || event.type === 'aggregated_click_event') {
            return 'click';
        }

        if (event.type === 'feedback_event') {
            return event.data.score === 1 ? 'more-like-this' : 'less-like-this';
        }

        return null;
    }

    getAction(event, hasMultipleNewsletters) {
        if (EVENT_ACTION_MAP[event.type]) {
            return EVENT_ACTION_MAP[event.type];
        }

        if (event.type === 'signup_event' || (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup)) {
            return 'signed up';
        }

        if (event.type === 'newsletter_event') {
            return this.getNewsletterAction(event, hasMultipleNewsletters);
        }

        if (event.type === 'subscription_event') {
            return this.getSubscriptionAction(event);
        }

        if (event.type === 'automated_email_sent_event') {
            return this.getAutomatedEmailAction(event);
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
            return this.getEmailChangeAction(event);
        }

        if (event.type === 'donation_event') {
            return 'Made a one-time payment';
        }
    }

    getNewsletterAction(event, hasMultipleNewsletters) {
        let newsletter = 'newsletter';
        if (hasMultipleNewsletters && event.data.newsletter?.name) {
            newsletter = event.data.newsletter.name;
        }
        return event.data.subscribed ? `subscribed to ${newsletter}` : `unsubscribed from ${newsletter}`;
    }

    getSubscriptionAction(event) {
        const actionMap = {
            created: 'started paid subscription',
            updated: 'changed paid subscription',
            canceled: 'canceled paid subscription',
            reactivated: 'reactivated paid subscription',
            expired: 'ended paid subscription'
        };
        return actionMap[event.data.type] || 'changed paid subscription';
    }

    getAutomatedEmailAction(event) {
        const slug = event.data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    getEmailChangeAction(event) {
        if (event.data.from_email && event.data.to_email) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }
        return 'Email address changed';
    }

    getJoin() {
        return '–';
    }

    getObject(event) {
        if (ATTRIBUTION_EVENT_TYPES.includes(event.type)) {
            return event.data.attribution?.title || '';
        }

        if (event.type === 'comment_event') {
            return event.data.post?.title || '';
        }

        if (CLICKABLE_EVENT_TYPES.includes(event.type)) {
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

        if (event.data.type === 'created') {
            const sign = mrrDelta > 0 ? '' : '-';
            const tierName = this.membersUtils.hasMultipleTiers ? (event.data.tierName ?? 'Paid') : 'Paid';
            return `${tierName} ${sign}${symbol}${Math.abs(mrrDelta)}/month`;
        }

        const sign = mrrDelta > 0 ? '+' : '-';
        return `MRR ${sign}${symbol}${Math.abs(mrrDelta)}`;
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
        if (CLICKABLE_EVENT_TYPES.includes(event.type) && event.data.post) {
            return event.data.post.url;
        }

        if (ATTRIBUTION_EVENT_TYPES.includes(event.type) && event.data.attribution?.url) {
            return event.data.attribution.url;
        }
    }

    getRoute(event) {
        if (CLICKABLE_EVENT_TYPES.includes(event.type) && event.data.post) {
            return {
                name: 'posts-x',
                model: event.data.post.id
            };
        }

        if (ATTRIBUTION_EVENT_TYPES.includes(event.type) && event.data.attribution_type === 'post') {
            return {
                name: 'posts-x',
                model: event.data.attribution_id
            };
        }
    }
}
```