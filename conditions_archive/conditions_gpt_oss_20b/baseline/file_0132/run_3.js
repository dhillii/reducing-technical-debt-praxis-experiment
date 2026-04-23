'use strict';

const _ = require('lodash');
const pluralize = require('pluralize');
const { convertRestQueryParams, buildQuery } = require('strapi-utils');

const { buildQuery: buildQueryResolver } = require('./resolvers-builder');
const { convertToParams, convertToQuery, nonRequired } = require('./utils');
const { toSDL } = require('./schema-definitions');

/**
 * Returns true if the type is a primitive GraphQL type.
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
 */
const isEnumType = type => type === 'enumeration';

/**
 * Returns true if the type is not an array.
 */
const isNotOfTypeArray = type => !/(\[\w+!?\])/.test(type);

/**
 * Returns true if the type is a number (Int or Float).
 */
const isNumberType = type => {
  const nonRequiredType = nonRequired(type);
  return nonRequiredType === 'Int' || nonRequiredType === 'Float';
};

/**
 * Returns a list of fields that satisfy a type check.
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
 */
const extractType = (_type, attributeType) => {
  return isPrimitiveType(_type)
    ? _type.replace('!', '')
    : isEnumType(attributeType)
    ? 'String'
    : 'ID';
};

/**
 * Factory for aggregation field resolvers.
 */
const aggregationResolverFactory = (model, operation) => async (
  obj,
  options,
  context,
  fieldResolver,
  fieldKey
) => {
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
};

/**
 * Creates aggregation field resolvers for a model.
 */
const createAggregationFieldsResolver = (model, fields, operation, typeCheck) => {
  const resolverFn = aggregationResolverFactory(model, operation);
  return createFieldsResolver(fields, resolverFn, typeCheck);
};

/**
 * Pre-processes group by data for Mongoose.
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
 * Factory for group by field resolvers.
 */
const groupByResolverFactory = model => async (
  filters,
  options,
  context,
  fieldResolver,
  fieldKey
) => {
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
};

/**
 * Creates group by field resolvers for a model.
 */
const createGroupByFieldsResolver = (model, fields) => {
  const resolverFn = groupByResolverFactory(model);
  return createFieldsResolver(fields, resolverFn, () => true);
};

/**
 * Generates connection field types for primitive fields.
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
 * Formats group by connection types and resolvers.
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
 * Formats aggregator connection types and resolvers.
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
 * Main entry point for GraphQL aggregation.
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