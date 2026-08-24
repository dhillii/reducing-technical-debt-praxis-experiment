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
        if (this.isLoginEvent(event)) {
            return 'event-logged-in';
        }

        if (this.isPaymentEvent(event)) {
            return 'event-subscriptions';
        }

        if (this.isNewsletterEvent(event)) {
            return this.getNewsletterIcon(event);
        }

        if (this.isSubscriptionEvent(event)) {
            return this.getSubscriptionIcon(event);
        }

        if (this.isSignupEvent(event)) {
            return 'event-signed-up';
        }

        if (this.isEmailOpenedEvent(event)) {
            return 'event-opened-email';
        }

        if (this.isEmailSentEvent(event)) {
            return 'event-sent-email';
        }

        if (this.isAutomatedEmailSentEvent(event)) {
            return 'event-sent-email';
        }

        if (this.isEmailDeliveredEvent(event)) {
            return 'event-received-email';
        }

        if (this.isEmailFailedEvent(event)) {
            return 'event-email-delivery-failed';
        }

        if (this.isEmailComplaintEvent(event)) {
            return 'event-email-delivery-spam';
        }

        if (this.isCommentEvent(event)) {
            return 'event-comment';
        }

        if (this.isClickEvent(event)) {
            return 'event-click';
        }

        if (this.isFeedbackEvent(event)) {
            return this.getFeedbackIcon(event);
        }

        if (this.isDonationEvent(event)) {
            return 'event-subscriptions';
        }

        if (this.isEmailChangeEvent(event)) {
            return 'event-email-changed';
        }

        return 'event-';
    }

    /**
     * @param {Object} event
     * @returns {boolean}
     */
    isLoginEvent(event) {
        return event.type === 'login_event';
    }

    /**
     * @param {Object} event
     * @returns {boolean}
     */
    isPaymentEvent(event) {
        return event.type === 'payment_event';
    }

    /**
     * @param {Object} event
     * @returns {boolean}
     */
    isNewsletterEvent(event) {
        return event.type === 'newsletter_event';
    }

    /**
     * @param {Object} event
     * @returns {string}
     */
    getNewsletterIcon(event) {
        if (event.data.subscribed) {
            return 'event-subscribed-to-email';
        }
        return 'event-unsubscribed-from-email';
    }

    /**
     * @param {Object} event
     * @returns {boolean}
     */
    isSubscriptionEvent(event) {
        return event.type === 'subscription_event';
    }

    /**
     * @param {Object} event
     * @returns {string}
     */
    getSubscriptionIcon(event) {
        if (event.data.type === 'canceled') {
            return 'event-canceled-subscription';
        }
        return 'event-subscriptions';
    }

    /**
     * @param {Object} event
     * @returns {boolean}
     */
    isSignupEvent(event) {
        return event.type === 'signup_event' || (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup);
    }

    /**
     * @param {Object} event
     * @returns {boolean}
     */
    isEmailOpenedEvent(event) {
        return event.type === 'email_opened_event';
    }

    /**
     * @param {Object} event
     * @returns {boolean}
     */
    isEmailSentEvent(event) {
        return event.type === 'email_sent_event';
    }

    /**
     * @param {Object} event
     * @returns {boolean}
     */
    isAutomatedEmailSentEvent(event) {
        return event.type === 'automated_email_sent_event';
    }

    /**
     * @param {Object} event
     * @returns {boolean}
     */
    isEmailDeliveredEvent(event) {
        return event.type === 'email_delivered_event';
    }

    /**
     * @param {Object} event
     * @returns {boolean}
     */
    isEmailFailedEvent(event) {
        return event.type === 'email_failed_event';
    }

    /**
     * @param {Object} event
     * @returns {boolean}
     */
    isEmailComplaintEvent(event) {
        return event.type === 'email_complaint_event';
    }

    /**
     * @param {Object} event
     * @returns {boolean}
     */
    isCommentEvent(event) {
        return event.type === 'comment_event';
    }

    /**
     * @param {Object} event
     * @returns {boolean}
     */
    isClickEvent(event) {
        return event.type === 'click_event' || event.type === 'aggregated_click_event';
    }

    /**
     * @param {Object} event
     * @returns {boolean}
     */
    isFeedbackEvent(event) {
        return event.type === 'feedback_event';
    }

    /**
     * @param {Object} event
     * @returns {string}
     */
    getFeedbackIcon(event) {
        if (event.data.score === 1) {
            return 'event-more-like-this';
        }
        return 'event-less-like-this';
    }

    /**
     * @param {Object} event
     * @returns {boolean}
     */
    isDonationEvent(event) {
        return event.type === 'donation_event';
    }

    /**
     * @param {Object} event
     * @returns {boolean}
     */
    isEmailChangeEvent(event) {
        return event.type === 'email_change_event';
    }

    getAction(event, hasMultipleNewsletters) {
        if (this.isSignupEvent(event)) {
            return 'signed up';
        }

        if (this.isLoginEvent(event)) {
            return 'logged in';
        }

        if (this.isPaymentEvent(event)) {
            return 'made payment';
        }

        if (this.isNewsletterEvent(event)) {
            return this.getNewsletterAction(event, hasMultipleNewsletters);
        }

        if (this.isSubscriptionEvent(event)) {
            return this.getSubscriptionAction(event);
        }

        if (this.isEmailOpenedEvent(event)) {
            return 'opened email';
        }

        if (this.isEmailSentEvent(event)) {
            return 'sent email';
        }

        if (this.isAutomatedEmailSentEvent(event)) {
            return this.getAutomatedEmailSentAction(event);
        }

        if (this.isEmailDeliveredEvent(event)) {
            return 'received email';
        }

        if (this.isEmailFailedEvent(event)) {
            return 'bounced email';
        }

        if (this.isEmailComplaintEvent(event)) {
            return 'email flagged as spam';
        }

        if (this.isCommentEvent(event)) {
            return this.getCommentAction(event);
        }

        if (this.isClickEvent(event)) {
            return this.getClickAction(event);
        }

        if (this.isFeedbackEvent(event)) {
            return this.getFeedbackAction(event);
        }

        if (this.isEmailChangeEvent(event)) {
            return this.getEmailChangeAction(event);
        }

        if (this.isDonationEvent(event)) {
            return 'Made a one-time payment';
        }
    }

    /**
     * @param {Object} event
     * @param {boolean} hasMultipleNewsletters
     * @returns {string}
     */
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

    /**
     * @param {Object} event
     * @returns {string}
     */
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

    /**
     * @param {Object} event
     * @returns {string}
     */
    getAutomatedEmailSentAction(event) {
        const slug = event.data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    /**
     * @param {Object} event
     * @returns {string}
     */
    getCommentAction(event) {
        if (event.data.parent) {
            return 'replied to comment';
        }
        return 'commented';
    }

    /**
     * @param {Object} event
     * @returns {string}
     */
    getClickAction(event) {
        if (event.type === 'click_event') {
            return 'clicked link in email';
        }
        const count = event.data.count?.clicks || 0;
        if (count <= 1) {
            return 'clicked link in email';
        }
        return `clicked ${ghPluralize(count, 'link')} in email`;
    }

    /**
     * @param {Object} event
     * @returns {string}
     */
    getFeedbackAction(event) {
        if (event.data.score === 1) {
            return 'more like this';
        }
        return 'less like this';
    }

    /**
     * @param {Object} event
     * @returns {string}
     */
    getEmailChangeAction(event) {
        if (event.data.from_email && event.data.to_email) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }
        return 'Email address changed';
    }

    /**
     * When we need to append the action and object in one sentence, you can add extra words here.
     * E.g.,
     *   action: 'Signed up'.
     *   object: 'My blog post'
     * When both words need to get appended, we'll add 'on'
     *  -> do this by returning 'on' in getJoin()
     * This string is not added when action and object are in a separate table column, or when the getObject/getURL is empty
     */
    getJoin() {
        return '–';
    }

    /**
     * Clickable object, shown between action and info, or in a separate column in some views
     */
    getObject(event) {
        if (this.isSignupEvent(event) || this.isSubscriptionEvent(event) || this.isDonationEvent(event)) {
            if (event.data.attribution?.title) {
                return event.data.attribution.title;
            }
        }

        if (this.isCommentEvent(event)) {
            if (event.data.post) {
                return event.data.post.title;
            }
        }

        if (this.isClickEvent(event) || this.isFeedbackEvent(event)) {
            if (event.data.post) {
                return event.data.post.title;
            }
        }

        return '';
    }

    /**
     * Clickable object, shown between action and info, or in a separate column in some views
     */
    getSource(event) {
        if (!event.data?.attribution?.referrer_source) {
            return null;
        }

        return {
            name: event.data.attribution.referrer_source,
            url: event.data.attribution.referrer_url ?? null
        };
    }

    getInfo(event) {
        if (!this.isSubscriptionEvent(event)) {
            return this.getInfoNonSubscription(event);
        }

        return this.getInfoSubscription(event);
    }

    /**
     * @param {Object} event
     * @returns {string|undefined}
     */
    getInfoSubscription(event) {
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

    /**
     * @param {Object} event
     * @returns {string|undefined}
     */
    getInfoNonSubscription(event) {
        if (this.isSignupEvent(event) && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }

        if (this.isDonationEvent(event)) {
            const symbol = getSymbol(event.data.currency);
            const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
            return formattedAmount;
        }

        return;
    }

    getDescription(event) {
        if (!this.isClickEvent(event)) {
            return;
        }

        try {
            return this.utils.cleanTrackedUrl(event.data.link.to, true);
        } catch (e) {
            // Invalid URL
        }
        return event.data.link.to;
    }

    /**
     * Make the object clickable
     */
    getURL(event) {
        if (this.isCommentEvent(event) || this.isClickEvent(event) || this.isFeedbackEvent(event)) {
            if (event.data.post) {
                return event.data.post.url;
            }
        }

        if (this.isSignupEvent(event) || this.isSubscriptionEvent(event) || this.isDonationEvent(event)) {
            if (event.data.attribution?.url) {
                return event.data.attribution.url;
            }
        }
        return;
    }

    /**
     * Get internal route props for a clickable object
     */
    getRoute(event) {
        if (this.isClickEvent(event) || this.isFeedbackEvent(event)) {
            if (event.data.post) {
                return {
                    name: 'posts-x',
                    model: event.data.post.id
                };
            }
        }

        if (this.isSignupEvent(event) || this.isSubscriptionEvent(event)) {
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