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
 */
const applyDistinctIfNeeded = (qb, filters, joinsTree) => {
  const isSingleResult = _.has(filters, 'limit') && filters.limit === 1;
  const hasJoins = _.has(joinsTree, 'joins') && keys(joinsTree.joins).length;
  const isDistinctJoin = !isSingleResult && hasJoins;
  const hasWhereFilters =
    _.has(filters, 'where') && Array.isArray(filters.where) && filters.where.length > 0;
  const isSortQuery = _.has(filters, 'sort');

  const isDistinctQuery = isDistinctJoin && (isSortQuery || hasWhereFilters);
  if (isDistinctQuery) {
    qb.distinct();
  }
};

/**
 * Apply sorting to query if sort filters are present
 */
const applySortIfNeeded = (qb, filters, joinsTree) => {
  if (!_.has(filters, 'sort')) {
    return;
  }

  const clauses = filters.sort
    .map(buildSortClauseFromTree(joinsTree))
    .filter(c => !isEmpty(c));
  const orderBy = clauses.map(({ order, alias }) => ({ order, column: alias }));
  const orderColumns = clauses.map(({ alias, column }) => ({ [alias]: column }));
  const columns = [`${joinsTree.alias}.*`, ...orderColumns];

  qb.column(columns).orderBy(orderBy);
};

/**
 * Apply pagination (offset and limit) to query if present
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
 * Apply publication state filters if present
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
  const joinEntry = findJoinByRelation(tree.joins, relation);

  if (joinEntry) {
    const { alias } = joinEntry;
    return {
      column: `${alias}.${attribute}`,
      order,
      alias: `_strapi_tmp_${alias}_${attribute}`,
    };
  }

  return {};
};

/**
 * Find a join entry by relation alias
 */
