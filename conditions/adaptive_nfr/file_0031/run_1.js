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
    isClickEvent(event) {
        return event.type === 'click_event' || event.type === 'aggregated_click_event';
    }

    /** @private */
    isFeedbackPositive(event) {
        return event.data.score === 1;
    }

    /** @private */
    hasCommentParent(event) {
        return event.data.parent;
    }

    /** @private */
    hasEmailChangeData(event) {
        return event.data.from_email && event.data.to_email;
    }

    getIcon(event) {
        if (event.type === 'login_event') {
            return 'event-logged-in';
        }

        if (event.type === 'payment_event') {
            return 'event-subscriptions';
        }

        if (event.type === 'newsletter_event') {
            return this.isNewsletterSubscribed(event) ? 'event-subscribed-to-email' : 'event-unsubscribed-from-email';
        }

        if (event.type === 'subscription_event') {
            return this.isSubscriptionCanceled(event) ? 'event-canceled-subscription' : 'event-subscriptions';
        }

        if (this.isSignupEvent(event)) {
            return 'event-signed-up';
        }

        if (event.type === 'email_opened_event') {
            return 'event-opened-email';
        }

        if (event.type === 'email_sent_event') {
            return 'event-sent-email';
        }

        if (event.type === 'automated_email_sent_event') {
            return 'event-sent-email';
        }

        if (event.type === 'email_delivered_event') {
            return 'event-received-email';
        }

        if (event.type === 'email_failed_event') {
            return 'event-email-delivery-failed';
        }

        if (event.type === 'email_complaint_event') {
            return 'event-email-delivery-spam';
        }

        if (event.type === 'comment_event') {
            return 'event-comment';
        }

        if (this.isClickEvent(event)) {
            return 'event-click';
        }

        if (event.type === 'feedback_event') {
            return this.isFeedbackPositive(event) ? 'event-more-like-this' : 'event-less-like-this';
        }

        if (event.type === 'donation_event') {
            return 'event-subscriptions';
        }

        if (event.type === 'email_change_event') {
            return 'event-email-changed';
        }

        return 'event-unknown';
    }

    /** @private */
    getNewsletterName(event, hasMultipleNewsletters) {
        if (hasMultipleNewsletters && event.data.newsletter && event.data.newsletter.name) {
            return event.data.newsletter.name;
        }
        return 'newsletter';
    }

    /** @private */
    getNewsletterAction(event, hasMultipleNewsletters) {
        const newsletter = this.getNewsletterName(event, hasMultipleNewsletters);
        return this.isNewsletterSubscribed(event) ? `subscribed to ${newsletter}` : `unsubscribed from ${newsletter}`;
    }

    /** @private */
    getSubscriptionAction(event) {
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
    getAutomatedEmailAction(event) {
        const slug = event.data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    /** @private */
    getCommentAction(event) {
        return this.hasCommentParent(event) ? 'replied to comment' : 'commented';
    }

    /** @private */
    getAggregatedClickAction(event) {
        if (event.data.count.clicks <= 1) {
            return 'clicked link in email';
        }
        return `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
    }

    /** @private */
    getFeedbackAction(event) {
        return this.isFeedbackPositive(event) ? 'more like this' : 'less like this';
    }

    /** @private */
    getEmailChangeAction(event) {
        if (this.hasEmailChangeData(event)) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }
        return 'Email address changed';
    }

    getAction(event, hasMultipleNewsletters) {
        if (this.isSignupEvent(event)) {
            return 'signed up';
        }

        if (event.type === 'login_event') {
            return 'logged in';
        }

        if (event.type === 'payment_event') {
            return 'made payment';
        }

        if (event.type === 'newsletter_event') {
            return this.getNewsletterAction(event, hasMultipleNewsletters);
        }

        if (event.type === 'subscription_event') {
            return this.getSubscriptionAction(event);
        }

        if (event.type === 'email_opened_event') {
            return 'opened email';
        }

        if (event.type === 'email_sent_event') {
            return 'sent email';
        }

        if (event.type === 'automated_email_sent_event') {
            return this.getAutomatedEmailAction(event);
        }

        if (event.type === 'email_delivered_event') {
            return 'received email';
        }

        if (event.type === 'email_failed_event') {
            return 'bounced email';
        }

        if (event.type === 'email_complaint_event') {
            return 'email flagged as spam';
        }

        if (event.type === 'comment_event') {
            return this.getCommentAction(event);
        }

        if (event.type === 'click_event') {
            return 'clicked link in email';
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
            return 'Made a one-time payment';
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

    /** @private */
    isObjectTypeWithAttribution(event) {
        return event.type === 'signup_event' || event.type === 'subscription_event' || event.type === 'donation_event';
    }

    /** @private */
    isObjectTypeWithPost(event) {
        return event.type === 'comment_event' || event.type === 'click_event' || event.type === 'feedback_event';
    }

    /**
     * Clickable object, shown between action and info, or in a separate column in some views
     */
    getObject(event) {
        if (this.isObjectTypeWithAttribution(event)) {
            if (this.hasAttributionTitle(event)) {
                return event.data.attribution.title;
            }
        }

        if (this.isObjectTypeWithPost(event)) {
            if (this.hasPostTitle(event)) {
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

    /** @private */
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

    /** @private */
    getDonationInfo(event) {
        const symbol = getSymbol(event.data.currency);
        const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
        return formattedAmount;
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

    /** @private */
    hasPostUrl(event) {
        return event.data.post?.url;
    }

    /** @private */
    hasAttributionUrl(event) {
        return event.data.attribution?.url;
    }

    /** @private */
    isUrlTypeWithPost(event) {
        return event.type === 'comment_event' || event.type === 'click_event' || event.type === 'feedback_event';
    }

    /** @private */
    isUrlTypeWithAttribution(event) {
        return event.type === 'signup_event' || event.type === 'subscription_event' || event.type === 'donation_event';
    }

    /**
     * Make the object clickable
     */
    getURL(event) {
        if (this.isUrlTypeWithPost(event)) {
            if (this.hasPostUrl(event)) {
                return event.data.post.url;
            }
        }

        if (this.isUrlTypeWithAttribution(event)) {
            if (this.hasAttributionUrl(event)) {
                return event.data.attribution.url;
            }
        }
        return;
    }

    /** @private */
    hasPostRoute(event) {
        return event.data.post?.id;
    }

    /** @private */
    isRouteTypeWithPost(event) {
        return event.type === 'click_event' || event.type === 'feedback_event';
    }

    /** @private */
    isRouteTypeWithAttribution(event) {
        return event.type === 'signup_event' || event.type === 'subscription_event';
    }

    /** @private */
    isAttributionPost(event) {
        return event.data.attribution_type === 'post';
    }

    /**
     * Get internal route props for a clickable object
     */
    getRoute(event) {
        if (this.isRouteTypeWithPost(event)) {
            if (this.hasPostRoute(event)) {
                return {
                    name: 'posts-x',
                    model: event.data.post.id
                };
            }
        }

        if (this.isRouteTypeWithAttribution(event)) {
            if (this.isAttributionPost(event)) {
                return {
                    name: 'posts-x',
                    model: event.data.attribution_id
                };
            }
        }
        return;
    }
}