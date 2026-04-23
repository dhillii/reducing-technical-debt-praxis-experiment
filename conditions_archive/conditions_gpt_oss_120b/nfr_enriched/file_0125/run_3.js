'use strict';

const _ = require('lodash');
const { keys, each, prop, isEmpty } = require('lodash/fp');
const { singular } = require('pluralize');
const { toQueries, runPopulateQueries } = require('./utils/populate-queries');

const BOOLEAN_OPERATORS = ['or', 'and'];

/**
 * Build filters on a bookshelf query
 * @param {Object} options - Options
 * @param {Object} options.model - Bookshelf model
 * @param {Object} options.filters - Filters params (start, limit, sort, where)
 */
const buildQuery = ({ model, filters }) => qb => {
  const joinsTree = buildJoinsAndFilter(qb, model, filters);

  const isSortQuery = _.has(filters, 'sort');
  const isSingleResult = _.has(filters, 'limit') && filters.limit === 1;
  const hasJoins = _.has(joinsTree, 'joins') && keys(joinsTree.joins).length;
  const isDistinctJoin = !isSingleResult && hasJoins;
  const hasWhereFilters = _.has(filters, 'where') && Array.isArray(filters.where) && filters.where.length > 0;
  const isDistinctQuery = isDistinctJoin && (isSortQuery || hasWhereFilters);

  if (isDistinctQuery) {
    qb.distinct();
  }

  if (isSortQuery) {
    const clauses = filters.sort.map(buildSortClauseFromTree(joinsTree)).filter(c => !isEmpty(c));
    const orderBy = clauses.map(({ order, alias }) => ({ order, column: alias }));
    const orderColumns = clauses.map(({ alias, column }) => ({ [alias]: column }));
    const columns = [`${joinsTree.alias}.*`, ...orderColumns];
    qb.column(columns).orderBy(orderBy);
  }

  if (_.has(filters, 'start')) {
    qb.offset(filters.start);
  }

  if (_.has(filters, 'limit') && filters.limit >= 0) {
    qb.limit(filters.limit);
  }

  if (_.has(filters, 'publicationState')) {
    runPopulateQueries(
      toQueries({ publicationState: { query: filters.publicationState, model } }),
      qb
    );
  }
};

/**
 * Build a bookshelf sort clause (simple or deep) based on a joins tree
 * @param {Object} tree - The joins tree that contains the aliased associations
 */
const buildSortClauseFromTree = tree => ({ field, order }) => {
  if (!field.includes('.')) {
    return {
      column: `${tree.alias}.${field}`,
      order,
      alias: `_strapi_tmp_${tree.alias}_${field}`,
    };
  }

  const [relation, attribute] = field.split('.');
  for (const { alias, assoc } of Object.values(tree.joins)) {
    if (relation === assoc.alias) {
      return {
        column: `${alias}.${attribute}`,
        order,
        alias: `_strapi_tmp_${alias}_${attribute}`,
      };
    }
  }

  return {};
};

/**
 * Add joins and where filters
 * @param {Object} qb - knex query builder
 * @param {Object} model - Bookshelf model
 * @param {Object} filters - The query filters
 */
const buildJoinsAndFilter = (qb, model, filters) => {
  const { where: whereClauses = [], sort: sortClauses = [] } = filters;
  const aliasMap = {};

  const tree = {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
  };

  const aliasedWhereClauses = buildWhereClauses(whereClauses, model, tree, aliasMap);
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  generateNestedJoinsFromFields(sortClauses.map(prop('field')), tree, aliasMap);
  buildJoinsFromTree(qb, tree, aliasMap);
  addFiltersQueriesToJoinTree(tree, filters, qb);

  return tree;
};

/**
 * Generate a unique alias for a given name.
 * @param {string} name
 * @param {Object} aliasMap
 * @returns {string}
 */
const generateAlias = (name, aliasMap) => {
  if (!aliasMap[name]) {
    aliasMap[name] = 1;
  }
  const alias = `${name}_${aliasMap[name]}`;
  aliasMap[name] += 1;
  return alias;
};

/**
 * Create a tree node for joins.
 * @param {Object} model
 * @param {Object} assoc
 * @param {Object} aliasMap
 * @returns {Object}
 */
