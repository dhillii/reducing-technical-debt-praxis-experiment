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
  const resolver = field.resolve || ((obj) => obj[key]);
  return resolver(object);
};

const createFieldsResolver = (fields, resolverFn, typeCheck) => {
  return Object.keys(fields).reduce((acc, fieldKey) => {
    const field = fields[fieldKey];
    if (typeCheck(field)) {
      _.set(acc, fieldKey, (obj, options, context) =>
        resolverFn(obj, options, context, fieldResolver(field, fieldKey), fieldKey, obj, field)
      );
    }
    return acc;
  }, {});
};

const extractType = (_type, attributeType) =>
  isPrimitiveType(_type)
    ? _type.replace('!', '')
    : isEnumType(attributeType)
    ? 'String'
    : 'ID';

/* -------------------------------------------------------------------------- */
/* Aggregation resolvers                                                       */
/* -------------------------------------------------------------------------- */

const aggregationFieldResolver = async (model, operation, obj, options, context, fieldResolverFn, fieldKey) => {
  const filters = convertRestQueryParams({
    ...convertToParams(_.omit(obj, 'where')),
    ...convertToQuery(obj.where),
  });

  if (model.orm === 'mongoose') {
    const result = await buildQuery({ model, filters, aggregate: true })
      .group({
        _id: null,
        [fieldKey]: { [`$${operation}`]: `$${fieldKey}` },
      })
      .exec();
    return _.get(result, [0, fieldKey]);
  }

  if (model.orm === 'bookshelf') {
    const result = await model
      .query((qb) => {
        buildQuery({ model, filters })(qb);
        qb[operation](`${fieldKey} as ${operation}_${fieldKey}`);
      })
      .fetch();
    return result.get(`${operation}_${fieldKey}`);
  }
};

const createAggregationFieldsResolver = (model, fields, operation, typeCheck) =>
  createFieldsResolver(
    fields,
    (obj, options, context, fieldResolverFn, fieldKey) =>
      aggregationFieldResolver(model, operation, obj, options, context, fieldResolverFn, fieldKey),
    typeCheck
  );

/* -------------------------------------------------------------------------- */
/* Group‑by resolvers                                                          */
/* -------------------------------------------------------------------------- */

const buildGroupByConnection = (filters, fieldKey, value) => ({
  ...filters,
  where: {
    ...(filters.where || {}),
    [fieldKey]: value,
  },
});

const preProcessGroupByData = ({ result, fieldKey, filters }) => {
  const filtered = _.toArray(result).filter((v) => Boolean(v._id));
  return filtered.map((value) => ({
    key: value._id.toString(),
    connection: () => buildGroupByConnection(filters, fieldKey, value._id.toString()),
  }));
};

const groupByFieldResolver = async (model, filters, options, context, fieldResolverFn, fieldKey) => {
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
    return preProcessGroupByData({ result, fieldKey, filters });
  }

  if (model.orm === 'bookshelf') {
    const result = await model
      .query((qb) => {
        buildQuery({ model, filters: params })(qb);
        qb.groupBy(fieldKey);
        qb.select(fieldKey);
      })
      .fetchAll();

    const values = result.models
      .map((m) => m.get(fieldKey))
      .filter(Boolean)
      .map((v) => `${v}`);

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
  }
};

const createGroupByFieldsResolver = (model, fields) =>
  createFieldsResolver(fields, (filters, options, context, fieldResolverFn, fieldKey) =>
    groupByFieldResolver(model, filters, options, context, fieldResolverFn, fieldKey), () => true);

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

/* -------------------------------------------------------------------------- */
/* Aggregator type generation                                                   */
/* -------------------------------------------------------------------------- */

const identityResolver = (obj) => obj;

const defaultAggregatorFunc = (obj) => obj;

const formatConnectionAggregator = (fields, model, modelName) => {
  const { globalId } = model;
  const numericFields = getFieldsByTypes(fields, isNumberType, () => 'Float');

  const aggregatorGlobalId = `${globalId}Aggregator`;
  const initialFields = { count: 'Int', totalCount: 'Int' };

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
/* Entry point                                                                  */
/* -------------------------------------------------------------------------- */

const valuesResolverFactory = (connectionResolver) => (obj, options, gqlCtx) =>
  connectionResolver(obj, obj, gqlCtx);

const queryResolverFactory = (connectionQueryName, resolver) =>
  buildQueryResolver(connectionQueryName, {
    resolverOf: resolver.resolverOf || resolver.resolver,
    resolver: identityResolver,
  });

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

  return {
    globalId: connectionGlobalId,
    definition: `type ${connectionGlobalId} {${toSDL(connectionFields)}}\n\n${aggregatorFormat.type}${groupByFormat.type}`,
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
        [connectionQueryName]: queryResolverFactory(connectionQueryName, resolver),
      },
      [connectionGlobalId]: {
        values: valuesResolverFactory(connectionResolver),
        groupBy: identityResolver,
        aggregate: identityResolver,
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