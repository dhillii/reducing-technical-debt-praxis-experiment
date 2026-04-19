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
const isEnumType = type => type === 'enumeration';

/**
 * Returns all fields that are not of type array
 *
 * @returns {Boolean}
 */
const isNotOfTypeArray = type => !/(\[\w+!?\])/.test(type);

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
 */
const extractType = function (_type, attributeType) {
  return isPrimitiveType(_type)
    ? _type.replace('!', '')
    : isEnumType(attributeType)
    ? 'String'
    : 'ID';
};

/**
 * Mongoose aggregation helper
 */
const getMongooseAggregationResult = async (model, filters, operation, fieldKey) => {
  const result = await buildQuery({ model, filters, aggregate: true })
    .group({
      _id: null,
      [fieldKey]: { [`$${operation}`]: `$${fieldKey}` },
    })
    .exec();
  return _.get(result, [0, fieldKey]);
};

/**
 * Bookshelf aggregation helper
 */
const getBookshelfAggregationResult = async (model, filters, operation, fieldKey) => {
  const result = await model
    .query(qb => {
      buildQuery({ model, filters })(qb);
      qb[operation](`${fieldKey} as ${operation}_${fieldKey}`);
    })
    .fetch();
  return result.get(`${operation}_${fieldKey}`);
};

/**
 * Create the resolvers for each aggregation field
 *
 * @return {Object}
 */
const createAggregationFieldsResolver = function (model, fields, operation, typeCheck) {
  const resolverFn = async (obj, options, context, fieldResolver, fieldKey) => {
    const filters = convertRestQueryParams({
      ...convertToParams(_.omit(obj, 'where')),
      ...convertToQuery(obj.where),
    });

    if (model.orm === 'mongoose') {
      return getMongooseAggregationResult(model, filters, operation, fieldKey);
    }

    if (model.orm === 'bookshelf') {
      return getBookshelfAggregationResult(model, filters, operation, fieldKey);
    }

    return null;
  };

  return createFieldsResolver(fields, resolverFn, typeCheck);
};

/**
 * Correctly format the data returned by the group by
 */
const preProcessGroupByData = function ({ result, fieldKey, filters }) {
  const _result = _.toArray(result).filter(value => Boolean(value._id));
  return _.map(_result, value => {
    return {
      key: value._id.toString(),
      connection: () => ({
        ...filters,
        where: {
          ...(filters.where || {}),
          [fieldKey]: value._id.toString(),
        },
      }),
    };
  });
};

/**
 * Mongoose group by helper
 */
const getMongooseGroupByResult = async (model, params, fieldKey) => {
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
 * Bookshelf group by helper
 */
const getBookshelfGroupByResult = async (model, params, fieldKey, filters) => {
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
 * Create the resolvers for each group by field
 *
 * @return {Object}
 */
const createGroupByFieldsResolver = function (model, fields) {
  const resolver = async (filters, options, context, fieldResolver, fieldKey) => {
    const params = convertRestQueryParams({
      ...convertToParams(_.omit(filters, 'where')),
      ...convertToQuery(filters.where),
    });

    if (model.orm === 'mongoose') {
      return getMongooseGroupByResult(model, params, fieldKey);
    }

    if (model.orm === 'bookshelf') {
      return getBookshelfGroupByResult(model, params, fieldKey, filters);
    }

    return null;
  };

  return createFieldsResolver(fields, resolver, () => true);
};

/**
 * Generate the connection type of each non-array field of the model
 *
 * @return {String}
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
 * Build group by connection definition
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
 * Build aggregator connection definition
 */
const formatConnectionAggregator = function (fields, model, modelName) {
  const { globalId } = model;

  const numericFields = getFieldsByTypes(fields, isNumberType, () => 'Float');

  const aggregatorGlobalId = `${globalId}Aggregator`;
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
 * Entry point to the GraphQL's Aggregation.
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