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
const applySort = (qb, sortClauses, joinsTree) => {
  const clauses = sortClauses
    .map(buildSortClauseFromTree(joinsTree))
    .filter(c => !isEmpty(c));

  const orderBy = clauses.map(({ order, alias }) => ({ order, column: alias }));
  const orderColumns = clauses.map(({ alias, column }) => ({ [alias]: column }));
  const columns = [`${joinsTree.alias}.*`, ...orderColumns];

  qb.column(columns).orderBy(orderBy);
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
 * @returns {Object} joins tree
 */
const buildJoinsAndFilter = (qb, model, filters) => {
  const { where: whereClauses = [], sort: sortClauses = [] } = filters;

  const aliasGenerator = createAliasGenerator();

  const tree = {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
  };

  const aliasedWhereClauses = buildWhereClauses(whereClauses, { model, tree, aliasGenerator });
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  // Ensure joins for deep sort
  each(field => generateNestedJoins(field, tree, aliasGenerator), sortClauses.map(prop('field')));

  const rootQueryTree = createTreeNode(model);
  buildJoinsFromTree(qb, rootQueryTree);
  addFiltersQueriesToJoinTree(rootQueryTree, qb, filters);

  return rootQueryTree;
};

/**
 * Creates a simple incremental alias generator.
 * @returns {Function} generateAlias(name)
 */
const createAliasGenerator = () => {
  const aliasMap = {};
  return name => {
    if (!aliasMap[name]) {
      aliasMap[name] = 1;
    }
    const alias = `${name}_${aliasMap[name]}`;
    aliasMap[name] += 1;
    return alias;
  };
};

/**
 * Recursively build joins from a query tree.
 * @param {Object} qb - Knex query builder
 * @param {Object} queryTree - Current node of the query tree
 */
const buildJoinsFromTree = (qb, queryTree) => {
  Object.keys(queryTree.joins).forEach(key => {
    const subTree = queryTree.joins[key];
    buildJoin(qb, subTree.assoc, queryTree, subTree);
    buildJoinsFromTree(qb, subTree);
  });
};

/**
 * Add a single join to the query builder.
 * @param {Object} qb - Knex query builder
 * @param {Object} assoc - Association definition
 * @param {Object} originInfo - Origin node info
 * @param {Object} destinationInfo - Destination node info
 */
const buildJoin = (qb, assoc, originInfo, destinationInfo) => {
  if (['manyToMany', 'manyWay'].includes(assoc.nature)) {
    const joinTableAlias = generateAliasFor(assoc.tableCollectionName, originInfo, destinationInfo);
    const originColumn = getOriginColumnInJoin(assoc, originInfo, destinationInfo, joinTableAlias);
    const destinationColumn = getDestinationColumnInJoin(assoc, originInfo, destinationInfo, joinTableAlias);

    qb.leftJoin(
      `${originInfo.model.databaseName}.${assoc.tableCollectionName} AS ${joinTableAlias}`,
      originColumn,
      `${originInfo.alias}.${originInfo.model.primaryKey}`
    );

    qb.leftJoin(
      `${destinationInfo.model.databaseName}.${destinationInfo.model.collectionName} AS ${destinationInfo.alias}`,
      destinationColumn,
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
 * Helper to generate alias for many-to-many join tables.
 */
const generateAliasFor = (tableName, originInfo, destinationInfo) => {
  const generateAlias = createAliasGenerator();
  return generateAlias(tableName);
};

/**
 * Resolve origin column name for many-to-many joins.
 */
const getOriginColumnInJoin = (assoc, originInfo, destinationInfo, joinAlias) => {
  if (assoc.nature === 'manyToMany') {
    const viaAttr = destinationInfo.model.attributes[assoc.via].attribute;
    const viaCol = destinationInfo.model.attributes[assoc.via].column;
    return `${joinAlias}.${singular(viaAttr)}_${viaCol}`;
  }
  // manyWay
  return `${joinAlias}.${singular(originInfo.model.collectionName)}_${originInfo.model.primaryKey}`;
};

/**
 * Resolve destination column name for many-to-many joins.
 */
const getDestinationColumnInJoin = (assoc, originInfo, destinationInfo, joinAlias) => {
  const attr = originInfo.model.attributes[assoc.alias].attribute;
  const col = originInfo.model.attributes[assoc.alias].column;
  return `${joinAlias}.${singular(attr)}_${col}`;
};

/**
 * Create a tree node for a model/association.
 * @param {Object} model - Strapi model
 * @param {Object} assoc - Optional association
 * @param {Function} generateAlias - Alias generator
 * @returns {Object} tree node
 */
const createTreeNode = (model, assoc = null, generateAlias = createAliasGenerator()) => ({
  alias: generateAlias(model.collectionName),
  assoc,
  model,
  joins: {},
});

/**
 * Generate nested joins for a dotted field path.
 * @param {string} field - Field path (e.g., "author.profile.name")
 * @param {Object} tree - Current joins tree
 * @param {Function} generateAlias - Alias generator
 * @returns {string} SQL path for the field
 */
const generateNestedJoins = (field, tree, generateAlias) => {
  const [key, ...rest] = field.split('.');
  const assoc = findAssoc(tree.model, key);

  if (!assoc) {
    return `${tree.alias}.${key}`;
  }

  const assocModel = strapi.db.getModelByAssoc(assoc);
  const remaining = rest.length ? rest : [assocModel.primaryKey];

  if (!tree.joins[key]) {
    tree.joins[key] = createTreeNode(assocModel, assoc, generateAlias);
  }

  return generateNestedJoins(remaining.join('.'), tree.joins[key], generateAlias);
};

/**
 * Build where clauses with proper table aliases.
 * @param {Array} whereClauses - Raw where clauses
 * @param {Object} context - Context containing model and tree
 * @returns {Array} Aliased where clauses
 */
const buildWhereClauses = (whereClauses, { model, tree, aliasGenerator }) => {
  return whereClauses.map(clause => {
    const { field, operator, value } = clause;

    if (BOOLEAN_OPERATORS.includes(operator)) {
      return {
        field,
        operator,
        value: value.map(v => buildWhereClauses(v, { model, tree, aliasGenerator })),
      };
    }

    const path = generateNestedJoins(field, tree, aliasGenerator);
    return { field: path, operator, value };
  });
};

/**
 * Recursively add populate queries for each join node.
 * @param {Object} node - Current tree node
 * @param {Object} qb - Knex query builder
 * @param {Object} filters - Original filters
 */
const addFiltersQueriesToJoinTree = (node, qb, filters) => {
  each(value => {
    const { alias, model } = value;
    runPopulateQueries(
      toQueries({
        publicationState: { query: filters.publicationState, model, alias },
      }),
      qb
    );
    addFiltersQueriesToJoinTree(value, qb, filters);
  }, node.joins);
};

/**
 * Build a SQL where clause.
 * @param {Object} options - Clause options
 */
const buildWhereClause = ({ qb, field, operator, value }) => {
  if (Array.isArray(value) && !['and', 'or', 'in', 'nin'].includes(operator)) {
    return handleArrayValue(qb, field, operator, value);
  }

  const handlers = {
    and: () => handleLogical(qb, value, 'and', subQb => subQb.where),
    or: () => handleLogical(qb, value, 'or', subQb => subQb.orWhere),
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

  const handler = handlers[operator];
  if (handler) {
    return handler();
  }

  throw new Error(`Unhandled whereClause : ${field} ${operator} ${value}`);
};

/**
 * Handle array values for non-boolean operators.
 */
const handleArrayValue = (qb, field, operator, values) => {
  return qb.where(subQb => {
    values.forEach(val => {
      subQb.orWhere(q => buildWhereClause({ qb: q, field, operator, value: val }));
    });
  });
};

/**
 * Handle logical operators ('and' / 'or') recursively.
 */
const handleLogical = (qb, clauses, type, whereFn) => {
  return qb.where(logicQb => {
    clauses.forEach(clause => {
      logicQb.where(subQb => {
        if (Array.isArray(clause)) {
          clause.forEach(inner => {
            whereFn(subQb)(innerQb => buildWhereClause({ qb: innerQb, ...inner }));
          });
        } else {
          whereFn(subQb)(innerQb => buildWhereClause({ qb: innerQb, ...clause }));
        }
      });
    });
  });
};

/**
 * Return the appropriate LOWER function string for the client.
 */
const fieldLowerFn = qb => {
  return qb.client.config.client === 'pg' ? 'LOWER(CAST(?? AS VARCHAR))' : 'LOWER(??)';
};

const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

module.exports = buildQuery;