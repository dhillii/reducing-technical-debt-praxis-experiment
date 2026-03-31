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

const buildQuery = ({ model, filters }) => qb => {
  const joinsTree = buildJoinsAndFilter(qb, model, filters);
  applyDistinct(qb, filters, joinsTree);
  applySorting(qb, filters, joinsTree);
  applyPagination(qb, filters);
  applyPublicationState(qb, filters);
};

const applyDistinct = (qb, filters, joinsTree) => {
  const isSingleResult = _.has(filters, 'limit') && filters.limit === 1;
  const hasJoins = _.has(joinsTree, 'joins') && keys(joinsTree.joins).length;
  const isDistinctJoin = !isSingleResult && hasJoins;
  const hasWhereFilters = _.has(filters, 'where') && Array.isArray(filters.where) && filters.where.length > 0;
  const isSortQuery = _.has(filters, 'sort');

  if (isDistinctJoin && (isSortQuery || hasWhereFilters)) {
    qb.distinct();
  }
};

const applySorting = (qb, filters, joinsTree) => {
  if (!_.has(filters, 'sort')) return;

  const clauses = filters.sort
    .map(buildSortClauseFromTree(joinsTree))
    .filter(c => !isEmpty(c));

  const orderBy = clauses.map(({ order, alias }) => ({ order, column: alias }));
  const orderColumns = clauses.map(({ alias, column }) => ({ [alias]: column }));
  const columns = [`${joinsTree.alias}.*`, ...orderColumns];

  qb.column(columns).orderBy(orderBy);
};

const applyPagination = (qb, filters) => {
  if (_.has(filters, 'start')) {
    qb.offset(filters.start);
  }

  if (_.has(filters, 'limit') && filters.limit >= 0) {
    qb.limit(filters.limit);
  }
};

const applyPublicationState = (qb, filters) => {
  if (_.has(filters, 'publicationState')) {
    runPopulateQueries(
      toQueries({ publicationState: { query: filters.publicationState, model: filters.model } }),
      qb
    );
  }
};

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

  const buildJoin = (qb, assoc, originInfo, destinationInfo) => {
    if (MANY_RELATIONS.includes(assoc.nature)) {
      buildManyRelationJoin(qb, assoc, originInfo, destinationInfo, generateAlias);
    } else {
      buildSimpleRelationJoin(qb, assoc, originInfo, destinationInfo);
    }
  };

  const buildJoinsFromTree = (qb, queryTree) => {
    Object.keys(queryTree.joins).forEach(key => {
      const subQueryTree = queryTree.joins[key];
      buildJoin(qb, subQueryTree.assoc, queryTree, subQueryTree);
      buildJoinsFromTree(qb, subQueryTree);
    });
  };

  const generateNestedJoins = (field, currentTree) => {
    const [key, ...parts] = field.split('.');
    const assoc = findAssoc(currentTree.model, key);

    if (!assoc) {
      return `${currentTree.alias}.${key}`;
    }

    const assocModel = strapi.db.getModelByAssoc(assoc);
    const finalParts = parts.length === 0 ? [assocModel.primaryKey] : parts;

    if (!currentTree.joins[key]) {
      currentTree.joins[key] = createTreeNode(assocModel, assoc);
    }

    return generateNestedJoins(finalParts.join('.'), currentTree.joins[key]);
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

      return {
        field: generateNestedJoins(field, tree),
        operator,
        value,
      };
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
      addFiltersQueriesToJoinTree(currentTree.joins[alias]);
    });
  };

  const aliasedWhereClauses = buildWhereClauses(whereClauses, { model });
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  sortClauses.map(prop('field')).forEach(field => generateNestedJoins(field, tree));

  buildJoinsFromTree(qb, tree);
  addFiltersQueriesToJoinTree(tree);

  return tree;
};

const buildManyRelationJoin = (qb, assoc, originInfo, destinationInfo, generateAlias) => {
  const joinTableAlias = generateAlias(assoc.tableCollectionName);
  const originColumnNameInJoinTable = buildOriginColumnName(
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
    buildDestinationColumnName(assoc, joinTableAlias, originInfo),
    `${destinationInfo.alias}.${destinationInfo.model.primaryKey}`
  );
};

const buildOriginColumnName = (assoc, joinTableAlias, originInfo, destinationInfo) => {
  if (assoc.nature === 'manyToMany') {
    return `${joinTableAlias}.${singular(
      destinationInfo.model.attributes[assoc.via].attribute
    )}_${destinationInfo.model.attributes[assoc.via].column}`;
  }
  return `${joinTableAlias}.${singular(originInfo.model.collectionName)}_${originInfo.model.primaryKey}`;
};

const buildDestinationColumnName = (assoc, joinTableAlias, originInfo) => {
  return `${joinTableAlias}.${singular(originInfo.model.attributes[assoc.alias].attribute)}_${
    originInfo.model.attributes[assoc.alias].column
  }`;
};

const buildSimpleRelationJoin = (qb, assoc, originInfo, destinationInfo) => {
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

const createRootTreeNode = model => ({
  alias: model.collectionName,
  assoc: null,
  model,
  joins: {},
});

const buildWhereClause = ({ qb, field, operator, value }) => {
  if (Array.isArray(value) && !['and', 'or', 'in', 'nin'].includes(operator)) {
    return qb.where(subQb => {
      value.forEach(val => {
        subQb.orWhere(q => buildWhereClause({ qb: q, field, operator, value: val }));
      });
    });
  }

  if (operator === 'and') {
    return buildAndClause(qb, value);
  }

  if (operator === 'or') {
    return buildOrClause(qb, value);
  }

  if (COMPARISON_OPERATORS[operator]) {
    return qb.where(field, COMPARISON_OPERATORS[operator], value);
  }

  return buildSpecialOperator(qb, field, operator, value);
};

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

const buildSpecialOperator = (qb, field, operator, value) => {
  switch (operator) {
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
  return qb.client.config.client === 'pg' ? 'LOWER(CAST(?? AS VARCHAR))' : 'LOWER(??)';
};

const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

module.exports = buildQuery;
```