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
  const hasWhereFilters =
    _.has(filters, 'where') && Array.isArray(filters.where) && filters.where.length > 0;

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
 * @param tree - The joins tree that contains the aliased associations
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
  const generateAlias = name => {
    if (!aliasMap[name]) {
      aliasMap[name] = 1;
    }
    const alias = `${name}_${aliasMap[name]}`;
    aliasMap[name] += 1;
    return alias;
  };

  const createTreeNode = (model, assoc = null) => ({
    alias: generateAlias(model.collectionName),
    assoc,
    model,
    joins: {},
  });

  const tree = createTreeNode(model, null);

  const generateNestedJoins = (field, currentTree) => {
    const [key, ...parts] = field.split('.');
    const assoc = findAssoc(currentTree.model, key);

    if (!assoc) {
      return `${currentTree.alias}.${key}`;
    }

    const assocModel = strapi.db.getModelByAssoc(assoc);
    if (parts.length === 0) {
      parts.push(assocModel.primaryKey);
    }

    if (!currentTree.joins[key]) {
      currentTree.joins[key] = createTreeNode(assocModel, assoc);
    }

    return generateNestedJoins(parts.join('.'), currentTree.joins[key]);
  };

  const generateNestedJoinsFromFields = each(field => generateNestedJoins(field, tree));
  const aliasedWhereClauses = buildAndFormatWhereClauses(whereClauses, { model, tree, generateNestedJoins });

  aliasedWhereClauses.forEach(whereClause => buildWhereClause({ qb, ...whereClause }));

  generateNestedJoinsFromFields(sortClauses.map(prop('field')));
  buildAllJoins(qb, tree);
  addFiltersQueriesToJoins(qb, tree, filters);

  return tree;
};

/**
 * Recursively adds joins from query tree
 * @param {Object} qb - Knex query builder
 * @param {Object} tree - Query tree node
 */
const buildAllJoins = (qb, tree) => {
  Object.keys(tree.joins).forEach(key => {
    const subTree = tree.joins[key];
    buildJoin(qb, subTree.assoc, tree, subTree);
    buildAllJoins(qb, subTree);
  });
};

/**
 * Adds filters (e.g. publicationState) to joined queries
 * @param {Object}qb - Knex query builder
 * @param {Object} tree - Query tree node
 * @param {Object} filters - Query filters
 */
const addFiltersQueriesToJoins = (qb, tree, filters) => {
  _.each(tree.joins, value => {
    const { alias, model } = value;
    runPopulateQueries(
      toQueries({ publicationState: { query: filters.publicationState, model, alias } }),
      qb
    );
    addFiltersQueriesToJoins(qb, value, filters);
  });
};

/**
 * Add a join clause to query builder
 * @param {Object} qb - Knex query builder
 * @param {Object} assoc - Strapi association info
 * @param {Object} originInfo - Origin tree node
 * @param {Object} destinationInfo - Destination tree node
 */
