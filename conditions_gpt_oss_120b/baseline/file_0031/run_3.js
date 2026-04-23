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
        const memberNameRaw = event.data.member?.name;
        const memberName = this.trimString(memberNameRaw);

        const subject = event.data.member
            ? (memberName || event.data.member.email)
            : (event.data.name || event.data.email || '');

        const icon = this._getIcon(event);
        const action = this._getAction(event, hasMultipleNewsletters);
        const info = this._getInfo(event);
        const description = this._getDescription(event);
        const join = this.getJoin();
        const object = this._getObject(event);
        const url = this._getURL(event);
        const route = this._getRoute(event);
        const timestamp = moment(event.data.created_at);
        const source = this._getSource(event);

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

    _getIcon(event) {
        const type = event.type;
        const data = event.data;

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

        if (type in baseIcons) {
            return 'event-' + baseIcons[type];
        }

        if (type === 'newsletter_event') {
            return 'event-' + (data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email');
        }

        if (type === 'subscription_event') {
            if (data.type === 'canceled') {
                return 'event-canceled-subscription';
            }
            return 'event-subscriptions';
        }

        if (type === 'signup_event' || (type === 'subscription_event' && data.type === 'created' && data.signup)) {
            return 'event-signed-up';
        }

        if (type === 'feedback_event') {
            return 'event-' + (data.score === 1 ? 'more-like-this' : 'less-like-this');
        }

        return 'event-unknown';
    }

    _getAction(event, hasMultipleNewsletters) {
        const {type, data} = event;

        const simpleActions = {
            signup_event: 'signed up',
            login_event: 'logged in',
            payment_event: 'made payment',
            email_opened_event: 'opened email',
            email_sent_event: 'sent email',
            automated_email_sent_event: () => {
                const slug = data.automatedEmail?.slug || '';
                const emailType = slug.includes('paid') ? 'Paid' : 'Free';
                return `received welcome email (${emailType})`;
            },
            email_delivered_event: 'received email',
            email_failed_event: 'bounced email',
            email_complaint_event: 'email flagged as spam',
            comment_event: data.parent ? 'replied to comment' : 'commented',
            click_event: 'clicked link in email',
            aggregated_click_event: data.count?.clicks <= 1
                ? 'clicked link in email'
                : `clicked ${ghPluralize(data.count.clicks, 'link')} in email`,
            feedback_event: data.score === 1 ? 'more like this' : 'less like this',
            email_change_event: data.from_email && data.to_email
                ? `Email address changed from ${data.from_email} to ${data.to_email}`
                : 'Email address changed',
            donation_event: 'Made a one-time payment'
        };

        if (type in simpleActions) {
            const result = simpleActions[type];
            return typeof result === 'function' ? result() : result;
        }

        if (type === 'newsletter_event') {
            let newsletter = 'newsletter';
            if (hasMultipleNewsletters && data.newsletter?.name) {
                newsletter = data.newsletter.name;
            }
            return data.subscribed
                ? `subscribed to ${newsletter}`
                : `unsubscribed from ${newsletter}`;
        }

        if (type === 'subscription_event') {
            const actionMap = {
                created: 'started paid subscription',
                updated: 'changed paid subscription',
                canceled: 'canceled paid subscription',
                reactivated: 'reactivated paid subscription',
                expired: 'ended paid subscription'
            };
            return actionMap[data.type] || 'changed paid subscription';
        }

        return undefined;
    }

    getJoin() {
        return '–';
    }

    _getObject(event) {
        const {type, data} = event;

        if (['signup_event', 'subscription_event', 'donation_event'].includes(type) && data.attribution?.title) {
            return data.attribution.title;
        }

        if (type === 'comment_event' && data.post?.title) {
            return data.post.title;
        }

        if (['click_event', 'feedback_event'].includes(type) && data.post?.title) {
            return data.post.title;
        }

        return '';
    }

    _getSource(event) {
        const source = event.data?.attribution?.referrer_source;
        if (source) {
            return {
                name: source,
                url: event.data.attribution.referrer_url ?? null
            };
        }
        return null;
    }

    _getInfo(event) {
        const {type, data} = event;

        if (type === 'subscription_event') {
            const mrrDelta = getNonDecimal(data.mrr_delta, data.currency);
            if (mrrDelta === 0) {
                return;
            }
            const symbol = getSymbol(data.currency);
            const sign = mrrDelta > 0 ? '+' : '-';
            const absDelta = Math.abs(mrrDelta);

            if (data.type === 'created') {
                const tierName = this.membersUtils.hasMultipleTiers ? (data.tierName ?? 'Paid') : 'Paid';
                const prefix = mrrDelta > 0 ? '' : '-';
                return `${tierName} ${prefix}${symbol}${absDelta}/month`;
            }
            return `MRR ${sign}${symbol}${absDelta}`;
        }

        if (type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }

        if (type === 'donation_event') {
            const symbol = getSymbol(data.currency);
            return symbol + getNonDecimal(data.amount, data.currency);
        }

        return undefined;
    }

    _getDescription(event) {
        if (event.type === 'click_event') {
            try {
                return this.utils.cleanTrackedUrl(event.data.link.to, true);
            } catch {
                return event.data.link.to;
            }
        }
        return undefined;
    }

    _getURL(event) {
        const {type, data} = event;

        if (['comment_event', 'click_event', 'feedback_event'].includes(type) && data.post?.url) {
            return data.post.url;
        }

        if (['signup_event', 'subscription_event', 'donation_event'].includes(type) && data.attribution?.url) {
            return data.attribution.url;
        }

        return undefined;
    }

    _getRoute(event) {
        const {type, data} = event;

        if (['click_event', 'feedback_event'].includes(type) && data.post) {
            return {name: 'posts-x', model: data.post.id};
        }

        if (['signup_event', 'subscription_event'].includes(type) && data.attribution_type === 'post') {
            return {name: 'posts-x', model: data.attribution_id};
        }

        return undefined;
    }
}