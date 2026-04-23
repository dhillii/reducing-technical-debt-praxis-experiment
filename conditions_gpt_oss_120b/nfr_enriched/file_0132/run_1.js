'use strict';

const _ = require('lodash');
const pluralize = require('pluralize');
const { convertRestQueryParams, buildQuery } = require('strapi-utils');

const { buildQuery: buildQueryResolver } = require('./resolvers-builder');
const { convertToParams, convertToQuery, nonRequired } = require('./utils');
const { toSDL } = require('./schema-definitions');

/**
 * Checks if a type is primitive.
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
 * Checks if a type is an enum.
 *
 * @param {String} type
 * @returns {Boolean}
 */
const isEnumType = type => type === 'enumeration';

/**
 * Checks if a type is not an array.
 *
 * @param {String} type
 * @returns {Boolean}
 */
const isNotOfTypeArray = type => !/(\[\w+!?\])/.test(type);

/**
 * Checks if a type is numeric (Int or Float).
 *
 * @param {String} type
 * @returns {Boolean}
 */
const isNumberType = type => {
  const nonRequiredType = nonRequired(type);
  return nonRequiredType === 'Int' || nonRequiredType === 'Float';
};

/**
 * Returns fields filtered by a type check.
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
 * Returns a resolver for a field.
 *
 * @param {Object} field
 * @param {String} key
 * @returns {Function}
 */
