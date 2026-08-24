getIcon(event) {
    if (this.isLoginEvent(event)) {
        return 'event-logged-in';
    }

    if (this.isPaymentEvent(event)) {
        return 'event-subscriptions';
    }

    if (this.isNewsletterEvent(event)) {
        return event.data.subscribed ? 'event-subscribed-to-email' : 'event-unsubscribed-from-email';
    }

    if (this.isSubscriptionEvent(event)) {
        if (event.data.type === 'canceled') {
            return 'event-canceled-subscription';
        }
        return 'event-subscriptions';
    }

    if (this.isSignupEvent(event)) {
        return 'event-signed-up';
    }

    if (this.isEmailOpenedEvent(event)) {
        return 'event-opened-email';
    }

    if (this.isEmailSentEvent(event)) {
        return 'event-sent-email';
    }

    if (this.isAutomatedEmailSentEvent(event)) {
        return 'event-sent-email';
    }

    if (this.isEmailDeliveredEvent(event)) {
        return 'event-received-email';
    }

    if (this.isEmailFailedEvent(event)) {
        return 'event-email-delivery-failed';
    }

    if (this.isEmailComplaintEvent(event)) {
        return 'event-email-delivery-spam';
    }

    if (this.isCommentEvent(event)) {
        return 'event-comment';
    }

    if (this.isClickEvent(event)) {
        return 'event-click';
    }

    if (this.isFeedbackEvent(event)) {
        return event.data.score === 1 ? 'event-more-like-this' : 'event-less-like-this';
    }

    if (this.isDonationEvent(event)) {
        return 'event-subscriptions';
    }

    if (this.isEmailChangeEvent(event)) {
        return 'event-email-changed';
    }

    return 'event-';
},

isLoginEvent(event) {
    return event.type === 'login_event';
},

isPaymentEvent(event) {
    return event.type === 'payment_event';
},

isNewsletterEvent(event) {
    return event.type === 'newsletter_event';
},

isSubscriptionEvent(event) {
    return event.type === 'subscription_event';
},

isSignupEvent(event) {
    return event.type === 'signup_event' || (event.type === 'subscription_event' && event.data.type === 'created' && event.data.signup);
},

isEmailOpenedEvent(event) {
    return event.type === 'email_opened_event';
},

isEmailSentEvent(event) {
    return event.type === 'email_sent_event';
},

isAutomatedEmailSentEvent(event) {
    return event.type === 'automated_email_sent_event';
},

isEmailDeliveredEvent(event) {
    return event.type === 'email_delivered_event';
},

isEmailFailedEvent(event) {
    return event.type === 'email_failed_event';
},

isEmailComplaintEvent(event) {
    return event.type === 'email_complaint_event';
},

isCommentEvent(event) {
    return event.type === 'comment_event';
},

isClickEvent(event) {
    return event.type === 'click_event' || event.type === 'aggregated_click_event';
},

isFeedbackEvent(event) {
    return event.type === 'feedback_event';
},

isDonationEvent(event) {
    return event.type === 'donation_event';
},

isEmailChangeEvent(event) {
    return event.type === 'email_change_event';
},