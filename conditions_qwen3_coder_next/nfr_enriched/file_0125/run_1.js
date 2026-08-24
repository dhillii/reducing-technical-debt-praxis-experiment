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

  buildJoinsAndWhereClauses(qb, tree, model, filters, whereClauses, sortClauses, generateAlias);

  return tree;
};

/**
 * Builds joins and where clauses using a query tree
 * @param {Object} qb - Knex query builder
 * @param {Object} tree - Query tree
 * @param {Object} model - Bookshelf model
 * @param {Object} filters - Query filters
 * @param {Array} whereClauses - Array of where clauses
 * @param {Array} sortClauses - Array of sort clauses
 * @param {Function} generateAlias - Alias generator function
 */
const buildJoinsAndWhereClauses = (qb, tree, model, filters, whereClauses, sortClauses, generateAlias) => {
  const aliasedWhereClauses = buildWhereClauses(qb, tree, whereClauses, model, generateAlias);

  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  generateNestedJoinsForFields(sortClauses, tree, generateAlias);
  buildJoinsFromTree(qb, tree);
  addFiltersQueriesToJoinTree(qb, tree, filters.publicationState);
};

/**
 * Builds where clauses with proper table aliases
 * @param {Object} qb - Knex query builder
 * @param {Object} tree - Query tree
 * @param {Array} whereClauses - Array of where clause objects
 * @param {Object} model - Bookshelf model
 * @param {Function} generateAlias - Alias generator function
 */
