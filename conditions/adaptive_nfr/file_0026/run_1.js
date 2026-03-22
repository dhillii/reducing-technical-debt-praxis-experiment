## Refactoring Analysis

The main complexity issues are:
1. **Large if-chain methods** (`getIcon`, `getAction`) that are hard to scan
2. **Duplicated type-checking patterns** across methods
3. **Mixed abstraction levels** in `compute`
4. **Repeated logic** for similar event types

## Refactored Code

```javascript
import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject as service} from '@ember/service';

// ─── Static lookup tables (no runtime cost) ──────────────────────────────────

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
    email_change_event: 'email-changed',
};

const SUBSCRIPTION_ACTION_MAP = {
    created: 'started paid subscription',
    updated: 'changed paid subscription',
    canceled: 'canceled paid subscription',
    reactivated: 'reactivated paid subscription',
    expired: 'ended paid subscription',
};

// Event types whose object/URL come from post data
const POST_OBJECT_TYPES = new Set(['comment_event', 'click_event', 'feedback_event']);

// Event types whose object/URL come from attribution data
const ATTRIBUTION_OBJECT_TYPES = new Set(['signup_event', 'subscription_event', 'donation_event']);

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

    /**
     * Coerce a value to a trimmed string, returning null for blank/missing values.
     */
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
        if (member) {
            return memberName || member.email;
        }
        return data.name || data.email || '';
    }

    // ── Icon ──────────────────────────────────────────────────────────────────

    #getIcon(event) {
        const icon = this.#resolveIcon(event);
        return `event-${icon}`;
    }

    #resolveIcon(event) {
        const {type, data} = event;

        if (type === 'signup_event' || this.#isSignupSubscription(event)) {
            return 'signed-up';
        }

        if (type === 'newsletter_event') {
            return data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
        }

        if (type === 'subscription_event') {
            return data.type === 'canceled' ? 'canceled-subscription' : 'subscriptions';
        }

        if (type === 'feedback_event') {
            return data.score === 1 ? 'more-like-this' : 'less-like-this';
        }

        return ICON_MAP[type] ?? 'unknown';
    }

    // ── Action ────────────────────────────────────────────────────────────────

    #getAction(event, hasMultipleNewsletters) {
        const {type, data} = event;

        if (type === 'signup_event' || this.#isSignupSubscription(event)) {
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
            click_event: 'clicked link in email',
            donation_event: 'Made a one-time payment',
        };

        if (simpleActions[type] !== undefined) {
            return simpleActions[type];
        }

        if (type === 'newsletter_event') {
            return this.#getNewsletterAction(data, hasMultipleNewsletters);
        }

        if (type === 'subscription_event') {
            return SUBSCRIPTION_ACTION_MAP[data.type] ?? 'changed paid subscription';
        }

        if (type === 'automated_email_sent_event') {
            const emailType = data.automatedEmail?.slug?.includes('paid') ? 'Paid' : 'Free';
            return `received welcome email (${emailType})`;
        }

        if (type === 'comment_event') {
            return data.parent ? 'replied to comment' : 'commented';
        }

        if (type === 'aggregated_click_event') {
            const {clicks} = data.count;
            return clicks <= 1
                ? 'clicked link in email'
                : `clicked ${ghPluralize(clicks, 'link')} in email`;
        }

        if (type === 'feedback_event') {
            return data.score === 1 ? 'more like this' : 'less like this';
        }

        if (type === 'email_change_event') {
            return (data.from_email && data.to_email)
                ? `Email address changed from ${data.from_email} to ${data.to_email}`
                : 'Email address changed';
        }
    }

    #getNewsletterAction(data, hasMultipleNewsletters) {
        const newsletter = (hasMultipleNewsletters && data.newsletter?.name)
            ? data.newsletter.name
            : 'newsletter';

        return data.subscribed
            ? `subscribed to ${newsletter}`
            : `unsubscribed from ${newsletter}`;
    }

    // ── Object & Source ───────────────────────────────────────────────────────

    #getObject(event) {
        if (ATTRIBUTION_OBJECT_TYPES.has(event.type)) {
            return event.data.attribution?.title ?? '';
        }

        if (POST_OBJECT_TYPES.has(event.type)) {
            return event.data.post?.title ?? '';
        }

        return '';
    }

    #getSource(event) {
        const {attribution} = event.data ?? {};
        if (!attribution?.referrer_source) {
            return null;
        }
        return {
            name: attribution.referrer_source,
            url: attribution.referrer_url ?? null,
        };
    }

    // ── Info & Description ────────────────────────────────────────────────────

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
        const absAmount = Math.abs(mrrDelta);

        if (data.type === 'created') {
            const sign = mrrDelta > 0 ? '' : '-';
            const tierName = this.membersUtils.hasMultipleTiers
                ? (data.tierName ?? 'Paid')
                : 'Paid';
            return `${tierName} ${sign}${symbol}${absAmount}/month`;
        }

        const sign = mrrDelta > 0 ? '+' : '-';
        return `MRR ${sign}${symbol}${absAmount}`;
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

    // ── URL & Route ───────────────────────────────────────────────────────────

    #getURL(event) {
        if (POST_OBJECT_TYPES.has(event.type)) {
            return event.data.post?.url;
        }

        if (ATTRIBUTION_OBJECT_TYPES.has(event.type)) {
            return event.data.attribution?.url;
        }
    }

    #getRoute(event) {
        if (['click_event', 'feedback_event'].includes(event.type) && event.data.post) {
            return {name: 'posts-x', model: event.data.post.id};
        }

        if (['signup_event', 'subscription_event'].includes(event.type)
                && event.data.attribution_type === 'post') {
            return {name: 'posts-x', model: event.data.attribution_id};
        }
    }

    // ── Shared predicate ──────────────────────────────────────────────────────

    #isSignupSubscription({type, data}) {
        return type === 'subscription_event'
            && data.type === 'created'
            && data.signup;
    }
}
```

## Key Changes

| Issue | Before | After |
|---|---|---|
| **Icon resolution** | 15+ `if` blocks | `ICON_MAP` lookup + 4 special cases |
| **Action resolution** | 15+ `if` blocks | `simpleActions` inline map + targeted branches |
| **Repeated type sets** | Duplicated arrays in `getObject`/`getURL`/`getRoute` | `POST_OBJECT_TYPES` / `ATTRIBUTION_OBJECT_TYPES` Sets defined once |
| **Signup subscription predicate** | Copy-pasted 3-condition check | `#isSignupSubscription()` called in 2 places |
| **Subscription info** | Inline in `getInfo` | Extracted to `#getSubscriptionInfo` |
| **Newsletter action** | Inline in `getAction` | Extracted to `#getNewsletterAction` |
| **Private methods** | Conventional naming only | ES2022 `#privateField` syntax enforces encapsulation |
| **`getJoin`** | Separate method returning a constant | Inlined as `join: '–'` in `compute` |