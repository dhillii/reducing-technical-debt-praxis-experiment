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
        const join = this.getJoin();
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
        if (this.isLoginEvent(event)) return 'event-logged-in';
        if (this.isPaymentEvent(event)) return 'event-subscriptions';
        if (this.isNewsletterEvent(event)) {
            return event.data.subscribed
                ? 'event-subscribed-to-email'
                : 'event-unsubscribed-from-email';
        }
        if (this.isSubscriptionEvent(event)) {
            if (event.data.type === 'canceled') {
                return 'event-canceled-subscription';
            }
            return 'event-subscriptions';
        }
        if (this.isSignupOrCreatedSubscription(event)) return 'event-signed-up';
        if (this.isEmailOpenedEvent(event)) return 'event-opened-email';
        if (this.isEmailSentEvent(event) || this.isAutomatedEmailSentEvent(event)) return 'event-sent-email';
        if (this.isEmailDeliveredEvent(event)) return 'event-received-email';
        if (this.isEmailFailedEvent(event)) return 'event-email-delivery-failed';
        if (this.isEmailComplaintEvent(event)) return 'event-email-delivery-spam';
        if (this.isCommentEvent(event)) return 'event-comment';
        if (this.isClickEvent(event)) return 'event-click';
        if (this.isFeedbackEvent(event)) {
            return event.data.score === 1
                ? 'event-more-like-this'
                : 'event-less-like-this';
        }
        if (this.isDonationEvent(event)) return 'event-subscriptions';
        if (this.isEmailChangeEvent(event)) return 'event-email-changed';
        return '';
    }

    getAction(event, hasMultipleNewsletters) {
        if (this.isSignupOrCreatedSubscription(event)) return 'signed up';
        if (this.isLoginEvent(event)) return 'logged in';
        if (this.isPaymentEvent(event)) return 'made payment';
        if (this.isNewsletterEvent(event)) {
            const newsletter = this.getNewsletterName(event, hasMultipleNewsletters);
            return event.data.subscribed
                ? `subscribed to ${newsletter}`
                : `unsubscribed from ${newsletter}`;
        }
        if (this.isSubscriptionEvent(event)) {
            return this.getSubscriptionAction(event);
        }
        if (this.isEmailOpenedEvent(event)) return 'opened email';
        if (this.isEmailSentEvent(event)) return 'sent email';
        if (this.isAutomatedEmailSentEvent(event)) {
            const slug = event.data.automatedEmail?.slug || '';
            const emailType = slug.includes('paid') ? 'Paid' : 'Free';
            return `received welcome email (${emailType})`;
        }
        if (this.isEmailDeliveredEvent(event)) return 'received email';
        if (this.isEmailFailedEvent(event)) return 'bounced email';
        if (this.isEmailComplaintEvent(event)) return 'email flagged as spam';
        if (this.isCommentEvent(event)) {
            return event.data.parent ? 'replied to comment' : 'commented';
        }
        if (this.isClickEvent(event)) return 'clicked link in email';
        if (this.isAggregatedClickEvent(event)) {
            return event.data.count.clicks <= 1
                ? 'clicked link in email'
                : `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
        }
        if (this.isFeedbackEvent(event)) {
            return event.data.score === 1 ? 'more like this' : 'less like this';
        }
        if (this.isEmailChangeEvent(event)) {
            if (event.data.from_email && event.data.to_email) {
                return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
            }
            return 'Email address changed';
        }
        if (this.isDonationEvent(event)) return 'Made a one-time payment';
        return undefined;
    }

    getJoin() {
        return '–';
    }

    getObject(event) {
        if (this.isSignupOrSubscriptionOrDonation(event) && event.data.attribution?.title) {
            return event.data.attribution.title;
        }
        if (this.isCommentEvent(event) && event.data.post) {
            return event.data.post.title;
        }
        if (this.isClickOrFeedbackEvent(event) && event.data.post) {
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
        if (this.isSubscriptionEvent(event)) {
            const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
            if (mrrDelta === 0) return undefined;
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
        if (this.isSignupEvent(event) && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }
        if (this.isDonationEvent(event)) {
            const symbol = getSymbol(event.data.currency);
            return symbol + getNonDecimal(event.data.amount, event.data.currency);
        }
        return undefined;
    }

    getDescription(event) {
        if (this.isClickEvent(event)) {
            try {
                return this.utils.cleanTrackedUrl(event.data.link.to, true);
            } catch (e) {
                // ignore invalid URL
            }
            return event.data.link.to;
        }
        return undefined;
    }

    getURL(event) {
        if (this.isCommentClickOrFeedback(event) && event.data.post) {
            return event.data.post.url;
        }
        if (this.isSignupSubscriptionOrDonation(event) && event.data.attribution?.url) {
            return event.data.attribution.url;
        }
        return undefined;
    }

    getRoute(event) {
        if (this.isClickOrFeedback(event) && event.data.post) {
            return {name: 'posts-x', model: event.data.post.id};
        }
        if (this.isSignupOrSubscription(event) && event.data.attribution_type === 'post') {
            return {name: 'posts-x', model: event.data.attribution_id};
        }
        return undefined;
    }

    /* Predicate helpers */

    /** @private */
    isLoginEvent(event) {
        return event.type === 'login_event';
    }

    /** @private */
    isPaymentEvent(event) {
        return event.type === 'payment_event';
    }

    /** @private */
    isNewsletterEvent(event) {
        return event.type === 'newsletter_event';
    }

    /** @private */
    isSubscriptionEvent(event) {
        return event.type === 'subscription_event';
    }

    /** @private */
    isSignupOrCreatedSubscription(event) {
        return event.type === 'signup_event' ||
            (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup);
    }

    /** @private */
    isEmailOpenedEvent(event) {
        return event.type === 'email_opened_event';
    }

    /** @private */
    isEmailSentEvent(event) {
        return event.type === 'email_sent_event';
    }

    /** @private */
    isAutomatedEmailSentEvent(event) {
        return event.type === 'automated_email_sent_event';
    }

    /** @private */
    isEmailDeliveredEvent(event) {
        return event.type === 'email_delivered_event';
    }

    /** @private */
    isEmailFailedEvent(event) {
        return event.type === 'email_failed_event';
    }

    /** @private */
    isEmailComplaintEvent(event) {
        return event.type === 'email_complaint_event';
    }

    /** @private */
    isCommentEvent(event) {
        return event.type === 'comment_event';
    }

    /** @private */
    isClickEvent(event) {
        return event.type === 'click_event';
    }

    /** @private */
    isAggregatedClickEvent(event) {
        return event.type === 'aggregated_click_event';
    }

    /** @private */
    isFeedbackEvent(event) {
        return event.type === 'feedback_event';
    }

    /** @private */
    isDonationEvent(event) {
        return event.type === 'donation_event';
    }

    /** @private */
    isEmailChangeEvent(event) {
        return event.type === 'email_change_event';
    }

    /** @private */
    isSignupEvent(event) {
        return event.type === 'signup_event';
    }

    /** @private */
    isSignupOrSubscriptionOrDonation(event) {
        return ['signup_event', 'subscription_event', 'donation_event'].includes(event.type);
    }

    /** @private */
    isClickOrFeedback(event) {
        return ['click_event', 'feedback_event'].includes(event.type);
    }

    /** @private */
    isCommentClickOrFeedback(event) {
        return ['comment_event', 'click_event', 'feedback_event'].includes(event.type);
    }

    /** @private */
    isSignupOrSubscription(event) {
        return ['signup_event', 'subscription_event'].includes(event.type);
    }

    /** @private */
    getNewsletterName(event, hasMultipleNewsletters) {
        if (hasMultipleNewsletters && event.data.newsletter?.name) {
            return event.data.newsletter.name;
        }
        return 'newsletter';
    }

    /** @private */
    getSubscriptionAction(event) {
        switch (event.data.type) {
            case 'created':
                return 'started paid subscription';
            case 'updated':
                return 'changed paid subscription';
            case 'canceled':
                return 'canceled paid subscription';
            case 'reactivated':
                return 'reactivated paid subscription';
            case 'expired':
                return 'ended paid subscription';
            default:
                return 'changed paid subscription';
        }
    }
}