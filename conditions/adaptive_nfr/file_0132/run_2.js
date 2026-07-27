'use strict';

const _ = require('lodash');
const pluralize = require('pluralize');
const { convertRestQueryParams, buildQuery } = require('strapi-utils');

const { buildQuery: buildQueryResolver } = require('./resolvers-builder');
const { convertToParams, convertToQuery, nonRequired } = require('./utils');
const { toSDL } = require('./schema-definitions');

/**
 * Returns all fields of type primitive
 *
 * @returns {Boolean}
 */
const isPrimitiveType = type => {
  const nonRequiredType = nonRequired(type);
  return (
    nonRequiredType === 'Int' ||
    nonRequiredType === 'Float' ||
    nonRequiredType === 'String' ||
    nonRequiredType === 'Boolean' ||
    nonRequiredType === 'DateTime' ||
    nonRequiredType === 'JSON'
  );
};

/**
 * Checks if the field is of type enum
 *
 * @returns {Boolean}
 */
const isEnumType = type => {
  return type === 'enumeration';
};

/**
 * Returns all fields that are not of type array
 *
 * @returns {Boolean}
 *
 * @example
 *
 * isNotOfTypeArray([String])
 * // => false
 * isNotOfTypeArray(String!)
 * // => true
 */
const isNotOfTypeArray = type => {
  return !/(\[\w+!?\])/.test(type);
};

/**
 * Returns all fields of type Integer or float
 */
const isNumberType = type => {
  const nonRequiredType = nonRequired(type);
  return nonRequiredType === 'Int' || nonRequiredType === 'Float';
};

/**
 * Returns a list of fields that have type included in fieldTypes.
 */
const getFieldsByTypes = (fields, typeCheck, returnType) => {
  return _.reduce(
    fields,
    (acc, fieldType, fieldName) => {
      if (typeCheck(fieldType)) {
        acc[fieldName] = returnType(fieldType, fieldName);
      }
      return acc;
    },
    {}
  );
};

/**
 * Use the field resolver otherwise fall through the field value
 *
 * @returns {function}
 */
const fieldResolver = (field, key) => {
  return object => {
    const resolver =
      field.resolve ||
      function resolver(obj) {
        // eslint-disable-line no-unused-vars
        return obj[key];
      };
    return resolver(object);
  };
};

/**
 * Create fields resolvers
 *
 * @return {Object}
 */
const createFieldsResolver = function(fields, resolverFn, typeCheck) {
  const resolver = Object.keys(fields).reduce((acc, fieldKey) => {
    const field = fields[fieldKey];
    // Check if the field is of the correct type
    if (typeCheck(field)) {
      return _.set(acc, fieldKey, (obj, options, context) => {
        return resolverFn(
          obj,
          options,
          context,
          fieldResolver(field, fieldKey),
          fieldKey,
          obj,
          field
        );
      });
    }
    return acc;
  }, {});

  return resolver;
};

/**
 * Convert non-primitive type to string (non-primitive types corresponds to a reference to an other model)
 *
 * @returns {String}
 *
 * @example
 *
 * extractType(String!)
 * // => String
 *
 * extractType(user)
 * // => ID
 *
 * extractType(ENUM_TEST_FIELD, enumeration)
 * // => String
 *
 */
const extractType = function(_type, attributeType) {
  return isPrimitiveType(_type)
    ? _type.replace('!', '')
    : isEnumType(attributeType)
    ? 'String'
    : 'ID';
};

/**
 * Create the resolvers for each aggregation field
 *
 * @return {Object}
 *
 * @example
 *
 * const model = // Strapi model
 *
 * const fields = {
 *   username: String,
 *   age: Int,
 * }
 *
 * const typeCheck = (type) => type === 'Int' || type === 'Float',
 *
 * const fieldsResoler = createAggregationFieldsResolver(model, fields, 'sum', typeCheck);
 *
 * // => {
 *   age: function ageResolver() { .... }
 * }
 */
const createAggregationFieldsResolver = function(model, fields, operation, typeCheck) {
  return createFieldsResolver(
    fields,
    async (obj, options, context, fieldResolver, fieldKey) => {
      const filters = convertRestQueryParams({
        ...convertToParams(_.omit(obj, 'where')),
        ...convertToQuery(obj.where),
      });

      if (model.orm === 'mongoose') {
        return buildQuery({ model, filters, aggregate: true })
          .group({
            _id: null,
            [fieldKey]: { [`$${operation}`]: `$${fieldKey}` },
          })
          .exec()
          .then(result => _.get(result, [0, fieldKey]));
      }

      if (model.orm === 'bookshelf') {
        return model
          .query(qb => {
            // apply filters
            buildQuery({ model, filters })(qb);

            // `sum, avg, min, max` pass nicely to knex :->
            qb[operation](`${fieldKey} as ${operation}_${fieldKey}`);
          })
          .fetch()
          .then(result => result.get(`${operation}_${fieldKey}`));
      }
    },
    typeCheck
  );
};