const createTreeNode = (model, assoc, aliasMap) => ({
  alias: generateAlias(model.collectionName, aliasMap),
  assoc,
  model,
  joins: {},
});

/**
 * Recursively build joins from a query tree.
 * @param {Object} qb
 * @param {Object} queryTree
 * @param {Object} aliasMap
 */
const buildJoinsFromTree = (qb, queryTree, aliasMap) => {
  Object.keys(queryTree.joins).forEach(key => {
    const subTree = queryTree.joins[key];
    buildJoin(qb, subTree.assoc, queryTree, subTree, aliasMap);
    buildJoinsFromTree(qb, subTree, aliasMap);
  });
};

/**
 * Add a single join to the query builder.
 * @param {Object} qb
 * @param {Object} assoc
 * @param {Object} originInfo
 * @param {Object} destinationInfo
 * @param {Object} aliasMap
 */
const buildJoin = (qb, assoc, originInfo, destinationInfo, aliasMap) => {
  if (['manyToMany', 'manyWay'].includes(assoc.nature)) {
    const joinTableAlias = generateAlias(assoc.tableCollectionName, aliasMap);
    let originColumnNameInJoinTable;

    if (assoc.nature === 'manyToMany') {
      originColumnNameInJoinTable = `${joinTableAlias}.${singular(
        destinationInfo.model.attributes[assoc.via].attribute
      )}_${destinationInfo.model.attributes[assoc.via].column}`;
    } else {
      originColumnNameInJoinTable = `${joinTableAlias}.${singular(
        originInfo.model.collectionName
      )}_${originInfo.model.primaryKey}`;
    }

    qb.leftJoin(
      `${originInfo.model.databaseName}.${assoc.tableCollectionName} AS ${joinTableAlias}`,
      originColumnNameInJoinTable,
      `${originInfo.alias}.${originInfo.model.primaryKey}`
    );

    qb.leftJoin(
      `${destinationInfo.model.databaseName}.${destinationInfo.model.collectionName} AS ${destinationInfo.alias}`,
      `${joinTableAlias}.${singular(originInfo.model.attributes[assoc.alias].attribute)}_${
        originInfo.model.attributes[assoc.alias].column
      }`,
      `${destinationInfo.alias}.${destinationInfo.model.primaryKey}`
    );
  } else {
    const externalKey =
      assoc.type === 'collection'
        ? `${destinationInfo.alias}.${assoc.via || destinationInfo.model.primaryKey}`
        : `${destinationInfo.alias}.${destinationInfo.model.primaryKey}`;

    const internalKey =
      assoc.type === 'collection'
        ? `${originInfo.alias}.${originInfo.model.primaryKey}`
        : `${originInfo.alias}.${assoc.alias}`;

    qb.leftJoin(
      `${destinationInfo.model.databaseName}.${destinationInfo.model.collectionName} AS ${destinationInfo.alias}`,
      externalKey,
      internalKey
    );
  }
};

/**
 * Generate nested joins for a dot‑notation field.
 * @param {string} field
 * @param {Object} tree
 * @param {Object} aliasMap
 * @returns {string}
 */
const generateNestedJoins = (field, tree, aliasMap) => {
  const [key, ...rest] = field.split('.');
  const assoc = findAssoc(tree.model, key);

  if (!assoc) {
    return `${tree.alias}.${key}`;
  }

  const assocModel = strapi.db.getModelByAssoc(assoc);
  const parts = rest.length ? rest : [assocModel.primaryKey];

  if (!tree.joins[key]) {
    tree.joins[key] = createTreeNode(assocModel, assoc, aliasMap);
  }

  return generateNestedJoins(parts.join('.'), tree.joins[key], aliasMap);
};

/**
 * Apply generateNestedJoins to a list of fields.
 * @param {Array<string>} fields
 * @param {Object} tree
 * @param {Object} aliasMap
 */
const generateNestedJoinsFromFields = (fields, tree, aliasMap) => {
  fields.forEach(field => generateNestedJoins(field, tree, aliasMap));
};

/**
 * Build where clauses with proper aliases.
 * @param {Array<Object>} whereClauses
 * @param {Object} model
 * @param {Object} tree
 * @param {Object} aliasMap
 * @returns {Array<Object>}
 */
