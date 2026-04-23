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

/* -------------------------------------------------------------------------- */
/* Helper predicates                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Returns true if the type is a primitive GraphQL type.
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
 * Returns true if the type is an enumeration.
 *
 * @param {String} type
 * @returns {Boolean}
 */
const isEnumType = type => type === 'enumeration';

/**
 * Returns true if the field type is not an array.
 *
 * @param {String} type
 * @returns {Boolean}
 */
const isNotOfTypeArray = type => !/(\[\w+!?\])/.test(type);

/**
 * Returns true if the type is numeric (Int or Float).
 *
 * @param {String} type
 * @returns {Boolean}
 */
const isNumberType = type => {
  const nonRequiredType = nonRequired(type);
  return nonRequiredType === 'Int' || nonRequiredType === 'Float';
};

/* -------------------------------------------------------------------------- */
/* Generic utilities                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Returns a map of fields filtered by a type predicate.
 *
 * @param {Object} fields - All fields.
 * @param {Function} typeCheck - Predicate to test each field type.
 * @param {Function} returnType - Function to compute the returned value.
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
 * Resolve a field value using its resolver if present.
 *
 * @param {Object} field - GraphQL field definition.
 * @param {String} key - Field key.
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
 * Build a resolver map for a set of fields.
 *
 * @param {Object} fields - GraphQL fields.
 * @param {Function} resolverFn - Core resolver logic.
 * @param {Function} typeCheck - Predicate to filter fields.
 * @returns {Object}
 */
const createFieldsResolver = (fields, resolverFn, typeCheck) => {
  const resolver = Object.keys(fields).reduce((acc, fieldKey) => {
    const field = fields[fieldKey];
    if (typeCheck(field)) {
      acc[fieldKey] = (obj, options, context) =>
        resolverFn(
          obj,
          options,
          context,
          fieldResolver(field, fieldKey),
          fieldKey,
          obj,
          field
        );
    }
    return acc;
  }, {});
  return resolver;
};

/**
 * Convert a GraphQL type to its underlying primitive or reference type.
 *
 * @param {String} _type - Raw GraphQL type.
 * @param {String} attributeType - Strapi attribute type.
 * @returns {String}
 */
const extractType = (_type, attributeType) => {
  return isPrimitiveType(_type)
    ? _type.replace('!', '')
    : isEnumType(attributeType)
    ? 'String'
    : 'ID';
};

/* -------------------------------------------------------------------------- */
/* Aggregation resolvers                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Build aggregation resolver for a specific operation (sum, avg, min, max).
 *
 * @param {Object} model - Strapi model.
 * @param {String} operation - Aggregation operation.
 * @param {Function} typeCheck - Predicate to select numeric fields.
 * @returns {Function}
 */
const buildAggregationResolver = (model, operation, typeCheck) => {
  return async (obj, options, context, fieldResolver, fieldKey) => {
    const filters = convertRestQueryParams({
      ...convertToParams(_.omit(obj, 'where')),
      ...convertToQuery(obj.where),
    });

    if (model.orm === 'mongoose') {
      const result = await buildQuery({ model, filters, aggregate: true })
        .group({
          _id: null,
          [fieldKey]: { [`$${operation}`]: `$${fieldKey}` },
        })
        .exec();
      return _.get(result, [0, fieldKey]);
    }

    if (model.orm === 'bookshelf') {
      const result = await model
        .query(qb => {
          buildQuery({ model, filters })(qb);
          qb[operation](`${fieldKey} as ${operation}_${fieldKey}`);
        })
        .fetch();
      return result.get(`${operation}_${fieldKey}`);
    }
  };
};

/**
 * Create resolvers for aggregation fields of a model.
 *
 * @param {Object} model - Strapi model.
 * @param {Object} fields - All model fields.
 * @param {String} operation - Aggregation operation.
 * @param {Function} typeCheck - Predicate to select numeric fields.
 * @returns {Object}
 */
const createAggregationFieldsResolver = (model, fields, operation, typeCheck) => {
  return createFieldsResolver(
    fields,
    buildAggregationResolver(model, operation, typeCheck),
    typeCheck
  );
};

/* -------------------------------------------------------------------------- */
/* Group‑by resolvers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Transform raw group‑by results into GraphQL connection objects.
 *
 * @param {Object} param0
 * @param {Array} param0.result - Raw DB result.
 * @param {String} param0.fieldKey - Grouped field.
 * @param {Object} param0.filters - Original filters.
 * @returns {Array}
 */
