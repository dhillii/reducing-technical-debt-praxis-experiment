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
     * Trim a value to a non‑empty string or return null.
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

        const icon = this._determineIcon(event);
        const action = this._determineAction(event, hasMultipleNewsletters);
        const info = this._determineInfo(event);
        const description = this._determineDescription(event);
        const join = this.getJoin();
        const object = this._determineObject(event);
        const url = this._determineURL(event);
        const route = this._determineRoute(event);
        const timestamp = moment(event.data.created_at);
        const source = this._determineSource(event);

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

    /* --------------------------------------------------------------------- */
    /* Icon determination – each case returns the appropriate prefix string. */
    _determineIcon(event) {
        const type = event.type;
        let icon = '';

        switch (type) {
            case 'login_event':
                icon = 'logged-in';
                break;
            case 'payment_event':
                icon = 'subscriptions';
                break;
            case 'newsletter_event':
                icon = event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
                break;
            case 'subscription_event':
                icon = event.data.type === 'canceled' ? 'canceled-subscription' : 'subscriptions';
                break;
            case 'signup_event':
                icon = 'signed-up';
                break;
            case 'email_opened_event':
                icon = 'opened-email';
                break;
            case 'email_sent_event':
            case 'automated_email_sent_event':
                icon = 'sent-email';
                break;
            case 'email_delivered_event':
                icon = 'received-email';
                break;
            case 'email_failed_event':
                icon = 'email-delivery-failed';
                break;
            case 'email_complaint_event':
                icon = 'email-delivery-spam';
                break;
            case 'comment_event':
                icon = 'comment';
                break;
            case 'click_event':
            case 'aggregated_click_event':
                icon = 'click';
                break;
            case 'feedback_event':
                icon = event.data.score === 1 ? 'more-like-this' : 'less-like-this';
                break;
            case 'donation_event':
                icon = 'subscriptions';
                break;
            case 'email_change_event':
                icon = 'email-changed';
                break;
            default:
                icon = '';
        }

        // Special case: signup via subscription creation
        if (type === 'subscription_event' && event.data.type === 'created' && event.data.signup) {
            icon = 'signed-up';
        }

        return `event-${icon}`;
    }

    /* --------------------------------------------------------------------- */
    /* Action determination – returns a human‑readable action string. */
    _determineAction(event, hasMultipleNewsletters) {
        const type = event.type;

        // Signup via subscription creation shares the signup wording
        if (type === 'signup_event' || (type === 'subscription_event' && event.data.type === 'created' && event.data.signup)) {
            return 'signed up';
        }

        if (type === 'login_event') {
            return 'logged in';
        }

        if (type === 'payment_event') {
            return 'made payment';
        }

        if (type === 'newsletter_event') {
            const newsletter = (hasMultipleNewsletters && event.data.newsletter?.name) ? event.data.newsletter.name : 'newsletter';
            return event.data.subscribed ? `subscribed to ${newsletter}` : `unsubscribed from ${newsletter}`;
        }

        if (type === 'subscription_event') {
            const subType = event.data.type;
            const map = {
                created: 'started paid subscription',
                updated: 'changed paid subscription',
                canceled: 'canceled paid subscription',
                reactivated: 'reactivated paid subscription',
                expired: 'ended paid subscription'
            };
            return map[subType] || 'changed paid subscription';
        }

        if (type === 'email_opened_event') {
            return 'opened email';
        }

        if (type === 'email_sent_event') {
            return 'sent email';
        }

        if (type === 'automated_email_sent_event') {
            const slug = event.data.automatedEmail?.slug || '';
            const emailType = slug.includes('paid') ? 'Paid' : 'Free';
            return `received welcome email (${emailType})`;
        }

        if (type === 'email_delivered_event') {
            return 'received email';
        }

        if (type === 'email_failed_event') {
            return 'bounced email';
        }

        if (type === 'email_complaint_event') {
            return 'email flagged as spam';
        }

        if (type === 'comment_event') {
            return event.data.parent ? 'replied to comment' : 'commented';
        }

        if (type === 'click_event') {
            return 'clicked link in email';
        }

        if (type === 'aggregated_click_event') {
            const clicks = event.data.count?.clicks ?? 0;
            return clicks <= 1
                ? 'clicked link in email'
                : `clicked ${ghPluralize(clicks, 'link')} in email`;
        }

        if (type === 'feedback_event') {
            return event.data.score === 1 ? 'more like this' : 'less like this';
        }

        if (type === 'email_change_event') {
            const from = event.data.from_email;
            const to = event.data.to_email;
            return (from && to) ? `Email address changed from ${from} to ${to}` : 'Email address changed';
        }

        if (type === 'donation_event') {
            return 'Made a one-time payment';
        }

        return undefined;
    }

    /**
     * Static join string used between action and object.
     */
    getJoin() {
        return '–';
    }

    /* --------------------------------------------------------------------- */
    /* Object determination – returns a title for clickable objects. */
    _determineObject(event) {
        const type = event.type;

        if (['signup_event', 'subscription_event', 'donation_event'].includes(type) && event.data.attribution?.title) {
            return event.data.attribution.title;
        }

        if (type === 'comment_event' && event.data.post?.title) {
            return event.data.post.title;
        }

        if (['click_event', 'feedback_event'].includes(type) && event.data.post?.title) {
            return event.data.post.title;
        }

        return '';
    }

    /* --------------------------------------------------------------------- */
    /* Source determination – returns referrer information if present. */
    _determineSource(event) {
        const attribution = event.data?.attribution;
        if (attribution?.referrer_source) {
            return {
                name: attribution.referrer_source,
                url: attribution.referrer_url ?? null
            };
        }
        return null;
    }

    /* --------------------------------------------------------------------- */
    /* Info determination – returns formatted subscription/payment info. */
    _determineInfo(event) {
        const type = event.type;

        if (type === 'subscription_event') {
            const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
            if (mrrDelta === 0) {
                return undefined;
            }
            const symbol = getSymbol(event.data.currency);
            const sign = mrrDelta > 0 ? '+' : '-';
            const absDelta = Math.abs(mrrDelta);

            if (event.data.type === 'created') {
                const tierName = this.membersUtils.hasMultipleTiers
                    ? (event.data.tierName ?? 'Paid')
                    : 'Paid';
                const prefix = mrrDelta > 0 ? '' : '-';
                return `${tierName} ${prefix}${symbol}${absDelta}/month`;
            }

            return `MRR ${sign}${symbol}${absDelta}`;
        }

        if (type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }

        if (type === 'donation_event') {
            const symbol = getSymbol(event.data.currency);
            const amount = getNonDecimal(event.data.amount, event.data.currency);
            return `${symbol}${amount}`;
        }

        return undefined;
    }

    /* --------------------------------------------------------------------- */
    /* Description determination – cleans tracked URLs for click events. */
    _determineDescription(event) {
        if (event.type === 'click_event') {
            try {
                return this.utils.cleanTrackedUrl(event.data.link.to, true);
            } catch {
                // fall back to raw URL
                return event.data.link.to;
            }
        }
        return undefined;
    }

    /* --------------------------------------------------------------------- */
    /* URL determination – returns a URL for clickable objects. */
    _determineURL(event) {
        const type = event.type;

        if (['comment_event', 'click_event', 'feedback_event'].includes(type) && event.data.post?.url) {
            return event.data.post.url;
        }

        if (['signup_event', 'subscription_event', 'donation_event'].includes(type) && event.data.attribution?.url) {
            return event.data.attribution.url;
        }

        return undefined;
    }

    /* --------------------------------------------------------------------- */
    /* Route determination – returns Ember route info for internal navigation. */
    _determineRoute(event) {
        const type = event.type;

        if (['click_event', 'feedback_event'].includes(type) && event.data.post) {
            return {
                name: 'posts-x',
                model: event.data.post.id
            };
        }

        if (['signup_event', 'subscription_event'].includes(type) && event.data.attribution_type === 'post') {
            return {
                name: 'posts-x',
                model: event.data.attribution_id
            };
        }

        return undefined;
    }
}