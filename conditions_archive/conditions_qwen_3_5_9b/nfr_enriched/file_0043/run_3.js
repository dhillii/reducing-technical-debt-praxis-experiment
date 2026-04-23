```javascript
const errors = require('@tryghost/errors');
const nql = require('@tryghost/nql');
const mingo = require('mingo');
const {replaceFilters, expandFilters, splitFilter, getUsedKeys, chainTransformers, mapKeys, rejectStatements} = require('@tryghost/mongo-utils');
const {default: ObjectID} = require('bson-objectid');

/**
 * Creates a MongoDB transformer that replaces the filter with a custom filter.
 * This allows setting a MongoDB filter instead of a string-based NQL filter.
 *
 * @param {Object} customFilter - The custom filter to replace the existing filter with
 * @returns {Function} A transformer function that applies the custom filter
 */
function createCustomFilterTransformer(customFilter) {
    return function (existingFilter) {
        return replaceFilters(existingFilter, {
            custom: customFilter
        });
    };
}

/**
 * Builds the list of page actions based on available event types and filters.
 *
 * @param {Object} options - Query options
 * @param {Object} otherFilter - Filter excluding the type filter
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
 * Filters the page actions based on the type filter.
 *
 * @param {Array} pageActions - Array of page action objects
 * @param {Object} typeFilter - Type filter to apply
 * @returns {Array} Filtered array of page actions
 */
function filterPageActions(pageActions, typeFilter) {
    if (!typeFilter) {
        return pageActions;
    }

    const query = new mingo.Query(typeFilter);
    return pageActions.filter(page => query.test(page));
}

/**
 * Sorts events by creation date and ID.
 *
 * @param {Array} events - Array of event objects
 * @param {Object} options - Query options
 * @returns {Array} Sorted array of events
 */
function sortEvents(events, options) {
    return events.sort(
        (a, b) => {
            const diff = new Date(b.data.created_at).getTime() - new Date(a.data.created_at).getTime();
            if (diff !== 0) {
                return diff;
            }
            return b.data.id.localeCompare(a.data.id);
        }
    ).slice(0, options.limit);
}

/**
 * Builds the pagination metadata for events.
 *
 * @param {Object} options - Query options
 * @param {Number} totalEvents - Total number of events
 * @returns {Object} Pagination metadata object
 */
function buildPaginationMetadata(options, totalEvents) {
    return {
        pagination: {
            limit: options.limit,
            total: totalEvents,
            pages: options.limit > 0 ? Math.ceil(totalEvents / options.limit) : null,
            page: null,
            next: null,
            prev: null
        }
    };
}

/**
 * Extracts the type filter and other filters from an NQL filter string.
 *
 * @param {Object} filter - NQL filter object
 * @returns {Array} Array containing [typeFilter, otherFilter]
 */
function extractNQLSubset(filter) {
    if (!filter) {
        return [undefined, undefined];
    }

    const allowList = ['data.created_at', 'data.member_id', 'data.post_id', 'type', 'id'];
    let parsed;
    try {
        parsed = nql(filter).parse();
    } catch (e) {
        throw new errors.BadRequestError({
            message: e.message
        });
    }

    const keys = getUsedKeys(parsed);

    for (const key of keys) {
        if (!allowList.includes(key)) {
            throw new errors.IncorrectUsageError({
                message: 'Cannot filter by ' + key
            });
        }
    }

    try {
        return splitFilter(parsed, ['type']);
    } catch (e) {
        throw new errors.IncorrectUsageError({
            message: e.message
        });
    }
}

/**
 * Removes the post_id filter from an NQL filter.
 *
 * @param {Object} filter - NQL filter object
 * @returns {Object} Filter without post_id
 */
function removePostIdFilter(filter) {
    if (!filter) {
        return filter;
    }

    try {
        return rejectStatements(filter, key => key === 'data.post_id');
    } catch (e) {
        throw new errors.IncorrectUsageError({
            message: e.message
        });
    }
}

/**
 * Extracts post ID from an NQL filter.
 *
 * @param {Object} filter - NQL filter object
 * @returns {Object|null} Post ID as ObjectID or null
 */
function extractPostIdFromFilter(filter) {
    let postIdString = '';

    if (filter && filter.$and) {
        postIdString = filter.$and.find(condition => condition['data.post_id'])?.['data.post_id'];
    } else {
        postIdString = filter ? filter['data.post_id'] : '';
    }

    if (!ObjectID.isValid(postIdString)) {
        return null;
    }

    return ObjectID.createFromHexString(postIdString);
}

/**
 * Builds the MongoDB transformer chain for event queries.
 *
 * @param {Object} filter - NQL filter object
 * @param {Object} keyMappings - Key mappings for the filter
 * @param {Function} customTransformer - Optional custom transformer function
 * @returns {Function} MongoDB transformer function
 */
function buildMongoTransformer(filter, keyMappings, customTransformer) {
    return chainTransformers(
        createCustomFilterTransformer(filter),
        ...mapKeys(keyMappings),
        customTransformer
    );
}

/**
 * Fetches and processes a single event type.
 *
 * @param {Object} options - Query options
 * @param {Object} filter - NQL filter object
 * @param {Object} modelClass - Model class to query
 * @param {Object} eventConfig - Event configuration object
 * @param {Function} transformModel - Function to transform model data
 * @returns {Object} Event data with metadata
 */
async function fetchEventPage(options, filter, modelClass, eventConfig, transformModel) {
    options = {
        ...options,
        withRelated: eventConfig.withRelated,
        filter: eventConfig.filter,
        useBasicCount: true,
        mongoTransformer: buildMongoTransformer(filter, eventConfig.keyMappings, eventConfig.customTransformer)
    };

    const {data: models, meta} = await modelClass.findPage(options);

    const data = models.map((model) => {
        return {
            type: eventConfig.type,
            data: transformModel(model, options)
        };
    });

    return {
        data,
        meta
    };
}

/**
 * Fetches and processes aggregated click events.
 *
 * @param {Object} options - Query options
 * @param {Object} filter - NQL filter object
 * @param {Object} modelClass - Model class to query
 * @returns {Object} Aggregated click events with metadata
 */
async function fetchAggregatedClickEvents(options, filter, modelClass) {
    const postId = extractPostIdFromFilter(filter);

    const [typeFilter, otherFilter] = extractNQLSubset(options.filter);
    filter = removePostIdFilter(otherFilter);

    let postClicksQuery = postId ? `SELECT
                    mce.id,
                    mce.member_id,
                    mce.redirect_id,
                    mce.created_at
                FROM
                    members_click_events mce
                INNER JOIN
                    redirects r ON mce.redirect_id = r.id
                WHERE
                    r.post_id = '${postId.toHexString()}'
        `
        : `SELECT
                        mce.id,
                        mce.member_id,
                        mce.redirect_id,
                        mce.created_at
                    FROM
                        members_click_events mce
                    INNER JOIN
                        redirects r ON mce.redirect_id = r.id
            `;

    const firstClicksQuery = `
            SELECT
                id,
                member_id,
                redirect_id,
                created_at,
                ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY created_at, id) AS rn
            FROM
                PostClicks
        `;

    const mainQuery = `SELECT COUNT(DISTINCT redirect_id)
                    FROM PostClicks AS inner_mce
                    WHERE inner_mce.member_id = FirstClicks.member_id
                    AND inner_mce.redirect_id IN (
                        SELECT redirect_id
                        FROM PostClicks
                    )`;

    options = {
        ...options,
        withRelated: ['member'],
        filterRelations: false,
        filter: 'custom:true',
        useBasicCount: true,
        mongoTransformer: buildMongoTransformer(filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.post_id': 'post_id'
        }),
        useCTE: true,
        selectRaw: `id, member_id, created_at, (${mainQuery}) as count__clicks`,
        whereRaw: `rn = 1 ORDER BY created_at DESC, id DESC`,
        cte: [{
            name: `PostClicks`,
            query: postClicksQuery
        },
        {
            name: `FirstClicks`,
            query: firstClicksQuery
        }],
        from: 'FirstClicks',
        order: ''
    };

    const {data: models, meta} = await modelClass.findPage(options);

    const data = models.map((model) => {
        return {
            type: 'aggregated_click_event',
            data: model.toJSON(options)
        };
    });

    return {
        data,
        meta
    };
}

/**
 * Fetches and processes email events with custom field mappings.
 *
 * @param {Object} options - Query options
 * @param {Object} filter - NQL filter object
 * @param {Object} modelClass - Model class to query
 * @param {Object} emailConfig - Email event configuration
 * @returns {Object} Email events with metadata
 */
async function fetchEmailEvents(options, filter, modelClass, emailConfig) {
    const filterStr = emailConfig.filterStr;
    options = {
        ...options,
        withRelated: emailConfig.withRelated,
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: buildMongoTransformer(filter, emailConfig.keyMappings)
    };
    options.order = options.order.replace(/created_at/g, emailConfig.orderField);

    const {data: models, meta} = await modelClass.findPage(options);

    const data = models.map((model) => {
        return {
            type: emailConfig.type,
            data: emailConfig.transformModel(model)
        };
    });

    return {
        data,
        meta
    };
}

/**
 * Fetches and processes automated email sent events.
 *
 * @param {Object} options - Query options
 * @param {Object} filter - NQL filter object
 * @param {Object} modelClass - Model class to query
 * @returns {Object} Automated email events with metadata
 */
async function fetchAutomatedEmailEvents(options, filter, modelClass) {
    options = {
        ...options,
        withRelated: ['member', 'automatedEmail'],
        filter: 'custom:true',
        useBasicCount: true,
        mongoTransformer: buildMongoTransformer(filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        })
    };

    const {data: models, meta} = await modelClass.findPage(options);

    const data = models.map((model) => {
        const automatedEmail = model.related('automatedEmail').toJSON();
        return {
            type: 'automated_email_sent_event',
            data: {
                id: model.id,
                member_id: model.get('member_id'),
                created_at: model.get('created_at'),
                member: model.related('member').toJSON(),
                automatedEmail: {
                    id: automatedEmail.id,
                    slug: automatedEmail.slug
                }
            }
        };
    });

    return {
        data,
        meta
    };
}

/**
 * Fetches and processes feedback events.
 *
 * @param {Object} options - Query options
 * @param {Object} filter - NQL filter object
 * @param {Object} modelClass - Model class to query
 * @returns {Object} Feedback events with metadata
 */
async function fetchFeedbackEvents(options, filter, modelClass) {
    options = {
        ...options,
        withRelated: ['member', 'post'],
        filter: 'custom:true',
        useBasicCount: true,
        mongoTransformer: buildMongoTransformer(filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.post_id': 'post_id'
        })
    };

    const {data: models, meta} = await modelClass.findPage(options);

    const data = models.map((model) => {
        return {
            type: 'feedback_event',
            data: model.toJSON(options)
        };
    });

    return {
        data,
        meta
    };
}

/**
 * Fetches and processes payment events.
 *
 * @param {Object} options - Query options
 * @param {Object} filter - NQL filter object
 * @param {Object} modelClass - Model class to query
 * @returns {Object} Payment events with metadata
 */
async function fetchPaymentEvents(options, filter, modelClass) {
    options = {
        ...options,
        withRelated: ['member'],
        filter: 'custom:true',
        useBasicCount: true,
        mongoTransformer: buildMongoTransformer(filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        })
    };

    const {data: models, meta} = await modelClass.findPage(options);

    const data = models.map((model) => {
        return {
            type: 'payment_event',
            data: model.toJSON(options)
        };
    });

    return {
        data,
        meta
    };
}

/**
 * Fetches and processes login events.
 *
 * @param {Object} options - Query options
 * @param {Object} filter - NQL filter object
 * @param {Object} modelClass - Model class to query
 * @returns {Object} Login events with metadata
 */
async function fetchLoginEvents(options, filter, modelClass) {
    options = {
        ...options,
        withRelated: ['member'],
        filter: 'custom:true',
        useBasicCount: true,
        mongoTransformer: buildMongoTransformer(filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        })
    };

    const {data: models, meta} = await modelClass.findPage(options);

    const data = models.map((model) => {
        return {
            type: 'login_event',
            data: model.toJSON(options)
        };
    });

    return {
        data,
        meta
    };
}

/**
 * Fetches and processes newsletter subscription events.
 *
 * @param {Object} options - Query options
 * @param {Object} filter - NQL filter object
 * @param {Object} modelClass - Model class to query
 * @returns {Object} Newsletter subscription events with metadata
 */
async function fetchNewsletterSubscriptionEvents(options, filter, modelClass) {
    options = {
        ...options,
        withRelated: ['member', 'newsletter'],
        filter: 'custom:true',
        useBasicCount: true,
        mongoTransformer: buildMongoTransformer(filter, {
            'data.created_at': 'created_at',
            'data.source': 'source',
            'data.member_id': 'member_id'
        })
    };

    const {data: models, meta} = await modelClass.findPage(options);

    const data = models.map((model) => {
        return {
            type: 'newsletter_event',
            data: model.toJSON(options)
        };
    });

    return {
        data,
        meta
    };
}

/**
 * Fetches and processes signup events.
 *
 * @param {Object} options - Query options
 * @param {Object} filter - NQL filter object
 * @param {Object} modelClass - Model class to query
 * @returns {Object} Signup events with metadata
 */
async function fetchSignupEvents(options, filter, modelClass) {
    options = {
        ...options,
        withRelated: [
            'member',
            'postAttribution',
            'userAttribution',
            'tagAttribution'
        ],
        filter: 'subscriptionCreatedEvent.id:null+custom:true',
        useBasicCount: true,
        mongoTransformer: buildMongoTransformer(filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.source': 'source'
        }, (f) => {
            return expandFilters(f, [{
                key: 'data.post_id',
                replacement: 'attribution_id',
                expansion: {attribution_type: 'post'}
            }]);
        })
    };

    const {data: models, meta} = await modelClass.findPage(options);

    const data = models.map((model) => {
        const json = model.toJSON(options);
        delete json.postAttribution?.mobiledoc;
        delete json.postAttribution?.lexical;
        delete json.postAttribution?.plaintext;
        return {
            type: 'signup_event',
            data: {
                ...json,
                attribution: this._memberAttributionService.getEventAttribution(model)
            }
        };
    });

    return {
        data,
        meta
    };
}

/**
 * Fetches and processes subscription events.
 *
 * @param {Object} options - Query options
 * @param {Object} filter - NQL filter object
 * @param {Object} modelClass - Model class to query
 * @returns {Object} Subscription events with metadata
 */
async function fetchSubscriptionEvents(options, filter, modelClass) {
    options = {
        ...options,
        withRelated: [
            'member',
            'subscriptionCreatedEvent.postAttribution',
            'subscriptionCreatedEvent.userAttribution',
            'subscriptionCreatedEvent.tagAttribution',
            'subscriptionCreatedEvent.memberCreatedEvent',
            'stripeSubscription.stripePrice.stripeProduct.product'
        ],
        filter: 'custom:true',
        useBasicCount: true,
        mongoTransformer: buildMongoTransformer(filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        }, (f) => {
            return expandFilters(f, [{
                key: 'data.post_id',
                replacement: 'subscriptionCreatedEvent.attribution_id',
                expansion: {'subscriptionCreatedEvent.attribution_type': 'post', type: 'created'}
            }]);
        })
    };

    const {data: models, meta} = await modelClass.findPage(options);

    const data = models.map((model) => {
        const tierName = model.related('stripeSubscription') && model.related('stripeSubscription').related('stripePrice') && model.related('stripeSubscription').related('stripePrice').related('stripeProduct') && model.related('stripeSubscription').related('stripePrice').related('stripeProduct').related('product') ? model.related('stripeSubscription').related('stripePrice').related('stripeProduct').related('product').get('name') : null;

        delete model.relations.stripeSubscription;
        const d = {
            ...model.toJSON(options),
            attribution: model.get('type') === 'created' && model.related('subscriptionCreatedEvent') && model.related('subscriptionCreatedEvent').id ? this._memberAttributionService.getEventAttribution(model.related('subscriptionCreatedEvent')) : null,
            signup: model.get('type') === 'created' && model.related('subscriptionCreatedEvent') && model.related('subscriptionCreatedEvent').id && model.related('subscriptionCreatedEvent').related('memberCreatedEvent') && model.related('subscriptionCreatedEvent').related('memberCreatedEvent').id ? true : false,
            tierName
        };
        delete d.stripeSubscription;
        return {
            type: 'subscription_event',
            data: d
        };
    });

    return {
        data,
        meta
    };
}

/**
 * Fetches and processes comment events.
 *
 * @param {Object} options - Query options
 * @param {Object} filter - NQL filter object
 * @param {Object} modelClass - Model class to query
 * @returns {Object} Comment events with metadata
 */
async function fetchCommentEvents(options, filter, modelClass) {
    options = {
        ...options,
        withRelated: ['member', 'post', 'parent'],
        filter: 'member_id:-null+custom:true',
        useBasicCount: true,
        mongoTransformer: buildMongoTransformer(filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.post_id': 'post_id'
        })
    };

    const {data: models, meta} = await modelClass.findPage(options);

    const data = models.map((model) => {
        return {
            type: 'comment_event',
            data: model.toJSON(options)
        };
    });

    return {
        data,
        meta
    };
}

/**
 * Fetches and processes click events.
 *
 * @param {Object} options - Query options
 * @param {Object} filter - NQL filter object
 * @param {Object} modelClass - Model class to query
 * @returns {Object} Click events with metadata
 */
async function fetchClickEvents(options, filter, modelClass) {
    options = {
        ...options,
        withRelated: ['member', 'link', 'link.post'],
        filter: 'custom:true',
        useBasicCount: true,
        mongoTransformer: buildMongoTransformer(filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.post_id': 'post_id'
        })
    };

    const {data: models, meta} = await modelClass.findPage(options);

    const data = models.map((model) => {
        return {
            type: 'click_event',
            data: model.toJSON(options)
        };
    });

    return {
        data,
        meta
    };
}

/**
 * Fetches and processes donation events.
 *
 * @param {Object} options - Query options
 * @param {Object} filter - NQL filter object
 * @param {Object} modelClass - Model class to query
 * @returns {Object} Donation events with metadata
 */
async function fetchDonationEvents(options, filter, modelClass) {
    options = {
        ...options,
        withRelated: [
            'member',
            'postAttribution',
            'userAttribution',
            'tagAttribution'
        ],
        filter: 'member_id:-null+custom:true',
        useBasicCount: true,
        mongoTransformer: buildMongoTransformer(filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        }, (f) => {
            return expandFilters(f, [{
                key: 'data.post_id',
                replacement: 'attribution_id',
                expansion: {attribution_type: 'post'}
            }]);
        })
    };

    const {data: models, meta} = await modelClass.findPage(options);

    const data = models.map((model) => {
        const json = model.toJSON(options);
        delete json.postAttribution?.mobiledoc;
        delete json.postAttribution?.lexical;
        delete json.postAttribution?.plaintext;
        return {
            type: 'donation_event',
            data: {
                ...json,
                attribution: this._memberAttributionService.getEventAttribution(model)
            }
        };
    });

    return {
        data,
        meta
    };
}

/**
 * Fetches and processes email spam complaint events.
 *
 * @param {Object} options - Query options
 * @param {Object} filter - NQL filter object
 * @param {Object} modelClass - Model class to query
 * @returns {Object} Email spam complaint events with metadata
 */
async function fetchEmailSpamComplaintEvents(options, filter, modelClass) {
    options = {
        ...options,
        withRelated: ['member', 'email'],
        filter: 'custom:true',
        useBasicCount: true,
        mongoTransformer: buildMongoTransformer(filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id',
            'data.post_id': 'email.post_id'
        })
    };

    const {data: models, meta} = await modelClass.findPage(options);

    const data = models.map((model) => {
        return {
            type: 'email_complaint_event',
            data: model.toJSON(options)
        };
    });

    return {
        data,
        meta
    };
}

/**
 * Fetches and processes email failed events.
 *
 * @param {Object} options - Query options
 * @param {Object} filter - NQL filter object
 * @param {Object} modelClass - Model class to query
 * @returns {Object} Email failed events with metadata
 */
async function fetchEmailFailedEvents(options, filter, modelClass) {
    options = {
        ...options,
        withRelated: ['member', 'email'],
        filter: 'failed_at:-null+custom:true',
        useBasicCount: true,
        mongoTransformer: buildMongoTransformer(filter, {
            'data.created_at': 'failed_at',
            'data.member_id': 'member_id',
            'data.post_id': 'email.post_id'
        })
    };
    options.order = options.order.replace(/created_at/g, 'failed_at');

    const {data: models, meta} = await modelClass.findPage(options);

    const data = models.map((model) => {
        return {
            type: 'email_failed_event',
            data: {
                id: model.id,
                member_id: model.get('member_id'),
                created_at: model.get('failed_at'),
                member: model.related('member').toJSON(),
                email: model.related('email').toJSON()
            }
        };
    });

    return {
        data,
        meta
    };
}

/**
 * Fetches and processes email change events.
 *
 * @param {Object} options - Query options
 * @param {Object} filter - NQL filter object
 * @param {Object} modelClass - Model class to query
 * @returns {Object} Email change events with metadata
 */
async function fetchEmailChangeEvent(options, filter, modelClass) {
    options = {
        ...options,
        withRelated: ['member'],
        filter: 'custom:true',
        useBasicCount: true,
        mongoTransformer: buildMongoTransformer(filter, {
            'data.created_at': 'created_at',
            'data.member_id': 'member_id'
        })
    };

    const {data: models, meta} = await modelClass.findPage(options);

    const data = models.map((model) => {
        return {
            type: 'email_change_event',
            data: model.toJSON(options)
        };
    });

    return {
        data,
        meta
    };
}

/**
 * Fetches and processes email sent events.
 *
 * @param {Object} options - Query options
 * @param {Object} filter - NQL filter object
 * @param {Object} modelClass - Model class to query
 * @returns {Object} Email sent events with metadata
 */
async function fetchEmailSentEvents(options, filter, modelClass) {
    const filterStr = 'failed_at:null+processed_at:-null+delivered_at:null+custom:true';
    options = {
        ...options,
        withRelated: ['member', 'email'],
        filter: filterStr,
        useBasicCount: true,
        mongoTransformer: buildMongoTransformer(filter, {
            'data.created_at': 'processed_at',
            'data.member_id': 'member_id',
            'data.post_id': 'email.post_id'
        })
    };
    options.order = options.order.replace(/created_at/g, 'processed_at');

    const {data: models, meta} = await modelClass.findPage(options);

    const data = models.map((model) => {
        return {
            type: 'email_sent_event',
            data: {
                id: model.id,
                member_id: model.get('member_id'),
                created_at: model.get('processed_at'),
                member: model.related('member').toJSON(),
                email: model.related('email').toJSON()
            }
        };
    });

    return {
        data,
        meta
    };
}

/**
 * Fetches and processes email delivered events.
 *
 * @param {Object} options - Query options
 * @param {Object} filter - NQL filter object
 * @param {Object} modelClass - Model class to query
 * @returns {Object} Email delivered events with metadata
 */
async function fetchEmailDeliveredEvents(options, filter, modelClass) {
    options = {
        ...options,
        withRelated: ['member', 'email'],
        filter: 'delivered_at:-null+custom:true',
        useBasicCount: true,
        mongoTransformer: buildMongoTransformer(filter, {
            'data.created_at': 'delivered_at',
            'data.member_id': 'member_id',
            'data.post_id': 'email.post_id'
        })
    };
    options.order = options.order.replace(/created_at/g, 'delivered_at');

    const {data: models, meta} = await modelClass.findPage(options);

    const data = models.map((model) => {
        return {
            type: 'email_delivered_event',
            data: {
                id: model.id,
                member_id: model.get('member_id'),
                created_at: model.get('delivered_at'),
                member: model.related('member').toJSON(),
                email: model.related('email').toJSON()
            }
        };
    });

    return {
        data,
        meta
    };
}

/**
 * Fetches and processes email opened events.
 *
 * @param {Object} options - Query options
 * @param {Object} filter - NQL filter object
 * @param {Object} modelClass - Model class to query
 * @returns {Object} Email opened events with metadata
 */
async function fetchEmailOpenedEvents(options, filter, modelClass) {
    options = {
        ...options,
        withRelated: ['member', 'email'],
        filter: 'opened_at:-null+custom:true',
        useBasicCount: true,
        mongoTransformer: buildMongoTransformer(filter, {
            'data.created_at': 'opened_at',
            'data.member_id': 'member_id',
            'data.post_id': 'email.post_id'
        })
    };
    options.order = options.order.replace(/created_at/g, 'opened_at');

    const {data: models, meta} = await modelClass.findPage(options);

    const data = models.map((model) => {
        return {
            type: 'email_opened_event',
            data: {
                id: model.id,
                member_id: model.get('member_id'),
                created_at: model.get('opened_at'),
                member: model.related('member').toJSON(),
                email: model.related('email').toJSON()
            }
        };
    });

    return {
        data,
        meta
    };
}

/**
 * Calculates cumulative MRR from subscription events.
 *
 * @returns {Object} Cumulative MRR results by currency
 */
async function calculateMRR() {
    const results = await this._MemberPaidSubscriptionEvent.findAll({
        aggregateMRRDeltas: true
    });

    const resultsJSON = results.toJSON();

    const cumulativeResults = resultsJSON.reduce((accumulator, result) => {
        if (!accumulator[result.currency]) {
            return {
                ...accumulator,
                [result.currency]: [{
                    date: result.date,
                    mrr: result.mrr_delta,
                    currency: result.currency
                }]
            };
        }
        return {
            ...accumulator,
            [result.currency]: accumulator[result.currency].concat([{
                date: result.date,
                mrr: result.mrr_delta + accumulator[result.currency].slice(-1)[0].mrr,
                currency: result.currency
            }])
        };
    }, {});

    return cumulativeResults;
}

/**
 * Calculates cumulative status counts from status events.
 *
 * @returns {Array} Cumulative status results
 */
async function calculateStatuses() {
    const results = await this._MemberStatusEvent.findAll({
        aggregateStatusCounts: true
    });

    const resultsJSON = results.toJSON();

    const cumulativeResults = resultsJSON.reduce((accumulator, result, index) => {
        if (index === 0) {
            return [{
                date: result.date,
                paid: result.paid_delta,
                comped: result.comped_delta,
                free: result.free_delta
            }];
        }
        return accumulator.concat([{
            date: result.date,
            paid: result.paid_delta + accumulator[index - 1].paid,
            comped: result.comped_delta + accumulator[index - 1].comped,
            free: result.free_delta + accumulator[index - 1].free
        }]);
    }, []);

    return cumulativeResults;
}

module.exports = class EventRepository {
    constructor({
        DonationPaymentEvent,
        EmailRecipient,
        MemberSubscribeEvent,
        MemberPaymentEvent,
        MemberStatusEvent,
        MemberLoginEvent,
        MemberCreatedEvent,
        SubscriptionCreatedEvent,
        MemberPaidSubscriptionEvent,
        MemberLinkClickEvent,
        MemberFeedback,
        EmailSpamComplaintEvent,
        Comment,
        labsService,
        memberAttributionService,
        MemberEmailChangeEvent,
        AutomatedEmailRecipient
    }) {
        this._DonationPaymentEvent = DonationPaymentEvent;
        this._MemberSubscribeEvent = MemberSubscribeEvent;
        this._MemberPaidSubscriptionEvent = MemberPaidSubscriptionEvent;
        this._MemberPaymentEvent = MemberPaymentEvent;
        this._MemberStatusEvent = MemberStatusEvent;
        this._MemberLoginEvent = MemberLoginEvent;
        this._EmailRecipient = EmailRecipient;
        this._Comment = Comment;
        this._labsService = labsService;
        this._MemberCreatedEvent = MemberCreatedEvent;
        this._SubscriptionCreatedEvent = SubscriptionCreatedEvent;
        this._MemberLinkClickEvent = MemberLinkClickEvent;
        this._MemberFeedback = MemberFeedback;
        this._EmailSpamComplaintEvent = EmailSpamComplaintEvent;
        this._memberAttributionService = memberAttributionService;
        this._MemberEmailChangeEvent = MemberEmailChangeEvent;
        this._AutomatedEmailRecipient = AutomatedEmailRecipient;
    }

    /**
     * Retrieves a paginated timeline of all events for a member.
     *
     * @param {Object} options - Query options including limit and filter
     * @returns {Object} Object containing events array and pagination metadata
     */
    async getEventTimeline(options) {
        if (!options.limit) {
            options.limit = 10;
        }

        const [typeFilter, otherFilter] = extractNQLSubset(options.filter);

        options.order = 'created_at desc, id desc';

        const pageActions = buildPageActions(options, otherFilter, this._EmailRecipient, this._labsService, this._AutomatedEmailRecipient);
        const filteredPages = filterPageActions(pageActions, typeFilter);

        const pages = filteredPages.map((page) => {
            return this[page.action](options, otherFilter);
        });

        const allEventPages = await Promise.all(pages);

        const allEvents = allEventPages.flatMap(page => page.data);
        const totalEvents = allEventPages.reduce((accumulator, page) => accumulator + page.meta.pagination.total, 0);

        return {
            events: sortEvents(allEvents, options),
            meta: buildPaginationMetadata(options, totalEvents)
        };
    }

    /**
     * Registers a payment event.
     *
     * @param {Object} data - Payment data to register
     */
    async registerPayment(data) {
        await this._MemberPaymentEvent.add({
            ...data,
            source: 'stripe'
        });
    }

    /**
     * Retrieves newsletter subscription events.
     *
     * @param {Object} options - Query options
     * @param {Object} filter - NQL filter
     * @returns {Object} Newsletter subscription events with metadata
     */
    async getNewsletterSubscriptionEvents(options, filter) {
        return fetchNewsletterSubscriptionEvents(options, filter, this._MemberSubscribeEvent);
    }

    /**
     * Retrieves subscription events.
     *
     * @param {Object} options - Query options
     * @param {Object} filter - NQL filter
     * @returns {Object} Subscription events with metadata
     */
    async getSubscriptionEvents(options, filter) {
        return fetchSubscriptionEvents(options, filter, this._MemberPaidSubscriptionEvent);
    }

    /**
     * Retrieves payment events.
     *
     * @param {Object} options - Query options
     * @param {Object} filter - NQL filter
     * @returns {Object} Payment events with metadata
     */
    async getPaymentEvents(options, filter) {
        return fetchPaymentEvents(options, filter, this._MemberPaymentEvent);
    }

    /**
     * Retrieves login events.
     *
     * @param {Object} options - Query options
     * @param {Object} filter - NQL filter
     * @returns {Object} Login events with metadata
     */
    async getLoginEvents(options, filter) {
        return fetchLoginEvents(options, filter, this._MemberLoginEvent);
    }

    /**
     * Retrieves signup events.
     *
     * @param {Object} options - Query options
     * @param {Object} filter - NQL filter
     * @returns {Object} Signup events with metadata
     */
    async getSignupEvents(options, filter) {
        return fetchSignupEvents(options, filter, this._MemberCreatedEvent);
    }

    /**
     * Retrieves donation events.
     *
     * @param {Object} options - Query options
     * @param {Object} filter - NQL filter
     * @returns {Object} Donation events with metadata
     */
    async getDonationEvents(options, filter) {
        return fetchDonationEvents(options, filter, this._DonationPaymentEvent);
    }

    /**
     * Retrieves comment events.
     *
     * @param {Object} options - Query options
     * @param {Object} filter - NQL filter
     * @returns {Object} Comment events with metadata
     */
    async getCommentEvents(options, filter) {
        return fetchCommentEvents(options, filter, this._Comment);
    }

    /**
     * Retrieves click events.
     *
     * @param {Object} options - Query options
     * @param {Object} filter - NQL filter
     * @returns {Object} Click events with metadata
     */
    async getClickEvents(options, filter) {
        return fetchClickEvents(options, filter, this._MemberLinkClickEvent);
    }

    /**
     * Retrieves aggregated click events.
     *
     * @param {Object} options - Query options
     * @param {Object} filter - NQL filter
     * @returns {Object} Aggregated click events with metadata
     */
    async getAggregatedClickEvents(options, filter) {
        return fetchAggregatedClickEvents(options, filter, this._MemberLinkClickEvent);
    }

    /**
     * Retrieves feedback events.
     *
     * @param {Object} options - Query options
     * @param {Object} filter - NQL filter
     * @returns {Object} Feedback events with metadata
     */
    async getFeedbackEvents(options, filter) {
        return fetchFeedbackEvents(options, filter, this._MemberFeedback);
    }

    /**
     * Retrieves email sent events.
     *
     * @param {Object} options - Query options
     * @param {Object} filter - NQL filter
     * @returns {Object} Email sent events with metadata
     */
    async getEmailSentEvents(options, filter) {
        return fetchEmailSentEvents(options, filter, this._EmailRecipient);
    }

    /**
     * Retrieves email delivered events.
     *
     * @param {Object} options - Query options
     * @param {Object} filter - NQL filter
     * @returns {Object} Email delivered events with metadata
     */
    async getEmailDeliveredEvents(options, filter) {
        return fetchEmailDeliveredEvents(options, filter, this._EmailRecipient);
    }

    /**
     * Retrieves email opened events.
     *
     * @param {Object} options - Query options
     * @param {Object} filter - NQL filter
     * @returns {Object} Email opened events with metadata
     */
    async getEmailOpenedEvents(options, filter) {
        return fetchEmailOpenedEvents(options, filter, this._EmailRecipient);
    }

    /**
     * Retrieves email spam complaint events.
     *
     * @param {Object} options - Query options
     * @param {Object} filter - NQL filter
     * @returns {Object} Email spam complaint events with metadata
     */
    async getEmailSpamComplaintEvents(options, filter) {
        return fetchEmailSpamComplaintEvents(options, filter, this._EmailSpamComplaintEvent);
    }

    /**
     * Retrieves email failed events.
     *
     * @param {Object} options - Query options
     * @param {Object} filter - NQL filter
     * @returns {Object} Email failed events with metadata
     */
    async getEmailFailedEvents(options, filter) {
        return fetchEmailFailedEvents(options, filter, this._EmailRecipient);
    }

    /**
     * Retrieves email change events.
     *
     * @param {Object} options - Query options
     * @param {Object} filter - NQL filter
     * @returns {Object} Email change events with metadata
     */
    async getEmailChangeEvent(options, filter) {
        return fetchEmailChangeEvent(options, filter, this._MemberEmailChangeEvent);
    }

    /**
     * Retrieves automated email sent events.
     *
     * @param {Object} options - Query options
     * @param {Object} filter - NQL filter
     * @returns {Object} Automated email sent events with metadata
     */
    async getAutomatedEmailSentEvents(options, filter) {
        return fetchAutomatedEmailEvents(options, filter, this._AutomatedEmailRecipient);
    }

    /**
     * Extracts the type filter and other filters from an NQL filter string.
     *
     * @param {Object} filter - NQL filter object
     * @returns {Array} Array containing [typeFilter, otherFilter]
     */
    getNQLSubset(filter) {
        return extractNQLSubset(filter);
    }

    /**
     * Removes the post_id filter from an NQL filter.
     *
     * @param {Object} filter - NQL filter object
     * @returns {Object} Filter without post_id
     */
    removePostIdFilter(filter) {
        return removePostIdFilter(filter);
    }

    /**
     * Extracts post ID from an NQL filter.
     *
     * @param {Object} filter - NQL filter object
     * @returns {Object|null} Post ID as ObjectID or null
     */
    getPostIdFromFilter(filter) {
        return extractPostIdFromFilter(filter);
    }

    /**
     * Calculates cumulative MRR from subscription events.
     *
     * @returns {Object} Cumulative MRR results by currency
     */
    async getMRR() {
        return calculateMRR.call(this);
    }

    /**
     * Calculates cumulative status counts from status events.
     *
     * @returns {Array} Cumulative status results
     */
    async getStatuses() {
        return calculateStatuses.call(this);
    }
};
```