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
     * Convert empty or whitespace strings to null.
     */
    trimString(value) {
        if (!value && value !== 0) {
            return null;
        }
        const trimmed = String(value).trim();
        return trimmed || null;
    }

    /**
     * Compute the event details object.
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
     * Determine the subject string for the event.
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
        const ICON_MAP = {
            login_event: 'logged-in',
            payment_event: 'subscriptions',
            newsletter_event: (e) => (e.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email'),
            subscription_event: (e) => (e.data.type === 'canceled' ? 'canceled-subscription' : 'subscriptions'),
            signup_event: 'signed-up',
            email_opened_event: 'opened-email',
            email_sent_event: 'sent-email',
            automated_email_sent_event: 'sent-email',
            email_delivered_event: 'received-email',
            email_failed_event: 'email-delivery-failed',
            email_complaint_event: 'email-delivery-spam',
            comment_event: 'comment',
            click_event: 'click',
            aggregated_click_event: 'click',
            feedback_event: (e) => (e.data.score === 1 ? 'more-like-this' : 'less-like-this'),
            donation_event: 'subscriptions',
            email_change_event: 'email-changed'
        };

        const entry = ICON_MAP[event.type];
        const icon = typeof entry === 'function' ? entry(event) : entry;
        return `event-${icon}`;
    }

    /**
     * Map event types to action strings.
     */
    getAction(event, hasMultipleNewsletters) {
        const ACTION_MAP = {
            signup_event: 'signed up',
            login_event: 'logged in',
            payment_event: 'made payment',
            newsletter_event: (e) => {
                const newsletter = hasMultipleNewsletters && e.data.newsletter && e.data.newsletter.name
                    ? e.data.newsletter.name
                    : 'newsletter';
                return e.data.subscribed
                    ? `subscribed to ${newsletter}`
                    : `unsubscribed from ${newsletter}`;
            },
            subscription_event: (e) => {
                switch (e.data.type) {
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
            },
            email_opened_event: 'opened email',
            email_sent_event: 'sent email',
            automated_email_sent_event: (e) => {
                const slug = e.data.automatedEmail?.slug || '';
                const emailType = slug.includes('paid') ? 'Paid' : 'Free';
                return `received welcome email (${emailType})`;
            },
            email_delivered_event: 'received email',
            email_failed_event: 'bounced email',
            email_complaint_event: 'email flagged as spam',
            comment_event: (e) => (e.data.parent ? 'replied to comment' : 'commented'),
            click_event: 'clicked link in email',
            aggregated_click_event: (e) => {
                if (e.data.count.clicks <= 1) {
                    return 'clicked link in email';
                }
                return `clicked ${ghPluralize(e.data.count.clicks, 'link')} in email`;
            },
            feedback_event: (e) => (e.data.score === 1 ? 'more like this' : 'less like this'),
            email_change_event: (e) => {
                if (e.data.from_email && e.data.to_email) {
                    return `Email address changed from ${e.data.from_email} to ${e.data.to_email}`;
                }
                return 'Email address changed';
            },
            donation_event: 'Made a one-time payment'
        };

        const entry = ACTION_MAP[event.type];
        const action = typeof entry === 'function' ? entry(event, hasMultipleNewsletters) : entry;
        return action;
    }

    /**
     * Join string used when action and object are in the same sentence.
     */
    getJoin() {
        return '–';
    }

    /**
     * Clickable object string for the event.
     */
    getObject(event) {
        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type)) {
            if (event.data.attribution?.title) {
                return event.data.attribution.title;
            }
        }
        if (event.type === 'comment_event' && event.data.post) {
            return event.data.post.title;
        }
        if (['click_event', 'feedback_event'].includes(event.type) && event.data.post) {
            return event.data.post.title;
        }
        return '';
    }

    /**
     * Source information for the event.
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

    /**
     * Additional info string for the event.
     */
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
    }

    /**
     * Description string for the event.
     */
    getDescription(event) {
        if (event.type === 'click_event') {
            try {
                return this.utils.cleanTrackedUrl(event.data.link.to, true);
            } catch (e) {
                // Invalid URL
            }
            return event.data.link.to;
        }
    }

    /**
     * URL for the clickable object.
     */
    getURL(event) {
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type) && event.data.post) {
            return event.data.post.url;
        }
        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type) && event.data.attribution?.url) {
            return event.data.attribution.url;
        }
    }

    /**
     * Route for the clickable object.
     */
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
    }
}