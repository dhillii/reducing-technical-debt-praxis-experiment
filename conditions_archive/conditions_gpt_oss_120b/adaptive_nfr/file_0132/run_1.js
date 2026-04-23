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
 * Returns true if the type is an enum.
 *
 * @param {String} type
 * @returns {Boolean}
 */
const isEnumType = type => type === 'enumeration';

/**
 * Returns true if the type is not an array.
 *
 * @param {String} type
 * @returns {Boolean}
 *
 * @example
 * isNotOfTypeArray('[String]') // false
 * isNotOfTypeArray('String!') // true
 */
const isNotOfTypeArray = type => !/(\[\w+!?\])/.test(type);

/**
 * Returns true if the type is an integer or float.
 *
 * @param {String} type
 * @returns {Boolean}
 */
const isNumberType = type => {
  const nonRequiredType = nonRequired(type);
  return nonRequiredType === 'Int' || nonRequiredType === 'Float';
};

/**
 * Reduces a fields object to a map of fieldName => transformedValue based on a type check.
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
 * Returns a resolver that either uses the field's custom resolver or falls back to direct property access.
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
 * Creates resolvers for a set of fields based on a provided resolver factory and type check.
 *
 * @param {Object} fields
 * @param {Function} resolverFactory
 * @param {Function} typeCheck
 * @returns {Object}
 */
const createFieldsResolver = (fields, resolverFactory, typeCheck) => {
  return Object.keys(fields).reduce((acc, fieldKey) => {
    const field = fields[fieldKey];
    if (!typeCheck(field)) {
      return acc;
    }
    acc[fieldKey] = (obj, options, context) =>
      resolverFactory(
        obj,
        options,
        context,
        fieldResolver(field, fieldKey),
        fieldKey,
        obj,
        field
      );
    return acc;
  }, {});
};

/**
 * Extracts the GraphQL type for a given attribute.
 *
 * @param {String} _type
 * @param {String} attributeType
 * @returns {String}
 */
const extractType = (_type, attributeType) => {
  return isPrimitiveType(_type)
    ? _type.replace('!', '')
    : isEnumType(attributeType)
    ? 'String'
    : 'ID';
};

/**
 * Builds a resolver for aggregation operations (sum, avg, min, max).
 *
 * @param {Object} model
 * @param {String} operation
 * @param {Function} typeCheck
 * @returns {Function}
 */
const buildAggregationResolver = (model, operation, typeCheck) => {
  return async (obj, options, context, fieldResolverFn, fieldKey) => {
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
 * Creates aggregation field resolvers for a model.
 *
 * @param {Object} model
 * @param {Object} fields
 * @param {String} operation
 * @param {Function} typeCheck
 * @returns {Object}
 */
const createAggregationFieldsResolver = (model, fields, operation, typeCheck) => {
  return createFieldsResolver(
    fields,
    buildAggregationResolver(model, operation, typeCheck),
    typeCheck
  );
};

/**
 * Formats group‑by results for Mongoose.
 *
 * @param {Object} params
 * @param {Array} params.result
 * @param {String} params.fieldKey
 * @param {Object} params.filters
 * @returns {Array}
 */
const formatMongooseGroupBy = ({ result, fieldKey, filters }) => {
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
 * Formats group‑by results for Bookshelf.
 *
 * @param {Object} params
 * @param {Object} params.result
 * @param {String} params.fieldKey
 * @param {Object} params.filters
 * @returns {Array}
 */
const formatBookshelfGroupBy = ({ result, fieldKey, filters }) => {
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
};

/**
 * Builds a resolver for group‑by fields.
 *
 * @param {Object} model
 * @returns {Function}
 */
const buildGroupByResolver = model => {
  return async (filters, options, context, fieldResolverFn, fieldKey) => {
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
      return formatMongooseGroupBy({ result, fieldKey, filters });
    }

    if (model.orm === 'bookshelf') {
      const result = await model
        .query(qb => {
          buildQuery({ model, filters: params })(qb);
          qb.groupBy(fieldKey);
          qb.select(fieldKey);
        })
        .fetchAll();
      return formatBookshelfGroupBy({ result, fieldKey, filters });
    }
  };
};

/**
 * Creates group‑by field resolvers for a model.
 *
 * @param {Object} model
 * @param {Object} fields
 * @returns {Object}
 */
const createGroupByFieldsResolver = (model, fields) => {
  return createFieldsResolver(fields, buildGroupByResolver(model), () => true);
};

/**
 * Generates connection field type definitions for non‑array fields.
 *
 * @param {Object} fields
 * @param {Object} model
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
        `type ${globalId}Connection${_.upperFirst(fieldKey)} {${toSDL(
          connectionFields[fieldKey]
        )}}`
    )
    .join('\n\n');
};

/**
 * Formats the group‑by part of a connection type.
 *
 * @param {Object} fields
 * @param {Object} model
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

  const groupByTypes = `type ${groupByGlobalId} {${toSDL(groupByFields)}}\n\n`;
  const connectionTypes = generateConnectionFieldsTypes(fields, model);

  return {
    globalId: groupByGlobalId,
    type: `${groupByTypes}${connectionTypes}`,
    resolver: {
      [groupByGlobalId]: createGroupByFieldsResolver(model, groupByFields),
    },
  };
};

/**
 * Formats the aggregator part of a connection type.
 *
 * @param {Object} fields
 * @param {Object} model
 * @param {String} modelName
 * @returns {Object}
 */
const formatConnectionAggregator = (fields, model, modelName) => {
  const { globalId } = model;
  const aggregatorGlobalId = `${globalId}Aggregator`;

  const numericFields = getFieldsByTypes(fields, isNumberType, () => 'Float');

  const initialFields = {
    count: 'Int',
    totalCount: 'Int',
  };

  if (!_.isEmpty(numericFields)) {
    ['sum', 'avg', 'min', 'max'].forEach(agg => {
      initialFields[agg] = `${aggregatorGlobalId}${_.startCase(agg)}`;
    });
  }

  const gqlNumberFormat = toSDL(numericFields);
  let aggregatorTypes = `type ${aggregatorGlobalId} {${toSDL(initialFields)}}\n\n`;

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
    const defaultAggregatorFunc = obj => obj;

    aggregatorTypes += `type ${aggregatorGlobalId}Sum {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Avg {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Min {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Max {${gqlNumberFormat}}\n\n`;

    _.merge(resolvers[aggregatorGlobalId], {
      sum: defaultAggregatorFunc,
      avg: defaultAggregatorFunc,
      min: defaultAggregatorFunc,
      max: defaultAggregatorFunc,
    });

    Object.assign(resolvers, {
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
    });
  }

  return {
    globalId: aggregatorGlobalId,
    type: aggregatorTypes,
    resolver: resolvers,
  };
};

/**
 * Entry point to build GraphQL aggregation for a model.
 *
 * @param {Object} params
 * @param {Object} params.fields
 * @param {Object} params.model
 * @param {String} params.name
 * @param {Object} params.resolver
 * @returns {Object}
 */
const formatModelConnectionsGQL = ({ fields, model: contentType, name, resolver }) => {
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

  let definition = `type ${connectionGlobalId} {${toSDL(connectionFields)}}\n\n`;
  definition += aggregatorFormat.type;
  definition += groupByFormat.type;

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
      ...aggregatorFormat.resolver,
      ...groupByFormat.resolver,
    },
  };
};

module.exports = {
  formatModelConnectionsGQL,
};