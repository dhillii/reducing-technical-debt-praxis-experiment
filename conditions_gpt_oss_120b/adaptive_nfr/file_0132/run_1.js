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
 * @param {String} type
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
 * @param {String} type
 * @returns {Boolean}
 */
const isEnumType = type => {
  return type === 'enumeration';
};

/**
 * Returns all fields that are not of type array
 *
 * @param {String} type
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
 *
 * @param {String} type
 * @returns {Boolean}
 */
const isNumberType = type => {
  const nonRequiredType = nonRequired(type);
  return nonRequiredType === 'Int' || nonRequiredType === 'Float';
};

/**
 * Returns a list of fields that have type included in fieldTypes.
 *
 * @param {Object} fields
 * @param {Function} typeCheck
 * @param {Function} returnType
 * @returns {Object}
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
 * @param {Object} field
 * @param {String} key
 * @returns {Function}
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
 * @param {Object} fields
 * @param {Function} resolverFn
 * @param {Function} typeCheck
 * @returns {Object}
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
 * @param {String} _type
 * @param {String} attributeType
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
 * Build filters from an object using Strapi utilities.
 *
 * @param {Object} obj
 * @returns {Object}
 */
function buildFiltersFromObject(obj) {
  return convertRestQueryParams({
    ...convertToParams(_.omit(obj, 'where')),
    ...convertToQuery(obj.where),
  });
}

/**
 * Resolve aggregation for a specific field.
 *
 * @param {Object} model
 * @param {String} operation
 * @param {String} fieldKey
 * @param {Object} obj
 * @returns {Promise<Number>}
 */
async function resolveAggregationField(model, operation, fieldKey, obj) {
  const filters = buildFiltersFromObject(obj);

  if (model.orm === 'mongoose') {
    return buildQuery({ model, filters, aggregate: true })
      .group({
        _id: null,
        [fieldKey]: { [`$${operation}`]: `$${fieldKey}` },
      })
      .exec()
      .then(result => _.get(result, [0, fieldKey]));
  }

  // bookshelf
  return model
    .query(qb => {
      buildQuery({ model, filters })(qb);
      qb[operation](`${fieldKey} as ${operation}_${fieldKey}`);
    })
    .fetch()
    .then(result => result.get(`${operation}_${fieldKey}`));
}

/**
 * Create the resolvers for each aggregation field.
 *
 * @param {Object} model
 * @param {Object} fields
 * @param {String} operation
 * @param {Function} typeCheck
 * @returns {Object}
 */
const createAggregationFieldsResolver = function (model, fields, operation, typeCheck) {
  const resolver = async (obj, options, context, fieldResolverFn, fieldKey) => {
    return resolveAggregationField(model, operation, fieldKey, obj);
  };

  return createFieldsResolver(fields, resolver, typeCheck);
};

/**
 * Correctly format the data returned by the group by
 *
 * @param {Object} param0
 * @param {Array} param0.result
 * @param {String} param0.fieldKey
 * @param {Object} param0.filters
 * @returns {Array}
 */
