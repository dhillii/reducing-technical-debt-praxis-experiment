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
    applySort(qb, filters.sort, joinsTree);
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
 * Apply sorting clauses to the query builder.
 * @param {Object} qb - Knex query builder
 * @param {Array} sortClauses - Sort definitions from filters
 * @param {Object} joinsTree - Joins tree containing aliases
 */
function applySort(qb, sortClauses, joinsTree) {
  const clauses = sortClauses
    .map(buildSortClauseFromTree(joinsTree))
    .filter(c => !isEmpty(c));

  const orderBy = clauses.map(({ order, alias }) => ({ order, column: alias }));
  const orderColumns = clauses.map(({ alias, column }) => ({ [alias]: column }));
  const columns = [`${joinsTree.alias}.*`, ...orderColumns];

  qb.column(columns).orderBy(orderBy);
}

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
 * Build joins and where filters, returning the joins tree.
 * @param {Object} qb - Knex query builder
 * @param {Object} model - Bookshelf model
 * @param {Object} filters - Query filters
 */
function buildJoinsAndFilter(qb, model, filters) {
  const { where: whereClauses = [], sort: sortClauses = [] } = filters;

  const { generateAlias, aliasMap } = createAliasGenerator();

  const tree = {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
  };

  const aliasMapRef = { aliasMap };

  // Process where clauses
  const aliasedWhereClauses = buildWhereClauses(whereClauses, { model, tree, generateAlias });
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  // Ensure joins for deep sort fields
  each(field => generateNestedJoins(field, tree, generateAlias), sortClauses.map(prop('field')));

  // Build joins recursively
  buildJoinsFromTree(qb, tree, generateAlias);

  // Add publication state queries for each join
  addFiltersQueriesToJoinTree(tree, qb, filters.publicationState);

  return tree;
}

/**
 * Factory to generate incremental aliases.
 * @returns {{generateAlias: function, aliasMap: Object}}
 */
function createAliasGenerator() {
  const aliasMap = {};
  const generateAlias = name => {
    if (!aliasMap[name]) {
      aliasMap[name] = 1;
    }
    const alias = `${name}_${aliasMap[name]}`;
    aliasMap[name] += 1;
    return alias;
  };
  return { generateAlias, aliasMap };
}

/**
 * Recursively build joins from a query tree.
 * @param {Object} qb - Knex query builder
 * @param {Object} queryTree - Current node in the joins tree
 * @param {function} generateAlias - Alias generator
 */
function buildJoinsFromTree(qb, queryTree, generateAlias) {
  Object.keys(queryTree.joins).forEach(key => {
    const subTree = queryTree.joins[key];
    buildJoin(qb, subTree.assoc, queryTree, subTree, generateAlias);
    buildJoinsFromTree(qb, subTree, generateAlias);
  });
}

/**
 * Add a table join based on association nature.
 * @param {Object} qb - Knex query builder
 * @param {Object} assoc - Association metadata
 * @param {Object} originInfo - Origin model info
 * @param {Object} destinationInfo - Destination model info
 * @param {function} generateAlias - Alias generator
 */
