## Refactoring Analysis

The main complexity issues are:
1. **Large if-chain methods** (`getIcon`, `getAction`) acting as type dispatch tables
2. **Duplicated type-checking patterns** across methods
3. **Mixed abstraction levels** in `compute`
4. **Scattered related logic** (post URL/route handling repeated)

## Refactored Code

```javascript
import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject as service} from '@ember/service';

// ─── Static lookup tables (no runtime cost) ──────────────────────────────────

const EVENT_ICONS = {
    login_event: 'logged-in',
    payment_event: 'subscriptions',
    signup_event: 'signed-up',
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
    email_change_event: 'email-changed',
};

const SUBSCRIPTION_ACTIONS = {
    created: 'started paid subscription',
    updated: 'changed paid subscription',
    canceled: 'canceled paid subscription',
    reactivated: 'reactivated paid subscription',
    expired: 'ended paid subscription',
};

const POST_EVENT_TYPES = new Set(['comment_event', 'click_event', 'feedback_event']);
const ATTRIBUTION_EVENT_TYPES = new Set(['signup_event', 'subscription_event', 'donation_event']);
const ROUTE_POST_EVENT_TYPES = new Set(['click_event', 'feedback_event']);
const ROUTE_ATTRIBUTION_EVENT_TYPES = new Set(['signup_event', 'subscription_event']);

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
            timestamp: moment(event.data.created_at),
        };
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    #normalizeMemberName(value) {
        if (!value && value !== 0) {
            return null;
        }
        return String(value).trim() || null;
    }

    #buildMember(member, normalizedName) {
        return member ? {...member, name: normalizedName} : member;
    }

    #getSubject(member, memberName, data) {
        return member
            ? (memberName || member.email)
            : (data.name || data.email || '');
    }

    #getIcon(event) {
        const icon = this.#resolveIcon(event);
        return `event-${icon}`;
    }

    #resolveIcon(event) {
        const {type, data} = event;

        if (type === 'newsletter_event') {
            return data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
        }

        if (type === 'subscription_event') {
            const isSignup = data.type === 'created' && data.signup;
            if (isSignup) {
                return 'signed-up';
            }
            return data.type === 'canceled' ? 'canceled-subscription' : 'subscriptions';
        }

        if (type === 'feedback_event') {
            return data.score === 1 ? 'more-like-this' : 'less-like-this';
        }

        return EVENT_ICONS[type] ?? 'unknown';
    }

    #getAction(event, hasMultipleNewsletters) {
        const {type, data} = event;

        if (type === 'signup_event' || this.#isSubscriptionSignup(event)) {
            return 'signed up';
        }

        if (type === 'newsletter_event') {
            return this.#getNewsletterAction(data, hasMultipleNewsletters);
        }

        if (type === 'subscription_event') {
            return SUBSCRIPTION_ACTIONS[data.type] ?? 'changed paid subscription';
        }

        if (type === 'aggregated_click_event') {
            return this.#getAggregatedClickAction(data);
        }

        if (type === 'automated_email_sent_event') {
            const emailType = data.automatedEmail?.slug?.includes('paid') ? 'Paid' : 'Free';
            return `received welcome email (${emailType})`;
        }

        if (type === 'comment_event') {
            return data.parent ? 'replied to comment' : 'commented';
        }

        if (type === 'feedback_event') {
            return data.score === 1 ? 'more like this' : 'less like this';
        }

        if (type === 'email_change_event') {
            return this.#getEmailChangeAction(data);
        }

        const staticActions = {
            login_event: 'logged in',
            payment_event: 'made payment',
            email_opened_event: 'opened email',
            email_sent_event: 'sent email',
            email_delivered_event: 'received email',
            email_failed_event: 'bounced email',
            email_complaint_event: 'email flagged as spam',
            click_event: 'clicked link in email',
            donation_event: 'Made a one-time payment',
        };

        return staticActions[type];
    }

    #getNewsletterAction(data, hasMultipleNewsletters) {
        const newsletter = (hasMultipleNewsletters && data.newsletter?.name)
            ? data.newsletter.name
            : 'newsletter';
        return data.subscribed
            ? `subscribed to ${newsletter}`
            : `unsubscribed from ${newsletter}`;
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
        if (ATTRIBUTION_EVENT_TYPES.has(event.type)) {
            return event.data.attribution?.title ?? '';
        }

        if (POST_EVENT_TYPES.has(event.type)) {
            return event.data.post?.title ?? '';
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
            url: attribution.referrer_url ?? null,
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
        if (POST_EVENT_TYPES.has(event.type)) {
            return event.data.post?.url;
        }

        if (ATTRIBUTION_EVENT_TYPES.has(event.type)) {
            return event.data.attribution?.url;
        }
    }

    #getRoute(event) {
        if (ROUTE_POST_EVENT_TYPES.has(event.type) && event.data.post) {
            return {name: 'posts-x', model: event.data.post.id};
        }

        if (ROUTE_ATTRIBUTION_EVENT_TYPES.has(event.type) && event.data.attribution_type === 'post') {
            return {name: 'posts-x', model: event.data.attribution_id};
        }
    }

    #isSubscriptionSignup(event) {
        const {type, data} = event;
        return type === 'subscription_event' && data.type === 'created' && data.signup;
    }
}
```

## Key Changes

| Issue | Before | After |
|---|---|---|
| **Icon dispatch** | 15+ sequential `if` blocks | Lookup table + small `#resolveIcon` for dynamic cases |
| **Action dispatch** | 20+ sequential `if` blocks | Lookup table for statics + extracted sub-methods |
| **Repeated type sets** | Inline array literals in each method | Named `Set` constants at module level |
| **`trimString`/`compute` coupling** | Public method + mixed concerns | Private `#normalizeMemberName`, `#buildMember`, `#getSubject` |
| **`getJoin` method** | Separate method returning a constant | Inlined constant in `compute` |
| **Subscription info** | Inline in `getInfo` | Extracted `#getSubscriptionInfo` |
| **Visibility** | All methods public | Private fields (`#`) for internal methods |