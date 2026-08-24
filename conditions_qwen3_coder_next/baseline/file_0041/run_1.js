async processEvent(event, recipientCache) {
        const handlerMap = {
            delivered: () => this.eventProcessor.handleDelivered({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache),
            opened: () => this.eventProcessor.handleOpened({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache),
            failed: () => event.severity === 'permanent' 
                ? this.eventProcessor.handlePermanentFailed({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, {id: event.id, timestamp: event.timestamp, error: event.error}, recipientCache)
                : this.eventProcessor.handleTemporaryFailed({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, {id: event.id, timestamp: event.timestamp, error: event.error}, recipientCache),
            unsubscribed: () => this.eventProcessor.handleUnsubscribed({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache),
            complained: () => this.eventProcessor.handleComplained({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache)
        };

        const handler = handlerMap[event.type];
        if (!handler) {
            return new EventProcessingResult({unhandled: 1});
        }

        try {
            const recipient = await handler();

            if (recipient) {
                return new EventProcessingResult({
                    [event.type]: 1,
                    emailIds: [recipient.emailId],
                    memberIds: [recipient.memberId]
                });
            }

            return new EventProcessingResult({unprocessable: 1});
        } catch (error) {
            logging.error('[EmailAnalytics] Error processing event:', error);
            return new EventProcessingResult({unprocessable: 1});
        }
    }