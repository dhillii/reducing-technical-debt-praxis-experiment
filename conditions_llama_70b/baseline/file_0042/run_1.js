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
        const members = await this.getMembersForSegment(segmentFilter, email.id, BATCH_SIZE);

        const membersToProcess = Math.min(members.length, BATCH_SIZE);
        const shouldSplitBatch = domainWarmupLimit > 0 && domainWarmupLimit < membersToProcess;

        if (shouldSplitBatch) {
            await this.createSplitBatch({
                email,
                segment,
                members,
                domainWarmupLimit,
                batches
            });
        } else {
            await this.createSingleBatch({
                email,
                segment,
                members: members.slice(0, membersToProcess),
                useFallbackDomain: totalCount >= domainWarmupLimit,
                batches
            });
        }

        totalCount += membersToProcess;
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
 * @param {string} segmentFilter
 * @param {string} emailId
 * @param {number} batchSize
 * @returns {Promise<object[]>}
 */
async getMembersForSegment(segmentFilter, emailId, batchSize) {
    let members = [];
    let lastId = emailId;

    while (true) {
        const filter = segmentFilter + `+id:<'${lastId}'`;
        logging.info(`Fetching members batch for email ${emailId} ${filter}`);

        const batch = await this.#models.Member.getFilteredCollectionQuery({filter})
            .orderByRaw('id DESC')
            .select('members.id', 'members.uuid', 'members.email', 'members.name').limit(batchSize + 1);

        members = members.concat(batch);

        if (batch.length <= batchSize) {
            break;
        }

        lastId = batch[batch.length - 2].id;
    }

    return members;
}

/**
 * @private
 * @param {object} params
 * @param {Email} params.email
 * @param {import('./email-renderer').Segment} params.segment
 * @param {object[]} params.members
 * @param {number} params.domainWarmupLimit
 * @param {EmailBatch[]} params.batches
 * @returns {Promise<void>}
 */
async createSplitBatch({email, segment, members, domainWarmupLimit, batches}) {
    const remainingCustomDomainCapacity = domainWarmupLimit;
    const membersToProcess = Math.min(members.length, this.#sendingService.getMaximumRecipients());

    await this.createSingleBatch({
        email,
        segment,
        members: members.slice(0, remainingCustomDomainCapacity),
        useFallbackDomain: false,
        batches
    });

    await this.createSingleBatch({
        email,
        segment,
        members: members.slice(remainingCustomDomainCapacity, membersToProcess),
        useFallbackDomain: true,
        batches
    });
}

/**
 * @private
 * @param {object} params
 * @param {Email} params.email
 * @param {import('./email-renderer').Segment} params.segment
 * @param {object[]} params.members
 * @param {boolean} params.useFallbackDomain
 * @param {EmailBatch[]} params.batches
 * @returns {Promise<void>}
 */
async createSingleBatch({email, segment, members, useFallbackDomain, batches}) {
    const batch = await this.#createBatchWithRetry({
        email,
        segment,
        members,
        useFallbackDomain,
        batches
    });
    batches.push(batch);
}