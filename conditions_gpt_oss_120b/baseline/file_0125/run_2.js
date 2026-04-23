'use strict';

const _ = require('lodash');
const { keys, each, prop, isEmpty } = require('lodash/fp');
const { singular } = require('pluralize');
const { toQueries, runPopulateQueries } = require('./utils/populate-queries');

const BOOLEAN_OPERATORS = ['or', 'and'];

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

const generateAliasFactory = () => {
  const aliasMap = {};
  return name => {
    if (!aliasMap[name]) {
      aliasMap[name] = 1;
    }
    const alias = `${name}_${aliasMap[name]}`;
    aliasMap[name] += 1;
    return alias;
  };
};

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
  const [key, ...rest] = field.split('.');
  const assoc = findAssoc(tree.model, key);

  if (!assoc) {
    return `${tree.alias}.${key}`;
  }

  const assocModel = strapi.db.getModelByAssoc(assoc);
  const parts = rest.length === 0 ? [assocModel.primaryKey] : rest;

  if (!tree.joins[key]) {
    tree.joins[key] = createTreeNode(assocModel, assoc, generateAlias);
  }

  return generateNestedJoins(parts.join('.'), tree.joins[key], generateAlias);
};

const buildWhereClauses = (whereClauses, tree, model, generateAlias) => {
  return whereClauses.map(whereClause => {
    const { field, operator, value } = whereClause;

    if (BOOLEAN_OPERATORS.includes(operator)) {
      return {
        field,
        operator,
        value: value.map(v => buildWhereClauses(v, tree, model, generateAlias)),
      };
    }

    const path = generateNestedJoins(field, tree, generateAlias);
    return { field: path, operator, value };
  });
};

const addFiltersQueriesToJoinTree = (tree, qb, filters) => {
  each(value => {
    const { alias, model } = value;
    runPopulateQueries(
      toQueries({
        publicationState: { query: filters.publicationState, model, alias },
      }),
      qb
    );
    addFiltersQueriesToJoinTree(value, qb, filters);
  })(tree.joins);
};

const applyClause = (qb, clause) => {
  const { field, operator, value } = clause;
  if (Array.isArray(value) && !['and', 'or', 'in', 'nin'].includes(operator)) {
    qb.where(sub => {
      value.forEach(val => {
        sub.orWhere(q => applyClause(q, { field, operator, value: val }));
      });
    });
    return;
  }

  switch (operator) {
    case 'and':
      handleAnd(qb, value);
      break;
    case 'or':
      handleOr(qb, value);
      break;
    case 'eq':
      qb.where(field, value);
      break;
    case 'ne':
      qb.where(field, '!=', value);
      break;
    case 'lt':
      qb.where(field, '<', value);
      break;
    case 'lte':
      qb.where(field, '<=', value);
      break;
    case 'gt':
      qb.where(field, '>', value);
      break;
    case 'gte':
      qb.where(field, '>=', value);
      break;
    case 'in':
      qb.whereIn(field, Array.isArray(value) ? value : [value]);
      break;
    case 'nin':
      qb.whereNotIn(field, Array.isArray(value) ? value : [value]);
      break;
    case 'contains':
      qb.whereRaw(`${fieldLowerFn(qb)} LIKE LOWER(?)`, [field, `%${value}%`]);
      break;
    case 'ncontains':
      qb.whereRaw(`${fieldLowerFn(qb)} NOT LIKE LOWER(?)`, [field, `%${value}%`]);
      break;
    case 'containss':
      qb.where(field, 'like', `%${value}%`);
      break;
    case 'ncontainss':
      qb.whereNot(field, 'like', `%${value}%`);
      break;
    case 'null':
      value ? qb.whereNull(field) : qb.whereNotNull(field);
      break;
    default:
      throw new Error(`Unhandled whereClause : ${field} ${operator} ${value}`);
  }
};

const handleAnd = (qb, clauses) => {
  qb.where(andQb => {
    clauses.forEach(clause => {
      andQb.where(subQb => {
        if (Array.isArray(clause)) {
          clause.forEach(c => subQb.where(innerQb => applyClause(innerQb, c)));
        } else {
          applyClause(subQb, clause);
        }
      });
    });
  });
};

const handleOr = (qb, clauses) => {
  qb.where(orQb => {
    clauses.forEach(clause => {
      orQb.orWhere(subQb => {
        if (Array.isArray(clause)) {
          clause.forEach(c => subQb.where(innerQb => applyClause(innerQb, c)));
        } else {
          applyClause(subQb, clause);
        }
      });
    });
  });
};

const buildJoinsAndFilter = (qb, model, filters) => {
  const { where: whereClauses = [], sort: sortClauses = [] } = filters;
  const generateAlias = generateAliasFactory();

  const tree = {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
  };

  const aliasedWhereClauses = buildWhereClauses(whereClauses, tree, model, generateAlias);
  aliasedWhereClauses.forEach(w => applyClause(qb, w));

  sortClauses.map(prop('field')).forEach(field => generateNestedJoins(field, tree, generateAlias));

  buildJoinsFromTree(qb, tree, generateAlias);
  addFiltersQueriesToJoinTree(tree, qb, filters);

  return tree;
};

const fieldLowerFn = qb => {
  if (qb.client.config.client === 'pg') {
    return 'LOWER(CAST(?? AS VARCHAR))';
  }
  return 'LOWER(??)';
};

const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

module.exports = buildQuery;