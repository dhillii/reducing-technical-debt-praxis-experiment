import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject as service} from '@ember/service';

/**
 * Helper to parse member events into a UI‑friendly format.
 */
export default class ParseMemberEventHelper extends Helper {
    @service feature;
    @service utils;
    @service membersUtils;

    /**
     * Trim a value to a non‑empty string or return `null`.
     * @param {*} value
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
     * Compute the parsed event object.
     * @param {[Object, boolean]} args
     * @returns {Object}
     */
    compute([event, hasMultipleNewsletters]) {
        const memberName = this.trimString(event.data.member?.name);
        const subject = event.data.member
            ? (memberName || event.data.member.email)
            : (event.data.name || event.data.email || '');

        const member = event.data.member
            ? {...event.data.member, name: memberName}
            : event.data.member;

        return {
            memberId: event.data.member_id ?? event.data.member?.id,
            member,
            emailId: event.data.email_id,
            email: event.data.email,
            icon: this._getIcon(event),
            subject,
            action: this._getAction(event, hasMultipleNewsletters),
            join: this._getJoin(),
            object: this._getObject(event),
            source: this._getSource(event),
            info: this._getInfo(event),
            description: this._getDescription(event),
            url: this._getURL(event),
            route: this._getRoute(event),
            timestamp: moment(event.data.created_at)
        };
    }

    /* --------------------------------------------------------------------- */
    /* Guard‑clause based helpers                                            */
    /* --------------------------------------------------------------------- */

    _getIcon(event) {
        if (isLoginEvent(event)) return 'event-logged-in';
        if (isPaymentEvent(event)) return 'event-subscriptions';
        if (isNewsletterEvent(event)) {
            return event.data.subscribed
                ? 'event-subscribed-to-email'
                : 'event-unsubscribed-from-email';
        }
        if (isSubscriptionEvent(event)) {
            if (isCanceledSubscription(event)) return 'event-canceled-subscription';
            return 'event-subscriptions';
        }
        if (isSignedUpEvent(event)) return 'event-signed-up';
        if (isEmailOpenedEvent(event)) return 'event-opened-email';
        if (isEmailSentEvent(event) || isAutomatedEmailSentEvent(event)) return 'event-sent-email';
        if (isEmailDeliveredEvent(event)) return 'event-received-email';
        if (isEmailFailedEvent(event)) return 'event-email-delivery-failed';
        if (isEmailComplaintEvent(event)) return 'event-email-delivery-spam';
        if (isCommentEvent(event)) return 'event-comment';
        if (isClickEvent(event) || isAggregatedClickEvent(event)) return 'event-click';
        if (isFeedbackEvent(event)) {
            return event.data.score === 1
                ? 'event-more-like-this'
                : 'event-less-like-this';
        }
        if (isDonationEvent(event)) return 'event-subscriptions';
        if (isEmailChangeEvent(event)) return 'event-email-changed';
        return '';
    }

    _getAction(event, hasMultipleNewsletters) {
        if (isSignedUpEvent(event)) return 'signed up';
        if (isLoginEvent(event)) return 'logged in';
        if (isPaymentEvent(event)) return 'made payment';
        if (isNewsletterEvent(event)) return this._newsletterAction(event, hasMultipleNewsletters);
        if (isSubscriptionEvent(event)) return this._subscriptionAction(event);
        if (isEmailOpenedEvent(event)) return 'opened email';
        if (isEmailSentEvent(event)) return 'sent email';
        if (isAutomatedEmailSentEvent(event)) return this._automatedEmailAction(event);
        if (isEmailDeliveredEvent(event)) return 'received email';
        if (isEmailFailedEvent(event)) return 'bounced email';
        if (isEmailComplaintEvent(event)) return 'email flagged as spam';
        if (isCommentEvent(event)) return event.data.parent ? 'replied to comment' : 'commented';
        if (isClickEvent(event)) return 'clicked link in email';
        if (isAggregatedClickEvent(event)) return this._aggregatedClickAction(event);
        if (isFeedbackEvent(event)) return event.data.score === 1 ? 'more like this' : 'less like this';
        if (isEmailChangeEvent(event)) return this._emailChangeAction(event);
        if (isDonationEvent(event)) return 'Made a one-time payment';
        return '';
    }

    _getJoin() {
        return '–';
    }

    _getObject(event) {
        if (isAttributionObjectEvent(event)) {
            return event.data.attribution.title;
        }
        if (isCommentEvent(event) && event.data.post) {
            return event.data.post.title;
        }
        if (isClickEvent(event) || isFeedbackEvent(event)) {
            return event.data.post?.title ?? '';
        }
        return '';
    }

    _getSource(event) {
        if (event.data?.attribution?.referrer_source) {
            return {
                name: event.data.attribution.referrer_source,
                url: event.data.attribution.referrer_url ?? null
            };
        }
        return null;
    }

