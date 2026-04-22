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
  const t = nonRequired(type);
  return ['Int', 'Float', 'String', 'Boolean', 'DateTime', 'JSON'].includes(t);
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
  const t = nonRequired(type);
  return t === 'Int' || t === 'Float';
};

/* -------------------------------------------------------------------------- */
/* Generic utilities                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Reduce fields by a predicate and map them with a transformer.
 *
 * @param {Object} fields
 * @param {Function} typeCheck
 * @param {Function} returnType
 * @returns {Object}
 */
const getFieldsByTypes = (fields, typeCheck, returnType) =>
  _.reduce(
    fields,
    (acc, fieldType, fieldName) => {
      if (typeCheck(fieldType)) {
        acc[fieldName] = returnType(fieldType, fieldName);
      }
      return acc;
    },
    {}
  );

/**
 * Resolve a field value using its resolver or fallback to direct property access.
 *
 * @param {Object} field
 * @param {String} key
 * @returns {Function}
 */
const fieldResolver = (field, key) => object => {
  const resolver = field.resolve || ((obj, _k) => obj[key]);
  return resolver(object);
};

/**
 * Build an object containing resolvers for each field that passes a type check.
 *
 * @param {Object} fields
 * @param {Function} resolverFn
 * @param {Function} typeCheck
 * @returns {Object}
 */
const createFieldsResolver = (fields, resolverFn, typeCheck) => {
  return Object.keys(fields).reduce((acc, fieldKey) => {
    const field = fields[fieldKey];
    if (!typeCheck(field)) return acc;

    acc[fieldKey] = (obj, options, context) =>
      resolverFn(obj, options, context, fieldResolver(field, fieldKey), fieldKey, obj, field);
    return acc;
  }, {});
};

/**
 * Convert a GraphQL type to its underlying primitive or reference type.
 *
 * @param {String} _type
 * @param {String} attributeType
 * @returns {String}
 */
const extractType = (_type, attributeType) => {
  if (isPrimitiveType(_type)) return _type.replace('!', '');
  if (isEnumType(attributeType)) return 'String';
  return 'ID';
};

/* -------------------------------------------------------------------------- */
/* Aggregation resolvers                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Build filters from a GraphQL object.
 *
 * @param {Object} obj
 * @returns {Object}
 */
const buildFiltersFromObject = obj => {
  return convertRestQueryParams({
    ...convertToParams(_.omit(obj, 'where')),
    ...convertToQuery(obj.where),
  });
};

/**
 * Resolve aggregation for Mongoose models.
 *
 * @param {Object} model
 * @param {Object} filters
 * @param {String} fieldKey
 * @param {String} operation
 * @returns {Promise<Number>}
 */
const resolveMongooseAggregation = async (model, filters, fieldKey, operation) => {
  const result = await buildQuery({
    model,
    filters,
    aggregate: true,
  })
    .group({
      _id: null,
      [fieldKey]: { [`$${operation}`]: `$${fieldKey}` },
    })
    .exec();

  return _.get(result, [0, fieldKey]);
};

/**
 * Resolve aggregation for Bookshelf models.
 *
 * @param {Object} model
 * @param {Object} filters
 * @param {String} fieldKey
 * @param {String} operation
 * @returns {Promise<Number>}
 */
const resolveBookshelfAggregation = (model, filters, fieldKey, operation) => {
  return model
    .query(qb => {
      buildQuery({ model, filters })(qb);
      qb[operation](`${fieldKey} as ${operation}_${fieldKey}`);
    })
    .fetch()
    .then(result => result.get(`${operation}_${fieldKey}`));
};

/**
 * Create resolvers for aggregation fields (sum, avg, min, max).
 *
 * @param {Object} model
 * @param {Object} fields
 * @param {String} operation
 * @param {Function} typeCheck
 * @returns {Object}
 */
const createAggregationFieldsResolver = (model, fields, operation, typeCheck) => {
  const resolverFn = async (obj, _options, _context, _fieldResolver, fieldKey) => {
    const filters = buildFiltersFromObject(obj);

    if (model.orm === 'mongoose') {
      return resolveMongooseAggregation(model, filters, fieldKey, operation);
    }

    if (model.orm === 'bookshelf') {
      return resolveBookshelfAggregation(model, filters, fieldKey, operation);
    }
  };

  return createFieldsResolver(fields, resolverFn, typeCheck);
};

/* -------------------------------------------------------------------------- */
/* Group‑by resolvers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Pre‑process raw group‑by results into GraphQL connection objects.
 *
 * @param {Object} param0
 * @param {Array} param0.result
 * @param {String} param0.fieldKey
 * @param {Object} param0.filters
 * @returns {Array}
 */
const preProcessGroupByData = ({ result, fieldKey, filters }) => {
  const valid = _.toArray(result).filter(v => Boolean(v._id));
  return valid.map(v => ({
    key: v._id.toString(),
    connection: () => ({
      ...filters,
      where: {
        ...(filters.where || {}),
        [fieldKey]: v._id.toString(),
      },
    }),
  }));
};

/**
 * Resolve group‑by for Mongoose models.
 *
 * @param {Object} model
 * @param {Object} params
 * @param {String} fieldKey
 * @returns {Promise<Array>}
 */
const resolveMongooseGroupBy = async (model, params, fieldKey) => {
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
 * Resolve group‑by for Bookshelf models.
 *
 * @param {Object} model
 * @param {Object} params
 * @param {String} fieldKey
 * @param {Object} filters
 * @returns {Promise<Array>}
 */
const resolveBookshelfGroupBy = (model, params, fieldKey, filters) => {
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
    });
};

/**
 * Create resolvers for group‑by fields.
 *
 * @param {Object} model
 * @param {Object} fields
 * @returns {Object}
 */
const createGroupByFieldsResolver = (model, fields) => {
  const resolver = async (filters, _options, _context, _fieldResolver, fieldKey) => {
    const params = buildFiltersFromObject(filters);

    if (model.orm === 'mongoose') {
      const result = await resolveMongooseGroupBy(model, params, fieldKey);
      return preProcessGroupByData({ result, fieldKey, filters });
    }

    if (model.orm === 'bookshelf') {
      return resolveBookshelfGroupBy(model, params, fieldKey, filters);
    }
  };

  return createFieldsResolver(fields, resolver, () => true);
};

/* -------------------------------------------------------------------------- */
/* Connection type generation                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Generate GraphQL connection field definitions for primitive fields.
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
 * Build the GroupBy part of a connection type.
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
 * Build the Aggregator part of a connection type.
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
  const initialFields = { count: 'Int', totalCount: 'Int' };

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

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Build GraphQL connection types, queries and resolvers for a content type.
 *
 * @param {Object} param0
 * @param {Object} param0.fields
 * @param {Object} param0.model
 * @param {String} param0.name
 * @param {Object} param0.resolver
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

  const definition = [
    `type ${connectionGlobalId} {${toSDL(connectionFields)}}`,
    aggregator.type,
    groupBy.type,
  ]
    .filter(Boolean)
    .join('\n\n');

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
        values(obj, _options, gqlCtx) {
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
```