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
        const subject = event.data.member
            ? (memberName || event.data.member.email)
            : (event.data.name || event.data.email || '');

        const member = event.data.member
            ? {...event.data.member, name: memberName}
            : event.data.member;

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

    /* internal helper functions */
    getIcon(event) {
        const type = event.type;
        const iconMap = {
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

        if (type === 'newsletter_event') {
            return 'event-' + (event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email');
        }

        if (type === 'subscription_event') {
            if (event.data.type === 'canceled') {
                return 'event-canceled-subscription';
            }
            return 'event-subscriptions';
        }

        if (type === 'signup_event' || (type === 'subscription_event' && event.data.type === 'created' && event.data.signup)) {
            return 'event-signed-up';
        }

        if (type === 'feedback_event') {
            return 'event-' + (event.data.score === 1 ? 'more-like-this' : 'less-like-this');
        }

        const icon = iconMap[type];
        return icon ? `event-${icon}` : '';
    }

    getAction(event, hasMultipleNewsletters) {
        const {type, data} = event;

        const actionMap = {
            signup_event: () => 'signed up',
            login_event: () => 'logged in',
            payment_event: () => 'made payment',
            email_opened_event: () => 'opened email',
            email_sent_event: () => 'sent email',
            automated_email_sent_event: () => {
                const slug = data.automatedEmail?.slug || '';
                const emailType = slug.includes('paid') ? 'Paid' : 'Free';
                return `received welcome email (${emailType})`;
            },
            email_delivered_event: () => 'received email',
            email_failed_event: () => 'bounced email',
            email_complaint_event: () => 'email flagged as spam',
            comment_event: () => data.parent ? 'replied to comment' : 'commented',
            click_event: () => 'clicked link in email',
            aggregated_click_event: () => data.count.clicks <= 1
                ? 'clicked link in email'
                : `clicked ${ghPluralize(data.count.clicks, 'link')} in email`,
            feedback_event: () => data.score === 1 ? 'more like this' : 'less like this',
            email_change_event: () => data.from_email && data.to_email
                ? `Email address changed from ${data.from_email} to ${data.to_email}`
                : 'Email address changed',
            donation_event: () => 'Made a one-time payment'
        };

        if (type === 'newsletter_event') {
            const newsletter = hasMultipleNewsletters && data.newsletter?.name
                ? data.newsletter.name
                : 'newsletter';
            return data.subscribed
                ? `subscribed to ${newsletter}`
                : `unsubscribed from ${newsletter}`;
        }

        if (type === 'subscription_event') {
            const subActions = {
                created: () => 'started paid subscription',
                updated: () => 'changed paid subscription',
                canceled: () => 'canceled paid subscription',
                reactivated: () => 'reactivated paid subscription',
                expired: () => 'ended paid subscription'
            };
            return (subActions[data.type] ?? (() => 'changed paid subscription'))();
        }

        if (type === 'signup_event' || (type === 'subscription_event' && data.type === 'created' && data.signup)) {
            return 'signed up';
        }

        const actionFn = actionMap[type];
        return actionFn ? actionFn() : undefined;
    }

    getJoin() {
        return '–';
    }

    getObject(event) {
        const {type, data} = event;

        if (['signup_event', 'subscription_event', 'donation_event'].includes(type) && data.attribution?.title) {
            return data.attribution.title;
        }

        if (type === 'comment_event' && data.post) {
            return data.post.title;
        }

        if (['click_event', 'feedback_event'].includes(type) && data.post) {
            return data.post.title;
        }

        return '';
    }

    getSource(event) {
        const ref = event.data?.attribution?.referrer_source;
        if (ref) {
            return {
                name: ref,
                url: event.data.attribution.referrer_url ?? null
            };
        }
        return null;
    }

    getInfo(event) {
        const {type, data} = event;

        if (type === 'subscription_event') {
            const mrrDelta = getNonDecimal(data.mrr_delta, data.currency);
            if (mrrDelta === 0) {
                return;
            }
            const symbol = getSymbol(data.currency);
            const sign = mrrDelta > 0 ? '+' : '-';
            if (data.type === 'created') {
                const tierName = this.membersUtils.hasMultipleTiers ? (data.tierName ?? 'Paid') : 'Paid';
                const prefix = mrrDelta > 0 ? '' : '-';
                return `${tierName} ${prefix}${symbol}${Math.abs(mrrDelta)}/month`;
            }
            return `MRR ${sign}${symbol}${Math.abs(mrrDelta)}`;
        }

        if (type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }

        if (type === 'donation_event') {
            const symbol = getSymbol(data.currency);
            return symbol + getNonDecimal(data.amount, data.currency);
        }

        return;
    }

    getDescription(event) {
        if (event.type === 'click_event') {
            try {
                return this.utils.cleanTrackedUrl(event.data.link.to, true);
            } catch {
                return event.data.link.to;
            }
        }
        return;
    }

    getURL(event) {
        const {type, data} = event;

        if (['comment_event', 'click_event', 'feedback_event'].includes(type) && data.post) {
            return data.post.url;
        }

        if (['signup_event', 'subscription_event', 'donation_event'].includes(type) && data.attribution?.url) {
            return data.attribution.url;
        }

        return;
    }

    getRoute(event) {
        const {type, data} = event;

        if (['click_event', 'feedback_event'].includes(type) && data.post) {
            return {name: 'posts-x', model: data.post.id};
        }

        if (['signup_event', 'subscription_event'].includes(type) && data.attribution_type === 'post') {
            return {name: 'posts-x', model: data.attribution_id};
        }

        return;
    }
}