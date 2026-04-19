import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject as service} from '@ember/service';

export default class ParseMemberEventHelper extends Helper {
    @service feature;
    @service utils;
    @service membersUtils;

    /** Trim a value to a string or null */
    trimString(value) {
        if (!value && value !== 0) {
            return null;
        }
        const trimmed = String(value).trim();
        return trimmed || null;
    }

    /** Main entry point – builds the event view model */
    compute([event, hasMultipleNewsletters]) {
        const memberName = this.trimString(event.data.member?.name);
        const subject = this.getSubject(event, memberName);
        const icon = this.getIcon(event);
        const action = this.getAction(event, hasMultipleNewsletters);
        const info = this.getInfo(event);
        const description = this.getDescription(event);
        const join = this.getJoin();
        const object = this.getObject(event);
        const url = this.getURL(event);
        const route = this.getRoute(event);
        const timestamp = moment(event.data.created_at);
        const source = this.getSource(event);
        const member = event.data.member
            ? {...event.data.member, name: memberName}
            : event.data.member;

        return {
            memberId: event.data.member_id ?? event.data.member?.id,
            member,
            emailId: event.data.email_id,
            email: event.data.email,
            icon,
            subject,
            action,
            join,
            object,
            source,
            info,
            description,
            url,
            route,
            timestamp
        };
    }

    /** Build the subject string for the event */
    getSubject(event, memberName) {
        if (event.data.member) {
            return memberName || event.data.member.email;
        }
        return event.data.name || event.data.email || '';
    }

    /** Determine the icon for the event */
    getIcon(event) {
        const base = this.getIconBase(event);
        return `event-${base}`;
    }

    /** Base icon mapping – no prefix */
    getIconBase(event) {
        const simpleMap = {
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

        switch (event.type) {
            case 'newsletter_event':
                return event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
            case 'subscription_event':
                return event.data.type === 'canceled' ? 'canceled-subscription' : 'subscriptions';
            case 'signup_event':
            case 'subscription_event':
                if (event.data.type === 'created' && event.data.signup) {
                    return 'signed-up';
                }
                return simpleMap[event.type] ?? 'unknown';
            case 'feedback_event':
                return event.data.score === 1 ? 'more-like-this' : 'less-like-this';
            default:
                return simpleMap[event.type] ?? 'unknown';
        }
    }

    /** Determine the action text for the event */
    getAction(event, hasMultipleNewsletters) {
        switch (event.type) {
            case 'signup_event':
            case 'subscription_event':
                if (event.data.type === 'created' && event.data.signup) {
                    return 'signed up';
                }
                return this.getSubscriptionAction(event);
            case 'login_event':
                return 'logged in';
            case 'payment_event':
                return 'made payment';
            case 'newsletter_event':
                return this.getNewsletterAction(event, hasMultipleNewsletters);
            case 'email_opened_event':
                return 'opened email';
            case 'email_sent_event':
                return 'sent email';
            case 'automated_email_sent_event':
                return this.getAutomatedEmailAction(event);
            case 'email_delivered_event':
                return 'received email';
            case 'email_failed_event':
                return 'bounced email';
            case 'email_complaint_event':
                return 'email flagged as spam';
            case 'comment_event':
                return event.data.parent ? 'replied to comment' : 'commented';
            case 'click_event':
                return 'clicked link in email';
            case 'aggregated_click_event':
                return this.getAggregatedClickAction(event);
            case 'feedback_event':
                return event.data.score === 1 ? 'more like this' : 'less like this';
            case 'email_change_event':
                return this.getEmailChangeAction(event);
            case 'donation_event':
                return 'Made a one-time payment';
            default:
                return '';
        }
    }

    /** Action for subscription events */
    getSubscriptionAction(event) {
        switch (event.data.type) {
            case 'created':
                return 'started paid subscription';
            case 'updated':
                return 'changed paid subscription';
            case 'canceled':
                return 'canceled paid subscription';
            case 'reactivated':
                return 'reactivated paid subscription';
            case 'expired':
                return 'ended paid subscription';
            default:
                return 'changed paid subscription';
        }
    }

    /** Action for newsletter events */
    getNewsletterAction(event, hasMultipleNewsletters) {
        const newsletter = hasMultipleNewsletters && event.data.newsletter?.name
            ? event.data.newsletter.name
            : 'newsletter';
        return event.data.subscribed
            ? `subscribed to ${newsletter}`
            : `unsubscribed from ${newsletter}`;
    }

    /** Action for automated email events */
    getAutomatedEmailAction(event) {
        const slug = event.data.automatedEmail?.slug ?? '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    /** Action for aggregated click events */
    getAggregatedClickAction(event) {
        const clicks = event.data.count?.clicks ?? 0;
        if (clicks <= 1) {
            return 'clicked link in email';
        }
        return `clicked ${ghPluralize(clicks, 'link')} in email`;
    }

    /** Action for email change events */
    getEmailChangeAction(event) {
        if (event.data.from_email && event.data.to_email) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }
        return 'Email address changed';
    }

    /** Join string – used when action and object are in one sentence */
    getJoin() {
        return '–';
    }

    /** Clickable object text */
    getObject(event) {
        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type)) {
            if (event.data.attribution?.title) {
                return event.data.attribution.title;
            }
        }
        if (event.type === 'comment_event' && event.data.post) {
            return event.data.post.title;
        }
        if (['click_event', 'feedback_event'].includes(event.type) && event.data.post) {
            return event.data.post.title;
        }
        return '';
    }

    /** Source information for the event */
    getSource(event) {
        if (event.data?.attribution?.referrer_source) {
            return {
                name: event.data.attribution.referrer_source,
                url: event.data.attribution.referrer_url ?? null
            };
        }
        return null;
    }

    /** Additional info text */
    getInfo(event) {
        if (event.type === 'subscription_event') {
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
        if (event.type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }
        if (event.type === 'donation_event') {
            const symbol = getSymbol(event.data.currency);
            const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
            return formattedAmount;
        }
    }

    /** Description text for the event */
    getDescription(event) {
        if (event.type === 'click_event') {
            try {
                return this.utils.cleanTrackedUrl(event.data.link.to, true);
            } catch {
                // Invalid URL – fall back to raw
            }
            return event.data.link.to;
        }
    }

    /** URL for clickable object */
    getURL(event) {
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type) && event.data.post) {
            return event.data.post.url;
        }
        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type) &&
            event.data.attribution?.url) {
            return event.data.attribution.url;
        }
    }

    /** Route for clickable object */
    getRoute(event) {
        if (['click_event', 'feedback_event'].includes(event.type) && event.data.post) {
            return {name: 'posts-x', model: event.data.post.id};
        }
        if (['signup_event', 'subscription_event'].includes(event.type) &&
            event.data.attribution_type === 'post') {
            return {name: 'posts-x', model: event.data.attribution_id};
        }
    }
}