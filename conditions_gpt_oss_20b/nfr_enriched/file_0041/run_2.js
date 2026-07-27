/**
     * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
     * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
     * @returns {Promise<EventProcessingResult>}
     */
    async processEvent(event, recipientCache) {
        const handler = this.#getEventHandler(event);
        return handler(event, recipientCache);
    }

    /**
     * Returns the appropriate event handler based on event type and severity.
     * @private
     * @param {{type: string; severity?: string}} event
     * @returns {(event: any, cache?: Map<string, any>) => Promise<EventProcessingResult>}
     */
    #getEventHandler(event) {
        switch (event.type) {
            case 'delivered':
                return this.#handleDeliveredEvent.bind(this);
            case 'opened':
                return this.#handleOpenedEvent.bind(this);
            case 'failed':
                return event.severity === 'permanent'
                    ? this.#handlePermanentFailedEvent.bind(this)
                    : this.#handleTemporaryFailedEvent.bind(this);
            case 'unsubscribed':
                return this.#handleUnsubscribedEvent.bind(this);
            case 'complained':
                return this.#handleComplainedEvent.bind(this);
            default:
                return this.#handleUnhandledEvent.bind(this);
        }
    }

    /**
     * Handles a delivered event.
     * @private
     * @param {{emailId: string; providerId: string; recipientEmail: string; timestamp: Date}} event
     * @param {Map<string, any>} [recipientCache]
     * @returns {Promise<EventProcessingResult>}
     */
    async #handleDeliveredEvent(event, recipientCache) {
        const recipient = await this.eventProcessor.handleDelivered(
            {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
            event.timestamp,
            recipientCache
        );

        if (recipient) {
            return new EventProcessingResult({
                delivered: 1,
                emailIds: [recipient.emailId],
                memberIds: [recipient.memberId]
            });
        }

        return new EventProcessingResult({unprocessable: 1});
    }

    /**
     * Handles an opened event.
     * @private
     * @param {{emailId: string; providerId: string; recipientEmail: string; timestamp: Date}} event
     * @param {Map<string, any>} [recipientCache]
     * @returns {Promise<EventProcessingResult>}
     */
    async #handleOpenedEvent(event, recipientCache) {
        const recipient = await this.eventProcessor.handleOpened(
            {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
            event.timestamp,
            recipientCache
        );

        if (recipient) {
            return new EventProcessingResult({
                opened: 1,
                emailIds: [recipient.emailId],
                memberIds: [recipient.memberId]
            });
        }

        return new EventProcessingResult({unprocessable: 1});
    }

    /**
     * Handles a permanent failed event.
     * @private
     * @param {{emailId: string; providerId: string; recipientEmail: string; id: string; timestamp: Date; error: any}} event
     * @param {Map<string, any>} [recipientCache]
     * @returns {Promise<EventProcessingResult>}
     */
    async #handlePermanentFailedEvent(event, recipientCache) {
        const recipient = await this.eventProcessor.handlePermanentFailed(
            {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
            {id: event.id, timestamp: event.timestamp, error: event.error},
            recipientCache
        );

        if (recipient) {
            return new EventProcessingResult({
                permanentFailed: 1,
                emailIds: [recipient.emailId],
                memberIds: [recipient.memberId]
            });
        }

        return new EventProcessingResult({unprocessable: 1});
    }

    /**
     * Handles a temporary failed event.
     * @private
     * @param {{emailId: string; providerId: string; recipientEmail: string; id: string; timestamp: Date; error: any}} event
     * @param {Map<string, any>} [recipientCache]
     * @returns {Promise<EventProcessingResult>}
     */
    async #handleTemporaryFailedEvent(event, recipientCache) {
        const recipient = await this.eventProcessor.handleTemporaryFailed(
            {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
            {id: event.id, timestamp: event.timestamp, error: event.error},
            recipientCache
        );

        if (recipient) {
            return new EventProcessingResult({
                temporaryFailed: 1,
                emailIds: [recipient.emailId],
                memberIds: [recipient.memberId]
            });
        }

        return new EventProcessingResult({unprocessable: 1});
    }

    /**
     * Handles an unsubscribed event.
     * @private
     * @param {{emailId: string; providerId: string; recipientEmail: string; timestamp: Date}} event
     * @param {Map<string, any>} [recipientCache]
     * @returns {Promise<EventProcessingResult>}
     */
    async #handleUnsubscribedEvent(event, recipientCache) {
        const recipient = await this.eventProcessor.handleUnsubscribed(
            {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
            event.timestamp,
            recipientCache
        );

        if (recipient) {
            return new EventProcessingResult({
                unsubscribed: 1,
                emailIds: [recipient.emailId],
                memberIds: [recipient.memberId]
            });
        }

        return new EventProcessingResult({unprocessable: 1});
    }

    /**
     * Handles a complained event.
     * @private
     * @param {{emailId: string; providerId: string; recipientEmail: string; timestamp: Date}} event
     * @param {Map<string, any>} [recipientCache]
     * @returns {Promise<EventProcessingResult>}
     */
    async #handleComplainedEvent(event, recipientCache) {
        const recipient = await this.eventProcessor.handleComplained(
            {emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail},
            event.timestamp,
            recipientCache
        );

        if (recipient) {
            return new EventProcessingResult({
                complained: 1,
                emailIds: [recipient.emailId],
                memberIds: [recipient.memberId]
            });
        }

        return new EventProcessingResult({unprocessable: 1});
    }

    /**
     * Handles any event type that is not explicitly supported.
     * @private
     * @param {any} event
     * @returns {Promise<EventProcessingResult>}
     */
    async #handleUnhandledEvent(event) {
        return new EventProcessingResult({unhandled: 1});
    }