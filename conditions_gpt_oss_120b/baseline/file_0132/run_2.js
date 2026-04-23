'use strict';

const _ = require('lodash');
const pluralize = require('pluralize');
const { convertRestQueryParams, buildQuery } = require('strapi-utils');
const { buildQuery: buildQueryResolver } = require('./resolvers-builder');
const { convertToParams, convertToQuery, nonRequired } = require('./utils');
const { toSDL } = require('./schema-definitions');

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
  const resolver = field.resolve || ((obj, _key) => obj[key]);
  return resolver(object);
};

const createFieldsResolver = (fields, resolverFn, typeCheck) => {
  return Object.keys(fields).reduce((acc, fieldKey) => {
    const field = fields[fieldKey];
    if (!typeCheck(field)) {
      return acc;
    }
    return _.set(
      acc,
      fieldKey,
      (obj, options, context) =>
        resolverFn(
          obj,
          options,
          context,
          fieldResolver(field, fieldKey),
          fieldKey,
          obj,
          field
        )
    );
  }, {});
};

const extractType = (_type, attributeType) =>
  isPrimitiveType(_type)
    ? _type.replace('!', '')
    : isEnumType(attributeType)
    ? 'String'
    : 'ID';

const handleMongooseAggregation = async ({ model, filters, operation, fieldKey }) => {
  const result = await buildQuery({ model, filters, aggregate: true })
    .group({
      _id: null,
      [fieldKey]: { [`$${operation}`]: `$${fieldKey}` },
    })
    .exec();
  return _.get(result, [0, fieldKey]);
};

const handleBookshelfAggregation = async ({ model, filters, operation, fieldKey }) => {
  const result = await model
    .query(qb => {
      buildQuery({ model, filters })(qb);
      qb[operation](`${fieldKey} as ${operation}_${fieldKey}`);
    })
    .fetch();
  return result.get(`${operation}_${fieldKey}`);
};

const createAggregationFieldsResolver = (model, fields, operation, typeCheck) =>
  createFieldsResolver(
    fields,
    async (obj, _options, _context, _fieldResolver, fieldKey) => {
      const filters = convertRestQueryParams({
        ...convertToParams(_.omit(obj, 'where')),
        ...convertToQuery(obj.where),
      });

      if (model.orm === 'mongoose') {
        return handleMongooseAggregation({ model, filters, operation, fieldKey });
      }

      if (model.orm === 'bookshelf') {
        return handleBookshelfAggregation({ model, filters, operation, fieldKey });
      }
    },
    typeCheck
  );

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

const handleMongooseGroupBy = async ({ model, params, fieldKey, filters }) => {
  const result = await buildQuery({
    model,
    filters: params,
    aggregate: true,
  }).group({
    _id: `$${fieldKey === 'id' ? model.primaryKey : fieldKey}`,
  });
  return preProcessGroupByData({ result, fieldKey, filters });
};

const handleBookshelfGroupBy = async ({ model, params, fieldKey, filters }) => {
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

const createGroupByFieldsResolver = (model, fields) => {
  const resolver = async (filters, _options, _context, _fieldResolver, fieldKey) => {
    const params = convertRestQueryParams({
      ...convertToParams(_.omit(filters, 'where')),
      ...convertToQuery(filters.where),
    });

    if (model.orm === 'mongoose') {
      return handleMongooseGroupBy({ model, params, fieldKey, filters });
    }

    if (model.orm === 'bookshelf') {
      return handleBookshelfGroupBy({ model, params, fieldKey, filters });
    }
  };

  return createFieldsResolver(fields, resolver, () => true);
};

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
        `type ${globalId}Connection${_.upperFirst(fieldKey)} {${toSDL(connectionFields[fieldKey])}}`
    )
    .join('\n\n');
};

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

const defaultAggregatorFunc = obj => obj;

const buildAggregatorTypes = (aggregatorGlobalId, numericFields, gqlNumberFormat) => {
  let types = `type ${aggregatorGlobalId} {${toSDL({
    count: 'Int',
    totalCount: 'Int',
    ...(numericFields && {
      sum: `${aggregatorGlobalId}Sum`,
      avg: `${aggregatorGlobalId}Avg`,
      min: `${aggregatorGlobalId}Min`,
      max: `${aggregatorGlobalId}Max`,
    }),
  })}}`;

  if (numericFields) {
    types += `\n\ntype ${aggregatorGlobalId}Sum {${gqlNumberFormat}}\n\n`;
    types += `type ${aggregatorGlobalId}Avg {${gqlNumberFormat}}\n\n`;
    types += `type ${aggregatorGlobalId}Min {${gqlNumberFormat}}\n\n`;
    types += `type ${aggregatorGlobalId}Max {${gqlNumberFormat}}\n\n`;
  }

  return types;
};

const buildAggregatorResolvers = (aggregatorGlobalId, model, modelName, numericFields) => {
  const baseResolvers = {
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

  if (!numericFields) {
    return baseResolvers;
  }

  _.merge(baseResolvers[aggregatorGlobalId], {
    sum: defaultAggregatorFunc,
    avg: defaultAggregatorFunc,
    min: defaultAggregatorFunc,
    max: defaultAggregatorFunc,
  });

  return {
    ...baseResolvers,
    [`${aggregatorGlobalId}Sum`]: createAggregationFieldsResolver(
      model,
      model.attributes,
      'sum',
      isNumberType
    ),
    [`${aggregatorGlobalId}Avg`]: createAggregationFieldsResolver(
      model,
      model.attributes,
      'avg',
      isNumberType
    ),
    [`${aggregatorGlobalId}Min`]: createAggregationFieldsResolver(
      model,
      model.attributes,
      'min',
      isNumberType
    ),
    [`${aggregatorGlobalId}Max`]: createAggregationFieldsResolver(
      model,
      model.attributes,
      'max',
      isNumberType
    ),
  };
};

const formatConnectionAggregator = (fields, model, modelName) => {
  const { globalId } = model;
  const aggregatorGlobalId = `${globalId}Aggregator`;
  const numericFields = getFieldsByTypes(fields, isNumberType, () => 'Float');
  const hasNumeric = !_.isEmpty(numericFields);
  const gqlNumberFormat = toSDL(numericFields);
  const type = buildAggregatorTypes(aggregatorGlobalId, hasNumeric, gqlNumberFormat);
  const resolver = buildAggregatorResolvers(aggregatorGlobalId, model, modelName, hasNumeric);
  return { globalId: aggregatorGlobalId, type, resolver };
};

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
      ...aggregatorFormat.resolver,
      ...groupByFormat.resolver,
    },
  };
};

module.exports = {
  formatModelConnectionsGQL,
};