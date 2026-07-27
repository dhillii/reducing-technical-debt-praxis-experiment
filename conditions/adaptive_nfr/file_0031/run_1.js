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

    /** @private Determines if event is a signup event */
    isSignupEvent(event) {
        return event.type === 'signup_event' || (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup);
    }

    /** @private Determines if event is a click event */
    isClickEvent(event) {
        return event.type === 'click_event' || event.type === 'aggregated_click_event';
    }

    /** @private Gets icon for login event */
    getLoginIcon() {
        return 'logged-in';
    }

    /** @private Gets icon for payment event */
    getPaymentIcon() {
        return 'subscriptions';
    }

    /** @private Gets icon for newsletter event */
    getNewsletterIcon(event) {
        return event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
    }

    /** @private Gets icon for subscription event */
    getSubscriptionIcon(event) {
        if (event.data.type === 'canceled') {
            return 'canceled-subscription';
        }
        return 'subscriptions';
    }

    /** @private Gets icon for email opened event */
    getEmailOpenedIcon() {
        return 'opened-email';
    }

    /** @private Gets icon for email sent event */
    getEmailSentIcon() {
        return 'sent-email';
    }

    /** @private Gets icon for email delivered event */
    getEmailDeliveredIcon() {
        return 'received-email';
    }

    /** @private Gets icon for email failed event */
    getEmailFailedIcon() {
        return 'email-delivery-failed';
    }

    /** @private Gets icon for email complaint event */
    getEmailComplaintIcon() {
        return 'email-delivery-spam';
    }

    /** @private Gets icon for comment event */
    getCommentIcon() {
        return 'comment';
    }

    /** @private Gets icon for feedback event */
    getFeedbackIcon(event) {
        return event.data.score === 1 ? 'more-like-this' : 'less-like-this';
    }

    /** @private Gets icon for donation event */
    getDonationIcon() {
        return 'subscriptions';
    }

    /** @private Gets icon for email change event */
    getEmailChangeIcon() {
        return 'email-changed';
    }

    getIcon(event) {
        let icon;

        if (event.type === 'login_event') {
            icon = this.getLoginIcon();
        } else if (event.type === 'payment_event') {
            icon = this.getPaymentIcon();
        } else if (event.type === 'newsletter_event') {
            icon = this.getNewsletterIcon(event);
        } else if (event.type === 'subscription_event') {
            icon = this.getSubscriptionIcon(event);
        } else if (this.isSignupEvent(event)) {
            icon = 'signed-up';
        } else if (event.type === 'email_opened_event') {
            icon = this.getEmailOpenedIcon();
        } else if (event.type === 'email_sent_event') {
            icon = this.getEmailSentIcon();
        } else if (event.type === 'automated_email_sent_event') {
            icon = this.getEmailSentIcon();
        } else if (event.type === 'email_delivered_event') {
            icon = this.getEmailDeliveredIcon();
        } else if (event.type === 'email_failed_event') {
            icon = this.getEmailFailedIcon();
        } else if (event.type === 'email_complaint_event') {
            icon = this.getEmailComplaintIcon();
        } else if (event.type === 'comment_event') {
            icon = this.getCommentIcon();
        } else if (this.isClickEvent(event)) {
            icon = 'click';
        } else if (event.type === 'feedback_event') {
            icon = this.getFeedbackIcon(event);
        } else if (event.type === 'donation_event') {
            icon = this.getDonationIcon();
        } else if (event.type === 'email_change_event') {
            icon = this.getEmailChangeIcon();
        }

        return 'event-' + icon;
    }

    /** @private Gets action for signup event */
    getSignupAction() {
        return 'signed up';
    }

    /** @private Gets action for login event */
    getLoginAction() {
        return 'logged in';
    }

    /** @private Gets action for payment event */
    getPaymentAction() {
        return 'made payment';
    }

    /** @private Gets action for newsletter event */
    getNewsletterAction(event, hasMultipleNewsletters) {
        let newsletter = 'newsletter';
        if (hasMultipleNewsletters && event.data.newsletter && event.data.newsletter.name) {
            newsletter = event.data.newsletter.name;
        }
        return event.data.subscribed ? `subscribed to ${newsletter}` : `unsubscribed from ${newsletter}`;
    }

    /** @private Gets action for subscription event */
    getSubscriptionAction(event) {
        if (event.data.type === 'created') {
            return 'started paid subscription';
        }
        if (event.data.type === 'updated') {
            return 'changed paid subscription';
        }
        if (event.data.type === 'canceled') {
            return 'canceled paid subscription';
        }
        if (event.data.type === 'reactivated') {
            return 'reactivated paid subscription';
        }
        if (event.data.type === 'expired') {
            return 'ended paid subscription';
        }
        return 'changed paid subscription';
    }

    /** @private Gets action for email opened event */
    getEmailOpenedAction() {
        return 'opened email';
    }

    /** @private Gets action for email sent event */
    getEmailSentAction() {
        return 'sent email';
    }

    /** @private Gets action for automated email sent event */
    getAutomatedEmailSentAction(event) {
        const slug = event.data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    /** @private Gets action for email delivered event */
    getEmailDeliveredAction() {
        return 'received email';
    }

    /** @private Gets action for email failed event */
    getEmailFailedAction() {
        return 'bounced email';
    }

    /** @private Gets action for email complaint event */
    getEmailComplaintAction() {
        return 'email flagged as spam';
    }

    /** @private Gets action for comment event */
    getCommentAction(event) {
        return event.data.parent ? 'replied to comment' : 'commented';
    }

    /** @private Gets action for click event */
    getClickAction() {
        return 'clicked link in email';
    }

    /** @private Gets action for aggregated click event */
    getAggregatedClickAction(event) {
        if (event.data.count.clicks <= 1) {
            return 'clicked link in email';
        }
        return `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
    }

    /** @private Gets action for feedback event */
    getFeedbackAction(event) {
        return event.data.score === 1 ? 'more like this' : 'less like this';
    }

    /** @private Gets action for email change event */
    getEmailChangeAction(event) {
        if (event.data.from_email && event.data.to_email) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }
        return 'Email address changed';
    }

    /** @private Gets action for donation event */
    getDonationAction() {
        return 'Made a one-time payment';
    }

    getAction(event, hasMultipleNewsletters) {
        if (this.isSignupEvent(event)) {
            return this.getSignupAction();
        }
        if (event.type === 'login_event') {
            return this.getLoginAction();
        }
        if (event.type === 'payment_event') {
            return this.getPaymentAction();
        }
        if (event.type === 'newsletter_event') {
            return this.getNewsletterAction(event, hasMultipleNewsletters);
        }
        if (event.type === 'subscription_event') {
            return this.getSubscriptionAction(event);
        }
        if (event.type === 'email_opened_event') {
            return this.getEmailOpenedAction();
        }
        if (event.type === 'email_sent_event') {
            return this.getEmailSentAction();
        }
        if (event.type === 'automated_email_sent_event') {
            return this.getAutomatedEmailSentAction(event);
        }
        if (event.type === 'email_delivered_event') {
            return this.getEmailDeliveredAction();
        }
        if (event.type === 'email_failed_event') {
            return this.getEmailFailedAction();
        }
        if (event.type === 'email_complaint_event') {
            return this.getEmailComplaintAction();
        }
        if (event.type === 'comment_event') {
            return this.getCommentAction(event);
        }
        if (event.type === 'click_event') {
            return this.getClickAction();
        }
        if (event.type === 'aggregated_click_event') {
            return this.getAggregatedClickAction(event);
        }
        if (event.type === 'feedback_event') {
            return this.getFeedbackAction(event);
        }
        if (event.type === 'email_change_event') {
            return this.getEmailChangeAction(event);
        }
        if (event.type === 'donation_event') {
            return this.getDonationAction();
        }
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

    /** @private Determines if event has attribution title */
    hasAttributionTitle(event) {
        return event.data.attribution?.title;
    }

    /** @private Determines if event has post */
    hasPost(event) {
        return event.data.post;
    }

    /**
     * Clickable object, shown between action and info, or in a separate column in some views
     */
    getObject(event) {
        if (event.type === 'signup_event' || event.type === 'subscription_event' || event.type === 'donation_event') {
            if (this.hasAttributionTitle(event)) {
                return event.data.attribution.title;
            }
        }

        if (event.type === 'comment_event') {
            if (this.hasPost(event)) {
                return event.data.post.title;
            }
        }

        if (event.type === 'click_event' || event.type === 'feedback_event') {
            if (this.hasPost(event)) {
                return event.data.post.title;
            }
        }

        return '';
    }

    /**
     * Clickable object, shown between action and info, or in a separate column in some views
     */
    getSource(event) {
        if (event.data?.attribution?.referrer_source) {
            return {
                name: event.data.attribution.referrer_source,
                url: event.data.attribution.referrer_url ?? null
            };
        }

        return null;
    }

    /** @private Gets info for subscription event */
    getSubscriptionInfo(event) {
        let mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
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

    /** @private Gets info for signup event */
    getSignupInfo() {
        if (this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }
    }

    /** @private Gets info for donation event */
    getDonationInfo(event) {
        const symbol = getSymbol(event.data.currency);
        const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
        return formattedAmount;
    }

    getInfo(event) {
        if (event.type === 'subscription_event') {
            return this.getSubscriptionInfo(event);
        }

        if (event.type === 'signup_event') {
            return this.getSignupInfo();
        }

        if (event.type === 'donation_event') {
            return this.getDonationInfo(event);
        }

        return;
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

    /**
     * Make the object clickable
     */
    getURL(event) {
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type)) {
            if (this.hasPost(event)) {
                return event.data.post.url;
            }
        }

        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type)) {
            if (event.data.attribution && event.data.attribution.url) {
                return event.data.attribution.url;
            }
        }
        return;
    }

    /**
     * Get internal route props for a clickable object
     */
    getRoute(event) {
        if (['click_event', 'feedback_event'].includes(event.type)) {
            if (this.hasPost(event)) {
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