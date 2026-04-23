import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject as service} from '@ember/service';

/**
 * Predicate: checks if the event is a login event.
 * @param {Object} event
 * @returns {boolean}
 */
function isLoginEvent(event) {
    return event.type === 'login_event';
}

/**
 * Predicate: checks if the event is a payment event.
 * @param {Object} event
 * @returns {boolean}
 */
function isPaymentEvent(event) {
    return event.type === 'payment_event';
}

/**
 * Predicate: checks if the event is a newsletter event.
 * @param {Object} event
 * @returns {boolean}
 */
function isNewsletterEvent(event) {
    return event.type === 'newsletter_event';
}

/**
 * Predicate: checks if the event is a subscription event.
 * @param {Object} event
 * @returns {boolean}
 */
function isSubscriptionEvent(event) {
    return event.type === 'subscription_event';
}

/**
 * Predicate: checks if the event is a signup event or a created subscription with signup flag.
 * @param {Object} event
 * @returns {boolean}
 */
function isSignupOrCreatedSubscription(event) {
    return event.type === 'signup_event' ||
        (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup);
}

/**
 * Predicate: checks if the event is an email opened event.
 * @param {Object} event
 * @returns {boolean}
 */
function isEmailOpenedEvent(event) {
    return event.type === 'email_opened_event';
}

/**
 * Predicate: checks if the event is an email sent event.
 * @param {Object} event
 * @returns {boolean}
 */
function isEmailSentEvent(event) {
    return event.type === 'email_sent_event';
}

/**
 * Predicate: checks if the event is an automated email sent event.
 * @param {Object} event
 * @returns {boolean}
 */
function isAutomatedEmailSentEvent(event) {
    return event.type === 'automated_email_sent_event';
}

/**
 * Predicate: checks if the event is an email delivered event.
 * @param {Object} event
 * @returns {boolean}
 */
function isEmailDeliveredEvent(event) {
    return event.type === 'email_delivered_event';
}

/**
 * Predicate: checks if the event is an email failed event.
 * @param {Object} event
 * @returns {boolean}
 */
function isEmailFailedEvent(event) {
    return event.type === 'email_failed_event';
}

/**
 * Predicate: checks if the event is an email complaint event.
 * @param {Object} event
 * @returns {boolean}
 */
function isEmailComplaintEvent(event) {
    return event.type === 'email_complaint_event';
}

/**
 * Predicate: checks if the event is a comment event.
 * @param {Object} event
 * @returns {boolean}
 */
function isCommentEvent(event) {
    return event.type === 'comment_event';
}

/**
 * Predicate: checks if the event is a click or aggregated click event.
 * @param {Object} event
 * @returns {boolean}
 */
function isClickEvent(event) {
    return event.type === 'click_event' || event.type === 'aggregated_click_event';
}

/**
 * Predicate: checks if the event is a feedback event.
 * @param {Object} event
 * @returns {boolean}
 */
function isFeedbackEvent(event) {
    return event.type === 'feedback_event';
}

/**
 * Predicate: checks if the event is a donation event.
 * @param {Object} event
 * @returns {boolean}
 */
function isDonationEvent(event) {
    return event.type === 'donation_event';
}

/**
 * Predicate: checks if the event is an email change event.
 * @param {Object} event
 * @returns {boolean}
 */
function isEmailChangeEvent(event) {
    return event.type === 'email_change_event';
}

/**
 * Predicate: checks if the event is a subscription cancellation.
 * @param {Object} event
 * @returns {boolean}
 */
function isSubscriptionCanceled(event) {
    return isSubscriptionEvent(event) && event.data.type === 'canceled';
}

/**
 * Predicate: checks if the event is a subscription created.
 * @param {Object} event
 * @returns {boolean}
 */
function isSubscriptionCreated(event) {
    return isSubscriptionEvent(event) && event.data.type === 'created';
}

/**
 * Predicate: checks if the event is a subscription updated.
 * @param {Object} event
 * @returns {boolean}
 */
function isSubscriptionUpdated(event) {
    return isSubscriptionEvent(event) && event.data.type === 'updated';
}

/**
 * Predicate: checks if the event is a subscription reactivated.
 * @param {Object} event
 * @returns {boolean}
 */
function isSubscriptionReactivated(event) {
    return isSubscriptionEvent(event) && event.data.type === 'reactivated';
}

/**
 * Predicate: checks if the event is a subscription expired.
 * @param {Object} event
 * @returns {boolean}
 */
function isSubscriptionExpired(event) {
    return isSubscriptionEvent(event) && event.data.type === 'expired';
}

/**
 * Predicate: checks if the event is a comment reply.
 * @param {Object} event
 * @returns {boolean}
 */
function isCommentReply(event) {
    return isCommentEvent(event) && !!event.data.parent;
}

/**
 * Predicate: checks if the event is a click with multiple clicks.
 * @param {Object} event
 * @returns {boolean}
 */
function isAggregatedClickMultiple(event) {
    return event.type === 'aggregated_click_event' && event.data.count.clicks > 1;
}

/**
 * Predicate: checks if the event is a feedback positive.
 * @param {Object} event
 * @returns {boolean}
 */
