'use strict';

const _ = require('lodash');
const pluralize = require('pluralize');
const { convertRestQueryParams, buildQuery } = require('strapi-utils');

const { buildQuery: buildQueryResolver } = require('./resolvers-builder');
const { convertToParams, convertToQuery, nonRequired } = require('./utils');
const { toSDL } = require('./schema-definitions');

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function isPrimitiveType(type) {
  const nonRequiredType = nonRequired(type);
  return (
    nonRequiredType === 'Int' ||
    nonRequiredType === 'Float' ||
    nonRequiredType === 'String' ||
    nonRequiredType === 'Boolean' ||
    nonRequiredType === 'DateTime' ||
    nonRequiredType === 'JSON'
  );
}

function isEnumType(type) {
  return type === 'enumeration';
}

function isNotOfTypeArray(type) {
  return !/(\[\w+!?\])/.test(type);
}

function isNumberType(type) {
  const nonRequiredType = nonRequired(type);
  return nonRequiredType === 'Int' || nonRequiredType === 'Float';
}

function getFieldsByTypes(fields, typeCheck, returnType) {
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
}

function fieldResolver(field, key) {
  return function resolver(object) {
    const resolverFn =
      field.resolve ||
      function resolver(obj) {
        // eslint-disable-line no-unused-vars
        return obj[key];
      };
    return resolverFn(object);
  };
}

function createFieldsResolver(fields, resolverFn, typeCheck) {
  const resolver = Object.keys(fields).reduce((acc, fieldKey) => {
    const field = fields[fieldKey];
    if (typeCheck(field)) {
      acc[fieldKey] = function (obj, options, context) {
        return resolverFn(
          obj,
          options,
          context,
          fieldResolver(field, fieldKey),
          fieldKey,
          obj,
          field
        );
      };
    }
    return acc;
  }, {});
  return resolver;
}

function extractType(_type, attributeType) {
  if (isPrimitiveType(_type)) {
    return _type.replace('!', '');
  }
  if (isEnumType(attributeType)) {
    return 'String';
  }
  return 'ID';
}

/* -------------------------------------------------------------------------- */
/* Aggregation resolver factory                                              */
/* -------------------------------------------------------------------------- */

function createAggregationResolver(model, operation, typeCheck) {
  return async function (obj, options, context, fieldResolver, fieldKey) {
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
        .then((result) => _.get(result, [0, fieldKey]));
    }

    if (model.orm === 'bookshelf') {
      return model
        .query((qb) => {
          buildQuery({ model, filters })(qb);
          qb[operation](`${fieldKey} as ${operation}_${fieldKey}`);
        })
        .fetch()
        .then((result) => result.get(`${operation}_${fieldKey}`));
    }
  };
}

function createAggregationFieldsResolver(model, fields, operation, typeCheck) {
  return createFieldsResolver(
    fields,
    createAggregationResolver(model, operation, typeCheck),
    typeCheck
  );
}

/* -------------------------------------------------------------------------- */
/* GroupBy resolver helpers                                                  */
/* -------------------------------------------------------------------------- */

function preProcessGroupByData({ result, fieldKey, filters }) {
  const _result = _.toArray(result).filter((value) => Boolean(value._id));
  return _.map(_result, (value) => ({
    key: value._id.toString(),
    connection: function () {
      return {
        ...filters,
        where: {
          ...(filters.where || {}),
          [fieldKey]: value._id.toString(),
        },
      };
    },
  }));
}

function createConnection(filters, fieldKey, value) {
  return {
    key: value,
    connection: function () {
      return {
        ..._.omit(filters, ['limit']),
        where: {
          ...(filters.where || {}),
          [fieldKey]: value,
        },
      };
    },
  };
}

function createGroupByResolver(model) {
  return async function (filters, options, context, fieldResolver, fieldKey) {
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
        .query((qb) => {
          buildQuery({ model, filters: params })(qb);
          qb.groupBy(fieldKey);
          qb.select(fieldKey);
        })
        .fetchAll()
        .then((result) => {
          const values = result.models
            .map((m) => m.get(fieldKey))
            .filter((v) => !!v)
            .map((v) => '' + v);
          return values.map((v) => createConnection(filters, fieldKey, v));
        });
    }
  };
}

function createGroupByFieldsResolver(model, fields) {
  return createFieldsResolver(fields, createGroupByResolver(model), () => true);
}

/* -------------------------------------------------------------------------- */
/* Connection type generation                                               */
/* -------------------------------------------------------------------------- */

function generateConnectionFieldsTypes(fields, model) {
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
        `type ${globalId}Connection${_.upperFirst(
          fieldKey
        )} {${toSDL(connectionFields[fieldKey])}}`
    )
    .join('\n\n');
}

function formatConnectionGroupBy(fields, model) {
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
}

function formatConnectionAggregator(fields, model, modelName) {
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
    const defaultAggregatorFunc = function () {
      // eslint-disable-line no-unused-vars
      return this;
    };

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
}

/* -------------------------------------------------------------------------- */
/* Identity resolver for query building                                     */
/* -------------------------------------------------------------------------- */

function identityResolver(obj, options) {
  return options;
}

function buildConnectionResolver(connectionQueryName, resolver) {
  return buildQueryResolver(connectionQueryName, {
    resolverOf: resolver.resolverOf || resolver.resolver,
    resolver: identityResolver,
  });
}

/* -------------------------------------------------------------------------- */
/* Main entry point for GraphQL aggregation                                 */
/* -------------------------------------------------------------------------- */

function formatModelConnectionsGQL({ fields, model: contentType, name, resolver }) {
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

  const connectionResolver = buildConnectionResolver(
    `${pluralName}Connection.values`,
    resolver
  );

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
        [connectionQueryName]: buildConnectionResolver(connectionQueryName, resolver),
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
}

module.exports = {
  formatModelConnectionsGQL,
};