const buildJoin = (qb, assoc, originInfo, destinationInfo) => {
  if (['manyToMany', 'manyWay'].includes(assoc.nature)) {
    const joinTableAlias = generateAliasForJoinTable(assoc, originInfo, destinationInfo);

    const originFK = buildOriginForeignKeyColumn(joinTableAlias, assoc, originInfo, destinationInfo);
    const destFK = buildDestinationForeignKeyColumn(joinTableAlias, assoc, originInfo, destinationInfo);

    qb.leftJoin(
      `${originInfo.model.databaseName}.${assoc.tableCollectionName} AS ${joinTableAlias}`,
      originFK,
      `${originInfo.alias}.${originInfo.model.primaryKey}`
    );

    qb.leftJoin(
      `${destinationInfo.model.databaseName}.${destinationInfo.model.collectionName} AS ${destinationInfo.alias}`,
      destFK,
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
};

/**
 * Generates alias for join table
 * @param {Object} assoc - Association info
 * @param {Object} originInfo - Origin node
 * @param {Object} destinationInfo - Destination node
 * @returns {string} Join table alias
 */
const generateAliasForJoinTable = (assoc, originInfo, destinationInfo) => {
  return singular(
    assoc.nature === 'manyToMany'
      ? destinationInfo.model.attributes[assoc.via].attribute
      : originInfo.model.collectionName
  );
};

/**
 * Builds origin foreign key column with alias
 * @param {string} joinTableAlias - Join table alias
 * @param {Object} assoc - Association info
 * @param {Object} originInfo - Origin node
 * @param {Object} destinationInfo - Destination node
 * @returns {string} Origin foreign key column
 */
const buildOriginForeignKeyColumn = (joinTableAlias, assoc, originInfo, destinationInfo) => {
  const fkName = assoc.nature === 'manyToMany'
    ? singular(destinationInfo.model.attributes[assoc.via].attribute) +
      '_' + destinationInfo.model.attributes[assoc.via].column
    : singular(originInfo.model.collectionName) + '_' + originInfo.model.primaryKey;

  return `${joinTableAlias}.${fkName}`;
};

/**
 * Builds destination foreign key column with alias
 * @param {string} joinTableAlias - Join table alias
 * @param {Object} assoc - Association info
 * @param {Object} originInfo - Origin node
 * @param {Object} destinationInfo - Destination node
 * @returns {string} Destination foreign key column
 */
const buildDestinationForeignKeyColumn = (joinTableAlias, assoc, originInfo, destinationInfo) => {
  const fkName = singular(originInfo.model.attributes[assoc.alias].attribute) +
    '_' + originInfo.model.attributes[assoc.alias].column;

  return `${joinTableAlias}.${fkName}`;
};

/**
 * Format where clauses and replace nested paths with joined table aliases
 * @param {Array<{field, operator, value}>} whereClauses - Array of raw where clauses
 * @param {Object} context - Build context
 * @param {Object} context.model - Current model
 * @param {Object} context.tree - Joins tree
 * @param {Function} context.generateNestedJoins - Function generating nested joins
 * @returns {Array<{field, operator, value}>} Formatted where clauses
 */
const buildAndFormatWhereClauses = (whereClauses, { model, tree, generateNestedJoins }) => {
  return whereClauses.map(whereClause => {
    const { field, operator, value } = whereClause;

    if (BOOLEAN_OPERATORS.includes(operator)) {
      return {
        field,
        operator,
        value: value.map(subClause => buildAndFormatWhereClauses(subClause, { model, tree, generateNestedJoins }))
      };
    }

    const path = generateNestedJoins(field, tree);
    return { field: path, operator, value };
  });
};

/**
 * Builds SQL where clause with operator handling
 * @param {Object} options - Options
 * @param {Object} options.qb - Knex query builder
 * @param {string} options.field - Field path
 * @param {string} options.operator - SQL operator
 * @param {any} options.value - Value to compare with
 * @returns {Object} Query builder instance
 */
const buildWhereClause = ({ qb, field, operator, value }) => {
  // Handling OR-based value disjunctions
  if (Array.isArray(value) && !['and', 'or', 'in', 'nin'].includes(operator)) {
    return handleArrayValueDisjunction({ qb, field, operator, value });
  }

  switch (operator) {
    case 'and':
      return buildAndClause({ qb, value });
    case 'or':
      return buildOrClause({ qb, value });
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
      return qb.whereRaw(`${fieldLowerFn(qb)} LIKE LOWER(?)`, [`%${value}%`]);
    case 'ncontains':
      return qb.whereRaw(`${fieldLowerFn(qb)} NOT LIKE LOWER(?)`, [`%${value}%`]);
    case 'containss':
      return qb.where(field, 'like', `%${value}%`);
    case 'ncontainss':
      return qb.where_not('like', field, `%${value}%`);
    case 'null':
      return value ? qb.whereNull(field) : qb.whereNotNull(field);
    default:
      throw new Error(`Unhandled whereClause : ${field} ${operator} ${value}`);
  }
};

/**
 * Handles array values when operator doesn't support arrays directly (i.e., uses OR logic)
 * @param {Object} options - Options
 * @param {Object} options.qb - Knex query builder
 * @param {string} options.field - Field path
 * @param {string} options.operator - SQL operator
 * @param {Array<any>} options.value - Array of values
 * @returns {Object} Query builder instance
 */
const handleArrayValueDisjunction = ({ qb, field, operator, value }) => {
  return qb.where(subQb => {
    value.forEach(val => {
      subQb.orWhere(q => buildWhereClause({ qb: q, field, operator, value: val }));
    });
  });
};

/**
 * Builds AND clause from array of sub-clauses
 * @param {Object} options - Options
 * @param {Object} options.qb - Knex query builder
 * @param {Array<*>} options.value - Sub-clauses
 * @returns {Object} Query builder instance
 */
const buildAndClause = ({ qb, value }) => {
  return qb.where(andQb => {
    value.forEach(andClause => {
      buildSubClause({ qb: andQb, clause: andClause, builderMethod: 'where' });
    });
  });
};

/**
 * Builds OR clause from array of sub-clauses
 * @param {Object} options - Options
 * @param {Object} options.qb - Knex query builder
 * @param {Array<*>} options.value - Sub-clauses
 * @returns {Object} Query builder instance
 */
const buildOrClause = ({ qb, value }) => {
  return qb.where(orQb => {
    value.forEach(orClause => {
      buildSubClause({ qb: orQb, clause: orClause, builderMethod: 'orWhere' });
    });
  });
};

/**
 * Builds sub-clauses considering nested arrays and leaf conditions
 * @param {Object} options - Options
 * @param {Object} options.qb - Knex query builder
 * @param {Object|Array} options.clause - Clause or array of clauses
 * @param {string} options.builderMethod - Method name for query builder ('where' or 'orWhere')
 */
const buildSubClause = ({ qb, clause, builderMethod }) => {
  if (Array.isArray(clause)) {
    clause.forEach(subClause => buildSubClause({ qb, clause: subClause, builderMethod }));
  } else {
    qb[builderMethod](subQb => buildWhereClause({ qb: subQb, ...clause }));
  }
};

/**
 * Returns PostgreSQL-compatible LOWER() expression or default one
 * @param {Object} qb - Knex query builder instance
 * @returns {string} LOWER() expression with cast if needed
 */
const fieldLowerFn = qb => {
  if (qb.client.config.client === 'pg') {
    return 'LOWER(CAST(?? AS VARCHAR))';
  }
  return 'LOWER(??)';
};

/**
 * Finds an association by alias in a model
 * @param {Object} model - Strapi model
 * @param {string} key - Association alias to find
 * @returns {Object|null} Found association object, or null
 */
const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

module.exports = buildQuery;