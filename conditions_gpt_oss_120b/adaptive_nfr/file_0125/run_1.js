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
 * @returns {Function} Query builder enhancer
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
 * @returns {Function} Clause builder
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
 * Generate a unique alias for a given name.
 * @param {string} name - Base name
 * @param {Object} aliasMap - Map tracking counts
 * @returns {string} Unique alias
 */
function generateAlias(name, aliasMap) {
  if (!aliasMap[name]) {
    aliasMap[name] = 1;
  }
  const alias = `${name}_${aliasMap[name]}`;
  aliasMap[name] += 1;
  return alias;
}

/**
 * Create a tree node for joins.
 * @param {Object} model - Strapi model
 * @param {Object|null} assoc - Association (if any)
 * @param {Object} aliasMap - Alias map
 * @returns {Object} Tree node
 */
function createTreeNode(model, assoc, aliasMap) {
  return {
    alias: generateAlias(model.collectionName, aliasMap),
    assoc,
    model,
    joins: {},
  };
}

/**
 * Recursively build joins from a query tree.
 * @param {Object} qb - Knex query builder
 * @param {Object} queryTree - Current tree node
 * @param {Object} aliasMap - Alias map
 */
function buildJoinsFromTree(qb, queryTree, aliasMap) {
  Object.keys(queryTree.joins).forEach(key => {
    const subTree = queryTree.joins[key];
    buildJoin(qb, subTree.assoc, queryTree, subTree, aliasMap);
    buildJoinsFromTree(qb, subTree, aliasMap);
  });
}

/**
 * Add a join between two tables.
 * @param {Object} qb - Knex query builder
 * @param {Object} assoc - Association info
 * @param {Object} originInfo - Origin table info
 * @param {Object} destinationInfo - Destination table info
 * @param {Object} aliasMap - Alias map
 */
function buildJoin(qb, assoc, originInfo, destinationInfo, aliasMap) {
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
}

/**
 * Recursively generate nested joins for a dotted field path.
 * @param {string} field - Dotted field (e.g., "author.name")
 * @param {Object} tree - Current joins tree node
 * @param {Object} aliasMap - Alias map
 * @returns {string} SQL path with alias
 */
function generateNestedJoins(field, tree, aliasMap) {
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
}

/**
 * Build where clauses with proper aliases.
 * @param {Array} whereClauses - Original where clauses
 * @param {Object} tree - Joins tree
 * @param {Object} model - Root model
 * @param {Object} aliasMap - Alias map
 * @returns {Array} Aliased where clauses
 */
function buildWhereClauses(whereClauses, tree, model, aliasMap) {
  return whereClauses.map(clause => {
    const { field, operator, value } = clause;

    if (BOOLEAN_OPERATORS.includes(operator)) {
      return {
        field,
        operator,
        value: value.map(v => buildWhereClauses(v, tree, model, aliasMap)),
      };
    }

    const path = generateNestedJoins(field, tree, aliasMap);
    return { field: path, operator, value };
  });
}

/**
 * Recursively add publicationState queries to each join node.
 * @param {Object} tree - Joins tree node
 * @param {Object} filters - Original filters
 * @param {Object} qb - Knex query builder
 */
function addFiltersQueriesToJoinTree(tree, filters, qb) {
  each(value => {
    const { alias, model } = value;
    runPopulateQueries(
      toQueries({
        publicationState: { query: filters.publicationState, model, alias },
      }),
      qb
    );
    addFiltersQueriesToJoinTree(value, filters, qb);
  })(tree.joins);
}

/**
 * Orchestrates building joins, filters, and where clauses.
 * @param {Object} qb - Knex query builder
 * @param {Object} model - Root model
 * @param {Object} filters - Query filters
 * @returns {Object} Joins tree
 */