function isFeedbackPositive(event) {
    return isFeedbackEvent(event) && event.data.score === 1;
}

/**
 * Predicate: checks if the event has attribution title.
 * @param {Object} event
 * @returns {boolean}
 */
function hasAttributionTitle(event) {
    return !!event.data.attribution?.title;
}

/**
 * Predicate: checks if the event has post data.
 * @param {Object} event
 * @returns {boolean}
 */
function hasPost(event) {
    return !!event.data.post;
}

/**
 * Predicate: checks if the event has attribution URL.
 * @param {Object} event
 * @returns {boolean}
 */
function hasAttributionUrl(event) {
    return !!event.data.attribution?.url;
}

/**
 * Predicate: checks if the event has attribution source.
 * @param {Object} event
 * @returns {boolean}
 */
function hasAttributionSource(event) {
    return !!event.data?.attribution?.referrer_source;
}

/**
 * Predicate: checks if the event has email change data.
 * @param {Object} event
 * @returns {boolean}
 */
function hasEmailChangeData(event) {
    return !!event.data.from_email && !!event.data.to_email;
}

/**
 * Predicate: checks if the event is a signup event.
 * @param {Object} event
 * @returns {boolean}
 */
function isSignupEvent(event) {
    return event.type === 'signup_event';
}

/**
 * Predicate: checks if the event is a subscription created with signup flag.
 * @param {Object} event
 * @returns {boolean}
 */
function isCreatedSubscriptionWithSignup(event) {
    return event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup;
}

/**
 * Predicate: checks if the event is a newsletter subscription.
 * @param {Object} event
 * @returns {boolean}
 */
function isNewsletterSubscribed(event) {
    return isNewsletterEvent(event) && event.data.subscribed;
}

/**
 * Predicate: checks if the event is a newsletter unsubscription.
 * @param {Object} event
 * @returns {boolean}
 */
function isNewsletterUnsubscribed(event) {
    return isNewsletterEvent(event) && !event.data.subscribed;
}

/**
 * Predicate: checks if the event is a click event (non-aggregated).
 * @param {Object} event
 * @returns {boolean}
 */
function isSimpleClickEvent(event) {
    return event.type === 'click_event';
}

/**
 * Predicate: checks if the event is an aggregated click event.
 * @param {Object} event
 * @returns {boolean}
 */
function isAggregatedClickEvent(event) {
    return event.type === 'aggregated_click_event';
}

/**
 * Predicate: checks if the event is a comment event with post.
 * @param {Object} event
 * @returns {boolean}
 */
function isCommentWithPost(event) {
    return isCommentEvent(event) && !!event.data.post;
}

/**
 * Predicate: checks if the event is a click or feedback event with post.
 * @param {Object} event
 * @returns {boolean}
 */
function isClickOrFeedbackWithPost(event) {
    return (event.type === 'click_event' || event.type === 'feedback_event') && !!event.data.post;
}

/**
 * Predicate: checks if the event is a signup, subscription, or donation event with attribution.
 * @param {Object} event
 * @returns {boolean}
 */
function isAttributionEvent(event) {
    return ['signup_event', 'subscription_event', 'donation_event'].includes(event.type) && !!event.data.attribution;
}

/**
 * Predicate: checks if the event is a click or feedback event with post for routing.
 * @param {Object} event
 * @returns {boolean}
 */
function isRouteablePostEvent(event) {
    return ['click_event', 'feedback_event'].includes(event.type) && !!event.data.post;
}

/**
 * Predicate: checks if the event is a signup or subscription event with post attribution type.
 * @param {Object} event
 * @returns {boolean}
 */
