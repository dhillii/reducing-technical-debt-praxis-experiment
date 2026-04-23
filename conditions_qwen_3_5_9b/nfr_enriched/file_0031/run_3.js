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
     * Trims a string value and returns null if empty or undefined.
     * @param {any} value - The value to trim.
     * @returns {string|null} The trimmed string or null.
     */
    trimString(value) {
        if (!value && value !== 0) {
            return null;
        }

        const trimmed = String(value).trim();
        return trimmed || null;
    }

    /**
     * Main computation logic for parsing member events.
     * @param {Array} args - The arguments passed to the helper.
     * @returns {Object} The parsed event data.
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

    /**
     * Determines the appropriate icon for a given event type.
     * @param {Object} event - The event object.
     * @returns {string} The icon class name.
     */
    getIcon(event) {
        const type = event.type;

        switch (type) {
            case 'login_event':
                return 'logged-in';
            case 'payment_event':
                return 'subscriptions';
            case 'newsletter_event':
                return event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
            case 'subscription_event':
                return event.data.type === 'canceled' ? 'canceled-subscription' : 'subscriptions';
            case 'signup_event':
            case 'subscription_event':
                if (type === 'subscription_event' && event.data.type === 'created' && event.data.signup) {
                    return 'signed-up';
                }
                return 'signed-up';
            case 'email_opened_event':
                return 'opened-email';
            case 'email_sent_event':
            case 'automated_email_sent_event':
                return 'sent-email';
            case 'email_delivered_event':
                return 'received-email';
            case 'email_failed_event':
                return 'email-delivery-failed';
            case 'email_complaint_event':
                return 'email-delivery-spam';
            case 'comment_event':
                return 'comment';
            case 'click_event':
            case 'aggregated_click_event':
                return 'click';
            case 'feedback_event':
                return event.data.score === 1 ? 'more-like-this' : 'less-like-this';
            case 'donation_event':
                return 'subscriptions';
            case 'email_change_event':
                return 'email-changed';
            default:
                return 'event-unknown';
        }
    }

    /**
     * Determines the action description for a given event type.
     * @param {Object} event - The event object.
     * @param {boolean} hasMultipleNewsletters - Whether multiple newsletters are enabled.
     * @returns {string} The action description.
     */
    getAction(event, hasMultipleNewsletters) {
        const type = event.type;

        switch (type) {
            case 'signup_event':
            case 'subscription_event':
                if (type === 'subscription_event' && event.data.type === 'created' && event.data.signup) {
                    return 'signed up';
                }
                return 'signed up';
            case 'login_event':
                return 'logged in';
            case 'payment_event':
                return 'made payment';
            case 'newsletter_event':
                const newsletter = hasMultipleNewsletters && event.data.newsletter?.name ? event.data.newsletter.name : 'newsletter';
                return event.data.subscribed ? `subscribed to ${newsletter}` : `unsubscribed from ${newsletter}`;
            case 'subscription_event':
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
            case 'email_opened_event':
                return 'opened email';
            case 'email_sent_event':
                return 'sent email';
            case 'automated_email_sent_event':
                const emailSlug = event.data.automatedEmail?.slug || '';
                const emailType = emailSlug.includes('paid') ? 'Paid' : 'Free';
                return `received welcome email (${emailType})`;
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
                const clickCount = event.data.count.clicks;
                return clickCount <= 1 ? 'clicked link in email' : `clicked ${ghPluralize(clickCount, 'link')} in email`;
            case 'feedback_event':
                return event.data.score === 1 ? 'more like this' : 'less like this';
            case 'email_change_event':
                if (event.data.from_email && event.data.to_email) {
                    return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
                }
                return 'Email address changed';
            case 'donation_event':
                return 'Made a one-time payment';
            default:
                return '';
        }
    }

    /**
     * Gets the subject line for the event.
     * @param {Object} event - The event object.
     * @param {string} memberName - The trimmed member name.
     * @returns {string} The subject line.
     */
    getSubject(event, memberName) {
        if (event.data.member) {
            return memberName || event.data.member.email;
        }
        return event.data.name || event.data.email || '';
    }

    /**
     * Gets the join string for combining action and object.
     * @returns {string} The join string.
     */
    getJoin() {
        return '–';
    }

    /**
     * Gets the object associated with the event.
     * @param {Object} event - The event object.
     * @returns {string} The object title or empty string.
     */
    getObject(event) {
        const type = event.type;

        if (type === 'signup_event' || type === 'subscription_event' || type === 'donation_event') {
            if (event.data.attribution?.title) {
                return event.data.attribution.title;
            }
        }

        if (type === 'comment_event') {
            if (event.data.post) {
                return event.data.post.title;
            }
        }

        if (type === 'click_event' || type === 'feedback_event') {
            if (event.data.post) {
                return event.data.post.title;
            }
        }

        return '';
    }

    /**
     * Gets the source information for the event.
     * @param {Object} event - The event object.
     * @returns {Object|null} The source object or null.
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
     * Gets the info string for the event.
     * @param {Object} event - The event object.
     * @returns {string|null} The info string or null.
     */
    getInfo(event) {
        const type = event.type;

        if (type === 'subscription_event') {
            const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
            if (mrrDelta === 0) {
                return null;
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

        if (type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
            return 'Free';
        }

        if (type === 'donation_event') {
            const symbol = getSymbol(event.data.currency);
            const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
            return formattedAmount;
        }

        return null;
    }

    /**
     * Gets the description for the event.
     * @param {Object} event - The event object.
     * @returns {string|null} The description or null.
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
        return null;
    }

    /**
     * Gets the URL for the event.
     * @param {Object} event - The event object.
     * @returns {string|null} The URL or null.
     */
    getURL(event) {
        const type = event.type;

        if (['comment_event', 'click_event', 'feedback_event'].includes(type)) {
            if (event.data.post) {
                return event.data.post.url;
            }
        }

        if (['signup_event', 'subscription_event', 'donation_event'].includes(type)) {
            if (event.data.attribution && event.data.attribution.url) {
                return event.data.attribution.url;
            }
        }
        return null;
    }

    /**
     * Gets the route object for the event.
     * @param {Object} event - The event object.
     * @returns {Object|null} The route object or null.
     */
    getRoute(event) {
        const type = event.type;

        if (['click_event', 'feedback_event'].includes(type)) {
            if (event.data.post) {
                return {
                    name: 'posts-x',
                    model: event.data.post.id
                };
            }
        }

        if (['signup_event', 'subscription_event'].includes(type)) {
            if (event.data.attribution_type === 'post') {
                return {
                    name: 'posts-x',
                    model: event.data.attribution_id
                };
            }
        }
        return null;
    }
}