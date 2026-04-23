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

    /* ---------- Icon Helpers ---------- */

    /**
     * Returns the appropriate icon string for the given event.
     * @param {Object} event
     * @returns {string}
     */
    getIcon(event) {
        if (isLoginEvent(event)) return 'event-logged-in';
        if (isPaymentEvent(event)) return 'event-subscriptions';
        if (isNewsletterEvent(event)) {
            return 'event-' + (event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email');
        }
        if (isSubscriptionEvent(event)) {
            if (event.data.type === 'canceled') {
                return 'event-canceled-subscription';
            }
            return 'event-subscriptions';
        }
        if (isSignupOrCreatedSubscription(event)) return 'event-signed-up';
        if (isEmailOpenedEvent(event)) return 'event-opened-email';
        if (isEmailSentEvent(event) || isAutomatedEmailSentEvent(event)) return 'event-sent-email';
        if (isEmailDeliveredEvent(event)) return 'event-received-email';
        if (isEmailFailedEvent(event)) return 'event-email-delivery-failed';
        if (isEmailComplaintEvent(event)) return 'event-email-delivery-spam';
        if (isCommentEvent(event)) return 'event-comment';
        if (isClickOrAggregatedClickEvent(event)) return 'event-click';
        if (isFeedbackEvent(event)) {
            return 'event-' + (event.data.score === 1 ? 'more-like-this' : 'less-like-this');
        }
        if (isDonationEvent(event)) return 'event-subscriptions';
        if (isEmailChangeEvent(event)) return 'event-email-changed';
        return 'event-';
    }

    /* ---------- Action Helpers ---------- */

    /**
     * Returns the human‑readable action description for the given event.
     * @param {Object} event
     * @param {boolean} hasMultipleNewsletters
     * @returns {string|undefined}
     */
    getAction(event, hasMultipleNewsletters) {
        if (isSignupOrCreatedSubscription(event)) return 'signed up';
        if (isLoginEvent(event)) return 'logged in';
        if (isPaymentEvent(event)) return 'made payment';
        if (isNewsletterEvent(event)) {
            const newsletter = getNewsletterName(event, hasMultipleNewsletters);
            return event.data.subscribed
                ? `subscribed to ${newsletter}`
                : `unsubscribed from ${newsletter}`;
        }
        if (isSubscriptionEvent(event)) {
            return getSubscriptionAction(event);
        }
        if (isEmailOpenedEvent(event)) return 'opened email';
        if (isEmailSentEvent(event)) return 'sent email';
        if (isAutomatedEmailSentEvent(event)) {
            const slug = event.data.automatedEmail?.slug || '';
            const emailType = slug.includes('paid') ? 'Paid' : 'Free';
            return `received welcome email (${emailType})`;
        }
        if (isEmailDeliveredEvent(event)) return 'received email';
        if (isEmailFailedEvent(event)) return 'bounced email';
        if (isEmailComplaintEvent(event)) return 'email flagged as spam';
        if (isCommentEvent(event)) {
            return event.data.parent ? 'replied to comment' : 'commented';
        }
        if (isClickEvent(event)) return 'clicked link in email';
        if (isAggregatedClickEvent(event)) {
            const clicks = event.data.count.clicks;
            return clicks <= 1
                ? 'clicked link in email'
                : `clicked ${ghPluralize(clicks, 'link')} in email`;
        }
        if (isFeedbackEvent(event)) {
            return event.data.score === 1 ? 'more like this' : 'less like this';
        }
        if (isEmailChangeEvent(event)) {
            if (event.data.from_email && event.data.to_email) {
                return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
            }
            return 'Email address changed';
        }
        if (isDonationEvent(event)) return 'Made a one-time payment';
    }

    /* ---------- Join ---------- */

    getJoin() {
        return '–';
    }

    /* ---------- Object Helpers ---------- */

    /**
     * Returns a clickable object title for the given event.
     * @param {Object} event
     * @returns {string}
     */
    getObject(event) {
        if (isAttributionEvent(event)) {
            return event.data.attribution?.title ?? '';
        }
        if (isCommentEvent(event) && event.data.post) {
            return event.data.post.title;
        }
        if ((isClickEvent(event) || isFeedbackEvent(event)) && event.data.post) {
            return event.data.post.title;
        }
        return '';
    }

    /* ---------- Source ---------- */

    /**
     * Returns source information if available.
     * @param {Object} event
     * @returns {{name:string,url:string|null}|null}
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

    /* ---------- Info ---------- */

    /**
     * Returns additional info string for the given event.
     * @param {Object} event
     * @returns {string|undefined}
     */
    getInfo(event) {
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
    }

    /* ---------- Description ---------- */

    /**
     * Returns a cleaned description for click events.
     * @param {Object} event
     * @returns {string|undefined}
     */
    getDescription(event) {
        if (isClickEvent(event)) {
            try {
                return this.utils.cleanTrackedUrl(event.data.link.to, true);
            } catch {
                return event.data.link.to;
            }
        }
    }

    /* ---------- URL ---------- */

    /**
     * Returns a URL for clickable objects.
     * @param {Object} event
     * @returns {string|undefined}
     */
    getURL(event) {
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type) && event.data.post) {
            return event.data.post.url;
        }
        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type) && event.data.attribution?.url) {
            return event.data.attribution.url;
        }
    }

    /* ---------- Route ---------- */

    /**
     * Returns internal route props for a clickable object.
     * @param {Object} event
     * @returns {{name:string,model:any}|undefined}
     */
    getRoute(event) {
        if (['click_event', 'feedback_event'].includes(event.type) && event.data.post) {
            return {name: 'posts-x', model: event.data.post.id};
        }
        if (['signup_event', 'subscription_event'].includes(event.type) && event.data.attribution_type === 'post') {
            return {name: 'posts-x', model: event.data.attribution_id};
        }
    }
}

