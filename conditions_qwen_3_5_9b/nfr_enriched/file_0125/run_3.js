'use strict';

const _ = require('lodash');
const { keys, each, prop, isEmpty } = require('lodash/fp');
const { singular } = require('pluralize');
const { toQueries, runPopulateQueries } = require('./utils/populate-queries');

const BOOLEAN_OPERATORS = ['or', 'and'];

/**
 * Builds a Bookshelf query by applying filters, sorting, and pagination.
 * @param {Object} options - Query options.
 * @param {Object} options.model - The Bookshelf model instance.
 * @param {Object} options.filters - Filter parameters (start, limit, sort, where).
 * @returns {Function} A function that accepts a query builder and configures it.
 */
const buildQuery = ({ model, filters }) => qb => {
  const joinsTree = buildJoinsAndFilter(qb, model, filters);

  const isSortQuery = _.has(filters, 'sort');
  const isSingleResult = _.has(filters, 'limit') && filters.limit === 1;
  const hasJoins = _.has(joinsTree, 'joins') && keys(joinsTree.joins).length > 0;
  const isDistinctJoin = !isSingleResult && hasJoins;
  const hasWhereFilters = _.has(filters, 'where') && Array.isArray(filters.where) && filters.where.length > 0;

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
 * Builds a sort clause for a specific field based on the joins tree.
 * @param {Object} tree - The joins tree containing aliased associations.
 * @param {Object} sortItem - The sort item containing field and order.
 * @returns {Object|null} The sort clause object or null if not found.
 */
const buildSortClauseFromTree = (tree, sortItem) => {
  const { field, order } = sortItem;

  if (!field.includes('.')) {
    return {
      column: `${tree.alias}.${field}`,
      order,
      alias: `_strapi_tmp_${tree.alias}_${field}`,
    };
  }

  const [relation, attribute] = field.split('.');
  const matchingJoin = Object.values(tree.joins).find(join => join.assoc.alias === relation);

  if (matchingJoin) {
    return {
      column: `${matchingJoin.alias}.${attribute}`,
      order,
      alias: `_strapi_tmp_${matchingJoin.alias}_${attribute}`,
    };
  }

  return null;
};

/**
 * Builds the joins tree and applies where filters to the query builder.
 * @param {Object} qb - Knex query builder.
 * @param {Object} model - Bookshelf model.
 * @param {Object} filters - Query filters.
 * @returns {Object} The constructed joins tree.
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

  const createTreeNode = (modelInstance, assoc = null) => ({
    alias: generateAlias(modelInstance.collectionName),
    assoc,
    model: modelInstance,
    joins: {},
  });

  const buildJoin = (qbInstance, assoc, originInfo, destinationInfo) => {
    if (['manyToMany', 'manyWay'].includes(assoc.nature)) {
      const joinTableAlias = generateAlias(assoc.tableCollectionName);
      const originColumnNameInJoinTable = getOriginColumnNameInJoinTable(assoc, joinTableAlias, originInfo);

      qbInstance.leftJoin(
        `${originInfo.model.databaseName}.${assoc.tableCollectionName} AS ${joinTableAlias}`,
        originColumnNameInJoinTable,
        `${originInfo.alias}.${originInfo.model.primaryKey}`
      );

      qbInstance.leftJoin(
        `${destinationInfo.model.databaseName}.${destinationInfo.model.collectionName} AS ${destinationInfo.alias}`,
        getDestinationJoinCondition(assoc, originInfo, destinationInfo),
        `${destinationInfo.alias}.${destinationInfo.model.primaryKey}`
      );
    } else {
      const externalKey = getExternalJoinKey(assoc, destinationInfo);
      const internalKey = getInternalJoinKey(assoc, originInfo);
      qbInstance.leftJoin(
        `${destinationInfo.model.databaseName}.${destinationInfo.model.collectionName} AS ${destinationInfo.alias}`,
        externalKey,
        internalKey
      );
    }
  };

  const getOriginColumnNameInJoinTable = (assoc, joinTableAlias, originInfo) => {
    if (assoc.nature === 'manyToMany') {
      return `${joinTableAlias}.${singular(originInfo.model.attributes[assoc.via].attribute)}`;
    }
    return `${joinTableAlias}.${singular(originInfo.model.collectionName)}`;
  };

  const getDestinationJoinCondition = (assoc, originInfo, destinationInfo) => {
    if (assoc.nature === 'manyToMany') {
      return `${joinTableAlias}.${singular(originInfo.model.attributes[assoc.alias].attribute)}`;
    }
    return `${joinTableAlias}.${singular(originInfo.model.collectionName)}`;
  };

  const getExternalJoinKey = (assoc, destinationInfo) => {
    if (assoc.type === 'collection') {
      return `${destinationInfo.alias}.${assoc.via || destinationInfo.model.primaryKey}`;
    }
    return `${destinationInfo.alias}.${destinationInfo.model.primaryKey}`;
  };

  const getInternalJoinKey = (assoc, originInfo) => {
    if (assoc.type === 'collection') {
      return `${originInfo.alias}.${originInfo.model.primaryKey}`;
    }
    return `${originInfo.alias}.${assoc.alias}`;
  };

  const buildJoinsFromTree = (qbInstance, queryTree) => {
    Object.keys(queryTree.joins).forEach(key => {
      const subQueryTree = queryTree.joins[key];
      buildJoin(qbInstance, subQueryTree.assoc, queryTree, subQueryTree);
      buildJoinsFromTree(qbInstance, subQueryTree);
    });
  };

  const generateNestedJoins = (fieldPath, tree) => {
    let [key, ...parts] = fieldPath.split('.');
    const assoc = findAssoc(tree.model, key);

    if (!assoc) {
      return `${tree.alias}.${key}`;
    }

    const assocModel = strapi.db.getModelByAssoc(assoc);
    const finalParts = parts.length === 0 ? [assocModel.primaryKey] : parts;
    const subPath = finalParts.join('.');

    if (!tree.joins[key]) {
      tree.joins[key] = createTreeNode(assocModel, assoc);
    }

    return generateNestedJoins(subPath, tree.joins[key]);
  };

  const generateNestedJoinsFromFields = fields => each(field => generateNestedJoins(field, tree));

  const buildWhereClauses = (whereClauses, context) => {
    return whereClauses.map(whereClause => {
      const { field, operator, value } = whereClause;

      if (BOOLEAN_OPERATORS.includes(operator)) {
        return { field, operator, value: value.map(v => buildWhereClauses(v, context)) };
      }

      const path = generateNestedJoins(field, tree);
      return { field: path, operator, value };
    });
  };

  const addFiltersQueriesToJoinTree = tree => {
    _.each(tree.joins, value => {
      const { alias, model } = value;
      runPopulateQueries(
        toQueries({ publicationState: { query: filters.publicationState, model, alias } }),
        qb
      );
      addFiltersQueriesToJoinTree(value);
    });
  };

  const tree = {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
  };

  const aliasedWhereClauses = buildWhereClauses(whereClauses, { model });
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  generateNestedJoinsFromFields(sortClauses.map(prop('field')));
  buildJoinsFromTree(qb, tree);
  addFiltersQueriesToJoinTree(tree);

  return tree;
};

/**
 * Builds a SQL WHERE clause based on the provided options.
 * @param {Object} options - Clause options.
 * @param {Object} options.qb - Query builder instance.
 * @param {string} options.field - Field name.
 * @param {string} options.operator - Comparison operator.
 * @param {*} options.value - Value to compare.
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
              orClause.forEach(orClauseItem =>
                subQb.where(andQb => buildWhereClause({ qb: andQb, ...orClauseItem }))
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