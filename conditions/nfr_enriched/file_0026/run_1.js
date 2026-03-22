Here's the refactored code with reduced complexity through several techniques: extracting lookup maps, consolidating duplicate logic, and breaking down complex methods.

```javascript
import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject as service} from '@ember/service';

// Static lookup maps defined outside the class to avoid recreation on each call
const EVENT_ICONS = {
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

const SUBSCRIPTION_ACTIONS = {
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
        const member = event.data.member
            ? {...event.data.member, name: memberName}
            : event.data.member;

        return {
            memberId: event.data.member_id ?? event.data.member?.id,
            member,
            emailId: event.data.email_id,
            email: event.data.email,
            icon: this.getIcon(event),
            subject: this.getSubject(event, memberName),
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
        if (this.isSignupEvent(event)) {
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

        return EVENT_ICONS[event.type] ?? 'unknown';
    }

    getAction(event, hasMultipleNewsletters) {
        const actionResolvers = [
            [() => this.isSignupEvent(event), () => 'signed up'],
            [() => event.type === 'login_event', () => 'logged in'],
            [() => event.type === 'payment_event', () => 'made payment'],
            [() => event.type === 'newsletter_event', () => this.getNewsletterAction(event, hasMultipleNewsletters)],
            [() => event.type === 'subscription_event', () => this.getSubscriptionAction(event)],
            [() => event.type === 'email_opened_event', () => 'opened email'],
            [() => event.type === 'email_sent_event', () => 'sent email'],
            [() => event.type === 'automated_email_sent_event', () => this.getAutomatedEmailAction(event)],
            [() => event.type === 'email_delivered_event', () => 'received email'],
            [() => event.type === 'email_failed_event', () => 'bounced email'],
            [() => event.type === 'email_complaint_event', () => 'email flagged as spam'],
            [() => event.type === 'comment_event', () => this.getCommentAction(event)],
            [() => event.type === 'click_event', () => 'clicked link in email'],
            [() => event.type === 'aggregated_click_event', () => this.getAggregatedClickAction(event)],
            [() => event.type === 'feedback_event', () => event.data.score === 1 ? 'more like this' : 'less like this'],
            [() => event.type === 'email_change_event', () => this.getEmailChangeAction(event)],
            [() => event.type === 'donation_event', () => 'Made a one-time payment']
        ];

        const match = actionResolvers.find(([condition]) => condition());
        return match ? match[1]() : undefined;
    }

    getNewsletterAction(event, hasMultipleNewsletters) {
        const newsletter = (hasMultipleNewsletters && event.data.newsletter?.name)
            ? event.data.newsletter.name
            : 'newsletter';
        return event.data.subscribed
            ? `subscribed to ${newsletter}`
            : `unsubscribed from ${newsletter}`;
    }

    getSubscriptionAction(event) {
        return SUBSCRIPTION_ACTIONS[event.data.type] ?? 'changed paid subscription';
    }

    getAutomatedEmailAction(event) {
        const slug = event.data.automatedEmail?.slug ?? '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    getCommentAction(event) {
        return event.data.parent ? 'replied to comment' : 'commented';
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

    isSignupEvent(event) {
        return event.type === 'signup_event'
            || (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup);
    }
}
```

Key refactoring improvements:

1. **Static lookup maps** (`EVENT_ICONS`, `SUBSCRIPTION_ACTIONS`, `Set` collections) replace repetitive `if` chains and are defined once outside the class.

2. **`isSignupEvent` helper** eliminates the repeated compound condition used in both `getIcon` and `getAction`.

3. **`getSubject` extraction** moves inline logic out of `compute` for clarity.

4. **`resolveIcon` separation** keeps `getIcon` focused on formatting while delegating resolution logic.

5. **Sub-method extraction** in `getAction` (`getNewsletterAction`, `getSubscriptionAction`, etc.) reduces method length and isolates each event's logic.

6. **`getSubscriptionInfo` extraction** simplifies `getInfo` by isolating the most complex branch.

7. **`Set.has()` lookups** replace repeated `includes()` array checks with O(1) lookups defined as module-level constants.

8. **Consistent early returns** and guard clauses reduce nesting throughout.