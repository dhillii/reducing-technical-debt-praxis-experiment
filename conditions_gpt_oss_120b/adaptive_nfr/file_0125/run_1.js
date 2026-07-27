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

  const buildJoinsFromTree = (qb, queryTree) => {
    Object.keys(queryTree.joins).forEach(key => {
      const subQueryTree = queryTree.joins[key];
      buildJoin(qb, subQueryTree.assoc, queryTree, subQueryTree);
      buildJoinsFromTree(qb, subQueryTree);
    });
  };

  const buildJoin = (qb, assoc, originInfo, destinationInfo) => {
    if (['manyToMany', 'manyWay'].includes(assoc.nature)) {
      const joinTableAlias = generateAlias(assoc.tableCollectionName);

      let originColumnNameInJoinTable;
      if (assoc.nature === 'manyToMany') {
        originColumnNameInJoinTable = `${joinTableAlias}.${singular(
          destinationInfo.model.attributes[assoc.via].attribute
        )}_${destinationInfo.model.attributes[assoc.via].column}`;
      } else {
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

  const createTreeNode = (model, assoc = null) => ({
    alias: generateAlias(model.collectionName),
    assoc,
    model,
    joins: {},
  });

  const tree = {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
  };

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

  const generateNestedJoinsFromFields = each(field => generateNestedJoins(field, tree));

  const buildWhereClauses = (whereClauses, { model }) => {
    return whereClauses.map(whereClause => {
      const { field, operator, value } = whereClause;

      if (BOOLEAN_OPERATORS.includes(operator)) {
        return { field, operator, value: value.map(v => buildWhereClauses(v, { model })) };
      }

      const path = generateNestedJoins(field, tree);

      return {
        field: path,
        operator,
        value,
      };
    });
  };

  const addFiltersQueriesToJoinTree = tree => {
    _.each(tree.joins, value => {
      const { model } = value;

      runPopulateQueries(
        toQueries({
          publicationState: { query: filters.publicationState, model, alias: value.alias },
        }),
        qb
      );

      addFiltersQueriesToJoinTree(value);
    });
  };

  const aliasedWhereClauses = buildWhereClauses(whereClauses, { model });
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  generateNestedJoinsFromFields(sortClauses.map(prop('field')));

  buildJoinsFromTree(qb, tree);
  addFiltersQueriesToJoinTree(tree);

  return tree;
};

/**
 * Process a clause that may be an array or a single object.
 * @param {Object} parentQb - Knex query builder
 * @param {Object|Array} clause - Clause definition
 */
const processClause = (parentQb, clause) => {
  if (Array.isArray(clause)) {
    clause.forEach(c => {
      parentQb.where(subQb => buildWhereClause({ qb: subQb, ...c }));
    });
  } else {
    buildWhereClause({ qb: parentQb, ...clause });
  }
};

/**
 * Handler for 'and' operator.
 * @param {Object} qb - Knex query builder
 * @param {Array} value - Array of clauses
 */
const handleAnd = (qb, _, __, value) => {
  return qb.where(andQb => {
    value.forEach(andClause => {
      andQb.where(subQb => {
        processClause(subQb, andClause);
      });
    });
  });
};

/**
 * Handler for 'or' operator.
 * @param {Object} qb - Knex query builder
 * @param {Array} value - Array of clauses
 */
const handleOr = (qb, _, __, value) => {
  return qb.where(orQb => {
    value.forEach(orClause => {
      orQb.orWhere(subQb => {
        processClause(subQb, orClause);
      });
    });
  });
};

/**
 * Handler for simple comparison operators.
 * @param {Object} qb - Knex query builder
 * @param {string} field - Field name
 * @param {string} operator - Operator string
 * @param {*} value - Value
 */
const handleSimple = (qb, field, operator, value) => {
  const opsMap = {
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
  const handler = opsMap[operator];
  if (!handler) {
    throw new Error(`Unhandled whereClause : ${field} ${operator} ${value}`);
  }
  return handler();
};

/**
 * Handler for array values with non-logical operators.
 * @param {Object} qb - Knex query builder
 * @param {string} field - Field name
 * @param {string} operator - Operator string
 * @param {Array} value - Array of values
 */
const handleArrayValue = (qb, field, operator, value) => {
  return qb.where(subQb => {
    value.forEach(val => {
      subQb.orWhere(q => handleSimple(q, field, operator, val));
    });
  });
};

/**
 * Dispatch map for where clause operators.
 */
const operatorHandlers = {
  and: handleAnd,
  or: handleOr,
};

/**
 * Builds a sql where clause
 * @param {Object} options - Options
 * @param {Object} options.qb - Bookshelf (knex) query builder
 * @param {Object} options.model - Bookshelf model
 * @param {string} options.field - Filtered field
 * @param {string} options.operator - Filter operator (=,in,not eq etc..)
 * @param {*} options.value - Filter value
 */
const buildWhereClause = ({ qb, field, operator, value }) => {
  if (Array.isArray(value) && !['and', 'or', 'in', 'nin'].includes(operator)) {
    return handleArrayValue(qb, field, operator, value);
  }

  const handler = operatorHandlers[operator];
  if (handler) {
    return handler(qb, field, operator, value);
  }

  return handleSimple(qb, field, operator, value);
};

const fieldLowerFn = qb => {
  if (qb.client.config.client === 'pg') {
    return 'LOWER(CAST(?? AS VARCHAR))';
  }
  return 'LOWER(??)';
};

const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

module.exports = buildQuery;