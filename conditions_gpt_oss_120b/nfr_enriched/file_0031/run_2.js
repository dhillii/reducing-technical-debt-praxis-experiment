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

    /** Determine the appropriate icon for an event */
    getIcon(event) {
        const type = event.type;
        let icon = '';

        if (type === 'login_event') {
            icon = 'logged-in';
        } else if (type === 'payment_event') {
            icon = 'subscriptions';
        } else if (type === 'newsletter_event') {
            icon = event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
        } else if (type === 'subscription_event') {
            icon = this._iconForSubscription(event);
        } else if (type === 'signup_event' || (type === 'subscription_event' && event.data.type === 'created' && event.data.signup)) {
            icon = 'signed-up';
        } else if (type === 'email_opened_event') {
            icon = 'opened-email';
        } else if (type === 'email_sent_event' || type === 'automated_email_sent_event') {
            icon = 'sent-email';
        } else if (type === 'email_delivered_event') {
            icon = 'received-email';
        } else if (type === 'email_failed_event') {
            icon = 'email-delivery-failed';
        } else if (type === 'email_complaint_event') {
            icon = 'email-delivery-spam';
        } else if (type === 'comment_event') {
            icon = 'comment';
        } else if (type === 'click_event' || type === 'aggregated_click_event') {
            icon = 'click';
        } else if (type === 'feedback_event') {
            icon = event.data.score === 1 ? 'more-like-this' : 'less-like-this';
        } else if (type === 'donation_event') {
            icon = 'subscriptions';
        } else if (type === 'email_change_event') {
            icon = 'email-changed';
        }

        return 'event-' + icon;
    }

    /** Helper for subscription‑related icons */
    _iconForSubscription(event) {
        if (event.data.type === 'canceled') {
            return 'canceled-subscription';
        }
        return 'subscriptions';
    }

    /** Determine the action description for an event */
    getAction(event, hasMultipleNewsletters) {
        const type = event.type;

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
            return this._actionForNewsletter(event, hasMultipleNewsletters);
        }
        if (type === 'subscription_event') {
            return this._actionForSubscription(event);
        }
        if (type === 'email_opened_event') {
            return 'opened email';
        }
        if (type === 'email_sent_event') {
            return 'sent email';
        }
        if (type === 'automated_email_sent_event') {
            return this._actionForAutomatedEmail(event);
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
            return this._actionForAggregatedClick(event);
        }
        if (type === 'feedback_event') {
            return event.data.score === 1 ? 'more like this' : 'less like this';
        }
        if (type === 'email_change_event') {
            return this._actionForEmailChange(event);
        }
        if (type === 'donation_event') {
            return 'Made a one-time payment';
        }
    }

    /** Action text for newsletter events */
    _actionForNewsletter(event, hasMultipleNewsletters) {
        let name = 'newsletter';
        if (hasMultipleNewsletters && event.data.newsletter?.name) {
            name = event.data.newsletter.name;
        }
        return event.data.subscribed ? `subscribed to ${name}` : `unsubscribed from ${name}`;
    }

    /** Action text for subscription events */
    _actionForSubscription(event) {
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

    /** Action text for automated welcome emails */
    _actionForAutomatedEmail(event) {
        const slug = event.data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    /** Action text for aggregated click events */
    _actionForAggregatedClick(event) {
        const clicks = event.data.count?.clicks ?? 0;
        if (clicks <= 1) {
            return 'clicked link in email';
        }
        return `clicked ${ghPluralize(clicks, 'link')} in email`;
    }

    /** Action text for email‑change events */
    _actionForEmailChange(event) {
        if (event.data.from_email && event.data.to_email) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }
        return 'Email address changed';
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
            return symbol + getNonDecimal(event.data.amount, event.data.currency);
        }
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
    }

    getURL(event) {
        const type = event.type;
        if (['comment_event', 'click_event', 'feedback_event'].includes(type) && event.data.post) {
            return event.data.post.url;
        }
        if (['signup_event', 'subscription_event', 'donation_event'].includes(type) && event.data.attribution?.url) {
            return event.data.attribution.url;
        }
    }

    getRoute(event) {
        const type = event.type;
        if (['click_event', 'feedback_event'].includes(type) && event.data.post) {
            return {name: 'posts-x', model: event.data.post.id};
        }
        if (['signup_event', 'subscription_event'].includes(type) && event.data.attribution_type === 'post') {
            return {name: 'posts-x', model: event.data.attribution_id};
        }
    }
}