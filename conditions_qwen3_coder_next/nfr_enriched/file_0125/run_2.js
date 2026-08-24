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

  const tree = {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
  };

  const handleFieldJoins = field => generateNestedJoins(field, tree, generateAlias, model);
  sortClauses.forEach(({ field }) => handleFieldJoins(field));

  const aliasedWhereClauses = formatWhereClauses(whereClauses, { model, tree, generateAlias });
  aliasedWhereClauses.forEach(clause => buildWhereClause({ qb, ...clause }));

  buildAllJoins(qb, tree, generateAlias);
  addFiltersQueriesToJoinTree(tree, filters, qb);

  return tree;
};

/**
 * Format every where clauses with the right table name aliases.
 * Adds table joins to the joins list.
 * @param {Array<{field, operator, value}>} whereClauses a list of where clauses
 * @param {Object} context
 * @param {Object} context.model model on which the query is run
 * @param {Object} context.tree parent joins tree
 * @param {Function} context.generateAlias alias generator function
 */
const formatWhereClauses = (whereClauses, { model, tree, generateAlias }) => {
  return whereClauses.map(whereClause => {
    const { field, operator, value } = whereClause;

    if (BOOLEAN_OPERATORS.includes(operator)) {
      return { field, operator, value: value.map(v => formatWhereClauses(v, { model, tree, generate_alias: generateAlias })) };
    }

    const path = generateNestedJoins(field, tree, generateAlias, model);

    return {
      field: path,
      operator,
      value,
    };
  });
};

/**
 * Recursively applies filters (e.g., publicationState) to the join tree.
 * @param {Object} tree current node in the join tree
 * @param {Object} filters top-level filters (including publicationState)
 * @param {Object} qb query builder
 */
const addFiltersQueriesToJoinTree = (tree, filters, qb) => {
  _.each(tree.joins, value => {
    const { alias, model } = value;

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
 * Build a field path and update joins tree accordingly.
 * @param {string} field dot-separated field path
 * @param {Object} tree current joins tree node
 * @param {Function} generateAlias alias generator
 * @param {Object} parentModel model at the current tree level
 * @returns {string} full column path including table alias
 */
const generateNestedJoins = (field, tree, generateAlias, parentModel) => {
  let [key, ...rest] = field.split('.');

  const assoc = findAssoc(parentModel, key);
  if (!assoc) {
    return `${tree.alias}.${key}`;
  }

  const assocModel = strapi.db.getModelByAssoc(assoc);

  if (rest.length === 0) {
    rest = [assocModel.primaryKey];
  }

  if (!tree.joins[key]) {
    tree.joins[key] = createTreeNode(assocModel, assoc, generateAlias(assocModel.collectionName));
  }

  return generateNestedJoins(rest.join('.'), tree.joins[key], generateAlias, assocModel);
};

/**
 * Creates a tree node for joins representation.
 * @param {Object} model the model associated to this node
 * @param {Object} assoc association metadata
 * @param {string} alias already-generated alias for this model
 */
const createTreeNode = (model, assoc, alias) => {
  return {
    alias,
    assoc,
    model,
    joins: {},
  };
};

/**
 * Builds all necessary JOIN clauses from the join tree.
 * @param {Object} qb query builder
 * @param {Object} tree current join tree node
 * @param {Function} generateAlias alias generator
 */
const buildAllJoins = (qb, tree, generateAlias) => {
  Object.keys(tree.joins).forEach(key => {
    const subTree = tree.joins[key];
    buildJoin(qb, subTree.assoc, tree, subTree, generateAlias);

    buildAllJoins(qb, subTree, generateAlias);
  });
};

/**
 * Adds a single JOIN clause based on association type.
 * @param {Object} qb query builder
 * @param {Object} assoc association metadata
 * @param {Object} originInfo joining source node info
 * @param {Object} destinationInfo joining target node info
 * @param {Function} generateAlias alias generator
 */
const buildJoin = (qb, assoc, originInfo, destinationInfo, generateAlias) => {
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
 * Builds a SQL WHERE clause based on field, operator, and value.
 * @param {Object} options - Options
 * @param {Object} options.qb - Bookshelf (knex) query builder
 * @param {string} options.field - Filtered field
 * @param {string} options.operator - Filter operator (=,in,not eq etc..)
 * @param {*} options.value - Filter value
 */
const buildWhereClause = ({ qb, field, operator, value }) => {
  if (isNestedValueWithoutOperator(value, operator)) {
    return buildArrayValueWhere(qb, field, operator, value);
  }

  switch (operator) {
    case 'and':
      return buildBooleanWhere(qb, 'and', value);
    case 'or':
      return buildBooleanWhere(qb, 'or', value);
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
      return qb.whereNot(field, 'like', `%${value}%`);
    case 'null':
      return buildNullWhere(qb, field, value);
    default:
      throw new Error(`Unhandled whereClause : ${field} ${operator} ${value}`);
  }
};

/**
 * Builds a WHERE clause for nested boolean operators (and/or)
 * @param {Object} qb query builder
 * @param {string} operator 'and' or 'or'
 * @param {Array} clauses list of nested clauses
 */
const buildBooleanWhere = (qb, operator, clauses) => {
  const clauseType = operator === 'and' ? 'where' : 'orWhere';
  const baseQb = clauseType === 'where' ? qb.where() : qb;

  clauses.forEach(clause =>
    clauseType(qb, subQb => {
      if (Array.isArray(clause)) {
        clause.forEach(innerClause => buildWhereClause({ qb: subQb, ...innerClause }));
      } else {
        buildWhereClause({ qb: subQb, ...clause });
      }
    })
  );
};

/**
 * Builds a WHERE clause for values expressed as arrays when no 'in'/'nin' operator is used
 * @param {Object} qb query builder
 * @param {string} field column name
 * @param {string} operator comparison operator
 * @param {Array} value array of values to OR together
 */
const buildArrayValueWhere = (qb, field, operator, value) => {
  return qb.where(subQb => {
    value.forEach(val => {
      subQb.orWhere(q => buildWhereClause({ qb: q, field, operator, value: val }));
    });
  });
};

/**
 * Builds WHERE NULL or WHERE NOT NULL clause
 * @param {Object} qb query builder
 * @param {string} field column name
 * @param {boolean} isNull true for IS NULL, false for IS NOT NULL
 */
const buildNullWhere = (qb, field, isNull) => {
  return isNull ? qb.whereNull(field) : qb.whereNotNull(field);
};

/**
 * Returns true if value is array-like but operator is not 'in'/'nin'
 */
const isNestedValueWithoutOperator = (value, operator) =>
  Array.isArray(value) && !['and', 'or', 'in', 'nin'].includes(operator);

const fieldLowerFn = qb => {
  if (qb.client.config.client === 'pg') {
    return 'LOWER(CAST(?? AS VARCHAR))';
  }
  return 'LOWER(??)';
};

const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);