function isRouteableAttributionEvent(event) {
    return ['signup_event', 'subscription_event'].includes(event.type) && event.data.attribution_type === 'post';
}

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

    getIcon(event) {
        if (isLoginEvent(event)) {
            return 'event-logged-in';
        }
        if (isPaymentEvent(event)) {
            return 'event-subscriptions';
        }
        if (isNewsletterEvent(event)) {
            return isNewsletterSubscribed(event)
                ? 'event-subscribed-to-email'
                : 'event-unsubscribed-from-email';
        }
        if (isSubscriptionEvent(event)) {
            if (isSubscriptionCanceled(event)) {
                return 'event-canceled-subscription';
            }
            return 'event-subscriptions';
        }
        if (isSignupOrCreatedSubscription(event)) {
            return 'event-signed-up';
        }
        if (isEmailOpenedEvent(event)) {
            return 'event-opened-email';
        }
        if (isEmailSentEvent(event) || isAutomatedEmailSentEvent(event)) {
            return 'event-sent-email';
        }
        if (isEmailDeliveredEvent(event)) {
            return 'event-received-email';
        }
        if (isEmailFailedEvent(event)) {
            return 'event-email-delivery-failed';
        }
        if (isEmailComplaintEvent(event)) {
            return 'event-email-delivery-spam';
        }
        if (isCommentEvent(event)) {
            return 'event-comment';
        }
        if (isClickEvent(event)) {
            return 'event-click';
        }
        if (isFeedbackEvent(event)) {
            return isFeedbackPositive(event)
                ? 'event-more-like-this'
                : 'event-less-like-this';
        }
        if (isDonationEvent(event)) {
            return 'event-subscriptions';
        }
        if (isEmailChangeEvent(event)) {
            return 'event-email-changed';
        }
        return 'event-undefined';
    }

    getAction(event, hasMultipleNewsletters) {
        if (isSignupOrCreatedSubscription(event)) {
            return 'signed up';
        }
        if (isLoginEvent(event)) {
            return 'logged in';
        }
        if (isPaymentEvent(event)) {
            return 'made payment';
        }
        if (isNewsletterEvent(event)) {
            let newsletter = 'newsletter';
            if (hasMultipleNewsletters && event.data.newsletter?.name) {
                newsletter = event.data.newsletter.name;
            }
            return isNewsletterSubscribed(event)
                ? `subscribed to ${newsletter}`
                : `unsubscribed from ${newsletter}`;
        }
        if (isSubscriptionEvent(event)) {
            if (isSubscriptionCreated(event)) {
                return 'started paid subscription';
            }
            if (isSubscriptionUpdated(event)) {
                return 'changed paid subscription';
            }
            if (isSubscriptionCanceled(event)) {
                return 'canceled paid subscription';
            }
            if (isSubscriptionReactivated(event)) {
                return 'reactivated paid subscription';
            }
            if (isSubscriptionExpired(event)) {
                return 'ended paid subscription';
            }
            return 'changed paid subscription';
        }
        if (isEmailOpenedEvent(event)) {
            return 'opened email';
        }
        if (isEmailSentEvent(event)) {
            return 'sent email';
        }
        if (isAutomatedEmailSentEvent(event)) {
            const slug = event.data.automatedEmail?.slug || '';
            const emailType = slug.includes('paid') ? 'Paid' : 'Free';
            return `received welcome email (${emailType})`;
        }
        if (isEmailDeliveredEvent(event)) {
            return 'received email';
        }
        if (isEmailFailedEvent(event)) {
            return 'bounced email';
        }
        if (isEmailComplaintEvent(event)) {
            return 'email flagged as spam';
        }
        if (isCommentEvent(event)) {
            return isCommentReply(event) ? 'replied to comment' : 'commented';
        }
        if (isSimpleClickEvent(event)) {
            return 'clicked link in email';
        }
        if (isAggregatedClickEvent(event)) {
            if (event.data.count.clicks <= 1) {
                return 'clicked link in email';
            }
            return `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
        }
        if (isFeedbackEvent(event)) {
            return isFeedbackPositive(event) ? 'more like this' : 'less like this';
        }
        if (isEmailChangeEvent(event)) {
            if (hasEmailChangeData(event)) {
                return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
            }
            return 'Email address changed';
        }
        if (isDonationEvent(event)) {
            return 'Made a one-time payment';
        }
        return undefined;
    }

    getJoin() {
        return '–';
    }

    getObject(event) {
        if (isSignupEvent(event) || isSubscriptionEvent(event) || isDonationEvent(event)) {
            if (hasAttributionTitle(event)) {
                return event.data.attribution.title;
            }
        }
        if (isCommentEvent(event) && hasPost(event)) {
            return event.data.post.title;
        }
        if (isClickOrFeedbackWithPost(event)) {
            return event.data.post.title;
        }
        return '';
    }

    getSource(event) {
        if (hasAttributionSource(event)) {
            return {
                name: event.data.attribution.referrer_source,
                url: event.data.attribution.referrer_url ?? null
            };
        }
        return null;
    }

    getInfo(event) {
        if (isSubscriptionEvent(event)) {
            const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
            if (mrrDelta === 0) {
                return undefined;
            }
            const symbol = getSymbol(event.data.currency);
            if (isSubscriptionCreated(event)) {
                const sign = mrrDelta > 0 ? '' : '-';
                const tierName = this.membersUtils.hasMultipleTiers
                    ? (event.data.tierName ?? 'Paid')
                    : 'Paid';
                return `${tierName} ${sign}${symbol}${Math.abs(mrrDelta)}/month`;
            }
            const sign = mrrDelta > 0 ? '+' : '-';
            return `MRR ${sign}${symbol}${Math.abs(mrrDelta)}`;
        }
        if (isSignupEvent(event) && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }
        if (isDonationEvent(event)) {
            const symbol = getSymbol(event.data.currency);
            return symbol + getNonDecimal(event.data.amount, event.data.currency);
        }
        return undefined;
    }

    getDescription(event) {
        if (isClickEvent(event)) {
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
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type) && hasPost(event)) {
            return event.data.post.url;
        }
        if (isAttributionEvent(event) && hasAttributionUrl(event)) {
            return event.data.attribution.url;
        }
        return undefined;
    }

    getRoute(event) {
        if (isRouteablePostEvent(event)) {
            return {
                name: 'posts-x',
                model: event.data.post.id
            };
        }
        if (isRouteableAttributionEvent(event)) {
            return {
                name: 'posts-x',
                model: event.data.attribution_id
            };
        }
        return undefined;
    }
}