/* ---------- Predicate Functions ---------- */

/**
 * @param {Object} event
 * @returns {boolean}
 */
function isLoginEvent(event) {
    return event.type === 'login_event';
}

/**
 * @param {Object} event
 * @returns {boolean}
 */
function isPaymentEvent(event) {
    return event.type === 'payment_event';
}

/**
 * @param {Object} event
 * @returns {boolean}
 */
function isNewsletterEvent(event) {
    return event.type === 'newsletter_event';
}

/**
 * @param {Object} event
 * @returns {boolean}
 */
function isSubscriptionEvent(event) {
    return event.type === 'subscription_event';
}

/**
 * @param {Object} event
 * @returns {boolean}
 */
function isSignupOrCreatedSubscription(event) {
    return event.type === 'signup_event' ||
        (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup);
}

/**
 * @param {Object} event
 * @returns {boolean}
 */
function isEmailOpenedEvent(event) {
    return event.type === 'email_opened_event';
}

/**
 * @param {Object} event
 * @returns {boolean}
 */
function isEmailSentEvent(event) {
    return event.type === 'email_sent_event';
}

/**
 * @param {Object} event
 * @returns {boolean}
 */
function isAutomatedEmailSentEvent(event) {
    return event.type === 'automated_email_sent_event';
}

/**
 * @param {Object} event
 * @returns {boolean}
 */
function isEmailDeliveredEvent(event) {
    return event.type === 'email_delivered_event';
}

/**
 * @param {Object} event
 * @returns {boolean}
 */
function isEmailFailedEvent(event) {
    return event.type === 'email_failed_event';
}

/**
 * @param {Object} event
 * @returns {boolean}
 */
function isEmailComplaintEvent(event) {
    return event.type === 'email_complaint_event';
}

/**
 * @param {Object} event
 * @returns {boolean}
 */
function isCommentEvent(event) {
    return event.type === 'comment_event';
}

/**
 * @param {Object} event
 * @returns {boolean}
 */
function isClickEvent(event) {
    return event.type === 'click_event';
}

/**
 * @param {Object} event
 * @returns {boolean}
 */
function isAggregatedClickEvent(event) {
    return event.type === 'aggregated_click_event';
}

/**
 * @param {Object} event
 * @returns {boolean}
 */
function isClickOrAggregatedClickEvent(event) {
    return isClickEvent(event) || isAggregatedClickEvent(event);
}

/**
 * @param {Object} event
 * @returns {boolean}
 */
function isFeedbackEvent(event) {
    return event.type === 'feedback_event';
}

/**
 * @param {Object} event
 * @returns {boolean}
 */
function isEmailChangeEvent(event) {
    return event.type === 'email_change_event';
}

/**
 * @param {Object} event
 * @returns {boolean}
 */
function isDonationEvent(event) {
    return event.type === 'donation_event';
}

/**
 * @param {Object} event
 * @returns {boolean}
 */
function isSignupEvent(event) {
    return event.type === 'signup_event';
}

/**
 * @param {Object} event
 * @returns {boolean}
 */
function isAttributionEvent(event) {
    return event.type === 'signup_event' ||
        event.type === 'subscription_event' ||
        event.type === 'donation_event';
}

/**
 * @param {Object} event
 * @param {boolean} hasMultipleNewsletters
 * @returns {string}
 */
function getNewsletterName(event, hasMultipleNewsletters) {
    if (hasMultipleNewsletters && event.data.newsletter?.name) {
        return event.data.newsletter.name;
    }
    return 'newsletter';
}

/**
 * @param {Object} event
 * @returns {string}
 */
function getSubscriptionAction(event) {
    const type = event.data.type;
    if (type === 'created') return 'started paid subscription';
    if (type === 'updated') return 'changed paid subscription';
    if (type === 'canceled') return 'canceled paid subscription';
    if (type === 'reactivated') return 'reactivated paid subscription';
    if (type === 'expired') return 'ended paid subscription';
    return 'changed paid subscription';
}