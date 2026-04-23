'use strict';

const _ = require('lodash');
const pluralize = require('pluralize');
const { convertRestQueryParams, buildQuery } = require('strapi-utils');

const { buildQuery: buildQueryResolver } = require('./resolvers-builder');
const { convertToParams, convertToQuery, nonRequired } = require('./utils');
const { toSDL } = require('./schema-definitions');

// Type checking utilities
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

const isEnumType = type => {
  return type === 'enumeration';
};

const isNotOfTypeArray = type => {
  return !/(\[\w+!?\])/.test(type);
};

const isNumberType = type => {
  const nonRequiredType = nonRequired(type);
  return nonRequiredType === 'Int' || nonRequiredType === 'Float';
};

// Field utilities
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

const fieldResolver = (field, key) => {
  return object => {
    const resolver =
      field.resolve ||
      function resolver(obj) {
        return obj[key];
      };
    return resolver(object);
  };
};

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

const extractType = function(_type, attributeType) {
  return isPrimitiveType(_type)
    ? _type.replace('!', '')
    : isEnumType(attributeType)
    ? 'String'
    : 'ID';
};

// Aggregation resolvers
const buildAggregationFilters = (obj) => {
  return convertRestQueryParams({
    ...convertToParams(_.omit(obj, 'where')),
    ...convertToQuery(obj.where),
  });
};

const executeMongooseAggregation = (model, filters, fieldKey, operation) => {
  return buildQuery({ model, filters, aggregate: true })
    .group({
      _id: null,
      [fieldKey]: { [`$${operation}`]: `$${fieldKey}` },
    })
    .exec()
    .then(result => _.get(result, [0, fieldKey]));
};

const executeBookshelfAggregation = (model, filters, fieldKey, operation) => {
  return model
    .query(qb => {
      buildQuery({ model, filters })(qb);
      qb[operation](`${fieldKey} as ${operation}_${fieldKey}`);
    })
    .fetch()
    .then(result => result.get(`${operation}_${fieldKey}`));
};

const createAggregationFieldsResolver = function(model, fields, operation, typeCheck) {
  return createFieldsResolver(
    fields,
    async (obj, options, context, fieldResolver, fieldKey) => {
      const filters = buildAggregationFilters(obj);

      if (model.orm === 'mongoose') {
        return executeMongooseAggregation(model, filters, fieldKey, operation);
      }

      if (model.orm === 'bookshelf') {
        return executeBookshelfAggregation(model, filters, fieldKey, operation);
      }
    },
    typeCheck
  );
};

// Group by utilities
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

const buildGroupByFilters = (filters) => {
  return convertRestQueryParams({
    ...convertToParams(_.omit(filters, 'where')),
    ...convertToQuery(filters.where),
  });
};

const executeMongooseGroupBy = async (model, params, fieldKey) => {
  const result = await buildQuery({
    model,
    filters: params,
    aggregate: true,
  }).group({
    _id: `$${fieldKey === 'id' ? model.primaryKey : fieldKey}`,
  });

  return result;
};

const executeBookshelfGroupBy = (model, params, fieldKey) => {
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
};

const createGroupByFieldsResolver = function(model, fields) {
  const resolver = async (filters, options, context, fieldResolver, fieldKey) => {
    const params = buildGroupByFilters(filters);

    if (model.orm === 'mongoose') {
      const result = await executeMongooseGroupBy(model, params, fieldKey);
      return preProcessGroupByData({
        result,
        fieldKey,
        filters,
      });
    }

    if (model.orm === 'bookshelf') {
      return executeBookshelfGroupBy(model, params, fieldKey);
    }
  };

  return createFieldsResolver(fields, resolver, () => true);
};

// Connection type generation
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

// Aggregator type generation
const buildAggregatorInitialFields = () => {
  return {
    count: 'Int',
    totalCount: 'Int',
  };
};

const addAggregatorOperationFields = (initialFields, aggregatorGlobalId) => {
  ['sum', 'avg', 'min', 'max'].forEach(agg => {
    initialFields[agg] = `${aggregatorGlobalId}${_.startCase(agg)}`;
  });
};

