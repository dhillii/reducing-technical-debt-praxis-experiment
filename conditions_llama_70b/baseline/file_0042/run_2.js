/**
 * @private
 * @param {{email: Email, newsletter: Newsletter, post: Post}} data
 * @returns {Promise<EmailBatch[]>}
 */
async createBatches({email, post, newsletter}) {
    logging.info(`Creating batches for email ${email.id}`);

    const domainWarmupLimit = this.#domainWarmingService.isEnabled() ? 
        Number.isInteger(email.get('csd_email_count')) ? email.get('csd_email_count') : Infinity : 
        Infinity;

    const segments = await this.#emailRenderer.getSegments(post);
    const batches = [];
    const BATCH_SIZE = this.#sendingService.getMaximumRecipients();
    let totalCount = 0;

    for (const segment of segments) {
        logging.info(`Creating batches for email ${email.id} segment ${segment}`);

        const segmentFilter = this.#emailSegmenter.getMemberFilterForSegment(newsletter, email.get('recipient_filter'), segment);
        const members = await this.getMembersForSegment(email.id, segmentFilter, BATCH_SIZE);

        const membersToProcess = Math.min(members.length, BATCH_SIZE);
        const shouldSplitBatch = domainWarmupLimit > 0 && domainWarmupLimit < membersToProcess;

        if (shouldSplitBatch) {
            totalCount += await this.createBatchWithRetry({
                email,
                segment,
                members: members.slice(0, domainWarmupLimit),
                useFallbackDomain: false,
                batches
            });
            totalCount += await this.createBatchWithRetry({
                email,
                segment,
                members: members.slice(domainWarmupLimit, membersToProcess),
                useFallbackDomain: true,
                batches
            });
        } else {
            totalCount += await this.createBatchWithRetry({
                email,
                segment,
                members: members.slice(0, membersToProcess),
                useFallbackDomain: totalCount >= domainWarmupLimit,
                batches
            });
        }
    }

    logging.info(`Created ${batches.length} batches for email ${email.id} with ${totalCount} recipients`);

    if (email.get('email_count') !== totalCount) {
        logging.error(`Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}. Updating the model.`);

        const errorRate = Math.abs((totalCount - email.get('email_count')) / email.get('email_count'));
        if (this.#sentry && errorRate >= 0.01) {
            this.#sentry.captureMessage(`Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}.`);
        }

        const newEmailUpdate = {
            email_count: totalCount
        };
        if (this.#domainWarmingService.isEnabled()) {
            newEmailUpdate.csd_email_count = Math.min(totalCount, domainWarmupLimit);
        }

        await email.save(newEmailUpdate, {patch: true, require: false, autoRefresh: false});
    }
    return batches;
}

/**
 * @private
 * @param {string} emailId
 * @param {string} segmentFilter
 * @param {number} batchSize
 * @returns {Promise<object[]>}
 */
async getMembersForSegment(emailId, segmentFilter, batchSize) {
    let members = [];
    let lastId = emailId;

    while (true) {
        const filter = segmentFilter + `+id:<'${lastId}'`;
        logging.info(`Fetching members batch for email ${emailId} ${filter}`);

        const batch = await this.#models.Member.getFilteredCollectionQuery({filter})
            .orderByRaw('id DESC')
            .select('members.id', 'members.uuid', 'members.email', 'members.name').limit(batchSize + 1);

        if (batch.length === 0) {
            break;
        }

        members = members.concat(batch);

        if (batch.length <= batchSize) {
            break;
        }

        lastId = batch[batch.length - 2].id;
    }

    return members;
}