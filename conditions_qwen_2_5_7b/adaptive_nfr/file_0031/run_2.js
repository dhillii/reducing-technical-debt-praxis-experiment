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

    getSubject(event, memberName) {
        if (event.data.member) {
            return memberName || event.data.member.email;
        }
        return event.data.name || event.data.email || '';
    }

    getIcon(event) {
        const getIconForType = (type) => {
            switch (type) {
                case 'login_event':
                    return 'logged-in';
                case 'payment_event':
                    return 'subscriptions';
                case 'newsletter_event':
                    return event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email';
                case 'subscription_event':
                    return 'subscriptions';
                    // ... other cases
                default:
                    return null;
            }
        };

        return `event-${getIconForType(event.type)}`;
    }

    getAction(event, hasMultipleNewsletters) {
        const getActionForType = (type) => {
            switch (type) {
                case 'signup_event':
                case 'subscription_event':
                    return event.data.type === 'created' && event.data.signup ? 'signed up' : 'started paid subscription';
                case 'login_event':
                    return 'logged in';
                case 'payment_event':
                    return 'made payment';
                case 'newsletter_event':
                    return event.data.subscribed ? 'subscribed to ' + (hasMultipleNewsletters && event.data.newsletter.name || 'newsletter') : 'unsubscribed from ' + (hasMultipleNewsletters && event.data.newsletter.name || 'newsletter');
                // ... other cases
                default:
                    return null;
            }
        };

        return getActionForType(event.type);
    }

    getJoin() {
        return '–';
    }

    getObject(event) {
        const getObjectForType = (type) => {
            switch (type) {
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
        };

        return getObjectForType(event.type);
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
        const getInfoForType = (type) => {
            switch (type) {
                case 'subscription_event':
                    const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
                    if (mrrDelta === 0) {
                        return;
                    }
                    const symbol = getSymbol(event.data.currency);
                    if (event.data.type === 'created') {
                        const tierName = this.membersUtils.hasMultipleTiers ? (event.data.tierName ?? 'Paid') : 'Paid';
                        return `${tierName} ${mrrDelta > 0 ? '' : '-'}${symbol}${Math.abs(mrrDelta)}/month`;
                    }
                    return `MRR ${mrrDelta > 0 ? '+' : '-'}${symbol}${Math.abs(mrrDelta)}`;
                case 'signup_event':
                    if (this.membersUtils.paidMembersEnabled) {
                        return 'Free';
                    }
                    return;
                case 'donation_event':
                    const formattedAmount = getSymbol(event.data.currency) + getNonDecimal(event.data.amount, event.data.currency);
                    return formattedAmount;
                default:
                    return;
            }
        };

        return getInfoForType(event.type);
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
        const getURLForType = (type) => {
            switch (type) {
                case 'comment_event':
                case 'click_event':
                case 'feedback_event':
                    return event.data.post?.url || '';
                case 'signup_event':
                case 'subscription_event':
                    return event.data.attribution?.url || '';
                default:
                    return '';
            }
        };

        return getURLForType(event.type);
    }

    getRoute(event) {
        const getRouteForType = (type) => {
            switch (type) {
                case 'click_event':
                case 'feedback_event':
                    return event.data.post ? {name: 'posts-x', model: event.data.post.id} : null;
                case 'signup_event':
                case 'subscription_event':
                    if (event.data.attribution_type === 'post') {
                        return {name: 'posts-x', model: event.data.attribution_id};
                    }
                    return null;
                default:
                    return null;
            }
        };

        return getRouteForType(event.type);
    }
}