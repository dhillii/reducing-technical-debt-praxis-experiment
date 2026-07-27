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
        const memberName = this.getMemberName(event);
        const subject = this.getSubject(event, memberName);
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

    getMemberName(event) {
        const memberName = event.data.member?.name;
        return this.trimString(memberName);
    }

    getSubject(event, memberName) {
        return event.data.member ? (memberName || event.data.member.email) : (event.data.name || event.data.email || '');
    }

    getIcon(event) {
        const iconMap = {
            'login_event': 'logged-in',
            'payment_event': 'subscriptions',
            'newsletter_event': event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email',
            'subscription_event': event.data.type === 'canceled' ? 'canceled-subscription' : 'subscriptions',
            'signup_event': 'signed-up',
            'email_opened_event': 'opened-email',
            'email_sent_event': 'sent-email',
            'automated_email_sent_event': 'sent-email',
            'email_delivered_event': 'received-email',
            'email_failed_event': 'email-delivery-failed',
            'email_complaint_event': 'email-delivery-spam',
            'comment_event': 'comment',
            'click_event': 'click',
            'aggregated_click_event': 'click',
            'feedback_event': event.data.score === 1 ? 'more-like-this' : 'less-like-this',
            'donation_event': 'subscriptions',
            'email_change_event': 'email-changed'
        };

        const icon = iconMap[event.type] || 'event';
        return 'event-' + icon;
    }

    getAction(event, hasMultipleNewsletters) {
        const actionMap = {
            'signup_event': 'signed up',
            'login_event': 'logged in',
            'payment_event': 'made payment',
            'newsletter_event': event.data.subscribed ? `subscribed to ${this.getNewsletterName(event, hasMultipleNewsletters)}` : `unsubscribed from ${this.getNewsletterName(event, hasMultipleNewsletters)}`,
            'subscription_event': this.getSubscriptionAction(event),
            'email_opened_event': 'opened email',
            'email_sent_event': 'sent email',
            'automated_email_sent_event': this.getAutomatedEmailAction(event),
            'email_delivered_event': 'received email',
            'email_failed_event': 'bounced email',
            'email_complaint_event': 'email flagged as spam',
            'comment_event': event.data.parent ? 'replied to comment' : 'commented',
            'click_event': 'clicked link in email',
            'aggregated_click_event': this.getAggregatedClickAction(event),
            'feedback_event': event.data.score === 1 ? 'more like this' : 'less like this',
            'email_change_event': this.getEmailChangeAction(event),
            'donation_event': 'Made a one-time payment'
        };

        return actionMap[event.type] || '';
    }

    getNewsletterName(event, hasMultipleNewsletters) {
        if (hasMultipleNewsletters && event.data.newsletter && event.data.newsletter.name) {
            return event.data.newsletter.name;
        }
        return 'newsletter';
    }

    getSubscriptionAction(event) {
        const actions = {
            'created': 'started paid subscription',
            'updated': 'changed paid subscription',
            'canceled': 'canceled paid subscription',
            'reactivated': 'reactivated paid subscription',
            'expired': 'ended paid subscription'
        };

        return actions[event.data.type] || 'changed paid subscription';
    }

    getAutomatedEmailAction(event) {
        const slug = event.data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    getAggregatedClickAction(event) {
        if (event.data.count.clicks <= 1) {
            return 'clicked link in email';
        }
        return `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
    }

    getEmailChangeAction(event) {
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
            return event.data.attribution?.title || '';
        }

        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type)) {
            return event.data.post?.title || '';
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
            return this.getSubscriptionInfo(event);
        }

        if (event.type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }

        if (event.type === 'donation_event') {
            return this.getDonationInfo(event);
        }

        return;
    }

    getSubscriptionInfo(event) {
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

    getDonationInfo(event) {
        const symbol = getSymbol(event.data.currency);
        const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
        return formattedAmount;
    }

    getDescription(event) {
        if (event.type === 'click_event') {
            try {
                return this.utils.cleanTrackedUrl(event.data.link.to, true);
            } catch (e) {
                // Invalid URL
            }
            return event.data.link.to;
        }
        return;
    }

    getURL(event) {
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type)) {
            return event.data.post?.url || '';
        }

        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type)) {
            return event.data.attribution?.url || '';
        }
        return;
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
        return;
    }
}