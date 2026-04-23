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

    /** @private */
    isSignupEvent(event) {
        return event.type === 'signup_event' || (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup);
    }

    /** @private */
    isNewsletterSubscribed(event) {
        return event.data.subscribed;
    }

    /** @private */
    isSubscriptionCanceled(event) {
        return event.type === 'subscription_event' && event.data.type === 'canceled';
    }

    /** @private */
    isFeedbackPositive(event) {
        return event.data.score === 1;
    }

    /** @private */
    getIconForNewsletterEvent(event) {
        return this.isNewsletterSubscribed(event) ? 'subscribed-to-email' : 'unsubscribed-from-email';
    }

    /** @private */
    getIconForSubscriptionEvent(event) {
        return this.isSubscriptionCanceled(event) ? 'canceled-subscription' : 'subscriptions';
    }

    /** @private */
    getIconForFeedbackEvent(event) {
        return this.isFeedbackPositive(event) ? 'more-like-this' : 'less-like-this';
    }

    getIcon(event) {
        const iconMap = {
            'login_event': 'logged-in',
            'payment_event': 'subscriptions',
            'email_opened_event': 'opened-email',
            'email_sent_event': 'sent-email',
            'automated_email_sent_event': 'sent-email',
            'email_delivered_event': 'received-email',
            'email_failed_event': 'email-delivery-failed',
            'email_complaint_event': 'email-delivery-spam',
            'comment_event': 'comment',
            'donation_event': 'subscriptions',
            'email_change_event': 'email-changed'
        };

        if (iconMap[event.type]) {
            return 'event-' + iconMap[event.type];
        }

        if (event.type === 'newsletter_event') {
            return 'event-' + this.getIconForNewsletterEvent(event);
        }

        if (event.type === 'subscription_event') {
            return 'event-' + this.getIconForSubscriptionEvent(event);
        }

        if (this.isSignupEvent(event)) {
            return 'event-signed-up';
        }

        if (event.type === 'click_event' || event.type === 'aggregated_click_event') {
            return 'event-click';
        }

        if (event.type === 'feedback_event') {
            return 'event-' + this.getIconForFeedbackEvent(event);
        }

        return 'event-unknown';
    }

    /** @private */
    getActionForNewsletterEvent(event, hasMultipleNewsletters) {
        let newsletter = 'newsletter';
        if (hasMultipleNewsletters && event.data.newsletter && event.data.newsletter.name) {
            newsletter = event.data.newsletter.name;
        }
        return this.isNewsletterSubscribed(event) ? `subscribed to ${newsletter}` : `unsubscribed from ${newsletter}`;
    }

    /** @private */
    getActionForSubscriptionEvent(event) {
        const typeActions = {
            'created': 'started paid subscription',
            'updated': 'changed paid subscription',
            'canceled': 'canceled paid subscription',
            'reactivated': 'reactivated paid subscription',
            'expired': 'ended paid subscription'
        };
        return typeActions[event.data.type] || 'changed paid subscription';
    }

    /** @private */
    getActionForCommentEvent(event) {
        return event.data.parent ? 'replied to comment' : 'commented';
    }

    /** @private */
    getActionForAggregatedClickEvent(event) {
        if (event.data.count.clicks <= 1) {
            return 'clicked link in email';
        }
        return `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
    }

    /** @private */
    getActionForFeedbackEvent(event) {
        return this.isFeedbackPositive(event) ? 'more like this' : 'less like this';
    }

    /** @private */
    getActionForEmailChangeEvent(event) {
        if (event.data.from_email && event.data.to_email) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }
        return 'Email address changed';
    }

    /** @private */
    getActionForAutomatedEmailEvent(event) {
        const slug = event.data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    getAction(event, hasMultipleNewsletters) {
        if (this.isSignupEvent(event)) {
            return 'signed up';
        }

        const actionMap = {
            'login_event': 'logged in',
            'payment_event': 'made payment',
            'email_opened_event': 'opened email',
            'email_sent_event': 'sent email',
            'email_delivered_event': 'received email',
            'email_failed_event': 'bounced email',
            'email_complaint_event': 'email flagged as spam',
            'click_event': 'clicked link in email',
            'donation_event': 'Made a one-time payment'
        };

        if (actionMap[event.type]) {
            return actionMap[event.type];
        }

        if (event.type === 'newsletter_event') {
            return this.getActionForNewsletterEvent(event, hasMultipleNewsletters);
        }

        if (event.type === 'subscription_event') {
            return this.getActionForSubscriptionEvent(event);
        }

        if (event.type === 'automated_email_sent_event') {
            return this.getActionForAutomatedEmailEvent(event);
        }

        if (event.type === 'comment_event') {
            return this.getActionForCommentEvent(event);
        }

        if (event.type === 'aggregated_click_event') {
            return this.getActionForAggregatedClickEvent(event);
        }

        if (event.type === 'feedback_event') {
            return this.getActionForFeedbackEvent(event);
        }

        if (event.type === 'email_change_event') {
            return this.getActionForEmailChangeEvent(event);
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

    /** @private */
    hasAttributionTitle(event) {
        return event.data.attribution?.title;
    }

    /** @private */
    hasPostTitle(event) {
        return event.data.post?.title;
    }

    /**
     * Clickable object, shown between action and info, or in a separate column in some views
     */
    getObject(event) {
        const objectEventTypes = ['signup_event', 'subscription_event', 'donation_event'];
        if (objectEventTypes.includes(event.type) && this.hasAttributionTitle(event)) {
            return event.data.attribution.title;
        }

        const postEventTypes = ['comment_event', 'click_event', 'feedback_event'];
        if (postEventTypes.includes(event.type) && this.hasPostTitle(event)) {
            return event.data.post.title;
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

    /** @private */
    getInfoForSubscriptionEvent(event) {
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

    /** @private */
    getInfoForDonationEvent(event) {
        const symbol = getSymbol(event.data.currency);
        const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
        return formattedAmount;
    }

    getInfo(event) {
        if (event.type === 'subscription_event') {
            return this.getInfoForSubscriptionEvent(event);
        }

        if (event.type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }

        if (event.type === 'donation_event') {
            return this.getInfoForDonationEvent(event);
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
        const postEventTypes = ['comment_event', 'click_event', 'feedback_event'];
        if (postEventTypes.includes(event.type) && event.data.post) {
            return event.data.post.url;
        }

        const attributionEventTypes = ['signup_event', 'subscription_event', 'donation_event'];
        if (attributionEventTypes.includes(event.type) && event.data.attribution && event.data.attribution.url) {
            return event.data.attribution.url;
        }
        return;
    }

    /**
     * Get internal route props for a clickable object
     */
    getRoute(event) {
        const feedbackEventTypes = ['click_event', 'feedback_event'];
        if (feedbackEventTypes.includes(event.type) && event.data.post) {
            return {
                name: 'posts-x',
                model: event.data.post.id
            };
        }

        const signupEventTypes = ['signup_event', 'subscription_event'];
        if (signupEventTypes.includes(event.type) && event.data.attribution_type === 'post') {
            return {
                name: 'posts-x',
                model: event.data.attribution_id
            };
        }
        return;
    }
}