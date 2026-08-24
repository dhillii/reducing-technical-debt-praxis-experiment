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
        const icon = this.getIconForEventType(event);
        const action = this.getActionText(event, hasMultipleNewsletters);
        const info = this.getInfoForEvent(event);
        const description = this.getDescriptionForEvent(event);

        const join = this.getJoin();
        const object = this.getObjectForEvent(event);
        const url = this.getUrlForEvent(event);
        const route = this.getRouteForEvent(event);
        const timestamp = moment(event.data.created_at);
        const source = this.getSourceForEvent(event);

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

    /**
     * Returns appropriate icon type based on event type
     */
    getIconForEventType(event) {
        const iconMap = {
            login_event: 'logged-in',
            payment_event: 'subscriptions',
            newsletter_event: () => (event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email'),
            subscription_event: () => {
                if (event.data.type === 'canceled') {
                    return 'canceled-subscription';
                }
                return 'subscriptions';
            },
            signup_event: 'signed-up',
            'subscription_event.created.signup': 'signed-up',
            email_opened_event: 'opened-email',
            email_sent_event: 'sent-email',
            automated_email_sent_event: 'sent-email',
            email_delivered_event: 'received-email',
            email_failed_event: 'email-delivery-failed',
            email_complaint_event: 'email-delivery-spam',
            comment_event: 'comment',
            click_event: 'click',
            aggregated_click_event: 'click',
            feedback_event: () => (event.data.score === 1 ? 'more-like-this' : 'less-like-this'),
            donation_event: 'subscriptions',
            email_change_event: 'email-changed'
        };

        // Handle conditional cases
        const iconOrFunc = iconMap[event.type];

        if (typeof iconOrFunc === 'function') {
            return 'event-' + iconOrFunc();
        }

        // Special-case for signup_event inside subscription_event
        if (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup) {
            return 'event-signed-up';
        }

        return iconOrFunc ? 'event-' + iconOrFunc : 'event-';
    }

    /**
     * Returns human-readable action text based on event type
     */
    getActionText(event, hasMultipleNewsletters) {
        switch (event.type) {
            case 'signup_event':
            case 'subscription_event.created.signup':
                return 'signed up';
            case 'login_event':
                return 'logged in';
            case 'payment_event':
                return 'made payment';
            case 'newsletter_event':
                return this.getNewsletterActionText(event, hasMultipleNewsletters);
            case 'subscription_event':
                return this.getSubscriptionActionText(event);
            case 'email_opened_event':
                return 'opened email';
            case 'email_sent_event':
                return 'sent email';
            case 'automated_email_sent_event':
                return this.getAutomatedEmailActionText(event);
            case 'email_delivered_event':
                return 'received email';
            case 'email_failed_event':
                return 'bounced email';
            case 'email_complaint_event':
                return 'email flagged as spam';
            case 'comment_event':
                return this.getCommentActionText(event);
            case 'click_event':
                return 'clicked link in email';
            case 'aggregated_click_event':
                return this.getAggregatedClickActionText(event);
            case 'feedback_event':
                return this.getFeedbackActionText(event);
            case 'email_change_event':
                return this.getEmailChangeActionText(event);
            case 'donation_event':
                return 'Made a one-time payment';
            default:
                return '';
        }
    }

    getNewsletterActionText(event, hasMultipleNewsletters) {
        let newsletter = 'newsletter';
        if (hasMultipleNewsletters && event.data.newsletter?.name) {
            newsletter = event.data.newsletter.name;
        }
        return event.data.subscribed ? `subscribed to ${newsletter}` : `unsubscribed from ${newsletter}`;
    }

    getSubscriptionActionText(event) {
        const type = event.data.type;
        const mappings = {
            created: 'started paid subscription',
            updated: 'changed paid subscription',
            canceled: 'canceled paid subscription',
            reactivated: 'reactivated paid subscription',
            expired: 'ended paid subscription'
        };
        return mappings[type] || 'changed paid subscription';
    }

    getAutomatedEmailActionText(event) {
        const slug = event.data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    getCommentActionText(event) {
        return event.data.parent ? 'replied to comment' : 'commented';
    }

    getAggregatedClickActionText(event) {
        if (event.data.count?.clicks <= 1) {
            return 'clicked link in email';
        }
        return `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
    }

    getFeedbackActionText(event) {
        return event.data.score === 1 ? 'more like this' : 'less like this';
    }

    getEmailChangeActionText(event) {
        if (event.data.from_email && event.data.to_email) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }
        return 'Email address changed';
    }

    /**
     * Returns separator/joiner string between action and object when needed
     */
    getJoin() {
        return '–';
    }

    /**
     * Returns clickable object title/text for the event if applicable
     */
    getObjectForEvent(event) {
        const {type, data} = event;

        if (['signup_event', 'subscription_event', 'donation_event'].includes(type)) {
            return data.attribution?.title || '';
        }

        if (type === 'comment_event') {
            return data.post?.title || '';
        }

        if (['click_event', 'feedback_event'].includes(type)) {
            return data.post?.title || '';
        }

        return '';
    }

    /**
     * Returns source attribution info for the event
     */
    getSourceForEvent(event) {
        if (event.data?.attribution?.referrer_source) {
            return {
                name: event.data.attribution.referrer_source,
                url: event.data.attribution.referrer_url ?? null
            };
        }
        return null;
    }

    /**
     * Returns displayable info (e.g., MRR changes, payment amount)
     */
    getInfoForEvent(event) {
        const {type, data} = event;

        if (type === 'subscription_event') {
            return this.getSubscriptionInfo(data);
        }

        if (type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }

        if (type === 'donation_event') {
            return this.getDonationAmountString(data);
        }

        return;
    }

    getSubscriptionInfo(data) {
        const mrrDelta = getNonDecimal(data.mrr_delta, data.currency);
        if (mrrDelta === 0) {
            return;
        }

        const symbol = getSymbol(data.currency);
        if (data.type === 'created') {
            const sign = mrrDelta > 0 ? '' : '-';
            const tierName = this.membersUtils.hasMultipleTiers ? (data.tierName ?? 'Paid') : 'Paid';
            return `${tierName} ${sign}${symbol}${Math.abs(mrrDelta)}/month`;
        }

        const sign = mrrDelta > 0 ? '+' : '-';
        return `MRR ${sign}${symbol}${Math.abs(mrrDelta)}`;
    }

    getDonationAmountString(data) {
        const symbol = getSymbol(data.currency);
        const amount = getNonDecimal(data.amount, data.currency);
        return symbol + amount;
    }

    /**
     * Returns trimmed description for the event if applicable (e.g., cleaned URL for clicks)
     */
    getDescriptionForEvent(event) {
        if (event.type === 'click_event') {
            try {
                return this.utils.cleanTrackedUrl(event.data.link?.to, true);
            } catch (e) {
                // Invalid URL
            }
            return event.data.link?.to || '';
        }

        return;
    }

    /**
     * Returns clickable URL for the object if applicable
     */
    getUrlForEvent(event) {
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type)) {
            return event.data.post?.url || '';
        }

        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type)) {
            return event.data.attribution?.url || '';
        }

        return;
    }

    /**
     * Returns internal route props for clickable object
     */
    getRouteForEvent(event) {
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