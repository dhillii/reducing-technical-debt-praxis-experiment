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

        const member = this.getTransformedMember(event.data.member, memberName);

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

    getSubject(event, memberName) {
        if (event.data.member) {
            return memberName || event.data.member.email;
        }
        return event.data.name || event.data.email || '';
    }

    getTransformedMember(member, memberName) {
        if (!member) {
            return member;
        }
        return {
            ...member,
            name: memberName
        };
    }

    getIcon(event) {
        const icon = this.getIconForEventType(event);
        return icon ? `event-${icon}` : '';
    }

    getIconForEventType(event) {
        switch (event.type) {
            case 'login_event':
                return 'logged-in';
            case 'payment_event':
                return 'subscriptions';
            case 'newsletter_event':
                return event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
            case 'subscription_event':
                return event.data.type === 'canceled' ? 'canceled-subscription' : 'subscriptions';
            case 'signup_event':
            case 'subscription_event' when event.data.type === 'created' && event.data.signup:
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
                return '';
        }
    }

    getAction(event, hasMultipleNewsletters) {
        const action = this.getActionForEventType(event, hasMultipleNewsletters);
        return action ?? 'changed paid subscription';
    }

    getActionForEventType(event, hasMultipleNewsletters) {
        switch (event.type) {
            case 'signup_event':
            case 'subscription_event' when event.data.type === 'created' && event.data.signup:
                return 'signed up';
            case 'login_event':
                return 'logged in';
            case 'payment_event':
                return 'made payment';
            case 'newsletter_event':
                return this.getNewsletterAction(event, hasMultipleNewsletters);
            case 'subscription_event':
                return this.getSubscriptionAction(event);
            case 'email_opened_event':
                return 'opened email';
            case 'email_sent_event':
                return 'sent email';
            case 'automated_email_sent_event':
                return this.getAutomatedEmailAction(event);
            case 'email_delivered_event':
                return 'received email';
            case 'email_failed_event':
                return 'bounced email';
            case 'email_complaint_event':
                return 'email flagged as spam';
            case 'comment_event':
                return this.getCommentAction(event);
            case 'click_event':
                return 'clicked link in email';
            case 'aggregated_click_event':
                return this.getAggregatedClickAction(event);
            case 'feedback_event':
                return this.getFeedbackAction(event);
            case 'email_change_event':
                return this.getEmailChangeAction(event);
            case 'donation_event':
                return 'Made a one-time payment';
            default:
                return null;
        }
    }

    getNewsletterAction(event, hasMultipleNewsletters) {
        let newsletter = 'newsletter';
        if (hasMultipleNewsletters && event.data.newsletter?.name) {
            newsletter = event.data.newsletter.name;
        }
        return event.data.subscribed ? `subscribed to ${newsletter}` : `unsubscribed from ${newsletter}`;
    }

    getSubscriptionAction(event) {
        const type = event.data.type;
        switch (type) {
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
                return null;
        }
    }

    getAutomatedEmailAction(event) {
        const slug = event.data.automatedEmail?.slug || '';
        const emailType = slug.includes('paid') ? 'Paid' : 'Free';
        return `received welcome email (${emailType})`;
    }

    getCommentAction(event) {
        return event.data.parent ? 'replied to comment' : 'commented';
    }

    getAggregatedClickAction(event) {
        const count = event.data.count.clicks;
        return count <= 1 ? 'clicked link in email' : `clicked ${ghPluralize(count, 'link')} in email`;
    }

    getFeedbackAction(event) {
        return event.data.score === 1 ? 'more like this' : 'less like this';
    }

    getEmailChangeAction(event) {
        if (event.data.from_email && event.data.to_email) {
            return `Email address changed from ${event.data.from_email} to ${event.data.to_email}`;
        }
        return 'Email address changed';
    }

    getJoin() {
        return '–';
    }

    getObject(event) {
        switch (event.type) {
            case 'signup_event':
            case 'subscription_event':
            case 'donation_event':
                return event.data.attribution?.title ?? '';
            case 'comment_event':
                return event.data.post?.title ?? '';
            case 'click_event':
            case 'feedback_event':
                return event.data.post?.title ?? '';
            default:
                return '';
        }
    }

    getSource(event) {
        const attribution = event.data?.attribution;
        if (attribution?.referrer_source) {
            return {
                name: attribution.referrer_source,
                url: attribution.referrer_url ?? null
            };
        }
        return null;
    }

    getInfo(event) {
        switch (event.type) {
            case 'subscription_event':
                return this.getSubscriptionInfo(event);
            case 'signup_event':
                return this.membersUtils.paidMembersEnabled ? 'Free' : undefined;
            case 'donation_event':
                return this.getDonationInfo(event);
            default:
                return undefined;
        }
    }

    getSubscriptionInfo(event) {
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

    getDonationInfo(event) {
        const symbol = getSymbol(event.data.currency);
        const formattedAmount = symbol + getNonDecimal(event.data.amount, event.data.currency);
        return formattedAmount;
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
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type)) {
            return event.data.post?.url ?? undefined;
        }

        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type)) {
            return event.data.attribution?.url ?? undefined;
        }
        return;
    }

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