const fieldResolver = (field, key) => {
  return object => {
    const resolver = field.resolve || ((obj, _k) => obj[key]);
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
const createFieldsResolver = (fields, resolverFn, typeCheck) => {
  return Object.keys(fields).reduce((acc, fieldKey) => {
    const field = fields[fieldKey];
    if (!typeCheck(field)) {
      return acc;
    }

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
  }, {});
};

/**
 * Extracts the GraphQL type for a field.
 *
 * @param {String} _type
 * @param {String} attributeType
 * @returns {String}
 */
const extractType = (_type, attributeType) => {
  if (isPrimitiveType(_type)) {
    return _type.replace('!', '');
  }
  if (isEnumType(attributeType)) {
    return 'String';
  }
  return 'ID';
};

/**
 * Builds aggregation query for Mongoose.
 *
 * @param {Object} params
 * @returns {Promise}
 */
const buildMongooseAggregation = async ({ model, filters, operation, fieldKey }) => {
  const result = await buildQuery({ model, filters, aggregate: true })
    .group({
      _id: null,
      [fieldKey]: { [`$${operation}`]: `$${fieldKey}` },
    })
    .exec();

  return _.get(result, [0, fieldKey]);
};

/**
 * Builds aggregation query for Bookshelf.
 *
 * @param {Object} params
 * @returns {Promise}
 */
const buildBookshelfAggregation = ({ model, filters, operation, fieldKey }) => {
  return model
    .query(qb => {
      buildQuery({ model, filters })(qb);
      qb[operation](`${fieldKey} as ${operation}_${fieldKey}`);
    })
    .fetch()
    .then(result => result.get(`${operation}_${fieldKey}`));
};

/**
 * Creates aggregation field resolvers.
 *
 * @param {Object} model
 * @param {Object} fields
 * @param {String} operation
 * @param {Function} typeCheck
 * @returns {Object}
 */
const createAggregationFieldsResolver = (model, fields, operation, typeCheck) => {
  const resolverFn = async (obj, _options, _context, _fieldResolver, fieldKey) => {
    const filters = convertRestQueryParams({
      ...convertToParams(_.omit(obj, 'where')),
      ...convertToQuery(obj.where),
    });

    if (model.orm === 'mongoose') {
      return buildMongooseAggregation({ model, filters, operation, fieldKey });
    }

    if (model.orm === 'bookshelf') {
      return buildBookshelfAggregation({ model, filters, operation, fieldKey });
    }
  };

  return createFieldsResolver(fields, resolverFn, typeCheck);
};

/**
 * Preprocesses group‑by results.
 *
 * @param {Object} param0
 * @returns {Array}
 */
const preProcessGroupByData = ({ result, fieldKey, filters }) => {
  const filtered = _.toArray(result).filter(v => Boolean(v._id));
  return _.map(filtered, value => ({
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
 * Builds group‑by query for Mongoose.
 *
 * @param {Object} param0
 * @returns {Promise}
 */
const buildMongooseGroupBy = async ({ model, params, fieldKey }) => {
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
 * Builds group‑by query for Bookshelf.
 *
 * @param {Object} param0
 * @returns {Promise}
 */
const buildBookshelfGroupBy = ({ model, params, fieldKey }) => {
  return model
    .query(qb => {
      buildQuery({ model, filters: params })(qb);
      qb.groupBy(fieldKey);
      qb.select(fieldKey);
    })
    .fetchAll()
    .then(result => result.models.map(m => m.get(fieldKey)).filter(v => !!v).map(v => '' + v));
};

/**
 * Creates group‑by field resolvers.
 *
 * @param {Object} model
 * @param {Object} fields
 * @returns {Object}
 */
const createGroupByFieldsResolver = (model, fields) => {
  const resolver = async (filters, _options, _context, _fieldResolver, fieldKey) => {
    const params = convertRestQueryParams({
      ...convertToParams(_.omit(filters, 'where')),
      ...convertToQuery(filters.where),
    });

    if (model.orm === 'mongoose') {
      const result = await buildMongooseGroupBy({ model, params, fieldKey });
      return preProcessGroupByData({ result, fieldKey, filters });
    }

    if (model.orm === 'bookshelf') {
      const values = await buildBookshelfGroupBy({ model, params, fieldKey });
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

  return createFieldsResolver(fields, resolver, () => true);
};

/**
 * Generates connection field types for a model.
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
        `type ${globalId}Connection${_.upperFirst(fieldKey)} {${toSDL(connectionFields[fieldKey])}}`
    )
    .join('\n\n');
};

/**
 * Formats the group‑by part of a connection.
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
 * Builds aggregator type definitions and resolvers.
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

  const baseFields = {
    count: 'Int',
    totalCount: 'Int',
  };

  if (!_.isEmpty(numericFields)) {
    ['sum', 'avg', 'min', 'max'].forEach(agg => {
      baseFields[agg] = `${aggregatorGlobalId}${_.startCase(agg)}`;
    });
  }

  const gqlNumberFormat = toSDL(numericFields);
  let typeDefs = `type ${aggregatorGlobalId} {${toSDL(baseFields)}}\n\n`;

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
    const defaultAggResolver = obj => obj;

    typeDefs += `type ${aggregatorGlobalId}Sum {${gqlNumberFormat}}\n\n`;
    typeDefs += `type ${aggregatorGlobalId}Avg {${gqlNumberFormat}}\n\n`;
    typeDefs += `type ${aggregatorGlobalId}Min {${gqlNumberFormat}}\n\n`;
    typeDefs += `type ${aggregatorGlobalId}Max {${gqlNumberFormat}}\n\n`;

    Object.assign(resolvers[aggregatorGlobalId], {
      sum: defaultAggResolver,
      avg: defaultAggResolver,
      min: defaultAggResolver,
      max: defaultAggResolver,
    });

    Object.assign(resolvers, {
      [`${aggregatorGlobalId}Sum`]: createAggregationFieldsResolver(model, fields, 'sum', isNumberType),
      [`${aggregatorGlobalId}Avg`]: createAggregationFieldsResolver(model, fields, 'avg', isNumberType),
      [`${aggregatorGlobalId}Min`]: createAggregationFieldsResolver(model, fields, 'min', isNumberType),
      [`${aggregatorGlobalId}Max`]: createAggregationFieldsResolver(model, fields, 'max', isNumberType),
    });
  }

  return {
    globalId: aggregatorGlobalId,
    type: typeDefs,
    resolver: resolvers,
  };
};

/**
 * Formats model connections for GraphQL.
 *
 * @param {Object} param0
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
  let definition = `type ${connectionGlobalId} {${toSDL(connectionFields)}}\n\n`;
  definition += aggregator.type;
  definition += groupBy.type;

  const connectionResolver = buildQueryResolver(`${pluralName}Connection.values`, resolver);
  const connectionQueryName = `${pluralName}Connection`;

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