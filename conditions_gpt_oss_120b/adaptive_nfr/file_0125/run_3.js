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

  const tree = {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
  };

  // Force needed joins for deep sort clauses
  generateNestedJoinsFromFields(sortClauses.map(prop('field')), tree, generateAlias);

  const aliasedWhereClauses = buildWhereClauses(whereClauses, { model, tree, generateAlias });
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  buildJoinsFromTree(qb, tree, generateAlias);
  addFiltersQueriesToJoinTree(tree, qb, filters);

  return tree;
};

/**
 * Generate a nested join path for a field, creating tree nodes as needed.
 * @param {string} field - Field path (e.g., "author.name")
 * @param {Object} tree - Current joins tree node
 * @param {Function} generateAlias - Alias generator function
 * @returns {string} - SQL path for the field
 */
const generateNestedJoins = (field, tree, generateAlias) => {
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
    tree.joins[key] = createTreeNode(assocModel, assoc, generateAlias);
  }

  return generateNestedJoins(parts.join('.'), tree.joins[key], generateAlias);
};

/**
 * Apply generateNestedJoins to a list of fields.
 * @param {Array<string>} fields
 * @param {Object} tree
 * @param {Function} generateAlias
 */
const generateNestedJoinsFromFields = (fields, tree, generateAlias) => {
  each(field => generateNestedJoins(field, tree, generateAlias), fields);
};

/**
 * Create a tree node for a model/association.
 * @param {Object} model - Strapi model
 * @param {Object} assoc - Strapi association
 * @param {Function} generateAlias
 * @returns {Object}
 */
const createTreeNode = (model, assoc = null, generateAlias) => ({
  alias: generateAlias(model.collectionName),
  assoc,
  model,
  joins: {},
});

/**
 * Build where clause objects with proper table aliases.
 * @param {Array<Object>} whereClauses
 * @param {Object} context
 * @param {Object} context.model
 * @param {Object} context.tree
 * @param {Function} context.generateAlias
 * @returns {Array<Object>}
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
    return { field: path, operator, value };
  });
};

/**
 * Recursively add publicationState queries to each join node.
 * @param {Object} node - Current tree node
 * @param {Object} qb - Knex query builder
 * @param {Object} filters - Original filters
 */
const addFiltersQueriesToJoinTree = (node, qb, filters) => {
  each(value => {
    const { alias, model } = value;
    runPopulateQueries(
      toQueries({
        publicationState: { query: filters.publicationState, model, alias },
      }),
      qb
    );
    addFiltersQueriesToJoinTree(value, qb, filters);
  }, node.joins);
};

/**
 * Recursively build joins from a query tree.
 * @param {Object} qb - Knex query builder
 * @param {Object} queryTree - Current tree node
 * @param {Function} generateAlias
 */
const buildJoinsFromTree = (qb, queryTree, generateAlias) => {
  Object.keys(queryTree.joins).forEach(key => {
    const subTree = queryTree.joins[key];
    buildJoin(qb, subTree.assoc, queryTree, subTree, generateAlias);
    buildJoinsFromTree(qb, subTree, generateAlias);
  });
};

/**
 * Add table joins based on association nature.
 * @param {Object} qb - Knex query builder
 * @param {Object} assoc - Association info
 * @param {Object} originInfo - Origin node info
 * @param {Object} destinationInfo - Destination node info
 * @param {Function} generateAlias
 */
const buildJoin = (qb, assoc, originInfo, destinationInfo, generateAlias) => {
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

/**
 * Build a SQL where clause based on operator.
 * @param {Object} options
 * @param {Object} options.qb - Knex query builder
 * @param {string} options.field - Field path
 * @param {string} options.operator - Operator name
 * @param {*} options.value - Value
 */
const buildWhereClause = ({ qb, field, operator, value }) => {
  if (Array.isArray(value) && !BOOLEAN_OPERATORS.includes(operator) && !['in', 'nin'].includes(operator)) {
    return qb.where(subQb => {
      value.forEach(val => {
        subQb.orWhere(q => buildWhereClause({ qb: q, field, operator, value: val }));
      });
    });
  }

  const handler = operatorHandlers[operator];
  if (!handler) {
    throw new Error(`Unhandled whereClause : ${field} ${operator} ${value}`);
  }
  return handler(qb, field, value);
};

/**
 * Mapping of operators to handler functions.
 */
const operatorHandlers = {
  and: (qb, _, value) =>
    qb.where(andQb => {
      value.forEach(andClause => {
        andQb.where(subQb => {
          if (Array.isArray(andClause)) {
            andClause.forEach(clause => subQb.where(andQb2 => buildWhereClause({ qb: andQb2, ...clause })));
          } else {
            buildWhereClause({ qb: subQb, ...andClause });
          }
        });
      });
    }),
  or: (qb, _, value) =>
    qb.where(orQb => {
      value.forEach(orClause => {
        orQb.orWhere(subQb => {
          if (Array.isArray(orClause)) {
            orClause.forEach(clause => subQb.where(andQb => buildWhereClause({ qb: andQb, ...clause })));
          } else {
            buildWhereClause({ qb: subQb, ...orClause });
          }
        });
      });
    }),
  eq: (qb, field, value) => qb.where(field, value),
  ne: (qb, field, value) => qb.where(field, '!=', value),
  lt: (qb, field, value) => qb.where(field, '<', value),
  lte: (qb, field, value) => qb.where(field, '<=', value),
  gt: (qb, field, value) => qb.where(field, '>', value),
  gte: (qb, field, value) => qb.where(field, '>=', value),
  in: (qb, field, value) => qb.whereIn(field, Array.isArray(value) ? value : [value]),
  nin: (qb, field, value) => qb.whereNotIn(field, Array.isArray(value) ? value : [value]),
  contains: (qb, field, value) => qb.whereRaw(`${fieldLowerFn(qb)} LIKE LOWER(?)`, [field, `%${value}%`]),
  ncontains: (qb, field, value) => qb.whereRaw(`${fieldLowerFn(qb)} NOT LIKE LOWER(?)`, [field, `%${value}%`]),
  containss: (qb, field, value) => qb.where(field, 'like', `%${value}%`),
  ncontainss: (qb, field, value) => qb.whereNot(field, 'like', `%${value}%`),
  null: (qb, field, value) => (value ? qb.whereNull(field) : qb.whereNotNull(field)),
};

/**
 * Returns the appropriate LOWER function string for the DB client.
 * @param {Object} qb - Knex query builder
 * @returns {string}
 */
const fieldLowerFn = qb => {
  if (qb.client.config.client === 'pg') {
    return 'LOWER(CAST(?? AS VARCHAR))';
  }
  return 'LOWER(??)';
};

/**
 * Find an association by key on a model.
 * @param {Object} model - Strapi model
 * @param {string} key - Association alias
 * @returns {Object|undefined}
 */
const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

module.exports = buildQuery;