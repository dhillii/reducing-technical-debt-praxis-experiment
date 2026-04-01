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
 * Generate alias for a name
 * @param {string} name - name to alias
 * @param {Object} aliasMap - map of existing aliases
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
 * Create a query tree node from a key an assoc and a model
 * @param {Object} model - Strapi model
 * @param {Object} assoc - Strapi association
 * @param {Object} aliasMap - map of existing aliases
 */
const createTreeNode = (model, assoc = null, aliasMap) => {
  return {
    alias: generateAlias(model.collectionName, aliasMap),
    assoc,
    model,
    joins: {},
  };
};

/**
 * Build join for manyToMany or manyWay associations
 * @param {Object} qb - Knex query builder
 * @param {Object} assoc - Association info
 * @param {Object} originInfo - Origin info
 * @param {Object} destinationInfo - Destination info
 * @param {string} joinTableAlias - Join table alias
 */
const buildManyToManyJoin = (qb, assoc, originInfo, destinationInfo, joinTableAlias) => {
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
 * Build join for one-to-many or one-to-one associations
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
 * @param {Object} aliasMap - map of existing aliases
 */
const buildJoin = (qb, assoc, originInfo, destinationInfo, aliasMap) => {
  if (['manyToMany', 'manyWay'].includes(assoc.nature)) {
    const joinTableAlias = generateAlias(assoc.tableCollectionName, aliasMap);
    buildManyToManyJoin(qb, assoc, originInfo, destinationInfo, joinTableAlias);
  } else {
    buildSimpleJoin(qb, assoc, originInfo, destinationInfo);
  }
};

/**
 * Build joins from tree recursively
 * @param {Object} qb - Knex query builder
 * @param {Object} queryTree - Query tree
 * @param {Object} aliasMap - map of existing aliases
 */
const buildJoinsFromTree = (qb, queryTree, aliasMap) => {
  Object.keys(queryTree.joins).forEach(key => {
    const subQueryTree = queryTree.joins[key];
    buildJoin(qb, subQueryTree.assoc, queryTree, subQueryTree, aliasMap);
    buildJoinsFromTree(qb, subQueryTree, aliasMap);
  });
};

/**
 * Returns the SQL path for a query field.
 * Adds table to the joins tree
 * @param {string} field a field used to filter
 * @param {Object} tree joins tree
 * @param {Object} aliasMap - map of existing aliases
 */
const generateNestedJoins = (field, tree, aliasMap) => {
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
    tree.joins[key] = createTreeNode(assocModel, assoc, aliasMap);
  }

  return generateNestedJoins(parts.join('.'), tree.joins[key], aliasMap);
};

/**
 * Build where clauses with proper table aliases
 * @param {Array} whereClauses - Where clauses
 * @param {Object} context - Context with model
 * @param {Object} tree - Joins tree
 * @param {Object} aliasMap - map of existing aliases
 */
const buildWhereClauses = (whereClauses, { model }, tree, aliasMap) => {
  return whereClauses.map(whereClause => {
    const { field, operator, value } = whereClause;

    if (BOOLEAN_OPERATORS.includes(operator)) {
      return { field, operator, value: value.map(v => buildWhereClauses(v, { model }, tree, aliasMap)) };
    }

    const path = generateNestedJoins(field, tree, aliasMap);

    return {
      field: path,
      operator,
      value,
    };
  });
};

/**
 * Add filters queries to join tree recursively
 * @param {Object} tree - Joins tree
 * @param {Object} filters - Filters
 * @param {Object} qb - Query builder
 */
const addFiltersQueriesToJoinTree = (tree, filters, qb) => {
  _.each(tree.joins, value => {
    const { alias, model } = value;

    // PublicationState
    runPopulateQueries(
      toQueries({
        publicationState: { query: filters.publicationState, model, alias },
      }),
      qb
    );

    addFiltersQueriesToJoinTree(value, filters, qb);
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

  // tree made to create the joins structure
  const tree = {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
  };

  const aliasedWhereClauses = buildWhereClauses(whereClauses, { model }, tree, aliasMap);
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  // Force needed joins for deep sort clauses
  sortClauses.map(prop('field')).forEach(field => generateNestedJoins(field, tree, aliasMap));

  buildJoinsFromTree(qb, tree, aliasMap);
  addFiltersQueriesToJoinTree(tree, filters, qb);

  return tree;
};

/**
 * Build and clause
 * @param {Object} qb - Query builder
 * @param {Array} value - And clauses
 */
const buildAndClause = (qb, value) => {
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
  });
};

/**
 * Build or clause
 * @param {Object} qb - Query builder
 * @param {Array} value - Or clauses
 */
const buildOrClause = (qb, value) => {
  qb.where(orQb => {
    value.forEach(orClause => {
      orQb.orWhere(subQb => {
        if (Array.isArray(orClause)) {
          orClause.forEach(orClause =>
            subQb.where(andQb => buildWhereClause({ qb: andQb, ...orClause }))
          );
        } else {
          buildWhereClause({ qb: subQb, ...orClause });
        }
      });
    });
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

const fieldLowerFn = qb => {
  // Postgres requires string to be passed
  if (qb.client.config.client === 'pg') {
    return 'LOWER(CAST(?? AS VARCHAR))';
  }
  return 'LOWER(??)';
};

const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

module.exports = buildQuery;
```