'use strict';

const _ = require('lodash');
const pluralize = require('pluralize');
const { convertRestQueryParams, buildQuery } = require('strapi-utils');

const { buildQuery: buildQueryResolver } = require('./resolvers-builder');
const { convertToParams, convertToQuery, nonRequired } = require('./utils');
const { toSDL } = require('./schema-definitions');

/**
 * Checks if a type is a primitive type (Int, Float, String, Boolean, DateTime, JSON).
 * @param {string} type - The GraphQL type string.
 * @returns {boolean} True if the type is primitive.
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
 * Checks if a type is an enumeration.
 * @param {string} type - The GraphQL type string.
 * @returns {boolean} True if the type is an enumeration.
 */
const isEnumType = type => type === 'enumeration';

/**
 * Checks if a type is not an array type.
 * @param {string} type - The GraphQL type string.
 * @returns {boolean} True if the type is not an array.
 */
const isNotOfTypeArray = type => !/(\[\w+!?\])/.test(type);

/**
 * Checks if a type is a number type (Int or Float).
 * @param {string} type - The GraphQL type string.
 * @returns {boolean} True if the type is a number.
 */
const isNumberType = type => {
  const nonRequiredType = nonRequired(type);
  return nonRequiredType === 'Int' || nonRequiredType === 'Float';
};

/**
 * Extracts the base type from a GraphQL type string, removing non-required markers.
 * @param {string} _type - The GraphQL type string.
 * @param {string} attributeType - The attribute type (used for enums).
 * @returns {string} The base type name.
 */
const extractType = function(_type, attributeType) {
  if (isPrimitiveType(_type)) {
    return _type.replace('!', '');
  }
  if (isEnumType(attributeType)) {
    return 'String';
  }
  return 'ID';
};

/**
 * Filters fields based on a type check function and maps them using a return function.
 * @param {Array} fields - The fields object.
 * @param {Function} typeCheck - Function to check if a field type matches criteria.
 * @param {Function} returnType - Function to transform the field type and name.
 * @returns {Object} An object containing the filtered fields.
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
 * Creates a resolver function for a specific field.
 * @param {Object} field - The field definition.
 * @param {string} key - The key of the field.
 * @returns {Function} A resolver function.
 */
const fieldResolver = (field, key) => {
  return object => {
    const resolver = field.resolve || function resolver(obj) {
      // eslint-disable-line no-unused-vars
      return obj[key];
    };
    return resolver(object);
  };
};

/**
 * Creates a resolver object for a list of fields based on a resolver function and type check.
 * @param {Object} fields - The fields object.
 * @param {Function} resolverFn - The function to resolve field values.
 * @param {Function} typeCheck - Function to check if a field type matches criteria.
 * @returns {Object} An object containing the resolvers.
 */
