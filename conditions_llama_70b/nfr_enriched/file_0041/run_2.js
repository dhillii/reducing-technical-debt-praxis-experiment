/**
 * Process a single email analytics event.
 * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
 * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
 * @returns {Promise<EventProcessingResult>}
 */
async processEvent(event, recipientCache) {
    // Extract event type and handle accordingly
    const eventType = event.type;
    const eventHandler = getEventHandler(eventType);
    return eventHandler(event, recipientCache);
}

/**
 * Get the event handler for a given event type.
 * @param {string} eventType - The type of event to handle.
 * @returns {(event: any, recipientCache: Map<string, any>) => Promise<EventProcessingResult>} The event handler function.
 */
function getEventHandler(eventType) {
    switch (eventType) {
        case 'delivered':
            return handleDeliveredEvent;
        case 'opened':
            return handleOpenedEvent;
        case 'failed':
            return handleFailedEvent;
        case 'unsubscribed':
            return handleUnsubscribedEvent;
        case 'complained':
            return handleComplainedEvent;
        default:
            return handleUnhandledEvent;
    }
}

/**
 * Handle a delivered event.
 * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
 * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
 * @returns {Promise<EventProcessingResult>}
 */
async function handleDeliveredEvent(event, recipientCache) {
    const recipient = await this.eventProcessor.handleDelivered({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);
    return createEventResult(recipient, 'delivered');
}

/**
 * Handle an opened event.
 * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
 * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
 * @returns {Promise<EventProcessingResult>}
 */
async function handleOpenedEvent(event, recipientCache) {
    const recipient = await this.eventProcessor.handleOpened({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);
    return createEventResult(recipient, 'opened');
}

/**
 * Handle a failed event.
 * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
 * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
 * @returns {Promise<EventProcessingResult>}
 */
async function handleFailedEvent(event, recipientCache) {
    if (event.severity === 'permanent') {
        const recipient = await this.eventProcessor.handlePermanentFailed({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, {id: event.id, timestamp: event.timestamp, error: event.error}, recipientCache);
        return createEventResult(recipient, 'permanentFailed');
    } else {
        const recipient = await this.eventProcessor.handleTemporaryFailed({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, {id: event.id, timestamp: event.timestamp, error: event.error}, recipientCache);
        return createEventResult(recipient, 'temporaryFailed');
    }
}

/**
 * Handle an unsubscribed event.
 * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
 * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
 * @returns {Promise<EventProcessingResult>}
 */
async function handleUnsubscribedEvent(event, recipientCache) {
    const recipient = await this.eventProcessor.handleUnsubscribed({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);
    return createEventResult(recipient, 'unsubscribed');
}

/**
 * Handle a complained event.
 * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
 * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
 * @returns {Promise<EventProcessingResult>}
 */
async function handleComplainedEvent(event, recipientCache) {
    const recipient = await this.eventProcessor.handleComplained({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);
    return createEventResult(recipient, 'complained');
}

/**
 * Handle an unhandled event.
 * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
 * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
 * @returns {Promise<EventProcessingResult>}
 */
async function handleUnhandledEvent(event, recipientCache) {
    return new EventProcessingResult({unhandled: 1});
}

/**
 * Create an event result based on the recipient and event type.
 * @param {any} recipient - The recipient object.
 * @param {string} eventType - The type of event.
 * @returns {EventProcessingResult}
 */
function createEventResult(recipient, eventType) {
    if (recipient) {
        return new EventProcessingResult({
            [eventType]: 1,
            emailIds: [recipient.emailId],
            memberIds: [recipient.memberId]
        });
    }

    return new EventProcessingResult({unprocessable: 1});
}