/**
 * Correctly format the data returned by the group by
 */
const preProcessGroupByData = function({ result, fieldKey, filters }) {
  const _result = _.toArray(result).filter(value => Boolean(value._id));
  return _.map(_result, value => {
    return {
      key: value._id.toString(),
      connection: () => {
        // filter by the grouped by value in next connection

        return {
          ...filters,
          where: {
            ...(filters.where || {}),
            [fieldKey]: value._id.toString(),
          },
        };
      },
    };
  });
};

/**
 * Extract and process values from bookshelf result
 * @param {Object} result - The bookshelf query result
 * @param {String} fieldKey - The field key to extract
 * @returns {Array<String>} Array of string values
 */
const extractAndProcessValues = function(result, fieldKey) {
  return result.models
    .map(m => m.get(fieldKey))
    .filter(v => !!v)
    .map(v => '' + v);
};

/**
 * Create connection objects for bookshelf group by results
 * @param {Array<String>} values - Array of values
 * @param {String} fieldKey - The field key
 * @param {Object} filters - The filters object
 * @returns {Array<Object>} Array of connection objects
 */
const createBookshelfGroupByConnections = function(values, fieldKey, filters) {
  return values.map(v => ({
    key: v,
    connection: () => {
      return {
        ..._.omit(filters, ['limit']),
        where: {
          ...(filters.where || {}),
          [fieldKey]: v,
        },
      };
    },
  }));
};

/**
 * Handle bookshelf group by query
 * @param {Object} model - The model
 * @param {Object} params - Query parameters
 * @param {String} fieldKey - The field key
 * @param {Object} filters - The filters object
 * @returns {Promise<Array>} Promise resolving to connection array
 */
const handleBookshelfGroupBy = function(model, params, fieldKey, filters) {
  return model
    .query(qb => {
      buildQuery({ model, filters: params })(qb);
      qb.groupBy(fieldKey);
      qb.select(fieldKey);
    })
    .fetchAll()
    .then(result => {
      const values = extractAndProcessValues(result, fieldKey);
      return createBookshelfGroupByConnections(values, fieldKey, filters);
    });
};

/**
 * Handle mongoose group by query
 * @param {Object} model - The model
 * @param {Object} params - Query parameters
 * @param {String} fieldKey - The field key
 * @param {Object} filters - The filters object
 * @returns {Promise<Array>} Promise resolving to connection array
 */
const handleMongooseGroupBy = async function(model, params, fieldKey, filters) {
  const result = await buildQuery({
    model,
    filters: params,
    aggregate: true,
  }).group({
    _id: `$${fieldKey === 'id' ? model.primaryKey : fieldKey}`,
  });

  return preProcessGroupByData({
    result,
    fieldKey,
    filters,
  });
};

/**
 * Create the resolvers for each group by field
 *
 * @return {Object}
 *
 * @example
 *
 * const model = // Strapi model
 * const fields = {
 *   username: [UserConnectionUsername],
 *   email: [UserConnectionEmail],
 * }
 * const fieldsResoler = createGroupByFieldsResolver(model, fields);
 *
 * // => {
 *   username: function usernameResolver() { .... }
 *   email: function emailResolver() { .... }
 * }
 */
const createGroupByFieldsResolver = function(model, fields) {
  const resolver = async (filters, options, context, fieldResolver, fieldKey) => {
    const params = convertRestQueryParams({
      ...convertToParams(_.omit(filters, 'where')),
      ...convertToQuery(filters.where),
    });

    if (model.orm === 'mongoose') {
      return handleMongooseGroupBy(model, params, fieldKey, filters);
    }

    if (model.orm === 'bookshelf') {
      return handleBookshelfGroupBy(model, params, fieldKey, filters);
    }
  };

  return createFieldsResolver(fields, resolver, () => true);
};

/**
 * Generate the connection type of each non-array field of the model
 *
 * @return {String}
 */
const generateConnectionFieldsTypes = function(fields, model) {
  const { globalId, attributes } = model;
  const primitiveFields = getFieldsByTypes(fields, isNotOfTypeArray, (type, name) =>
    extractType(type, (attributes[name] || {}).type)
  );

  const connectionFields = _.mapValues(primitiveFields, fieldType => ({
    key: fieldType,
    connection: `${globalId}Connection`,
  }));

  return Object.keys(primitiveFields)
    .map(
      fieldKey =>
        `type ${globalId}Connection${_.upperFirst(fieldKey)} {${toSDL(connectionFields[fieldKey])}}`
    )
    .join('\n\n');
};

