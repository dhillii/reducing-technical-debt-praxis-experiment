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

    const icon = this.getEventIcon(event);
    const action = this.getActionText(event, hasMultipleNewsletters);
    const info = this.getEventInfo(event);
    const description = this.getEventDescription(event);

    const join = this.getJoin();
    const object = this.getEventObject(event);
    const url = this.getEventURL(event);
    const route = this.getEventRoute(event);
    const timestamp = moment(event.data.created_at);
    const source = this.getEventSource(event);

    const member = event.data.member
        ? { ...event.data.member, name: memberName }
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

getEventIcon(event) {
    const iconMap = this.buildIconMap();

    for (const [type, handler] of Object.entries(iconMap)) {
        if (event.type === type) {
            return 'event-' + handler(event);
        }
    }

    return 'event-none';
}

buildIconMap() {
    return {
        login_event: () => 'logged-in',
        payment_event: () => 'subscriptions',
        newsletter_event: (e) => e.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email',
        subscription_event: (e) => e.data.type === 'canceled' ? 'canceled-subscription' : 'subscriptions',
        signup_event: () => 'signed-up',
        email_opened_event: () => 'opened-email',
        email_sent_event: () => 'sent-email',
        automated_email_sent_event: () => 'sent-email',
        email_delivered_event: () => 'received-email',
        email_failed_event: () => 'email-delivery-failed',
        email_complaint_event: () => 'email-delivery-spam',
        comment_event: () => 'comment',
        click_event: () => 'click',
        aggregated_click_event: () => 'click',
        feedback_event: (e) => e.data.score === 1 ? 'more-like-this' : 'less-like-this',
        donation_event: () => 'subscriptions',
        email_change_event: () => 'email-changed',
        expired_event: () => 'expired-subscription'
    };
}

getActionText(event, hasMultipleNewsletters) {
    const actionMap = this.buildActionMap();

    for (const [type, handler] of Object.entries(actionMap)) {
        if (event.type === type) {
            return handler(event, hasMultipleNewsletters);
        }
    }

    return '';
}

buildActionMap() {
    return {
        signup_event: () => 'signed up',
        payment_event: () => 'made payment',
        newsletter_event: (e, hasMultiple) => {
            const newsletter = hasMultiple && e.data.newsletter?.name ? e.data.newsletter.name : 'newsletter';
            return e.data.subscribed ? `subscribed to ${newsletter}` : `unsubscribed from ${newsletter}`;
        },
        subscription_event: (e) => {
            const map = {
                created: 'started paid subscription',
                updated: 'changed paid subscription',
                canceled: 'canceled paid subscription',
                reactivated: 'reactivated paid subscription',
                expired: 'ended paid subscription'
            };
            return map[e.data.type] || 'changed paid subscription';
        },
        login_event: () => 'logged in',
        email_opened_event: () => 'opened email',
        email_sent_event: () => 'sent email',
        automated_email_sent_event: (e) => {
            const emailType = (e.data.automatedEmail?.slug || '').includes('paid') ? 'Paid' : 'Free';
            return `received welcome email (${emailType})`;
        },
        email_delivered_event: () => 'received email',
        email_failed_event: () => 'bounced email',
        email_complaint_event: () => 'email flagged as spam',
        comment_event: (e) => e.data.parent ? 'replied to comment' : 'commented',
        click_event: () => 'clicked link in email',
        aggregated_click_event: (e) => {
            const count = e.data.count?.clicks || 0;
            const text = count <= 1 ? 'clicked link in email' : `clicked ${ghPluralize(count, 'link')} in email`;
            return text;
        },
        feedback_event: (e) => e.data.score === 1 ? 'more like this' : 'less like this',
        email_change_event: (e) => {
            if (e.data.from_email && e.data.to_email) {
                return `Email address changed from ${e.data.from_email} to ${e.data.to_email}`;
            }
            return 'Email address changed';
        },
        donation_event: () => 'Made a one-time payment'
    };
}

getEventInfo(event) {
    if (event.type === 'subscription_event') {
        return this.formatSubscriptionInfo(event);
    }

    if (event.type === 'signup_event' && this.membersUtils.paidMembersEnabled) {
        return 'Free';
    }

    if (event.type === 'donation_event') {
        return this.formatDonationInfo(event);
    }

    return undefined;
}

formatSubscriptionInfo(event) {
    const mrrDelta = getNonDecimal(event.data.mrr_delta, event.data.currency);
    if (mrrDelta === 0) {
        return undefined;
    }

    const symbol = getSymbol(event.data.currency);
    const displayMrr = Math.abs(mrrDelta);

    if (event.data.type === 'created') {
        const sign = mrrDelta > 0 ? '' : '-';
        const tierName = this.membersUtils.hasMultipleTiers ? (event.data.tierName ?? 'Paid') : 'Paid';
        return `${tierName} ${sign}${symbol}${displayMrr}/month`;
    }

    const sign = mrrDelta > 0 ? '+' : '-';
    return `MRR ${sign}${symbol}${displayMrr}`;
}

formatDonationInfo(event) {
    const symbol = getSymbol(event.data.currency);
    const amount = getNonDecimal(event.data.amount, event.data.currency);
    return symbol + amount;
}

getEventDescription(event) {
    if (event.type === 'click_event') {
        try {
            return this.utils.cleanTrackedUrl(event.data.link.to, true);
        } catch (e) {
            return event.data.link.to;
        }
    }
    return undefined;
}

getEventObject(event) {
    const map = this.buildObjectMap();

    for (const [type, handler] of Object.entries(map)) {
        if (event.type === type) {
            return handler(event) ?? '';
        }
    }

    return '';
}

buildObjectMap() {
    return {
        signup_event: (e) => e.data.attribution?.title,
        subscription_event: (e) => e.data.attribution?.title,
        donation_event: (e) => e.data.attribution?.title,
        comment_event: (e) => e.data.post?.title,
        click_event: (e) => e.data.post?.title,
        feedback_event: (e) => e.data.post?.title
    };
}

getEventSource(event) {
    if (event.data?.attribution?.referrer_source) {
        return {
            name: event.data.attribution.referrer_source,
            url: event.data.attribution.referrer_url ?? null
        };
    }

    return null;
}

getEventURL(event) {
    const map = this.buildURLMap();

    for (const [type, handler] of Object.entries(map)) {
        if (event.type === type) {
            return handler(event) ?? undefined;
        }
    }

    return undefined;
}

buildURLMap() {
    return {
        comment_event: (e) => e.data.post?.url,
        click_event: (e) => e.data.post?.url,
        feedback_event: (e) => e.data.post?.url,
        signup_event: (e) => e.data.attribution?.url,
        subscription_event: (e) => e.data.attribution?.url,
        donation_event: (e) => e.data.attribution?.url
    };
}

getEventRoute(event) {
    const map = this.buildRouteMap();

    for (const [type, handler] of Object.entries(map)) {
        if (event.type === type) {
            return handler(event) ?? undefined;
        }
    }

    return undefined;
}

buildRouteMap() {
    return {
        click_event: (e) => ({ name: 'posts-x', model: e.data.post.id }),
        feedback_event: (e) => ({ name: 'posts-x', model: e.data.post.id }),
        signup_event: (e) => e.data.attribution_type === 'post' ? { name: 'posts-x', model: e.data.attribution_id } : undefined,
        subscription_event: (e) => e.data.attribution_type === 'post' ? { name: 'posts-x', model: e.data.attribution_id } : undefined
    };
}

getJoin() {
    return '–';
}