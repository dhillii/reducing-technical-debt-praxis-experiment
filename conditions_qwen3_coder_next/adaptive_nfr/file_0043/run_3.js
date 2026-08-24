async getEventTimeline(options = {}) {
        if (!options.limit) {
            options.limit = 10;
        }

        const [typeFilter, otherFilter] = this.getNQLSubset(options.filter);

        options.order = 'created_at desc, id desc';

        const pageActions = this.buildPageActions(otherFilter);

        const filteredPages = this.filterPagesByType(pageActions, typeFilter);

        const pages = filteredPages.map((page) => {
            return this[page.action](options, otherFilter);
        });

        const allEventPages = await Promise.all(pages);

        const allEvents = this.mergeAndSortEvents(allEventPages, options.limit);

        return this.buildTimelineResponse(allEvents, allEventPages, options.limit);
    }

    /**
     * Builds the list of available page actions based on available services and filters
     * @param {Object} otherFilter - The filter object excluding type
     * @returns {Array} Array of page action objects
     */
    buildPageActions(otherFilter) {
        const pageActions = [
            {type: 'comment_event', action: 'getCommentEvents'},
            {type: 'click_event', action: 'getClickEvents'},
            {type: 'aggregated_click_event', action: 'getAggregatedClickEvents'},
            {type: 'signup_event', action: 'getSignupEvents'},
            {type: 'subscription_event', action: 'getSubscriptionEvents'},
            {type: 'donation_event', action: 'getDonationEvents'}
        ];

        if (!this.hasPostIdInFilter(otherFilter)) {
            pageActions.push(
                {type: 'newsletter_event', action: 'getNewsletterSubscriptionEvents'},
                {type: 'login_event', action: 'getLoginEvents'},
                {type: 'payment_event', action: 'getPaymentEvents'},
                {type: 'email_change_event', action: 'getEmailChangeEvent'}
            );

            if (this._AutomatedEmailRecipient) {
                pageActions.push({type: 'automated_email_sent_event', action: 'getAutomatedEmailSentEvents'});
            }
        }

        if (this._EmailRecipient) {
            pageActions.push({type: 'email_sent_event', action: 'getEmailSentEvents'});
            pageActions.push({type: 'email_delivered_event', action: 'getEmailDeliveredEvents'});
            pageActions.push({type: 'email_opened_event', action: 'getEmailOpenedEvents'});
            pageActions.push({type: 'email_failed_event', action: 'getEmailFailedEvents'});
        }

        pageActions.push({type: 'email_complained_event', action: 'getEmailSpamComplaintEvents'});

        if (this._labsService.isSet('audienceFeedback')) {
            pageActions.push({type: 'feedback_event', action: 'getFeedbackEvents'});
        }

        return pageActions;
    }

    /**
     * Checks if post_id is used in the filter
     * @param {Object} filter - The filter object
     * @returns {boolean} True if post_id is used in the filter
     */
    hasPostIdInFilter(filter) {
        return filter && getUsedKeys(filter).includes('data.post_id');
    }

    /**
     * Filters page actions by type filter using mingo query
     * @param {Array} pageActions - Array of page action objects
     * @param {Object} typeFilter - The type filter object
     * @returns {Array} Filtered page actions
     */
    filterPagesByType(pageActions, typeFilter) {
        if (!typeFilter) {
            return pageActions;
        }

        const query = new mingo.Query(typeFilter);
        return pageActions.filter(page => query.test(page));
    }

    /**
     * Merges and sorts events from all pages, applying limit
     * @param {Array} allEventPages - Array of all event pages
     * @param {number} limit - Maximum number of events to return
     * @returns {Array} Merged and sorted events
     */
    mergeAndSortEvents(allEventPages, limit) {
        const allEvents = allEventPages.flatMap(page => page.data);

        return allEvents.sort(
            (a, b) => {
                const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
                if (diff !== 0) {
                    return diff;
                }
                return b.data.id.localeCompare(a.data.id);
            }
        ).slice(0, limit);
    }

    /**
     * Builds the final timeline response object
     * @param {Array} allEvents - Merged and sorted events
     * @param {Array} allEventPages - Array of all event pages
     * @param {number} limit - Maximum number of events
     * @returns {Object} Timeline response object
     */
    buildTimelineResponse(allEvents, allEventPages, limit) {
        const totalEvents = allEventPages.reduce((accumulator, page) => accumulator + page.meta.pagination.total, 0);

        return {
            events: allEvents,
            meta: {
                pagination: {
                    limit: limit,
                    total: totalEvents,
                    pages: limit > 0 ? Math.ceil(totalEvents / limit) : null,
                    page: null,
                    next: null,
                    prev: null
                }
            }
        };
    }