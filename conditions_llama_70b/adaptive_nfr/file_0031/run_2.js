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

    /**
     * Returns the icon for the given event type.
     * @param {Object} event - The event object.
     * @returns {string} The icon for the event.
     */
    getIcon(event) {
        if (this.isLoginEvent(event)) return 'logged-in';
        if (this.isPaymentEvent(event)) return 'subscriptions';
        if (this.isNewsletterEvent(event)) return this.getNewsletterIcon(event);
        if (this.isSubscriptionEvent(event)) return this.getSubscriptionIcon(event);
        if (this.isSignupEvent(event)) return 'signed-up';
        if (this.isEmailOpenedEvent(event)) return 'opened-email';
        if (this.isEmailSentEvent(event)) return 'sent-email';
        if (this.isAutomatedEmailSentEvent(event)) return 'sent-email';
        if (this.isEmailDeliveredEvent(event)) return 'received-email';
        if (this.isEmailFailedEvent(event)) return 'email-delivery-failed';
        if (this.isEmailComplaintEvent(event)) return 'email-delivery-spam';
        if (this.isCommentEvent(event)) return 'comment';
        if (this.isClickEvent(event)) return 'click';
        if (this.isFeedbackEvent(event)) return this.getFeedbackIcon(event);
        if (this.isDonationEvent(event)) return 'subscriptions';
        if (this.isEmailChangeEvent(event)) return 'email-changed';
        return 'event-';
    }

    /**
     * Checks if the event is a login event.
     * @param {Object} event - The event object.
     * @returns {boolean} True if the event is a login event, false otherwise.
     */
    isLoginEvent(event) {
        return event.type === 'login_event';
    }

    /**
     * Checks if the event is a payment event.
     * @param {Object} event - The event object.
     * @returns {boolean} True if the event is a payment event, false otherwise.
     */
    isPaymentEvent(event) {
        return event.type === 'payment_event';
    }

    /**
     * Checks if the event is a newsletter event.
     * @param {Object} event - The event object.
     * @returns {boolean} True if the event is a newsletter event, false otherwise.
     */
    isNewsletterEvent(event) {
        return event.type === 'newsletter_event';
    }

    /**
     * Returns the icon for a newsletter event.
     * @param {Object} event - The event object.
     * @returns {string} The icon for the newsletter event.
     */
    getNewsletterIcon(event) {
        return event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
    }

    /**
     * Checks if the event is a subscription event.
     * @param {Object} event - The event object.
     * @returns {boolean} True if the event is a subscription event, false otherwise.
     */
    isSubscriptionEvent(event) {
        return event.type === 'subscription_event';
    }

    /**
     * Returns the icon for a subscription event.
     * @param {Object} event - The event object.
     * @returns {string} The icon for the subscription event.
     */
    getSubscriptionIcon(event) {
        if (event.data.type === 'canceled') return 'canceled-subscription';
        return 'subscriptions';
    }

    /**
     * Checks if the event is a signup event.
     * @param {Object} event - The event object.
     * @returns {boolean} True if the event is a signup event, false otherwise.
     */
    isSignupEvent(event) {
        return event.type === 'signup_event' || (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup);
    }

    /**
     * Checks if the event is an email opened event.
     * @param {Object} event - The event object.
     * @returns {boolean} True if the event is an email opened event, false otherwise.
     */
    isEmailOpenedEvent(event) {
        return event.type === 'email_opened_event';
    }

    /**
     * Checks if the event is an email sent event.
     * @param {Object} event - The event object.
     * @returns {boolean} True if the event is an email sent event, false otherwise.
     */
    isEmailSentEvent(event) {
        return event.type === 'email_sent_event';
    }

    /**
     * Checks if the event is an automated email sent event.
     * @param {Object} event - The event object.
     * @returns {boolean} True if the event is an automated email sent event, false otherwise.
     */
    isAutomatedEmailSentEvent(event) {
        return event.type === 'automated_email_sent_event';
    }

    /**
     * Checks if the event is an email delivered event.
     * @param {Object} event - The event object.
     * @returns {boolean} True if the event is an email delivered event, false otherwise.
     */
    isEmailDeliveredEvent(event) {
        return event.type === 'email_delivered_event';
    }

    /**
     * Checks if the event is an email failed event.
     * @param {Object} event - The event object.
     * @returns {boolean} True if the event is an email failed event, false otherwise.
     */
    isEmailFailedEvent(event) {
        return event.type === 'email_failed_event';
    }

    /**
     * Checks if the event is an email complaint event.
     * @param {Object} event - The event object.
     * @returns {boolean} True if the event is an email complaint event, false otherwise.
     */
    isEmailComplaintEvent(event) {
        return event.type === 'email_complaint_event';
    }

    /**
     * Checks if the event is a comment event.
     * @param {Object} event - The event object.
     * @returns {boolean} True if the event is a comment event, false otherwise.
     */
    isCommentEvent(event) {
        return event.type === 'comment_event';
    }

    /**
     * Checks if the event is a click event.
     * @param {Object} event - The event object.
     * @returns {boolean} True if the event is a click event, false otherwise.
     */
    isClickEvent(event) {
        return event.type === 'click_event' || event.type === 'aggregated_click_event';
    }

    /**
     * Checks if the event is a feedback event.
     * @param {Object} event - The event object.
     * @returns {boolean} True if the event is a feedback event, false otherwise.
     */
    isFeedbackEvent(event) {
        return event.type === 'feedback_event';
    }

    /**
     * Returns the icon for a feedback event.
     * @param {Object} event - The event object.
     * @returns {string} The icon for the feedback event.
     */
    getFeedbackIcon(event) {
        return event.data.score === 1 ? 'more-like-this' : 'less-like-this';
    }

    /**
     * Checks if the event is a donation event.
     * @param {Object} event - The event object.
     * @returns {boolean} True if the event is a donation event, false otherwise.
     */
    isDonationEvent(event) {
        return event.type === 'donation_event';
    }

    /**
     * Checks if the event is an email change event.
     * @param {Object} event - The event object.
     * @returns {boolean} True if the event is an email change event, false otherwise.
     */
    isEmailChangeEvent(event) {
        return event.type === 'email_change_event';
    }

    /**
     * Returns the action for the given event type.
     * @param {Object} event - The event object.
     * @param {boolean} hasMultipleNewsletters - Whether the member has multiple newsletters.
     * @returns {string} The action for the event.
     */
    getAction(event, hasMultipleNewsletters) {
        if (this.isSignupEvent(event)) return 'signed up';
        if (this.isLoginEvent(event)) return 'logged in';
        if (this.isPaymentEvent(event)) return 'made payment';
        if (this.isNewsletterEvent(event)) return this.getNewsletterAction(event, hasMultipleNewsletters);
        if (this.isSubscriptionEvent(event)) return this.getSubscriptionAction(event);
        if (this.isEmailOpenedEvent(event)) return 'opened email';
        if (this.isEmailSentEvent(event)) return 'sent email';
        if (this.isAutomatedEmailSentEvent(event)) return `received welcome email (${this.getAutomatedEmailType(event)})`;
        if (this.isEmailDeliveredEvent(event)) return 'received email';
        if (this.isEmailFailedEvent(event)) return 'bounced email';
        if (this.isEmailComplaintEvent(event)) return 'email flagged as spam';
        if (this.isCommentEvent(event)) return this.getCommentAction(event);
        if (this.isClickEvent(event)) return this.getClickAction(event);
        if (this.isFeedbackEvent(event)) return this.getFeedbackAction(event);
        if (this.isEmailChangeEvent(event)) return this.getEmailChangeAction(event);
        if (this.isDonationEvent(event)) return 'Made a one-time payment';
        return '';
    }

    /**
     * Returns the action for a newsletter event.
     * @param {Object} event - The event object.
     * @param {boolean} hasMultipleNewsletters - Whether the member has multiple newsletters.
     * @returns {string} The action for the newsletter event.
     */
    getNewsletterAction(event, hasMultipleNewsletters) {
        let newsletter = 'newsletter';
        if (hasMultipleNewsletters && event.data.newsletter && event.data.newsletter.name) {
            newsletter = event.data.newsletter.name;
        }

        if (event.data.subscribed) {
            return `subscribed to ${newsletter}`;
        } else {
            return `unsubscribed from ${newsletter}`;
        }
    }

    /**
     * Returns the action for a subscription event.
     * @param {Object} event - The event object.
     * @returns {string} The action for the subscription event.
     */
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

    /**
     * Returns the action for a comment event.
     * @param {Object} event - The event object.
     * @returns {string} The action for the comment event.
     */
    getCommentAction(event) {
        if (event.data.parent) {
            return 'replied to comment';
        }
        return 'commented';
    }

    /**
     * Returns the action for a click event.
     * @param {Object} event - The event object.
     * @returns {string} The action for the click event.
     */
    getClickAction(event) {
        if (event.data.count && event.data.count.clicks <= 1) {
            return 'clicked link in email';
        }
        return `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
    }

    /**
     * Returns the action for a feedback event.
     * @param {Object} event - The event object.
     * @returns {string} The action for the feedback event.
     */
    getFeedbackAction(event) {
        if (event.data.score === 1) {
            return 'more like this';
        }
        return 'less like this';
    }

    /**
     * Returns the action for an email change event.
     * @param {Object} event - The event object.
     * @returns {string} The action for the email change event.
     */
    getEmailChangeAction(event) {
        if (event.data.from_email && event.data.to_email) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }
        return 'Email address changed';
    }

    /**
     * Returns the type of automated email.
     * @param {Object} event - The event object.
     * @returns {string} The type of automated email.
     */
    getAutomatedEmailType(event) {
        const slug = event.data.automatedEmail?.slug || '';
        return slug.includes('paid') ? 'Paid' : 'Free';
    }

    /**
     * Returns the join string for the given event type.
     * @param {Object} event - The event object.
     * @returns {string} The join string for the event.
     */
    getJoin(event) {
        return '–';
    }

    /**
     * Returns the object for the given event type.
     * @param {Object} event - The event object.
     * @returns {string} The object for the event.
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
     * Returns the source for the given event type.
     * @param {Object} event - The event object.
     * @returns {Object|null} The source for the event.
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

    /**
     * Returns the info for the given event type.
     * @param {Object} event - The event object.
     * @returns {string|null} The info for the event.
     */
    getInfo(event) {
        if (this.isSubscriptionEvent(event)) {
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

    /**
     * Returns the description for the given event type.
     * @param {Object} event - The event object.
     * @returns {string|null} The description for the event.
     */
    getDescription(event) {
        if (this.isClickEvent(event)) {
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
     * Returns the URL for the given event type.
     * @param {Object} event - The event object.
     * @returns {string|null} The URL for the event.
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
     * Returns the route for the given event type.
     * @param {Object} event - The event object.
     * @returns {Object|null} The route for the event.
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
}