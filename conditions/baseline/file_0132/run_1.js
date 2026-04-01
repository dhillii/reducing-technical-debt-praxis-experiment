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
 */
const buildMongooseAggregationQuery = async (model, fieldKey, operation, filters) => {
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
 */
const buildBookshelfAggregationQuery = async (model, fieldKey, operation, filters) => {
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
 * Execute aggregation query based on ORM type
 */
const executeAggregationQuery = async (model, fieldKey, operation, filters) => {
  if (model.orm === 'mongoose') {
    return buildMongooseAggregationQuery(model, fieldKey, operation, filters);
  }

  if (model.orm === 'bookshelf') {
    return buildBookshelfAggregationQuery(model, fieldKey, operation, filters);
  }
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

      return executeAggregationQuery(model, fieldKey, operation, filters);
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
 * Build group by query for mongoose
 */
const buildMongooseGroupByQuery = async (model, fieldKey, params) => {
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
 * Build group by query for bookshelf
 */
const buildBookshelfGroupByQuery = async (model, fieldKey, params) => {
  return model
    .query(qb => {
      buildQuery({ model, filters: params })(qb);
      qb.groupBy(fieldKey);
      qb.select(fieldKey);
    })
    .fetchAll();
};

/**
 * Format bookshelf group by results
 */
const formatBookshelfGroupByResults = (result, fieldKey, filters) => {
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
 * Execute group by query based on ORM type
 */
const executeGroupByQuery = async (model, fieldKey, params, filters) => {
  if (model.orm === 'mongoose') {
    const result = await buildMongooseGroupByQuery(model, fieldKey, params);
    return preProcessGroupByData({
      result,
      fieldKey,
      filters,
    });
  }

  if (model.orm === 'bookshelf') {
    const result = await buildBookshelfGroupByQuery(model, fieldKey, params);
    return formatBookshelfGroupByResults(result, fieldKey, filters);
  }
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

    return executeGroupByQuery(model, fieldKey, params, filters);
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
 * Create aggregator field definitions
 */
const createAggregatorFieldDefinitions = (aggregatorGlobalId, numericFields) => {
  const initialFields = {
    count: 'Int',
    totalCount: 'Int',
  };

  if (!_.isEmpty(numericFields)) {
    ['sum', 'avg', 'min', 'max'].forEach(agg => {
      initialFields[agg] = `${aggregatorGlobalId}${_.startCase(agg)}`;
    });
  }

  return initialFields;
};

/**
 * Create aggregator type definitions
 */
const createAggregatorTypeDefinitions = (aggregatorGlobalId, numericFields, gqlNumberFormat) => {
  let aggregatorTypes = `type ${aggregatorGlobalId} {${toSDL(createAggregatorFieldDefinitions(aggregatorGlobalId, numericFields))}}\n\n`;

  if (!_.isEmpty(numericFields)) {
    aggregatorTypes += `type ${aggregatorGlobalId}Sum {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Avg {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Min {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Max {${gqlNumberFormat}}\n\n`;
  }

  return aggregatorTypes;
};

/**
 * Create aggregator resolvers
 */
const createAggregatorResolvers = (aggregatorGlobalId, model, fields, numericFields, modelName) => {
  const resolvers = {
    [aggregatorGlobalId]: {
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
    },
  };

  if (!_.isEmpty(numericFields)) {
    const defaultAggregatorFunc = obj => obj;

    _.merge(resolvers[aggregatorGlobalId], {
      sum: defaultAggregatorFunc,
      avg: defaultAggregatorFunc,
      min: defaultAggregatorFunc,
      max: defaultAggregatorFunc,
    });

    resolvers[`${aggregatorGlobalId}Sum`] = createAggregationFieldsResolver(
      model,
      fields,
      'sum',
      isNumberType
    );
    resolvers[`${aggregatorGlobalId}Avg`] = createAggregationFieldsResolver(
      model,
      fields,
      'avg',
      isNumberType
    );
    resolvers[`${aggregatorGlobalId}Min`] = createAggregationFieldsResolver(
      model,
      fields,
      'min',
      isNumberType
    );
    resolvers[`${aggregatorGlobalId}Max`] = createAggregationFieldsResolver(
      model,
      fields,
      'max',
      isNumberType
    );
  }

  return resolvers;
};

const formatConnectionAggregator = function(fields, model, modelName) {
  const { globalId } = model;

  // Extract all fields of type Integer and Float and change their type to Float
  const numericFields = getFieldsByTypes(fields, isNumberType, () => 'Float');

  // Don't create an aggregator field if the model has not number fields
  const aggregatorGlobalId = `${globalId}Aggregator`;

  const gqlNumberFormat = toSDL(numericFields);
  const aggregatorTypes = createAggregatorTypeDefinitions(aggregatorGlobalId, numericFields, gqlNumberFormat);
  const resolvers = createAggregatorResolvers(aggregatorG