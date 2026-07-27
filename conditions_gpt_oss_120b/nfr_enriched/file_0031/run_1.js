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

    /** Determine the appropriate icon for an event */
    getIcon(event) {
        const icon = this._determineIcon(event);
        return 'event-' + (icon ?? '');
    }

    _determineIcon(event) {
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

        if (simpleMap[event.type]) {
            return simpleMap[event.type];
        }

        if (event.type === 'newsletter_event') {
            return event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
        }

        if (event.type === 'subscription_event') {
            return event.data.type === 'canceled' ? 'canceled-subscription' : 'subscriptions';
        }

        if (event.type === 'signup_event' ||
            (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup)) {
            return 'signed-up';
        }

        if (event.type === 'feedback_event') {
            return event.data.score === 1 ? 'more-like-this' : 'less-like-this';
        }

        return undefined;
    }

    /** Determine the action description for an event */
    getAction(event, hasMultipleNewsletters) {
        const typeHandlers = {
            signup_event: () => this._actionForSignup(event),
            login_event: () => 'logged in',
            payment_event: () => 'made payment',
            newsletter_event: () => this._actionForNewsletter(event, hasMultipleNewsletters),
            subscription_event: () => this._actionForSubscription(event),
            email_opened_event: () => 'opened email',
            email_sent_event: () => 'sent email',
            automated_email_sent_event: () => this._actionForAutomatedEmail(event),
            email_delivered_event: () => 'received email',
            email_failed_event: () => 'bounced email',
            email_complaint_event: () => 'email flagged as spam',
            comment_event: () => this._actionForComment(event),
            click_event: () => 'clicked link in email',
            aggregated_click_event: () => this._actionForAggregatedClick(event),
            feedback_event: () => this._actionForFeedback(event),
            email_change_event: () => this._actionForEmailChange(event),
            donation_event: () => 'Made a one-time payment'
        };

        const handler = typeHandlers[event.type];
        return handler ? handler() : undefined;
    }

    _actionForSignup(event) {
        return 'signed up';
    }

    _actionForNewsletter(event, hasMultipleNewsletters) {
        let newsletter = 'newsletter';
        if (hasMultipleNewsletters && event.data.newsletter?.name) {
            newsletter = event.data.newsletter.name;
        }
        return event.data.subscribed
            ? `subscribed to ${newsletter}`
            : `unsubscribed from ${newsletter}`;
    }

    _actionForSubscription(event) {
        const typeMap = {
            created: 'started paid subscription',
            updated: 'changed paid subscription',
            canceled: 'canceled paid subscription',
            reactivated: 'reactivated paid subscription',
            expired: 'ended paid subscription'
        };
        return typeMap[event.data.type] || 'changed paid subscription';
    }

    _actionForAutomatedEmail(event) {
        const slug = event.data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    _actionForComment(event) {
        return event.data.parent ? 'replied to comment' : 'commented';
    }

    _actionForAggregatedClick(event) {
        const clicks = event.data.count?.clicks ?? 0;
        return clicks <= 1
            ? 'clicked link in email'
            : `clicked ${ghPluralize(clicks, 'link')} in email`;
    }

    _actionForFeedback(event) {
        return event.data.score === 1 ? 'more like this' : 'less like this';
    }

    _actionForEmailChange(event) {
        if (event.data.from_email && event.data.to_email) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }
        return 'Email address changed';
    }

    getJoin() {
        return '–';
    }

    getObject(event) {
        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type)) {
            return event.data.attribution?.title ?? '';
        }

        if (event.type === 'comment_event' && event.data.post) {
            return event.data.post.title;
        }

        if (['click_event', 'feedback_event'].includes(event.type) && event.data.post) {
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
            return symbol + getNonDecimal(event.data.amount, event.data.currency);
        }

        return;
    }

    getDescription(event) {
        if (event.type === 'click_event') {
            try {
                return this.utils.cleanTrackedUrl(event.data.link.to, true);
            } catch (e) {
                // ignore invalid URL
            }
            return event.data.link.to;
        }
        return;
    }

    getURL(event) {
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type) && event.data.post) {
            return event.data.post.url;
        }

        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type) && event.data.attribution?.url) {
            return event.data.attribution.url;
        }

        return;
    }

    getRoute(event) {
        if (['click_event', 'feedback_event'].includes(event.type) && event.data.post) {
            return {name: 'posts-x', model: event.data.post.id};
        }

        if (['signup_event', 'subscription_event'].includes(event.type) && event.data.attribution_type === 'post') {
            return {name: 'posts-x', model: event.data.attribution_id};
        }

        return;
    }
}