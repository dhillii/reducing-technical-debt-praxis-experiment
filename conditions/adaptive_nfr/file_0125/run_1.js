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
  applyQueryModifiers(qb, filters, joinsTree);
};

const applyQueryModifiers = (qb, filters, joinsTree) => {
  const isSortQuery = _.has(filters, 'sort');
  const isSingleResult = _.has(filters, 'limit') && filters.limit === 1;
  const hasJoins = _.has(joinsTree, 'joins') && keys(joinsTree.joins).length;
  const hasWhereFilters = _.has(filters, 'where') && Array.isArray(filters.where) && filters.where.length > 0;

  if (!isSingleResult && hasJoins && (isSortQuery || hasWhereFilters)) {
    qb.distinct();
  }

  if (isSortQuery) {
    applySorting(qb, filters.sort, joinsTree);
  }

  if (_.has(filters, 'start')) {
    qb.offset(filters.start);
  }

  if (_.has(filters, 'limit') && filters.limit >= 0) {
    qb.limit(filters.limit);
  }

  if (_.has(filters, 'publicationState')) {
    runPopulateQueries(
      toQueries({ publicationState: { query: filters.publicationState, model: joinsTree.model } }),
      qb
    );
  }
};

const applySorting = (qb, sortClauses, joinsTree) => {
  const clauses = sortClauses
    .map(buildSortClauseFromTree(joinsTree))
    .filter(c => !isEmpty(c));

  const orderBy = clauses.map(({ order, alias }) => ({ order, column: alias }));
  const orderColumns = clauses.map(({ alias, column }) => ({ [alias]: column }));
  const columns = [`${joinsTree.alias}.*`, ...orderColumns];

  qb.column(columns).orderBy(orderBy);
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

  const buildJoin = (assoc, originInfo, destinationInfo) => {
    if (MANY_RELATIONS.includes(assoc.nature)) {
      buildManyRelationJoin(qb, assoc, originInfo, destinationInfo, generateAlias);
    } else {
      buildSimpleRelationJoin(qb, assoc, originInfo, destinationInfo);
    }
  };

  const generateNestedJoins = (field, currentTree) => {
    const [key, ...parts] = field.split('.');
    const assoc = findAssoc(currentTree.model, key);

    if (!assoc) {
      return `${currentTree.alias}.${key}`;
    }

    const assocModel = strapi.db.getModelByAssoc(assoc);
    const remainingParts = parts.length === 0 ? [assocModel.primaryKey] : parts;

    if (!currentTree.joins[key]) {
      currentTree.joins[key] = createTreeNode(assocModel, assoc);
    }

    return generateNestedJoins(remainingParts.join('.'), currentTree.joins[key]);
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

  const buildJoinsFromTree = currentTree => {
    Object.values(currentTree.joins).forEach(subTree => {
      buildJoin(subTree.assoc, currentTree, subTree);
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
      addFiltersQueriesToJoinTree(currentTree);
    });
  };

  // Generate nested joins for sort fields
  sortClauses.map(prop('field')).forEach(field => generateNestedJoins(field, tree));

  // Build and apply where clauses
  const aliasedWhereClauses = buildWhereClauses(whereClauses, { model });
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  // Build joins and apply filters
  buildJoinsFromTree(tree);
  addFiltersQueriesToJoinTree(tree);

  return tree;
};

const buildManyRelationJoin = (qb, assoc, originInfo, destinationInfo, generateAlias) => {
  const joinTableAlias = generateAlias(assoc.tableCollectionName);
  const originColumnName = buildOriginColumnName(
    assoc,
    joinTableAlias,
    originInfo,
    destinationInfo
  );

  qb.leftJoin(
    `${originInfo.model.databaseName}.${assoc.tableCollectionName} AS ${joinTableAlias}`,
    originColumnName,
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
    const viaAttr = destinationInfo.model.attributes[assoc.via];
    return `${joinTableAlias}.${singular(viaAttr.attribute)}_${viaAttr.column}`;
  }
  return `${joinTableAlias}.${singular(originInfo.model.collectionName)}_${originInfo.model.primaryKey}`;
};

const buildDestinationColumnName = (assoc, joinTableAlias, originInfo) => {
  const aliasAttr = originInfo.model.attributes[assoc.alias];
  return `${joinTableAlias}.${singular(aliasAttr.attribute)}_${aliasAttr.column}`;
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

const buildWhereClause = ({ qb, field, operator, value }) => {
  if (Array.isArray(value) && !['and', 'or', 'in', 'nin'].includes(operator)) {
    return qb.where(subQb => {
      value.forEach(val => {
        subQb.orWhere(q => buildWhereClause({ qb: q, field, operator, value: val }));
      });
    });
  }

  const operatorHandlers = {
    and: () => buildAndClause(qb, value),
    or: () => buildOrClause(qb, value),
    eq: () => qb.where(field, value),
    ne: () => qb.where(field, '!=', value),
    lt: () => qb.where(field, '<', value),
    lte: () => qb.where(field, '<=', value),
    gt: () => qb.where(field, '>', value),
    gte: () => qb.where(field, '>=', value),
    in: () => qb.whereIn(field, Array.isArray(value) ? value : [value]),
    nin: () => qb.whereNotIn(field, Array.isArray(value) ? value : [value]),
    contains: () => qb.whereRaw(`${fieldLowerFn(qb)} LIKE LOWER(?)`, [field, `%${value}%`]),
    ncontains: () => qb.whereRaw(`${fieldLowerFn(qb)} NOT LIKE LOWER(?)`, [field, `%${value}%`]),
    containss: () => qb.where(field, 'like', `%${value}%`),
    ncontainss: () => qb.whereNot(field, 'like', `%${value}%`),
    null: () => (value ? qb.whereNull(field) : qb.whereNotNull(field)),
  };

  if (operatorHandlers[operator]) {
    return operatorHandlers[operator]();
  }

  throw new Error(`Unhandled whereClause : ${field} ${operator} ${value}`);
};

const buildAndClause = (qb, value) => {
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

const buildOrClause = (qb, value) => {
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

const createRootTreeNode = model => ({
  alias: model.collectionName,
  assoc: null,
  model,
  joins: {},
});

const fieldLowerFn = qb => {
  return qb.client.config.client === 'pg' ? 'LOWER(CAST(?? AS VARCHAR))' : 'LOWER(??)';
};

const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

module.exports = buildQuery;
```