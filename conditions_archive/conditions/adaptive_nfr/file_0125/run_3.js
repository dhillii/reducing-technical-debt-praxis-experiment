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

  applyDistinctIfNeeded(qb, filters, joinsTree);
  applySortIfNeeded(qb, filters, joinsTree);
  applyPaginationIfNeeded(qb, filters);
  applyPublicationStateIfNeeded(qb, filters);
};

/**
 * Apply DISTINCT clause if needed based on filters and joins
 * @param {Object} qb - Knex query builder
 * @param {Object} filters - Query filters
 * @param {Object} joinsTree - Joins tree structure
 */
const applyDistinctIfNeeded = (qb, filters, joinsTree) => {
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
};

/**
 * Apply sorting if sort filters are present
 * @param {Object} qb - Knex query builder
 * @param {Object} filters - Query filters
 * @param {Object} joinsTree - Joins tree structure
 */
const applySortIfNeeded = (qb, filters, joinsTree) => {
  if (!_.has(filters, 'sort')) {
    return;
  }

  const clauses = filters.sort.map(buildSortClauseFromTree(joinsTree)).filter(c => !isEmpty(c));
  const orderBy = clauses.map(({ order, alias }) => ({ order, column: alias }));
  const orderColumns = clauses.map(({ alias, column }) => ({ [alias]: column }));
  const columns = [`${joinsTree.alias}.*`, ...orderColumns];

  qb.column(columns).orderBy(orderBy);
};

/**
 * Apply pagination (offset and limit) if present
 * @param {Object} qb - Knex query builder
 * @param {Object} filters - Query filters
 */
const applyPaginationIfNeeded = (qb, filters) => {
  if (_.has(filters, 'start')) {
    qb.offset(filters.start);
  }

  if (_.has(filters, 'limit') && filters.limit >= 0) {
    qb.limit(filters.limit);
  }
};

/**
 * Apply publication state filter if present
 * @param {Object} qb - Knex query builder
 * @param {Object} filters - Query filters
 */