const buildWhereClauses = (whereClauses, model, tree, aliasMap) => {
  return whereClauses.map(clause => {
    const { field, operator, value } = clause;

    if (BOOLEAN_OPERATORS.includes(operator)) {
      return {
        field,
        operator,
        value: value.map(v => buildWhereClauses(v, model, tree, aliasMap)),
      };
    }

    const path = generateNestedJoins(field, tree, aliasMap);
    return { field: path, operator, value };
  });
};

/**
 * Recursively add populate queries for each join node.
 * @param {Object} tree
 * @param {Object} filters
 * @param {Object} qb
 */
const addFiltersQueriesToJoinTree = (tree, filters, qb) => {
  _.each(tree.joins, ({ alias, model }) => {
    runPopulateQueries(
      toQueries({
        publicationState: { query: filters.publicationState, model, alias },
      }),
      qb
    );
    addFiltersQueriesToJoinTree(tree.joins[alias] || {}, filters, qb);
  });
};

/**
 * Builds a sql where clause
 * @param {Object} options
 * @param {Object} options.qb - Bookshelf (knex) query builder
 * @param {string} options.field - Filtered field
 * @param {string} options.operator - Filter operator
 * @param {*} options.value - Filter value
 */
const buildWhereClause = ({ qb, field, operator, value }) => {
  if (Array.isArray(value) && !['and', 'or', 'in', 'nin'].includes(operator)) {
    return handleArrayValue(qb, field, operator, value);
  }

  const handler = operatorHandlers[operator];
  if (!handler) {
    throw new Error(`Unhandled whereClause : ${field} ${operator} ${value}`);
  }
  return handler(qb, field, value);
};

/**
 * Handles array values for non‑boolean operators.
 */
const handleArrayValue = (qb, field, operator, values) => {
  return qb.where(subQb => {
    values.forEach(val => {
      subQb.orWhere(q => buildWhereClause({ qb: q, field, operator, value: val }));
    });
  });
};

/**
 * Mapping of operator strings to handler functions.
 */
const operatorHandlers = {
  and: (qb, _, value) =>
    qb.where(andQb => {
      value.forEach(andClause => {
        andQb.where(subQb => {
          if (Array.isArray(andClause)) {
            andClause.forEach(clause =>
              subQb.where(andQb => buildWhereClause({ qb: andQb, ...clause }))
            );
          } else {
            buildWhereClause({ qb: subQb, ...andClause });
          }
        });
      });
    }),

  or: (qb, _, value) =>
    qb.where(orQb => {
      value.forEach(orClause => {
        orQb.orWhere(subQb => {
          if (Array.isArray(orClause)) {
            orClause.forEach(clause =>
              subQb.where(andQb => buildWhereClause({ qb: andQb, ...clause }))
            );
          } else {
            buildWhereClause({ qb: subQb, ...orClause });
          }
        });
      });
    }),

  eq: (qb, field, value) => qb.where(field, value),
  ne: (qb, field, value) => qb.where(field, '!=', value),
  lt: (qb, field, value) => qb.where(field, '<', value),
  lte: (qb, field, value) => qb.where(field, '<=', value),
  gt: (qb, field, value) => qb.where(field, '>', value),
  gte: (qb, field, value) => qb.where(field, '>=', value),
  in: (qb, field, value) => qb.whereIn(field, Array.isArray(value) ? value : [value]),
  nin: (qb, field, value) => qb.whereNotIn(field, Array.isArray(value) ? value : [value]),
  contains: (qb, field, value) =>
    qb.whereRaw(`${fieldLowerFn(qb)} LIKE LOWER(?)`, [field, `%${value}%`]),
  ncontains: (qb, field, value) =>
    qb.whereRaw(`${fieldLowerFn(qb)} NOT LIKE LOWER(?)`, [field, `%${value}%`]),
  containss: (qb, field, value) => qb.where(field, 'like', `%${value}%`),
  ncontainss: (qb, field, value) => qb.whereNot(field, 'like', `%${value}%`),
  null: (qb, field, value) => (value ? qb.whereNull(field) : qb.whereNotNull(field)),
};

/**
 * Returns the appropriate LOWER function string for the current client.
 */
const fieldLowerFn = qb => {
  if (qb.client.config.client === 'pg') {
    return 'LOWER(CAST(?? AS VARCHAR))';
  }
  return 'LOWER(??)';
};

const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

module.exports = buildQuery;