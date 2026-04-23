```javascript
/**
 * Aggregator.js service
 *
 * @description: A set of functions similar to controller's actions to avoid code duplication.
 */

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
 * Build aggregation query for mongoose ORM
 * @private
 */
const buildMongooseAggregationQuery = async (model, filters, fieldKey, operation) => {
  return buildQuery({ model, filters, aggregate: true })
    .group({
      _id: null,
      [fieldKey]: { [`$${operation}`]: `$${fieldKey}` },
    })
    .exec()
    .then(result => _.get(result, [0, fieldKey]));
};

/**
 * Build aggregation query for bookshelf ORM
 * @private
 */
const buildBookshelfAggregationQuery = async (model, filters, fieldKey, operation) => {
  return model
    .query(qb => {
      buildQuery({ model, filters })(qb);
      qb[operation](`${fieldKey} as ${operation}_${fieldKey}`);
    })
    .fetch()
    .then(result => result.get(`${operation}_${fieldKey}`));
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
        return buildMongooseAggregationQuery(model, filters, fieldKey, operation);
      }

      if (model.orm === 'bookshelf') {
        return buildBookshelfAggregationQuery(model, filters, fieldKey, operation);
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
 * Build group by query for mongoose ORM
 * @private
 */
const buildMongooseGroupByQuery = async (model, params, fieldKey) => {
  const result = await buildQuery({
    model,
    filters: params,
    aggregate: true,
  }).group({
    _id: `$${fieldKey === 'id' ? model.primaryKey : fieldKey}`,
  });

  return result;
};

/**
 * Build group by query for bookshelf ORM
 * @private
 */
const buildBookshelfGroupByQuery = async (model, params, fieldKey) => {
  return model
    .query(qb => {
      buildQuery({ model, filters: params })(qb);
      qb.groupBy(fieldKey);
      qb.select(fieldKey);
    })
    .fetchAll();
};

/**
 * Process bookshelf group by results
 * @private
 */
const processBookshelfGroupByResults = (result, fieldKey, filters) => {
  let values = result.models
    .map(m => m.get(fieldKey))
    .filter(v => !!v)
    .map(v => '' + v);
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
      const result = await buildMongooseGroupByQuery(model, params, fieldKey);
      return preProcessGroupByData({
        result,
        fieldKey,
        filters,
      });
    }

    if (model.orm === 'bookshelf') {
      const result = await buildBookshelfGroupByQuery(model, params, fieldKey);
      return processBookshelfGroupByResults(result, fieldKey, filters);
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
 * @private
 */
const formatGroupByFields = (fields, model) => {
  return getFieldsByTypes(
    fields,
    isNotOfTypeArray,
    (fieldType, fieldName) => `[${model.globalId}Connection${_.upperFirst(fieldName)}]`
  );
};

/**
 * Build group by type definitions
 * @private
 */
const buildGroupByTypeDefinitions = (globalId, groupByFields, fields, model) => {
  let groupByTypes = `type ${globalId} {${toSDL(groupByFields)}}\n\n`;
  groupByTypes += generateConnectionFieldsTypes(fields, model);
  return groupByTypes;
};

const formatConnectionGroupBy = function(fields, model) {
  const { globalId } = model;
  const groupByGlobalId = `${globalId}GroupBy`;

  const groupByFields = formatGroupByFields(fields, model);
  const groupByTypes = buildGroupByTypeDefinitions(groupByGlobalId, groupByFields, fields, model);

  return {
    globalId: groupByGlobalId,
    type: groupByTypes,
    resolver: {
      [groupByGlobalId]: createGroupByFieldsResolver(model, groupByFields),
    },
  };
};

/**
 * Build initial aggregator fields
 * @private
 */
const buildInitialAggregatorFields = () => {
  return {
    count: 'Int',
    totalCount: 'Int',
  };
};

/**
 * Add numeric aggregation fields
 * @private
 */
const addNumericAggregationFields = (initialFields, aggregatorGlobalId) => {
  ['sum', 'avg', 'min', 'max'].forEach(agg => {
    initialFields[agg] = `${aggregatorGlobalId}${_.startCase(agg)}`;
  });
};

/**
 * Build aggregator type definitions
 * @private
 */
const buildAggregatorTypeDefinitions = (aggregatorGlobalId, initialFields, gqlNumberFormat, hasNumericFields) => {
  let aggregatorTypes = `type ${aggregatorGlobalId} {${toSDL(initialFields)}}\n\n`;

  if (hasNumericFields) {
    aggregatorTypes += `type ${aggregatorGlobalId}Sum {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Avg {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Min {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Max {${gqlNumberFormat}}\n\n`;
  }

  return aggregatorTypes;
};

/**
 * Create count resolver
 * @private
 */
const createCountResolver = (modelName, model) => {
  return (obj) => {
    const opts = convertToQuery(obj.where);
    if (opts._q) {
      return strapi.query(modelName, model.plugin).countSearch(opts);
    }
    return strapi.query(modelName, model.plugin).count(opts);
  };
};

/**
 * Create base aggregator resolvers
 * @private
 */
const createBaseAggregatorResolvers = (aggregatorGlobalId, modelName, model) => {
  return {
    [aggregatorGlobalId]: {
      count: createCountResolver(modelName, model),
      totalCount() {
        return strapi.query(modelName, model.plugin).count({});
      },
    },
  };
};

/**
 * Create numeric aggregation resolvers
 * @private
 */
const createNumericAggregationResolvers = (aggregatorGlobalId, model, fields) => {
  const defaultAggregatorFunc = obj => obj;

  return {
    [`${aggregatorGlobalId}Sum`]: createAggregationFieldsResolver(
      model,
      fields,
      'sum',
      isNumberType
    ),
    [`${aggregatorGlobalId}Avg`]: createAggregationFieldsResolver(
      model,
      fields,
      'avg',
      isNumberType
    ),
    [`${aggregatorGlobalId}Min`]: createAggregationFieldsResolver(
      model,
      fields,
      'min',
      isNumberType
    ),
    [`${aggregatorGlobalId}Max`]: createAggregationFieldsResolver(
      model,
      fields,
      'max',
      isNumberType
    ),
  };
};

/**
 * Add numeric aggregation operations to resolvers
 * @private
 */
const addNumericAggregationOperations = (resolvers, aggregatorGlobalId) => {
  const defaultAggregatorFunc = obj => obj;
  _.merge(resolvers[aggregatorGlobalId], {
    sum: defaultAggregatorFunc,
    avg: defaultAggregatorFunc,
    min: defaultAggregatorFunc,
    max: defaultAggregatorFunc,
  });
};

const formatConnectionAggregator = function(fields, model, modelName) {
  const { globalId } = model;
  const numericFields = getFieldsByTypes(fields, isNumberType, () => 'Float');
  const aggregatorGlobalId = `${globalId}Aggregator`;
  const initialFields = buildInitialAggregatorFields();
  const hasNumericFields = !_.isEmpty(numericFields);

  if (hasNumericFields) {
    addNumericAggregationFields(initialFields, aggregatorGlobalId);
  }

  const gqlNumberFormat = toSDL(numericFields);
  const aggregatorTypes = buildAggregatorTypeDefinitions(
    aggregatorGlobalId,
    initialFields,
    gqlNumberFormat,
    hasNumericFields
  );

  let resolvers = createBaseAggregatorResolvers(aggregatorGlobalId, modelName, model);

  if (hasNumericFields) {
    addNumericAggregationOperations(resolvers, aggregatorGlobalId);
    resolvers = {
      ...resolvers,
      ...createNumericAggregationResolvers(aggregatorGlobalId, model, fields),
    };
  }

  return {
    globalId: aggregatorGlobalId,
    type: aggregatorTypes,
    resolver: resolvers,
  };
};

/**
 * Build connection fields definition
 * @private
 */
const buildConnectionFields = (globalId) => {
  return {
    values: `[${globalId}]`,
    groupBy: `${globalId}GroupBy`,
    aggregate: `${globalId}Aggregator`,
  };
};

/**
 * Build model connection types
 * @private
 */
const buildModelConnectionTypes = (connectionGlobalId, connectionFields, aggregatorFormat, groupByFormat) => {
  let modelConnectionTypes = `type ${connectionGlobalId} {${toSDL(connectionFields)}}\n\n`;
  if (aggregatorFormat) {
    modelConnectionTypes += aggregatorFormat.type;
  }
  modelConnectionTypes += groupByFormat.type;
  return modelConnectionTypes;
};

/**
 * Build connection query definition
 * @private
 */
const buildConnectionQueryDef = (pluralName, connectionGlobalId) => {
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
 * Build connection query resolvers
 * @private
 */
const buildConnectionQueryResolvers = (pluralName, connectionGlobalId, connectionResolver) => {
  return {
    Query: {
      [pluralName + 'Connection']: buildQueryResolver(pluralName + 'Connection', {
        resolverOf: undefined,
        resolver(obj, options) {
          return options;
        },
      }),
    },
    [connectionGlobalId]: {
      values(obj, options, gqlCtx) {
        return connectionResolver(obj, obj, gqlCtx);
      },
      groupBy(obj) {
        return obj;
      },
      aggregate(obj) {
        return obj;
      },
    },
  };
};

/**
 * Merge connection resolvers
 * @private
 */
const mergeConnectionResolvers = (baseResolvers, aggregatorFormat, groupByFormat) => {
  return {
    ...baseResolvers,
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
  const connectionFields = buildConnectionFields(globalId);
  const pluralName = pluralize.plural(_.camelCase(name));

  const modelConnectionTypes = buildModelConnectionTypes(
    connectionGlobalId,
    connectionFields,
    aggregatorFormat,
    groupByFormat
  );

  const connectionResolver = buildQueryResolver(`${pluralName}Connection.values`, resolver);

  const queryDef = buildConnectionQueryDef(pluralName, connectionGlobalId);
  const baseResolvers = buildConnectionQueryResolvers(pluralName, connectionGlobalId, connectionResolver);
  const allResolvers = mergeConnectionResolvers(baseResolvers, aggregatorFormat, groupByFormat);

  return {
    globalId: connectionGlobalId,
    definition: modelConnectionTypes,
    query: queryDef,
    resolvers: allResolvers,
  };
};

module.exports = {
  formatModelConnectionsGQL,
};
```