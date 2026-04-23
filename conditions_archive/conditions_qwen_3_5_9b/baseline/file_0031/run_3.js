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

    getIcon(event) {
        const iconMap = {
            'login_event': 'logged-in',
            'payment_event': 'subscriptions',
            'newsletter_event': (e) => e.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email',
            'subscription_event': (e) => e.data.type === 'canceled' ? 'canceled-subscription' : 'subscriptions',
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
        if (typeof baseIcon === 'function') {
            return baseIcon(event);
        }
        return 'event-' + baseIcon;
    }

    getAction(event, hasMultipleNewsletters) {
        const actionMap = {
            'signup_event': 'signed up',
            'login_event': 'logged in',
            'payment_event': 'made payment',
            'newsletter_event': (e, hasMultipleNewsletters) => {
                let newsletter = 'newsletter';
                if (hasMultipleNewsletters && e.data.newsletter && e.data.newsletter.name) {
                    newsletter = e.data.newsletter.name;
                }
                return e.data.subscribed ? `subscribed to ${newsletter}` : `unsubscribed from ${newsletter}`;
            },
            'subscription_event': (e) => {
                switch (e.data.type) {
                    case 'created': return 'started paid subscription';
                    case 'updated': return 'changed paid subscription';
                    case 'canceled': return 'canceled paid subscription';
                    case 'reactivated': return 'reactivated paid subscription';
                    case 'expired': return 'ended paid subscription';
                    default: return 'changed paid subscription';
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
                if (e.data.count.clicks <= 1) {
                    return 'clicked link in email';
                }
                return `clicked ${ghPluralize(e.data.count.clicks, 'link')} in email`;
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

        const action = actionMap[event.type];
        if (typeof action === 'function') {
            return action(event, hasMultipleNewsletters);
        }
        return action;
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

        if (event.type === 'comment_event') {
            if (event.data.post) {
                return event.data.post.title;
            }
        }

        if (event.type === 'click_event' || event.type === 'feedback_event') {
            if (event.data.post) {
                return event.data.post.title;
            }
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
                // Invalid URL
            }
            return event.data.link.to;
        }
        return;
    }

    getURL(event) {
        if (['comment_event', 'click_event', 'feedback_event'].includes(event.type)) {
            if (event.data.post) {
                return event.data.post.url;
            }
        }

        if (['signup_event', 'subscription_event', 'donation_event'].includes(event.type)) {
            if (event.data.attribution && event.data.attribution.url) {
                return event.data.attribution.url;
            }
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
```