const preProcessGroupByData = function ({ result, fieldKey, filters }) {
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
 * Resolve group‑by for a specific field.
 *
 * @param {Object} model
 * @param {String} fieldKey
 * @param {Object} filters
 * @returns {Promise<Array>}
 */
async function resolveGroupByField(model, fieldKey, filters) {
  const params = buildFiltersFromObject(filters);

  if (model.orm === 'mongoose') {
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
  }

  // bookshelf
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
}

/**
 * Create the resolvers for each group by field.
 *
 * @param {Object} model
 * @param {Object} fields
 * @returns {Object}
 */
const createGroupByFieldsResolver = function (model, fields) {
  const resolver = async (filters, options, context, fieldResolverFn, fieldKey) => {
    return resolveGroupByField(model, fieldKey, filters);
  };

  return createFieldsResolver(fields, resolver, () => true);
};

/**
 * Generate the connection type of each non-array field of the model
 *
 * @param {Object} fields
 * @param {Object} model
 * @returns {String}
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
 * Build the GraphQL type definition for group‑by.
 *
 * @param {Object} fields
 * @param {Object} model
 * @returns {Object}
 */
function formatConnectionGroupBy(fields, model) {
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
}

/**
 * Build the initial aggregator fields object.
 *
 * @param {Object} numericFields
 * @param {String} aggregatorGlobalId
 * @returns {Object}
 */
function buildAggregatorInitialFields(numericFields, aggregatorGlobalId) {
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
}

/**
 * Build the GraphQL type definitions for numeric aggregations.
 *
 * @param {String} aggregatorGlobalId
 * @param {Object} numericFields
 * @returns {String}
 */
function buildAggregatorTypes(aggregatorGlobalId, numericFields) {
  const gqlNumberFormat = toSDL(numericFields);
  let types = `type ${aggregatorGlobalId} {${toSDL(buildAggregatorInitialFields(numericFields, aggregatorGlobalId))}}\n\n`;

  if (!_.isEmpty(numericFields)) {
    types += `type ${aggregatorGlobalId}Sum {${gqlNumberFormat}}\n\n`;
    types += `type ${aggregatorGlobalId}Avg {${gqlNumberFormat}}\n\n`;
    types += `type ${aggregatorGlobalId}Min {${gqlNumberFormat}}\n\n`;
    types += `type ${aggregatorGlobalId}Max {${gqlNumberFormat}}\n\n`;
  }

  return types;
}

/**
 * Build resolvers for the aggregator root fields.
 *
 * @param {String} modelName
 * @param {Object} model
 * @returns {Object}
 */
function buildAggregatorRootResolvers(modelName, model) {
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
}

/**
 * Build resolvers for numeric aggregation operations.
 *
 * @param {Object} model
 * @param {Object} fields
 * @param {String} aggregatorGlobalId
 * @returns {Object}
 */
function buildNumericAggregationResolvers(model, fields, aggregatorGlobalId) {
  const defaultAggregatorFunc = obj => {
    // eslint-disable-line no-unused-vars
    return obj;
  };

  const resolvers = {
    [aggregatorGlobalId]: {
      sum: defaultAggregatorFunc,
      avg: defaultAggregatorFunc,
      min: defaultAggregatorFunc,
      max: defaultAggregatorFunc,
    },
    [`${aggregatorGlobalId}Sum`]: createAggregationFieldsResolver(model, fields, 'sum', isNumberType),
    [`${aggregatorGlobalId}Avg`]: createAggregationFieldsResolver(model, fields, 'avg', isNumberType),
    [`${aggregatorGlobalId}Min`]: createAggregationFieldsResolver(model, fields, 'min', isNumberType),
    [`${aggregatorGlobalId}Max`]: createAggregationFieldsResolver(model, fields, 'max', isNumberType),
  };

  return resolvers;
}

/**
 * Format the connection aggregator part of the schema.
 *
 * @param {Object} fields
 * @param {Object} model
 * @param {String} modelName
 * @returns {Object}
 */
function formatConnectionAggregator(fields, model, modelName) {
  const { globalId } = model;
  const aggregatorGlobalId = `${globalId}Aggregator`;

  const numericFields = getFieldsByTypes(fields, isNumberType, () => 'Float');

  const typeDef = buildAggregatorTypes(aggregatorGlobalId, numericFields);
  const rootResolvers = buildAggregatorRootResolvers(modelName, model);
  const resolvers = _.isEmpty(numericFields)
    ? { [aggregatorGlobalId]: rootResolvers }
    : {
        [aggregatorGlobalId]: { ...rootResolvers },
        ...buildNumericAggregationResolvers(model, fields, aggregatorGlobalId),
      };

  return {
    globalId: aggregatorGlobalId,
    type: typeDef,
    resolver: resolvers,
  };
}

/**
 * This method is the entry point to the GraphQL's Aggregation.
 *
 * @param {Object} param0
 * @param {Object} param0.fields
 * @param {Object} param0.model
 * @param {String} param0.name
 * @param {Object} param0.resolver
 * @returns {Object}
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
  const connectionResolver = buildQueryResolver(`${pluralName}Connection.values`, resolver);
  const connectionQueryName = `${pluralName}Connection`;

  let modelConnectionTypes = `type ${connectionGlobalId} {${toSDL(connectionFields)}}\n\n`;
  if (aggregatorFormat) {
    modelConnectionTypes += aggregatorFormat.type;
  }
  modelConnectionTypes += groupByFormat.type;

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