```javascript
'use strict';

const _ = require('lodash');
const { keys, each, prop, isEmpty } = require('lodash/fp');
const { singular } = require('pluralize');
const { toQueries, runPopulateQueries } = require('./utils/populate-queries');

const BOOLEAN_OPERATORS = ['or', 'and'];

/**
 * Build filters on a bookshelf query
 * @param {Object} options
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
  if (isDistinctQuery) qb.distinct();

  if (isSortQuery) {
    const clauses = filters.sort
      .map(buildSortClauseFromTree(joinsTree))
      .filter(c => !isEmpty(c));
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

/* -------------------------------------------------------------------------- */
/*                     Alias generator (polymorphic helper)                  */
/* -------------------------------------------------------------------------- */
class AliasGenerator {
  constructor() {
    this.map = {};
  }
  generate(name) {
    if (!this.map[name]) this.map[name] = 1;
    const alias = `${name}_${this.map[name]}`;
    this.map[name] += 1;
    return alias;
  }
}

/* -------------------------------------------------------------------------- */
/*                     Join & Tree construction helpers                        */
/* -------------------------------------------------------------------------- */
const createTreeNode = (model, assoc, aliasGen) => ({
  alias: aliasGen.generate(model.collectionName),
  assoc,
  model,
  joins: {},
});

const buildJoin = (qb, assoc, originInfo, destinationInfo, aliasGen) => {
  if (['manyToMany', 'manyWay'].includes(assoc.nature)) {
    const joinTableAlias = aliasGen.generate(assoc.tableCollectionName);
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

const buildJoinsFromTree = (qb, queryTree, aliasGen) => {
  Object.keys(queryTree.joins).forEach(key => {
    const subTree = queryTree.joins[key];
    buildJoin(qb, subTree.assoc, queryTree, subTree, aliasGen);
    buildJoinsFromTree(qb, subTree, aliasGen);
  });
};

const generateNestedJoins = (field, tree, model) => {
  const [key, ...rest] = field.split('.');
  const assoc = findAssoc(tree.model, key);
  if (!assoc) return `${tree.alias}.${key}`;

  const assocModel = strapi.db.getModelByAssoc(assoc);
  const parts = rest.length ? rest : [assocModel.primaryKey];

  if (!tree.joins[key]) tree.joins[key] = createTreeNode(assocModel, assoc, new AliasGenerator());
  return generateNestedJoins(parts.join('.'), tree.joins[key], model);
};

const generateNestedJoinsFromFields = (fields, tree, model) => {
  fields.forEach(f => generateNestedJoins(f, tree, model));
};

/* -------------------------------------------------------------------------- */
/*                     Where clause construction helpers                       */
/* -------------------------------------------------------------------------- */
const buildWhereClauses = (whereClauses, tree) => {
  return whereClauses.map(({ field, operator, value }) => {
    if (BOOLEAN_OPERATORS.includes(operator)) {
      return {
        field,
        operator,
        value: value.map(v => buildWhereClauses(v, tree)),
      };
    }
    const path = generateNestedJoins(field, tree, tree.model);
    return { field: path, operator, value };
  });
};

const operatorHandlers = {
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

const handleAnd = (qb, clauses) => {
  return qb.where(andQb => {
    clauses.forEach(clause => {
      andQb.where(subQb => {
        if (Array.isArray(clause)) {
          clause.forEach(c => subQb.where(andQb2 => buildWhereClause({ qb: andQb2, ...c })));
        } else {
          buildWhereClause({ qb: subQb, ...clause });
        }
      });
    });
  });
};

const handleOr = (qb, clauses) => {
  return qb.where(orQb => {
    clauses.forEach(clause => {
      orQb.orWhere(subQb => {
        if (Array.isArray(clause)) {
          clause.forEach(c => subQb.where(andQb => buildWhereClause({ qb: andQb, ...c })));
        } else {
          buildWhereClause({ qb: subQb, ...clause });
        }
      });
    });
  });
};

/**
 * Builds a sql where clause
 * @param {Object} opts
 * @param {Object} opts.qb - Bookshelf (knex) query builder
 * @param {string} opts.field - Filtered field
 * @param {string} opts.operator - Filter operator
 * @param {*} opts.value - Filter value
 */
const buildWhereClause = ({ qb, field, operator, value }) => {
  if (Array.isArray(value) && !BOOLEAN_OPERATORS.includes(operator)) {
    return qb.where(subQb => {
      value.forEach(val => subQb.orWhere(q => buildWhereClause({ qb: q, field, operator, value: val })));
    });
  }

  if (operator === 'and') return handleAnd(qb, value);
  if (operator === 'or') return handleOr(qb, value);
  const handler = operatorHandlers[operator];
  if (!handler) throw new Error(`Unhandled whereClause : ${field} ${operator} ${value}`);
  return handler(qb, field, value);
};

/* -------------------------------------------------------------------------- */
/*                     Join tree building entry point                           */
/* -------------------------------------------------------------------------- */
const buildJoinsAndFilter = (qb, model, filters) => {
  const { where: whereClauses = [], sort: sortClauses = [] } = filters;
  const aliasGen = new AliasGenerator();

  const tree = {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
  };

  const aliasedWhereClauses = buildWhereClauses(whereClauses, tree);
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  generateNestedJoinsFromFields(sortClauses.map(prop('field')), tree, model);
  buildJoinsFromTree(qb, tree, aliasGen);
  addFiltersQueriesToJoinTree(tree, qb, filters);
  return tree;
};

/**
 * Recursively add publicationState queries to each join node
 * @param {Object} node - Current join tree node
 * @param {Object} qb - Knex query builder
 * @param {Object} filters - Original filters object
 */
const addFiltersQueriesToJoinTree = (node, qb, filters) => {
  each(value => {
    const { model, alias } = value;
    runPopulateQueries(
      toQueries({ publicationState: { query: filters.publicationState, model, alias } }),
      qb
    );
    addFiltersQueriesToJoinTree(value, qb, filters);
  }, node.joins);
};

const fieldLowerFn = qb => {
  if (qb.client.config.client === 'pg') return 'LOWER(CAST(?? AS VARCHAR))';
  return 'LOWER(??)';
};

const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

module.exports = buildQuery;
```