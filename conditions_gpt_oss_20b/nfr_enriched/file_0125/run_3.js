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
 * Build joins and where filters for a query
 * @param {Object} qb - knex query builder
 * @param {Object} model - Bookshelf model
 * @param {Object} filters - The query filters
 */
const buildJoinsAndFilter = (qb, model, filters) => {
  const { where: whereClauses = [], sort: sortClauses = [] } = filters;

  // Alias map for generating unique aliases
  const aliasMap = {};

  /**
   * Generate a unique alias for a given name
   * @param {string} name
   */
  const generateAlias = name => {
    if (!aliasMap[name]) {
      aliasMap[name] = 1;
    }
    const alias = `${name}_${aliasMap[name]}`;
    aliasMap[name] += 1;
    return alias;
  };

  /**
   * Create a query tree node
   * @param {Object} model
   * @param {Object|null} assoc
   */
  const createTreeNode = (model, assoc = null) => ({
    alias: generateAlias(model.collectionName),
    assoc,
    model,
    joins: {},
  });

  // Root tree
  const tree = {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
  };

  /**
   * Generate nested joins for a field path
   * @param {string} field
   * @param {Object} currentTree
   */
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
      currentTree.joins[key] = createTreeNode(assocModel, assoc);
    }

    return generateNestedJoins(parts.join('.'), currentTree.joins[key]);
  };

  /**
   * Build where clauses with proper table aliases
   * @param {Array} clauses
   */
  const buildWhereClauses = clauses => {
    return clauses.map(whereClause => {
      const { field, operator, value } = whereClause;

      if (BOOLEAN_OPERATORS.includes(operator)) {
        return {
          field,
          operator,
          value: value.map(v => buildWhereClauses(v)),
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
   * Recursively build joins from the tree
   * @param {Object} qb
   * @param {Object} currentTree
   */
  const buildJoinsFromTree = (qb, currentTree) => {
    Object.keys(currentTree.joins).forEach(key => {
      const subTree = currentTree.joins[key];
      buildJoin(qb, subTree.assoc, currentTree, subTree);
      buildJoinsFromTree(qb, subTree);
    });
  };

  /**
   * Add a join between two tables
   * @param {Object} qb
   * @param {Object} assoc
   * @param {Object} originInfo
   * @param {Object} destinationInfo
   */
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

  /**
   * Recursively add publication state queries to join tree
   * @param {Object} currentTree
   */
  const addFiltersQueriesToJoinTree = currentTree => {
    Object.values(currentTree.joins).forEach(value => {
      const { alias, model } = value;

      runPopulateQueries(
        toQueries({
          publicationState: { query: filters.publicationState, model, alias },
        }),
        qb
      );

      addFiltersQueriesToJoinTree(value);
    });
  };

  // Build where clauses and apply them
  const aliasedWhereClauses = buildWhereClauses(whereClauses);
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  // Force needed joins for deep sort clauses
  sortClauses.forEach(({ field }) => generateNestedJoins(field, tree));

  // Build joins
  buildJoinsFromTree(qb, tree);

  // Add publication state queries
  addFiltersQueriesToJoinTree(tree);

  return tree;
};

/**
 * Builds a sql where clause
 * @param {Object} options
 * @param {Object} options.qb - Bookshelf (knex) query builder
 * @param {Object} options.model - Bookshelf model
 * @param {string} options.field - Filtered field
 * @param {string} options.operator - Filter operator (=,in,not eq etc..)
 * @param {*} options.value - Filter value
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