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

const TypeChecker = {
  isPrimitive: (type) => PRIMITIVE_TYPES.has(nonRequired(type)),
  isEnum: (type) => type === 'enumeration',
  isNotArray: (type) => !/(\[\w+!?\])/.test(type),
  isNumber: (type) => {
    const baseType = nonRequired(type);
    return baseType === 'Int' || baseType === 'Float';
  },
};

// ============================================================================
// Field Processing Utilities
// ============================================================================

const FieldProcessor = {
  getByTypes: (fields, typeCheck, returnType) => {
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
  },

  createResolver: (field, key) => {
    return (object) => {
      const resolver = field.resolve || ((obj) => obj[key]);
      return resolver(object);
    };
  },

  extractType: (type, attributeType) => {
    if (TypeChecker.isPrimitive(type)) {
      return type.replace('!', '');
    }
    return TypeChecker.isEnum(attributeType) ? 'String' : 'ID';
  },

  createFieldsResolver: (fields, resolverFn, typeCheck) => {
    return Object.keys(fields).reduce((acc, fieldKey) => {
      const field = fields[fieldKey];
      if (typeCheck(field)) {
        return _.set(acc, fieldKey, (obj, options, context) => {
          return resolverFn(
            obj,
            options,
            context,
            FieldProcessor.createResolver(field, fieldKey),
            fieldKey,
            obj,
            field
          );
        });
      }
      return acc;
    }, {});
  },
};

// ============================================================================
// Query Building Utilities
// ============================================================================

const QueryBuilder = {
  buildFilters: (obj) => {
    return convertRestQueryParams({
      ...convertToParams(_.omit(obj, 'where')),
      ...convertToQuery(obj.where),
    });
  },

  executeMongooseAggregation: async (model, filters, fieldKey, operation) => {
    const result = await buildQuery({ model, filters, aggregate: true })
      .group({
        _id: null,
        [fieldKey]: { [`$${operation}`]: `$${fieldKey}` },
      })
      .exec();
    return _.get(result, [0, fieldKey]);
  },

  executeBookshelfAggregation: async (model, filters, fieldKey, operation) => {
    const result = await model
      .query((qb) => {
        buildQuery({ model, filters })(qb);
        qb[operation](`${fieldKey} as ${operation}_${fieldKey}`);
      })
      .fetch();
    return result.get(`${operation}_${fieldKey}`);
  },

  executeAggregation: async (model, filters, fieldKey, operation) => {
    if (model.orm === 'mongoose') {
      return QueryBuilder.executeMongooseAggregation(model, filters, fieldKey, operation);
    }
    if (model.orm === 'bookshelf') {
      return QueryBuilder.executeBookshelfAggregation(model, filters, fieldKey, operation);
    }
  },
};

// ============================================================================
// Aggregation Resolvers
// ============================================================================

const AggregationResolver = {
  createFieldsResolver: (model, fields, operation, typeCheck) => {
    return FieldProcessor.createFieldsResolver(
      fields,
      async (obj, options, context, fieldResolver, fieldKey) => {
        const filters = QueryBuilder.buildFilters(obj);
        return QueryBuilder.executeAggregation(model, filters, fieldKey, operation);
      },
      typeCheck
    );
  },

  createCountResolvers: (modelName, model) => ({
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
  }),

  createOperationResolvers: (operations) => {
    const defaultFunc = (obj) => obj;
    return operations.reduce((acc, op) => {
      acc[op] = defaultFunc;
      return acc;
    }, {});
  },
};

// ============================================================================
// Group By Resolvers
// ============================================================================

const GroupByResolver = {
  preprocessData: ({ result, fieldKey, filters }) => {
    const validResults = _.toArray(result).filter((value) => Boolean(value._id));
    return _.map(validResults, (value) => ({
      key: value._id.toString(),
      connection: () => ({
        ...filters,
        where: {
          ...(filters.where || {}),
          [fieldKey]: value._id.toString(),
        },
      }),
    }));
  },

  executeMongooseGroupBy: async (model, params, fieldKey) => {
    const result = await buildQuery({
      model,
      filters: params,
      aggregate: true,
    }).group({
      _id: `$${fieldKey === 'id' ? model.primaryKey : fieldKey}`,
    });
    return result;
  },

  executeBookshelfGroupBy: async (model, params, fieldKey) => {
    const result = await model
      .query((qb) => {
        buildQuery({ model, filters: params })(qb);
        qb.groupBy(fieldKey);
        qb.select(fieldKey);
      })
      .fetchAll();

    const values = result.models
      .map((m) => m.get(fieldKey))
      .filter((v) => !!v)
      .map((v) => String(v));

    return values.map((v) => ({
      key: v,
      connection: () => ({
        ..._.omit(params, ['limit']),
        where: {
          ...(params.where || {}),
          [fieldKey]: v,
        },
      }),
    }));
  },

  createFieldsResolver: (model, fields) => {
    const resolver = async (filters, options, context, fieldResolver, fieldKey) => {
      const params = convertRestQueryParams({
        ...convertToParams(_.omit(filters, 'where')),
        ...convertToQuery(filters.where),
      });

      if (model.orm === 'mongoose') {
        const result = await GroupByResolver.executeMongooseGroupBy(model, params, fieldKey);
        return GroupByResolver.preprocessData({ result, fieldKey, filters });
      }

      if (model.orm === 'bookshelf') {
        return GroupByResolver.executeBookshelfGroupBy(model, params, fieldKey);
      }
    };

    return FieldProcessor.createFieldsResolver(fields, resolver, () => true);
  },
};

