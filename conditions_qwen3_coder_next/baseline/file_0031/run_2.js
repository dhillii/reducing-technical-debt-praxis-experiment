/* internal helper functions */
    getIcon(event) {
        const typeToIconMap = {
            'login_event': 'logged-in',
            'payment_event': 'subscriptions',
            'newsletter_event': () => event.data.subscribed ? 'subscribed-to-email' : 'unsubscribed-from-email',
            'donation_event': 'subscriptions',
            'email_change_event': 'email-changed',
            'email_opened_event': 'opened-email',
            'email_sent_event': 'sent-email',
            'automated_email_sent_event': 'sent-email',
            'email_delivered_event': 'received-email',
            'email_failed_event': 'email-delivery-failed',
            'email_complaint_event': 'email-delivery-spam',
            'comment_event': 'comment',
            'click_event': 'click',
            'aggregated_click_event': 'click',
            'feedback_event': () => event.data.score === 1 ? 'more-like-this' : 'less-like-this'
        };

        if (typeToIconMap[event.type]) {
            const icon = typeof typeToIconMap[event.type] === 'function' ? typeToIconMap[event.type]() : typeToIconMap[event.type];
            return 'event-' + icon;
        }

        if (event.type === 'subscription_event') {
            const type = event.data.type;
            if (type === 'canceled') {
                return 'event-canceled-subscription';
            }
            if (type === 'created' && event.data.signup) {
                return 'event-signed-up';
            }
        }

        return 'event-';
    }