const preProcessGroupByData = ({ result, fieldKey, filters }) => {
  const filtered = _.toArray(result).filter(v => Boolean(v._id));
  return filtered.map(value => ({
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
 * Build resolver for a single group‑by field.
 *
 * @param {Object} model - Strapi model.
 * @param {String} fieldKey - Field to group by.
 * @returns {Function}
 */
const buildGroupByFieldResolver = async (model, filters, options, context, fieldResolver, fieldKey) => {
  const params = convertRestQueryParams({
    ...convertToParams(_.omit(filters, 'where')),
    ...convertToQuery(filters.where),
  });

  if (model.orm === 'mongoose') {
    const result = await buildQuery({
      model,
      filters: params,
      aggregate: true,
    }).group({
      _id: `$${fieldKey === 'id' ? model.primaryKey : fieldKey}`,
    });
    return preProcessGroupByData({ result, fieldKey, filters });
  }

  if (model.orm === 'bookshelf') {
    const result = await model
      .query(qb => {
        buildQuery({ model, filters: params })(qb);
        qb.groupBy(fieldKey);
        qb.select(fieldKey);
      })
      .fetchAll();

    const values = result.models
      .map(m => m.get(fieldKey))
      .filter(v => !!v)
      .map(v => `${v}`);

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
  }
};

/**
 * Create resolvers for all group‑by fields of a model.
 *
 * @param {Object} model - Strapi model.
 * @param {Object} fields - Fields to expose for group‑by.
 * @returns {Object}
 */
const createGroupByFieldsResolver = (model, fields) => {
  return createFieldsResolver(fields, buildGroupByFieldResolver.bind(null, model), () => true);
};

/* -------------------------------------------------------------------------- */
/* Connection type generation                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Generate GraphQL connection field definitions for primitive fields.
 *
 * @param {Object} fields - All model fields.
 * @param {Object} model - Strapi model.
 * @returns {String}
 */
const generateConnectionFieldsTypes = (fields, model) => {
  const { globalId, attributes } = model;
  const primitiveFields = getFieldsByTypes(
    fields,
    isNotOfTypeArray,
    (type, name) => extractType(type, (attributes[name] || {}).type)
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
 * Build the group‑by part of the connection type.
 *
 * @param {Object} fields - All model fields.
 * @param {Object} model - Strapi model.
 * @returns {Object}
 */
const formatConnectionGroupBy = (fields, model) => {
  const { globalId } = model;
  const groupByGlobalId = `${globalId}GroupBy`;

  const groupByFields = getFieldsByTypes(
    fields,
    isNotOfTypeArray,
    (fieldType, fieldName) => `[${globalId}Connection${_.upperFirst(fieldName)}]`
  );

  const groupByTypes = `type ${groupByGlobalId} {${toSDL(groupByFields)}}\n\n${generateConnectionFieldsTypes(
    fields,
    model
  )}`;

  return {
    globalId: groupByGlobalId,
    type: groupByTypes,
    resolver: {
      [groupByGlobalId]: createGroupByFieldsResolver(model, groupByFields),
    },
  };
};

/**
 * Build the aggregator part of the connection type.
 *
 * @param {Object} fields - All model fields.
 * @param {Object} model - Strapi model.
 * @param {String} modelName - Content type name.
 * @returns {Object}
 */
const formatConnectionAggregator = (fields, model, modelName) => {
  const { globalId } = model;
  const aggregatorGlobalId = `${globalId}Aggregator`;

  const numericFields = getFieldsByTypes(fields, isNumberType, () => 'Float');
  const hasNumeric = !_.isEmpty(numericFields);

  const initialFields = {
    count: 'Int',
    totalCount: 'Int',
    ...(hasNumeric && {
      sum: `${aggregatorGlobalId}${_.startCase('sum')}`,
      avg: `${aggregatorGlobalId}${_.startCase('avg')}`,
      min: `${aggregatorGlobalId}${_.startCase('min')}`,
      max: `${aggregatorGlobalId}${_.startCase('max')}`,
    }),
  };

  const gqlNumberFormat = toSDL(numericFields);
  let aggregatorTypes = `type ${aggregatorGlobalId} {${toSDL(initialFields)}}\n\n`;

  const baseResolvers = {
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

  if (hasNumeric) {
    const defaultAgg = obj => obj; // pass‑through resolver

    aggregatorTypes += `type ${aggregatorGlobalId}Sum {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Avg {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Min {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Max {${gqlNumberFormat}}\n\n`;

    _.merge(baseResolvers[aggregatorGlobalId], {
      sum: defaultAgg,
      avg: defaultAgg,
      min: defaultAgg,
      max: defaultAgg,
    });

    const aggResolvers = {
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

    return {
      globalId: aggregatorGlobalId,
      type: aggregatorTypes,
      resolver: { ...baseResolvers, ...aggResolvers },
    };
  }

  return {
    globalId: aggregatorGlobalId,
    type: aggregatorTypes,
    resolver: baseResolvers,
  };
};

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Entry point to generate GraphQL connection types and resolvers for a model.
 *
 * @param {Object} param0
 * @param {Object} param0.fields - Model fields.
 * @param {Object} param0.model - Content type definition.
 * @param {String} param0.name - Content type name.
 * @param {Object} param0.resolver - Base resolver definition.
 * @returns {Object}
 */
const formatModelConnectionsGQL = ({ fields, model: contentType, name, resolver }) => {
  const { globalId } = contentType;
  const model = strapi.getModel(contentType.uid);
  const connectionGlobalId = `${globalId}Connection`;

  const aggregator = formatConnectionAggregator(fields, model, name);
  const groupBy = formatConnectionGroupBy(fields, model);

  const connectionFields = {
    values: `[${globalId}]`,
    groupBy: `${globalId}GroupBy`,
    aggregate: `${globalId}Aggregator`,
  };

  const pluralName = pluralize.plural(_.camelCase(name));
  const connectionResolver = buildQueryResolver(`${pluralName}Connection.values`, resolver);
  const connectionQueryName = `${pluralName}Connection`;

  let definition = `type ${connectionGlobalId} {${toSDL(connectionFields)}}\n\n`;
  definition += aggregator.type;
  definition += groupBy.type;

  return {
    globalId: connectionGlobalId,
    definition,
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
      ...aggregator.resolver,
      ...groupBy.resolver,
    },
  };
};

module.exports = {
  formatModelConnectionsGQL,
};