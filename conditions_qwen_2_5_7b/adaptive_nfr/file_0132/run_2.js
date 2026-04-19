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

/**
 * Returns all fields of type primitive
 *
 * @returns {Boolean}
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
 * Checks if the field is of type enum
 *
 * @returns {Boolean}
 */
const isEnumType = type => {
  return type === 'enumeration';
};

/**
 * Returns all fields that are not of type array
 *
 * @returns {Boolean}
 *
 * @example
 *
 * isNotOfTypeArray([String])
 * // => false
 * isNotOfTypeArray(String!)
 * // => true
 */
const isNotOfTypeArray = type => {
  return !/(\[\w+!?\])/.test(type);
};

/**
 * Returns all fields of type Integer or float
 */
const isNumberType = type => {
  const nonRequiredType = nonRequired(type);
  return nonRequiredType === 'Int' || nonRequiredType === 'Float';
};

/**
 * Extracts fields by type check
 *
 * @param {Object} fields - The fields to check
 * @param {Function} typeCheck - The type check function
 * @param {Function} returnType - The return type function
 * @returns {Object} - The fields that match the type check
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
 * Use the field resolver otherwise fall through the field value
 *
 * @param {Object} field - The field to resolve
 * @param {String} key - The key of the field
 * @returns {Function} - The resolver function
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
 * Create fields resolvers
 *
 * @param {Object} fields - The fields to create resolvers for
 * @param {Function} resolverFn - The resolver function
 * @param {Function} typeCheck - The type check function
 * @returns {Object} - The resolvers
 */
const createFieldsResolver = (fields, resolverFn, typeCheck) => {
  const resolver = Object.keys(fields).reduce((acc, fieldKey) => {
    const field = fields[fieldKey];
    // Check if the field is of the correct type
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
 * Convert non-primitive type to string (non-primitive types corresponds to a reference to an other model)
 *
 * @param {String} _type - The type to convert
 * @param {Function} attributeType - The attribute type function
 * @returns {String} - The converted type
 */
const extractType = (_type, attributeType) => {
  return isPrimitiveType(_type)
    ? _type.replace('!', '')
    : isEnumType(attributeType)
    ? 'String'
    : 'ID';
};

/**
 * Create the resolvers for each aggregation field
 *
 * @param {Object} model - The model to create resolvers for
 * @param {Object} fields - The fields to create resolvers for
 * @param {String} operation - The operation to perform
 * @param {Function} typeCheck - The type check function
 * @returns {Object} - The resolvers
 */
const createAggregationFieldsResolver = (model, fields, operation, typeCheck) => {
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
            // apply filters
            buildQuery({ model, filters })(qb);

            // `sum, avg, min, max` pass nicely to knex :->
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
 * Correctly format the data returned by the group by
 *
 * @param {Object} result - The result to format
 * @param {String} fieldKey - The field key
 * @param {Object} filters - The filters to apply
 * @returns {Array} - The formatted data
 */
const preProcessGroupByData = ({ result, fieldKey, filters }) => {
  const _result = _.toArray(result).filter(value => Boolean(value._id));
  return _.map(_result, value => {
    return {
      key: value._id.toString(),
      connection: () => {
        // filter by the grouped by value in next connection

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
 * Create the resolvers for each group by field
 *
 * @param {Object} model - The model to create resolvers for
 * @param {Object} fields - The fields to create resolvers for
 * @returns {Object} - The resolvers
 */
const createGroupByFieldsResolver = (model, fields) => {
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
            .map(m => m.get(fieldKey)) // extract aggregate field
            .filter(v => !!v) // remove null
            .map(v => '' + v); // convert to string
          return values.map(v => ({
            key: v,
            connection: () => {
              return {
                ..._.omit(filters, ['limit']), // we shouldn't carry limit to sub-field
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
 * Generate the connection type of each non-array field of the model
 *
 * @param {Object} fields - The fields to generate types for
 * @param {Object} model - The model to generate types for
 * @returns {String} - The generated types
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
        `type ${globalId}Connection${_.upperFirst(fieldKey)} {${toSDL(connectionFields[fieldKey])}}`
    )
    .join('\n\n');
};

/**
 * Format the connection group by fields
 *
 * @param {Object} fields - The fields to format
 * @param {Object} model - The model to format
 * @returns {Object} - The formatted fields
 */
const formatConnectionGroupBy = (fields, model) => {
  const { globalId } = model;
  const groupByGlobalId = `${globalId}GroupBy`;

  // Extract all primitive fields and change their types
  const groupByFields = getFieldsByTypes(
    fields,
    isNotOfTypeArray,
    (fieldType, fieldName) => `[${globalId}Connection${_.upperFirst(fieldName)}]`
  );

  // Get the generated field types
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
 * Format the connection aggregator fields
 *
 * @param {Object} fields - The fields to format
 * @param {Object} model - The model to format
 * @param {String} modelName - The name of the model
 * @returns {Object} - The formatted fields
 */
const formatConnectionAggregator = (fields, model, modelName) => {
  const { globalId } = model;

  // Extract all fields of type Integer and Float and change their type to Float
  const numericFields = getFieldsByTypes(fields, isNumberType, () => 'Float');

  // Don't create an aggregator field if the model has not number fields
  const aggregatorGlobalId = `${globalId}Aggregator`;
  const initialFields = {
    count: 'Int',
    totalCount: 'Int',
  };

  // Only add the aggregator's operations if there are some numeric fields
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
          // allow search param
          return strapi.query(modelName, model.plugin).countSearch(opts);
        }
        return strapi.query(modelName, model.plugin).count(opts);
      },
      totalCount() {
        return strapi.query(modelName, model.plugin).count({});
      },
    },
  };

  // Only add the aggregator's operations types and resolver if there are some numeric fields
  if (!_.isEmpty(numericFields)) {
    // Returns the actual object and handle aggregation in the query resolvers
    const defaultAggregatorFunc = obj => {
      // eslint-disable-line no-unused-vars
      return obj;
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
 * This method is the entry point to the GraphQL's Aggregation.
 * It takes as param the model and its fields and it'll create the aggregation types and resolver to it
 * Example:
 *  type User {
 *     username: String,
 *     age: Int,
 *  }
 *
 * It'll create
 *  type UserConnection {
 *    values: [User],
 *    groupBy: UserGroupBy,
 *    aggreate: UserAggregate
 *  }
 *
 *  type UserAggregate {
 *     count: Int
 *     sum: UserAggregateSum
 *     avg: UserAggregateAvg
 *  }
 *
 *  type UserAggregateSum {
 *     age: Float
 *  }
 *
 *  type UserAggregateAvg {
 *    age: Float
 *  }
 *
 *  type UserGroupBy {
 *     username: [UserConnectionUsername]
 *     age: [UserConnectionAge]
 *  }
 *
 *  type UserConnectionUsername {
 *    key: String
 *    connection: UserConnection
 *  }
 *
 *  type UserConnectionAge {
 *    key: Int
 *    connection: UserConnection
 *  }
 *
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
```