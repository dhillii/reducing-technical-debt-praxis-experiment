'use strict';

const _ = require('lodash');
const { keys, each, prop, isEmpty } = require('lodash/fp');
const { singular } = require('pluralize');
const { toQueries, runPopulateQueries } = require('./utils/populate-queries');

const BOOLEAN_OPERATORS = ['or', 'and'];

// Alias generation map
const aliasMap = {};

const generateAlias = name => {
  if (!aliasMap[name]) {
    aliasMap[name] = 1;
  }
  const alias = `${name}_${aliasMap[name]}`;
  aliasMap[name] += 1;
  return alias;
};

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
 * Build joins, filters and deep sort structures.
 */
const buildJoinsAndFilter = (qb, model, filters) => {
  const { where: whereClauses = [], sort: sortClauses = [] } = filters;

  const tree = {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
  };

  // Build joins recursively
  const buildJoinsFromTree = (qb, queryTree) => {
    Object.keys(queryTree.joins).forEach(key => {
      const subTree = queryTree.joins[key];
      buildJoin(qb, subTree.assoc, queryTree, subTree);
      buildJoinsFromTree(qb, subTree);
    });
  };

  // Add a single join based on association nature
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

  // Create a node for the joins tree
  const createTreeNode = (model, assoc = null) => ({
    alias: generateAlias(model.collectionName),
    assoc,
    model,
    joins: {},
  });

  // Generate nested joins for a dotted field path
  const generateNestedJoins = (field, currentTree) => {
    const [key, ...rest] = field.split('.');
    const assoc = findAssoc(currentTree.model, key);

    if (!assoc) {
      return `${currentTree.alias}.${key}`;
    }

    const assocModel = strapi.db.getModelByAssoc(assoc);
    const remainingParts = rest.length ? rest : [assocModel.primaryKey];

    if (!currentTree.joins[key]) {
      currentTree.joins[key] = createTreeNode(assocModel, assoc);
    }

    return generateNestedJoins(remainingParts.join('.'), currentTree.joins[key]);
  };

  // Apply generateNestedJoins to each sort field
  const generateNestedJoinsFromFields = each(field => generateNestedJoins(field, tree));

  // Transform where clauses to use proper table aliases
  const buildWhereClauses = (clauses, { model }) =>
    clauses.map(({ field, operator, value }) => {
      if (BOOLEAN_OPERATORS.includes(operator)) {
        return {
          field,
          operator,
          value: value.map(v => buildWhereClauses(v, { model })),
        };
      }

      const path = generateNestedJoins(field, tree);
      return { field: path, operator, value };
    });

  // Recursively add publication state queries for each join
  const addFiltersQueriesToJoinTree = currentTree => {
    each(value => {
      const { alias, model } = value;
      runPopulateQueries(
        toQueries({
          publicationState: { query: filters.publicationState, model, alias },
        }),
        qb
      );
      addFiltersQueriesToJoinTree(value);
    }, currentTree.joins);
  };

  // Build where clauses and apply them
  const aliasedWhereClauses = buildWhereClauses(whereClauses, { model });
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  // Ensure joins for deep sort fields
  generateNestedJoinsFromFields(sortClauses.map(prop('field')));

  // Build all required joins
  buildJoinsFromTree(qb, tree);
  addFiltersQueriesToJoinTree(tree);

  return tree;
};

/**
 * Handles boolean operators ('and' / 'or') for where clauses.
 */
const handleBooleanOperator = (qb, operator, value) => {
  if (operator === 'and') {
    qb.where(andQb => {
      value.forEach(clause => {
        if (Array.isArray(clause)) {
          clause.forEach(inner => {
            andQb.where(subQb => buildWhereClause({ qb: subQb, ...inner }));
          });
        } else {
          buildWhereClause({ qb: andQb, ...clause });
        }
      });
    });
  } else {
    qb.where(orQb => {
      value.forEach(clause => {
        if (Array.isArray(clause)) {
          clause.forEach(inner => {
            orQb.orWhere(subQb => buildWhereClause({ qb: subQb, ...inner }));
          });
        } else {
          buildWhereClause({ qb: orQb, ...clause });
        }
      });
    });
  }
};

/**
 * Builds a sql where clause
 */
const buildWhereClause = ({ qb, field, operator, value }) => {
  if (Array.isArray(value) && !['and', 'or', 'in', 'nin'].includes(operator)) {
    return qb.where(subQb => {
      value.forEach(val => {
        subQb.orWhere(q => buildWhereClause({ qb: q, field, operator, value: val }));
      });
    });
  }

  if (BOOLEAN_OPERATORS.includes(operator)) {
    return handleBooleanOperator(qb, operator, value);
  }

  switch (operator) {
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

const fieldLowerFn = qb => {
  if (qb.client.config.client === 'pg') {
    return 'LOWER(CAST(?? AS VARCHAR))';
  }
  return 'LOWER(??)';
};

const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

module.exports = buildQuery;