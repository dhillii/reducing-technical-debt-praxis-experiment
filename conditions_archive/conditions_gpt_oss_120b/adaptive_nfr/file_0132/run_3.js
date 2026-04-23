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
const createFieldsResolver = function (fields, resolverFn, typeCheck) {
  const resolver = Object.keys(fields).reduce((acc, fieldKey) => {
    const field = fields[fieldKey];
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
const extractType = function (_type, attributeType) {
  return isPrimitiveType(_type)
    ? _type.replace('!', '')
    : isEnumType(attributeType)
    ? 'String'
    : 'ID';
};

/**
 * Build filters object from a resolver input.
 *
 * @param {Object} obj - Resolver input object.
 * @returns {Object} Filters ready for query building.
 */
const buildFiltersFromObj = obj => {
  return convertRestQueryParams({
    ...convertToParams(_.omit(obj, 'where')),
    ...convertToQuery(obj.where),
  });
};

/**
 * Execute aggregation for mongoose ORM.
 *
 * @param {Object} model - Strapi model.
 * @param {Object} filters - Query filters.
 * @param {string} operation - Aggregation operation (sum, avg, min, max).
 * @param {string} fieldKey - Field to aggregate.
 * @returns {Promise<Number>} Aggregated value.
 */
const executeMongooseAggregation = async (model, filters, operation, fieldKey) => {
  const result = await buildQuery({ model, filters, aggregate: true })
    .group({
      _id: null,
      [fieldKey]: { [`$${operation}`]: `$${fieldKey}` },
    })
    .exec();

  return _.get(result, [0, fieldKey]);
};

/**
 * Execute aggregation for bookshelf ORM.
 *
 * @param {Object} model - Strapi model.
 * @param {Object} filters - Query filters.
 * @param {string} operation - Aggregation operation (sum, avg, min, max).
 * @param {string} fieldKey - Field to aggregate.
 * @returns {Promise<Number>} Aggregated value.
 */
const executeBookshelfAggregation = (model, filters, operation, fieldKey) => {
  return model
    .query(qb => {
      buildQuery({ model, filters })(qb);
      qb[operation](`${fieldKey} as ${operation}_${fieldKey}`);
    })
    .fetch()
    .then(result => result.get(`${operation}_${fieldKey}`));
};

/**
 * Resolver used by aggregation fields.
 *
 * @param {Object} model - Strapi model.
 * @param {string} operation - Aggregation operation.
 * @param {Function} typeCheck - Function to validate field type.
 * @returns {Object} Fields resolver.
 */
const createAggregationFieldsResolver = function (model, fields, operation, typeCheck) {
  const resolver = async (obj, options, context, fieldResolver, fieldKey) => {
    const filters = buildFiltersFromObj(obj);

    if (model.orm === 'mongoose') {
      return executeMongooseAggregation(model, filters, operation, fieldKey);
    }

    if (model.orm === 'bookshelf') {
      return executeBookshelfAggregation(model, filters, operation, fieldKey);
    }
  };

  return createFieldsResolver(fields, resolver, typeCheck);
};

/**
 * Preprocess group‑by result for mongoose.
 *
 * @param {Object} param0 - Result container.
 * @returns {Array} Processed group‑by entries.
 */
const preProcessGroupByData = function ({ result, fieldKey, filters }) {
  const _result = _.toArray(result).filter(value => Boolean(value._id));
  return _.map(_result, value => ({
    key: value._id.toString(),
    connection: () => ({
      ...filters,
      where: {
        ...(filters.where || {}),
        [fieldKey]: value._id.toString(),
      },
    }),
  }));
};

/**
 * Build query parameters for group‑by resolvers.
 *
 * @param {Object} filters - Original filters.
 * @returns {Object} Rest query parameters.
 */
const buildParamsFromFilters = filters => {
  return convertRestQueryParams({
    ...convertToParams(_.omit(filters, 'where')),
    ...convertToQuery(filters.where),
  });
};

/**
 * Execute group‑by for mongoose ORM.
 *
 * @param {Object} model - Strapi model.
 * @param {Object} params - Query parameters.
 * @param {string} fieldKey - Field to group by.
 * @returns {Promise<Array>} Group‑by entries.
 */
const executeMongooseGroupBy = async (model, params, fieldKey) => {
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
 * Execute group‑by for bookshelf ORM.
 *
 * @param {Object} model - Strapi model.
 * @param {Object} params - Query parameters.
 * @param {string} fieldKey - Field to group by.
 * @param {Object} filters - Original filters.
 * @returns {Promise<Array>} Group‑by entries.
 */
const executeBookshelfGroupBy = (model, params, fieldKey, filters) => {
  return model
    .query(qb => {
      buildQuery({ model, filters: params })(qb);
      qb.groupBy(fieldKey);
      qb.select(fieldKey);
    })
    .fetchAll()
    .then(result => {
      const values = result.models
        .map(m => m.get(fieldKey))
        .filter(v => !!v)
        .map(v => '' + v);
      return values.map(v => ({
        key: v,
        connection: () => ({
          ..._.omit(filters, ['limit']),
          where: {
            ...(filters.where || {}),
            [fieldKey]: v,
          },
        }),
      }));
    });
};

/**
 * Resolver used by group‑by fields.
 *
 * @param {Object} model - Strapi model.
 * @returns {Object} Fields resolver.
 */
const createGroupByFieldsResolver = function (model, fields) {
  const resolver = async (filters, options, context, fieldResolver, fieldKey) => {
    const params = buildParamsFromFilters(filters);

    if (model.orm === 'mongoose') {
      const result = await executeMongooseGroupBy(model, params, fieldKey);
      return preProcessGroupByData({ result, fieldKey, filters });
    }

    if (model.orm === 'bookshelf') {
      return executeBookshelfGroupBy(model, params, fieldKey, filters);
    }
  };

  return createFieldsResolver(fields, resolver, () => true);
};

/**
 * Generate connection field types for non‑array fields.
 *
 * @param {Object} fields - Model fields.
 * @param {Object} model - Strapi model.
 * @returns {String} SDL definition.
 */
const generateConnectionFieldsTypes = function (fields, model) {
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
 * Build group‑by format object.
 *
 * @param {Object} fields - Model fields.
 * @param {Object} model - Strapi model.
 * @returns {Object} Group‑by format.
 */
const formatConnectionGroupBy = function (fields, model) {
  const { globalId } = model;
  const groupByGlobalId = `${globalId}GroupBy`;

  const groupByFields = getFieldsByTypes(
    fields,
    isNotOfTypeArray,
    (fieldType, fieldName) => `[${globalId}Connection${_.upperFirst(fieldName)}]`
  );

  const groupByTypes = `type ${groupByGlobalId} {${toSDL(groupByFields)}}\n\n` + generateConnectionFieldsTypes(fields, model);

  return {
    globalId: groupByGlobalId,
    type: groupByTypes,
    resolver: {
      [groupByGlobalId]: createGroupByFieldsResolver(model, groupByFields),
    },
  };
};

/**
 * Build numeric fields map.
 *
 * @param {Object} fields - Model fields.
 * @returns {Object} Numeric fields map.
 */
const buildNumericFields = fields => {
  return getFieldsByTypes(fields, isNumberType, () => 'Float');
};

/**
 * Build initial aggregator fields.
 *
 * @returns {Object} Initial fields map.
 */
const buildAggregatorInitialFields = () => ({
  count: 'Int',
  totalCount: 'Int',
});

/**
 * Build aggregator type definition header.
 *
 * @param {string} aggregatorGlobalId - Aggregator type name.
 * @param {Object} initialFields - Initial fields map.
 * @returns {string} SDL header.
 */
const buildAggregatorHeader = (aggregatorGlobalId, initialFields) => {
  return `type ${aggregatorGlobalId} {${toSDL(initialFields)}}\n\n`;
};

/**
 * Build default aggregator resolver (passes through object).
 *
 * @returns {Function}
 */
const defaultAggregatorResolver = () => obj => obj;

/**
 * Build aggregation resolvers for numeric operations.
 *
 * @param {Object} model - Strapi model.
 * @param {Object} fields - Model fields.
 * @param {string} aggregatorGlobalId - Aggregator type name.
 * @returns {Object} Resolvers map.
 */
const buildNumericAggregationResolvers = (model, fields, aggregatorGlobalId) => {
  const ops = ['sum', 'avg', 'min', 'max'];
  const resolvers = {};

  ops.forEach(op => {
    resolvers[`${aggregatorGlobalId}${_.startCase(op)}`] = createAggregationFieldsResolver(
      model,
      fields,
      op,
      isNumberType
    );
  });

  return resolvers;
};

/**
 * Build aggregator format object.
 *
 * @param {Object} fields - Model fields.
 * @param {Object} model - Strapi model.
 * @param {string} modelName - Content type name.
 * @returns {Object} Aggregator format.
 */
const formatConnectionAggregator = function (fields, model, modelName) {
  const { globalId } = model;
  const numericFields = buildNumericFields(fields);
  const aggregatorGlobalId = `${globalId}Aggregator`;
  const initialFields = buildAggregatorInitialFields();

  if (!_.isEmpty(numericFields)) {
    ['sum', 'avg', 'min', 'max'].forEach(agg => {
      initialFields[agg] = `${aggregatorGlobalId}${_.startCase(agg)}`;
    });
  }

  const gqlNumberFormat = toSDL(numericFields);
  let aggregatorTypes = buildAggregatorHeader(aggregatorGlobalId, initialFields);

  const resolvers = {
    [aggregatorGlobalId]: {
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
    },
  };

  if (!_.isEmpty(numericFields)) {
    aggregatorTypes += `type ${aggregatorGlobalId}Sum {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Avg {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Min {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Max {${gqlNumberFormat}}\n\n`;

    _.merge(resolvers[aggregatorGlobalId], {
      sum: defaultAggregatorResolver(),
      avg: defaultAggregatorResolver(),
      min: defaultAggregatorResolver(),
      max: defaultAggregatorResolver(),
    });

    Object.assign(resolvers, buildNumericAggregationResolvers(model, fields, aggregatorGlobalId));
  }

  return {
    globalId: aggregatorGlobalId,
    type: aggregatorTypes,
    resolver: resolvers,
  };
};

/**
 * Build the full GraphQL connection definition for a model.
 *
 * @param {Object} param0 - Input parameters.
 * @returns {Object} Connection definition bundle.
 */
const formatModelConnectionsGQL = function ({ fields, model: contentType, name, resolver }) {
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
      [connectionQueryName]: {
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