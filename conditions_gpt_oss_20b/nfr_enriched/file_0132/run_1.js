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
 * Returns true if the type is an enumeration.
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
 */
const isNotOfTypeArray = type => !/(\[\w+!?\])/.test(type);

/**
 * Returns true if the type is a number (Int or Float).
 *
 * @param {String} type
 * @returns {Boolean}
 */
const isNumberType = type => {
  const nonRequiredType = nonRequired(type);
  return nonRequiredType === 'Int' || nonRequiredType === 'Float';
};

/**
 * Returns a list of fields that satisfy a type check.
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
 * Returns a resolver function for a field.
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
 * Creates resolvers for a set of fields.
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
 * Extracts the GraphQL type for a field.
 *
 * @param {String} _type
 * @param {String} attributeType
 * @returns {String}
 */
const extractType = function (_type, attributeType) {
  return isPrimitiveType(_type)
    ? _type.replace('!', '')
    : isEnumType(attributeType)
    ? 'String'
    : 'ID';
};

/**
 * Builds a Mongoose aggregation query.
 *
 * @param {Object} model
 * @param {Object} filters
 * @param {String} operation
 * @param {String} fieldKey
 * @returns {Promise<Number>}
 */
const buildMongooseAggregation = async (model, filters, operation, fieldKey) => {
  const result = await buildQuery({ model, filters, aggregate: true })
    .group({
      _id: null,
      [fieldKey]: { [`$${operation}`]: `$${fieldKey}` },
    })
    .exec();
  return _.get(result, [0, fieldKey]);
};

/**
 * Builds a Bookshelf aggregation query.
 *
 * @param {Object} model
 * @param {Object} filters
 * @param {String} operation
 * @param {String} fieldKey
 * @returns {Promise<Number>}
 */
const buildBookshelfAggregation = async (model, filters, operation, fieldKey) => {
  return model
    .query(qb => {
      buildQuery({ model, filters })(qb);
      qb[operation](`${fieldKey} as ${operation}_${fieldKey}`);
    })
    .fetch()
    .then(result => result.get(`${operation}_${fieldKey}`));
};

/**
 * Creates the resolvers for each aggregation field.
 *
 * @param {Object} model
 * @param {Object} fields
 * @param {String} operation
 * @param {Function} typeCheck
 * @returns {Object}
 */
const createAggregationFieldsResolver = function (model, fields, operation, typeCheck) {
  const resolverFn = async (obj, options, context, fieldResolver, fieldKey) => {
    const filters = convertRestQueryParams({
      ...convertToParams(_.omit(obj, 'where')),
      ...convertToQuery(obj.where),
    });

    if (model.orm === 'mongoose') {
      return buildMongooseAggregation(model, filters, operation, fieldKey);
    }

    if (model.orm === 'bookshelf') {
      return buildBookshelfAggregation(model, filters, operation, fieldKey);
    }
  };

  return createFieldsResolver(fields, resolverFn, typeCheck);
};

/**
 * Pre-processes group by data for Mongoose.
 *
 * @param {Object} params
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
 * Builds a Mongoose group by query.
 *
 * @param {Object} model
 * @param {Object} params
 * @param {String} fieldKey
 * @returns {Promise<Array>}
 */
const buildMongooseGroupBy = async (model, params, fieldKey) => {
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
    filters: params,
  });
};

/**
 * Builds a Bookshelf group by query.
 *
 * @param {Object} model
 * @param {Object} params
 * @param {String} fieldKey
 * @returns {Promise<Array>}
 */
const buildBookshelfGroupBy = async (model, params, fieldKey) => {
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
          ..._.omit(params, ['limit']),
          where: {
            ...(params.where || {}),
            [fieldKey]: v,
          },
        }),
      }));
    });
};

/**
 * Creates the resolvers for each group by field.
 *
 * @param {Object} model
 * @param {Object} fields
 * @returns {Object}
 */
const createGroupByFieldsResolver = function (model, fields) {
  const resolverFn = async (filters, options, context, fieldResolver, fieldKey) => {
    const params = convertRestQueryParams({
      ...convertToParams(_.omit(filters, 'where')),
      ...convertToQuery(filters.where),
    });

    if (model.orm === 'mongoose') {
      return buildMongooseGroupBy(model, params, fieldKey);
    }

    if (model.orm === 'bookshelf') {
      return buildBookshelfGroupBy(model, params, fieldKey);
    }
  };

  return createFieldsResolver(fields, resolverFn, () => true);
};