function buildJoinsAndFilter(qb, model, filters) {
  const { where: whereClauses = [], sort: sortClauses = [] } = filters;
  const aliasMap = {};

  const tree = {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
  };

  const aliasedWhereClauses = buildWhereClauses(whereClauses, tree, model, aliasMap);
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  // Ensure joins for deep sort fields
  each(field => generateNestedJoins(field, tree, aliasMap))(sortClauses.map(prop('field')));

  buildJoinsFromTree(qb, tree, aliasMap);
  addFiltersQueriesToJoinTree(tree, filters, qb);

  return tree;
}

/**
 * Operator handlers map for where clause building.
 */
const operatorHandlers = {
  and: (qb, field, value) => {
    return qb.where(andQb => {
      value.forEach(andClause => {
        andQb.where(subQb => {
          if (Array.isArray(andClause)) {
            andClause.forEach(clause =>
              subQb.where(innerQb => buildWhereClause({ qb: innerQb, ...clause }))
            );
          } else {
            buildWhereClause({ qb: subQb, ...andClause });
          }
        });
      });
    });
  },
  or: (qb, field, value) => {
    return qb.where(orQb => {
      value.forEach(orClause => {
        orQb.orWhere(subQb => {
          if (Array.isArray(orClause)) {
            orClause.forEach(clause =>
              subQb.where(innerQb => buildWhereClause({ qb: innerQb, ...clause }))
            );
          } else {
            buildWhereClause({ qb: subQb, ...orClause });
          }
        });
      });
    });
  },
  eq: (qb, field, value) => qb.where(field, value),
  ne: (qb, field, value) => qb.where(field, '!=', value),
  lt: (qb, field, value) => qb.where(field, '<', value),
  lte: (qb, field, value) => qb.where(field, '<=', value),
  gt: (qb, field, value) => qb.where(field, '>', value),
  gte: (qb, field, value) => qb.where(field, '>=', value),
  in: (qb, field, value) => qb.whereIn(field, Array.isArray(value) ? value : [value]),
  nin: (qb, field, value) => qb.whereNotIn(field, Array.isArray(value) ? value : [value]),
  contains: (qb, field, value) => qb.whereRaw(`${fieldLowerFn(qb)} LIKE LOWER(?)`, [field, `%${value}%`]),
  ncontains: (qb, field, value) => qb.whereRaw(`${fieldLowerFn(qb)} NOT LIKE LOWER(?)`, [field, `%${value}%`]),
  containss: (qb, field, value) => qb.where(field, 'like', `%${value}%`),
  ncontainss: (qb, field, value) => qb.whereNot(field, 'like', `%${value}%`),
  null: (qb, field, value) => (value ? qb.whereNull(field) : qb.whereNotNull(field)),
};

/**
 * Builds a sql where clause.
 * @param {Object} options - Options
 * @param {Object} options.qb - Bookshelf (knex) query builder
 * @param {string} options.field - Filtered field
 * @param {string} options.operator - Filter operator
 * @param {*} options.value - Filter value
 */
function buildWhereClause({ qb, field, operator, value }) {
  if (Array.isArray(value) && !['and', 'or', 'in', 'nin'].includes(operator)) {
    return qb.where(subQb => {
      value.forEach(val => {
        subQb.orWhere(q => buildWhereClause({ qb: q, field, operator, value: val }));
      });
    });
  }

  const handler = operatorHandlers[operator];
  if (!handler) {
    throw new Error(`Unhandled whereClause : ${field} ${operator} ${value}`);
  }
  return handler(qb, field, value);
}

/**
 * Returns the appropriate LOWER function expression for the DB client.
 * @param {Object} qb - Knex query builder
 * @returns {string} LOWER expression
 */
function fieldLowerFn(qb) {
  return qb.client.config.client === 'pg' ? 'LOWER(CAST(?? AS VARCHAR))' : 'LOWER(??)';
}

/**
 * Find an association on a model by its alias.
 * @param {Object} model - Strapi model
 * @param {string} key - Alias to find
 * @returns {Object|undefined} Association object
 */
function findAssoc(model, key) {
  return model.associations.find(assoc => assoc.alias === key);
}

module.exports = buildQuery;