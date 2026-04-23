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
 * Build a bookshelf sort clause (simple or deep) based on a joins tree.
 * @param {Object} tree - The joins tree that contains the aliased associations
 * @returns {Function}
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

  const aliasGenerator = createAliasGenerator();

  const tree = {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
  };

  const aliasedWhereClauses = buildWhereClauses(whereClauses, { model, tree, aliasGenerator });
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  // Ensure joins for deep sort fields
  const sortFields = sortClauses.map(prop('field'));
  sortFields.forEach(field => generateNestedJoins(field, tree, aliasGenerator));

  // Build join statements recursively
  buildJoinsFromTree(qb, tree, aliasGenerator);

  // Add publication state queries for each join
  addPublicationStateQueries(tree, qb, filters.publicationState);

  return tree;
}

/**
 * Create a simple incremental alias generator.
 * @returns {Object} with generate method
 */
function createAliasGenerator() {
  const aliasMap = {};
  return {
    generate(name) {
      if (!aliasMap[name]) {
        aliasMap[name] = 1;
      }
      const alias = `${name}_${aliasMap[name]}`;
      aliasMap[name] += 1;
      return alias;
    },
  };
}

/**
 * Recursively build joins from a query tree.
 * @param {Object} qb - Knex query builder
 * @param {Object} queryTree - Current node in the joins tree
 * @param {Object} aliasGenerator - Alias generator instance
 */
function buildJoinsFromTree(qb, queryTree, aliasGenerator) {
  Object.keys(queryTree.joins).forEach(key => {
    const subTree = queryTree.joins[key];
    buildJoin(qb, subTree.assoc, queryTree, subTree, aliasGenerator);
    buildJoinsFromTree(qb, subTree, aliasGenerator);
  });
}

/**
 * Add a single join to the query builder.
 * @param {Object} qb - Knex query builder
 * @param {Object} assoc - Association metadata
 * @param {Object} originInfo - Origin node info
 * @param {Object} destinationInfo - Destination node info
 * @param {Object} aliasGenerator - Alias generator
 */
