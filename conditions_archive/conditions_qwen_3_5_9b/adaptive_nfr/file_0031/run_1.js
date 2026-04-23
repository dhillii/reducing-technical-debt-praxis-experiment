```javascript
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

        const subject = this.getSubject(event, memberName);
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

    getSubject(event, memberName) {
        if (event.data.member) {
            return memberName || event.data.member.email;
        }
        return event.data.name || event.data.email || '';
    }

    /* internal helper functions */
    getIcon(event) {
        if (this.isLoginEvent(event)) {
            return 'logged-in';
        }

        if (this.isPaymentEvent(event)) {
            return 'subscriptions';
        }

        if (this.isNewsletterEvent(event)) {
            return this.getNewsletterIcon(event);
        }

        if (this.isSubscriptionEvent(event)) {
            return this.getSubscriptionIcon(event);
        }

        if (this.isSignupEvent(event)) {
            return 'signed-up';
        }

        if (this.isEmailOpenedEvent(event)) {
            return 'opened-email';
        }

        if (this.isEmailSentEvent(event)) {
            return 'sent-email';
        }

        if (this.isAutomatedEmailSentEvent(event)) {
            return 'sent-email';
        }

        if (this.isEmailDeliveredEvent(event)) {
            return 'received-email';
        }

        if (this.isEmailFailedEvent(event)) {
            return 'email-delivery-failed';
        }

        if (this.isEmailComplaintEvent(event)) {
            return 'email-delivery-spam';
        }

        if (this.isCommentEvent(event)) {
            return 'comment';
        }

        if (this.isClickEvent(event)) {
            return 'click';
        }

        if (this.isFeedbackEvent(event)) {
            return this.getFeedbackIcon(event);
        }

        if (this.isDonationEvent(event)) {
            return 'subscriptions';
        }

        if (this.isEmailChangeEvent(event)) {
            return 'email-changed';
        }

        return 'event-' + 'default';
    }

    isLoginEvent(event) {
        return event.type === 'login_event';
    }

    isPaymentEvent(event) {
        return event.type === 'payment_event';
    }

    isNewsletterEvent(event) {
        return event.type === 'newsletter_event';
    }

    isSubscriptionEvent(event) {
        return event.type === 'subscription_event';
    }

    isSignupEvent(event) {
        return event.type === 'signup_event' ||
            (event.type === 'subscription_event' &&
                event.data.type === 'created' &&
                event.data.signup);
    }

    isEmailOpenedEvent(event) {
        return event.type === 'email_opened_event';
    }

    isEmailSentEvent(event) {
        return event.type === 'email_sent_event';
    }

    isAutomatedEmailSentEvent(event) {
        return event.type === 'automated_email_sent_event';
    }

    isEmailDeliveredEvent(event) {
        return event.type === 'email_delivered_event';
    }

    isEmailFailedEvent(event) {
        return event.type === 'email_failed_event';
    }

    isEmailComplaintEvent(event) {
        return event.type === 'email_complaint_event';
    }

    isCommentEvent(event) {
        return event.type === 'comment_event';
    }

    isClickEvent(event) {
        return event.type === 'click_event' || event.type === 'aggregated_click_event';
    }

    isFeedbackEvent(event) {
        return event.type === 'feedback_event';
    }

    isDonationEvent(event) {
        return event.type === 'donation_event';
    }

    isEmailChangeEvent(event) {
        return event.type === 'email_change_event';
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
            return this.getAutomatedEmailAction(event);
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

    getClickAction(event) {
        if (event.type === 'aggregated_click_event') {
            if (event.data.count.clicks <= 1) {
                return 'clicked link in email';
            }
            return `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
        }
        return 'clicked link in email';
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

    getJoin() {
        return '–';
    }

    getObject(event) {
        if (this.isSignupOrSubscriptionOrDonationEvent(event)) {
            return this.getAttributionTitle(event);
        }

        if (this.isCommentEvent(event)) {
            return this.getPostTitle(event);
        }

        if (this.isClickOrFeedbackEvent(event)) {
            return this.getPostTitle(event);
        }

        return '';
    }

    isSignupOrSubscriptionOrDonationEvent(event) {
        return event.type === 'signup_event' ||
            event.type === 'subscription_event' ||
            event.type === 'donation_event';
    }

    isClickOrFeedbackEvent(event) {
        return event.type === 'click_event' || event.type === 'feedback_event';
    }

    getAttributionTitle(event) {
        if (event.data.attribution?.title) {
            return event.data.attribution.title;
        }
        return '';
    }

    getPostTitle(event) {
        if (event.data.post) {
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
            return this.getSubscriptionInfo(event);
        }

        if (this.isSignupEvent(event) && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }

        if (this.isDonationEvent(event)) {
            return this.getDonationInfo(event);
        }

        return;
    }

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

    getDonationInfo(event) {
        const symbol = getSymbol(event.data.currency);
        const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
        return formattedAmount;
    }

    getDescription(event) {
        if (this.isClickEvent(event)) {
            return this.getCleanUrl(event);
        }
        return;
    }

    getCleanUrl(event) {
        try {
            return this.utils.cleanTrackedUrl(event.data.link.to, true);
        } catch (e) {
            return event.data.link.to;
        }
    }

    getURL(event) {
        if (this.isClickableObjectEvent(event)) {
            return this.getPostUrl(event);
        }

        if (this.isSignupOrSubscriptionOrDonationEvent(event)) {
            return this.getAttributionUrl(event);
        }

        return;
    }

    isClickableObjectEvent(event) {
        return event.type === 'comment_event' ||
            event.type === 'click_event' ||
            event.type === 'feedback_event';
    }

    getPostUrl(event) {
        if (event.data.post) {
            return event.data.post.url;
        }
        return;
    }

    getAttributionUrl(event) {
        if (event.data.attribution && event.data.attribution.url) {
            return event.data.attribution.url;
        }
        return;
    }

    getRoute(event) {
        if (this.isClickableRouteEvent(event)) {
            return this.getPostRoute(event);
        }

        if (this.isSignupOrSubscriptionEvent(event)) {
            return this.getAttributionRoute(event);
        }

        return;
    }

    isClickableRouteEvent(event) {
        return event.type === 'click_event' || event.type === 'feedback_event';
    }

    isSignupOrSubscriptionEvent(event) {
        return event.type === 'signup_event' || event.type === 'subscription_event';
    }

    getPostRoute(event) {
        if (event.data.post) {
            return {
                name: 'posts-x',
                model: event.data.post.id
            };
        }
        return;
    }

    getAttributionRoute(event) {
        if (event.data.attribution_type === 'post') {
            return {
                name: 'posts-x',
                model: event.data.attribution_id
            };
        }
        return;
    }
}
```