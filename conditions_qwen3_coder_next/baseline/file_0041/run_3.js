async processEvent(event, recipientCache) {
        const handlers = {
            delivered: () => this.handleDeliveredEvent(event, recipientCache),
            opened: () => this.handleOpenedEvent(event, recipientCache),
            failed: () => this.handleFailedEvent(event, recipientCache),
            unsubscribed: () => this.handleUnsubscribedEvent(event, recipientCache),
            complained: () => this.handleComplainedEvent(event, recipientCache)
        };

        const handler = handlers[event.type];
        return handler ? handler() : new EventProcessingResult({unhandled: 1});
    }

    async handleDeliveredEvent(event, recipientCache) {
        const recipient = await this.eventProcessor.handleDelivered({
            emailId: event.emailId,
            providerId: event.providerId,
            email: event.recipientEmail
        }, event.timestamp, recipientCache);

        if (recipient) {
            return new EventProcessingResult({
                delivered: 1,
                emailIds: [recipient.emailId],
                memberIds: [recipient.memberId]
            });
        }
        return new EventProcessingResult({unprocessable: 1});
    }

    async handleOpenedEvent(event, recipientCache) {
        const recipient = await this.eventProcessor.handleOpened({
            emailId: event.emailId,
            providerId: event.providerId,
            email: event.recipientEmail
        }, event.timestamp, recipientCache);

        if (recipient) {
            return new EventProcessingResult({
                opened: 1,
                emailIds: [recipient.emailId],
                memberIds: [recipient.memberId]
            });
        }
        return new EventProcessingResult({unprocessable: 1});
    }

    async handleFailedEvent(event, recipientCache) {
        const handler = event.severity === 'permanent'
            ? this.eventProcessor.handlePermanentFailed
            : this.eventProcessor.handleTemporaryFailed;

        const recipient = await handler({
            emailId: event.emailId,
            providerId: event.providerId,
            email: event.recipientEmail
        }, {id: event.id, timestamp: event.timestamp, error: event.error}, recipientCache);

        if (recipient) {
            return new EventProcessingResult({
                [event.severity === 'permanent' ? 'permanentFailed' : 'temporaryFailed']: 1,
                emailIds: [recipient.emailId],
                memberIds: [recipient.memberId]
            });
        }
        return new EventProcessingResult({unprocessable: 1});
    }

    async handleUnsubscribedEvent(event, recipientCache) {
        const recipient = await this.eventProcessor.handleUnsubscribed({
            emailId: event.emailId,
            providerId: event.providerId,
            email: event.recipientEmail
        }, event.timestamp, recipientCache);

        if (recipient) {
            return new EventProcessingResult({
                unsubscribed: 1,
                emailIds: [recipient.emailId],
                memberIds: [recipient.memberId]
            });
        }
        return new EventProcessingResult({unprocessable: 1});
    }

    async handleComplainedEvent(event, recipientCache) {
        const recipient = await this.eventProcessor.handleComplained({
            emailId: event.emailId,
            providerId: event.providerId,
            email: event.recipientEmail
        }, event.timestamp, recipientCache);

        if (recipient) {
            return new EventProcessingResult({
                complained: 1,
                emailIds: [recipient.emailId],
                memberIds: [recipient.memberId]
            });
        }
        return new EventProcessingResult({unprocessable: 1});
    }