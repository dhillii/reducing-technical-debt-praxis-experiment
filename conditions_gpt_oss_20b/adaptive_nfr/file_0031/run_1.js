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

    /**
     * @private
     * @param {Object} event
     * @returns {boolean}
     */
    isSignupOrSubscriptionCreatedWithSignup(event) {
        return event.type === 'signup_event' || (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup);
    }

    getAction(event, hasMultipleNewsletters) {
        if (this.isSignupOrSubscriptionCreatedWithSignup(event)) {
            return 'signed up';
        }
        if (event.type === 'login_event') return 'logged in';
        if (event.type === 'payment_event') return 'made payment';
        if (event.type === 'newsletter_event') {
            const newsletter = hasMultipleNewsletters && event.data.newsletter?.name ? event.data.newsletter.name : 'newsletter';
            return event.data.subscribed ? `subscribed to ${newsletter}` : `unsubscribed from ${newsletter}`;
        }
        if (event.type === 'subscription_event') {
            switch (event.data.type) {
                case 'created': return 'started paid subscription';
                case 'updated': return 'changed paid subscription';
                case 'canceled': return 'canceled paid subscription';
                case 'reactivated': return 'reactivated paid subscription';
                case 'expired': return 'ended paid subscription';
                default: return 'changed paid subscription';
            }
        }
        if (event.type === 'email_opened_event') return 'opened email';
        if (event.type === 'email_sent_event') return 'sent email';
        if (event.type === 'automated_email_sent_event') {
            const slug = event.data.automatedEmail?.slug || '';
            const emailType = slug.includes('paid') ? 'Paid' : 'Free';
            return `received welcome email (${emailType})`;
        }
        if (event.type === 'email_delivered_event') return 'received email';
        if (event.type === 'email_failed_event') return 'bounced email';
        if (event.type === 'email_complaint_event') return 'email flagged as spam';
        if (event.type === 'comment_event') {
            return event.data.parent ? 'replied to comment' : 'commented';
        }
        if (event.type === 'click_event') return 'clicked link in email';
        if (event.type === 'aggregated_click_event') {
            return event.data.count.clicks <= 1 ? 'clicked link in email' : `clicked ${ghPluralize(event.data.count.clicks, 'link')} in email`;
        }
        if (event.type === 'feedback_event') {
            return event.data.score === 1 ? 'more like this' : 'less like this';
        }
        if (event.type === 'email_change_event') {
            if (event.data.from_email && event.data.to_email) {
                return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
            }
            return 'Email address changed';
        }
        if (event.type === 'donation_event') return 'Made a one-time payment';
    }

    getJoin() {
        return '–';
    }

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
            if (mrrDelta === 0) return;
            const symbol = getSymbol(event.data.currency);
            if (event.data.type === 'created') {
                const sign = mrrDelta > 0 ? '' : '-';
                const tierName = this.membersUtils.hasMultipleTiers ? (event.data.tierName ?? 'Paid') : 'Paid';
                return `${tierName} ${sign}${symbol}${Math.abs(mrrDelta)}/month`;
            }
            const sign = mrrDelta > 0 ? '+' : '-';
            return `MRR ${sign}${symbol}${Math.abs(mrrDelta)}`;
        }
        return this._getInfoForNonSubscription(event);
    }

    _getInfoForNonSubscription(event) {
        if (event.type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }
        if (event.type === 'donation_event') {
            const symbol = getSymbol(event.data.currency);
            return symbol + getNonDecimal(event.data.amount, event.data.currency);
        }
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

    getURL(event) {
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type) && event.data.post) {
            return event.data.post.url;
        }
        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type) && event.data.attribution?.url) {
            return event.data.attribution.url;
        }
        return;
    }

    getRoute(event) {
        if (['click_event', 'feedback_event'].includes(event.type) && event.data.post) {
            return {
                name: 'posts-x',
                model: event.data.post.id
            };
        }
        if (['signup_event', 'subscription_event'].includes(event.type) && event.data.attribution_type === 'post') {
            return {
                name: 'posts-x',
                model: event.data.attribution_id
            };
        }
        return;
    }
}