    _getInfo(event) {
        if (isSubscriptionEvent(event)) {
            const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
            if (mrrDelta === 0) return;
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
        if (isSignupEvent(event) && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }
        if (isDonationEvent(event)) {
            const symbol = getSymbol(event.data.currency);
            return symbol + getNonDecimal(event.data.amount, event.data.currency);
        }
        return;
    }

    _getDescription(event) {
        if (isClickEvent(event)) {
            try {
                return this.utils.cleanTrackedUrl(event.data.link.to, true);
            } catch {
                return event.data.link.to;
            }
        }
        return;
    }

    _getURL(event) {
        if (isClickableURLObjectEvent(event)) {
            return event.data.post?.url;
        }
        if (isAttributionURLObjectEvent(event)) {
            return event.data.attribution?.url;
        }
        return;
    }

    _getRoute(event) {
        if (isClickableRouteObjectEvent(event)) {
            return {
                name: 'posts-x',
                model: event.data.post.id
            };
        }
        if (isAttributionRouteObjectEvent(event)) {
            return {
                name: 'posts-x',
                model: event.data.attribution_id
            };
        }
        return;
    }

    /* --------------------------------------------------------------------- */
    /* Small extracted actions                                               */
    /* --------------------------------------------------------------------- */

    _newsletterAction(event, hasMultipleNewsletters) {
        const base = 'newsletter';
        const name = hasMultipleNewsletters && event.data.newsletter?.name
            ? event.data.newsletter.name
            : base;
        return event.data.subscribed
            ? `subscribed to ${name}`
            : `unsubscribed from ${name}`;
    }

    _subscriptionAction(event) {
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

    _automatedEmailAction(event) {
        const slug = event.data.automatedEmail?.slug ?? '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    _aggregatedClickAction(event) {
        const clicks = event.data.count?.clicks ?? 0;
        if (clicks <= 1) {
            return 'clicked link in email';
        }
        return `clicked ${ghPluralize(clicks, 'link')} in email`;
    }

    _emailChangeAction(event) {
        if (event.data.from_email && event.data.to_email) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }
        return 'Email address changed';
    }
}

/* ------------------------------------------------------------------------- */
/* Predicate functions – each evaluates a single condition                  */
/* ------------------------------------------------------------------------- */

/** @param {Object} event */
function isLoginEvent(event) {
    return event.type === 'login_event';
}

/** @param {Object} event */
function isPaymentEvent(event) {
    return event.type === 'payment_event';
}

/** @param {Object} event */
function isNewsletterEvent(event) {
    return event.type === 'newsletter_event';
}

/** @param {Object} event */
function isSubscriptionEvent(event) {
    return event.type === 'subscription_event';
}

/** @param {Object} event */
function isCanceledSubscription(event) {
    return isSubscriptionEvent(event) && event.data.type === 'canceled';
}

/** @param {Object} event */
function isSignedUpEvent(event) {
    return event.type === 'signup_event' ||
        (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup);
}

/** @param {Object} event */
function isEmailOpenedEvent(event) {
    return event.type === 'email_opened_event';
}

/** @param {Object} event */
function isEmailSentEvent(event) {
    return event.type === 'email_sent_event';
}

/** @param {Object} event */
function isAutomatedEmailSentEvent(event) {
    return event.type === 'automated_email_sent_event';
}

/** @param {Object} event */
function isEmailDeliveredEvent(event) {
    return event.type === 'email_delivered_event';
}

/** @param {Object} event */
function isEmailFailedEvent(event) {
    return event.type === 'email_failed_event';
}

/** @param {Object} event */
function isEmailComplaintEvent(event) {
    return event.type === 'email_complaint_event';
}

/** @param {Object} event */
function isCommentEvent(event) {
    return event.type === 'comment_event';
}

/** @param {Object} event */
function isClickEvent(event) {
    return event.type === 'click_event';
}

/** @param {Object} event */
function isAggregatedClickEvent(event) {
    return event.type === 'aggregated_click_event';
}

/** @param {Object} event */
function isFeedbackEvent(event) {
    return event.type === 'feedback_event';
}

/** @param {Object} event */
function isDonationEvent(event) {
    return event.type === 'donation_event';
}

/** @param {Object} event */
function isEmailChangeEvent(event) {
    return event.type === 'email_change_event';
}

/** @param {Object} event */
function isAttributionObjectEvent(event) {
    return (event.type === 'signup_event' ||
        event.type === 'subscription_event' ||
        event.type === 'donation_event') &&
        !!event.data.attribution?.title;
}

/** @param {Object} event */
function isClickableURLObjectEvent(event) {
    return ['comment_event', 'click_event', 'feedback_event'].includes(event.type) &&
        !!event.data.post;
}

/** @param {Object} event */
function isAttributionURLObjectEvent(event) {
    return ['signup_event', 'subscription_event', 'donation_event'].includes(event.type) &&
        !!event.data.attribution?.url;
}

/** @param {Object} event */
function isClickableRouteObjectEvent(event) {
    return ['click_event', 'feedback_event'].includes(event.type) && !!event.data.post;
}

/** @param {Object} event */
function isAttributionRouteObjectEvent(event) {
    return ['signup_event', 'subscription_event'].includes(event.type) &&
        event.data.attribution_type === 'post';
}

/** @param {Object} event */
function isSignupEvent(event) {
    return event.type === 'signup_event';
}