/**
 * Format group by fields for GraphQL schema
 * @param {Object} fields - The fields object
 * @param {Object} model - The model
 * @returns {Object} Object with globalId, type, and resolver
 */
const formatConnectionGroupBy = function(fields, model) {
  const { globalId } = model;
  const groupByGlobalId = `${globalId}GroupBy`;

  const groupByFields = getFieldsByTypes(
    fields,
    isNotOfTypeArray,
    (fieldType, fieldName) => `[${globalId}Connection${_.upperFirst(fieldName)}]`
  );

  let groupByTypes = `type ${groupByGlobalId} {${toSDL(groupByFields)}}\n\n`;
  groupByTypes += generateConnectionFieldsTypes(fields, model);

  return {
    globalId: groupByGlobalId,
    type: groupByTypes,
    resolver: {
      [groupByGlobalId]: createGroupByFieldsResolver(model, groupByFields),
    },
  };
};

/**
 * Create aggregator count resolvers
 * @param {String} modelName - The model name
 * @param {Object} model - The model
 * @returns {Object} Count resolver functions
 */
const createCountResolvers = function(modelName, model) {
  return {
    count(obj) {
      const opts = convertToQuery(obj.where);

      if (opts._q) {
        return strapi.query(modelName, model.plugin).countSearch(opts);
      }
      return strapi.query(modelName, model.plugin).count(opts);
    },
    totalCount() {
      return strapi.query(modelName, model.plugin).count({});
    },
  };
};

/**
 * Create default aggregator function
 * @param {Object} obj - The object
 * @returns {Object} The same object
 */
const createDefaultAggregatorFunc = function(obj) {
  return obj;
};

/**
 * Build aggregator types string
 * @param {String} aggregatorGlobalId - The aggregator global ID
 * @param {String} gqlNumberFormat - The GraphQL number format
 * @returns {String} The aggregator types definition
 */
const buildAggregatorTypesString = function(aggregatorGlobalId, gqlNumberFormat) {
  let types = `type ${aggregatorGlobalId}Sum {${gqlNumberFormat}}\n\n`;
  types += `type ${aggregatorGlobalId}Avg {${gqlNumberFormat}}\n\n`;
  types += `type ${aggregatorGlobalId}Min {${gqlNumberFormat}}\n\n`;
  types += `type ${aggregatorGlobalId}Max {${gqlNumberFormat}}\n\n`;
  return types;
};

/**
 * Create numeric field resolvers
 * @param {Object} model - The model
 * @param {Object} fields - The fields
 * @returns {Object} Resolvers for numeric aggregations
 */
const createNumericFieldResolvers = function(model, fields) {
  return {
    [`${model.globalId}Aggregator`]: {
      sum: createDefaultAggregatorFunc,
      avg: createDefaultAggregatorFunc,
      min: createDefaultAggregatorFunc,
      max: createDefaultAggregatorFunc,
    },
    [`${model.globalId}AggregatorSum`]: createAggregationFieldsResolver(
      model,
      fields,
      'sum',
      isNumberType
    ),
    [`${model.globalId}AggregatorAvg`]: createAggregationFieldsResolver(
      model,
      fields,
      'avg',
      isNumberType
    ),
    [`${model.globalId}AggregatorMin`]: createAggregationFieldsResolver(
      model,
      fields,
      'min',
      isNumberType
    ),
    [`${model.globalId}AggregatorMax`]: createAggregationFieldsResolver(
      model,
      fields,
      'max',
      isNumberType
    ),
  };
};

/**
 * Add numeric aggregation operations to initial fields
 * @param {Object} initialFields - The initial fields object
 */
const addNumericAggregationOps = function(initialFields) {
  ['sum', 'avg', 'min', 'max'].forEach(agg => {
    initialFields[agg] = `${initialFields.aggregatorGlobalId}${_.startCase(agg)}`;
  });
};

/**
 * Format connection aggregator for GraphQL schema
 * @param {Object} fields - The fields object
 * @param {Object} model - The model
 * @param {String} modelName - The model name
 * @returns {Object} Object with globalId, type, and resolver
 */
const formatConnectionAggregator = function(fields, model, modelName) {
  const { globalId } = model;
  const aggregatorGlobalId = `${globalId}Aggregator`;
  const numericFields = getFieldsByTypes(fields, isNumberType, () => 'Float');

  const initialFields = {
    count: 'Int',
    totalCount: 'Int',
  };

  let aggregatorTypes = `type ${aggregatorGlobalId} {${toSDL(initialFields)}}\n\n`;
  let resolvers = {
    [aggregatorGlobalId]: createCountResolvers(modelName, model),
  };

  if (!_.isEmpty(numericFields)) {
    const gqlNumberFormat = toSDL(numericFields);
    aggregatorTypes += buildAggregatorTypesString(aggregatorGlobalId, gqlNumberFormat);

    const numericResolvers = createNumericFieldResolvers(model, fields);
    resolvers = _.merge(resolvers, numericResolvers);
  }

  return {
    globalId: aggregatorGlobalId,
    type: aggregatorTypes,
    resolver: resolvers,
  };
};

