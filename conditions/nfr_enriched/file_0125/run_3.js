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

  applyDistinctIfNeeded(qb, filters, joinsTree);
  applySortIfNeeded(qb, filters, joinsTree);
  applyPaginationIfNeeded(qb, filters);
  applyPublicationStateIfNeeded(qb, filters);
};

/**
 * Apply DISTINCT clause if query requires it
 */
const applyDistinctIfNeeded = (qb, filters, joinsTree) => {
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
};

/**
 * Apply sorting to query if sort filters exist
 */
const applySortIfNeeded = (qb, filters, joinsTree) => {
  if (!_.has(filters, 'sort')) {
    return;
  }

  const clauses = filters.sort
    .map(buildSortClauseFromTree(joinsTree))
    .filter(c => !isEmpty(c));
  const orderBy = clauses.map(({ order, alias }) => ({ order, column: alias }));
  const orderColumns = clauses.map(({ alias, column }) => ({ [alias]: column }));
  const columns = [`${joinsTree.alias}.*`, ...orderColumns];

  qb.column(columns).orderBy(orderBy);
};

/**
 * Apply pagination (offset and limit) to query
 */
const applyPaginationIfNeeded = (qb, filters) => {
  if (_.has(filters, 'start')) {
    qb.offset(filters.start);
  }

  if (_.has(filters, 'limit') && filters.limit >= 0) {
    qb.limit(filters.limit);
  }
};

/**
 * Apply publication state filter if present
 */
