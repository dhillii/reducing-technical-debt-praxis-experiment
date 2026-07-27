import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject as service} from '@ember/service';

const eventIcons = {
    login_event: 'logged-in',
    payment_event: 'subscriptions',
    newsletter_event: (event) => event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email',
    subscription_event: (event) => event.data.type === 'canceled' ? 'canceled-subscription' : 'subscriptions',
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
    feedback_event: (event) => event.data.score === 1 ? 'more-like-this' : 'less-like-this',
    donation_event: 'subscriptions',
    email_change_event: 'email-changed'
};

const eventActions = {
    signup_event: 'signed up',
    login_event: 'logged in',
    payment_event: 'made payment',
    newsletter_event: (event, hasMultipleNewsletters) => {
        let newsletter = 'newsletter';
        if (hasMultipleNewsletters && event.data.newsletter && event.data.newsletter.name) {
            newsletter = event.data.newsletter.name;
        }

        return event.data.subscribed ? `subscribed to ${newsletter}` : `unsubscribed from ${newsletter}`;
    },
    subscription_event: (event) => {
        if (event.data.type === 'created') {
            return 'started paid subscription';
        }
        if (event.data.type === 'updated') {
            return 'changed paid subscription';
        }
        if (event.data.type === 'canceled') {
            return 'canceled paid subscription';
        }
        if (event.data.type === 'reactivated') {
            return 'reactivated paid subscription';
        }
        if (event.data.type === 'expired') {
            return 'ended paid subscription';
        }

        return 'changed paid subscription';
    },
    email_opened_event: 'opened email',
    email_sent_event: 'sent email',
    automated_email_sent_event: (event) => {
        const slug = event.data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    },
    email_delivered_event: 'received email',
    email_failed_event: 'bounced email',
    email_complaint_event: 'email flagged as spam',
    comment_event: (event) => event.data.parent ? 'replied to comment' : 'commented',
    click_event: 'clicked link in email',
    aggregated_click_event: (event) => event.data.count.clicks <= 1 ? 'clicked link in email' : `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`,
    feedback_event: (event) => event.data.score === 1 ? 'more like this' : 'less like this',
    email_change_event: (event) => {
        if (event.data.from_email && event.data.to_email) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }
        return 'Email address changed';
    },
    donation_event: 'Made a one-time payment'
};

const eventInfo = {
    subscription_event: (event) => {
        let mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
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
    },
    signup_event: (event) => this.membersUtils.paidMembersEnabled ? 'Free' : undefined,
    donation_event: (event) => {
        const symbol = getSymbol(event.data.currency);
        const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
        return formattedAmount;
    }
};

const eventDescriptions = {
    click_event: (event) => {
        try {
            return this.utils.cleanTrackedUrl(event.data.link.to, true);
        } catch (e) {
            // Invalid URL
        }
        return event.data.link.to;
    }
};

const eventUrls = {
    comment_event: (event) => event.data.post?.url,
    click_event: (event) => event.data.post?.url,
    feedback_event: (event) => event.data.post?.url,
    signup_event: (event) => event.data.attribution?.url,
    subscription_event: (event) => event.data.attribution?.url,
    donation_event: (event) => event.data.attribution?.url
};

const eventRoutes = {
    click_event: (event) => event.data.post ? {name: 'posts-x', model: event.data.post.id} : undefined,
    feedback_event: (event) => event.data.post ? {name: 'posts-x', model: event.data.post.id} : undefined,
    signup_event: (event) => event.data.attribution_type === 'post' ? {name: 'posts-x', model: event.data.attribution_id} : undefined,
    subscription_event: (event) => event.data.attribution_type === 'post' ? {name: 'posts-x', model: event.data.attribution_id} : undefined
};

const eventObjects = {
    signup_event: (event) => event.data.attribution?.title,
    subscription_event: (event) => event.data.attribution?.title,
    donation_event: (event) => event.data.attribution?.title,
    comment_event: (event) => event.data.post?.title,
    click_event: (event) => event.data.post?.title,
    feedback_event: (event) => event.data.post?.title
};

const eventSources = {
    default: (event) => event.data.attribution?.referrer_source ? {name: event.data.attribution.referrer_source, url: event.data.attribution.referrer_url ?? null} : null
};

export default class ParseMemberEventHelper extends Helper {
    @service feature;
    @service utils;
    @service membersUtils;

    trimString(value) {
        // Always convert to null if the value is empty/null/undefined
        if (!value && value !== 0) {
            return null;
        }

        // Force to string and trim
        const trimmed = String(value).trim();

        // Convert empty strings or pure whitespace to null
        return trimmed || null;
    }

    compute([event, hasMultipleNewsletters]) {
        let memberName = event.data.member?.name;
        memberName = this.trimString(memberName);

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

        // Also ensure the member object has the transformed name
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

    getIcon(event) {
        const icon = eventIcons[event.type];
        return typeof icon === 'function' ? `event-${icon(event)}` : `event-${icon}`;
    }

    getAction(event, hasMultipleNewsletters) {
        const action = eventActions[event.type];
        return typeof action === 'function' ? action(event, hasMultipleNewsletters) : action;
    }

    getInfo(event) {
        const info = eventInfo[event.type];
        return info ? info(event) : undefined;
    }

    getDescription(event) {
        const description = eventDescriptions[event.type];
        return description ? description(event) : undefined;
    }

    getURL(event) {
        const url = eventUrls[event.type];
        return url ? url(event) : undefined;
    }

    getRoute(event) {
        const route = eventRoutes[event.type];
        return route ? route(event) : undefined;
    }

    getObject(event) {
        const object = eventObjects[event.type];
        return object ? object(event) : undefined;
    }

    getSource(event) {
        const source = eventSources[event.type] || eventSources.default;
        return source ? source(event) : undefined;
    }

    getJoin() {
        return '–';
    }
}