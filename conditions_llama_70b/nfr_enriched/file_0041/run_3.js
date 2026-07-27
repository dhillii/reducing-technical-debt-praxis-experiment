/**
 * Process a single email analytics event.
 * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
 * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
 * @returns {Promise<EventProcessingResult>}
 */
async processEvent(event, recipientCache) {
    // Extract event type and delegate to specific handler
    const eventTypeHandlers = {
        'delivered': this.handleDeliveredEvent,
        'opened': this.handleOpenedEvent,
        'failed': this.handleFailedEvent,
        'unsubscribed': this.handleUnsubscribedEvent,
        'complained': this.handleComplainedEvent
    };

    const handler = eventTypeHandlers[event.type];
    if (handler) {
        return handler(event, recipientCache);
    }

    // If no handler found, return unhandled event result
    return new EventProcessingResult({unhandled: 1});
}

/**
 * Handle a delivered email analytics event.
 * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
 * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
 * @returns {Promise<EventProcessingResult>}
 */
async handleDeliveredEvent(event, recipientCache) {
    const recipient = await this.eventProcessor.handleDelivered({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);

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
 * Handle an opened email analytics event.
 * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
 * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
 * @returns {Promise<EventProcessingResult>}
 */
async handleOpenedEvent(event, recipientCache) {
    const recipient = await this.eventProcessor.handleOpened({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);

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
 * Handle a failed email analytics event.
 * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
 * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
 * @returns {Promise<EventProcessingResult>}
 */
async handleFailedEvent(event, recipientCache) {
    if (event.severity === 'permanent') {
        return this.handlePermanentFailedEvent(event, recipientCache);
    } else {
        return this.handleTemporaryFailedEvent(event, recipientCache);
    }
}

/**
 * Handle a permanent failed email analytics event.
 * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
 * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
 * @returns {Promise<EventProcessingResult>}
 */
async handlePermanentFailedEvent(event, recipientCache) {
    const recipient = await this.eventProcessor.handlePermanentFailed({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, {id: event.id, timestamp: event.timestamp, error: event.error}, recipientCache);

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
 * Handle a temporary failed email analytics event.
 * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
 * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
 * @returns {Promise<EventProcessingResult>}
 */
async handleTemporaryFailedEvent(event, recipientCache) {
    const recipient = await this.eventProcessor.handleTemporaryFailed({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, {id: event.id, timestamp: event.timestamp, error: event.error}, recipientCache);

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
 * Handle an unsubscribed email analytics event.
 * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
 * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
 * @returns {Promise<EventProcessingResult>}
 */
async handleUnsubscribedEvent(event, recipientCache) {
    const recipient = await this.eventProcessor.handleUnsubscribed({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);

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
 * Handle a complained email analytics event.
 * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
 * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
 * @returns {Promise<EventProcessingResult>}
 */
async handleComplainedEvent(event, recipientCache) {
    const recipient = await this.eventProcessor.handleComplained({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);

    if (recipient) {
        return new EventProcessingResult({
            complained: 1,
            emailIds: [recipient.emailId],
            memberIds: [recipient.memberId]
        });
    }

    return new EventProcessingResult({unprocessable: 1});
}