function buildJoin(qb, assoc, originInfo, destinationInfo, generateAlias) {
  if (['manyToMany', 'manyWay'].includes(assoc.nature)) {
    const joinTableAlias = generateAlias(assoc.tableCollectionName);

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
 * Create a tree node for a model/association.
 * @param {Object} model - Strapi model
 * @param {Object} assoc - Association (optional)
 * @param {function} generateAlias - Alias generator
 * @returns {Object}
 */
function createTreeNode(model, assoc, generateAlias) {
  return {
    alias: generateAlias(model.collectionName),
    assoc,
    model,
    joins: {},
  };
}

/**
 * Generate nested joins for a dotted field path, updating the tree.
 * @param {string} field - Field path (e.g., "author.profile.name")
 * @param {Object} tree - Current joins tree
 * @param {function} generateAlias - Alias generator
 * @returns {string} - SQL path with alias
 */
function generateNestedJoins(field, tree, generateAlias) {
  let [key, ...parts] = field.split('.');

  const assoc = findAssoc(tree.model, key);
  if (!assoc) {
    return `${tree.alias}.${key}`;
  }

  const assocModel = strapi.db.getModelByAssoc(assoc);
  if (parts.length === 0) {
    parts = [assocModel.primaryKey];
  }

  if (!tree.joins[key]) {
    tree.joins[key] = createTreeNode(assocModel, assoc, generateAlias);
  }

  return generateNestedJoins(parts.join('.'), tree.joins[key], generateAlias);
}

/**
 * Build where clauses with proper table aliases.
 * @param {Array} whereClauses - Original where clauses
 * @param {Object} context - Context containing model and tree
 * @returns {Array} - Clauses with aliased fields
 */
function buildWhereClauses(whereClauses, { model, tree, generateAlias }) {
  return whereClauses.map(clause => {
    const { field, operator, value } = clause;

    if (BOOLEAN_OPERATORS.includes(operator)) {
      return {
        field,
        operator,
        value: value.map(v => buildWhereClauses(v, { model, tree, generateAlias })),
      };
    }

    const path = generateNestedJoins(field, tree, generateAlias);
    return { field: path, operator, value };
  });
}

/**
 * Recursively add publication state queries to each join node.
 * @param {Object} node - Current tree node
 * @param {Object} qb - Knex query builder
 * @param {string|undefined} publicationState - Publication state filter
 */
function addFiltersQueriesToJoinTree(node, qb, publicationState) {
  each(value => {
    const { alias, model } = value;
    if (publicationState) {
      runPopulateQueries(
        toQueries({
          publicationState: { query: publicationState, model, alias },
        }),
        qb
      );
    }
    addFiltersQueriesToJoinTree(value, qb, publicationState);
  }, node.joins);
}

/**
 * Build a SQL where clause based on operator.
 * @param {Object} options - Clause options
 */
function buildWhereClause({ qb, field, operator, value }) {
  const handler = operatorHandlers[operator];
  if (handler) {
    return handler(qb, field, value);
  }
  throw new Error(`Unhandled whereClause : ${field} ${operator} ${value}`);
}

/**
 * Handlers for each supported operator.
 */
const operatorHandlers = {
  and: (qb, _, value) =>
    qb.where(andQb => {
      value.forEach(andClause => {
        andQb.where(subQb => {
          if (Array.isArray(andClause)) {
            andClause.forEach(clause => subQb.where(andQb => buildWhereClause({ qb: andQb, ...clause })));
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
            orClause.forEach(clause => subQb.where(andQb => buildWhereClause({ qb: andQb, ...clause })));
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
  contains: (qb, field, value) => qb.whereRaw(`${fieldLowerFn(qb)} LIKE LOWER(?)`, [field, `%${value}%`]),
  ncontains: (qb, field, value) => qb.whereRaw(`${fieldLowerFn(qb)} NOT LIKE LOWER(?)`, [field, `%${value}%`]),
  containss: (qb, field, value) => qb.where(field, 'like', `%${value}%`),
  ncontainss: (qb, field, value) => qb.whereNot(field, 'like', `%${value}%`),
  null: (qb, field, value) => (value ? qb.whereNull(field) : qb.whereNotNull(field)),
};

/**
 * Helper to generate LOWER expression based on client.
 * @param {Object} qb - Knex query builder
 * @returns {string}
 */
function fieldLowerFn(qb) {
  return qb.client.config.client === 'pg' ? 'LOWER(CAST(?? AS VARCHAR))' : 'LOWER(??)';
}

/**
 * Find association definition on a model by key.
 * @param {Object} model - Strapi model
 * @param {string} key - Association alias
 * @returns {Object|undefined}
 */
function findAssoc(model, key) {
  return model.associations.find(assoc => assoc.alias === key);
}

module.exports = buildQuery;