// ============================================================================
// Schema Generation
// ============================================================================

const SchemaGenerator = {
  generateConnectionFieldTypes: (fields, model) => {
    const { globalId, attributes } = model;
    const primitiveFields = FieldProcessor.getByTypes(
      fields,
      TypeChecker.isNotArray,
      (type, name) => FieldProcessor.extractType(type, (attributes[name] || {}).type)
    );

    const connectionFields = _.mapValues(primitiveFields, (fieldType) => ({
      key: fieldType,
      connection: `${globalId}Connection`,
    }));

    return Object.keys(primitiveFields)
      .map(
        (fieldKey) =>
          `type ${globalId}Connection${_.upperFirst(fieldKey)} {${toSDL(connectionFields[fieldKey])}}`
      )
      .join('\n\n');
  },

  formatGroupBy: (fields, model) => {
    const { globalId } = model;
    const groupByGlobalId = `${globalId}GroupBy`;

    const groupByFields = FieldProcessor.getByTypes(
      fields,
      TypeChecker.isNotArray,
      (fieldType, fieldName) => `[${globalId}Connection${_.upperFirst(fieldName)}]`
    );

    const groupByTypes =
      `type ${groupByGlobalId} {${toSDL(groupByFields)}}\n\n` +
      SchemaGenerator.generateConnectionFieldTypes(fields, model);

    return {
      globalId: groupByGlobalId,
      type: groupByTypes,
      resolver: {
        [groupByGlobalId]: GroupByResolver.createFieldsResolver(model, groupByFields),
      },
    };
  },

  formatAggregator: (fields, model, modelName) => {
    const { globalId } = model;
    const numericFields = FieldProcessor.getByTypes(fields, TypeChecker.isNumber, () => 'Float');
    const aggregatorGlobalId = `${globalId}Aggregator`;
    const operations = ['sum', 'avg', 'min', 'max'];

    const initialFields = {
      count: 'Int',
      totalCount: 'Int',
    };

    if (!_.isEmpty(numericFields)) {
      operations.forEach((agg) => {
        initialFields[agg] = `${aggregatorGlobalId}${_.startCase(agg)}`;
      });
    }

    const gqlNumberFormat = toSDL(numericFields);
    let aggregatorTypes = `type ${aggregatorGlobalId} {${toSDL(initialFields)}}\n\n`;

    const resolvers = {
      [aggregatorGlobalId]: AggregationResolver.createCountResolvers(modelName, model),
    };

    if (!_.isEmpty(numericFields)) {
      aggregatorTypes += operations
        .map((op) => `type ${aggregatorGlobalId}${_.startCase(op)} {${gqlNumberFormat}}`)
        .join('\n\n');
      aggregatorTypes += '\n\n';

      _.merge(resolvers[aggregatorGlobalId], AggregationResolver.createOperationResolvers(operations));

      operations.forEach((op) => {
        resolvers[`${aggregatorGlobalId}${_.startCase(op)}`] = AggregationResolver.createFieldsResolver(
          model,
          fields,
          op,
          TypeChecker.isNumber
        );
      });
    }

    return {
      globalId: aggregatorGlobalId,
      type: aggregatorTypes,
      resolver: resolvers,
    };
  },
};

// ============================================================================
// Main Entry Point
// ============================================================================

const formatModelConnectionsGQL = function({ fields, model: contentType, name, resolver }) {
  const { globalId } = contentType;
  const model = strapi.getModel(contentType.uid);
  const connectionGlobalId = `${globalId}Connection`;
  const pluralName = pluralize.plural(_.camelCase(name));

  const aggregatorFormat = SchemaGenerator.formatAggregator(fields, model, name);
  const groupByFormat = SchemaGenerator.formatGroupBy(fields, model);

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
```