```javascript
'use strict';

const _ = require('lodash');
const pluralize = require('pluralize');
const { convertRestQueryParams, buildQuery } = require('strapi-utils');

const { buildQuery: buildQueryResolver } = require('./resolvers-builder');
const { convertToParams, convertToQuery, nonRequired } = require('./utils');
const { toSDL } = require('./schema-definitions');

// ============================================================================
// Type Checking Utilities
// ============================================================================

const PRIMITIVE_TYPES = new Set(['Int', 'Float', 'String', 'Boolean', 'DateTime', 'JSON']);

const isPrimitiveType = type => PRIMITIVE_TYPES.has(nonRequired(type));

const isEnumType = type => type === 'enumeration';

const isNotOfTypeArray = type => !/(\[\w+!?\])/.test(type);

const isNumberType = type => {
  const baseType = nonRequired(type);
  return baseType === 'Int' || baseType === 'Float';
};

// ============================================================================
// Field Processing Utilities
// ============================================================================

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

const fieldResolver = (field, key) => object => {
  const resolver = field.resolve || (obj => obj[key]);
  return resolver(object);
};

const createFieldsResolver = (fields, resolverFn, typeCheck) => {
  return Object.keys(fields).reduce((acc, fieldKey) => {
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
};

const extractType = (_type, attributeType) => {
  if (isPrimitiveType(_type)) {
    return _type.replace('!', '');
  }
  return isEnumType(attributeType) ? 'String' : 'ID';
};

// ============================================================================
// Query Building Utilities
// ============================================================================

const buildFilterParams = obj => {
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

const executeAggregation = (model, filters, fieldKey, operation) => {
  if (model.orm === 'mongoose') {
    return executeMongooseAggregation(model, filters, fieldKey, operation);
  }
  if (model.orm === 'bookshelf') {
    return executeBookshelfAggregation(model, filters, fieldKey, operation);
  }
};

// ============================================================================
// Aggregation Resolvers
// ============================================================================

const createAggregationFieldsResolver = (model, fields, operation, typeCheck) => {
  return createFieldsResolver(
    fields,
    async (obj, options, context, fieldResolver, fieldKey) => {
      const filters = buildFilterParams(obj);
      return executeAggregation(model, filters, fieldKey, operation);
    },
    typeCheck
  );
};

// ============================================================================
// Group By Utilities
// ============================================================================

const preProcessGroupByData = ({ result, fieldKey, filters }) => {
  const validResults = _.toArray(result).filter(value => Boolean(value._id));
  return _.map(validResults, value => ({
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
      const values = result.models
        .map(m => m.get(fieldKey))
        .filter(v => !!v)
        .map(v => String(v));

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

const createGroupByFieldsResolver = (model, fields) => {
  const resolver = async (filters, options, context, fieldResolver, fieldKey) => {
    const params = buildFilterParams(filters);

    if (model.orm === 'mongoose') {
      const result = await executeMongooseGroupBy(model, params, fieldKey);
      return preProcessGroupByData({ result, fieldKey, filters });
    }

    if (model.orm === 'bookshelf') {
      return executeBookshelfGroupBy(model, params, fieldKey);
    }
  };

  return createFieldsResolver(fields, resolver, () => true);
};

// ============================================================================
// Type Generation
// ============================================================================

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

  const groupByTypes = `type ${groupByGlobalId} {${toSDL(groupByFields)}}\n\n${generateConnectionFieldsTypes(fields, model)}`;

  return {
    globalId: groupByGlobalId,
    type: groupByTypes,
    resolver: {
      [groupByGlobalId]: createGroupByFieldsResolver(model, groupByFields),
    },
  };
};

// ============================================================================
// Aggregator Type Generation
// ============================================================================

const AGGREGATION_OPERATIONS = ['sum', 'avg', 'min', 'max'];

const createAggregatorResolvers = (aggregatorGlobalId, modelName, model) => {
  return {
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
};

const createAggregationOperationResolvers = (aggregatorGlobalId, model, fields) => {
  const resolvers = {};
  const defaultAggregatorFunc = obj => obj;

  AGGREGATION_OPERATIONS.forEach(operation => {
    const operationKey = _.startCase(operation);
    resolvers[`${aggregatorGlobalId}${operationKey}`] = createAggregationFieldsResolver(
      model,
      fields,
      operation,
      isNumberType
    );
  });

  return resolvers;
};

const buildAggregatorTypes = (aggregatorGlobalId, numericFields, hasNumericFields) => {
  let types = `type ${aggregatorGlobalId} {count: Int\ntotalCount: Int`;

  if (hasNumericFields) {
    AGGREGATION_OPERATIONS.forEach(op => {
      types += `\n${op}: ${aggregatorGlobalId}${_.startCase(op)}`;
    });
  }

  types += '}\n\n';

  if (hasNumericFields) {
    const gqlNumberFormat = toSDL(numericFields);
    AGGREGATION_OPERATIONS.forEach(op => {
      types += `type ${aggregatorGlobalId}${_.startCase(op)} {${gqlNumberFormat}}\n\n`;
    });
  }

  return types;
};

const formatConnectionAggregator = (fields, model, modelName) => {
  const { globalId } = model;
  const numericFields = getFieldsByTypes(fields, isNumberType, () => 'Float');
  const hasNumericFields = !_.isEmpty(numericFields);
  const aggregatorGlobalId = `${globalId}Aggregator`;

  const aggregatorTypes = buildAggregatorTypes(aggregatorGlobalId, numericFields, hasNumericFields);

  let resolvers = createAggregatorResolvers(aggregatorGlobalId, modelName, model);

  if (hasNumericFields) {
    const defaultAggregatorFunc = obj => obj;
    _.merge(resolvers[aggregatorGlobalId], {
      sum: defaultAggregatorFunc,
      avg: defaultAggregatorFunc,
      min: defaultAggregatorFunc,
      max: defaultAggregatorFunc,
    });

    resolvers = {
      ...resolvers,
      ...createAggregationOperationResolvers(aggregatorGlobalId, model, fields),
    };
  }

  return {
    globalId: aggregatorGlobalId,
    type: aggregatorTypes,
    resolver: resolvers,
  };
};

// ============================================================================
// Main Entry Point
// ============================================================================

const formatModelConnectionsGQL = ({ fields, model: contentType, name, resolver }) => {
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
  modelConnectionTypes += aggregatorFormat.type;
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
```