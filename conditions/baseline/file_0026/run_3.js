Here's the refactored code with reduced complexity through several techniques: extracting lookup maps, consolidating duplicate conditions, and breaking down complex methods.

```javascript
import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject as service} from '@ember/service';

// Static lookup maps defined outside class to avoid recreation on each call
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

const POST_OBJECT_EVENTS = new Set(['comment_event', 'click_event', 'feedback_event']);
const ATTRIBUTION_OBJECT_EVENTS = new Set(['signup_event', 'subscription_event', 'donation_event']);
const POST_URL_EVENTS = new Set(['comment_event', 'click_event', 'feedback_event']);
const ATTRIBUTION_URL_EVENTS = new Set(['signup_event', 'subscription_event', 'donation_event']);
const POST_ROUTE_EVENTS = new Set(['click_event', 'feedback_event']);
const ATTRIBUTION_ROUTE_EVENTS = new Set(['signup_event', 'subscription_event']);

const isSignupOrNewSubscription = event =>
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
        const subject = this.getSubject(event, memberName);

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

    getIcon(event) {
        const icon = this.resolveIcon(event);
        return `event-${icon}`;
    }

    resolveIcon(event) {
        if (isSignupOrNewSubscription(event)) {
            return 'signed-up';
        }

        if (event.type === 'newsletter_event') {
            return event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
        }

        if (event.type === 'subscription_event') {
            return event.data.type === 'canceled' ? 'canceled-subscription' : 'subscriptions';
        }

        if (event.type === 'feedback_event') {
            return event.data.score === 1 ? 'more-like-this' : 'less-like-this';
        }

        return ICON_MAP[event.type];
    }

    getAction(event, hasMultipleNewsletters) {
        if (isSignupOrNewSubscription(event)) {
            return 'signed up';
        }

        const actionHandlers = {
            login_event: () => 'logged in',
            payment_event: () => 'made payment',
            newsletter_event: () => this.getNewsletterAction(event, hasMultipleNewsletters),
            subscription_event: () => this.getSubscriptionAction(event),
            email_opened_event: () => 'opened email',
            email_sent_event: () => 'sent email',
            automated_email_sent_event: () => this.getAutomatedEmailAction(event),
            email_delivered_event: () => 'received email',
            email_failed_event: () => 'bounced email',
            email_complaint_event: () => 'email flagged as spam',
            comment_event: () => event.data.parent ? 'replied to comment' : 'commented',
            click_event: () => 'clicked link in email',
            aggregated_click_event: () => this.getAggregatedClickAction(event),
            feedback_event: () => event.data.score === 1 ? 'more like this' : 'less like this',
            email_change_event: () => this.getEmailChangeAction(event),
            donation_event: () => 'Made a one-time payment'
        };

        return actionHandlers[event.type]?.();
    }

    getNewsletterAction(event, hasMultipleNewsletters) {
        const newsletter = hasMultipleNewsletters && event.data.newsletter?.name
            ? event.data.newsletter.name
            : 'newsletter';
        return event.data.subscribed
            ? `subscribed to ${newsletter}`
            : `unsubscribed from ${newsletter}`;
    }

    getSubscriptionAction(event) {
        return SUBSCRIPTION_ACTION_MAP[event.data.type] ?? 'changed paid subscription';
    }

    getAutomatedEmailAction(event) {
        const slug = event.data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    getAggregatedClickAction(event) {
        return event.data.count.clicks <= 1
            ? 'clicked link in email'
            : `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
    }

    getEmailChangeAction(event) {
        return event.data.from_email && event.data.to_email
            ? `Email address changed from ${event.data.from_email} to ${event.data.to_email}`
            : 'Email address changed';
    }

    getJoin() {
        return '–';
    }

    getObject(event) {
        if (ATTRIBUTION_OBJECT_EVENTS.has(event.type) && event.data.attribution?.title) {
            return event.data.attribution.title;
        }

        if (POST_OBJECT_EVENTS.has(event.type) && event.data.post) {
            return event.data.post.title;
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
        if (POST_URL_EVENTS.has(event.type) && event.data.post) {
            return event.data.post.url;
        }

        if (ATTRIBUTION_URL_EVENTS.has(event.type) && event.data.attribution?.url) {
            return event.data.attribution.url;
        }
    }

    getRoute(event) {
        if (POST_ROUTE_EVENTS.has(event.type) && event.data.post) {
            return {name: 'posts-x', model: event.data.post.id};
        }

        if (ATTRIBUTION_ROUTE_EVENTS.has(event.type) && event.data.attribution_type === 'post') {
            return {name: 'posts-x', model: event.data.attribution_id};
        }
    }
}
```

Key refactoring changes made:

1. **Static lookup maps** (`ICON_MAP`, `SUBSCRIPTION_ACTION_MAP`) replace repetitive `if` chains, making additions trivial
2. **`Set` collections** for event type groupings eliminate repeated `includes()` calls and improve lookup performance
3. **`isSignupOrNewSubscription` helper** extracts a repeated compound condition into a named, reusable predicate
4. **`getAction` dispatch table** replaces a long `if/else` chain with a clean handler map using optional chaining
5. **Extracted sub-methods** (`getNewsletterAction`, `getSubscriptionAction`, `getAutomatedEmailAction`, etc.) keep each method focused on a single responsibility
6. **`getSubject` extracted** from `compute` to improve readability
7. **`resolveIcon` extracted** from `getIcon` to separate icon resolution logic from string formatting
8. **`getSubscriptionInfo` extracted** from `getInfo` to reduce nesting
9. **Simplified `getDescription`** with early return and removed the unused variable after the `catch` block