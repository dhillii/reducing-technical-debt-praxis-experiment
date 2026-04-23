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
            icon: this._getIcon(event),
            subject,
            action: this._getAction(event, hasMultipleNewsletters),
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

    _getIcon(event) {
        const baseIcons = {
            login_event: 'logged-in',
            payment_event: 'subscriptions',
            newsletter_event: event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email',
            subscription_event: 'subscriptions',
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
            feedback_event: event.data.score === 1 ? 'more-like-this' : 'less-like-this',
            donation_event: 'subscriptions',
            email_change_event: 'email-changed'
        };

        let icon = baseIcons[event.type] ?? '';

        if (event.type === 'subscription_event' && event.data.type === 'canceled') {
            icon = 'canceled-subscription';
        }

        if (event.type === 'signup_event' ||
            (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup)) {
            icon = 'signed-up';
        }

        return `event-${icon}`;
    }

    _getAction(event, hasMultipleNewsletters) {
        const actions = {
            signup_event: 'signed up',
            login_event: 'logged in',
            payment_event: 'made payment',
            email_opened_event: 'opened email',
            email_sent_event: 'sent email',
            automated_email_sent_event: () => {
                const slug = event.data.automatedEmail?.slug || '';
                const emailType = slug.includes('paid') ? 'Paid' : 'Free';
                return `received welcome email (${emailType})`;
            },
            email_delivered_event: 'received email',
            email_failed_event: 'bounced email',
            email_complaint_event: 'email flagged as spam',
            comment_event: () => event.data.parent ? 'replied to comment' : 'commented',
            click_event: 'clicked link in email',
            aggregated_click_event: () => {
                const clicks = event.data.count?.clicks ?? 0;
                return clicks <= 1
                    ? 'clicked link in email'
                    : `clicked ${ghPluralize(clicks, 'link')} in email`;
            },
            feedback_event: () => event.data.score === 1 ? 'more like this' : 'less like this',
            email_change_event: () => {
                if (event.data.from_email && event.data.to_email) {
                    return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
                }
                return 'Email address changed';
            },
            donation_event: 'Made a one-time payment'
        };

        if (event.type === 'newsletter_event') {
            const name = (hasMultipleNewsletters && event.data.newsletter?.name) || 'newsletter';
            return event.data.subscribed ? `subscribed to ${name}` : `unsubscribed from ${name}`;
        }

        if (event.type === 'subscription_event') {
            const typeMap = {
                created: 'started paid subscription',
                updated: 'changed paid subscription',
                canceled: 'canceled paid subscription',
                reactivated: 'reactivated paid subscription',
                expired: 'ended paid subscription'
            };
            return typeMap[event.data.type] || 'changed paid subscription';
        }

        const action = actions[event.type];
        return typeof action === 'function' ? action() : action;
    }

    getJoin() {
        return '–';
    }

    getObject(event) {
        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type) && event.data.attribution?.title) {
            return event.data.attribution.title;
        }
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type) && event.data.post?.title) {
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
        if (event.type === 'subscription_event') {
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

        if (event.type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }

        if (event.type === 'donation_event') {
            const symbol = getSymbol(event.data.currency);
            return `${symbol}${getNonDecimal(event.data.amount, event.data.currency)}`;
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
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type) && event.data.post?.url) {
            return event.data.post.url;
        }
        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type) && event.data.attribution?.url) {
            return event.data.attribution.url;
        }
    }

    getRoute(event) {
        if (['click_event', 'feedback_event'].includes(event.type) && event.data.post) {
            return {name: 'posts-x', model: event.data.post.id};
        }
        if (['signup_event', 'subscription_event'].includes(event.type) && event.data.attribution_type === 'post') {
            return {name: 'posts-x', model: event.data.attribution_id};
        }
    }
}