const findJoinByRelation = (joins, relation) => {
  for (const joinEntry of Object.values(joins)) {
    if (relation === joinEntry.assoc.alias) {
      return joinEntry;
    }
  }
  return null;
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

  const tree = {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
  };

  const generateAlias = name => {
    if (!aliasMap[name]) {
      aliasMap[name] = 1;
    }
    const alias = `${name}_${aliasMap[name]}`;
    aliasMap[name] += 1;
    return alias;
  };

  const createTreeNode = (nodeModel, assoc = null) => {
    return {
      alias: generateAlias(nodeModel.collectionName),
      assoc,
      model: nodeModel,
      joins: {},
    };
  };

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

  const buildWhereClauses = (clauses, context) => {
    return clauses.map(whereClause => {
      const { field, operator, value } = whereClause;

      if (BOOLEAN_OPERATORS.includes(operator)) {
        return {
          field,
          operator,
          value: value.map(v => buildWhereClauses(v, context)),
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

  const buildJoinsFromTree = (queryBuilder, queryTree) => {
    Object.keys(queryTree.joins).forEach(key => {
      const subQueryTree = queryTree.joins[key];
      buildJoinForAssociation(queryBuilder, subQueryTree.assoc, queryTree, subQueryTree, generateAlias);
      buildJoinsFromTree(queryBuilder, subQueryTree);
    });
  };

  const addFiltersQueriesToJoinTree = (currentTree) => {
    _.each(currentTree.joins, value => {
      const { alias, model: joinModel } = value;

      runPopulateQueries(
        toQueries({
          publicationState: { query: filters.publicationState, model: joinModel, alias },
        }),
        qb
      );

      addFiltersQueriesToJoinTree(value);
    });
  };

  const aliasedWhereClauses = buildWhereClauses(whereClauses, { model });
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  each(field => generateNestedJoins(field, tree))(sortClauses.map(prop('field')));

  buildJoinsFromTree(qb, tree);
  addFiltersQueriesToJoinTree(tree);

  return tree;
};

/**
 * Build a single join for an association
 */
const buildJoinForAssociation = (qb, assoc, originInfo, destinationInfo, generateAlias) => {
  if (['manyToMany', 'manyWay'].includes(assoc.nature)) {
    buildManyToManyJoin(qb, assoc, originInfo, destinationInfo, generateAlias);
  } else {
    buildOneToManyJoin(qb, assoc, originInfo, destinationInfo);
  }
};

/**
 * Build a many-to-many or many-way join
 */
const buildManyToManyJoin = (qb, assoc, originInfo, destinationInfo, generateAlias) => {
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

  const destinationColumnInJoinTable = buildDestinationColumnInJoinTable(
    assoc,
    joinTableAlias,
    originInfo
  );

  qb.leftJoin(
    `${destinationInfo.model.databaseName}.${destinationInfo.model.collectionName} AS ${destinationInfo.alias}`,
    destinationColumnInJoinTable,
    `${destinationInfo.alias}.${destinationInfo.model.primaryKey}`
  );
};

/**
 * Build origin column name in join table for many-to-many relationships
 */
const buildOriginColumnNameInJoinTable = (assoc, joinTableAlias, originInfo, destinationInfo) => {
  if (assoc.nature === 'manyToMany') {
    return `${joinTableAlias}.${singular(
      destinationInfo.model.attributes[assoc.via].attribute
    )}_${destinationInfo.model.attributes[assoc.via].column}`;
  } else if (assoc.nature === 'manyWay') {
    return `${joinTableAlias}.${singular(originInfo.model.collectionName)}_${
      originInfo.model.primaryKey
    }`;
  }
};

/**
 * Build destination column name in join table
 */
const buildDestinationColumnInJoinTable = (assoc, joinTableAlias, originInfo) => {
  return `${joinTableAlias}.${singular(originInfo.model.attributes[assoc.alias].attribute)}_${
    originInfo.model.attributes[assoc.alias].column
  }`;
};

/**
 * Build a one-to-many or many-to-one join
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
 * Builds a sql where clause
 * @param {Object} options - Options
 * @param {Object} options.qb - Bookshelf (knex) query builder
 * @param {Object} options.field - Filtered field
 * @param {Object} options.operator - Filter operator (=,in,not eq etc..)
 * @param {Object} options.value - Filter value
 */
const buildWhereClause = ({ qb, field, operator, value }) => {
  if (Array.isArray(value) && !['and', 'or', 'in', 'nin'].includes(operator)) {
    return buildArrayWhereClause(qb, field, operator, value);
  }

  return buildOperatorWhereClause(qb, field, operator, value);
};

/**
 * Build where clause for array values with OR logic
 */
const buildArrayWhereClause = (qb, field, operator, value) => {
  return qb.where(subQb => {
    for (let val of value) {
      subQb.orWhere(q => buildWhereClause({ qb: q, field, operator, value: val }));
    }
  });
};

/**
 * Build where clause based on operator type
 */
const buildOperatorWhereClause = (qb, field, operator, value) => {
  switch (operator) {
    case 'and':
      return buildAndWhereClause(qb, field, value);
    case 'or':
      return buildOrWhereClause(qb, field, value);
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

/**
 * Build AND where clause
 */
const buildAndWhereClause = (qb, field, value) => {
  return qb.where(andQb => {
    value.forEach(andClause => {
      andQb.where(subQb => {
        if (Array.isArray(andClause)) {
          andClause.forEach(clause =>
            subQb.where(innerQb => buildWhereClause({ qb: innerQb, ...clause }))
          );
        } else {
          buildWhereClause({ qb: subQb, ...andClause });
        }
      });
    });
  });
};

/**
 * Build OR where clause
 */
const buildOrWhereClause = (qb, field, value) => {
  return qb.where(orQb => {
    value.forEach(orClause => {
      orQb.orWhere(subQb => {
        if (Array.isArray(orClause)) {
          orClause.forEach(clause =>
            subQb.where(innerQb => buildWhereClause({ qb: innerQb, ...clause }))
          );
        } else {
          buildWhereClause({ qb: subQb, ...orClause });
        }
      });
    });
  });
};

/**
 * Get the appropriate LOWER function for the database client
 */
const fieldLowerFn = qb => {
  if (qb.client.config.client === 'pg') {
    return 'LOWER(CAST(?? AS VARCHAR))';
  }
  return 'LOWER(??)';
};

/**
 * Find an association by alias in a model
 */
const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

module.exports = buildQuery;