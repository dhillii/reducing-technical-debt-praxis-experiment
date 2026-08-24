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

    /* internal helper functions */
    getIcon(event) {
        let icon = null;

        switch (event.type) {
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
        }

        return icon ? 'event-' + icon : '';
    }

    getAction(event, hasMultipleNewsletters) {
        switch (event.type) {
            case 'signup_event':
            case 'subscription_event' when event.data.type === 'created' && event.data.signup:
                return 'signed up';
            case 'login_event':
                return 'logged in';
            case 'payment_event':
                return 'made payment';
            case 'newsletter_event': {
                const newsletter = hasMultipleNewsletters && event.data.newsletter?.name || 'newsletter';
                return event.data.subscribed ? `subscribed to ${newsletter}` : `unsubscribed from ${newsletter}`;
            }
            case 'subscription_event':
                switch (event.data.type) {
                    case 'created': return 'started paid subscription';
                    case 'updated': return 'changed paid subscription';
                    case 'canceled': return 'canceled paid subscription';
                    case 'reactivated': return 'reactivated paid subscription';
                    case 'expired': return 'ended paid subscription';
                    default: return 'changed paid subscription';
                }
            case 'email_opened_event':
                return 'opened email';
            case 'email_sent_event':
                return 'sent email';
            case 'automated_email_sent_event':
                return `received welcome email (${event.data.automatedEmail?.slug?.includes('paid') ? 'Paid' : 'Free'})`;
            case 'email_delivered_event':
                return 'received email';
            case 'email_failed_event':
                return 'bounced email';
            case 'email_complaint_event':
                return 'email flagged as spam';
            case 'comment_event':
                return event.data.parent ? 'replied to comment' : 'commented';
            case 'click_event':
                return 'clicked link in email';
            case 'aggregated_click_event':
                return `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
            case 'feedback_event':
                return event.data.score === 1 ? 'more like this' : 'less like this';
            case 'email_change_event':
                return event.data.from_email && event.data.to_email
                    ? `Email address changed from ${event.data.from_email} to ${event.data.to_email}`
                    : 'Email address changed';
            case 'donation_event':
                return 'Made a one-time payment';
            default:
                return '';
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
        switch (event.type) {
            case 'signup_event':
            case 'subscription_event':
            case 'donation_event':
                return event.data.attribution?.title || '';
            case 'comment_event':
                return event.data.post?.title || '';
            case 'click_event':
            case 'feedback_event':
                return event.data.post?.title || '';
            default:
                return '';
        }
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
                return event.data.link.to;
            }
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
            if (event.data.attribution?.url) {
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
}