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

    /**
     * Determine icon based on event type and data.
     */
    getIcon(event) {
        if (this.isLoginEvent(event)) return 'event-logged-in';
        if (this.isPaymentEvent(event)) return 'event-subscriptions';
        if (this.isNewsletterSubscribed(event)) return 'event-subscribed-to-email';
        if (this.isNewsletterUnsubscribed(event)) return 'event-unsubscribed-from-email';
        if (this.isSubscriptionCanceled(event)) return 'event-canceled-subscription';
        if (this.isSignedUpEvent(event)) return 'event-signed-up';
        if (this.isEmailOpenedEvent(event)) return 'event-opened-email';
        if (this.isEmailSentEvent(event)) return 'event-sent-email';
        if (this.isEmailDeliveredEvent(event)) return 'event-received-email';
        if (this.isEmailFailedEvent(event)) return 'event-email-delivery-failed';
        if (this.isEmailComplaintEvent(event)) return 'event-email-delivery-spam';
        if (this.isCommentEvent(event)) return 'event-comment';
        if (this.isClickEvent(event)) return 'event-click';
        if (this.isFeedbackPositive(event)) return 'event-more-like-this';
        if (this.isFeedbackNegative(event)) return 'event-less-like-this';
        if (this.isDonationEvent(event)) return 'event-subscriptions';
        if (this.isEmailChangeEvent(event)) return 'event-email-changed';
        return '';
    }

    /**
     * Determine action string based on event type and data.
     */
    getAction(event, hasMultipleNewsletters) {
        if (this.isSignedUpEvent(event)) return 'signed up';
        if (this.isLoginEvent(event)) return 'logged in';
        if (this.isPaymentEvent(event)) return 'made payment';
        if (this.isNewsletterEvent(event)) {
            const newsletter = this.getNewsletterName(event, hasMultipleNewsletters);
            return event.data.subscribed
                ? `subscribed to ${newsletter}`
                : `unsubscribed from ${newsletter}`;
        }
        if (this.isSubscriptionCreated(event)) return 'started paid subscription';
        if (this.isSubscriptionUpdated(event)) return 'changed paid subscription';
        if (this.isSubscriptionCanceled(event)) return 'canceled paid subscription';
        if (this.isSubscriptionReactivated(event)) return 'reactivated paid subscription';
        if (this.isSubscriptionExpired(event)) return 'ended paid subscription';
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
        if (this.isFeedbackPositive(event)) return 'more like this';
        if (this.isFeedbackNegative(event)) return 'less like this';
        if (this.isEmailChangeEvent(event)) {
            return event.data.from_email && event.data.to_email
                ? `Email address changed from ${event.data.from_email} to ${event.data.to_email}`
                : 'Email address changed';
        }
        if (this.isDonationEvent(event)) return 'Made a one-time payment';
        return undefined;
    }

    getJoin() {
        return '–';
    }

    getObject(event) {
        if (this.isAttributionEvent(event)) {
            return event.data.attribution.title;
        }
        if (this.isCommentEvent(event) && event.data.post) {
            return event.data.post.title;
        }
        if ((this.isClickEvent(event) || this.isFeedbackEvent(event)) && event.data.post) {
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
        if (this.isClickablePostEvent(event) && event.data.post) {
            return event.data.post.url;
        }
        if (this.isAttributionEvent(event) && event.data.attribution?.url) {
            return event.data.attribution.url;
        }
        return undefined;
    }

    getRoute(event) {
        if (this.isClickablePostEvent(event) && event.data.post) {
            return {name: 'posts-x', model: event.data.post.id};
        }
        if (this.isAttributionEvent(event) && event.data.attribution_type === 'post') {
            return {name: 'posts-x', model: event.data.attribution_id};
        }
        return undefined;
    }

    /* predicate helpers */

    /** @returns {boolean} */
    isLoginEvent(event) {
        return event.type === 'login_event';
    }

    /** @returns {boolean} */
    isPaymentEvent(event) {
        return event.type === 'payment_event';
    }

    /** @returns {boolean} */
    isNewsletterEvent(event) {
        return event.type === 'newsletter_event';
    }

    /** @returns {boolean} */
    isNewsletterSubscribed(event) {
        return this.isNewsletterEvent(event) && event.data.subscribed;
    }

    /** @returns {boolean} */
    isNewsletterUnsubscribed(event) {
        return this.isNewsletterEvent(event) && !event.data.subscribed;
    }

    /** @returns {boolean} */
    isSubscriptionEvent(event) {
        return event.type === 'subscription_event';
    }

    /** @returns {boolean} */
    isSubscriptionCreated(event) {
        return this.isSubscriptionEvent(event) && event.data.type === 'created';
    }

    /** @returns {boolean} */
    isSubscriptionUpdated(event) {
        return this.isSubscriptionEvent(event) && event.data.type === 'updated';
    }

    /** @returns {boolean} */
    isSubscriptionCanceled(event) {
        return this.isSubscriptionEvent(event) && event.data.type === 'canceled';
    }

    /** @returns {boolean} */
    isSubscriptionReactivated(event) {
        return this.isSubscriptionEvent(event) && event.data.type === 'reactivated';
    }

    /** @returns {boolean} */
    isSubscriptionExpired(event) {
        return this.isSubscriptionEvent(event) && event.data.type === 'expired';
    }

    /** @returns {boolean} */
    isSignedUpEvent(event) {
        return event.type === 'signup_event' ||
            (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup);
    }

    /** @returns {boolean} */
    isEmailOpenedEvent(event) {
        return event.type === 'email_opened_event';
    }

    /** @returns {boolean} */
    isEmailSentEvent(event) {
        return event.type === 'email_sent_event';
    }

    /** @returns {boolean} */
    isAutomatedEmailSentEvent(event) {
        return event.type === 'automated_email_sent_event';
    }

    /** @returns {boolean} */
    isEmailDeliveredEvent(event) {
        return event.type === 'email_delivered_event';
    }

    /** @returns {boolean} */
    isEmailFailedEvent(event) {
        return event.type === 'email_failed_event';
    }

    /** @returns {boolean} */
    isEmailComplaintEvent(event) {
        return event.type === 'email_complaint_event';
    }

    /** @returns {boolean} */
    isCommentEvent(event) {
        return event.type === 'comment_event';
    }

    /** @returns {boolean} */
    isClickEvent(event) {
        return event.type === 'click_event';
    }

    /** @returns {boolean} */
    isAggregatedClickEvent(event) {
        return event.type === 'aggregated_click_event';
    }

    /** @returns {boolean} */
    isFeedbackEvent(event) {
        return event.type === 'feedback_event';
    }

    /** @returns {boolean} */
    isFeedbackPositive(event) {
        return this.isFeedbackEvent(event) && event.data.score === 1;
    }

    /** @returns {boolean} */
    isFeedbackNegative(event) {
        return this.isFeedbackEvent(event) && event.data.score !== 1;
    }

    /** @returns {boolean} */
    isDonationEvent(event) {
        return event.type === 'donation_event';
    }

    /** @returns {boolean} */
    isEmailChangeEvent(event) {
        return event.type === 'email_change_event';
    }

    /** @returns {boolean} */
    isSignupEvent(event) {
        return event.type === 'signup_event';
    }

    /** @returns {boolean} */
    isAttributionEvent(event) {
        return ['signup_event', 'subscription_event', 'donation_event'].includes(event.type);
    }

    /** @returns {boolean} */
    isClickablePostEvent(event) {
        return ['click_event', 'feedback_event'].includes(event.type);
    }

    /**
     * Resolve newsletter name for newsletter events.
     */
    getNewsletterName(event, hasMultipleNewsletters) {
        if (hasMultipleNewsletters && event.data.newsletter?.name) {
            return event.data.newsletter.name;
        }
        return 'newsletter';
    }
}