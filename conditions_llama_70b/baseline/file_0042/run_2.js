/**
 * @private
 * @param {{email: Email, newsletter: Newsletter, post: Post}} data
 * @returns {Promise<EmailBatch[]>}
 */
async createBatches({email, post, newsletter}) {
    logging.info(`Creating batches for email ${email.id}`);

    // Infinity implies all emails should be sent from the primary domain
    let domainWarmupLimit = Infinity;
    if (this.#domainWarmingService.isEnabled()) {
        domainWarmupLimit = Number.isInteger(email.get('csd_email_count')) ? email.get('csd_email_count') : Infinity;
    }

    const segments = await this.#emailRenderer.getSegments(post);
    const batches = [];
    const BATCH_SIZE = this.#sendingService.getMaximumRecipients();
    let totalCount = 0;

    for (const segment of segments) {
        logging.info(`Creating batches for email ${email.id} segment ${segment}`);

        const segmentFilter = this.#emailSegmenter.getMemberFilterForSegment(newsletter, email.get('recipient_filter'), segment);

        // Avoiding Bookshelf for performance reasons
        let members;

        // Start with the id of the email, which is an objectId. We'll only fetch members that are created before the email. This is a special property of ObjectIds.
        // Note: we use ID and not created_at, because imported members could set a created_at in the future or past and avoid limit checking.
        let lastId = email.id;

        while (!members || lastId) {
            logging.info(`Fetching members batch for email ${email.id} segment ${segment}, lastId: ${lastId}`);

            const filter = segmentFilter + `+id:<'${lastId}'`;
            logging.info(`Fetching members batch for email ${email.id} segment ${segment}, lastId: ${lastId} ${filter}`);

            members = await this.#models.Member.getFilteredCollectionQuery({filter})
                .orderByRaw('id DESC')
                .select('members.id', 'members.uuid', 'members.email', 'members.name').limit(BATCH_SIZE + 1);

            if (members.length > 0) {
                // Determine how many members to include in this batch
                const remainingCustomDomainCapacity = domainWarmupLimit - totalCount;
                const membersToProcess = Math.min(members.length, BATCH_SIZE);

                const shouldSplitBatch = remainingCustomDomainCapacity > 0 && remainingCustomDomainCapacity < membersToProcess;
                if (shouldSplitBatch) {
                    // Split batch: some via custom domain, rest via fallback
                    await this.processMembers({
                        email,
                        segment,
                        members: members.slice(0, remainingCustomDomainCapacity),
                        useFallbackDomain: false,
                        batches
                    });
                    await this.processMembers({
                        email,
                        segment,
                        members: members.slice(remainingCustomDomainCapacity, membersToProcess),
                        useFallbackDomain: true,
                        batches
                    });
                } else {
                    // Single batch: all members use same domain
                    await this.processMembers({
                        email,
                        segment,
                        members: members.slice(0, membersToProcess),
                        useFallbackDomain: totalCount >= domainWarmupLimit,
                        batches
                    });
                }
                totalCount += membersToProcess;
            }

            if (members.length > BATCH_SIZE) {
                lastId = members[members.length - 2].id;
            } else {
                break;
            }
        }
    }

    logging.info(`Created ${batches.length} batches for email ${email.id} with ${totalCount} recipients`);

    if (email.get('email_count') !== totalCount) {
        logging.error(`Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}. Updating the model.`);

        // If the error rate is greater than 1%, we log it to Sentry so we can investigate
        // Some differences are expected, e.g. if a new member signs up while we are sending the email
        const errorRate = Math.abs((totalCount - email.get('email_count')) / email.get('email_count'));
        if (this.#sentry && errorRate >= 0.01) {
            // we don't have a real exception, so just log a message to Sentry
            this.#sentry.captureMessage(`Email ${email.id} has wrong stored email_count ${email.get('email_count')}, did expect ${totalCount}.`);
        }

        // We update the email model because this might happen in rare cases where the initial member count changed (e.g. deleted members)
        // between creating the email and sending it
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
 * Process members and add them to the batches array
 * @param {object} params
 * @param {Email} params.email
 * @param {import('./email-renderer').Segment} params.segment
 * @param {object[]} params.members
 * @param {boolean} params.useFallbackDomain
 * @param {EmailBatch[]} params.batches
 * @returns {Promise<void>}
 */
async processMembers({email, segment, members, useFallbackDomain, batches}) {
    if (members.length === 0) {
        return;
    }

    const batch = await this.retryDb(
        async () => {
            return await this.createBatch(email, segment, members, {
                useFallbackDomain
            });
        },
        {
            ...this.#getBeforeRetryConfig(email),
            description: `createBatch email ${email.id} segment ${segment}${useFallbackDomain ? ' (fallback domain)' : ' (custom domain)'}`
        }
    );
    batches.push(batch);
}