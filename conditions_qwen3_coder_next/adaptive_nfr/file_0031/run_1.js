import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject as service} from '@ember/service';

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
        const subject = event.data.member ? (memberName || event.data.member.email) : (event.data.name || event.data.email || '');
        const icon = this.getIcon(event);
        const action = this.getAction(event, hasMultipleNewsletters);
        const info = this.getInfo(event);
        const description = this.getDescription(event);

        const join = this.getJoin(event);
        const object = this.getObject(event);
        const url = this.getURL(event);
        const route = this.getRoute(event);
        const timestamp = moment(event.data.created_at);
        const source = this.getSource(event);

        const member = event.data.member ? {
            ...event.data.member,
            name: memberName
        } : event.data.member;

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

    /* internal helper functions */
    getIcon(event) {
        if (event.type === 'login_event') {
            return 'logged-in';
        }

        if (event.type === 'payment_event') {
            return 'subscriptions';
        }

        if (event.type === 'newsletter_event') {
            return event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
        }

        if (event.type === 'subscription_event') {
            if (event.data.type === 'canceled') {
                return 'canceled-subscription';
            }
            return 'subscriptions';
        }

        if (event.type === 'signup_event') {
            return 'signed-up';
        }

        if (this.isSignupCreationEvent(event)) {
            return 'signed-up';
        }

        if (event.type === 'email_opened_event') {
            return 'opened-email';
        }

        if (event.type === 'email_sent_event') {
            return 'sent-email';
        }

        if (event.type === 'automated_email_sent_event') {
            return 'sent-email';
        }

        if (event.type === 'email_delivered_event') {
            return 'received-email';
        }

        if (event.type === 'email_failed_event') {
            return 'email-delivery-failed';
        }

        if (event.type === 'email_complaint_event') {
            return 'email-delivery-spam';
        }

        if (event.type === 'comment_event') {
            return 'comment';
        }

        if (event.type === 'click_event' || event.type === 'aggregated_click_event') {
            return 'click';
        }

        if (event.type === 'feedback_event') {
            return event.data.score === 1 ? 'more-like-this' : 'less-like-this';
        }

        if (event.type === 'donation_event') {
            return 'subscriptions';
        }

        if (event.type === 'email_change_event') {
            return 'email-changed';
        }

        return 'event-';
    }

    getAction(event, hasMultipleNewsletters) {
        if (this.isSignupEvent(event)) {
            return 'signed up';
        }

        if (event.type === 'login_event') {
            return 'logged in';
        }

        if (event.type === 'payment_event') {
            return 'made payment';
        }

        if (event.type === 'newsletter_event') {
            const newsletter = this.getNewsletterName(event, hasMultipleNewsletters);
            return event.data.subscribed ? `subscribed to ${newsletter}` : `unsubscribed from ${newsletter}`;
        }

        if (event.type === 'subscription_event') {
            return this.getSubscriptionAction(event.data.type);
        }

        if (event.type === 'email_opened_event') {
            return 'opened email';
        }

        if (event.type === 'email_sent_event') {
            return 'sent email';
        }

        if (event.type === 'automated_email_sent_event') {
            const emailType = this.getEmailType(event);
            return `received welcome email (${emailType})`;
        }

        if (event.type === 'email_delivered_event') {
            return 'received email';
        }

        if (event.type === 'email_failed_event') {
            return 'bounced email';
        }

        if (event.type === 'email_complaint_event') {
            return 'email flagged as spam';
        }

        if (event.type === 'comment_event') {
            return event.data.parent ? 'replied to comment' : 'commented';
        }

        if (event.type === 'click_event') {
            return 'clicked link in email';
        }

        if (event.type === 'aggregated_click_event') {
            const count = event.data.count.clicks;
            return count <= 1 ? 'clicked link in email' : `clicked ${ghPluralize(count, 'link')} in email`;
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

    /**
     * Returns an empty string when action and object are in separate columns or when object is empty.
     * Adds an extra separator when action and object appear in the same context.
     */
    getJoin() {
        return '–';
    }

    getObject(event) {
        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type)) {
            if (event.data.attribution?.title) {
                return event.data.attribution.title;
            }
        }

        if (event.type === 'comment_event' || event.type === 'feedback_event') {
            if (event.data.post?.title) {
                return event.data.post.title;
            }
        }

        if (event.type === 'click_event' && event.data.post?.title) {
            return event.data.post.title;
        }

        return '';
    }

    getSource(event) {
        if (!event.data?.attribution?.referrer_source) {
            return null;
        }

        return {
            name: event.data.attribution.referrer_source,
            url: event.data.attribution.referrer_url ?? null
        };
    }

    getInfo(event) {
        if (event.type !== 'subscription_event') {
            return null;
        }

        const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
        if (mrrDelta === 0) {
            return null;
        }

        const symbol = getSymbol(event.data.currency);
        if (event.data.type === 'created') {
            const tierName = this.membersUtils.hasMultipleTiers ? (event.data.tierName ?? 'Paid') : 'Paid';
            const sign = mrrDelta > 0 ? '' : '-';
            return `${tierName} ${sign}${symbol}${Math.abs(mrrDelta)}/month`;
        }

        const sign = mrrDelta > 0 ? '+' : '-';
        return `MRR ${sign}${symbol}${Math.abs(mrrDelta)}`;
    }

    getInfoForDonationEvent(event) {
        const symbol = getSymbol(event.data.currency);
        const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
        return formattedAmount;
    }

    getDescription(event) {
        if (event.type !== 'click_event') {
            return null;
        }

        try {
            return this.utils.cleanTrackedUrl(event.data.link.to, true);
        } catch (e) {
            // Invalid URL
        }

        return event.data.link.to;
    }

    getURL(event) {
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type)) {
            if (event.data.post?.url) {
                return event.data.post.url;
            }
        }

        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type)) {
            if (event.data.attribution?.url) {
                return event.data.attribution.url;
            }
        }

        return null;
    }

    getRoute(event) {
        if (['click_event', 'feedback_event'].includes(event.type)) {
            if (event.data.post) {
                return {
                    name: 'posts-x',
                    model: event.data.post.id
                };
            }
        }

        if (['signup_event', 'subscription_event'].includes(event.type)) {
            if (event.data.attribution_type === 'post') {
                return {
                    name: 'posts-x',
                    model: event.data.attribution_id
                };
            }
        }

        return null;
    }

    // Predicate functions
    isSignupCreationEvent(event) {
        return event.type === 'subscription_event'
            && event.data.type === 'created'
            && event.data.signup;
    }

    isSignupEvent(event) {
        return event.type === 'signup_event' || this.isSignupCreationEvent(event);
    }

    getNewsletterName(event, hasMultipleNewsletters) {
        if (!hasMultipleNewsletters || !event.data.newsletter?.name) {
            return 'newsletter';
        }
        return event.data.newsletter.name;
    }

    getSubscriptionAction(type) {
        const actions = {
            created: 'started paid subscription',
            updated: 'changed paid subscription',
            canceled: 'canceled paid subscription',
            reactivated: 'reactivated paid subscription',
            expired: 'ended paid subscription'
        };
        return actions[type] ?? 'changed paid subscription';
    }

    getEmailType(event) {
        const slug = event.data.automatedEmail?.slug || '';
        return slug.includes('paid') ? 'Paid' : 'Free';
    }

    getEmailChangeAction(event) {
        if (event.data.from_email && event.data.to_email) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }
        return 'Email address changed';
    }
}