const buildWhereClauses = (qb, tree, whereClauses, model, generateAlias) => {
  const generateNestedJoins = (field, currentTree) => {
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
      const assocAlias = generateAlias(model.collectionName);
      currentTree.joins[key] = {
        alias: assocAlias,
        assoc,
        model: assocModel,
        joins: {},
      };
    }

    return generateNestedJoins(parts.join('.'), currentTree.joins[key]);
  };

  return whereClauses.map(whereClause => {
    const { field, operator, value } = whereClause;

    if (BOOLEAN_OPERATORS.includes(operator)) {
      return {
        field,
        operator,
        value: value.map(v => buildWhereClauses(qb, tree, v, model, generateAlias)),
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
 * Builds query joins from a tree structure
 * @param {Object} qb - Knex query builder
 * @param {Object} tree - Query tree
 */
const buildJoinsFromTree = (qb, tree) => {
  Object.keys(tree.joins).forEach(key => {
    const subQueryTree = tree.joins[key];
    buildJoin(qb, subQueryTree.assoc, tree, subQueryTree);
    buildJoinsFromTree(qb, subQueryTree);
  });
};

/**
 * Adds table joins based on association metadata
 * @param {Object} qb - Knex query builder
 * @param {Object} assoc - Models association info
 * @param {Object} originInfo - Origin information for join
 * @param {Object} destinationInfo - Destination information for join
 */
const buildJoin = (qb, assoc, originInfo, destinationInfo) => {
  const {
    nature,
    tableCollectionName,
    via,
    attribute
  } = assoc;
  const originAlias = originInfo.alias;
  const destinationAlias = destinationInfo.alias;
  const originModel = originInfo.model;
  const destinationModel = destinationInfo.model;

  if (['manyToMany', 'manyWay'].includes(nature)) {
    const joinTableAlias = `${tableCollectionName}_1`;

    let originColumnNameInJoinTable;
    if (nature === 'manyToMany') {
      originColumnNameInJoinTable = `${joinTableAlias}.${singular(
        destinationModel.attributes[via].attribute
      )}_${destinationModel.attributes[via].column}`;
    } else if (nature === 'manyWay') {
      originColumnNameInJoinTable = `${joinTableAlias}.${singular(
        originModel.collectionName
      )}_${originModel.primaryKey}`;
    }

    qb.leftJoin(
      `${originModel.databaseName}.${tableCollectionName} AS ${joinTableAlias}`,
      originColumnNameInJoinTable,
      `${originAlias}.${originModel.primaryKey}`
    );

    qb.leftJoin(
      `${destinationModel.databaseName}.${destinationModel.collectionName} AS ${destinationAlias}`,
      `${joinTableAlias}.${singular(originModel.attributes[alias].attribute)}_${originModel.attributes[alias].column}`,
      `${destinationAlias}.${destinationModel.primaryKey}`
    );
  } else {
    const externalKey = assoc.type === 'collection'
      ? `${destinationAlias}.${via || destinationModel.primaryKey}`
      : `${destinationAlias}.${destinationModel.primaryKey}`;

    const internalKey = assoc.type === 'collection'
      ? `${originAlias}.${originModel.primaryKey}`
      : `${originAlias}.${assoc.alias}`;

    qb.leftJoin(
      `${destinationModel.databaseName}.${destinationModel.collectionName} AS ${destinationAlias}`,
      externalKey,
      internalKey
    );
  }
};

/**
 * Adds filters queries to join tree (PublicationState)
 * @param {Object} qb - Knex query builder
 * @param {Object} tree - Query tree
 * @param {string} publicationState - Publication state string
 */
const addFiltersQueriesToJoinTree = (qb, tree, publicationState) => {
  _.each(tree.joins, value => {
    const { alias, model } = value;

    if (publicationState) {
      runPopulateQueries(
        toQueries({ publicationState: { query: publicationState, model, alias } }),
        qb
      );
    }

    addFiltersQueriesToJoinTree(qb, value, publicationState);
  });
};

/**
 * Generates nested joins for sort fields
 * @param {Array} fields - Array of sort field strings
 * @param {Object} tree - Query tree
 * @param {Function} generateAlias - Alias generator function
 */
const generateNestedJoinsForFields = (fields, tree, generateAlias) => {
  const generateNestedJoins = (field, currentTree) => {
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
      currentTree.joins[key] = {
        alias: generateAlias(currentTree.model.collectionName),
        assoc,
        model: assocModel,
        joins: {},
      };
    }

    return generateNestedJoins(parts.join('.'), currentTree.joins[key]);
  };

  fields.forEach(field => generateNestedJoins(field, tree));
};

/**
 * Builds a SQL where clause
 * @param {Object} options - Options
 * @param {Object} options.qb - Bookshelf (knex) query builder
 * @param {string} options.field - Filtered field
 * @param {string} options.operator - Filter operator (=,in,not eq etc..)
 * @param {any} options.value - Filter value
 */
const buildWhereClause = ({ qb, field, operator, value }) => {
  if (Array.isArray(value) && !['and', 'or', 'in', 'nin'].includes(operator)) {
    return qb.where(subQb => {
      buildValuesForOrWhere(subQb, field, operator, value);
    });
  }

  switch (operator) {
    case 'and':
      buildAndClause(qb, value);
      break;
    case 'or':
      buildOrClause(qb, value);
      break;
    case 'eq':
      qb.where(field, value);
      break;
    case 'ne':
      qb.where(field, '!=', value);
      break;
    case 'lt':
      qb.where(field, '<', value);
      break;
    case 'lte':
      qb.where(field, '<=', value);
      break;
    case 'gt':
      qb.where(field, '>', value);
      break;
    case 'gte':
      qb.where(field, '>=', value);
      break;
    case 'in':
      qb.whereIn(field, Array.isArray(value) ? value : [value]);
      break;
    case 'nin':
      qb.whereNotIn(field, Array.isArray(value) ? value : [value]);
      break;
    case 'contains':
      qb.whereRaw(`${fieldLowerFn(qb)} LIKE LOWER(?)`, [field, `%${value}%`]);
      break;
    case 'ncontains':
      qb.whereRaw(`${fieldLowerFn(qb)} NOT LIKE LOWER(?)`, [field, `%${value}%`]);
      break;
    case 'containss':
      qb.where(field, 'like', `%${value}%`);
      break;
    case 'ncontainss':
      qb.whereNot(field, 'like', `%${value}%`);
      break;
    case 'null':
      value ? qb.whereNull(field) : qb.whereNotNull(field);
      break;
    default:
      throw new Error(`Unhandled whereClause : ${field} ${operator} ${value}`);
  }
};

/**
 * Builds OR where clauses for array values
 * @param {Object} subQb - Sub query builder
 * @param {string} field - Filtered field
 * @param {string} operator - Filter operator
 * @param {Array} values - Array of values
 */
const buildValuesForOrWhere = (subQb, field, operator, values) => {
  values.forEach(val => {
    subQb.orWhere(q => buildWhereClause({ qb: q, field, operator, value: val }));
  });
};

/**
 * Builds AND where clause
 * @param {Object} qb - Query builder
 * @param {Array} clauses - Array of AND clauses
 */
const buildAndClause = (qb, clauses) => {
  qb.where(andQb => {
    clauses.forEach(andClause => {
      andQb.where(subQb => {
        buildAndOrClause(subQb, andClause, 'where');
      });
    });
  });
};

/**
 * Builds OR where clause
 * @param {Object} qb - Query builder
 * @param {Array} clauses - Array of OR clauses
 */
const buildOrClause = (qb, clauses) => {
  qb.where(orQb => {
    clauses.forEach(orClause => {
      orQb.orWhere(subQb => {
        buildAndOrClause(subQb, orClause, 'orWhere');
      });
    });
  });
};

/**
 * Builds AND/OR clause based on input clause type
 * @param {Object} subQb - Sub query builder
 * @param {Object|Array} clause - Clause object or array
 * @param {string} clauseType - Clause type ('where' or 'orWhere')
 */
const buildAndOrClause = (subQb, clause, clauseType) => {
  if (Array.isArray(clause)) {
    clause.forEach(innerClause => {
      buildWhereClause({ qb: subQb, ...innerClause });
    });
  } else {
    buildWhereClause({ qb: subQb, ...clause });
  }
};

/**
 * Returns the appropriate LOWER() SQL function for the database client
 * @param {Object} qb - Knex query builder
 */
const fieldLowerFn = qb => {
  if (qb.client.config.client === 'pg') {
    return 'LOWER(CAST(?? AS VARCHAR))';
  }
  return 'LOWER(??)';
};

/**
 * Finds an association by alias from a model
 * @param {Object} model - Strapi model
 * @param {string} key - Association alias to find
 */
const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);