const buildAggregatorCountResolvers = (modelName, model) => {
  return {
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
  };
};

const buildAggregatorOperationResolvers = (aggregatorGlobalId, model, fields) => {
  const defaultAggregatorFunc = obj => obj;

  return {
    sum: defaultAggregatorFunc,
    avg: defaultAggregatorFunc,
    min: defaultAggregatorFunc,
    max: defaultAggregatorFunc,
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
};

const buildAggregatorTypeDefinitions = (aggregatorGlobalId, numericFields) => {
  const gqlNumberFormat = toSDL(numericFields);
  let types = `type ${aggregatorGlobalId}Sum {${gqlNumberFormat}}\n\n`;
  types += `type ${aggregatorGlobalId}Avg {${gqlNumberFormat}}\n\n`;
  types += `type ${aggregatorGlobalId}Min {${gqlNumberFormat}}\n\n`;
  types += `type ${aggregatorGlobalId}Max {${gqlNumberFormat}}\n\n`;
  return types;
};

const formatConnectionAggregator = function(fields, model, modelName) {
  const { globalId } = model;
  const numericFields = getFieldsByTypes(fields, isNumberType, () => 'Float');
  const aggregatorGlobalId = `${globalId}Aggregator`;
  const initialFields = buildAggregatorInitialFields();

  let aggregatorTypes = `type ${aggregatorGlobalId} {${toSDL(initialFields)}}\n\n`;
  let resolvers = {
    [aggregatorGlobalId]: buildAggregatorCountResolvers(modelName, model),
  };

  if (!_.isEmpty(numericFields)) {
    addAggregatorOperationFields(initialFields, aggregatorGlobalId);
    aggregatorTypes = `type ${aggregatorGlobalId} {${toSDL(initialFields)}}\n\n`;
    aggregatorTypes += buildAggregatorTypeDefinitions(aggregatorGlobalId, toSDL(numericFields));

    const operationResolvers = buildAggregatorOperationResolvers(aggregatorGlobalId, model, fields);
    _.merge(resolvers[aggregatorGlobalId], _.pick(operationResolvers, ['sum', 'avg', 'min', 'max']));
    resolvers = {
      ...resolvers,
      ..._.omit(operationResolvers, ['sum', 'avg', 'min', 'max']),
    };
  }

  return {
    globalId: aggregatorGlobalId,
    type: aggregatorTypes,
    resolver: resolvers,
  };
};

// Main entry point
const buildConnectionQueryDefinition = (connectionGlobalId, pluralName) => {
  return {
    [`${pluralName}Connection`]: {
      args: {
        sort: 'String',
        limit: 'Int',
        start: 'Int',
        where: 'JSON',
      },
      type: connectionGlobalId,
    },
  };
};

const buildConnectionResolvers = (connectionGlobalId, connectionQueryName, connectionResolver, aggregatorFormat, groupByFormat) => {
  return {
    Query: {
      [connectionQueryName]: connectionResolver,
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
};

const formatModelConnectionsGQL = function({ fields, model: contentType, name, resolver }) {
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

  const queryDef = buildConnectionQueryDefinition(connectionGlobalId, pluralName);
  const queryDef_withResolver = {
    ...queryDef,
    [`${pluralName}Connection`]: {
      ...queryDef[`${pluralName}Connection`],
      ...(resolver.args || {}),
    },
  };

  const resolvers = buildConnectionResolvers(
    connectionGlobalId,
    connectionQueryName,
    buildQueryResolver(connectionQueryName, {
      resolverOf: resolver.resolverOf || resolver.resolver,
      resolver(obj, options) {
        return options;
      },
    }),
    aggregatorFormat,
    groupByFormat
  );

  return {
    globalId: connectionGlobalId,
    definition: modelConnectionTypes,
    query: queryDef_withResolver,
    resolvers: resolvers,
  };
};

module.exports = {
  formatModelConnectionsGQL,
};