/**
 * Create connection query definition
 * @param {String} pluralName - The plural name
 * @param {String} connectionGlobalId - The connection global ID
 * @returns {Object} Query definition
 */
const createConnectionQueryDef = function(pluralName, connectionGlobalId) {
  return {
    [`${pluralName}Connection`]: {
      args: {
        sort: 'String',
        limit: 'Int',
        start: 'Int',
        where: 'JSON',
      },
      type: connectionGlobalId,
    },
  };
};

/**
 * Create connection query resolver
 * @param {String} connectionQueryName - The connection query name
 * @param {Object} resolver - The resolver
 * @returns {Object} Query resolver
 */
const createConnectionQueryResolver = function(connectionQueryName, resolver) {
  return {
    [connectionQueryName]: buildQueryResolver(connectionQueryName, {
      resolverOf: resolver.resolverOf || resolver.resolver,
      resolver(obj, options) {
        return options;
      },
    }),
  };
};

/**
 * Create connection field resolvers
 * @param {String} connectionGlobalId - The connection global ID
 * @param {Object} aggregatorFormat - The aggregator format
 * @param {Object} groupByFormat - The group by format
 * @returns {Object} Field resolvers
 */
const createConnectionFieldResolvers = function(connectionGlobalId, aggregatorFormat, groupByFormat) {
  return {
    [connectionGlobalId]: {
      values(obj, options, gqlCtx) {
        return obj;
      },
      groupBy(obj) {
        return obj;
      },
      aggregate(obj) {
        return obj;
      },
    },
    ...aggregatorFormat.resolver,
    ...groupByFormat.resolver,
  };
};

/**
 * This method is the entry point to the GraphQL's Aggregation.
 * It takes as param the model and its fields and it'll create the aggregation types and resolver to it
 * Example:
 *  type User {
 *     username: String,
 *     age: Int,
 *  }
 *
 * It'll create
 *  type UserConnection {
 *    values: [User],
 *    groupBy: UserGroupBy,
 *    aggreate: UserAggregate
 *  }
 *
 *  type UserAggregate {
 *     count: Int
 *     sum: UserAggregateSum
 *     avg: UserAggregateAvg
 *  }
 *
 *  type UserAggregateSum {
 *     age: Float
 *  }
 *
 *  type UserAggregateAvg {
 *    age: Float
 *  }
 *
 *  type UserGroupBy {
 *     username: [UserConnectionUsername]
 *     age: [UserConnectionAge]
 *  }
 *
 *  type UserConnectionUsername {
 *    key: String
 *    connection: UserConnection
 *  }
 *
 *  type UserConnectionAge {
 *    key: Int
 *    connection: UserConnection
 *  }
 *
 */
const formatModelConnectionsGQL = function({ fields, model: contentType, name, resolver }) {
  const { globalId } = contentType;
  const model = strapi.getModel(contentType.uid);

  const connectionGlobalId = `${globalId}Connection`;

  const aggregatorFormat = formatConnectionAggregator(fields, model, name);
  const groupByFormat = formatConnectionGroupBy(fields, model);
  const connectionFields = {
    values: `[${globalId}]`,
    groupBy: `${globalId}GroupBy`,
    aggregate: `${globalId}Aggregator`,
  };
  const pluralName = pluralize.plural(_.camelCase(name));

  let modelConnectionTypes = `type ${connectionGlobalId} {${toSDL(connectionFields)}}\n\n`;
  if (aggregatorFormat) {
    modelConnectionTypes += aggregatorFormat.type;
  }
  modelConnectionTypes += groupByFormat.type;

  const connectionResolver = buildQueryResolver(`${pluralName}Connection.values`, resolver);
  const connectionQueryName = `${pluralName}Connection`;

  const queryDef = createConnectionQueryDef(pluralName, connectionGlobalId);
  queryDef[connectionQueryName].args = {
    ...queryDef[connectionQueryName].args,
    ...(resolver.args || {}),
  };

  return {
    globalId: connectionGlobalId,
    definition: modelConnectionTypes,
    query: queryDef,
    resolvers: {
      Query: createConnectionQueryResolver(connectionQueryName, resolver),
      ...createConnectionFieldResolvers(connectionGlobalId, aggregatorFormat, groupByFormat),
    },
  };
};

module.exports = {
  formatModelConnectionsGQL,
};