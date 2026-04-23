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
   * Create a query tree node from a model and an optional association
   * @param {Object} model - Strapi model
   * @param {Object} [assoc=null] - Strapi association
   */
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

  /**
   * Recursively generate nested joins for a dotted field path
   * @param {string} field - Field path (e.g., "author.name")
   * @param {Object} currentTree - Current node in the joins tree
   * @returns {string} SQL path with proper alias
   */
  const generateNestedJoins = (field, currentTree) => {
    const [key, ...rest] = field.split('.');
    const assoc = findAssoc(currentTree.model, key);

    if (!assoc) {
      return `${currentTree.alias}.${key}`;
    }

    const assocModel = strapi.db.getModelByAssoc(assoc);
    const nextParts = rest.length ? rest : [assocModel.primaryKey];

    if (!currentTree.joins[key]) {
      currentTree.joins[key] = createTreeNode(assocModel, assoc);
    }

    return generateNestedJoins(nextParts.join('.'), currentTree.joins[key]);
  };

  const generateNestedJoinsFromFields = each(field => generateNestedJoins(field, tree));

  /**
   * Build where clause objects with proper field paths
   * @param {Array} clauses - Raw where clauses
   * @param {Object} ctx - Context containing the root model
   * @returns {Array} Processed where clauses
   */
  const buildWhereClauses = (clauses, { model: rootModel }) => {
    return clauses.map(clause => {
      const { field, operator, value } = clause;

      if (BOOLEAN_OPERATORS.includes(operator)) {
        return {
          field,
          operator,
          value: value.map(v => buildWhereClauses(v, { model: rootModel })),
        };
      }

      const path = generateNestedJoins(field, tree);
      return { field: path, operator, value };
    });
  };

  /**
   * Recursively add publicationState queries for each join node
   * @param {Object} node - Current join tree node
   */
  const addFiltersQueriesToJoinTree = node => {
    _.each(node.joins, child => {
      const { model: childModel, alias } = child;
      runPopulateQueries(
        toQueries({
          publicationState: { query: filters.publicationState, model: childModel, alias },
        }),
        qb
      );
      addFiltersQueriesToJoinTree(child);
    });
  };

  /**
   * Recursively build knex joins from the join tree
   * @param {Object} currentNode - Current node in the join tree
   */
  const buildJoinsFromTree = currentNode => {
    Object.values(currentNode.joins).forEach(subNode => {
      buildJoin(qb, subNode.assoc, currentNode, subNode);
      buildJoinsFromTree(subNode);
    });
  };

  /**
   * Add table joins based on association nature
   * @param {Object} qb - Knex query builder
   * @param {Object} assoc - Association metadata
   * @param {Object} originInfo - Origin node info
   * @param {Object} destinationInfo - Destination node info
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

  const aliasedWhereClauses = buildWhereClauses(whereClauses, { model });
  aliasedWhereClauses.forEach(w => applyWhereClause({ qb, ...w }));

  generateNestedJoinsFromFields(sortClauses.map(prop('field')));
  buildJoinsFromTree(tree);
  addFiltersQueriesToJoinTree(tree);

  return tree;
};

/**
 * Apply a where clause to the query builder using operator handlers
 * @param {Object} options - Options
 * @param {Object} options.qb - Knex query builder
 * @param {string} options.field - Fully qualified field name
 * @param {string} options.operator - Operator string
 * @param {*} options.value - Value for the operator
 */
const applyWhereClause = ({ qb, field, operator, value }) => {
  const handler = operatorHandlers[operator];
  if (!handler) {
    throw new Error(`Unhandled whereClause : ${field} ${operator} ${value}`);
  }
  return handler(qb, field, value);
};

/**
 * Handlers for each supported operator
 */
const operatorHandlers = {
  and: (qb, _field, clauses) =>
    qb.where(andQb => {
      clauses.forEach(clause => {
        andQb.where(subQb => {
          if (Array.isArray(clause)) {
            clause.forEach(inner => subQb.where(innerQb => applyWhereClause({ qb: innerQb, ...inner })));
          } else {
            applyWhereClause({ qb: subQb, ...clause });
          }
        });
      });
    }),

  or: (qb, _field, clauses) =>
    qb.where(orQb => {
      clauses.forEach(clause => {
        orQb.orWhere(subQb => {
          if (Array.isArray(clause)) {
            clause.forEach(inner => subQb.where(innerQb => applyWhereClause({ qb: innerQb, ...inner })));
          } else {
            applyWhereClause({ qb: subQb, ...clause });
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
 * Helper to lower case a field for different DB clients
 * @param {Object} qb - Knex query builder
 * @returns {string} Lowercase function expression
 */
const fieldLowerFn = qb => {
  if (qb.client.config.client === 'pg') {
    return 'LOWER(CAST(?? AS VARCHAR))';
  }
  return 'LOWER(??)';
};

/**
 * Find an association on a model by its alias
 * @param {Object} model - Strapi model
 * @param {string} key - Alias to find
 * @returns {Object|undefined}
 */
const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

module.exports = buildQuery;