/**
 * Process an email analytics event.
 * @param {{id: string, type: any; severity: any; recipientEmail: any; emailId?: string; providerId: string; timestamp: Date; error: {code: number; message: string; enhandedCode: string|number} | null}} event
 * @param {Map<string, any>} [recipientCache] Optional cache for batched processing
 * @returns {Promise<EventProcessingResult>}
 */
async processEvent(event, recipientCache) {
    const eventHandlers = {
        'delivered': async () => {
            const recipient = await this.eventProcessor.handleDelivered({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);
            return recipient ? new EventProcessingResult({delivered: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]}) : new EventProcessingResult({unprocessable: 1});
        },
        'opened': async () => {
            const recipient = await this.eventProcessor.handleOpened({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);
            return recipient ? new EventProcessingResult({opened: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]}) : new EventProcessingResult({unprocessable: 1});
        },
        'failed': async () => {
            if (event.severity === 'permanent') {
                const recipient = await this.eventProcessor.handlePermanentFailed({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, {id: event.id, timestamp: event.timestamp, error: event.error}, recipientCache);
                return recipient ? new EventProcessingResult({permanentFailed: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]}) : new EventProcessingResult({unprocessable: 1});
            } else {
                const recipient = await this.eventProcessor.handleTemporaryFailed({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, {id: event.id, timestamp: event.timestamp, error: event.error}, recipientCache);
                return recipient ? new EventProcessingResult({temporaryFailed: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]}) : new EventProcessingResult({unprocessable: 1});
            }
        },
        'unsubscribed': async () => {
            const recipient = await this.eventProcessor.handleUnsubscribed({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);
            return recipient ? new EventProcessingResult({unsubscribed: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]}) : new EventProcessingResult({unprocessable: 1});
        },
        'complained': async () => {
            const recipient = await this.eventProcessor.handleComplained({emailId: event.emailId, providerId: event.providerId, email: event.recipientEmail}, event.timestamp, recipientCache);
            return recipient ? new EventProcessingResult({complained: 1, emailIds: [recipient.emailId], memberIds: [recipient.memberId]}) : new EventProcessingResult({unprocessable: 1});
        }
    };

    const handler = eventHandlers[event.type];
    if (handler) {
        return await handler();
    }

    return new EventProcessingResult({unhandled: 1});
}