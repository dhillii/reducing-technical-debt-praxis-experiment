Here's the refactored code with reduced complexity through extracted constants, lookup maps, and simplified logic:

```javascript
import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject as service} from '@ember/service';

// Static lookup maps moved outside class to avoid recreation on each call
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

const POST_URL_EVENTS = ['comment_event', 'click_event', 'feedback_event'];
const ATTRIBUTION_URL_EVENTS = ['signup_event', 'subscription_event', 'donation_event'];
const POST_ROUTE_EVENTS = ['click_event', 'feedback_event'];
const ATTRIBUTION_ROUTE_EVENTS = ['signup_event', 'subscription_event'];

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
        return event.data.member
            ? (memberName || event.data.member.email)
            : (event.data.name || event.data.email || '');
    }

    getIcon(event) {
        const icon = this.resolveIcon(event);
        return `event-${icon}`;
    }

    resolveIcon(event) {
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

        if (type === 'signup_event') {
            return 'signed-up';
        }

        if (type === 'feedback_event') {
            return data.score === 1 ? 'more-like-this' : 'less-like-this';
        }

        return EVENT_ICONS[type];
    }

    getAction(event, hasMultipleNewsletters) {
        const {type, data} = event;

        const actionMap = {
            login_event: () => 'logged in',
            payment_event: () => 'made payment',
            email_opened_event: () => 'opened email',
            email_sent_event: () => 'sent email',
            email_delivered_event: () => 'received email',
            email_failed_event: () => 'bounced email',
            email_complaint_event: () => 'email flagged as spam',
            donation_event: () => 'Made a one-time payment',
            signup_event: () => 'signed up',
            newsletter_event: () => this.getNewsletterAction(data, hasMultipleNewsletters),
            subscription_event: () => this.getSubscriptionAction(data),
            automated_email_sent_event: () => this.getAutomatedEmailAction(data),
            comment_event: () => data.parent ? 'replied to comment' : 'commented',
            click_event: () => 'clicked link in email',
            aggregated_click_event: () => this.getAggregatedClickAction(data),
            feedback_event: () => data.score === 1 ? 'more like this' : 'less like this',
            email_change_event: () => this.getEmailChangeAction(data)
        };

        // Handle signup via subscription_event
        if (type === 'subscription_event' && data.type === 'created' && data.signup) {
            return 'signed up';
        }

        return actionMap[type]?.();
    }

    getNewsletterAction(data, hasMultipleNewsletters) {
        const newsletter = (hasMultipleNewsletters && data.newsletter?.name) || 'newsletter';
        return data.subscribed
            ? `subscribed to ${newsletter}`
            : `unsubscribed from ${newsletter}`;
    }

    getSubscriptionAction(data) {
        return SUBSCRIPTION_ACTIONS[data.type] ?? 'changed paid subscription';
    }

    getAutomatedEmailAction(data) {
        const slug = data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    getAggregatedClickAction(data) {
        return data.count.clicks <= 1
            ? 'clicked link in email'
            : `clicked ${ghPluralize(data.count.clicks, 'link')} in email`;
    }

    getEmailChangeAction(data) {
        return (data.from_email && data.to_email)
            ? `Email address changed from ${data.from_email} to ${data.to_email}`
            : 'Email address changed';
    }

    getJoin() {
        return '–';
    }

    getObject(event) {
        const {type, data} = event;

        if (ATTRIBUTION_URL_EVENTS.includes(type) && data.attribution?.title) {
            return data.attribution.title;
        }

        if (POST_URL_EVENTS.includes(type) && data.post) {
            return data.post.title;
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
        const {type, data} = event;

        if (type === 'subscription_event') {
            return this.getSubscriptionInfo(data);
        }

        if (type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }

        if (type === 'donation_event') {
            const symbol = getSymbol(data.currency);
            return `${symbol}${getNonDecimal(data.amount, data.currency)}`;
        }
    }

    getSubscriptionInfo(data) {
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
        const {type, data} = event;

        if (POST_URL_EVENTS.includes(type) && data.post) {
            return data.post.url;
        }

        if (ATTRIBUTION_URL_EVENTS.includes(type) && data.attribution?.url) {
            return data.attribution.url;
        }
    }

    getRoute(event) {
        const {type, data} = event;

        if (POST_ROUTE_EVENTS.includes(type) && data.post) {
            return {name: 'posts-x', model: data.post.id};
        }

        if (ATTRIBUTION_ROUTE_EVENTS.includes(type) && data.attribution_type === 'post') {
            return {name: 'posts-x', model: data.attribution_id};
        }
    }
}
```

Key improvements made:

1. **Static lookup maps** (`EVENT_ICONS`, `SUBSCRIPTION_ACTIONS`) extracted outside the class to avoid recreation on each call and replace repetitive `if` chains

2. **Extracted constants** for event type arrays (`POST_URL_EVENTS`, `ATTRIBUTION_URL_EVENTS`, etc.) to eliminate duplication and improve readability

3. **Decomposed large methods** — `getAction` now delegates to focused helpers (`getNewsletterAction`, `getSubscriptionAction`, etc.), and `getInfo` delegates to `getSubscriptionInfo`

4. **Action map pattern** in `getAction` replaces the long `if/else` chain with a declarative object lookup

5. **Extracted `getSubject`** from `compute` to keep it clean and single-responsibility

6. **Simplified `resolveIcon`** extracted from `getIcon` to separate the icon resolution logic from the string formatting

7. **Removed redundant comments** that simply restated the code, keeping only meaningful ones

8. **Consistent destructuring** of `event.type` and `event.data` at the top of methods to reduce repetition