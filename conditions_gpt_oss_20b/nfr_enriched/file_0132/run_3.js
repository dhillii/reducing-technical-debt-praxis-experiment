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
 * Returns a map of fields that satisfy a type check.
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
 * Creates a resolver map for a set of fields.
 *
 * @param {Object} fields
 * @param {Function} resolverFn
 * @param {Function} typeCheck
 * @returns {Object}
 */
const createFieldsResolver = (fields, resolverFn, typeCheck) => {
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
 * Builds filters from an object.
 *
 * @param {Object} obj
 * @returns {Object}
 */
const buildFilters = obj => {
  return convertRestQueryParams({
    ...convertToParams(_.omit(obj, 'where')),
    ...convertToQuery(obj.where),
  });
};

/**
 * Handles aggregation for Mongoose models.
 *
 * @param {Object} model
 * @param {Object} filters
 * @param {String} operation
 * @param {String} fieldKey
 * @returns {Promise}
 */
const aggregateMongoose = async (model, filters, operation, fieldKey) => {
  const result = await buildQuery({ model, filters, aggregate: true })
    .group({
      _id: null,
      [fieldKey]: { [`$${operation}`]: `$${fieldKey}` },
    })
    .exec();
  return _.get(result, [0, fieldKey]);
};

/**
 * Handles aggregation for Bookshelf models.
 *
 * @param {Object} model
 * @param {Object} filters
 * @param {String} operation
 * @param {String} fieldKey
 * @returns {Promise}
 */
const aggregateBookshelf = async (model, filters, operation, fieldKey) => {
  return model
    .query(qb => {
      buildQuery({ model, filters })(qb);
      qb[operation](`${fieldKey} as ${operation}_${fieldKey}`);
    })
    .fetch()
    .then(result => result.get(`${operation}_${fieldKey}`));
};

/**
 * Factory for aggregation resolver functions.
 *
 * @param {Object} model
 * @param {String} operation
 * @param {Function} typeCheck
 * @returns {Function}
 */
const aggregationResolverFactory = (model, operation, typeCheck) => {
  return async (obj, options, context, fieldResolver, fieldKey) => {
    const filters = buildFilters(obj);
    if (model.orm === 'mongoose') {
      return aggregateMongoose(model, filters, operation, fieldKey);
    }
    if (model.orm === 'bookshelf') {
      return aggregateBookshelf(model, filters, operation, fieldKey);
    }
  };
};

/**
 * Creates resolvers for aggregation fields.
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
    aggregationResolverFactory(model, operation, typeCheck),
    typeCheck
  );
};

/**
 * Pre-processes group by data for Mongoose.
 *
 * @param {Object} params
 * @returns {Array}
 */
const preProcessGroupByData = ({ result, fieldKey, filters }) => {
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
 * Handles group by for Mongoose models.
 *
 * @param {Object} model
 * @param {Object} params
 * @param {String} fieldKey
 * @returns {Promise}
 */
const groupByMongoose = async (model, params, fieldKey) => {
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
 * Handles group by for Bookshelf models.
 *
 * @param {Object} model
 * @param {Object} params
 * @param {String} fieldKey
 * @returns {Promise}
 */
const groupByBookshelf = async (model, params, fieldKey) => {
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
 * Factory for group by resolver functions.
 *
 * @param {Object} model
 * @returns {Function}
 */
const groupByResolverFactory = model => {
  return async (filters, options, context, fieldResolver, fieldKey) => {
    const params = buildFilters(filters);
    if (model.orm === 'mongoose') {
      const result = await groupByMongoose(model, params, fieldKey);
      return preProcessGroupByData({ result, fieldKey, filters });
    }
    if (model.orm === 'bookshelf') {
      return groupByBookshelf(model, params, fieldKey);
    }
  };
};

/**
 * Creates resolvers for group by fields.
 *
 * @param {Object} model
 * @param {Object} fields
 * @returns {Object}
 */
const createGroupByFieldsResolver = (model, fields) => {
  const resolver = groupByResolverFactory(model);
  return createFieldsResolver(fields, resolver, () => true);
};

/**
 * Generates connection field types for primitive fields.
 *
 * @param {Object} fields
 * @param {Object} model
 * @returns {String}
 */
const generateConnectionFieldsTypes = (fields, model) => {
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
 * Formats group by connection type.
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
    type: groupByTypes + connectionTypes,
    resolver: {
      [groupByGlobalId]: createGroupByFieldsResolver(model, groupByFields),
    },
  };
};

/**
 * Builds aggregator types string.
 *
 * @param {Object} numericFields
 * @param {String} aggregatorGlobalId
 * @returns {String}
 */
const buildAggregatorTypes = (numericFields, aggregatorGlobalId) => {
  const gqlNumberFormat = toSDL(numericFields);
  let types = `type ${aggregatorGlobalId} {${toSDL({
    count: 'Int',
    totalCount: 'Int',
  })}}\n\n`;

  if (!_.isEmpty(numericFields)) {
    types += `type ${aggregatorGlobalId}Sum {${gqlNumberFormat}}\n\n`;
    types += `type ${aggregatorGlobalId}Avg {${gqlNumberFormat}}\n\n`;
    types += `type ${aggregatorGlobalId}Min {${gqlNumberFormat}}\n\n`;
    types += `type ${aggregatorGlobalId}Max {${gqlNumberFormat}}\n\n`;
  }
  return types;
};

/**
 * Builds aggregator resolvers.
 *
 * @param {Object} model
 * @param {String} modelName
 * @param {Object} numericFields
 * @param {String} aggregatorGlobalId
 * @returns {Object}
 */
const buildAggregatorResolvers = (model, modelName, numericFields, aggregatorGlobalId) => {
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
    const defaultAggregatorFunc = () => {};
    _.merge(resolvers[aggregatorGlobalId], {
      sum: defaultAggregatorFunc,
      avg: defaultAggregatorFunc,
      min: defaultAggregatorFunc,
      max: defaultAggregatorFunc,
    });

    resolvers[`${aggregatorGlobalId}Sum`] = createAggregationFieldsResolver(
      model,
      numericFields,
      'sum',
      isNumberType
    );
    resolvers[`${aggregatorGlobalId}Avg`] = createAggregationFieldsResolver(
      model,
      numericFields,
      'avg',
      isNumberType
    );
    resolvers[`${aggregatorGlobalId}Min`] = createAggregationFieldsResolver(
      model,
      numericFields,
      'min',
      isNumberType
    );
    resolvers[`${aggregatorGlobalId}Max`] = createAggregationFieldsResolver(
      model,
      numericFields,
      'max',
      isNumberType
    );
  }

  return resolvers;
};

/**
 * Formats aggregator connection type.
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

  const types = buildAggregatorTypes(numericFields, aggregatorGlobalId);
  const resolvers = buildAggregatorResolvers(model, modelName, numericFields, aggregatorGlobalId);

  return {
    globalId: aggregatorGlobalId,
    type: types,
    resolver: resolvers,
  };
};

/**
 * Builds query arguments for a connection.
 *
 * @param {Object} resolver
 * @returns {Object}
 */
const buildConnectionArgs = resolver => ({
  sort: 'String',
  limit: 'Int',
  start: 'Int',
  where: 'JSON',
  ...(resolver.args || {}),
});

/**
 * Formats the GraphQL connection for a model.
 *
 * @param {Object} params
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
        args: buildConnectionArgs(resolver),
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