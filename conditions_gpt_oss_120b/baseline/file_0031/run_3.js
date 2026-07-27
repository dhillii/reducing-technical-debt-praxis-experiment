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
        let memberName = this.trimString(event.data.member?.name);
        const subject = event.data.member
            ? (memberName || event.data.member.email)
            : (event.data.name || event.data.email || '');
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

    /* internal helper functions */
    getIcon(event) {
        const type = event.type;
        const baseIcons = {
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

        const icon = baseIcons[type];
        return icon ? 'event-' + icon : 'event-undefined';
    }

    getAction(event, hasMultipleNewsletters) {
        const type = event.type;

        if (type === 'signup_event' || (type === 'subscription_event' && event.data.type === 'created' && event.data.signup)) {
            return 'signed up';
        }

        if (type === 'login_event') {
            return 'logged in';
        }

        if (type === 'payment_event') {
            return 'made payment';
        }

        if (type === 'newsletter_event') {
            const base = hasMultipleNewsletters && event.data.newsletter?.name
                ? event.data.newsletter.name
                : 'newsletter';
            return event.data.subscribed
                ? `subscribed to ${base}`
                : `unsubscribed from ${base}`;
        }

        if (type === 'subscription_event') {
            const actions = {
                created: 'started paid subscription',
                updated: 'changed paid subscription',
                canceled: 'canceled paid subscription',
                reactivated: 'reactivated paid subscription',
                expired: 'ended paid subscription'
            };
            return actions[event.data.type] || 'changed paid subscription';
        }

        if (type === 'email_opened_event') {
            return 'opened email';
        }

        if (type === 'email_sent_event') {
            return 'sent email';
        }

        if (type === 'automated_email_sent_event') {
            const slug = event.data.automatedEmail?.slug || '';
            const emailType = slug.includes('paid') ? 'Paid' : 'Free';
            return `received welcome email (${emailType})`;
        }

        if (type === 'email_delivered_event') {
            return 'received email';
        }

        if (type === 'email_failed_event') {
            return 'bounced email';
        }

        if (type === 'email_complaint_event') {
            return 'email flagged as spam';
        }

        if (type === 'comment_event') {
            return event.data.parent ? 'replied to comment' : 'commented';
        }

        if (type === 'click_event') {
            return 'clicked link in email';
        }

        if (type === 'aggregated_click_event') {
            const clicks = event.data.count?.clicks ?? 0;
            return clicks <= 1
                ? 'clicked link in email'
                : `clicked ${ghPluralize(clicks, 'link')} in email`;
        }

        if (type === 'feedback_event') {
            return event.data.score === 1 ? 'more like this' : 'less like this';
        }

        if (type === 'email_change_event') {
            if (event.data.from_email && event.data.to_email) {
                return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
            }
            return 'Email address changed';
        }

        if (type === 'donation_event') {
            return 'Made a one-time payment';
        }
    }

    getJoin() {
        return '–';
    }

    getObject(event) {
        const type = event.type;

        if (['signup_event', 'subscription_event', 'donation_event'].includes(type) && event.data.attribution?.title) {
            return event.data.attribution.title;
        }

        if (type === 'comment_event' && event.data.post) {
            return event.data.post.title;
        }

        if (['click_event', 'feedback_event'].includes(type) && event.data.post) {
            return event.data.post.title;
        }

        return '';
    }

    getSource(event) {
        if (event.data?.attribution?.referrer_source) {
            return {
                name: event.data.attribution.referrer_source,
                url: event.data.attribution.referrer_url ?? null
            };
        }
        return null;
    }

    getInfo(event) {
        const type = event.type;

        if (type === 'subscription_event') {
            const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
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
        }

        if (type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }

        if (type === 'donation_event') {
            const symbol = getSymbol(event.data.currency);
            return symbol + getNonDecimal(event.data.amount, event.data.currency);
        }
    }

    getDescription(event) {
        if (event.type === 'click_event') {
            try {
                return this.utils.cleanTrackedUrl(event.data.link.to, true);
            } catch {
                return event.data.link.to;
            }
        }
    }

    getURL(event) {
        const type = event.type;

        if (['comment_event', 'click_event', 'feedback_event'].includes(type) && event.data.post) {
            return event.data.post.url;
        }

        if (['signup_event', 'subscription_event', 'donation_event'].includes(type) && event.data.attribution?.url) {
            return event.data.attribution.url;
        }
    }

    getRoute(event) {
        const type = event.type;

        if (['click_event', 'feedback_event'].includes(type) && event.data.post) {
            return {name: 'posts-x', model: event.data.post.id};
        }

        if (['signup_event', 'subscription_event'].includes(type) && event.data.attribution_type === 'post') {
            return {name: 'posts-x', model: event.data.attribution_id};
        }
    }
}