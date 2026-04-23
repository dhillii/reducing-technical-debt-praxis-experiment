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
     * Trim a string value, converting empty or whitespace-only strings to null.
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

    compute([event, hasMultipleNewsletters]) {
        let memberName = event.data.member?.name;
        memberName = this.trimString(memberName);

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

    getIcon(event) {
        if (event.type === 'login_event') {
            return 'event-logged-in';
        }
        if (event.type === 'payment_event') {
            return 'event-subscriptions';
        }
        if (event.type === 'newsletter_event') {
            return event.data.subscribed
                ? 'event-subscribed-to-email'
                : 'event-unsubscribed-from-email';
        }
        if (event.type === 'subscription_event') {
            if (event.data.type === 'canceled') {
                return 'event-canceled-subscription';
            }
            return 'event-subscriptions';
        }
        if (this.isSignupOrSubscriptionCreatedWithSignup(event)) {
            return 'event-signed-up';
        }
        if (event.type === 'email_opened_event') {
            return 'event-opened-email';
        }
        if (event.type === 'email_sent_event' || event.type === 'automated_email_sent_event') {
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
        if (event.type === 'click_event' || event.type === 'aggregated_click_event') {
            return 'event-click';
        }
        if (event.type === 'feedback_event') {
            return event.data.score === 1
                ? 'event-more-like-this'
                : 'event-less-like-this';
        }
        if (event.type === 'donation_event') {
            return 'event-subscriptions';
        }
        if (event.type === 'email_change_event') {
            return 'event-email-changed';
        }
        return 'event-unknown';
    }

    getAction(event, hasMultipleNewsletters) {
        if (this.isSignupOrSubscriptionCreatedWithSignup(event)) {
            return 'signed up';
        }
        if (event.type === 'login_event') {
            return 'logged in';
        }
        if (event.type === 'payment_event') {
            return 'made payment';
        }
        if (event.type === 'newsletter_event') {
            const newsletter = this.getNewsletterName(event, hasMultipleNewsletters);
            return event.data.subscribed
                ? `subscribed to ${newsletter}`
                : `unsubscribed from ${newsletter}`;
        }
        if (event.type === 'subscription_event') {
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
        if (event.type === 'email_opened_event') {
            return 'opened email';
        }
        if (event.type === 'email_sent_event') {
            return 'sent email';
        }
        if (event.type === 'automated_email_sent_event') {
            const slug = event.data.automatedEmail?.slug || '';
            const emailType = slug.includes('paid') ? 'Paid' : 'Free';
            return `received welcome email (${emailType})`;
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
            return event.data.parent ? 'replied to comment' : 'commented';
        }
        if (event.type === 'click_event') {
            return 'clicked link in email';
        }
        if (event.type === 'aggregated_click_event') {
            return event.data.count.clicks <= 1
                ? 'clicked link in email'
                : `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
        }
        if (event.type === 'feedback_event') {
            return event.data.score === 1 ? 'more like this' : 'less like this';
        }
        if (event.type === 'email_change_event') {
            return event.data.from_email && event.data.to_email
                ? `Email address changed from ${event.data.from_email} to ${event.data.to_email}`
                : 'Email address changed';
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

    /**
     * Clickable object, shown between action and info, or in a separate column in some views
     */
    getObject(event) {
        if (event.type === 'signup_event' || event.type === 'subscription_event' || event.type === 'donation_event') {
            if (event.data.attribution?.title) {
                return event.data.attribution.title;
            }
        }
        if (event.type === 'comment_event' && event.data.post) {
            return event.data.post.title;
        }
        if ((event.type === 'click_event' || event.type === 'feedback_event') && event.data.post) {
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
        if (event.type === 'subscription_event') {
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
        if (event.type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }
        if (event.type === 'donation_event') {
            const symbol = getSymbol(event.data.currency);
            const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
            return formattedAmount;
        }
        return;
    }

    getDescription(event) {
        if (event.type === 'click_event') {
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

    /**
     * @param {Object} event
     * @returns {boolean}
     */
    isSignupOrSubscriptionCreatedWithSignup(event) {
        return event.type === 'signup_event' ||
            (event.type === 'subscription_event' &&
                event.data.type === 'created' &&
                event.data.signup);
    }

    /**
     * @param {Object} event
     * @param {boolean} hasMultipleNewsletters
     * @returns {string}
     */
    getNewsletterName(event, hasMultipleNewsletters) {
        if (hasMultipleNewsletters && event.data.newsletter && event.data.newsletter.name) {
            return event.data.newsletter.name;
        }
        return 'newsletter';
    }
}