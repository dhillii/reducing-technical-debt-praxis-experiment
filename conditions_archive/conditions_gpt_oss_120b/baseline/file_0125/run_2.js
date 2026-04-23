```javascript
'use strict';

const _ = require('lodash');
const { keys, each, prop, isEmpty } = require('lodash/fp');
const { singular } = require('pluralize');
const { toQueries, runPopulateQueries } = require('./utils/populate-queries');

const BOOLEAN_OPERATORS = ['or', 'and'];

const fieldLowerFn = qb => {
  if (qb.client.config.client === 'pg') {
    return 'LOWER(CAST(?? AS VARCHAR))';
  }
  return 'LOWER(??)';
};

const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

/* ---------- WHERE CLAUSE BUILDERS ---------- */
const handleArrayValue = ({ qb, field, operator, value }) => {
  return qb.where(subQb => {
    value.forEach(val => {
      subQb.orWhere(q => buildWhereClause({ qb: q, field, operator, value: val }));
    });
  });
};

const handleAnd = ({ qb, value }) => {
  value.forEach(andClause => {
    if (Array.isArray(andClause)) {
      andClause.forEach(c => buildWhereClause({ qb, ...c }));
    } else {
      buildWhereClause({ qb, ...andClause });
    }
  });
  return qb;
};

const handleOr = ({ qb, value }) => {
  value.forEach(orClause => {
    if (Array.isArray(orClause)) {
      orClause.forEach(c => {
        qb.orWhere(subQb => buildWhereClause({ qb: subQb, ...c }));
      });
    } else {
      qb.orWhere(subQb => buildWhereClause({ qb: subQb, field: orClause.field, operator: orClause.operator, value: orClause.value }));
    }
  });
  return qb;
};

const buildWhereClause = ({ qb, field, operator, value }) => {
  if (Array.isArray(value) && !['and', 'or', 'in', 'nin'].includes(operator)) {
    return handleArrayValue({ qb, field, operator, value });
  }

  switch (operator) {
    case 'and':
      return handleAnd({ qb, value });
    case 'or':
      return handleOr({ qb, value });
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

/* ---------- SORT CLAUSE ---------- */
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

/* ---------- JOIN HELPERS ---------- */
const generateAliasFactory = () => {
  const aliasMap = {};
  return name => {
    if (!aliasMap[name]) aliasMap[name] = 1;
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

/* ---------- NESTED JOINS ---------- */
const generateNestedJoins = (field, tree, generateAlias) => {
  const [key, ...rest] = field.split('.');
  const assoc = findAssoc(tree.model, key);

  if (!assoc) {
    return `${tree.alias}.${key}`;
  }

  const assocModel = strapi.db.getModelByAssoc(assoc);
  const parts = rest.length ? rest : [assocModel.primaryKey];

  if (!tree.joins[key]) {
    tree.joins[key] = createTreeNode(assocModel, assoc, generateAlias);
  }

  return generateNestedJoins(parts.join('.'), tree.joins[key], generateAlias);
};

const generateNestedJoinsFromFields = (fields, tree, generateAlias) => {
  fields.forEach(field => generateNestedJoins(field, tree, generateAlias));
};

/* ---------- WHERE CLAUSE PREPARATION ---------- */
const buildWhereClauses = (whereClauses, tree, generateAlias) => {
  return whereClauses.map(({ field, operator, value }) => {
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
};

/* ---------- FILTER QUERIES ON JOINS ---------- */
const addFiltersQueriesToJoinTree = (tree, filters, qb) => {
  each(value => {
    const { alias, model } = value;
    runPopulateQueries(
      toQueries({
        publicationState: { query: filters.publicationState, model, alias },
      }),
      qb
    );
    addFiltersQueriesToJoinTree(value, filters, qb);
  })(tree.joins);
};

/* ---------- MAIN BUILD JOINS & FILTER ---------- */
const buildJoinsAndFilter = (qb, model, filters) => {
  const { where: whereClauses = [], sort: sortClauses = [] } = filters;
  const generateAlias = generateAliasFactory();

  const tree = {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
  };

  const aliasedWhereClauses = buildWhereClauses(whereClauses, tree, generateAlias);
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  generateNestedJoinsFromFields(sortClauses.map(prop('field')), tree, generateAlias);
  buildJoinsFromTree(qb, tree, generateAlias);
  addFiltersQueriesToJoinTree(tree, filters, qb);

  return tree;
};

/* ---------- BUILD QUERY ---------- */
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