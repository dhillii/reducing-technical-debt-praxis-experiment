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
        const subject = this._computeSubject(event, memberName);
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

    /** @private */
    _computeSubject(event, memberName) {
        if (event.data.member) {
            return memberName || event.data.member.email;
        }
        return event.data.name || event.data.email || '';
    }

    /** @private */
    _getIcon(event) {
        if (this._isLoginEvent(event)) return 'event-logged-in';
        if (this._isPaymentEvent(event)) return 'event-subscriptions';
        if (this._isNewsletterSubscribed(event)) return 'event-subscribed-to-email';
        if (this._isNewsletterUnsubscribed(event)) return 'event-unsubscribed-from-email';
        if (this._isSubscriptionCanceled(event)) return 'event-canceled-subscription';
        if (this._isSubscriptionEvent(event)) return 'event-subscriptions';
        if (this._isSignupOrCreatedWithSignup(event)) return 'event-signed-up';
        if (this._isEmailOpened(event)) return 'event-opened-email';
        if (this._isEmailSent(event) || this._isAutomatedEmailSent(event)) return 'event-sent-email';
        if (this._isEmailDelivered(event)) return 'event-received-email';
        if (this._isEmailFailed(event)) return 'event-email-delivery-failed';
        if (this._isEmailComplaint(event)) return 'event-email-delivery-spam';
        if (this._isCommentEvent(event)) return 'event-comment';
        if (this._isClickEvent(event) || this._isAggregatedClickEvent(event)) return 'event-click';
        if (this._isFeedbackPositive(event)) return 'event-more-like-this';
        if (this._isFeedbackNegative(event)) return 'event-less-like-this';
        if (this._isDonationEvent(event)) return 'event-subscriptions';
        if (this._isEmailChange(event)) return 'event-email-changed';
        return '';
    }

    /** @private */
    _getAction(event, hasMultipleNewsletters) {
        if (this._isSignupOrCreatedWithSignup(event)) return 'signed up';
        if (this._isLoginEvent(event)) return 'logged in';
        if (this._isPaymentEvent(event)) return 'made payment';
        if (this._isNewsletterEvent(event)) {
            const newsletter = this._resolveNewsletterName(event, hasMultipleNewsletters);
            return event.data.subscribed
                ? `subscribed to ${newsletter}`
                : `unsubscribed from ${newsletter}`;
        }
        if (this._isSubscriptionEvent(event)) return this._resolveSubscriptionAction(event);
        if (this._isEmailOpened(event)) return 'opened email';
        if (this._isEmailSent(event)) return 'sent email';
        if (this._isAutomatedEmailSent(event)) {
            const slug = event.data.automatedEmail?.slug || '';
            const emailType = slug.includes('paid') ? 'Paid' : 'Free';
            return `received welcome email (${emailType})`;
        }
        if (this._isEmailDelivered(event)) return 'received email';
        if (this._isEmailFailed(event)) return 'bounced email';
        if (this._isEmailComplaint(event)) return 'email flagged as spam';
        if (this._isCommentEvent(event)) {
            return event.data.parent ? 'replied to comment' : 'commented';
        }
        if (this._isClickEvent(event)) return 'clicked link in email';
        if (this._isAggregatedClickEvent(event)) {
            const clicks = event.data.count.clicks;
            return clicks <= 1
                ? 'clicked link in email'
                : `clicked ${ghPluralize(clicks, 'link')} in email`;
        }
        if (this._isFeedbackPositive(event)) return 'more like this';
        if (this._isFeedbackNegative(event)) return 'less like this';
        if (this._isEmailChange(event)) {
            const from = event.data.from_email;
            const to = event.data.to_email;
            return from && to
                ? `Email address changed from ${from} to ${to}`
                : 'Email address changed';
        }
        if (this._isDonationEvent(event)) return 'Made a one-time payment';
        return undefined;
    }

    /** @private */
    _getJoin() {
        return '–';
    }

    /** @private */
    _getObject(event) {
        if (this._isSignupOrCreatedWithSignup(event) && event.data.attribution?.title) {
            return event.data.attribution.title;
        }
        if (this._isCommentEvent(event) && event.data.post) {
            return event.data.post.title;
        }
        if ((this._isClickEvent(event) || this._isFeedbackEvent(event)) && event.data.post) {
            return event.data.post.title;
        }
        return '';
    }

    /** @private */
    _getSource(event) {
        const source = event.data?.attribution?.referrer_source;
        if (source) {
            return {
                name: source,
                url: event.data.attribution.referrer_url ?? null
            };
        }
        return null;
    }

    /** @private */
    _getInfo(event) {
        if (this._isSubscriptionEvent(event)) {
            const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
            if (mrrDelta === 0) return undefined;
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
        if (this._isSignupEvent(event) && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }
        if (this._isDonationEvent(event)) {
            const symbol = getSymbol(event.data.currency);
            return symbol + getNonDecimal(event.data.amount, event.data.currency);
        }
        return undefined;
    }

    /** @private */
    _getDescription(event) {
        if (this._isClickEvent(event)) {
            try {
                return this.utils.cleanTrackedUrl(event.data.link.to, true);
            } catch {
                return event.data.link.to;
            }
        }
        return undefined;
    }

    /** @private */
    _getURL(event) {
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type) && event.data.post) {
            return event.data.post.url;
        }
        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type) && event.data.attribution?.url) {
            return event.data.attribution.url;
        }
        return undefined;
    }

    /** @private */
    _getRoute(event) {
        if (['click_event', 'feedback_event'].includes(event.type) && event.data.post) {
            return {name: 'posts-x', model: event.data.post.id};
        }
        if (['signup_event', 'subscription_event'].includes(event.type) && event.data.attribution_type === 'post') {
            return {name: 'posts-x', model: event.data.attribution_id};
        }
        return undefined;
    }

    // ---------- Predicate helpers ----------

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
    _isNewsletterSubscribed(event) {
        return this._isNewsletterEvent(event) && event.data.subscribed;
    }

    /** @private */
    _isNewsletterUnsubscribed(event) {
        return this._isNewsletterEvent(event) && !event.data.subscribed;
    }

    /** @private */
    _isSubscriptionEvent(event) {
        return event.type === 'subscription_event';
    }

    /** @private */
    _isSubscriptionCanceled(event) {
        return this._isSubscriptionEvent(event) && event.data.type === 'canceled';
    }

    /** @private */
    _isSignupEvent(event) {
        return event.type === 'signup_event';
    }

    /** @private */
    _isSignupOrCreatedWithSignup(event) {
        return this._isSignupEvent(event) ||
            (this._isSubscriptionEvent(event) && event.data.type === 'created' && event.data.signup);
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
    _isClickEvent(event) {
        return event.type === 'click_event';
    }

    /** @private */
    _isAggregatedClickEvent(event) {
        return event.type === 'aggregated_click_event';
    }

    /** @private */
    _isFeedbackEvent(event) {
        return event.type === 'feedback_event';
    }

    /** @private */
    _isFeedbackPositive(event) {
        return this._isFeedbackEvent(event) && event.data.score === 1;
    }

    /** @private */
    _isFeedbackNegative(event) {
        return this._isFeedbackEvent(event) && event.data.score !== 1;
    }

    /** @private */
    _isDonationEvent(event) {
        return event.type === 'donation_event';
    }

    /** @private */
    _isEmailChange(event) {
        return event.type === 'email_change_event';
    }

    /** @private */
    _resolveNewsletterName(event, hasMultipleNewsletters) {
        if (hasMultipleNewsletters && event.data.newsletter?.name) {
            return event.data.newsletter.name;
        }
        return 'newsletter';
    }

    /** @private */
    _resolveSubscriptionAction(event) {
        const type = event.data.type;
        if (type === 'created') return 'started paid subscription';
        if (type === 'updated') return 'changed paid subscription';
        if (type === 'canceled') return 'canceled paid subscription';
        if (type === 'reactivated') return 'reactivated paid subscription';
        if (type === 'expired') return 'ended paid subscription';
        return 'changed paid subscription';
    }
}