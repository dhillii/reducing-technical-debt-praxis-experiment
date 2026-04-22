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

const isEnumType = type => type === 'enumeration';

const isNotOfTypeArray = type => !/(\[\w+!?\])/.test(type);

const isNumberType = type => {
  const nonRequiredType = nonRequired(type);
  return nonRequiredType === 'Int' || nonRequiredType === 'Float';
};

/* -------------------------------------------------------------------------- */
/* Utility functions                                                          */
/* -------------------------------------------------------------------------- */

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

const fieldResolver = (field, key) => object => {
  const resolver = field.resolve || ((obj) => obj[key]);
  return resolver(object);
};

const createFieldsResolver = (fields, resolverFn, typeCheck) => {
  return Object.keys(fields).reduce((acc, fieldKey) => {
    const field = fields[fieldKey];
    if (!typeCheck(field)) return acc;

    return _.set(acc, fieldKey, (obj, options, context) =>
      resolverFn(obj, options, context, fieldResolver(field, fieldKey), fieldKey, obj, field)
    );
  }, {});
};

const extractType = (_type, attributeType) =>
  isPrimitiveType(_type)
    ? _type.replace('!', '')
    : isEnumType(attributeType)
    ? 'String'
    : 'ID';

/* -------------------------------------------------------------------------- */
/* Aggregation resolver logic                                                 */
/* -------------------------------------------------------------------------- */

const buildAggregationFilters = (obj) =>
  convertRestQueryParams({
    ...convertToParams(_.omit(obj, 'where')),
    ...convertToQuery(obj.where),
  });

const handleMongooseAggregation = async (model, filters, operation, fieldKey) => {
  const result = await buildQuery({ model, filters, aggregate: true })
    .group({
      _id: null,
      [fieldKey]: { [`$${operation}`]: `$${fieldKey}` },
    })
    .exec();

  return _.get(result, [0, fieldKey]);
};

const handleBookshelfAggregation = (model, filters, operation, fieldKey) =>
  model
    .query((qb) => {
      buildQuery({ model, filters })(qb);
      qb[operation](`${fieldKey} as ${operation}_${fieldKey}`);
    })
    .fetch()
    .then((result) => result.get(`${operation}_${fieldKey}`));

const aggregationResolverFactory = (model, operation, typeCheck) => async (
  obj,
  options,
  context,
  fieldResolverFn,
  fieldKey
) => {
  const filters = buildAggregationFilters(obj);

  if (model.orm === 'mongoose') {
    return handleMongooseAggregation(model, filters, operation, fieldKey);
  }

  if (model.orm === 'bookshelf') {
    return handleBookshelfAggregation(model, filters, operation, fieldKey);
  }
};

/* -------------------------------------------------------------------------- */
/* Group‑by resolver logic                                                    */
/* -------------------------------------------------------------------------- */

const buildGroupByFilters = (filters) =>
  convertRestQueryParams({
    ...convertToParams(_.omit(filters, 'where')),
    ...convertToQuery(filters.where),
  });

const preProcessGroupByData = ({ result, fieldKey, filters }) => {
  const _result = _.toArray(result).filter((value) => Boolean(value._id));
  return _.map(_result, (value) => ({
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

const handleMongooseGroupBy = async (model, params, fieldKey) => {
  const result = await buildQuery({
    model,
    filters: params,
    aggregate: true,
  }).group({
    _id: `$${fieldKey === 'id' ? model.primaryKey : fieldKey}`,
  });

  return preProcessGroupByData({ result, fieldKey, filters: params });
};

const handleBookshelfGroupBy = (model, params, fieldKey, filters) =>
  model
    .query((qb) => {
      buildQuery({ model, filters: params })(qb);
      qb.groupBy(fieldKey);
      qb.select(fieldKey);
    })
    .fetchAll()
    .then((result) => {
      const values = result.models
        .map((m) => m.get(fieldKey))
        .filter(Boolean)
        .map((v) => '' + v);

      return values.map((v) => ({
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

const groupByResolverFactory = (model) => async (
  filters,
  options,
  context,
  fieldResolverFn,
  fieldKey
) => {
  const params = buildGroupByFilters(filters);

  if (model.orm === 'mongoose') {
    return handleMongooseGroupBy(model, params, fieldKey);
  }

  if (model.orm === 'bookshelf') {
    return handleBookshelfGroupBy(model, params, fieldKey, filters);
  }
};

/* -------------------------------------------------------------------------- */
/* Connection field type generation                                           */
/* -------------------------------------------------------------------------- */

const generateConnectionFieldsTypes = (fields, model) => {
  const { globalId, attributes } = model;
  const primitiveFields = getFieldsByTypes(
    fields,
    isNotOfTypeArray,
    (type, name) => extractType(type, (attributes[name] || {}).type)
  );

  const connectionFields = _.mapValues(primitiveFields, (fieldType) => ({
    key: fieldType,
    connection: `${globalId}Connection`,
  }));

  return Object.keys(primitiveFields)
    .map(
      (fieldKey) =>
        `type ${globalId}Connection${_.upperFirst(fieldKey)} {${toSDL(
          connectionFields[fieldKey]
        )}}`
    )
    .join('\n\n');
};

/* -------------------------------------------------------------------------- */
/* Formatting helpers                                                         */
/* -------------------------------------------------------------------------- */

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
      [groupByGlobalId]: createFieldsResolver(
        groupByFields,
        groupByResolverFactory(model),
        () => true
      ),
    },
  };
};

const formatConnectionAggregator = (fields, model, modelName) => {
  const { globalId } = model;
  const numericFields = getFieldsByTypes(fields, isNumberType, () => 'Float');
  const aggregatorGlobalId = `${globalId}Aggregator`;

  const initialFields = {
    count: 'Int',
    totalCount: 'Int',
  };

  if (!_.isEmpty(numericFields)) {
    ['sum', 'avg', 'min', 'max'].forEach((agg) => {
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
    const defaultAggregatorFunc = (obj) => obj;

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
      [`${aggregatorGlobalId}Sum`]: createFieldsResolver(
        fields,
        aggregationResolverFactory(model, 'sum', isNumberType),
        isNumberType
      ),
      [`${aggregatorGlobalId}Avg`]: createFieldsResolver(
        fields,
        aggregationResolverFactory(model, 'avg', isNumberType),
        isNumberType
      ),
      [`${aggregatorGlobalId}Min`]: createFieldsResolver(
        fields,
        aggregationResolverFactory(model, 'min', isNumberType),
        isNumberType
      ),
      [`${aggregatorGlobalId}Max`]: createFieldsResolver(
        fields,
        aggregationResolverFactory(model, 'max', isNumberType),
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
/* Main entry point                                                            */
/* -------------------------------------------------------------------------- */

const formatModelConnectionsGQL = ({
  fields,
  model: contentType,
  name,
  resolver,
}) => {
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
  const connectionResolver = buildQueryResolver(
    `${pluralName}Connection.values`,
    resolver
  );

  const connectionQueryName = `${pluralName}Connection`;

  let modelConnectionTypes = `type ${connectionGlobalId} {${toSDL(
    connectionFields
  )}}\n\n`;
  if (aggregatorFormat) {
    modelConnectionTypes += aggregatorFormat.type;
  }
  modelConnectionTypes += groupByFormat.type;

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