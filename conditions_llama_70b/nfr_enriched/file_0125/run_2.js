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

  applySortQuery(qb, joinsTree, filters);
  applyPagination(qb, filters);
  applyPublicationStateFilter(qb, model, filters);
};

/**
 * Apply sort query to the bookshelf query
 * @param {Object} qb - Knex query builder
 * @param {Object} joinsTree - Joins tree
 * @param {Object} filters - Filters params
 */
const applySortQuery = (qb, joinsTree, filters) => {
  if (!_.has(filters, 'sort')) return;

  const sortClauses = filters.sort.map(buildSortClauseFromTree(joinsTree)).filter(c => !isEmpty(c));
  const orderBy = sortClauses.map(({ order, alias }) => ({ order, column: alias }));
  const orderColumns = sortClauses.map(({ alias, column }) => ({ [alias]: column }));
  const columns = [`${joinsTree.alias}.*`, ...orderColumns];

  qb.column(columns).orderBy(orderBy);
};

/**
 * Apply pagination to the bookshelf query
 * @param {Object} qb - Knex query builder
 * @param {Object} filters - Filters params
 */
const applyPagination = (qb, filters) => {
  if (_.has(filters, 'start')) {
    qb.offset(filters.start);
  }

  if (_.has(filters, 'limit') && filters.limit >= 0) {
    qb.limit(filters.limit);
  }
};

/**
 * Apply publication state filter to the bookshelf query
 * @param {Object} qb - Knex query builder
 * @param {Object} model - Bookshelf model
 * @param {Object} filters - Filters params
 */
const applyPublicationStateFilter = (qb, model, filters) => {
  if (!_.has(filters, 'publicationState')) return;

  runPopulateQueries(
    toQueries({ publicationState: { query: filters.publicationState, model } }),
    qb
  );
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

  const aliasedWhereClauses = buildWhereClauses(whereClauses, { model });
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  generateNestedJoinsFromFields(sortClauses.map(prop('field')), tree);
  buildJoinsFromTree(qb, tree);
  addFiltersQueriesToJoinTree(qb, tree);

  return tree;
};

/**
 * Generate nested joins from fields
 * @param {Array<string>} fields - Fields to generate joins for
 * @param {Object} tree - Joins tree
 */
const generateNestedJoinsFromFields = (fields, tree) => {
  fields.forEach(field => generateNestedJoins(field, tree));
};

/**
 * Generate nested joins for a field
 * @param {string} field - Field to generate joins for
 * @param {Object} tree - Joins tree
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
 * Build joins from tree
 * @param {Object} qb - Knex query builder
 * @param {Object} tree - Joins tree
 */
const buildJoinsFromTree = (qb, tree) => {
  Object.keys(tree.joins).forEach(key => {
    const subQueryTree = tree.joins[key];
    buildJoin(qb, subQueryTree.assoc, tree, subQueryTree);

    buildJoinsFromTree(qb, subQueryTree);
  });
};

/**
 * Add table joins
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
 * Create a query tree node from a key an assoc and a model
 * @param {Object} model - Strapi model
 * @param {Object} assoc - Strapi association
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
 * Add filters queries to join tree
 * @param {Object} qb - Knex query builder
 * @param {Object} tree - Joins tree
 */
const addFiltersQueriesToJoinTree = (qb, tree) => {
  _.each(tree.joins, value => {
    const { alias, model } = value;

    runPopulateQueries(
      toQueries({
        publicationState: { query: null, model, alias },
      }),
      qb
    );

    addFiltersQueriesToJoinTree(qb, value);
  });
};

/**
 * Format every where clauses with the right table name aliases.
 * Add table joins to the joins list
 * @param {Array<{field, operator, value}>} whereClauses a list of where clauses
 * @param {Object} context
 * @param {Object} context.model model on which the query is run
 */
const buildWhereClauses = (whereClauses, { model }) => {
  return whereClauses.map(whereClause => {
    const { field, operator, value } = whereClause;

    if (BOOLEAN_OPERATORS.includes(operator)) {
      return { field, operator, value: value.map(v => buildWhereClauses(v, { model })) };
    }

    const path = generateNestedJoins(field, {
      alias: model.collectionName,
      assoc: null,
      model,
      joins: {},
    });

    return {
      field: path,
      operator,
      value,
    };
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
    case 'or':
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
  if (qb.client.config.client === 'pg') {
    return 'LOWER(CAST(?? AS VARCHAR))';
  }
  return 'LOWER(??)';
};

const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

module.exports = buildQuery;