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
     * Normalise a value to a trimmed string or null.
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
     */
    compute([event, hasMultipleNewsletters]) {
        const memberName = this.trimString(event.data.member?.name);
        const subject = this.getSubject(event, memberName);
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

    /**
     * Determine the subject line for the event.
     */
    getSubject(event, memberName) {
        if (event.data.member) {
            return memberName || event.data.member.email;
        }
        return event.data.name || event.data.email || '';
    }

    /**
     * Map event types to icon identifiers.
     */
    getIcon(event) {
        const type = event.type;
        const data = event.data;
        switch (type) {
            case 'login_event':
                return 'event-logged-in';
            case 'payment_event':
                return 'event-subscriptions';
            case 'newsletter_event':
                return data.subscribed
                    ? 'event-subscribed-to-email'
                    : 'event-unsubscribed-from-email';
            case 'subscription_event':
                if (data.type === 'canceled') {
                    return 'event-canceled-subscription';
                }
                return 'event-subscriptions';
            case 'signup_event':
            case 'subscription_event':
                if (data.type === 'created' && data.signup) {
                    return 'event-signed-up';
                }
                return 'event-signed-up';
            case 'email_opened_event':
                return 'event-opened-email';
            case 'email_sent_event':
            case 'automated_email_sent_event':
                return 'event-sent-email';
            case 'email_delivered_event':
                return 'event-received-email';
            case 'email_failed_event':
                return 'event-email-delivery-failed';
            case 'email_complaint_event':
                return 'event-email-delivery-spam';
            case 'comment_event':
                return 'event-comment';
            case 'click_event':
            case 'aggregated_click_event':
                return 'event-click';
            case 'feedback_event':
                return data.score === 1
                    ? 'event-more-like-this'
                    : 'event-less-like-this';
            case 'donation_event':
                return 'event-subscriptions';
            case 'email_change_event':
                return 'event-email-changed';
            default:
                return 'event-unknown';
        }
    }

    /**
     * Map event types to human‑readable actions.
     */
    getAction(event, hasMultipleNewsletters) {
        const type = event.type;
        const data = event.data;
        switch (type) {
            case 'signup_event':
            case 'subscription_event':
                if (data.type === 'created' && data.signup) {
                    return 'signed up';
                }
                return 'signed up';
            case 'login_event':
                return 'logged in';
            case 'payment_event':
                return 'made payment';
            case 'newsletter_event': {
                const newsletter = hasMultipleNewsletters && data.newsletter?.name
                    ? data.newsletter.name
                    : 'newsletter';
                return data.subscribed
                    ? `subscribed to ${newsletter}`
                    : `unsubscribed from ${newsletter}`;
            }
            case 'subscription_event':
                switch (data.type) {
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
            case 'email_opened_event':
                return 'opened email';
            case 'email_sent_event':
                return 'sent email';
            case 'automated_email_sent_event': {
                const slug = data.automatedEmail?.slug || '';
                const emailType = slug.includes('paid') ? 'Paid' : 'Free';
                return `received welcome email (${emailType})`;
            }
            case 'email_delivered_event':
                return 'received email';
            case 'email_failed_event':
                return 'bounced email';
            case 'email_complaint_event':
                return 'email flagged as spam';
            case 'comment_event':
                return data.parent ? 'replied to comment' : 'commented';
            case 'click_event':
                return 'clicked link in email';
            case 'aggregated_click_event':
                return data.count.clicks <= 1
                    ? 'clicked link in email'
                    : `clicked ${ghPluralize(data.count.clicks, 'link')} in email`;
            case 'feedback_event':
                return data.score === 1
                    ? 'more like this'
                    : 'less like this';
            case 'email_change_event':
                if (data.from_email && data.to_email) {
                    return `Email address changed from ${data.from_email} to ${data.to_email}`;
                }
                return 'Email address changed';
            case 'donation_event':
                return 'Made a one-time payment';
            default:
                return '';
        }
    }

    /**
     * Join string used when action and object are in the same sentence.
     */
    getJoin() {
        return '–';
    }

    /**
     * Clickable object text.
     */
    getObject(event) {
        const type = event.type;
        const data = event.data;
        if (['signup_event', 'subscription_event', 'donation_event'].includes(type)) {
            return data.attribution?.title ?? '';
        }
        if (['comment_event', 'click_event', 'feedback_event'].includes(type)) {
            return data.post?.title ?? '';
        }
        return '';
    }

    /**
     * Source information for the event.
     */
    getSource(event) {
        const referrer = event.data?.attribution?.referrer_source;
        if (referrer) {
            return {
                name: referrer,
                url: event.data.attribution.referrer_url ?? null
            };
        }
        return null;
    }

    /**
     * Information string for the event.
     */
    getInfo(event) {
        const type = event.type;
        const data = event.data;
        if (type === 'subscription_event') {
            const mrrDelta = getNonDecimal(data.mrr_delta, data.currency);
            if (mrrDelta === 0) {
                return;
            }
            const symbol = getSymbol(data.currency);
            const tierName = this.membersUtils.hasMultipleTiers
                ? (data.tierName ?? 'Paid')
                : 'Paid';
            if (data.type === 'created') {
                const sign = mrrDelta > 0 ? '' : '-';
                return `${tierName} ${sign}${symbol}${Math.abs(mrrDelta)}/month`;
            }
            const sign = mrrDelta > 0 ? '+' : '-';
            return `MRR ${sign}${symbol}${Math.abs(mrrDelta)}`;
        }
        if (type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }
        if (type === 'donation_event') {
            const symbol = getSymbol(data.currency);
            return symbol + getNonDecimal(data.amount, data.currency);
        }
    }

    /**
     * Description for the event.
     */
    getDescription(event) {
        if (event.type === 'click_event') {
            try {
                return this.utils.cleanTrackedUrl(event.data.link.to, true);
            } catch {
                // ignore invalid URL
            }
            return event.data.link.to;
        }
    }

    /**
     * URL for the clickable object.
     */
    getURL(event) {
        const type = event.type;
        const data = event.data;
        if (['comment_event', 'click_event', 'feedback_event'].includes(type) && data.post) {
            return data.post.url;
        }
        if (['signup_event', 'subscription_event', 'donation_event'].includes(type) && data.attribution?.url) {
            return data.attribution.url;
        }
    }

    /**
     * Route for the clickable object.
     */
    getRoute(event) {
        const type = event.type;
        const data = event.data;
        if (['click_event', 'feedback_event'].includes(type) && data.post) {
            return {name: 'posts-x', model: data.post.id};
        }
        if (['signup_event', 'subscription_event'].includes(type) && data.attribution_type === 'post') {
            return {name: 'posts-x', model: data.attribution_id};
        }
    }
}