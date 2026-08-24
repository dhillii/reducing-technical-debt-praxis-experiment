getIcon(event) {
        const eventType = event.type;

        switch (eventType) {
        case 'login_event':
            return 'event-logged-in';
        case 'payment_event':
            return 'event-subscriptions';
        case 'newsletter_event':
            return `event-${event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email'}`;
        case 'subscription_event': {
            const type = event.data.type;
            if (type === 'canceled') {
                return 'event-canceled-subscription';
            }
            if (type === 'created' && event.data.signup) {
                return 'event-signed-up';
            }
            return 'event-subscriptions';
        }
        case 'signup_event':
            return 'event-signed-up';
        case 'email_opened_event':
            return 'event-opened-email';
        case 'email_sent_event':
        case 'automated_email_sent_event':
            return 'event-sent-email';
        case 'email_delivered_event':
            return 'event-received-email';
        case 'email_failed_event':
            return 'event-email-delivery-failed';
        case 'email_complaint_event':
            return 'event-email-delivery-spam';
        case 'comment_event':
            return 'event-comment';
        case 'click_event':
        case 'aggregated_click_event':
            return 'event-click';
        case 'feedback_event':
            return `event-${event.data.score === 1 ? 'more-like-this' : 'less-like-this'}`;
        case 'donation_event':
            return 'event-subscriptions';
        case 'email_change_event':
            return 'event-email-changed';
        default:
            return 'event-event';
        }
    }