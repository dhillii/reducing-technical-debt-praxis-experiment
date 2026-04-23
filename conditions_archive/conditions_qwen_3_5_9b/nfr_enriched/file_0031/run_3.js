```javascript
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
        const subject = event.data.member ? (memberName || event.data.member.email) : (event.data.name || event.data.email || '');
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

    getIcon(event) {
        const iconMap = {
            'login_event': 'logged-in',
            'payment_event': 'subscriptions',
            'newsletter_event': (e) => e.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email',
            'subscription_event': (e) => {
                if (e.data.type === 'canceled') {
                    return 'canceled-subscription';
                }
                return 'subscriptions';
            },
            'signup_event': 'signed-up',
            'email_opened_event': 'opened-email',
            'email_sent_event': 'sent-email',
            'automated_email_sent_event': 'sent-email',
            'email_delivered_event': 'received-email',
            'email_failed_event': 'email-delivery-failed',
            'email_complaint_event': 'email-delivery-spam',
            'comment_event': 'comment',
            'click_event': 'click',
            'aggregated_click_event': 'click',
            'feedback_event': (e) => e.data.score === 1 ? 'more-like-this' : 'less-like-this',
            'donation_event': 'subscriptions',
            'email_change_event': 'email-changed'
        };

        const baseIcon = iconMap[event.type];
        return baseIcon ? 'event-' + baseIcon : 'event-';
    }

    getAction(event, hasMultipleNewsletters) {
        const actionMap = {
            'signup_event': 'signed up',
            'login_event': 'logged in',
            'payment_event': 'made payment',
            'newsletter_event': (e) => {
                const newsletter = hasMultipleNewsletters && e.data.newsletter?.name ? e.data.newsletter.name : 'newsletter';
                return e.data.subscribed ? `subscribed to ${newsletter}` : `unsubscribed from ${newsletter}`;
            },
            'subscription_event': (e) => {
                switch (e.data.type) {
                    case 'created':
                        return e.data.signup ? 'signed up' : 'started paid subscription';
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
            'email_opened_event': 'opened email',
            'email_sent_event': 'sent email',
            'automated_email_sent_event': (e) => {
                const slug = e.data.automatedEmail?.slug || '';
                const emailType = slug.includes('paid') ? 'Paid' : 'Free';
                return `received welcome email (${emailType})`;
            },
            'email_delivered_event': 'received email',
            'email_failed_event': 'bounced email',
            'email_complaint_event': 'email flagged as spam',
            'comment_event': (e) => e.data.parent ? 'replied to comment' : 'commented',
            'click_event': 'clicked link in email',
            'aggregated_click_event': (e) => {
                const count = e.data.count.clicks;
                return count <= 1 ? 'clicked link in email' : `clicked ${ghPluralize(count, 'link')} in email`;
            },
            'feedback_event': (e) => e.data.score === 1 ? 'more like this' : 'less like this',
            'email_change_event': (e) => {
                if (e.data.from_email && e.data.to_email) {
                    return `Email address changed from ${e.data.from_email} to ${e.data.to_email}`;
                }
                return 'Email address changed';
            },
            'donation_event': 'Made a one-time payment'
        };

        return actionMap[event.type]?.(event) || actionMap[event.type];
    }

    getJoin() {
        return '–';
    }

    getObject(event) {
        const objectMap = {
            'signup_event': (e) => e.data.attribution?.title || '',
            'subscription_event': (e) => e.data.attribution?.title || '',
            'donation_event': (e) => e.data.attribution?.title || '',
            'comment_event': (e) => e.data.post?.title || '',
            'click_event': (e) => e.data.post?.title || '',
            'feedback_event': (e) => e.data.post?.title || ''
        };

        return objectMap[event.type]?.(event) || '';
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
        const infoMap = {
            'subscription_event': (e) => {
                const mrrDelta = getNonDecimal(e.data.mrr_delta, e.data.currency);
                if (mrrDelta === 0) return;
                const symbol = getSymbol(e.data.currency);
                if (e.data.type === 'created') {
                    const sign = mrrDelta > 0 ? '' : '-';
                    const tierName = this.membersUtils.hasMultipleTiers ? (e.data.tierName ?? 'Paid') : 'Paid';
                    return `${tierName} ${sign}${symbol}${Math.abs(mrrDelta)}/month`;
                }
                const sign = mrrDelta > 0 ? '+' : '-';
                return `MRR ${sign}${symbol}${Math.abs(mrrDelta)}`;
            },
            'signup_event': (e) => this.membersUtils.paidMembersEnabled ? 'Free' : '',
            'donation_event': (e) => {
                const symbol = getSymbol(e.data.currency);
                const formattedAmount = symbol + getNonDecimal(e.data.amount, e.data.currency);
                return formattedAmount;
            }
        };

        return infoMap[event.type]?.(event);
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

    getURL(event) {
        const urlMap = {
            'comment_event': (e) => e.data.post?.url || '',
            'click_event': (e) => e.data.post?.url || '',
            'feedback_event': (e) => e.data.post?.url || '',
            'signup_event': (e) => e.data.attribution?.url || '',
            'subscription_event': (e) => e.data.attribution?.url || '',
            'donation_event': (e) => e.data.attribution?.url || ''
        };

        return urlMap[event.type]?.(event);
    }

    getRoute(event) {
        const routeMap = {
            'click_event': (e) => e.data.post ? {
                name: 'posts-x',
                model: e.data.post.id
            } : null,
            'feedback_event': (e) => e.data.post ? {
                name: 'posts-x',
                model: e.data.post.id
            } : null,
            'signup_event': (e) => e.data.attribution_type === 'post' ? {
                name: 'posts-x',
                model: e.data.attribution_id
            } : null,
            'subscription_event': (e) => e.data.attribution_type === 'post' ? {
                name: 'posts-x',
                model: e.data.attribution_id
            } : null
        };

        return routeMap[event.type]?.(event);
    }
}
```