const applyPublicationStateIfNeeded = (qb, filters) => {
  if (_.has(filters, 'publicationState')) {
    runPopulateQueries(
      toQueries({ publicationState: { query: filters.publicationState, model: filters.model } }),
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

  /**
   * Returns an alias for a name (simple incremental alias name)
   * @param {string} name - name to alias
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

  // tree made to create the joins structure
  const tree = {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
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
   * Add table joins based on association nature
   * @param {Object} qb - Knex query builder
   * @param {Object} assoc - Models association info
   * @param {Object} originInfo - origin from which you are making a join
   * @param {Object} destinationInfo - destination with which we are making a join
   */
  const buildJoin = (qb, assoc, originInfo, destinationInfo) => {
    if (isManyToManyOrManyWay(assoc.nature)) {
      buildManyToManyJoin(qb, assoc, originInfo, destinationInfo);
    } else {
      buildOneToManyJoin(qb, assoc, originInfo, destinationInfo);
    }
  };

  /**
   * Check if association is many-to-many or many-way
   * @param {string} nature - Association nature
   */
  const isManyToManyOrManyWay = nature => ['manyToMany', 'manyWay'].includes(nature);

  /**
   * Build many-to-many or many-way join
   * @param {Object} qb - Knex query builder
   * @param {Object} assoc - Association info
   * @param {Object} originInfo - Origin info
   * @param {Object} destinationInfo - Destination info
   */
  const buildManyToManyJoin = (qb, assoc, originInfo, destinationInfo) => {
    const joinTableAlias = generateAlias(assoc.tableCollectionName);

    const originColumnNameInJoinTable = buildOriginColumnNameInJoinTable(
      assoc,
      joinTableAlias,
      originInfo,
      destinationInfo
    );

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
   * Build origin column name in join table based on association nature
   * @param {Object} assoc - Association info
   * @param {string} joinTableAlias - Join table alias
   * @param {Object} originInfo - Origin info
   * @param {Object} destinationInfo - Destination info
   */
  const buildOriginColumnNameInJoinTable = (assoc, joinTableAlias, originInfo, destinationInfo) => {
    if (assoc.nature === 'manyToMany') {
      return `${joinTableAlias}.${singular(
        destinationInfo.model.attributes[assoc.via].attribute
      )}_${destinationInfo.model.attributes[assoc.via].column}`;
    }
    return `${joinTableAlias}.${singular(originInfo.model.collectionName)}_${
      originInfo.model.primaryKey
    }`;
  };

  /**
   * Build one-to-many join
   * @param {Object} qb - Knex query builder
   * @param {Object} assoc - Association info
   * @param {Object} originInfo - Origin info
   * @param {Object} destinationInfo - Destination info
   */
  const buildOneToManyJoin = (qb, assoc, originInfo, destinationInfo) => {
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
   * Returns the SQL path for a query field.
   * Adds table to the joins tree
   * @param {string} field a field used to filter
   * @param {Object} tree joins tree
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

  const generateNestedJoinsFromFields = each(field => generateNestedJoins(field, tree));

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

      const path = generateNestedJoins(field, tree);

      return {
        field: path,
        operator,
        value,
      };
    });
  };

  /**
   * Add queries on tree's joins (deep search, deep sort) based on given filters
   * @param tree - joins tree
   */
  const addFiltersQueriesToJoinTree = tree => {
    _.each(tree.joins, value => {
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

  const aliasedWhereClauses = buildWhereClauses(whereClauses, { model });
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  generateNestedJoinsFromFields(sortClauses.map(prop('field')));

  buildJoinsFromTree(qb, tree);
  addFiltersQueriesToJoinTree(tree);

  return tree;
};

/**
 * Operator handler strategy map
 */
const operatorHandlers = {
  and: (qb, field, value) => {
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
  },
  or: (qb, field, value) => {
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
  },
  eq: (qb, field, value) => qb.where(field, value),
  ne: (qb, field, value) => qb.where(field, '!=', value),
  lt: (qb, field, value) => qb.where(field, '<', value),
  lte: (qb, field, value) => qb.where(field, '<=', value),
  gt: (qb, field, value) => qb.where(field, '>', value),
  gte: (qb, field, value) => qb.where(field, '>=', value),
  in: (qb, field, value) => qb.whereIn(field, Array.isArray(value) ? value : [value]),
  nin: (qb, field, value) => qb.whereNotIn(field, Array.isArray(value) ? value : [value]),
  contains: (qb, field, value) =>
    qb.whereRaw(`${fieldLowerFn(qb)} LIKE LOWER(?)`, [field, `%${value}%`]),
  ncontains: (qb, field, value) =>
    qb.whereRaw(`${fieldLowerFn(qb)} NOT LIKE LOWER(?)`, [field, `%${value}%`]),
  containss: (qb, field, value) => qb.where(field, 'like', `%${value}%`),
  ncontainss: (qb, field, value) => qb.whereNot(field, 'like', `%${value}%`),
  null: (qb, field, value) => (value ? qb.whereNull(field) : qb.whereNotNull(field)),
};

/**
 * Check if value is array and operator is not a boolean/set operator
 * @param {*} value - The value to check
 * @param {string} operator - The operator
 */
const isArrayValueWithNonSetOperator = (value, operator) => {
  return Array.isArray(value) && !['and', 'or', 'in', 'nin'].includes(operator);
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
  if (isArrayValueWithNonSetOperator(value, operator)) {
    return qb.where(subQb => {
      for (let val of value) {
        subQb.orWhere(q => buildWhereClause({ qb: q, field, operator, value: val }));
      }
    });
  }

  const handler = operatorHandlers[operator];
  if (handler) {
    return handler(qb, field, value);
  }

  throw new Error(`Unhandled whereClause : ${field} ${operator} ${value}`);
};

/**
 * Get the appropriate LOWER function for the database client
 * @param {Object} qb - Knex query builder
 */
const fieldLowerFn = qb => {
  if (qb.client.config.client === 'pg') {
    return 'LOWER(CAST(?? AS VARCHAR))';
  }
  return 'LOWER(??)';
};

/**
 * Find association by alias in model
 * @param {Object} model - Strapi model
 * @param {string} key - Association alias
 */
const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

module.exports = buildQuery;
```