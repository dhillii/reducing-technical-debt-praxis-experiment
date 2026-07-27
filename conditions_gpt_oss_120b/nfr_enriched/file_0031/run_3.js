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
        let memberName = this.trimString(event.data.member?.name);
        const subject = event.data.member
            ? (memberName || event.data.member.email)
            : (event.data.name || event.data.email || '');
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

    /** Determine icon based on event type and data */
    getIcon(event) {
        const type = event.type;
        if (type === 'login_event') return 'event-logged-in';
        if (type === 'payment_event' || type === 'donation_event') return 'event-subscriptions';
        if (type === 'newsletter_event') {
            return 'event-' + (event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email');
        }
        if (type === 'subscription_event') {
            return event.data.type === 'canceled'
                ? 'event-canceled-subscription'
                : 'event-subscriptions';
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
            return 'event-' + (event.data.score === 1 ? 'more-like-this' : 'less-like-this');
        }
        if (type === 'email_change_event') return 'event-email-changed';
        return 'event-';
    }

    /** Dispatch to specific action resolver based on event type */
    getAction(event, hasMultipleNewsletters) {
        const type = event.type;
        if (type === 'signup_event' || (type === 'subscription_event' && event.data.type === 'created' && event.data.signup)) {
            return this._actionSignedUp();
        }
        if (type === 'login_event') return this._actionLoggedIn();
        if (type === 'payment_event') return this._actionMadePayment();
        if (type === 'newsletter_event') return this._actionNewsletter(event, hasMultipleNewsletters);
        if (type === 'subscription_event') return this._actionSubscription(event);
        if (type === 'email_opened_event') return this._actionOpenedEmail();
        if (type === 'email_sent_event') return this._actionSentEmail();
        if (type === 'automated_email_sent_event') return this._actionAutomatedEmail(event);
        if (type === 'email_delivered_event') return this._actionReceivedEmail();
        if (type === 'email_failed_event') return this._actionBouncedEmail();
        if (type === 'email_complaint_event') return this._actionEmailSpam();
        if (type === 'comment_event') return this._actionComment(event);
        if (type === 'click_event') return this._actionClickedLink();
        if (type === 'aggregated_click_event') return this._actionAggregatedClick(event);
        if (type === 'feedback_event') return this._actionFeedback(event);
        if (type === 'email_change_event') return this._actionEmailChange(event);
        if (type === 'donation_event') return this._actionDonation();
        return undefined;
    }

    _actionSignedUp() {
        return 'signed up';
    }

    _actionLoggedIn() {
        return 'logged in';
    }

    _actionMadePayment() {
        return 'made payment';
    }

    _actionNewsletter(event, hasMultipleNewsletters) {
        let name = 'newsletter';
        if (hasMultipleNewsletters && event.data.newsletter?.name) {
            name = event.data.newsletter.name;
        }
        return event.data.subscribed ? `subscribed to ${name}` : `unsubscribed from ${name}`;
    }

    _actionSubscription(event) {
        const subType = event.data.type;
        switch (subType) {
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

    _actionOpenedEmail() {
        return 'opened email';
    }

    _actionSentEmail() {
        return 'sent email';
    }

    _actionAutomatedEmail(event) {
        const slug = event.data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    _actionReceivedEmail() {
        return 'received email';
    }

    _actionBouncedEmail() {
        return 'bounced email';
    }

    _actionEmailSpam() {
        return 'email flagged as spam';
    }

    _actionComment(event) {
        return event.data.parent ? 'replied to comment' : 'commented';
    }

    _actionClickedLink() {
        return 'clicked link in email';
    }

    _actionAggregatedClick(event) {
        const clicks = event.data.count?.clicks ?? 0;
        if (clicks <= 1) {
            return 'clicked link in email';
        }
        return `clicked ${ghPluralize(clicks, 'link')} in email`;
    }

    _actionFeedback(event) {
        return event.data.score === 1 ? 'more like this' : 'less like this';
    }

    _actionEmailChange(event) {
        if (event.data.from_email && event.data.to_email) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }
        return 'Email address changed';
    }

    _actionDonation() {
        return 'Made a one-time payment';
    }

    getJoin() {
        return '–';
    }

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
                return undefined;
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
            return symbol + getNonDecimal(event.data.amount, event.data.currency);
        }
        return undefined;
    }

    getDescription(event) {
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

    getURL(event) {
        const type = event.type;
        if (['comment_event', 'click_event', 'feedback_event'].includes(type) && event.data.post) {
            return event.data.post.url;
        }
        if (['signup_event', 'subscription_event', 'donation_event'].includes(type) && event.data.attribution?.url) {
            return event.data.attribution.url;
        }
        return undefined;
    }

    getRoute(event) {
        const type = event.type;
        if (['click_event', 'feedback_event'].includes(type) && event.data.post) {
            return {name: 'posts-x', model: event.data.post.id};
        }
        if (['signup_event', 'subscription_event'].includes(type) && event.data.attribution_type === 'post') {
            return {name: 'posts-x', model: event.data.attribution_id};
        }
        return undefined;
    }
}