/**
 * Generates connection field types for primitive fields.
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
        `type ${globalId}Connection${_.upperFirst(fieldKey)} {${toSDL(
          connectionFields[fieldKey]
        )}}`
    )
    .join('\n\n');
};

/**
 * Formats the group by connection type.
 *
 * @param {Object} fields
 * @param {Object} model
 * @returns {Object}
 */
const formatConnectionGroupBy = function (fields, model) {
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
    type: groupByTypes + connectionTypes,
    resolver: {
      [groupByGlobalId]: createGroupByFieldsResolver(model, groupByFields),
    },
  };
};

/**
 * Builds aggregator resolvers for a model.
 *
 * @param {String} aggregatorGlobalId
 * @param {String} modelName
 * @param {Object} numericFields
 * @returns {Object}
 */
const buildAggregatorResolvers = function (aggregatorGlobalId, modelName, numericFields) {
  const resolvers = {
    [aggregatorGlobalId]: {
      count(obj) {
        const opts = convertToQuery(obj.where);

        if (opts._q) {
          return strapi.query(modelName, strapi.plugin).countSearch(opts);
        }
        return strapi.query(modelName, strapi.plugin).count(opts);
      },
      totalCount() {
        return strapi.query(modelName, strapi.plugin).count({});
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

    const operations = ['sum', 'avg', 'min', 'max'];
    operations.forEach(op => {
      resolvers[`${aggregatorGlobalId}${_.upperFirst(op)}`] = createAggregationFieldsResolver(
        strapi.getModel(modelName),
        numericFields,
        op,
        isNumberType
      );
    });
  }

  return resolvers;
};

/**
 * Formats the aggregator connection type.
 *
 * @param {Object} fields
 * @param {Object} model
 * @param {String} modelName
 * @returns {Object}
 */
const formatConnectionAggregator = function (fields, model, modelName) {
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

  if (!_.isEmpty(numericFields)) {
    aggregatorTypes += `type ${aggregatorGlobalId}Sum {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Avg {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Min {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Max {${gqlNumberFormat}}\n\n`;
  }

  return {
    globalId: aggregatorGlobalId,
    type: aggregatorTypes,
    resolver: buildAggregatorResolvers(aggregatorGlobalId, modelName, numericFields),
  };
};

/**
 * Builds the GraphQL query resolver for a connection.
 *
 * @param {String} name
 * @param {Object} resolver
 * @returns {Object}
 */
const buildConnectionQuery = function (name, resolver) {
  return {
    [name]: {
      args: {
        sort: 'String',
        limit: 'Int',
        start: 'Int',
        where: 'JSON',
        ...(resolver.args || {}),
      },
      type: `${name}Connection`,
    },
  };
};

/**
 * Builds the GraphQL resolver for a connection.
 *
 * @param {String} connectionGlobalId
 * @param {Object} resolver
 * @returns {Object}
 */
const buildConnectionResolver = function (connectionGlobalId, resolver) {
  return {
    Query: {
      [`${_.camelCase(connectionGlobalId)}Connection`]: buildQueryResolver(
        `${_.camelCase(connectionGlobalId)}Connection.values`,
        resolver
      ),
    },
    [connectionGlobalId]: {
      values(obj, options, gqlCtx) {
        return resolver(obj, obj, gqlCtx);
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
 * Formats the GraphQL types and resolvers for a model's connections.
 *
 * @param {Object} params
 * @returns {Object}
 */
const formatModelConnectionsGQL = function ({ fields, model: contentType, name, resolver }) {
  const { globalId } = contentType;
  const model = strapi.getModel(contentType.uid);

  const connectionGlobalId = `${globalId}Connection`;
  const pluralName = pluralize.plural(_.camelCase(name));

  const aggregatorFormat = formatConnectionAggregator(fields, model, name);
  const groupByFormat = formatConnectionGroupBy(fields, model);

  const connectionFields = {
    values: `[${globalId}]`,
    groupBy: `${globalId}GroupBy`,
    aggregate: `${globalId}Aggregator`,
  };

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
    query: buildConnectionQuery(connectionQueryName, resolver),
    resolvers: {
      ...buildConnectionResolver(connectionGlobalId, connectionResolver),
      ...aggregatorFormat.resolver,
      ...groupByFormat.resolver,
    },
  };
};

module.exports = {
  formatModelConnectionsGQL,
};