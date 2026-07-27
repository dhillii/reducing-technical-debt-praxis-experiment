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

    /* internal helper functions */
    getIcon(event) {
        const type = event.type;

        if (type === 'login_event') {
            return 'logged-in';
        }

        if (type === 'payment_event') {
            return 'subscriptions';
        }

        if (type === 'newsletter_event') {
            return this.getNewsletterIcon(event);
        }

        if (type === 'subscription_event') {
            return this.getSubscriptionIcon(event);
        }

        if (type === 'signup_event' || (type === 'subscription_event' && event.data.type === 'created' && event.data.signup)) {
            return 'signed-up';
        }

        if (type === 'email_opened_event') {
            return 'opened-email';
        }

        if (type === 'email_sent_event') {
            return 'sent-email';
        }

        if (type === 'automated_email_sent_event') {
            return 'sent-email';
        }

        if (type === 'email_delivered_event') {
            return 'received-email';
        }

        if (type === 'email_failed_event') {
            return 'email-delivery-failed';
        }

        if (type === 'email_complaint_event') {
            return 'email-delivery-spam';
        }

        if (type === 'comment_event') {
            return 'comment';
        }

        if (type === 'click_event' || type === 'aggregated_click_event') {
            return 'click';
        }

        if (type === 'feedback_event') {
            return this.getFeedbackIcon(event);
        }

        if (type === 'donation_event') {
            return 'subscriptions';
        }

        if (type === 'email_change_event') {
            return 'email-changed';
        }

        return 'event-' + 'unknown';
    }

    getNewsletterIcon(event) {
        if (event.data.subscribed) {
            return 'subscribed-to-email';
        }

        return 'unsubscribed-from-email';
    }

    getSubscriptionIcon(event) {
        if (event.data.type === 'canceled') {
            return 'canceled-subscription';
        }

        return 'subscriptions';
    }

    getFeedbackIcon(event) {
        if (event.data.score === 1) {
            return 'more-like-this';
        }

        return 'less-like-this';
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
            return this.getNewsletterAction(event, hasMultipleNewsletters);
        }

        if (type === 'subscription_event') {
            return this.getSubscriptionAction(event);
        }

        if (type === 'email_opened_event') {
            return 'opened email';
        }

        if (type === 'email_sent_event') {
            return 'sent email';
        }

        if (type === 'automated_email_sent_event') {
            return this.getAutomatedEmailAction(event);
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
            return this.getCommentAction(event);
        }

        if (type === 'click_event') {
            return 'clicked link in email';
        }

        if (type === 'aggregated_click_event') {
            return this.getAggregatedClickAction(event);
        }

        if (type === 'feedback_event') {
            return this.getFeedbackAction(event);
        }

        if (type === 'email_change_event') {
            return this.getEmailChangeAction(event);
        }

        if (type === 'donation_event') {
            return 'Made a one-time payment';
        }

        return '';
    }

    getNewsletterAction(event, hasMultipleNewsletters) {
        let newsletter = 'newsletter';

        if (hasMultipleNewsletters && event.data.newsletter && event.data.newsletter.name) {
            newsletter = event.data.newsletter.name;
        }

        if (event.data.subscribed) {
            return 'subscribed to ' + newsletter;
        }

        return 'unsubscribed from ' + newsletter;
    }

    getSubscriptionAction(event) {
        const type = event.data.type;

        if (type === 'created') {
            return 'started paid subscription';
        }

        if (type === 'updated') {
            return 'changed paid subscription';
        }

        if (type === 'canceled') {
            return 'canceled paid subscription';
        }

        if (type === 'reactivated') {
            return 'reactivated paid subscription';
        }

        if (type === 'expired') {
            return 'ended paid subscription';
        }

        return 'changed paid subscription';
    }

    getAutomatedEmailAction(event) {
        const slug = event.data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    getCommentAction(event) {
        if (event.data.parent) {
            return 'replied to comment';
        }

        return 'commented';
    }

    getAggregatedClickAction(event) {
        if (event.data.count.clicks <= 1) {
            return 'clicked link in email';
        }

        return `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
    }

    getFeedbackAction(event) {
        if (event.data.score === 1) {
            return 'more like this';
        }

        return 'less like this';
    }

    getEmailChangeAction(event) {
        if (event.data.from_email && event.data.to_email) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }

        return 'Email address changed';
    }

    getJoin(event) {
        return '–';
    }

    getObject(event) {
        const type = event.type;

        if (type === 'signup_event' || type === 'subscription_event' || type === 'donation_event') {
            if (event.data.attribution?.title) {
                return event.data.attribution.title;
            }
        }

        if (type === 'comment_event') {
            if (event.data.post) {
                return event.data.post.title;
            }
        }

        if (type === 'click_event' || type === 'feedback_event') {
            if (event.data.post) {
                return event.data.post.title;
            }
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
            return this.getSubscriptionInfo(event);
        }

        if (type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }

        if (type === 'donation_event') {
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
            // Clean URL
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
        const type = event.type;

        if (['comment_event', 'click_event', 'feedback_event'].includes(type)) {
            if (event.data.post) {
                return event.data.post.url;
            }
        }

        if (['signup_event', 'subscription_event', 'donation_event'].includes(type)) {
            if (event.data.attribution && event.data.attribution.url) {
                return event.data.attribution.url;
            }
        }
        return;
    }

    getRoute(event) {
        const type = event.type;

        if (['click_event', 'feedback_event'].includes(type)) {
            if (event.data.post) {
                return {
                    name: 'posts-x',
                    model: event.data.post.id
                };
            }
        }

        if (['signup_event', 'subscription_event'].includes(type)) {
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