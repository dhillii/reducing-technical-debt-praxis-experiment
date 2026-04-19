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

    getIcon(event) {
        const type = event.type;
        if (type === 'login_event') return 'event-logged-in';
        if (type === 'payment_event') return 'event-subscriptions';
        if (type === 'newsletter_event') {
            return event.data.subscribed ? 'event-subscribed-to-email' : 'event-unsubscribed-from-email';
        }
        if (type === 'subscription_event') {
            if (event.data.type === 'canceled') return 'event-canceled-subscription';
            return 'event-subscriptions';
        }
        if (type === 'signup_event' || (type === 'subscription_event' && event.data.type === 'created' && event.data.signup)) {
            return 'event-signed-up';
        }
        if (type === 'email_opened_event') return 'event-opened-email';
        if (type === 'email_sent_event' || type === 'automated_email_sent_event') return 'event-sent-email';
        if (type === 'email_delivered_event') return 'event-received-email';
        if (type === 'email_failed_event') return 'event-email-delivery-failed';
        if (type === 'email_complaint_event') return 'event-email-delivery-spam';
        if (type === 'comment_event') return 'event-comment';
        if (type === 'click_event' || type === 'aggregated_click_event') return 'event-click';
        if (type === 'feedback_event') {
            return event.data.score === 1 ? 'event-more-like-this' : 'event-less-like-this';
        }
        if (type === 'donation_event') return 'event-subscriptions';
        if (type === 'email_change_event') return 'event-email-changed';
        return 'event-unknown';
    }

    getAction(event, hasMultipleNewsletters) {
        const type = event.type;
        if (type === 'signup_event' || (type === 'subscription_event' && event.data.type === 'created' && event.data.signup)) {
            return 'signed up';
        }
        if (type === 'login_event') return 'logged in';
        if (type === 'payment_event') return 'made payment';
        if (type === 'newsletter_event') {
            const newsletter = hasMultipleNewsletters && event.data.newsletter?.name ? event.data.newsletter.name : 'newsletter';
            return event.data.subscribed ? `subscribed to ${newsletter}` : `unsubscribed from ${newsletter}`;
        }
        if (type === 'subscription_event') {
            switch (event.data.type) {
                case 'created': return 'started paid subscription';
                case 'updated': return 'changed paid subscription';
                case 'canceled': return 'canceled paid subscription';
                case 'reactivated': return 'reactivated paid subscription';
                case 'expired': return 'ended paid subscription';
                default: return 'changed paid subscription';
            }
        }
        if (type === 'email_opened_event') return 'opened email';
        if (type === 'email_sent_event') return 'sent email';
        if (type === 'automated_email_sent_event') {
            const slug = event.data.automatedEmail?.slug || '';
            const emailType = slug.includes('paid') ? 'Paid' : 'Free';
            return `received welcome email (${emailType})`;
        }
        if (type === 'email_delivered_event') return 'received email';
        if (type === 'email_failed_event') return 'bounced email';
        if (type === 'email_complaint_event') return 'email flagged as spam';
        if (type === 'comment_event') {
            return event.data.parent ? 'replied to comment' : 'commented';
        }
        if (type === 'click_event') return 'clicked link in email';
        if (type === 'aggregated_click_event') {
            return event.data.count.clicks <= 1 ? 'clicked link in email' : `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
        }
        if (type === 'feedback_event') {
            return event.data.score === 1 ? 'more like this' : 'less like this';
        }
        if (type === 'email_change_event') {
            if (event.data.from_email && event.data.to_email) {
                return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
            }
            return 'Email address changed';
        }
        if (type === 'donation_event') return 'Made a one-time payment';
        return '';
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
        const type = event.type;
        if (type === 'signup_event' || type === 'subscription_event' || type === 'donation_event') {
            return event.data.attribution?.title ?? '';
        }
        if (type === 'comment_event' || type === 'click_event' || type === 'feedback_event') {
            return event.data.post?.title ?? '';
        }
        return '';
    }

    /**
     * Clickable object, shown between action and info, or in a separate column in some views
     */
    getSource(event) {
        const referrer = event.data?.attribution?.referrer_source;
        if (!referrer) return null;
        return {
            name: referrer,
            url: event.data.attribution.referrer_url ?? null
        };
    }

    getInfo(event) {
        if (event.type !== 'subscription_event') {
            if (event.type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
                return 'Free';
            }
            if (event.type === 'donation_event') {
                const symbol = getSymbol(event.data.currency);
                return symbol + getNonDecimal(event.data.amount, event.data.currency);
            }
            return;
        }

        const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
        if (mrrDelta === 0) return;

        const symbol = getSymbol(event.data.currency);
        const sign = event.data.type === 'created' ? (mrrDelta > 0 ? '' : '-') : (mrrDelta > 0 ? '+' : '-');
        if (event.data.type === 'created') {
            const tierName = this.membersUtils.hasMultipleTiers ? (event.data.tierName ?? 'Paid') : 'Paid';
            return `${tierName} ${sign}${symbol}${Math.abs(mrrDelta)}/month`;
        }
        return `MRR ${sign}${symbol}${Math.abs(mrrDelta)}`;
    }

    getDescription(event) {
        if (event.type !== 'click_event') return;
        try {
            return this.utils.cleanTrackedUrl(event.data.link.to, true);
        } catch {
            return event.data.link.to;
        }
    }

    /**
     * Make the object clickable
     */
    getURL(event) {
        const type = event.type;
        if (['comment_event', 'click_event', 'feedback_event'].includes(type)) {
            return event.data.post?.url;
        }
        if (['signup_event', 'subscription_event', 'donation_event'].includes(type)) {
            return event.data.attribution?.url;
        }
        return;
    }

    /**
     * Get internal route props for a clickable object
     */
    getRoute(event) {
        const type = event.type;
        if (['click_event', 'feedback_event'].includes(type)) {
            return event.data.post ? {name: 'posts-x', model: event.data.post.id} : undefined;
        }
        if (['signup_event', 'subscription_event'].includes(type) && event.data.attribution_type === 'post') {
            return {name: 'posts-x', model: event.data.attribution_id};
        }
        return;
    }
}