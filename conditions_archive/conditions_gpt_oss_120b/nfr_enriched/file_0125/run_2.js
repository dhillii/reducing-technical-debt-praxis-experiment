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
 * @param {Object} joinsTree - Tree containing join aliases
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
 * Build joins, where clauses and related queries.
 * @param {Object} qb - Knex query builder
 * @param {Object} model - Bookshelf model
 * @param {Object} filters - Query filters
 * @returns {Object} joins tree
 */
function buildJoinsAndFilter(qb, model, filters) {
  const { where: whereClauses = [], sort: sortClauses = [] } = filters;
  const aliasMap = {};

  const generateAlias = name => {
    if (!aliasMap[name]) {
      aliasMap[name] = 1;
    }
    const alias = `${name}_${aliasMap[name]}`;
    aliasMap[name] += 1;
    return alias;
  };

  const rootTree = {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
  };

  const tree = buildTreeStructure(rootTree, whereClauses, sortClauses, generateAlias);
  const aliasedWhereClauses = buildWhereClauses(whereClauses, { model, tree, generateAlias });
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  // Ensure joins for deep sort fields
  sortClauses.map(prop('field')).forEach(field => generateNestedJoins(field, tree, generateAlias));

  buildJoinsFromTree(qb, tree);
  addPublicationStateQueries(tree, qb, filters.publicationState);

  return tree;
}

/**
 * Build the initial tree structure and populate joins for where/sort fields.
 */
function buildTreeStructure(rootTree, whereClauses, sortClauses, generateAlias) {
  const tree = rootTree;

  // Process where fields
  whereClauses.forEach(({ field }) => generateNestedJoins(field, tree, generateAlias));

  // Process sort fields
  sortClauses.map(prop('field')).forEach(field => generateNestedJoins(field, tree, generateAlias));

  return tree;
}

/**
 * Recursively generate nested joins for a dotted field path.
 * @param {string} field - Dotted field (e.g., "author.profile.name")
 * @param {Object} tree - Current node in the joins tree
 * @param {Function} generateAlias - Alias generator
 * @returns {string} SQL path for the deepest attribute
 */
function generateNestedJoins(field, tree, generateAlias) {
  const [key, ...rest] = field.split('.');
  const assoc = findAssoc(tree.model, key);

  if (!assoc) {
    return `${tree.alias}.${key}`;
  }

  const assocModel = strapi.db.getModelByAssoc(assoc);
  const nextParts = rest.length === 0 ? [assocModel.primaryKey] : rest;

  if (!tree.joins[key]) {
    tree.joins[key] = {
      alias: generateAlias(assocModel.collectionName),
      assoc,
      model: assocModel,
      joins: {},
    };
  }

  return generateNestedJoins(nextParts.join('.'), tree.joins[key], generateAlias);
}

/**
 * Build where clauses with proper table aliases.
 * @param {Array} whereClauses - Original where clauses
 * @param {Object} context - Context containing model and tree
 * @returns {Array} Aliased where clauses
 */
function buildWhereClauses(whereClauses, { model, tree, generateAlias }) {
  return whereClauses.map(clause => {
    const { field, operator, value } = clause;

    if (BOOLEAN_OPERATORS.includes(operator)) {
      return {
        field,
        operator,
        value: value.map(v => buildWhereClauses(v, { model, tree, generateAlias }))[0],
      };
    }

    const path = generateNestedJoins(field, tree, generateAlias);
    return { field: path, operator, value };
  });
}

/**
 * Recursively add joins to the query builder based on the tree.
 * @param {Object} qb - Knex query builder
 * @param {Object} node - Current tree node
 */
function buildJoinsFromTree(qb, node) {
  Object.values(node.joins).forEach(child => {
    buildJoin(qb, child.assoc, node, child);
    buildJoinsFromTree(qb, child);
  });
}

/**
 * Add a single join to the query builder.
 * @param {Object} qb - Knex query builder
 * @param {Object} assoc - Association metadata
 * @param {Object} originInfo - Origin node info
 * @param {Object} destinationInfo - Destination node info
 */
