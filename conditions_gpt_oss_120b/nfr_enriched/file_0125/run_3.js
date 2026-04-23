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
 * Build joins, where clauses and related queries.
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

  const rootTree = {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
  };

  const tree = buildJoinsTree(rootTree, model, generateAlias);
  const aliasedWhereClauses = buildWhereClauses(whereClauses, tree, generateAlias);
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  // Ensure joins for deep sort
  generateNestedJoinsFromFields(sortClauses.map(prop('field')), tree, generateAlias);

  // Apply joins to query builder
  applyJoinsFromTree(qb, tree);
  // Populate publication state queries for each join
  populatePublicationStateQueries(qb, tree, filters.publicationState);

  return tree;
};

/**
 * Recursively create joins tree nodes.
 */
const buildJoinsTree = (node, model, generateAlias) => {
  const createNode = (model, assoc = null) => ({
    alias: generateAlias(model.collectionName),
    assoc,
    model,
    joins: {},
  });

  const traverse = (currentNode) => {
    const assocKeys = Object.keys(currentNode.joins);
    assocKeys.forEach(key => {
      const child = currentNode.joins[key];
      traverse(child);
    });
  };

  // Helper to add a join node when needed
  const addJoinNode = (fieldPath, currentNode) => {
    const [key, ...rest] = fieldPath.split('.');
    const assoc = findAssoc(currentNode.model, key);
    if (!assoc) {
      return `${currentNode.alias}.${key}`;
    }

    const assocModel = strapi.db.getModelByAssoc(assoc);
    if (!currentNode.joins[key]) {
      currentNode.joins[key] = createNode(assocModel, assoc);
    }

    if (rest.length === 0) {
      // Ensure primary key is included for leaf association
      return `${currentNode.joins[key].alias}.${assocModel.primaryKey}`;
    }

    return addJoinNode(rest.join('.'), currentNode.joins[key]);
  };

  // Expose utility for external callers
  node._addJoinPath = (field) => addJoinNode(field, node);
  traverse(node);
  return node;
};

/**
 * Generate nested joins for a list of fields.
 */
const generateNestedJoinsFromFields = (fields, tree, generateAlias) => {
  fields.forEach(field => {
    tree._addJoinPath(field);
  });
};

/**
 * Build where clauses with proper table aliases.
 */
const buildWhereClauses = (whereClauses, tree, generateAlias) => {
  return whereClauses.map(whereClause => {
    const { field, operator, value } = whereClause;

    if (BOOLEAN_OPERATORS.includes(operator)) {
      return {
        field,
        operator,
        value: value.map(v => buildWhereClauses(v, tree, generateAlias)),
      };
    }

    const path = tree._addJoinPath(field);
    return {
      field: path,
      operator,
      value,
    };
  });
};

/**
 * Apply all joins from the tree to the query builder.
 */
const applyJoinsFromTree = (qb, tree) => {
  const recurse = (originInfo, destinationInfo) => {
    const { assoc } = destinationInfo;
    if (!assoc) return;

    if (['manyToMany', 'manyWay'].includes(assoc.nature)) {
      const joinTableAlias = generateAliasForJoin(assoc.tableCollectionName);
      const originColumn = getOriginColumnInJoinTable(assoc, originInfo, destinationInfo);
      qb.leftJoin(
        `${originInfo.model.databaseName}.${assoc.tableCollectionName} AS ${joinTableAlias}`,
        originColumn,
        `${originInfo.alias}.${originInfo.model.primaryKey}`
      );

      qb.leftJoin(
        `${destinationInfo.model.databaseName}.${destinationInfo.model.collectionName} AS ${destinationInfo.alias}`,
        `${joinTableAlias}.${singular(originInfo.model.attributes[assoc.alias].attribute)}_${originInfo.model.attributes[assoc.alias].column}`,
        `${destinationInfo.alias}.${destinationInfo.model.primaryKey}`
      );
    } else {
      const externalKey = assoc.type === 'collection'
        ? `${destinationInfo.alias}.${assoc.via || destinationInfo.model.primaryKey}`
        : `${destinationInfo.alias}.${destinationInfo.model.primaryKey}`;

      const internalKey = assoc.type === 'collection'
        ? `${originInfo.alias}.${originInfo.model.primaryKey}`
        : `${originInfo.alias}.${assoc.alias}`;

      qb.leftJoin(
        `${destinationInfo.model.databaseName}.${destinationInfo.model.collectionName} AS ${destinationInfo.alias}`,
        externalKey,
        internalKey
      );
    }

    // Recurse into deeper joins
    each(child => recurse(destinationInfo, child), destinationInfo.joins);
  };

  each(child => recurse({ alias: tree.alias, model: tree.model, assoc: null }, child), tree.joins);
};

