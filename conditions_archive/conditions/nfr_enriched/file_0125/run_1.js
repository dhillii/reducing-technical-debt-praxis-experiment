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
      toQueries({ publicationState: { query: filters.publicationState, model: null } }),
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
  const tree = createRootTreeNode(model);

  const aliasedWhereClauses = buildWhereClauses(whereClauses, { model, tree, generateAlias });
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  // Force needed joins for deep sort clauses
  const sortFields = sortClauses.map(prop('field'));
  sortFields.forEach(field => generateNestedJoins(field, tree, generateAlias));

  buildJoinsFromTree(qb, tree, generateAlias);
  addFiltersQueriesToJoinTree(tree, qb, filters);

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
 * Create root tree node for the main model
 */
const createRootTreeNode = model => {
  return {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
  };
};

/**
 * Create a query tree node from a model and association
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
 * Build query joins from tree structure
 */
const buildJoinsFromTree = (qb, queryTree, generateAlias) => {
  Object.keys(queryTree.joins).forEach(key => {
    const subQueryTree = queryTree.joins[key];
    buildJoin(qb, subQueryTree.assoc, queryTree, subQueryTree);
    buildJoinsFromTree(qb, subQueryTree, generateAlias);
  });
};

/**
 * Add table joins for associations
 */
const buildJoin = (qb, assoc, originInfo, destinationInfo) => {
  if (['manyToMany', 'manyWay'].includes(assoc.nature)) {
    buildManyToManyJoin(qb, assoc, originInfo, destinationInfo);
  } else {
    buildOneToManyJoin(qb, assoc, originInfo, destinationInfo);
  }
};

/**
 * Build join for many-to-many or many-way associations
 */
const buildManyToManyJoin = (qb, assoc, originInfo, destinationInfo) => {
  const joinTableAlias = `${assoc.tableCollectionName}_${Date.now()}`;

  const originColumnNameInJoinTable = buildOriginColumnNameInJoinTable(
    assoc,
    joinTableAlias,
    originInfo,
    destinationInfo
  );

  qb.leftJoin(
    `${originInfo.model.databaseName}.${assoc.tableCollectionName} AS ${joinTableAlias}`,
    originColumnNameInJoinTable,
    `${originInfo.alias}.${originInfo.model.primaryKey}`
  );

  const destinationColumnInJoinTable = buildDestinationColumnInJoinTable(
    assoc,
    joinTableAlias,
    originInfo
  );

  qb.leftJoin(
    `${destinationInfo.model.databaseName}.${destinationInfo.model.collectionName} AS ${destinationInfo.alias}`,
    destinationColumnInJoinTable,
    `${destinationInfo.alias}.${destinationInfo.model.primaryKey}`
  );
};

/**
 * Build origin column reference in join table
 */
const buildOriginColumnNameInJoinTable = (assoc, joinTableAlias, originInfo, destinationInfo) => {
  if (assoc.nature === 'manyToMany') {
    return `${joinTableAlias}.${singular(
      destinationInfo.model.attributes[assoc.via].attribute
    )}_${destinationInfo.model.attributes[assoc.via].column}`;
  }
  
  return `${joinTableAlias}.${singular(originInfo.model.collectionName)}_${
    originInfo.model.primaryKey
  }`;
};

/**
 * Build destination column reference in join table
 */
const buildDestinationColumnInJoinTable = (assoc, joinTableAlias, originInfo) => {
  return `${joinTableAlias}.${singular(originInfo.model.attributes[assoc.alias].attribute)}_${
    originInfo.model.attributes[assoc.alias].column
  }`;
};

/**
 * Build join for one-to-many associations
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
 * Returns the SQL path for a query field.
 * Adds table to the joins tree
 */
const generateNestedJoins = (field, tree, generateAlias) => {
  let [key, ...parts] = field.split('.');

  const assoc = findAssoc(tree.model, key);
  
  // if the key is an attribute add as where clause
  if (!assoc) {
    return `${tree.alias}.${key}`;
  }

  const assocModel = strapi.db.getModelByAssoc(assoc);

  // if the last part of the path is an association
  // add the primary key of the model to the parts
  if (parts.length === 0) {
    parts = [assocModel.primaryKey];
  }

  // init sub query tree
  if (!tree.joins[key]) {
    tree.joins[key] = createTreeNode(assocModel, assoc, generateAlias);
  }

  return generateNestedJoins(parts.join('.'), tree.joins[key], generateAlias);
};

/**
 * Format every where clause with the right table name aliases.
 * Add table joins to the joins list
 */
const buildWhereClauses = (whereClauses, { model, tree, generateAlias }) => {
  return whereClauses.map(whereClause => {
    const { field, operator, value } = whereClause;

    if (BOOLEAN_OPERATORS.includes(operator)) {
      return {
        field,
        operator,
        value: value.map(v => buildWhereClauses(v, { model, tree, generateAlias })),
      };
    }

    const path = generateNestedJoins(field, tree, generateAlias);

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
const addFiltersQueriesToJoinTree = (tree, qb, filters) => {
  _.each(tree.joins, value => {
    const { alias, model } = value;

    // PublicationState
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
 * Build where clause for array values with OR logic
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
const buildOrWhereClause = (qb, field, value) => {
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
};

/**
 * Get the appropriate LOWER function for the database client
 */
const fieldLowerFn = qb => {
  // Postgres requires string to be passed
  if (qb.client.config.client === 'pg') {
    return 'LOWER(CAST(?? AS VARCHAR))';
  }
  return 'LOWER(??)';
};

/**
 * Find association by alias in model
 */
const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

module.exports = buildQuery;
```