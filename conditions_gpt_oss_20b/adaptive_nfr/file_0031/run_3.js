import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject as service} from '@ember/service';

export default class ParseMemberEventHelper extends Helper {
    @service feature;
    @service utils;
    @service membersUtils;

    /**
     * Trim a string value, returning null for empty or whitespace-only strings.
     * @param {any} value
     * @returns {string|null}
     */
    trimString(value) {
        if (!value && value !== 0) {
            return null;
        }
        const trimmed = String(value).trim();
        return trimmed || null;
    }

    /**
     * Main entry point for the helper.
     * @param {[any, boolean]} args
     * @returns {object}
     */
    compute([event, hasMultipleNewsletters]) {
        const memberName = this.trimString(event.data.member?.name);
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
     * Determine the icon for an event.
     * @param {object} event
     * @returns {string}
     */
    getIcon(event) {
        if (this.isLoginEvent(event)) {
            return 'event-logged-in';
        }
        if (this.isPaymentEvent(event)) {
            return 'event-subscriptions';
        }
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
        if (this.isSignupOrSubscriptionCreatedWithSignup(event)) {
            return 'event-signed-up';
        }
        if (this.isEmailOpenedEvent(event)) {
            return 'event-opened-email';
        }
        if (this.isEmailSentEvent(event) || this.isAutomatedEmailSentEvent(event)) {
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
        if (this.isClickEvent(event) || this.isAggregatedClickEvent(event)) {
            return 'event-click';
        }
        if (this.isFeedbackEvent(event)) {
            return event.data.score === 1
                ? 'event-more-like-this'
                : 'event-less-like-this';
        }
        if (this.isDonationEvent(event)) {
            return 'event-subscriptions';
        }
        if (this.isEmailChangeEvent(event)) {
            return 'event-email-changed';
        }
        return 'event-unknown';
    }

    /**
     * Determine the action text for an event.
     * @param {object} event
     * @param {boolean} hasMultipleNewsletters
     * @returns {string}
     */
    getAction(event, hasMultipleNewsletters) {
        if (this.isSignupOrSubscriptionCreatedWithSignup(event)) {
            return 'signed up';
        }
        if (this.isLoginEvent(event)) {
            return 'logged in';
        }
        if (this.isPaymentEvent(event)) {
            return 'made payment';
        }
        if (this.isNewsletterEvent(event)) {
            const newsletter = hasMultipleNewsletters && event.data.newsletter?.name
                ? event.data.newsletter.name
                : 'newsletter';
            return event.data.subscribed
                ? `subscribed to ${newsletter}`
                : `unsubscribed from ${newsletter}`;
        }
        if (this.isSubscriptionEvent(event)) {
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
        if (this.isEmailOpenedEvent(event)) {
            return 'opened email';
        }
        if (this.isEmailSentEvent(event)) {
            return 'sent email';
        }
        if (this.isAutomatedEmailSentEvent(event)) {
            const slug = event.data.automatedEmail?.slug || '';
            const emailType = slug.includes('paid') ? 'Paid' : 'Free';
            return `received welcome email (${emailType})`;
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
            return event.data.parent ? 'replied to comment' : 'commented';
        }
        if (this.isClickEvent(event)) {
            return 'clicked link in email';
        }
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
        if (this.isDonationEvent(event)) {
            return 'Made a one-time payment';
        }
        return '';
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
        if (this.isCommentEvent(event) && event.data.post) {
            return event.data.post.title;
        }
        if ((this.isClickEvent(event) || this.isFeedbackEvent(event)) && event.data.post) {
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

    getInfo(event) {
        if (this.isSubscriptionEvent(event)) {
            const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
            if (mrrDelta === 0) {
                return;
            }
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
            const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
            return formattedAmount;
        }
        return;
    }

    getDescription(event) {
        if (this.isClickEvent(event)) {
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
            if (event.data.post) {
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

    /* Predicate helpers */

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
        return event.type === 'signup_event';
    }

    isSignupOrSubscriptionCreatedWithSignup(event) {
        return this.isSignupEvent(event) ||
            (this.isSubscriptionEvent(event) &&
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
        return event.type === 'click_event';
    }

    isAggregatedClickEvent(event) {
        return event.type === 'aggregated_click_event';
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
}