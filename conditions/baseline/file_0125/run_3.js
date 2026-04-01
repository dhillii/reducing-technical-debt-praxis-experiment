```javascript
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
    applySortClauses(qb, filters.sort, joinsTree);
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
 * Apply sort clauses to query builder
 * @param {Object} qb - Knex query builder
 * @param {Array} sortClauses - Sort clauses
 * @param {Object} joinsTree - Joins tree
 */
const applySortClauses = (qb, sortClauses, joinsTree) => {
  const clauses = sortClauses.map(buildSortClauseFromTree(joinsTree)).filter(c => !isEmpty(c));
  const orderBy = clauses.map(({ order, alias }) => ({ order, column: alias }));
  const orderColumns = clauses.map(({ alias, column }) => ({ [alias]: column }));
  const columns = [`${joinsTree.alias}.*`, ...orderColumns];

  qb.column(columns).orderBy(orderBy);
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
 * Returns an alias for a name (simple incremental alias name)
 * @param {Object} aliasMap - Map to track aliases
 * @param {string} name - name to alias
 */
const generateAlias = (aliasMap, name) => {
  if (!aliasMap[name]) {
    aliasMap[name] = 1;
  }

  const alias = `${name}_${aliasMap[name]}`;
  aliasMap[name] += 1;
  return alias;
};

/**
 * Create a query tree node from a key an assoc and a model
 * @param {Object} model - Strapi model
 * @param {Object} assoc - Strapi association
 * @param {Object} aliasMap - Alias map
 */
const createTreeNode = (model, assoc, aliasMap) => {
  return {
    alias: generateAlias(aliasMap, model.collectionName),
    assoc,
    model,
    joins: {},
  };
};

/**
 * Add table joins for many-to-many and many-way associations
 * @param {Object} qb - Knex query builder
 * @param {Object} assoc - Association info
 * @param {Object} originInfo - Origin info
 * @param {Object} destinationInfo - Destination info
 * @param {Function} generateAliasFn - Function to generate aliases
 */
const buildManyToManyJoin = (qb, assoc, originInfo, destinationInfo, generateAliasFn) => {
  const joinTableAlias = generateAliasFn(assoc.tableCollectionName);

  let originColumnNameInJoinTable;
  if (assoc.nature === 'manyToMany') {
    originColumnNameInJoinTable = `${joinTableAlias}.${singular(
      destinationInfo.model.attributes[assoc.via].attribute
    )}_${destinationInfo.model.attributes[assoc.via].column}`;
  } else if (assoc.nature === 'manyWay') {
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
};

/**
 * Add table joins for one-to-many and one-to-one associations
 * @param {Object} qb - Knex query builder
 * @param {Object} assoc - Association info
 * @param {Object} originInfo - Origin info
 * @param {Object} destinationInfo - Destination info
 */
const buildSimpleJoin = (qb, assoc, originInfo, destinationInfo) => {
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
};

/**
 * Add table joins
 * @param {Object} qb - Knex query builder
 * @param {Object} assoc - Models association info
 * @param {Object} originInfo - origin from which you are making a join
 * @param {Object} destinationInfo - destination with which we are making a join
 * @param {Function} generateAliasFn - Function to generate aliases
 */
const buildJoin = (qb, assoc, originInfo, destinationInfo, generateAliasFn) => {
  if (['manyToMany', 'manyWay'].includes(assoc.nature)) {
    buildManyToManyJoin(qb, assoc, originInfo, destinationInfo, generateAliasFn);
  } else {
    buildSimpleJoin(qb, assoc, originInfo, destinationInfo);
  }
};

/**
 * Build query joins from tree recursively
 * @param {Object} qb - Knex query builder
 * @param {Object} queryTree - Query tree
 * @param {Function} generateAliasFn - Function to generate aliases
 */
const buildJoinsFromTree = (qb, queryTree, generateAliasFn) => {
  Object.keys(queryTree.joins).forEach(key => {
    const subQueryTree = queryTree.joins[key];
    buildJoin(qb, subQueryTree.assoc, queryTree, subQueryTree, generateAliasFn);
    buildJoinsFromTree(qb, subQueryTree, generateAliasFn);
  });
};

/**
 * Returns the SQL path for a query field.
 * Adds table to the joins tree
 * @param {string} field - A field used to filter
 * @param {Object} tree - Joins tree
 * @param {Function} generateAliasFn - Function to generate aliases
 */
const generateNestedJoins = (field, tree, generateAliasFn) => {
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
    tree.joins[key] = createTreeNode(assocModel, assoc, generateAliasFn);
  }

  return generateNestedJoins(parts.join('.'), tree.joins[key], generateAliasFn);
};

/**
 * Format where clauses with the right table name aliases.
 * Add table joins to the joins list
 * @param {Array<{field, operator, value}>} whereClauses - List of where clauses
 * @param {Object} context - Context object
 * @param {Object} context.model - Model on which the query is run
 * @param {Object} context.tree - Joins tree
 * @param {Function} context.generateAliasFn - Function to generate aliases
 */
const buildWhereClauses = (whereClauses, { model, tree, generateAliasFn }) => {
  return whereClauses.map(whereClause => {
    const { field, operator, value } = whereClause;

    if (BOOLEAN_OPERATORS.includes(operator)) {
      return {
        field,
        operator,
        value: value.map(v => buildWhereClauses(v, { model, tree, generateAliasFn })),
      };
    }

    const path = generateNestedJoins(field, tree, generateAliasFn);

    return {
      field: path,
      operator,
      value,
    };
  });
};

/**
 * Add queries on tree's joins based on given filters
 * @param {Object} tree - Joins tree
 * @param {Object} qb - Knex query builder
 * @param {Object} filters - Filters object
 */
const addFiltersQueriesToJoinTree = (tree, qb, filters) => {
  _.each(tree.joins, value => {
    const { alias, model } = value;

    runPopulateQueries(
      toQueries({
        publicationState: { query: filters.publicationState, model, alias },
      }),
      qb
    );

    addFiltersQueriesToJoinTree(value, qb, filters);
  });
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

  const generateAliasFn = name => generateAlias(aliasMap, name);

  const tree = {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
  };

  const aliasedWhereClauses = buildWhereClauses(whereClauses, {
    model,
    tree,
    generateAliasFn,
  });
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  sortClauses.forEach(sortClause => {
    generateNestedJoins(sortClause.field, tree, generateAliasFn);
  });

  buildJoinsFromTree(qb, tree, generateAliasFn);
  addFiltersQueriesToJoinTree(tree, qb, filters);

  return tree;
};

/**
 * Builds a sql where clause
 * @param {Object} options - Options
 * @param {Object} options.qb - Bookshelf (knex) query builder
 * @param {Object} options.field - Filtered field
 * @param {Object} options.operator - Filter operator (=,in,not eq etc..)
 * @param {Object} options.value - Filter value
 */
const buildWhereClause = ({ qb, field, operator, value }) => {
  if (Array.isArray(value) && !['and', 'or', 'in', 'nin'].includes(operator)) {
    return qb.where(subQb => {
      for (let val of value) {
        subQb.orWhere(q => buildWhereClause({ qb: q, field, operator, value: val }));
      }
    });
  }

  switch (operator) {
    case 'and':
      return buildAndClause(qb, value);
    case 'or':
      return buildOrClause(qb, value);
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
    case 'null': {
      return value ? qb.whereNull(field) : qb.whereNotNull(field);
    }

    default:
      throw new Error(`Unhandled whereClause : ${field} ${operator} ${value}`);
  }
};

/**