function buildJoin(qb, assoc, originInfo, destinationInfo, aliasGenerator) {
  if (['manyToMany', 'manyWay'].includes(assoc.nature)) {
    const joinTableAlias = aliasGenerator.generate(assoc.tableCollectionName);
    const originColumn = getOriginColumnInJoinTable(assoc, originInfo, destinationInfo, joinTableAlias);
    const destinationColumn = getDestinationColumnInJoinTable(assoc, originInfo, destinationInfo, joinTableAlias);

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
    const externalKey = assoc.type === 'collection'
      ? `${destinationInfo.alias}.${assoc.via || destinationInfo.model.primaryKey}`
      : `${destinationInfo.alias}.${destinationInfo.model.primaryKey}`;

    const internalKey = assoc.type === 'collection'
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
 * Resolve origin column name for many-to-many / many-way joins.
 */
function getOriginColumnInJoinTable(assoc, originInfo, destinationInfo, joinTableAlias) {
  if (assoc.nature === 'manyToMany') {
    const viaAttr = destinationInfo.model.attributes[assoc.via].attribute;
    const viaCol = destinationInfo.model.attributes[assoc.via].column;
    return `${joinTableAlias}.${singular(viaAttr)}_${viaCol}`;
  }
  // manyWay
  return `${joinTableAlias}.${singular(originInfo.model.collectionName)}_${originInfo.model.primaryKey}`;
}

/**
 * Resolve destination column name for many-to-many / many-way joins.
 */
function getDestinationColumnInJoinTable(assoc, originInfo, destinationInfo, joinTableAlias) {
  const attr = originInfo.model.attributes[assoc.alias].attribute;
  const col = originInfo.model.attributes[assoc.alias].column;
  return `${joinTableAlias}.${singular(attr)}_${col}`;
}

/**
 * Create a tree node for a model/association.
 * @param {Object} model - Strapi model
 * @param {Object|null} assoc - Association metadata
 * @param {Object} aliasGenerator - Alias generator
 * @returns {Object}
 */
function createTreeNode(model, assoc, aliasGenerator) {
  return {
    alias: aliasGenerator.generate(model.collectionName),
    assoc,
    model,
    joins: {},
  };
}

/**
 * Generate nested joins for a dotted field path.
 * @param {string} field - Field path (e.g., "author.profile.name")
 * @param {Object} tree - Current joins tree
 * @param {Object} aliasGenerator - Alias generator
 * @returns {string} SQL path with proper alias
 */
function generateNestedJoins(field, tree, aliasGenerator) {
  const [key, ...rest] = field.split('.');
  const assoc = findAssoc(tree.model, key);

  if (!assoc) {
    return `${tree.alias}.${key}`;
  }

  const assocModel = strapi.db.getModelByAssoc(assoc);
  const nextParts = rest.length ? rest : [assocModel.primaryKey];

  if (!tree.joins[key]) {
    tree.joins[key] = createTreeNode(assocModel, assoc, aliasGenerator);
  }

  return generateNestedJoins(nextParts.join('.'), tree.joins[key], aliasGenerator);
}

/**
 * Build where clauses with proper table aliases.
 * @param {Array} whereClauses - Original where clauses
 * @param {Object} context - Context containing model and tree
 * @returns {Array} Aliased where clauses
 */
function buildWhereClauses(whereClauses, { model, tree, aliasGenerator }) {
  return whereClauses.map(clause => {
    const { field, operator, value } = clause;

    if (BOOLEAN_OPERATORS.includes(operator)) {
      const nested = value.map(v => buildWhereClauses(v, { model, tree, aliasGenerator }));
      return { field, operator, value: nested };
    }

    const path = generateNestedJoins(field, tree, aliasGenerator);
    return { field: path, operator, value };
  });
}

/**
 * Recursively add publication state queries for each join node.
 * @param {Object} node - Current tree node
 * @param {Object} qb - Knex query builder
 * @param {string|undefined} publicationState - Publication state filter
 */
function addPublicationStateQueries(node, qb, publicationState) {
  if (!publicationState) return;

  const { alias, model } = node;
  runPopulateQueries(
    toQueries({
      publicationState: { query: publicationState, model, alias },
    }),
    qb
  );

  each(child => addPublicationStateQueries(child, qb, publicationState), node.joins);
}

/**
 * Build a sql where clause.
 * @param {Object} options - Options
 * @param {Object} options.qb - Knex query builder
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

  switch (operator) {
    case 'and':
      return qb.where(andQb => {
        value.forEach(andClause => {
          andQb.where(subQb => {
            if (Array.isArray(andClause)) {
              andClause.forEach(clause => subQb.where(inner => buildWhereClause({ qb: inner, ...clause })));
            } else {
              buildWhereClause({ qb: subQb, ...andClause });
            }
          });
        });
      });
    case 'or':
      return qb.where(orQb => {
        value.forEach(orClause => {
          orQb.orWhere(subQb => {
            if (Array.isArray(orClause)) {
              orClause.forEach(clause => subQb.where(inner => buildWhereClause({ qb: inner, ...clause })));
            } else {
              buildWhereClause({ qb: subQb, ...orClause });
            }
          });
        });
      });
    case 'eq':
      return qb.where(field, value);
    case 'ne':
      return qb.where(field, '!=', value);
    case 'lt':
      return qb.where(field, '<', value);
    case 'lte':
      return qb.where(field, '<=', value);
    case 'gt':
      return qb.where(field, '>', value);
    case 'gte':
      return qb.where(field, '>=', value);
    case 'in':
      return qb.whereIn(field, Array.isArray(value) ? value : [value]);
    case 'nin':
      return qb.whereNotIn(field, Array.isArray(value) ? value : [value]);
    case 'contains':
      return qb.whereRaw(`${fieldLowerFn(qb)} LIKE LOWER(?)`, [field, `%${value}%`]);
    case 'ncontains':
      return qb.whereRaw(`${fieldLowerFn(qb)} NOT LIKE LOWER(?)`, [field, `%${value}%`]);
    case 'containss':
      return qb.where(field, 'like', `%${value}%`);
    case 'ncontainss':
      return qb.whereNot(field, 'like', `%${value}%`);
    case 'null':
      return value ? qb.whereNull(field) : qb.whereNotNull(field);
    default:
      throw new Error(`Unhandled whereClause : ${field} ${operator} ${value}`);
  }
}

/**
 * Return appropriate LOWER function string based on client.
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