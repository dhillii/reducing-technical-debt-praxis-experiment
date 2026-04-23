import Helper from '@ember/component/helper';
import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';
import {ghPluralize} from 'ghost-admin/helpers/gh-pluralize';
import {inject as service} from '@ember/service';

/**
 * Helper to parse member events into a displayable format.
 */
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
        const icon = this._getIcon(event);
        const action = this._getAction(event, hasMultipleNewsletters);
        const info = this._getInfo(event);
        const description = this._getDescription(event);
        const join = this._getJoin();
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
    _isSignupOrCreatedSubscription(event) {
        return event.type === 'signup_event' ||
            (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup);
    }

    /** @private */
    _isEmailOpened(event) {
        return event.type === 'email_opened_event';
    }

    /** @private */
    _isEmailSent(event) {
        return event.type === 'email_sent_event';
    }

    /** @private */
    _isAutomatedEmailSent(event) {
        return event.type === 'automated_email_sent_event';
    }

    /** @private */
    _isEmailDelivered(event) {
        return event.type === 'email_delivered_event';
    }

    /** @private */
    _isEmailFailed(event) {
        return event.type === 'email_failed_event';
    }

    /** @private */
    _isEmailComplaint(event) {
        return event.type === 'email_complaint_event';
    }

    /** @private */
    _isCommentEvent(event) {
        return event.type === 'comment_event';
    }

    /** @private */
    _isClickOrAggregatedClick(event) {
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
    _hasMultipleNewsletters(event, hasMultipleNewsletters) {
        return hasMultipleNewsletters && event.data.newsletter?.name;
    }

    /** @private */
    _isSubscriptionCreated(event) {
        return event.data.type === 'created';
    }

    /** @private */
    _isSubscriptionUpdated(event) {
        return event.data.type === 'updated';
    }

    /** @private */
    _isSubscriptionCanceled(event) {
        return event.data.type === 'canceled';
    }

    /** @private */
    _isSubscriptionReactivated(event) {
        return event.data.type === 'reactivated';
    }

    /** @private */
    _isSubscriptionExpired(event) {
        return event.data.type === 'expired';
    }

    /** @private */
    _hasParentComment(event) {
        return !!event.data.parent;
    }

    /** @private */
    _hasMultipleClicks(event) {
        return event.data.count?.clicks > 1;
    }

    /** @private */
    _hasAttributionTitle(event) {
        return !!event.data.attribution?.title;
    }

    /** @private */
    _hasPost(event) {
        return !!event.data.post;
    }

    /** @private */
    _hasAttribution(event) {
        return !!event.data.attribution?.url;
    }

    /** @private */
    _isAttributionPost(event) {
        return event.data.attribution_type === 'post';
    }

    /** @private */
    _hasScoreOne(event) {
        return event.data.score === 1;
    }

    /** @private */
    _hasFromAndToEmail(event) {
        return !!event.data.from_email && !!event.data.to_email;
    }

    /** @private */
    _hasMrrDelta(event) {
        return typeof event.data.mrr_delta !== 'undefined';
    }

    /** @private */
    _isPaidMembersEnabled() {
        return this.membersUtils.paidMembersEnabled;
    }

    /** @private */
    _hasMultipleTiers() {
        return this.membersUtils.hasMultipleTiers;
    }

    /* ---------- Core logic ---------- */

    _getIcon(event) {
        if (this._isLoginEvent(event)) {
            return 'event-logged-in';
        }
        if (this._isPaymentEvent(event) || this._isDonationEvent(event)) {
            return 'event-subscriptions';
        }
        if (this._isNewsletterEvent(event)) {
            return event.data.subscribed ? 'event-subscribed-to-email' : 'event-unsubscribed-from-email';
        }
        if (this._isSubscriptionEvent(event)) {
            if (event.data.type === 'canceled') {
                return 'event-canceled-subscription';
            }
            return 'event-subscriptions';
        }
        if (this._isSignupOrCreatedSubscription(event)) {
            return 'event-signed-up';
        }
        if (this._isEmailOpened(event)) {
            return 'event-opened-email';
        }
        if (this._isEmailSent(event) || this._isAutomatedEmailSent(event)) {
            return 'event-sent-email';
        }
        if (this._isEmailDelivered(event)) {
            return 'event-received-email';
        }
        if (this._isEmailFailed(event)) {
            return 'event-email-delivery-failed';
        }
        if (this._isEmailComplaint(event)) {
            return 'event-email-delivery-spam';
        }
        if (this._isCommentEvent(event)) {
            return 'event-comment';
        }
        if (this._isClickOrAggregatedClick(event)) {
            return 'event-click';
        }
        if (this._isFeedbackEvent(event)) {
            return this._hasScoreOne(event) ? 'event-more-like-this' : 'event-less-like-this';
        }
        if (this._isEmailChangeEvent(event)) {
            return 'event-email-changed';
        }
        return 'event-';
    }

    _getAction(event, hasMultipleNewsletters) {
        if (this._isSignupOrCreatedSubscription(event)) {
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
            return event.data.subscribed
                ? `subscribed to ${newsletter}`
                : `unsubscribed from ${newsletter}`;
        }
        if (this._isSubscriptionEvent(event)) {
            if (this._isSubscriptionCreated(event)) {
                return 'started paid subscription';
            }
            if (this._isSubscriptionUpdated(event)) {
                return 'changed paid subscription';
            }
            if (this._isSubscriptionCanceled(event)) {
                return 'canceled paid subscription';
            }
            if (this._isSubscriptionReactivated(event)) {
                return 'reactivated paid subscription';
            }
            if (this._isSubscriptionExpired(event)) {
                return 'ended paid subscription';
            }
            return 'changed paid subscription';
        }
        if (this._isEmailOpened(event)) {
            return 'opened email';
        }
        if (this._isEmailSent(event)) {
            return 'sent email';
        }
        if (this._isAutomatedEmailSent(event)) {
            const slug = event.data.automatedEmail?.slug || '';
            const emailType = slug.includes('paid') ? 'Paid' : 'Free';
            return `received welcome email (${emailType})`;
        }
        if (this._isEmailDelivered(event)) {
            return 'received email';
        }
        if (this._isEmailFailed(event)) {
            return 'bounced email';
        }
        if (this._isEmailComplaint(event)) {
            return 'email flagged as spam';
        }
        if (this._isCommentEvent(event)) {
            return this._hasParentComment(event) ? 'replied to comment' : 'commented';
        }
        if (event.type === 'click_event') {
            return 'clicked link in email';
        }
        if (event.type === 'aggregated_click_event') {
            return this._hasMultipleClicks(event)
                ? `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`
                : 'clicked link in email';
        }
        if (this._isFeedbackEvent(event)) {
            return this._hasScoreOne(event) ? 'more like this' : 'less like this';
        }
        if (this._isEmailChangeEvent(event)) {
            return this._hasFromAndToEmail(event)
                ? `Email address changed from ${event.data.from_email} to ${event.data.to_email}`
                : 'Email address changed';
        }
        if (this._isDonationEvent(event)) {
            return 'Made a one-time payment';
        }
        return undefined;
    }

    _getJoin() {
        return '–';
    }

    _getObject(event) {
        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type) && this._hasAttributionTitle(event)) {
            return event.data.attribution.title;
        }
        if (this._isCommentEvent(event) && this._hasPost(event)) {
            return event.data.post.title;
        }
        if ((event.type === 'click_event' || event.type === 'feedback_event') && this._hasPost(event)) {
            return event.data.post.title;
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
        if (event.type === 'subscription_event' && this._hasMrrDelta(event)) {
            const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
            if (mrrDelta === 0) {
                return undefined;
            }
            const symbol = getSymbol(event.data.currency);
            if (this._isSubscriptionCreated(event)) {
                const sign = mrrDelta > 0 ? '' : '-';
                const tierName = this._hasMultipleTiers()
                    ? (event.data.tierName ?? 'Paid')
                    : 'Paid';
                return `${tierName} ${sign}${symbol}${Math.abs(mrrDelta)}/month`;
            }
            const sign = mrrDelta > 0 ? '+' : '-';
            return `MRR ${sign}${symbol}${Math.abs(mrrDelta)}`;
        }
        if (event.type === 'signup_event' && this._isPaidMembersEnabled()) {
            return 'Free';
        }
        if (event.type === 'donation_event') {
            const symbol = getSymbol(event.data.currency);
            return symbol + getNonDecimal(event.data.amount, event.data.currency);
        }
        return undefined;
    }

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

    _getURL(event) {
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type) && this._hasPost(event)) {
            return event.data.post.url;
        }
        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type) && this._hasAttribution(event)) {
            return event.data.attribution.url;
        }
        return undefined;
    }

    _getRoute(event) {
        if (['click_event', 'feedback_event'].includes(event.type) && this._hasPost(event)) {
            return {
                name: 'posts-x',
                model: event.data.post.id
            };
        }
        if (['signup_event', 'subscription_event'].includes(event.type) && this._isAttributionPost(event)) {
            return {
                name: 'posts-x',
                model: event.data.attribution_id
            };
        }
        return undefined;
    }
}