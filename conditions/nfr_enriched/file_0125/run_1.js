```javascript
'use strict';

const _ = require('lodash');
const { keys, each, prop, isEmpty } = require('lodash/fp');
const { singular } = require('pluralize');
const { toQueries, runPopulateQueries } = require('./utils/populate-queries');

const BOOLEAN_OPERATORS = ['or', 'and'];
const MANY_RELATIONS = ['manyToMany', 'manyWay'];
const COMPARISON_OPERATORS = {
  eq: '=',
  ne: '!=',
  lt: '<',
  lte: '<=',
  gt: '>',
  gte: '>=',
};

/**
 * Build filters on a bookshelf query
 */
const buildQuery = ({ model, filters }) => qb => {
  const joinsTree = buildJoinsAndFilter(qb, model, filters);
  applyDistinct(qb, filters, joinsTree);
  applySorting(qb, filters, joinsTree);
  applyPagination(qb, filters);
  applyPublicationState(qb, filters);
};

/**
 * Apply distinct clause if needed
 */
const applyDistinct = (qb, filters, joinsTree) => {
  const isSingleResult = _.has(filters, 'limit') && filters.limit === 1;
  const hasJoins = _.has(joinsTree, 'joins') && keys(joinsTree.joins).length;
  const isDistinctJoin = !isSingleResult && hasJoins;
  const hasWhereFilters = _.has(filters, 'where') && Array.isArray(filters.where) && filters.where.length > 0;
  const isSortQuery = _.has(filters, 'sort');
  const isDistinctQuery = isDistinctJoin && (isSortQuery || hasWhereFilters);

  if (isDistinctQuery) {
    qb.distinct();
  }
};

/**
 * Apply sorting to query
 */
const applySorting = (qb, filters, joinsTree) => {
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
 * Apply pagination to query
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
 * Apply publication state filter
 */
const applyPublicationState = (qb, filters) => {
  if (_.has(filters, 'publicationState')) {
    runPopulateQueries(
      toQueries({ publicationState: { query: filters.publicationState, model: filters.model } }),
      qb
    );
  }
};

/**
 * Build a bookshelf sort clause based on joins tree
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
  const joinEntry = Object.values(tree.joins).find(({ assoc }) => relation === assoc.alias);

  if (!joinEntry) {
    return {};
  }

  const { alias } = joinEntry;
  return {
    column: `${alias}.${attribute}`,
    order,
    alias: `_strapi_tmp_${alias}_${attribute}`,
  };
};

/**
 * Add joins and where filters
 */
const buildJoinsAndFilter = (qb, model, filters) => {
  const { where: whereClauses = [], sort: sortClauses = [] } = filters;
  const aliasMap = {};
  const tree = createRootTreeNode(model);

  const generateAlias = name => {
    aliasMap[name] = (aliasMap[name] || 0) + 1;
    return `${name}_${aliasMap[name]}`;
  };

  const createTreeNode = (nodeModel, assoc = null) => ({
    alias: generateAlias(nodeModel.collectionName),
    assoc,
    model: nodeModel,
    joins: {},
  });

  const generateNestedJoins = (field, currentTree) => {
    const [key, ...parts] = field.split('.');
    const assoc = findAssoc(currentTree.model, key);

    if (!assoc) {
      return `${currentTree.alias}.${key}`;
    }

    const assocModel = strapi.db.getModelByAssoc(assoc);
    const nextParts = parts.length === 0 ? [assocModel.primaryKey] : parts;

    if (!currentTree.joins[key]) {
      currentTree.joins[key] = createTreeNode(assocModel, assoc);
    }

    return generateNestedJoins(nextParts.join('.'), currentTree.joins[key]);
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
      return { field: path, operator, value };
    });
  };

  const buildJoinsFromTree = currentTree => {
    Object.values(currentTree.joins).forEach(subTree => {
      buildJoin(qb, subTree.assoc, currentTree, subTree, generateAlias);
      buildJoinsFromTree(subTree);
    });
  };

  const addFiltersQueriesToJoinTree = currentTree => {
    _.each(currentTree.joins, ({ alias, model: nodeModel }) => {
      runPopulateQueries(
        toQueries({
          publicationState: { query: filters.publicationState, model: nodeModel, alias },
        }),
        qb
      );
      addFiltersQueriesToJoinTree(currentTree.joins[Object.keys(currentTree.joins)[0]]);
    });
  };

  const aliasedWhereClauses = buildWhereClauses(whereClauses, { model });
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  sortClauses.map(prop('field')).forEach(field => generateNestedJoins(field, tree));

  buildJoinsFromTree(tree);
  addFiltersQueriesToJoinTree(tree);

  return tree;
};

/**
 * Create root tree node
 */
const createRootTreeNode = model => ({
  alias: model.collectionName,
  assoc: null,
  model,
  joins: {},
});

/**
 * Build table joins
 */
const buildJoin = (qb, assoc, originInfo, destinationInfo, generateAlias) => {
  if (MANY_RELATIONS.includes(assoc.nature)) {
    buildManyRelationJoin(qb, assoc, originInfo, destinationInfo, generateAlias);
  } else {
    buildSimpleJoin(qb, assoc, originInfo, destinationInfo);
  }
};

/**
 * Build many-to-many or many-way relation join
 */
const buildManyRelationJoin = (qb, assoc, originInfo, destinationInfo, generateAlias) => {
  const joinTableAlias = generateAlias(assoc.tableCollectionName);
  const originColumnNameInJoinTable = getManyRelationOriginColumn(
    assoc,
    originInfo,
    destinationInfo,
    joinTableAlias
  );

  qb.leftJoin(
    `${originInfo.model.databaseName}.${assoc.tableCollectionName} AS ${joinTableAlias}`,
    originColumnNameInJoinTable,
    `${originInfo.alias}.${originInfo.model.primaryKey}`
  );

  const destinationColumn = `${joinTableAlias}.${singular(
    originInfo.model.attributes[assoc.alias].attribute
  )}_${originInfo.model.attributes[assoc.alias].column}`;

  qb.leftJoin(
    `${destinationInfo.model.databaseName}.${destinationInfo.model.collectionName} AS ${destinationInfo.alias}`,
    destinationColumn,
    `${destinationInfo.alias}.${destinationInfo.model.primaryKey}`
  );
};

/**
 * Get origin column name for many relation join
 */
const getManyRelationOriginColumn = (assoc, originInfo, destinationInfo, joinTableAlias) => {
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
 * Build simple relation join
 */
const buildSimpleJoin = (qb, assoc, originInfo, destinationInfo) => {
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
 * Build SQL where clause
 */
const buildWhereClause = ({ qb, field, operator, value }) => {
  if (Array.isArray(value) && !['and', 'or', 'in', 'nin'].includes(operator)) {
    return qb.where(subQb => {
      value.forEach(val => {
        subQb.orWhere(q => buildWhereClause({ qb: q, field, operator, value: val }));
      });
    });
  }

  const handler = WHERE_CLAUSE_HANDLERS[operator];
  if (handler) {
    return handler(qb, field, value);
  }

  throw new Error(`Unhandled whereClause : ${field} ${operator} ${value}`);
};

/**
 * Where clause handlers map
 */
const WHERE_CLAUSE_HANDLERS = {
  and: (qb, field, value) =>
    qb.where(andQb => {
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
    }),
  or: (qb, field, value) =>
    qb.where(orQb => {
      value.forEach(orClause => {
        orQb.orWhere(subQb => {
          if (Array.isArray(orClause)) {
            orClause.forEach(clause =>
              subQb.where(andQb => buildWhereClause({ qb: andQb, ...clause }))
            );
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
  contains: (qb, field, value) =>
    qb.whereRaw(`${getFieldLowerFn(qb)} LIKE LOWER(?)`, [field, `%${value}%`]),
  ncontains: (qb, field, value) =>
    qb.whereRaw(`${getFieldLowerFn(qb)} NOT LIKE LOWER(?)`, [field, `%${value}%`]),
  containss: (qb, field, value) => qb.where(field, 'like', `%${value}%`),
  ncontainss: (qb, field, value) => qb.whereNot(field, 'like', `%${value}%`),
  null: (qb, field, value) => (value ? qb.whereNull(field) : qb.whereNotNull(field)),
};

/**
 * Get field lower function based on database client
 */
const getFieldLowerFn = qb => {
  return qb.client.config.client === 'pg' ? 'LOWER(CAST(?? AS VARCHAR))' : 'LOWER(??)';
};

/**
 * Find association by alias
 */
const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

module.exports = buildQuery;
```