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
     * Trim a value to a trimmed string or null.
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

    compute([event, hasMultipleNewsletters]) {
        const memberName = this.trimString(event.data.member?.name);
        const subject = event.data.member
            ? (memberName || event.data.member.email)
            : (event.data.name || event.data.email || '');

        const icon = this._getIcon(event);
        const action = this._getAction(event, hasMultipleNewsletters);
        const info = this._getInfo(event);
        const description = this._getDescription(event);
        const join = this.getJoin();
        const object = this._getObject(event);
        const url = this._getURL(event);
        const route = this._getRoute(event);
        const timestamp = moment(event.data.created_at);
        const source = this._getSource(event);

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

    /* ---------- Predicate helpers ---------- */

    /** @private */
    _isLoginEvent(event) {
        return event.type === 'login_event';
    }

    /** @private */
    _isPaymentEvent(event) {
        return event.type === 'payment_event';
    }

    /** @private */
    _isNewsletterEvent(event) {
        return event.type === 'newsletter_event';
    }

    /** @private */
    _isSubscriptionEvent(event) {
        return event.type === 'subscription_event';
    }

    /** @private */
    _isSignupEvent(event) {
        return event.type === 'signup_event';
    }

    /** @private */
    _isEmailOpenedEvent(event) {
        return event.type === 'email_opened_event';
    }

    /** @private */
    _isEmailSentEvent(event) {
        return event.type === 'email_sent_event';
    }

    /** @private */
    _isAutomatedEmailSentEvent(event) {
        return event.type === 'automated_email_sent_event';
    }

    /** @private */
    _isEmailDeliveredEvent(event) {
        return event.type === 'email_delivered_event';
    }

    /** @private */
    _isEmailFailedEvent(event) {
        return event.type === 'email_failed_event';
    }

    /** @private */
    _isEmailComplaintEvent(event) {
        return event.type === 'email_complaint_event';
    }

    /** @private */
    _isCommentEvent(event) {
        return event.type === 'comment_event';
    }

    /** @private */
    _isClickEvent(event) {
        return event.type === 'click_event' || event.type === 'aggregated_click_event';
    }

    /** @private */
    _isFeedbackEvent(event) {
        return event.type === 'feedback_event';
    }

    /** @private */
    _isDonationEvent(event) {
        return event.type === 'donation_event';
    }

    /** @private */
    _isEmailChangeEvent(event) {
        return event.type === 'email_change_event';
    }

    /** @private */
    _isSubscribedNewsletter(event) {
        return event.data?.subscribed;
    }

    /** @private */
    _isSubscriptionCanceled(event) {
        return event.data?.type === 'canceled';
    }

    /** @private */
    _isSubscriptionCreated(event) {
        return event.data?.type === 'created';
    }

    /** @private */
    _isSubscriptionCreatedWithSignup(event) {
        return this._isSubscriptionCreated(event) && !!event.data?.signup;
    }

    /** @private */
    _hasMultipleNewsletters(event, hasMultipleNewsletters) {
        return hasMultipleNewsletters && event.data?.newsletter?.name;
    }

    /** @private */
    _hasAttributionTitle(event) {
        return !!event.data?.attribution?.title;
    }

    /** @private */
    _hasPost(event) {
        return !!event.data?.post;
    }

    /** @private */
    _hasAttributionUrl(event) {
        return !!event.data?.attribution?.url;
    }

    /** @private */
    _hasAttributionReferrer(event) {
        return !!event.data?.attribution?.referrer_source;
    }

    /** @private */
    _hasAttributionTypePost(event) {
        return event.data?.attribution_type === 'post';
    }

    /** @private */
    _hasFromAndToEmail(event) {
        return !!event.data?.from_email && !!event.data?.to_email;
    }

    /** @private */
    _hasClickCountMoreThanOne(event) {
        return event.data?.count?.clicks > 1;
    }

    /** @private */
    _isFeedbackPositive(event) {
        return event.data?.score === 1;
    }

    /** @private */
    _isFeedbackNegative(event) {
        return event.data?.score !== 1;
    }

    /* ---------- Icon ---------- */

    _getIcon(event) {
        if (this._isLoginEvent(event)) {
            return 'event-logged-in';
        }
        if (this._isPaymentEvent(event)) {
            return 'event-subscriptions';
        }
        if (this._isNewsletterEvent(event)) {
            return this._isSubscribedNewsletter(event)
                ? 'event-subscribed-to-email'
                : 'event-unsubscribed-from-email';
        }
        if (this._isSubscriptionEvent(event)) {
            if (this._isSubscriptionCanceled(event)) {
                return 'event-canceled-subscription';
            }
            return 'event-subscriptions';
        }
        if (this._isSignupEvent(event) || this._isSubscriptionCreatedWithSignup(event)) {
            return 'event-signed-up';
        }
        if (this._isEmailOpenedEvent(event)) {
            return 'event-opened-email';
        }
        if (this._isEmailSentEvent(event) || this._isAutomatedEmailSentEvent(event)) {
            return 'event-sent-email';
        }
        if (this._isEmailDeliveredEvent(event)) {
            return 'event-received-email';
        }
        if (this._isEmailFailedEvent(event)) {
            return 'event-email-delivery-failed';
        }
        if (this._isEmailComplaintEvent(event)) {
            return 'event-email-delivery-spam';
        }
        if (this._isCommentEvent(event)) {
            return 'event-comment';
        }
        if (this._isClickEvent(event)) {
            return 'event-click';
        }
        if (this._isFeedbackEvent(event)) {
            return this._isFeedbackPositive(event)
                ? 'event-more-like-this'
                : 'event-less-like-this';
        }
        if (this._isDonationEvent(event)) {
            return 'event-subscriptions';
        }
        if (this._isEmailChangeEvent(event)) {
            return 'event-email-changed';
        }
        return 'event-';
    }

    /* ---------- Action ---------- */

    _getAction(event, hasMultipleNewsletters) {
        if (this._isSignupEvent(event) || this._isSubscriptionCreatedWithSignup(event)) {
            return 'signed up';
        }
        if (this._isLoginEvent(event)) {
            return 'logged in';
        }
        if (this._isPaymentEvent(event)) {
            return 'made payment';
        }
        if (this._isNewsletterEvent(event)) {
            const newsletter = this._hasMultipleNewsletters(event, hasMultipleNewsletters)
                ? event.data.newsletter.name
                : 'newsletter';
            return this._isSubscribedNewsletter(event)
                ? `subscribed to ${newsletter}`
                : `unsubscribed from ${newsletter}`;
        }
        if (this._isSubscriptionEvent(event)) {
            if (this._isSubscriptionCreated(event)) {
                return 'started paid subscription';
            }
            if (event.data?.type === 'updated') {
                return 'changed paid subscription';
            }
            if (this._isSubscriptionCanceled(event)) {
                return 'canceled paid subscription';
            }
            if (event.data?.type === 'reactivated') {
                return 'reactivated paid subscription';
            }
            if (event.data?.type === 'expired') {
                return 'ended paid subscription';
            }
            return 'changed paid subscription';
        }
        if (this._isEmailOpenedEvent(event)) {
            return 'opened email';
        }
        if (this._isEmailSentEvent(event)) {
            return 'sent email';
        }
        if (this._isAutomatedEmailSentEvent(event)) {
            const slug = event.data?.automatedEmail?.slug || '';
            const emailType = slug.includes('paid') ? 'Paid' : 'Free';
            return `received welcome email (${emailType})`;
        }
        if (this._isEmailDeliveredEvent(event)) {
            return 'received email';
        }
        if (this._isEmailFailedEvent(event)) {
            return 'bounced email';
        }
        if (this._isEmailComplaintEvent(event)) {
            return 'email flagged as spam';
        }
        if (this._isCommentEvent(event)) {
            return event.data?.parent ? 'replied to comment' : 'commented';
        }
        if (event.type === 'click_event') {
            return 'clicked link in email';
        }
        if (event.type === 'aggregated_click_event') {
            if (this._hasClickCountMoreThanOne(event)) {
                return `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
            }
            return 'clicked link in email';
        }
        if (this._isFeedbackEvent(event)) {
            return this._isFeedbackPositive(event) ? 'more like this' : 'less like this';
        }
        if (this._isEmailChangeEvent(event)) {
            if (this._hasFromAndToEmail(event)) {
                return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
            }
            return 'Email address changed';
        }
        if (this._isDonationEvent(event)) {
            return 'Made a one-time payment';
        }
        return undefined;
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

    /* ---------- Object ---------- */

    _getObject(event) {
        if (this._isSignupEvent(event) || this._isSubscriptionEvent(event) || this._isDonationEvent(event)) {
            if (this._hasAttributionTitle(event)) {
                return event.data.attribution.title;
            }
        }
        if (this._isCommentEvent(event) && this._hasPost(event)) {
            return event.data.post.title;
        }
        if ((event.type === 'click_event' || this._isFeedbackEvent(event)) && this._hasPost(event)) {
            return event.data.post.title;
        }
        return '';
    }

    /* ---------- Source ---------- */

    _getSource(event) {
        if (this._hasAttributionReferrer(event)) {
            return {
                name: event.data.attribution.referrer_source,
                url: event.data.attribution.referrer_url ?? null
            };
        }
        return null;
    }

    /* ---------- Info ---------- */

    _getInfo(event) {
        if (event.type === 'subscription_event') {
            const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
            if (mrrDelta === 0) {
                return undefined;
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
        if (event.type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }
        if (event.type === 'donation_event') {
            const symbol = getSymbol(event.data.currency);
            return symbol + getNonDecimal(event.data.amount, event.data.currency);
        }
        return undefined;
    }

    /* ---------- Description ---------- */

    _getDescription(event) {
        if (event.type === 'click_event') {
            try {
                return this.utils.cleanTrackedUrl(event.data.link.to, true);
            } catch (e) {
                // ignore invalid URL
            }
            return event.data.link.to;
        }
        return undefined;
    }

    /* ---------- URL ---------- */

    _getURL(event) {
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type) && this._hasPost(event)) {
            return event.data.post.url;
        }
        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type) && this._hasAttributionUrl(event)) {
            return event.data.attribution.url;
        }
        return undefined;
    }

    /* ---------- Route ---------- */

    _getRoute(event) {
        if (['click_event', 'feedback_event'].includes(event.type) && this._hasPost(event)) {
            return {
                name: 'posts-x',
                model: event.data.post.id
            };
        }
        if (['signup_event', 'subscription_event'].includes(event.type) && this._hasAttributionTypePost(event)) {
            return {
                name: 'posts-x',
                model: event.data.attribution_id
            };
        }
        return undefined;
    }
}