## Refactored Code

The main issues are: large switch-like if-chains, repeated type checks, and scattered configuration logic. I'll extract lookup maps, consolidate type-based logic, and separate concerns.

```javascript
import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject as service} from '@ember/service';

// ─── Static lookup maps ───────────────────────────────────────────────────────

const ICON_MAP = {
    login_event: 'logged-in',
    payment_event: 'subscriptions',
    subscription_event: 'subscriptions',
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

// Event types whose object/URL come from post data
const POST_OBJECT_TYPES = new Set(['comment_event', 'click_event', 'feedback_event']);

// Event types whose object/URL come from attribution data
const ATTRIBUTION_OBJECT_TYPES = new Set(['signup_event', 'subscription_event', 'donation_event']);

// Event types that use post-based routing
const POST_ROUTE_TYPES = new Set(['click_event', 'feedback_event']);

// Event types that use attribution-based routing
const ATTRIBUTION_ROUTE_TYPES = new Set(['signup_event', 'subscription_event']);

// ─── Helper ───────────────────────────────────────────────────────────────────

export default class ParseMemberEventHelper extends Helper {
    @service feature;
    @service utils;
    @service membersUtils;

    // ── Public API ────────────────────────────────────────────────────────────

    compute([event, hasMultipleNewsletters]) {
        const memberName = this.#normalizeMemberName(event.data.member?.name);
        const member = this.#buildMember(event.data.member, memberName);

        return {
            memberId: event.data.member_id ?? event.data.member?.id,
            member,
            emailId: event.data.email_id,
            email: event.data.email,
            subject: this.#getSubject(event.data.member, memberName, event.data),
            icon: this.#getIcon(event),
            action: this.#getAction(event, hasMultipleNewsletters),
            join: '–',
            object: this.#getObject(event),
            source: this.#getSource(event),
            info: this.#getInfo(event),
            description: this.#getDescription(event),
            url: this.#getURL(event),
            route: this.#getRoute(event),
            timestamp: moment(event.data.created_at)
        };
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    #normalizeMemberName(value) {
        if (!value && value !== 0) {
            return null;
        }
        return String(value).trim() || null;
    }

    #buildMember(member, memberName) {
        return member ? {...member, name: memberName} : member;
    }

    #getSubject(member, memberName, data) {
        if (member) {
            return memberName || member.email;
        }
        return data.name || data.email || '';
    }

    #getIcon(event) {
        const {type, data} = event;
        let icon;

        if (type === 'newsletter_event') {
            icon = data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
        } else if (type === 'feedback_event') {
            icon = data.score === 1 ? 'more-like-this' : 'less-like-this';
        } else if (this.#isSignupEvent(event)) {
            icon = 'signed-up';
        } else if (type === 'subscription_event' && data.type === 'canceled') {
            icon = 'canceled-subscription';
        } else {
            icon = ICON_MAP[type];
        }

        return `event-${icon}`;
    }

    #getAction(event, hasMultipleNewsletters) {
        const {type, data} = event;

        const actions = {
            login_event: () => 'logged in',
            payment_event: () => 'made payment',
            email_opened_event: () => 'opened email',
            email_sent_event: () => 'sent email',
            email_delivered_event: () => 'received email',
            email_failed_event: () => 'bounced email',
            email_complaint_event: () => 'email flagged as spam',
            donation_event: () => 'Made a one-time payment',

            signup_event: () => 'signed up',

            newsletter_event: () => this.#getNewsletterAction(data, hasMultipleNewsletters),
            subscription_event: () => this.#getSubscriptionAction(event),
            automated_email_sent_event: () => this.#getAutomatedEmailAction(data),
            comment_event: () => data.parent ? 'replied to comment' : 'commented',
            click_event: () => 'clicked link in email',
            aggregated_click_event: () => this.#getAggregatedClickAction(data),
            feedback_event: () => data.score === 1 ? 'more like this' : 'less like this',
            email_change_event: () => this.#getEmailChangeAction(data)
        };

        return actions[type]?.();
    }

    #getNewsletterAction(data, hasMultipleNewsletters) {
        const newsletter = (hasMultipleNewsletters && data.newsletter?.name) || 'newsletter';
        return data.subscribed
            ? `subscribed to ${newsletter}`
            : `unsubscribed from ${newsletter}`;
    }

    #getSubscriptionAction(event) {
        if (this.#isSignupEvent(event)) {
            return 'signed up';
        }
        return SUBSCRIPTION_ACTION_MAP[event.data.type] ?? 'changed paid subscription';
    }

    #getAutomatedEmailAction(data) {
        const slug = data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    #getAggregatedClickAction(data) {
        return data.count.clicks <= 1
            ? 'clicked link in email'
            : `clicked ${ghPluralize(data.count.clicks, 'link')} in email`;
    }

    #getEmailChangeAction(data) {
        return (data.from_email && data.to_email)
            ? `Email address changed from ${data.from_email} to ${data.to_email}`
            : 'Email address changed';
    }

    #getObject(event) {
        const {type, data} = event;

        if (ATTRIBUTION_OBJECT_TYPES.has(type) && data.attribution?.title) {
            return data.attribution.title;
        }

        if (POST_OBJECT_TYPES.has(type) && data.post) {
            return data.post.title;
        }

        return '';
    }

    #getSource(event) {
        const attribution = event.data?.attribution;
        if (!attribution?.referrer_source) {
            return null;
        }
        return {
            name: attribution.referrer_source,
            url: attribution.referrer_url ?? null
        };
    }

    #getInfo(event) {
        const {type, data} = event;

        if (type === 'subscription_event') {
            return this.#getSubscriptionInfo(data);
        }

        if (type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }

        if (type === 'donation_event') {
            const symbol = getSymbol(data.currency);
            return symbol + getNonDecimal(data.amount, data.currency);
        }
    }

    #getSubscriptionInfo(data) {
        const mrrDelta = getNonDecimal(data.mrr_delta, data.currency);
        if (mrrDelta === 0) {
            return;
        }

        const symbol = getSymbol(data.currency);

        if (data.type === 'created') {
            const sign = mrrDelta > 0 ? '' : '-';
            const tierName = this.membersUtils.hasMultipleTiers
                ? (data.tierName ?? 'Paid')
                : 'Paid';
            return `${tierName} ${sign}${symbol}${Math.abs(mrrDelta)}/month`;
        }

        const sign = mrrDelta > 0 ? '+' : '-';
        return `MRR ${sign}${symbol}${Math.abs(mrrDelta)}`;
    }

    #getDescription(event) {
        if (event.type !== 'click_event') {
            return;
        }
        try {
            return this.utils.cleanTrackedUrl(event.data.link.to, true);
        } catch {
            return event.data.link.to;
        }
    }

    #getURL(event) {
        const {type, data} = event;

        if (POST_OBJECT_TYPES.has(type) && data.post) {
            return data.post.url;
        }

        if (ATTRIBUTION_OBJECT_TYPES.has(type) && data.attribution?.url) {
            return data.attribution.url;
        }
    }

    #getRoute(event) {
        const {type, data} = event;

        if (POST_ROUTE_TYPES.has(type) && data.post) {
            return {name: 'posts-x', model: data.post.id};
        }

        if (ATTRIBUTION_ROUTE_TYPES.has(type) && data.attribution_type === 'post') {
            return {name: 'posts-x', model: data.attribution_id};
        }
    }

    // ── Utility ───────────────────────────────────────────────────────────────

    #isSignupEvent(event) {
        return event.type === 'signup_event'
            || (event.type === 'subscription_event'
                && event.data.type === 'created'
                && event.data.signup);
    }
}
```

## Key Changes

| Problem | Solution |
|---|---|
| Long `if`-chains for icon/action lookup | Replaced with `ICON_MAP`, `SUBSCRIPTION_ACTION_MAP` static objects |
| Repeated `event.type === 'x'` checks | Extracted `Set` constants (`POST_OBJECT_TYPES`, etc.) for membership tests |
| Duplicated signup condition | Extracted `#isSignupEvent()` predicate |
| Public methods leaking internal API | Renamed helpers to private fields (`#getIcon`, etc.) |
| `trimString` / `getJoin` as named methods | Inlined as `#normalizeMemberName` and a literal `'–'` in `compute` |
| Large `getAction` if-chain | Replaced with a dispatch table (object of lambdas) |
| Scattered sub-logic in `getAction` | Extracted `#getNewsletterAction`, `#getSubscriptionAction`, etc. |
| `getInfo` subscription logic mixed in | Extracted `#getSubscriptionInfo` |