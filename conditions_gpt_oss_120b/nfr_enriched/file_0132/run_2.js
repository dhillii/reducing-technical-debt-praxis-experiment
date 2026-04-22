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

const isPrimitiveType = type => {
  const t = nonRequired(type);
  return ['Int', 'Float', 'String', 'Boolean', 'DateTime', 'JSON'].includes(t);
};

const isEnumType = type => type === 'enumeration';

const isNotOfTypeArray = type => !/(\[\w+!?\])/.test(type);

const isNumberType = type => {
  const t = nonRequired(type);
  return t === 'Int' || t === 'Float';
};

/* -------------------------------------------------------------------------- */
/* Generic utilities                                                          */
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
  const resolver = field.resolve || ((obj, _k) => obj[key]);
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
/* Aggregation resolver creation                                               */
/* -------------------------------------------------------------------------- */

const buildMongooseAggregation = async (model, filters, operation, fieldKey) => {
  const result = await buildQuery({ model, filters, aggregate: true })
    .group({
      _id: null,
      [fieldKey]: { [`$${operation}`]: `$${fieldKey}` },
    })
    .exec();
  return _.get(result, [0, fieldKey]);
};

const buildBookshelfAggregation = (model, filters, operation, fieldKey) => {
  return model
    .query(qb => {
      buildQuery({ model, filters })(qb);
      qb[operation](`${fieldKey} as ${operation}_${fieldKey}`);
    })
    .fetch()
    .then(res => res.get(`${operation}_${fieldKey}`));
};