function buildJoin(qb, assoc, originInfo, destinationInfo) {
  if (['manyToMany', 'manyWay'].includes(assoc.nature)) {
    const joinTableAlias = generateAliasForJoin(assoc.tableCollectionName);
    const originColumn = buildOriginColumnInJoin(assoc, originInfo, destinationInfo, joinTableAlias);
    const destColumn = buildDestinationColumnInJoin(assoc, originInfo, destinationInfo, joinTableAlias);

    qb.leftJoin(
      `${originInfo.model.databaseName}.${assoc.tableCollectionName} AS ${joinTableAlias}`,
      originColumn,
      `${originInfo.alias}.${originInfo.model.primaryKey}`
    );

    qb.leftJoin(
      `${destinationInfo.model.databaseName}.${destinationInfo.model.collectionName} AS ${destinationInfo.alias}`,
      destColumn,
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
 * Helper to generate a unique alias for join tables.
 */
function generateAliasForJoin(base) {
  if (!generateAliasForJoin.map) {
    generateAliasForJoin.map = {};
  }
  if (!generateAliasForJoin.map[base]) {
    generateAliasForJoin.map[base] = 1;
  }
  const alias = `${base}_${generateAliasForJoin.map[base]}`;
  generateAliasForJoin.map[base] += 1;
  return alias;
}

/**
 * Build column reference for many-to-many / many-way joins (origin side).
 */
function buildOriginColumnInJoin(assoc, originInfo, destinationInfo, joinAlias) {
  if (assoc.nature === 'manyToMany') {
    return `${joinAlias}.${singular(destinationInfo.model.attributes[assoc.via].attribute)}_${destinationInfo.model.attributes[assoc.via].column}`;
  }
  // manyWay
  return `${joinAlias}.${singular(originInfo.model.collectionName)}_${originInfo.model.primaryKey}`;
}

/**
 * Build column reference for many-to-many / many-way joins (destination side).
 */
function buildDestinationColumnInJoin(assoc, originInfo, destinationInfo, joinAlias) {
  return `${joinAlias}.${singular(originInfo.model.attributes[assoc.alias].attribute)}_${originInfo.model.attributes[assoc.alias].column}`;
}

/**
 * Add publicationState populate queries for each join node.
 * @param {Object} tree - Joins tree
 * @param {Object} qb - Query builder
 * @param {string|undefined} publicationState - Publication state filter
 */
function addPublicationStateQueries(tree, qb, publicationState) {
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
    addPublicationStateQueries(value, qb, publicationState);
  })(tree.joins);
}

/**
 * Build a sql where clause.
 * @param {Object} options
 * @param {Object} options.qb - Knex query builder
 * @param {string} options.field - Field path
 * @param {string} options.operator - Operator name
 * @param {*} options.value - Value to compare
 */
function buildWhereClause({ qb, field, operator, value }) {
  if (Array.isArray(value) && !['and', 'or', 'in', 'nin'].includes(operator)) {
    return qb.where(subQb => {
      value.forEach(val => {
        subQb.orWhere(q => buildWhereClause({ qb: q, field, operator, value: val }));
      });
    });
  }

  const handlers = {
    and: () => qb.where(andQb => {
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
    or: () => qb.where(orQb => {
      value.forEach(orClause => {
        orQb.orWhere(subQb => {
          if (Array.isArray(orClause)) {
            orClause.forEach(inner => subQb.where(andQb => buildWhereClause({ qb: andQb, ...inner })));
          } else {
            buildWhereClause({ qb: subQb, ...orClause });
          }
        });
      });
    }),
    eq: () => qb.where(field, value),
    ne: () => qb.where(field, '!=', value),
    lt: () => qb.where(field, '<', value),
    lte: () => qb.where(field, '<=', value),
    gt: () => qb.where(field, '>', value),
    gte: () => qb.where(field, '>=', value),
    in: () => qb.whereIn(field, Array.isArray(value) ? value : [value]),
    nin: () => qb.whereNotIn(field, Array.isArray(value) ? value : [value]),
    contains: () => qb.whereRaw(`${fieldLowerFn(qb)} LIKE LOWER(?)`, [field, `%${value}%`]),
    ncontains: () => qb.whereRaw(`${fieldLowerFn(qb)} NOT LIKE LOWER(?)`, [field, `%${value}%`]),
    containss: () => qb.where(field, 'like', `%${value}%`),
    ncontainss: () => qb.whereNot(field, 'like', `%${value}%`),
    null: () => (value ? qb.whereNull(field) : qb.whereNotNull(field)),
  };

  if (handlers[operator]) {
    return handlers[operator]();
  }

  throw new Error(`Unhandled whereClause : ${field} ${operator} ${value}`);
}

/**
 * Return the appropriate LOWER function string for the current client.
 * @param {Object} qb - Knex query builder
 */
function fieldLowerFn(qb) {
  return qb.client.config.client === 'pg' ? 'LOWER(CAST(?? AS VARCHAR))' : 'LOWER(??)';
}

/**
 * Find an association on a model by its alias.
 * @param {Object} model - Strapi model
 * @param {string} key - Association alias
 */
function findAssoc(model, key) {
  return model.associations.find(assoc => assoc.alias === key);
}

module.exports = buildQuery;