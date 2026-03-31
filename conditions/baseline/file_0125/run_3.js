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

const ARRAY_OPERATORS = ['and', 'or', 'in', 'nin'];

/**
 * Build filters on a bookshelf query
 */
const buildQuery = ({ model, filters }) => qb => {
  const joinsTree = buildJoinsAndFilter(qb, model, filters);
  applySorting(qb, filters, joinsTree);
  applyPagination(qb, filters);
  applyPublicationState(qb, filters);
};

/**
 * Apply sorting to query
 */
const applySorting = (qb, filters, joinsTree) => {
  if (!_.has(filters, 'sort')) return;

  const isSingleResult = _.has(filters, 'limit') && filters.limit === 1;
  const hasJoins = _.has(joinsTree, 'joins') && keys(joinsTree.joins).length;
  const hasWhereFilters = _.has(filters, 'where') && Array.isArray(filters.where) && filters.where.length > 0;

  if (!isSingleResult && hasJoins && hasWhereFilters) {
    qb.distinct();
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

  if (!joinEntry) return {};

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

  const generateAlias = name => {
    aliasMap[name] = (aliasMap[name] || 0) + 1;
    return `${name}_${aliasMap[name]}`;
  };

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

  const generateNestedJoins = (field, tree) => {
    const [key, ...parts] = field.split('.');
    const assoc = findAssoc(tree.model, key);

    if (!assoc) {
      return `${tree.alias}.${key}`;
    }

    const assocModel = strapi.db.getModelByAssoc(assoc);
    const finalParts = parts.length === 0 ? [assocModel.primaryKey] : parts;

    if (!tree.joins[key]) {
      tree.joins[key] = createTreeNode(assocModel, assoc);
    }

    return generateNestedJoins(finalParts.join('.'), tree.joins[key]);
  };

  const buildWhereClauses = (whereClauses, { model }) => {
    return whereClauses.map(whereClause => {
      const { field, operator, value } = whereClause;

      if (BOOLEAN_OPERATORS.includes(operator)) {
        return {
          field,
          operator,
          value: value.map(v => buildWhereClauses(v, { model })),
        };
      }

      return {
        field: generateNestedJoins(field, tree),
        operator,
        value,
      };
    });
  };

  const buildJoinsFromTree = (qb, queryTree) => {
    Object.values(queryTree.joins).forEach(subQueryTree => {
      buildJoin(qb, subQueryTree.assoc, queryTree, subQueryTree);
      buildJoinsFromTree(qb, subQueryTree);
    });
  };

  const addFiltersQueriesToJoinTree = tree => {
    _.each(tree.joins, ({ alias, model }) => {
      runPopulateQueries(
        toQueries({
          publicationState: { query: filters.publicationState, model, alias },
        }),
        qb
      );
      addFiltersQueriesToJoinTree(tree);
    });
  };

  const aliasedWhereClauses = buildWhereClauses(whereClauses, { model });
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  sortClauses.map(prop('field')).forEach(field => generateNestedJoins(field, tree));

  buildJoinsFromTree(qb, tree);
  addFiltersQueriesToJoinTree(tree);

  return tree;
};

/**
 * Build table joins
 */
const buildJoin = (qb, assoc, originInfo, destinationInfo) => {
  if (MANY_RELATIONS.includes(assoc.nature)) {
    buildManyRelationJoin(qb, assoc, originInfo, destinationInfo);
  } else {
    buildSimpleJoin(qb, assoc, originInfo, destinationInfo);
  }
};

/**
 * Build many-to-many or many-way relation join
 */
const buildManyRelationJoin = (qb, assoc, originInfo, destinationInfo) => {
  const joinTableAlias = `${assoc.tableCollectionName}_${Date.now()}`;
  const originColumnName = buildOriginColumnName(assoc, originInfo, destinationInfo, joinTableAlias);

  qb.leftJoin(
    `${originInfo.model.databaseName}.${assoc.tableCollectionName} AS ${joinTableAlias}`,
    originColumnName,
    `${originInfo.alias}.${originInfo.model.primaryKey}`
  );

  qb.leftJoin(
    `${destinationInfo.model.databaseName}.${destinationInfo.model.collectionName} AS ${destinationInfo.alias}`,
    buildDestinationColumnName(assoc, originInfo, joinTableAlias),
    `${destinationInfo.alias}.${destinationInfo.model.primaryKey}`
  );
};

/**
 * Build origin column name for many relation
 */
const buildOriginColumnName = (assoc, originInfo, destinationInfo, joinTableAlias) => {
  if (assoc.nature === 'manyToMany') {
    const viaAttr = destinationInfo.model.attributes[assoc.via];
    return `${joinTableAlias}.${singular(viaAttr.attribute)}_${viaAttr.column}`;
  }

  const originAttr = originInfo.model.collectionName;
  return `${joinTableAlias}.${singular(originAttr)}_${originInfo.model.primaryKey}`;
};

/**
 * Build destination column name for many relation
 */
const buildDestinationColumnName = (assoc, originInfo, joinTableAlias) => {
  const aliasAttr = originInfo.model.attributes[assoc.alias];
  return `${joinTableAlias}.${singular(aliasAttr.attribute)}_${aliasAttr.column}`;
};

/**
 * Build simple relation join
 */
const buildSimpleJoin = (qb, assoc, originInfo, destinationInfo) => {
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
};

/**
 * Build SQL where clause
 */
const buildWhereClause = ({ qb, field, operator, value }) => {
  if (Array.isArray(value) && !ARRAY_OPERATORS.includes(operator)) {
    return qb.where(subQb => {
      value.forEach(val => {
        subQb.orWhere(q => buildWhereClause({ qb: q, field, operator, value: val }));
      });
    });
  }

  if (COMPARISON_OPERATORS[operator]) {
    return qb.where(field, COMPARISON_OPERATORS[operator], value);
  }

  switch (operator) {
    case 'and':
      return buildAndClause(qb, value);
    case 'or':
      return buildOrClause(qb, value);
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
      throw new Error(`Unhandled whereClause: ${field} ${operator} ${value}`);
  }
};

/**
 * Build AND clause
 */
const buildAndClause = (qb, value) => {
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
};

/**
 * Build OR clause
 */
const buildOrClause = (qb, value) => {
  return qb.where(orQb => {
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
  });
};

/**
 * Get field lower function based on database client
 */
const fieldLowerFn = qb => {
  return qb.client.config.client === 'pg' ? 'LOWER(CAST(?? AS VARCHAR))' : 'LOWER(??)';
};

/**
 * Find association by alias
 */
const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

module.exports = buildQuery;
```