const aggregationResolverFactory = (model, operation, typeCheck) => {
  return async (obj, _options, _context, _fieldResolver, fieldKey) => {
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
};

const createAggregationFieldsResolver = (model, fields, operation, typeCheck) =>
  createFieldsResolver(fields, aggregationResolverFactory(model, operation, typeCheck), typeCheck);

/* -------------------------------------------------------------------------- */
/* Group‑by resolver creation                                                  */
/* -------------------------------------------------------------------------- */

const preProcessGroupByData = ({ result, fieldKey, filters }) => {
  const filtered = _.toArray(result).filter(v => Boolean(v._id));
  return _.map(filtered, v => ({
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

const buildMongooseGroupBy = async (model, params, fieldKey, filters) => {
  const result = await buildQuery({
    model,
    filters: params,
    aggregate: true,
  }).group({
    _id: `$${fieldKey === 'id' ? model.primaryKey : fieldKey}`,
  });
  return preProcessGroupByData({ result, fieldKey, filters });
};

const buildBookshelfGroupBy = (model, params, fieldKey, filters) => {
  return model
    .query(qb => {
      buildQuery({ model, filters: params })(qb);
      qb.groupBy(fieldKey);
      qb.select(fieldKey);
    })
    .fetchAll()
    .then(res => {
      const values = res.models
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

const groupByResolverFactory = (model, fieldKey) => async (filters, _options, _context, _fieldResolver) => {
  const params = convertRestQueryParams({
    ...convertToParams(_.omit(filters, 'where')),
    ...convertToQuery(filters.where),
  });

  if (model.orm === 'mongoose') {
    return buildMongooseGroupBy(model, params, fieldKey, filters);
  }

  if (model.orm === 'bookshelf') {
    return buildBookshelfGroupBy(model, params, fieldKey, filters);
  }
};

const createGroupByFieldsResolver = (model, fields) => {
  const resolver = (filters, options, context, fieldResolver, fieldKey) =>
    groupByResolverFactory(model, fieldKey)(filters, options, context, fieldResolver);
  return createFieldsResolver(fields, resolver, () => true);
};

/* -------------------------------------------------------------------------- */
/* Connection type generation                                                  */
/* -------------------------------------------------------------------------- */

const generateConnectionFieldsTypes = (fields, model) => {
  const { globalId, attributes } = model;
  const primitiveFields = getFieldsByTypes(
    fields,
    isNotOfTypeArray,
    (type, name) => extractType(type, (attributes[name] || {}).type)
  );

  const connectionFields = _.mapValues(primitiveFields, ft => ({
    key: ft,
    connection: `${globalId}Connection`,
  }));

  return Object.keys(primitiveFields)
    .map(
      key =>
        `type ${globalId}Connection${_.upperFirst(key)} {${toSDL(connectionFields[key])}}`
    )
    .join('\n\n');
};

const formatConnectionGroupBy = (fields, model) => {
  const { globalId } = model;
  const groupById = `${globalId}GroupBy`;

  const groupByFields = getFieldsByTypes(
    fields,
    isNotOfTypeArray,
    (ft, fn) => `[${globalId}Connection${_.upperFirst(fn)}]`
  );

  const typeDef = `type ${groupById} {${toSDL(groupByFields)}}\n\n${generateConnectionFieldsTypes(
    fields,
    model
  )}`;

  return {
    globalId: groupById,
    type: typeDef,
    resolver: {
      [groupById]: createGroupByFieldsResolver(model, groupByFields),
    },
  };
};

const formatConnectionAggregator = (fields, model, modelName) => {
  const { globalId } = model;
  const numericFields = getFieldsByTypes(fields, isNumberType, () => 'Float');
  const aggregatorId = `${globalId}Aggregator`;

  const baseFields = { count: 'Int', totalCount: 'Int' };
  if (!_.isEmpty(numericFields)) {
    ['sum', 'avg', 'min', 'max'].forEach(op => {
      baseFields[op] = `${aggregatorId}${_.startCase(op)}`;
    });
  }

  const gqlNumberFormat = toSDL(numericFields);
  let typeDef = `type ${aggregatorId} {${toSDL(baseFields)}}\n\n`;

  const resolvers = {
    [aggregatorId]: {
      count(obj) {
        const opts = convertToQuery(obj.where);
        return opts._q
          ? strapi.query(modelName, model.plugin).countSearch(opts)
          : strapi.query(modelName, model.plugin).count(opts);
      },
      totalCount() {
        return strapi.query(modelName, model.plugin).count({});
      },
    },
  };

  if (!_.isEmpty(numericFields)) {
    const identity = obj => obj;
    _.merge(resolvers[aggregatorId], {
      sum: identity,
      avg: identity,
      min: identity,
      max: identity,
    });

    const ops = ['sum', 'avg', 'min', 'max'];
    ops.forEach(op => {
      typeDef += `type ${aggregatorId}${_.startCase(op)} {${gqlNumberFormat}}\n\n`;
      resolvers[`${aggregatorId}${_.startCase(op)}`] = createAggregationFieldsResolver(
        model,
        fields,
        op,
        isNumberType
      );
    });
  }

  return {
    globalId: aggregatorId,
    type: typeDef,
    resolver: resolvers,
  };
};

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

const formatModelConnectionsGQL = ({ fields, model: contentType, name, resolver }) => {
  const { globalId } = contentType;
  const model = strapi.getModel(contentType.uid);
  const connectionId = `${globalId}Connection`;

  const aggregator = formatConnectionAggregator(fields, model, name);
  const groupBy = formatConnectionGroupBy(fields, model);

  const connectionFields = {
    values: `[${globalId}]`,
    groupBy: `${globalId}GroupBy`,
    aggregate: `${globalId}Aggregator`,
  };

  const pluralName = pluralize.plural(_.camelCase(name));
  const connectionResolver = buildQueryResolver(`${pluralName}Connection.values`, resolver);
  const queryName = `${pluralName}Connection`;

  const definition = `type ${connectionId} {${toSDL(connectionFields)}}\n\n${aggregator.type}${groupBy.type}`;

  return {
    globalId: connectionId,
    definition,
    query: {
      [queryName]: {
        args: {
          sort: 'String',
          limit: 'Int',
          start: 'Int',
          where: 'JSON',
          ...(resolver.args || {}),
        },
        type: connectionId,
      },
    },
    resolvers: {
      Query: {
        [queryName]: buildQueryResolver(queryName, {
          resolverOf: resolver.resolverOf || resolver.resolver,
          resolver(obj, options) {
            return options;
          },
        }),
      },
      [connectionId]: {
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
      ...aggregator.resolver,
      ...groupBy.resolver,
    },
  };
};

module.exports = {
  formatModelConnectionsGQL,
};
```