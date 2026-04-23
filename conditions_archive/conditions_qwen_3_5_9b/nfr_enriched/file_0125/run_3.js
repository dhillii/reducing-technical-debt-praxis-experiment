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
    const clauses = buildSortClauses(filters.sort, joinsTree);
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
 * Build sort clauses from the given sort fields and joins tree
 * @param {Array} sortFields - Array of sort field objects
 * @param {Object} joinsTree - The joins tree that contains the aliased associations
 * @returns {Array} Array of sort clause objects
 */
const buildSortClauses = (sortFields, joinsTree) => {
  return sortFields.map(field => buildSortClauseFromTree(field, joinsTree)).filter(c => !isEmpty(c));
};

/**
 * Build a bookshelf sort clause (simple or deep) based on a joins tree
 * @param {Object} field - Sort field object with field and order properties
 * @param {Object} joinsTree - The joins tree that contains the aliased associations
 * @returns {Object} Sort clause object with column, order, and alias
 */
const buildSortClauseFromTree = (field, joinsTree) => {
  const { field: fieldName, order } = field;

  if (!fieldName.includes('.')) {
    return {
      column: `${joinsTree.alias}.${fieldName}`,
      order,
      alias: `_strapi_tmp_${joinsTree.alias}_${fieldName}`,
    };
  }

  const [relation, attribute] = fieldName.split('.');
  const joinEntry = findJoinByRelation(joinsTree.joins, relation);

  if (joinEntry) {
    return {
      column: `${joinEntry.alias}.${attribute}`,
      order,
      alias: `_strapi_tmp_${joinEntry.alias}_${attribute}`,
    };
  }

  return {};
};

/**
 * Find a join entry by its relation alias
 * @param {Object} joins - Joins object
 * @param {string} relation - Relation alias to find
 * @returns {Object|null} Join entry or null if not found
 */
const findJoinByRelation = (joins, relation) => {
  return Object.values(joins).find(join => join.assoc.alias === relation);
};

/**
 * Add joins and where filters to the query builder
 * @param {Object} qb - knex query builder
 * @param {Object} model - Bookshelf model
 * @param {Object} filters - The query filters
 * @returns {Object} The joins tree
 */
const buildJoinsAndFilter = (qb, model, filters) => {
  const { where: whereClauses = [], sort: sortClauses = [] } = filters;

  const tree = createRootTreeNode(model);
  const aliasedWhereClauses = buildWhereClauses(whereClauses, { model });
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  generateNestedJoinsFromFields(sortClauses.map(prop('field')), tree);
  buildJoinsFromTree(qb, tree);
  addFiltersQueriesToJoinTree(tree, qb, filters);

  return tree;
};

/**
 * Create a root tree node for the query
 * @param {Object} model - Strapi model
 * @returns {Object} Root tree node
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
 * @param {Object} model - Strapi model
 * @param {Object} assoc - Strapi association
 * @returns {Object} Tree node
 */
const createTreeNode = (model, assoc = null) => {
  return {
    alias: generateAlias(model.collectionName),
    assoc,
    model,
    joins: {},
  };
};

/**
 * Returns an alias for a name (simple incremental alias name)
 * @param {string} name - name to alias
 * @param {Object} aliasMap - Map to track aliases
 * @returns {string} Generated alias
 */
const generateAlias = (name, aliasMap = {}) => {
  if (!aliasMap[name]) {
    aliasMap[name] = 1;
  }

  const alias = `${name}_${aliasMap[name]}`;
  aliasMap[name] += 1;
  return alias;
};

/**
 * Build a query joins and where clauses from a query tree
 * @param {Object} qb - Knex query builder
 * @param {Object} tree - Query tree
 */
const buildJoinsFromTree = (qb, queryTree) => {
  Object.keys(queryTree.joins).forEach(key => {
    const subQueryTree = queryTree.joins[key];
    buildJoin(qb, subQueryTree.assoc, queryTree, subQueryTree);
    buildJoinsFromTree(qb, subQueryTree);
  });
};

/**
 * Add table joins to the query builder
 * @param {Object} qb - Knex query builder
 * @param {Object} assoc - Models association info
 * @param {Object} originInfo - origin from which you are making a join
 * @param {Object} destinationInfo - destination with which we are making a join
 */
const buildJoin = (qb, assoc, originInfo, destinationInfo) => {
  if (['manyToMany', 'manyWay'].includes(assoc.nature)) {
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
 * Returns the SQL path for a query field.
 * Adds table to the joins tree
 * @param {string} field - a field used to filter
 * @param {Object} tree - joins tree
 * @returns {string} SQL path
 */
const generateNestedJoins = (field, tree) => {
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
    tree.joins[key] = createTreeNode(assocModel, assoc);
  }

  return generateNestedJoins(parts.join('.'), tree.joins[key]);
};

/**
 * Generate nested joins from multiple fields
 * @param {Array} fields - Array of field strings
 * @param {Object} tree - joins tree
 */
const generateNestedJoinsFromFields = (fields, tree) => {
  each(field => generateNestedJoins(field, tree))(fields);
};

/**
 * Format every where clauses with the right table name aliases.
 * Add table joins to the joins list
 * @param {Array<{field, operator, value}>} whereClauses - a list of where clauses
 * @param {Object} context - context object
 * @param {Object} context.model - model on which the query is run
 * @returns {Array} Formatted where clauses
 */
const buildWhereClauses = (whereClauses, { model }) => {
  return whereClauses.map(whereClause => {
    const { field, operator, value } = whereClause;

    if (BOOLEAN_OPERATORS.includes(operator)) {
      return { field, operator, value: value.map(v => buildWhereClauses(v, { model })) };
    }

    const path = generateNestedJoins(field, { model, joins: {} });

    return {
      field: path,
      operator,
      value,
    };
  });
};

/**
 * Add queries on tree's joins (deep search, deep sort) based on given filters
 * @param {Object} tree - joins tree
 * @param {Object} qb - query builder
 * @param {Object} filters - filters object
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
 * Builds a sql where clause
 * @param {Object} options - Options
 * @param {Object} options.qb - Bookshelf (knex) query builder
 * @param {Object} options.model - Bookshelf model
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
      return buildWhereClauseAnd(qb, value);
    case 'or':
      return buildWhereClauseOr(qb, value);
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
 * Build where clause for AND operator
 * @param {Object} qb - query builder
 * @param {Array} value - array of where clauses
 * @returns {Object} query builder
 */
const buildWhereClauseAnd = (qb, value) => {
  return qb.where(andQb => {
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
 * Build where clause for OR operator
 * @param {Object} qb - query builder
 * @param {Array} value - array of where clauses
 * @returns {Object} query builder
 */
const buildWhereClauseOr = (qb, value) => {
  return qb.where(orQb => {
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

const fieldLowerFn = qb => {
  // Postgres requires string to be passed
  if (qb.client.config.client === 'pg') {
    return 'LOWER(CAST(?? AS VARCHAR))';
  }
  return 'LOWER(??)';
};

const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

module.exports = buildQuery;