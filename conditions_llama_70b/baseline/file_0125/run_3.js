'use strict';

const _ = require('lodash');
const { keys, each, prop, isEmpty } = require('lodash/fp');
const { singular } = require('pluralize');
const { toQueries, runPopulateQueries } = require('./utils/populate-queries');

const BOOLEAN_OPERATORS = ['or', 'and'];

const buildQuery = ({ model, filters }) => {
  const joinsTree = buildJoinsAndFilter(model, filters);
  const qb = buildQueryFromJoinsTree(joinsTree, filters);

  return qb;
};

const buildJoinsAndFilter = (model, filters) => {
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

  const tree = {
    alias: model.collectionName,
    assoc: null,
    model,
    joins: {},
  };

  const generateNestedJoins = (field, tree) => {
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
      tree.joins[key] = createTreeNode(assocModel, assoc);
    }

    return generateNestedJoins(parts.join('.'), tree.joins[key]);
  };

  const generateNestedJoinsFromFields = each(field => generateNestedJoins(field, tree));

  const buildWhereClauses = (whereClauses, { model }) => {
    return whereClauses.map(whereClause => {
      const { field, operator, value } = whereClause;

      if (BOOLEAN_OPERATORS.includes(operator)) {
        return { field, operator, value: value.map(v => buildWhereClauses(v, { model })) };
      }

      const path = generateNestedJoins(field, tree);

      return {
        field: path,
        operator,
        value,
      };
    });
  };

  const aliasedWhereClauses = buildWhereClauses(whereClauses, { model });
  generateNestedJoinsFromFields(sortClauses.map(prop('field')));

  buildJoinsFromTree(tree, aliasedWhereClauses);

  return tree;
};

const buildJoinsFromTree = (tree, whereClauses) => {
  Object.keys(tree.joins).forEach(key => {
    const subQueryTree = tree.joins[key];
    buildJoin(subQueryTree.assoc, tree, subQueryTree);

    buildJoinsFromTree(subQueryTree, whereClauses);
  });

  whereClauses.forEach(w => buildWhereClause(w, tree));
};

const buildJoin = (assoc, originInfo, destinationInfo) => {
  if (['manyToMany', 'manyWay'].includes(assoc.nature)) {
    const joinTableAlias = generateAlias(assoc.tableCollectionName);

    let originColumnNameInJoinTable;
    if (assoc.nature === 'manyToMany') {
      originColumnNameInJoinTable = `${joinTableAlias}.${singular(
        destinationInfo.model.attributes[assoc.via].attribute
      )}_${destinationInfo.model.attributes[assoc.via].column}`;
    } else if (assoc.nature === 'manyWay') {
      originColumnNameInJoinTable = `${joinTableAlias}.${singular(
        originInfo.model.collectionName
      )}_${originInfo.model.primaryKey}`;
    }

    destinationInfo.qb.leftJoin(
      `${originInfo.model.databaseName}.${assoc.tableCollectionName} AS ${joinTableAlias}`,
      originColumnNameInJoinTable,
      `${originInfo.alias}.${originInfo.model.primaryKey}`
    );

    destinationInfo.qb.leftJoin(
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

    destinationInfo.qb.leftJoin(
      `${destinationInfo.model.databaseName}.${destinationInfo.model.collectionName} AS ${destinationInfo.alias}`,
      externalKey,
      internalKey
    );
  }
};

const createTreeNode = (model, assoc = null) => {
  return {
    alias: generateAlias(model.collectionName),
    assoc,
    model,
    joins: {},
    qb: null,
  };
};

const buildWhereClause = (whereClause, tree) => {
  const { field, operator, value } = whereClause;

  if (Array.isArray(value) && !['and', 'or', 'in', 'nin'].includes(operator)) {
    tree.qb.where(subQb => {
      for (let val of value) {
        subQb.orWhere(q => buildWhereClause({ field, operator, value: val }, tree));
      }
    });
  }

  switch (operator) {
    case 'and':
      tree.qb.where(andQb => {
        value.forEach(andClause => {
          andQb.where(subQb => {
            if (Array.isArray(andClause)) {
              andClause.forEach(clause =>
                subQb.where(andQb => buildWhereClause({ ...clause }, tree))
              );
            } else {
              buildWhereClause({ ...andClause }, tree);
            }
          });
        });
      });
      break;
    case 'or':
      tree.qb.where(orQb => {
        value.forEach(orClause => {
          orQb.orWhere(subQb => {
            if (Array.isArray(orClause)) {
              orClause.forEach(orClause =>
                subQb.where(andQb => buildWhereClause({ ...orClause }, tree))
              );
            } else {
              buildWhereClause({ ...orClause }, tree);
            }
          });
        });
      });
      break;
    case 'eq':
      tree.qb.where(field, value);
      break;
    case 'ne':
      tree.qb.where(field, '!=', value);
      break;
    case 'lt':
      tree.qb.where(field, '<', value);
      break;
    case 'lte':
      tree.qb.where(field, '<=', value);
      break;
    case 'gt':
      tree.qb.where(field, '>', value);
      break;
    case 'gte':
      tree.qb.where(field, '>=', value);
      break;
    case 'in':
      tree.qb.whereIn(field, Array.isArray(value) ? value : [value]);
      break;
    case 'nin':
      tree.qb.whereNotIn(field, Array.isArray(value) ? value : [value]);
      break;
    case 'contains':
      tree.qb.whereRaw(`${fieldLowerFn(tree.qb)} LIKE LOWER(?)`, [field, `%${value}%`]);
      break;
    case 'ncontains':
      tree.qb.whereRaw(`${fieldLowerFn(tree.qb)} NOT LIKE LOWER(?)`, [field, `%${value}%`]);
      break;
    case 'containss':
      tree.qb.where(field, 'like', `%${value}%`);
      break;
    case 'ncontainss':
      tree.qb.whereNot(field, 'like', `%${value}%`);
      break;
    case 'null': {
      value ? tree.qb.whereNull(field) : tree.qb.whereNotNull(field);
      break;
    }

    default:
      throw new Error(`Unhandled whereClause : ${field} ${operator} ${value}`);
  }
};

const fieldLowerFn = qb => {
  if (qb.client.config.client === 'pg') {
    return 'LOWER(CAST(?? AS VARCHAR))';
  }
  return 'LOWER(??)';
};

const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

const buildQueryFromJoinsTree = (joinsTree, filters) => {
  const { where: whereClauses = [], sort: sortClauses = [] } = filters;

  const isSortQuery = _.has(filters, 'sort');
  const isSingleResult = _.has(filters, 'limit') && filters.limit === 1;
  const hasJoins = _.has(joinsTree, 'joins') && keys(joinsTree.joins).length;
  const isDistinctJoin = !isSingleResult && hasJoins;
  const hasWhereFilters =
    _.has(filters, 'where') && Array.isArray(filters.where) && filters.where.length > 0;

  const isDistinctQuery = isDistinctJoin && (isSortQuery || hasWhereFilters);

  const qb = joinsTree.qb;

  if (isDistinctQuery) {
    qb.distinct();
  }

  if (isSortQuery) {
    const clauses = sortClauses.map(buildSortClauseFromTree(joinsTree)).filter(c => !isEmpty(c));
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
      toQueries({ publicationState: { query: filters.publicationState, model: joinsTree.model } }),
      qb
    );
  }

  return qb;
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

module.exports = buildQuery;