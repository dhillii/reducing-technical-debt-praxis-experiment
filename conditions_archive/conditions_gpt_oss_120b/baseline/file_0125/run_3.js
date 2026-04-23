```javascript
'use strict';

const _ = require('lodash');
const { keys, each, prop, isEmpty } = require('lodash/fp');
const { singular } = require('pluralize');
const { toQueries, runPopulateQueries } = require('./utils/populate-queries');

const BOOLEAN_OPERATORS = ['or', 'and'];

/* ---------- Helper Functions ---------- */

const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

const fieldLowerFn = qb => {
  return qb.client.config.client === 'pg' ? 'LOWER(CAST(?? AS VARCHAR))' : 'LOWER(??)';
};

const buildWhereClause = ({ qb, field, operator, value }) => {
  if (Array.isArray(value) && !['and', 'or', 'in', 'nin'].includes(operator)) {
    return whereArray(qb, field, operator, value);
  }

  switch (operator) {
    case 'and':
      return whereAnd(qb, value);
    case 'or':
      return whereOr(qb, value);
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

const whereArray = (qb, field, operator, values) =>
  qb.where(subQb => {
    values.forEach(val => {
      subQb.orWhere(q => buildWhereClause({ qb: q, field, operator, value: val }));
    });
  });

const whereAnd = (qb, clauses) =>
  qb.where(andQb => {
    clauses.forEach(andClause => {
      andQb.where(subQb => {
        if (Array.isArray(andClause)) {
          andClause.forEach(clause => subQb.where(innerQb => buildWhereClause({ qb: innerQb, ...clause })));
        } else {
          buildWhereClause({ qb: subQb, ...andClause });
        }
      });
    });
  });

const whereOr = (qb, clauses) =>
  qb.where(orQb => {
    clauses.forEach(orClause => {
      orQb.orWhere(subQb => {
        if (Array.isArray(orClause)) {
          orClause.forEach(inner => subQb.where(innerQb => buildWhereClause({ qb: innerQb, ...inner })));
        } else {
          buildWhereClause({ qb: subQb, ...orClause });
        }
      });
    });
  });

/* ---------- Sort Clause Builder ---------- */

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

/* ---------- Join & Filter Builders ---------- */

const createTreeNode = (model, assoc, generateAlias) => ({
  alias: generateAlias(model.collectionName),
  assoc,
  model,
  joins: {},
});

const buildJoin = (qb, assoc, originInfo, destinationInfo, generateAlias) => {
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

const buildJoinsFromTree = (qb, queryTree, generateAlias) => {
  Object.keys(queryTree.joins).forEach(key => {
    const subTree = queryTree.joins[key];
    buildJoin(qb, subTree.assoc, queryTree, subTree, generateAlias);
    buildJoinsFromTree(qb, subTree, generateAlias);
  });
};

const generateNestedJoins = (field, tree, generateAlias) => {
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
    tree.joins[key] = createTreeNode(assocModel, assoc, generateAlias);
  }

  return generateNestedJoins(parts.join('.'), tree.joins[key], generateAlias);
};

const buildWhereClauses = (whereClauses, tree, generateAlias) =>
  whereClauses.map(({ field, operator, value }) => {
    if (BOOLEAN_OPERATORS.includes(operator)) {
      return {
        field,
        operator,
        value: value.map(v => buildWhereClauses(v, tree, generateAlias)),
      };
    }
    const path = generateNestedJoins(field, tree, generateAlias);
    return { field: path, operator, value };
  });

const addFiltersQueriesToJoinTree = (tree, filters, qb) => {
  each(value => {
    const { alias, model } = value;
    runPopulateQueries(
      toQueries({ publicationState: { query: filters.publicationState, model, alias } }),
      qb
    );
    addFiltersQueriesToJoinTree(value, filters, qb);
  }, tree.joins);
};

const buildJoinsAndFilter = (qb, model, filters) => {
  const { where: whereClauses = [], sort: sortClauses = [] } = filters;
  const aliasMap = {};

  const generateAlias = name => {
    aliasMap[name] = (aliasMap[name] || 0) + 1;
    return `${name}_${aliasMap[name]}`;
  };

  const tree = {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
  };

  const aliasedWhereClauses = buildWhereClauses(whereClauses, tree, generateAlias);
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  const sortFields = sortClauses.map(prop('field'));
  sortFields.forEach(field => generateNestedJoins(field, tree, generateAlias));

  buildJoinsFromTree(qb, tree, generateAlias);
  addFiltersQueriesToJoinTree(tree, filters, qb);

  return tree;
};

/* ---------- Main Query Builder ---------- */

const buildQuery = ({ model, filters }) => qb => {
  const joinsTree = buildJoinsAndFilter(qb, model, filters);

  const isSortQuery = _.has(filters, 'sort');
  const isSingleResult = _.has(filters, 'limit') && filters.limit === 1;
  const hasJoins = _.has(joinsTree, 'joins') && keys(joinsTree.joins).length;
  const isDistinctJoin = !isSingleResult && hasJoins;
  const hasWhereFilters = _.has(filters, 'where') && Array.isArray(filters.where) && filters.where.length > 0;
  const isDistinctQuery = isDistinctJoin && (isSortQuery || hasWhereFilters);

  if (isDistinctQuery) qb.distinct();

  if (isSortQuery) {
    const clauses = filters.sort.map(buildSortClauseFromTree(joinsTree)).filter(c => !isEmpty(c));
    const orderBy = clauses.map(({ order, alias }) => ({ order, column: alias }));
    const orderColumns = clauses.map(({ alias, column }) => ({ [alias]: column }));
    const columns = [`${joinsTree.alias}.*`, ...orderColumns];
    qb.column(columns).orderBy(orderBy);
  }

  if (_.has(filters, 'start')) qb.offset(filters.start);
  if (_.has(filters, 'limit') && filters.limit >= 0) qb.limit(filters.limit);
  if (_.has(filters, 'publicationState')) {
    runPopulateQueries(
      toQueries({ publicationState: { query: filters.publicationState, model } }),
      qb
    );
  }
};

module.exports = buildQuery;
```