/**
 * Helper to generate a deterministic alias for join tables.
 */
const generateAliasForJoin = (base) => {
  // Simple deterministic alias based on base name
  return `${base}_join`;
};

/**
 * Determine the column in the join table that references the origin.
 */
const getOriginColumnInJoinTable = (assoc, originInfo, destinationInfo) => {
  if (assoc.nature === 'manyToMany') {
    return `${generateAliasForJoin(assoc.tableCollectionName)}.${singular(
      destinationInfo.model.attributes[assoc.via].attribute
    )}_${destinationInfo.model.attributes[assoc.via].column}`;
  }
  // manyWay
  return `${generateAliasForJoin(assoc.tableCollectionName)}.${singular(
    originInfo.model.collectionName
  )}_${originInfo.model.primaryKey}`;
};

/**
 * Populate publication state queries for each join node.
 */
const populatePublicationStateQueries = (qb, tree, publicationState) => {
  if (!publicationState) return;
  const recurse = ({ alias, model }) => {
    runPopulateQueries(
      toQueries({
        publicationState: { query: publicationState, model, alias },
      }),
      qb
    );
    each(child => recurse(child), model.joins);
  };
  recurse(tree);
};

/**
 * Builds a sql where clause.
 */
const buildWhereClause = ({ qb, field, operator, value }) => {
  const handlers = {
    and: (qb, val) => qb.where(andQb => {
      val.forEach(clause => {
        andQb.where(subQb => {
          if (Array.isArray(clause)) {
            clause.forEach(c => subQb.where(andQb => buildWhereClause({ qb: andQb, ...c })));
          } else {
            buildWhereClause({ qb: subQb, ...clause });
          }
        });
      });
    }),
    or: (qb, val) => qb.where(orQb => {
      val.forEach(clause => {
        orQb.orWhere(subQb => {
          if (Array.isArray(clause)) {
            clause.forEach(c => subQb.where(andQb => buildWhereClause({ qb: andQb, ...c })));
          } else {
            buildWhereClause({ qb: subQb, ...clause });
          }
        });
      });
    }),
    eq: (qb, val) => qb.where(field, val),
    ne: (qb, val) => qb.where(field, '!=', val),
    lt: (qb, val) => qb.where(field, '<', val),
    lte: (qb, val) => qb.where(field, '<=', val),
    gt: (qb, val) => qb.where(field, '>', val),
    gte: (qb, val) => qb.where(field, '>=', val),
    in: (qb, val) => qb.whereIn(field, Array.isArray(val) ? val : [val]),
    nin: (qb, val) => qb.whereNotIn(field, Array.isArray(val) ? val : [val]),
    contains: (qb, val) => qb.whereRaw(`${fieldLowerFn(qb)} LIKE LOWER(?)`, [field, `%${val}%`]),
    ncontains: (qb, val) => qb.whereRaw(`${fieldLowerFn(qb)} NOT LIKE LOWER(?)`, [field, `%${val}%`]),
    containss: (qb, val) => qb.where(field, 'like', `%${val}%`),
    ncontainss: (qb, val) => qb.whereNot(field, 'like', `%${val}%`),
    null: (qb, val) => (val ? qb.whereNull(field) : qb.whereNotNull(field)),
  };

  if (Array.isArray(value) && !['and', 'or', 'in', 'nin'].includes(operator)) {
    return qb.where(subQb => {
      value.forEach(val => {
        subQb.orWhere(q => buildWhereClause({ qb: q, field, operator, value: val }));
      });
    });
  }

  const handler = handlers[operator];
  if (handler) {
    return handler(qb, value);
  }

  throw new Error(`Unhandled whereClause : ${field} ${operator} ${value}`);
};

const fieldLowerFn = qb => {
  if (qb.client.config.client === 'pg') {
    return 'LOWER(CAST(?? AS VARCHAR))';
  }
  return 'LOWER(??)';
};

const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

module.exports = buildQuery;