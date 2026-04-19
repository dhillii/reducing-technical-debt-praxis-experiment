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
 * Build aggregation query for mongoose
 *
 * @param {Object} model
 * @param {Object} filters
 * @param {String} fieldKey
 * @param {String} operation
 * @returns {Promise}
 */
const buildMongooseAggregation = (model, filters, fieldKey, operation) => {
  return buildQuery({ model, filters, aggregate: true })
    .group({
      _id: null,
      [fieldKey]: { [`$${operation}`]: `$${fieldKey}` },
    })
    .exec()
    .then(result => _.get(result, [0, fieldKey]));
};

/**
 * Build aggregation query for bookshelf
 *
 * @param {Object} model
 * @param {Object} filters
 * @param {String} fieldKey
 * @param {String} operation
 * @returns {Promise}
 */
const buildBookshelfAggregation = (model, filters, fieldKey, operation) => {
  return model
    .query(qb => {
      // apply filters
      buildQuery({ model, filters })(qb);

      // `sum, avg, min, max` pass nicely to knex :->
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
  const buildResolver = async (obj, options, context, fieldResolver, fieldKey) => {
    const filters = convertRestQueryParams({
      ...convertToParams(_.omit(obj, 'where')),
      ...convertToQuery(obj.where),
    });

    if (model.orm === 'mongoose') {
      return buildMongooseAggregation(model, filters, fieldKey, operation);
    }

    if (model.orm === 'bookshelf') {
      return buildBookshelfAggregation(model, filters, fieldKey, operation);
    }

    return null;
  };

  return createFieldsResolver(fields, buildResolver, typeCheck);
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
 * Build group by query for mongoose
 *
 * @param {Object} model
 * @param {Object} filters
 * @param {String} fieldKey
 * @returns {Promise}
 */
const buildMongooseGroupBy = (model, filters, fieldKey) => {
  return buildQuery({
    model,
    filters,
    aggregate: true,
  }).group({
    _id: `$${fieldKey === 'id' ? model.primaryKey : fieldKey}`,
  });
};

/**
 * Build group by query for bookshelf
 *
 * @param {Object} model
 * @param {Object} filters
 * @param {String} fieldKey
 * @returns {Promise}
 */
const buildBookshelfGroupBy = (model, filters, fieldKey) => {
  return model
    .query(qb => {
      buildQuery({ model, filters })(qb);
      qb.groupBy(fieldKey);
      qb.select(fieldKey);
    })
    .fetchAll();
};

/**
 * Process bookshelf group by result
 *
 * @param {Object} result
 * @param {String} fieldKey
 * @param {Object} filters
 * @returns {Array}
 */
const processBookshelfGroupByResult = (result, fieldKey, filters) => {
  let values = result.models
    .map(m => m.get(fieldKey)) // extract aggregate field
    .filter(v => !!v) // remove null
    .map(v => '' + v); // convert to string
  return values.map(v => ({
    key: v,
    connection: () => {
      return {
        ..._.omit(filters, ['limit']), // we shouldn't carry limit to sub-field
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
  const buildResolver = async (filters, options, context, fieldResolver, fieldKey) => {
    const params = convertRestQueryParams({
      ...convertToParams(_.omit(filters, 'where')),
      ...convertToQuery(filters.where),
    });

    if (model.orm === 'mongoose') {
      const result = await buildMongooseGroupBy(model, params, fieldKey);
      return preProcessGroupByData({
        result,
        fieldKey,
        filters,
      });
    }

    if (model.orm === 'bookshelf') {
      const result = await buildBookshelfGroupBy(model, params, fieldKey);
      return processBookshelfGroupByResult(result, fieldKey, filters);
    }

    return [];
  };

  return createFieldsResolver(fields, buildResolver, () => true);
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

const formatConnectionGroupBy = function(fields, model) {
  const { globalId } = model;
  const groupByGlobalId = `${globalId}GroupBy`;

  // Extract all primitive fields and change their types
  const groupByFields = getFieldsByTypes(
    fields,
    isNotOfTypeArray,
    (fieldType, fieldName) => `[${globalId}Connection${_.upperFirst(fieldName)}]`
  );

  // Get the generated field types
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
 * Build aggregator resolvers for mongoose
 *
 * @param {Object} model
 * @param {String} modelName
 * @param {String} plugin
 * @returns {Object}
 */
const buildMongooseAggregatorResolvers = (model, modelName, plugin) => {
  return {
    count(obj) {
      const opts = convertToQuery(obj.where);

      if (opts._q) {
        // allow search param
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
 * Build aggregator resolvers for bookshelf
 *
 * @param {Object} model
 * @param {String} modelName
 * @param {String} plugin
 * @returns {Object}
 */
const buildBookshelfAggregatorResolvers = (model, modelName, plugin) => {
  return {
    count(obj) {
      const opts = convertToQuery(obj.where);

      if (opts._q) {
        // allow search param
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
 * Create aggregator resolvers
 *
 * @param {Object} model
 * @param {String} modelName
 * @param {String} plugin
 * @returns {Object}
 */
const createAggregatorResolvers = (model, modelName, plugin) => {
  const baseResolvers = model.orm === 'mongoose'
    ? buildMongooseAggregatorResolvers(model, modelName, plugin)
    : buildBookshelfAggregatorResolvers(model, modelName, plugin);

  return baseResolvers;
};

/**
 * Create aggregation type definitions
 *
 * @param {Object} fields
 * @param {String} aggregatorGlobalId
 * @param {Object} numericFields
 * @param {String} gqlNumberFormat
 * @returns {String}
 */
const createAggregationTypes = (fields, aggregatorGlobalId, numericFields, gqlNumberFormat) => {
  const initialFields = {
    count: 'Int',
    totalCount: 'Int',
  };

  // Only add the aggregator's operations if there are some numeric fields
  if (!_.isEmpty(numericFields)) {
    ['sum', 'avg', 'min', 'max'].forEach(agg => {
      initialFields[agg] = `${aggregatorGlobalId}${_.startCase(agg)}`;
    });
  }

  const gqlNumberFormat = toSDL(numericFields);
  let aggregatorTypes = `type ${aggregatorGlobalId} {${toSDL(initialFields)}}\n\n`;

  if (!_.isEmpty(numericFields)) {
    aggregatorTypes += `type ${aggregatorGlobalId}Sum {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Avg {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Min {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Max {${gqlNumberFormat}}\n\n`;
  }

  return aggregatorTypes;
};

/**
 * Create aggregation resolvers
 *
 * @param {Object} model
 * @param {Object} fields
 * @param {String} aggregatorGlobalId
 * @param {String} operation
 * @param {Function} typeCheck
 * @returns {Object}
 */
const createAggregationResolvers = (model, fields, aggregatorGlobalId, operation, typeCheck) => {
  return {
    [`${aggregatorGlobalId}${_.startCase(operation)}`]: createAggregationFieldsResolver(
      model,
      fields,
      operation,
      typeCheck
    ),
  };
};

/**
 * Create aggregator format
 *
 * @param {Object} fields
 * @param {Object} model
 * @param {String} modelName
 * @returns {Object}
 */
const formatConnectionAggregator = function(fields, model, modelName) {
  const { globalId } = model;

  // Extract all fields of type Integer and Float and change their type to Float
  const numericFields = getFieldsByTypes(fields, isNumberType, () => 'Float');

  // Don't create an aggregator field if the model has not number fields
  const aggregatorGlobalId = `${globalId}Aggregator`;
  const initialFields = {
    count: 'Int',
    totalCount: 'Int',
  };

  // Only add the aggregator's operations if there are some numeric fields
  if (!_.isEmpty(numericFields)) {
    ['sum', 'avg', 'min', 'max'].forEach(agg => {
      initialFields[agg] = `${aggregatorGlobalId}${_.startCase(agg)}`;
    });
  }

  const gqlNumberFormat = toSDL(numericFields);
  let aggregatorTypes = `type ${aggregatorGlobalId} {${toSDL(initialFields)}}\n\n`;

  let resolvers = {
    [aggregatorGlobalId]: createAggregatorResolvers(model, modelName, model.plugin),
  };

  // Only add the aggregator's operations types and resolver if there are some numeric fields
  if (!_.isEmpty(numericFields)) {
    aggregatorTypes += `type ${aggregatorGlobalId}Sum {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Avg {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Min {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Max {${gqlNumberFormat}}\n\n`;

    resolvers = {
      ...resolvers,
      ...createAggregationResolvers(model, fields, aggregatorGlobalId, 'sum', isNumberType),
      ...createAggregationResolvers(model, fields, aggregatorGlobalId, 'avg', isNumberType),
      ...createAggregationResolvers(model, fields, aggregatorGlobalId, 'min', isNumberType),
      ...createAggregationResolvers(model, fields, aggregatorGlobalId, 'max', isNumberType),
    };
  }

  return {
    globalId: aggregatorGlobalId,
    type: aggregatorTypes,
    resolver: resolvers,
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
 *    aggregate: UserAggregate
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

  return {
    globalId: connectionGlobalId,
    definition: modelConnectionTypes,
    query: {
      [`${pluralName}Connection`]: {
        args: {
          sort: 'String',
          limit: 'Int',
          start: 'Int',
          where: 'JSON',
          ...(resolver.args || {}),
        },
        type: connectionGlobalId,
      },
    },
    resolvers: {
      Query: {
        [connectionQueryName]: buildQueryResolver(connectionQueryName, {
          resolverOf: resolver.resolverOf || resolver.resolver,
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
      ...aggregatorFormat.resolver,
      ...groupByFormat.resolver,
    },
  };
};

module.exports = {
  formatModelConnectionsGQL,
};
```