const createFieldsResolver = function(fields, resolverFn, typeCheck) {
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
 * Creates a resolver for aggregation fields (sum, avg, min, max, count).
 * @param {Object} model - The Strapi model.
 * @param {Object} fields - The fields to aggregate.
 * @param {string} operation - The aggregation operation (sum, avg, min, max).
 * @param {Function} typeCheck - Function to check if a field type matches criteria.
 * @returns {Object} An object containing the aggregation resolvers.
 */
const createAggregationFieldsResolver = function(model, fields, operation, typeCheck) {
  return createFieldsResolver(
    fields,
    async (obj, options, context, fieldResolver, fieldKey) => {
      const filters = convertRestQueryParams({
        ...convertToParams(_.omit(obj, 'where')),
        ...convertToQuery(obj.where),
      });

      if (model.orm === 'mongoose') {
        return buildQuery({ model, filters, aggregate: true })
          .group({
            _id: null,
            [fieldKey]: { [`$${operation}`]: `$${fieldKey}` },
          })
          .exec()
          .then(result => _.get(result, [0, fieldKey]));
      }

      if (model.orm === 'bookshelf') {
        return model
          .query(qb => {
            buildQuery({ model, filters })(qb);
            qb[operation](`${fieldKey} as ${operation}_${fieldKey}`);
          })
          .fetch()
          .then(result => result.get(`${operation}_${fieldKey}`));
      }
    },
    typeCheck
  );
};

/**
 * Processes group by data to create paginated connections.
 * @param {Object} params - The parameters object.
 * @param {Array} params.result - The raw query result.
 * @param {string} params.fieldKey - The field key used for grouping.
 * @param {Object} params.filters - The original filters.
 * @returns {Array} An array of connection objects.
 */
const preProcessGroupByData = function({ result, fieldKey, filters }) {
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
 * Creates a resolver for group by fields.
 * @param {Object} model - The Strapi model.
 * @param {Object} fields - The fields to group by.
 * @returns {Object} An object containing the group by resolvers.
 */
const createGroupByFieldsResolver = function(model, fields) {
  const resolver = async (filters, options, context, fieldResolver, fieldKey) => {
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

      return preProcessGroupByData({
        result,
        fieldKey,
        filters,
      });
    }

    if (model.orm === 'bookshelf') {
      return model
        .query(qb => {
          buildQuery({ model, filters: params })(qb);
          qb.groupBy(fieldKey);
          qb.select(fieldKey);
        })
        .fetchAll()
        .then(result => {
          let values = result.models
            .map(m => m.get(fieldKey))
            .filter(v => !!v)
            .map(v => '' + v);
          return values.map(v => ({
            key: v,
            connection: () => {
              return {
                ..._.omit(filters, ['limit']),
                where: {
                  ...(filters.where || {}),
                  [fieldKey]: v,
                },
              };
            },
          }));
        });
    }
  };

  return createFieldsResolver(fields, resolver, () => true);
};

/**
 * Generates the SDL definition for connection fields.
 * @param {Object} fields - The fields object.
 * @param {Object} model - The Strapi model.
 * @returns {string} The SDL string for connection fields.
 */
const generateConnectionFieldsTypes = function(fields, model) {
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
 * Formats the group by connection structure.
 * @param {Object} fields - The fields object.
 * @param {Object} model - The Strapi model.
 * @returns {Object} An object containing the group by configuration.
 */
const formatConnectionGroupBy = function(fields, model) {
  const { globalId } = model;
  const groupByGlobalId = `${globalId}GroupBy`;

  const groupByFields = getFieldsByTypes(
    fields,
    isNotOfTypeArray,
    (fieldType, fieldName) => `[${globalId}Connection${_.upperFirst(fieldName)}]`
  );

  let groupByTypes = `type ${groupByGlobalId} {${toSDL(groupByFields)}}\n\n`;
  groupByTypes += generateConnectionFieldsTypes(fields, model);

  return {
    globalId: groupByGlobalId,
    type: groupByTypes,
    resolver: {
      [groupByGlobalId]: createGroupByFieldsResolver(model, groupByFields),
    },
  };
};

/**
 * Formats the aggregation structure.
 * @param {Object} fields - The fields object.
 * @param {Object} model - The Strapi model.
 * @param {string} modelName - The name of the model.
 * @returns {Object} An object containing the aggregation configuration.
 */
const formatConnectionAggregator = function(fields, model, modelName) {
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

  let resolvers = {
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

    resolvers = {
      ...resolvers,
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
  }

  return {
    globalId: aggregatorGlobalId,
    type: aggregatorTypes,
    resolver: resolvers,
  };
};

/**
 * Formats the GraphQL model connections.
 * @param {Object} params - The parameters object.
 * @param {Object} params.fields - The fields definition.
 * @param {Object} params.model - The Strapi model.
 * @param {string} params.name - The model name.
 * @param {Object} params.resolver - The resolver configuration.
 * @returns {Object} An object containing the connection definition, query, and resolvers.
 */
const formatModelConnectionsGQL = function({ fields, model: contentType, name, resolver }) {
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
      [`${pluralName}Connection`]: {
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