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
 * Returns a resolver that either uses the field's own resolver or the default.
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
 * Creates field resolvers for a set of fields.
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
  const result = await model
    .query(qb => {
      buildQuery({ model, filters })(qb);
      qb[operation](`${fieldKey} as ${operation}_${fieldKey}`);
    })
    .fetch();
  return result.get(`${operation}_${fieldKey}`);
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
const createAggregationFieldsResolver = (model, fields, operation, typeCheck) => {
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
const preProcessGroupByData = ({ result, fieldKey, filters }) => {
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
  return result;
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
      ..._.omit(params, ['limit']),
      where: {
        ...(params.where || {}),
        [fieldKey]: v,
      },
    }),
  }));
};

/**
 * Creates the resolvers for each group by field.
 *
 * @param {Object} model
 * @param {Object} fields
 * @returns {Object}
 */
const createGroupByFieldsResolver = (model, fields) => {
  const resolver = async (filters, options, context, fieldResolver, fieldKey) => {
    const params = convertRestQueryParams({
      ...convertToParams(_.omit(filters, 'where')),
      ...convertToQuery(filters.where),
    });

    if (model.orm === 'mongoose') {
      const result = await buildMongooseGroupBy(model, params, fieldKey);
      return preProcessGroupByData({ result, fieldKey, filters });
    }

    if (model.orm === 'bookshelf') {
      return buildBookshelfGroupBy(model, params, fieldKey);
    }
  };

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
 * Formats the group by connection type.
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
 * Builds aggregator resolvers for numeric fields.
 *
 * @param {String} modelName
 * @param {Object} model
 * @param {Object} numericFields
 * @returns {Object}
 */
const buildAggregatorResolvers = (modelName, model, numericFields) => {
  const resolvers = {
    [modelName]: {
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
    _.merge(resolvers[modelName], {
      sum: defaultAggregatorFunc,
      avg: defaultAggregatorFunc,
      min: defaultAggregatorFunc,
      max: defaultAggregatorFunc,
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
const formatConnectionAggregator = (fields, model, modelName) => {
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

  if (!_.isEmpty(numericFields)) {
    aggregatorTypes += `type ${aggregatorGlobalId}Sum {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Avg {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Min {${gqlNumberFormat}}\n\n`;
    aggregatorTypes += `type ${aggregatorGlobalId}Max {${gqlNumberFormat}}\n\n`;
  }

  const resolvers = buildAggregatorResolvers(modelName, model, numericFields);

  if (!_.isEmpty(numericFields)) {
    const aggResolver = fieldKey => {
      const resolverFn = async (obj, options, context, fieldResolver, fieldKey) => {
        const filters = convertRestQueryParams({
          ...convertToParams(_.omit(obj, 'where')),
          ...convertToQuery(obj.where),
        });

        if (model.orm === 'mongoose') {
          return buildMongooseAggregation(model, filters, fieldKey, obj);
        }

        if (model.orm === 'bookshelf') {
          return buildBookshelfAggregation(model, filters, fieldKey, obj);
        }
      };

      return createFieldsResolver(
        { [fieldKey]: numericFields[fieldKey] },
        resolverFn,
        () => true
      );
    };

    ['sum', 'avg', 'min', 'max'].forEach(agg => {
      const aggGlobalId = `${aggregatorGlobalId}${_.startCase(agg)}`;
      resolvers[aggGlobalId] = createAggregationFieldsResolver(
        model,
        fields,
        agg,
        isNumberType
      );
    });
  }

  return {
    globalId: aggregatorGlobalId,
    type: aggregatorTypes,
    resolver: resolvers,
  };
};

/**
 * Builds the GraphQL connection definition for a model.
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
  const connectionResolver = buildQueryResolver(`${pluralName}Connection.values`, resolver);

  const connectionQueryName = `${pluralName}Connection`;

  const definition = `type ${connectionGlobalId} {${toSDL(connectionFields)}}\n\n` +
    (aggregatorFormat.type || '') +
    groupByFormat.type;

  const query = {
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
  };

  const resolvers = {
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
  };

  return {
    globalId: connectionGlobalId,
    definition,
    query,
    resolvers,
  };
};

module.exports = {
  formatModelConnectionsGQL,
};
```