Here's the refactored code with reduced complexity through several techniques: extracting lookup maps, consolidating duplicate logic, and simplifying conditional chains.

```javascript
import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject as service} from '@ember/service';

// Static lookup maps moved outside class to avoid recreation on each call
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

const POST_EVENTS = new Set(['comment_event', 'click_event', 'feedback_event']);
const ATTRIBUTION_EVENTS = new Set(['signup_event', 'subscription_event', 'donation_event']);
const ROUTE_POST_EVENTS = new Set(['click_event', 'feedback_event']);
const ROUTE_ATTRIBUTION_EVENTS = new Set(['signup_event', 'subscription_event']);

const isSignupOrCreatedSubscription = event =>
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

        if (event.type === 'newsletter_event') {
            icon = event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
        } else if (event.type === 'subscription_event') {
            icon = event.data.type === 'canceled' ? 'canceled-subscription' : 'subscriptions';
        } else if (event.type === 'feedback_event') {
            icon = event.data.score === 1 ? 'more-like-this' : 'less-like-this';
        }

        if (isSignupOrCreatedSubscription(event)) {
            icon = 'signed-up';
        }

        return `event-${icon}`;
    }

    getAction(event, hasMultipleNewsletters) {
        if (isSignupOrCreatedSubscription(event)) {
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

        const actionHandlers = {
            newsletter_event: () => this.getNewsletterAction(event, hasMultipleNewsletters),
            subscription_event: () => SUBSCRIPTION_ACTION_MAP[event.data.type] ?? 'changed paid subscription',
            automated_email_sent_event: () => this.getAutomatedEmailAction(event),
            comment_event: () => event.data.parent ? 'replied to comment' : 'commented',
            click_event: () => 'clicked link in email',
            aggregated_click_event: () => this.getAggregatedClickAction(event),
            feedback_event: () => event.data.score === 1 ? 'more like this' : 'less like this',
            email_change_event: () => this.getEmailChangeAction(event)
        };

        return actionHandlers[event.type]?.();
    }

    getNewsletterAction(event, hasMultipleNewsletters) {
        const newsletter = (hasMultipleNewsletters && event.data.newsletter?.name)
            ? event.data.newsletter.name
            : 'newsletter';
        return event.data.subscribed
            ? `subscribed to ${newsletter}`
            : `unsubscribed from ${newsletter}`;
    }

    getAutomatedEmailAction(event) {
        const slug = event.data.automatedEmail?.slug ?? '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    getAggregatedClickAction(event) {
        return event.data.count.clicks <= 1
            ? 'clicked link in email'
            : `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
    }

    getEmailChangeAction(event) {
        return (event.data.from_email && event.data.to_email)
            ? `Email address changed from ${event.data.from_email} to ${event.data.to_email}`
            : 'Email address changed';
    }

    getJoin() {
        return '–';
    }

    getObject(event) {
        if (ATTRIBUTION_EVENTS.has(event.type)) {
            return event.data.attribution?.title ?? '';
        }

        if (POST_EVENTS.has(event.type)) {
            return event.data.post?.title ?? '';
        }

        return '';
    }

    getSource(event) {
        const attribution = event.data?.attribution;
        if (!attribution?.referrer_source) {
            return null;
        }
        return {
            name: attribution.referrer_source,
            url: attribution.referrer_url ?? null
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

        if (event.data.type === 'created') {
            const sign = mrrDelta > 0 ? '' : '-';
            const tierName = this.membersUtils.hasMultipleTiers
                ? (event.data.tierName ?? 'Paid')
                : 'Paid';
            return `${tierName} ${sign}${symbol}${Math.abs(mrrDelta)}/month`;
        }

        const sign = mrrDelta > 0 ? '+' : '-';
        return `MRR ${sign}${symbol}${Math.abs(mrrDelta)}`;
    }

    getDescription(event) {
        if (event.type !== 'click_event') {
            return;
        }

        try {
            return this.utils.cleanTrackedUrl(event.data.link.to, true);
        } catch {
            return event.data.link.to;
        }
    }

    getURL(event) {
        if (POST_EVENTS.has(event.type)) {
            return event.data.post?.url;
        }

        if (ATTRIBUTION_EVENTS.has(event.type)) {
            return event.data.attribution?.url;
        }
    }

    getRoute(event) {
        if (ROUTE_POST_EVENTS.has(event.type) && event.data.post) {
            return {name: 'posts-x', model: event.data.post.id};
        }

        if (ROUTE_ATTRIBUTION_EVENTS.has(event.type) && event.data.attribution_type === 'post') {
            return {name: 'posts-x', model: event.data.attribution_id};
        }
    }
}
```

Key refactoring improvements:

1. **Static lookup maps** (`ICON_MAP`, `SUBSCRIPTION_ACTION_MAP`, `POST_EVENTS`, etc.) extracted outside the class to avoid recreation on every call and make intent clearer.

2. **`getAction` simplified** by separating simple one-liner actions into a local map and complex ones into dedicated handler methods (`getNewsletterAction`, `getAutomatedEmailAction`, etc.), reducing nesting depth.

3. **`getIcon` simplified** using the `ICON_MAP` with only special cases handled inline.

4. **`getObject` and `getURL`** consolidated using shared `Set` constants, eliminating repeated type checks.

5. **`getSubscriptionInfo`** extracted from `getInfo` to reduce method length and isolate complexity.

6. **`getDescription`** simplified with an early return guard.

7. **Optional chaining** used consistently to reduce verbose null checks.

8. **`isSignupOrCreatedSubscription`** extracted as a named predicate to avoid duplicating the same compound condition across multiple methods.