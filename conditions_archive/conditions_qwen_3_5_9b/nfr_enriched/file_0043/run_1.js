const errors = require('@tryghost/errors');
const nql = require('@tryghost/nql');
const mingo = require('mingo');
const {replaceFilters, expandFilters, splitFilter, getUsedKeys, chainTransformers, mapKeys, rejectStatements} = require('@tryghost/mongo-utils');
const {default: ObjectID} = require('bson-objectid');

/**
 * Builds the list of page actions based on available event types and filter conditions.
 * @param {Object} options - Query options
 * @param {Object} otherFilter - Filter without type
 * @param {Object} emailRecipient - Email recipient service instance
 * @param {Object} labsService - Labs service instance
 * @param {Object} automatedEmailRecipient - Automated email recipient service instance
 * @returns {Array} Array of page action objects
 */
function buildPageActions(options, otherFilter, emailRecipient, labsService, automatedEmailRecipient) {
    const pageActions = [
        {type: 'comment_event', action: 'getCommentEvents'},
        {type: 'click_event', action: 'getClickEvents'},
        {type: 'aggregated_click_event', action: 'getAggregatedClickEvents'},
        {type: 'signup_event', action: 'getSignupEvents'},
        {type: 'subscription_event', action: 'getSubscriptionEvents'},
        {type: 'donation_event', action: 'getDonationEvents'}
    ];

    if (!getUsedKeys(otherFilter).includes('data.post_id')) {
        pageActions.push(
            {type: 'newsletter_event', action: 'getNewsletterSubscriptionEvents'},
            {type: 'login_event', action: 'getLoginEvents'},
            {type: 'payment_event', action: 'getPaymentEvents'},
            {type: 'email_change_event', action: 'getEmailChangeEvent'}
        );

        if (automatedEmailRecipient) {
            pageActions.push({type: 'automated_email_sent_event', action: 'getAutomatedEmailSentEvents'});
        }
    }

    if (emailRecipient) {
        pageActions.push({type: 'email_sent_event', action: 'getEmailSentEvents'});
        pageActions.push({type: 'email_delivered_event', action: 'getEmailDeliveredEvents'});
        pageActions.push({type: 'email_opened_event', action: 'getEmailOpenedEvents'});
        pageActions.push({type: 'email_failed_event', action: 'getEmailFailedEvents'});
    }

    pageActions.push({type: 'email_complained_event', action: 'getEmailSpamComplaintEvents'});

    if (labsService.isSet('audienceFeedback')) {
        pageActions.push({type: 'feedback_event', action: 'getFeedbackEvents'});
    }

    return pageActions;
}

/**
 * Filters page actions based on type filter using mingo query.
 * @param {Array} pageActions - Array of page action objects
 * @param {Object} typeFilter - Type filter string
 * @returns {Array} Filtered page actions
 */
function filterPageActionsByType(pageActions, typeFilter) {
    if (!typeFilter) {
        return pageActions;
    }

    const query = new mingo.Query(typeFilter);
    return pageActions.filter(page => query.test(page));
}

/**
 * Builds common options for event queries with proper transformers.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance for type-specific options
 * @param {Array} withRelated - Related fields to include
 * @param {Object} transformers - Additional transformers
 * @returns {Object} Options object with transformers applied
 */
function buildEventOptions(options, filter, model, withRelated, transformers) {
    return {
        ...options,
        withRelated: withRelated,
        filter: 'custom:true',
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers),
            ...transformers
        )
    };
}

/**
 * Processes event models into the expected format.
 * @param {Array} models - Array of model instances
 * @param {Object} options - Query options
 * @param {Function} transformFn - Transformation function for each model
 * @returns {Array} Transformed event data
 */
function processEventModels(models, options, transformFn) {
    return models.map((model) => {
        return transformFn(model, options);
    });
}

/**
 * Builds the base options for email-related events.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)
        )
    };
}

/**
 * Builds the base options for email events with specific field mappings.
 * @param {Object} options - Query options
 * @param {Object} filter - Filter object
 * @param {Object} model - Model instance
 * @param {Object} emailTransformer - Email-specific transformers
 * @param {String} createdAtField - Field name for created_at
 * @returns {Object} Options object
 */
function buildEmailEventOptionsWithOptions(options, filter, model, emailTransformer, createdAtField) {
    const filterStr = emailTransformer.filter;
    const transformers = emailTransformer.transformers;

    return {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: chainTransformers(
            replaceCustomFilterTransformer(filter),
            ...mapKeys(transformers)