const applyPublicationStateIfNeeded = (qb, filters) => {
  if (_.has(filters, 'publicationState')) {
    runPopulateQueries(
      toQueries({ publicationState: { query: filters.publicationState, model: filters.model } }),
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
    return buildSimpleSortClause(tree, field, order);
  }

  return buildNestedSortClause(tree, field, order);
};

/**
 * Build sort clause for simple (non-nested) field
 */
const buildSimpleSortClause = (tree, field, order) => {
  return {
    column: `${tree.alias}.${field}`,
    order,
    alias: `_strapi_tmp_${tree.alias}_${field}`,
  };
};

/**
 * Build sort clause for nested field with relation
 */
const buildNestedSortClause = (tree, field, order) => {
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
  const generateAlias = createAliasGenerator(aliasMap);

  const tree = {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
  };

  const generateNestedJoins = createNestedJoinsGenerator(tree, generateAlias);
  const buildJoin = createJoinBuilder(qb, generateAlias);
  const buildJoinsFromTree = createTreeJoinBuilder(qb, buildJoin);

  const aliasedWhereClauses = buildWhereClauses(whereClauses, { model, tree, generateNestedJoins });
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  // Force needed joins for deep sort clauses
  sortClauses.map(prop('field')).forEach(field => generateNestedJoins(field, tree));

  buildJoinsFromTree(qb, tree);
  addFiltersQueriesToJoinTree(qb, tree, filters);

  return tree;
};

/**
 * Create an alias generator function with internal state
 */
const createAliasGenerator = aliasMap => name => {
  if (!aliasMap[name]) {
    aliasMap[name] = 1;
  }

  const alias = `${name}_${aliasMap[name]}`;
  aliasMap[name] += 1;
  return alias;
};

/**
 * Create a tree node for joins structure
 */
const createTreeNode = (model, assoc, generateAlias) => {
  return {
    alias: generateAlias(model.collectionName),
    assoc,
    model,
    joins: {},
  };
};

/**
 * Create nested joins generator function
 */
const createNestedJoinsGenerator = (tree, generateAlias) => {
  return function generateNestedJoins(field, currentTree) {
    let [key, ...parts] = field.split('.');

    const assoc = findAssoc(currentTree.model, key);
    if (!assoc) {
      return `${currentTree.alias}.${key}`;
    }

    const assocModel = strapi.db.getModelByAssoc(assoc);

    if (parts.length === 0) {
      parts = [assocModel.primaryKey];
    }

    if (!currentTree.joins[key]) {
      currentTree.joins[key] = createTreeNode(assocModel, assoc, generateAlias);
    }

    return generateNestedJoins(parts.join('.'), currentTree.joins[key]);
  };
};

/**
 * Create join builder function
 */
const createJoinBuilder = (qb, generateAlias) => {
  return (assoc, originInfo, destinationInfo) => {
    if (['manyToMany', 'manyWay'].includes(assoc.nature)) {
      buildManyToManyJoin(qb, assoc, originInfo, destinationInfo, generateAlias);
    } else {
      buildOneToManyJoin(qb, assoc, originInfo, destinationInfo);
    }
  };
};

/**
 * Build many-to-many or many-way join
 */
const buildManyToManyJoin = (qb, assoc, originInfo, destinationInfo, generateAlias) => {
  const joinTableAlias = generateAlias(assoc.tableCollectionName);

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
 * Build one-to-many join
 */
const buildOneToManyJoin = (qb, assoc, originInfo, destinationInfo) => {
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
 * Create tree join builder function
 */
const createTreeJoinBuilder = (qb, buildJoin) => {
  return function buildJoinsFromTree(queryTree) {
    Object.keys(queryTree.joins).forEach(key => {
      const subQueryTree = queryTree.joins[key];
      buildJoin(subQueryTree.assoc, queryTree, subQueryTree);
      buildJoinsFromTree(subQueryTree);
    });
  };
};

/**
 * Format where clauses with the right table name aliases
 */
const buildWhereClauses = (whereClauses, { model, tree, generateNestedJoins }) => {
  return whereClauses.map(whereClause => {
    const { field, operator, value } = whereClause;

    if (BOOLEAN_OPERATORS.includes(operator)) {
      return {
        field,
        operator,
        value: value.map(v => buildWhereClauses(v, { model, tree, generateNestedJoins })),
      };
    }

    const path = generateNestedJoins(field, tree);

    return {
      field: path,
      operator,
      value,
    };
  });
};

/**
 * Add queries on tree's joins (deep search, deep sort) based on given filters
 */
const addFiltersQueriesToJoinTree = (qb, tree, filters) => {
  _.each(tree.joins, value => {
    const { alias, model } = value;

    runPopulateQueries(
      toQueries({
        publicationState: { query: filters.publicationState, model, alias },
      }),
      qb
    );

    addFiltersQueriesToJoinTree(qb, value, filters);
  });
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
    return buildArrayWhereClause(qb, field, operator, value);
  }

  return buildOperatorWhereClause(qb, field, operator, value);
};

/**
 * Build where clause for array values
 */
const buildArrayWhereClause = (qb, field, operator, value) => {
  return qb.where(subQb => {
    for (let val of value) {
      subQb.orWhere(q => buildWhereClause({ qb: q, field, operator, value: val }));
    }
  });
};

/**
 * Build where clause based on operator type
 */
const buildOperatorWhereClause = (qb, field, operator, value) => {
  switch (operator) {
    case 'and':
      return buildAndWhereClause(qb, field, value);
    case 'or':
      return buildOrWhereClause(qb, field, value);
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
      return buildContainsWhereClause(qb, field, value, true);
    case 'ncontains':
      return buildContainsWhereClause(qb, field, value, false);
    case 'containss':
      return qb.where(field, 'like', `%${value}%`);
    case 'ncontainss':
      return qb.whereNot(field, 'like', `%${value}%`);
    case 'null':
      return value ? qb.whereNull(field) : qb.whereNotNull(field);
    default:
      throw new Error(`Unhandled whereClause : ${field} ${operator} ${value}`);
  }
};

/**
 * Build AND where clause
 */
const buildAndWhereClause = (qb, field, value) => {
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
};

/**
 * Build OR where clause
 */
const buildOrWhereClause =