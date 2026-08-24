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

  const isSortQuery = _.has(filters, 'sort');
  const isSingleResult = _.has(filters, 'limit') && filters.limit === 1;
  const hasJoins = _.has(joinsTree, 'joins') && keys(joinsTree.joins).length;
  const isDistinctJoin = !isSingleResult && hasJoins;
  const hasWhereFilters =
    _.has(filters, 'where') && Array.isArray(filters.where) && filters.where.length > 0;

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

/**
 * Add joins and where filters
 * @param {Object} qb - knex query builder
 * @param {Object} model - Bookshelf model
 * @param {Object} filters - The query filters
 */
const buildJoinsAndFilter = (qb, model, filters) => {
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

  const buildJoinsFromTree = (qb, queryTree) => {
    Object.keys(queryTree.joins).forEach(key => {
      const subQueryTree = queryTree.joins[key];
      buildJoin(qb, subQueryTree.assoc, queryTree, subQueryTree);
      buildJoinsFromTree(qb, subQueryTree);
    });
  };

  const buildJoin = (qb, assoc, originInfo, destinationInfo) => {
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

  const addFiltersQueriesToJoinTree = tree => {
    _.each(tree.joins, value => {
      const { alias, model } = value;
      runPopulateQueries(
        toQueries({
          publicationState: { query: filters.publicationState, model, alias },
        }),
        qb
      );
      addFiltersQueriesToJoinTree(value);
    });
  };

  const aliasedWhereClauses = buildWhereClauses(whereClauses, { model });
  aliasedWhereClauses.forEach(w => buildWhereClause({ qb, ...w }));

  generateNestedJoinsFromFields(sortClauses.map(prop('field')));
  buildJoinsFromTree(qb, tree);
  addFiltersQueriesToJoinTree(tree);

  return tree;
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
    return qb.where(subQb => {
      for (let val of value) {
        subQb.orWhere(q => buildWhereClause({ qb: q, field, operator, value: val }));
      }
    });
  }

  const handlers = buildOperatorHandlerLookup();

  if (handlers[operator]) {
    return handlers[operator]({ qb, field, value });
  }

  throw new Error(`Unhandled whereClause : ${field} ${operator} ${value}`);
};

/**
 * Operator handler lookup table for WHERE clause dispatch
 */
const buildOperatorHandlerLookup = () => {
  const AND_OR_OPERATOR_META = Symbol('and/or handler');

  const handlers = {};
  handlers.eq = ({ qb, field, value }) => qb.where(field, value);
  handlers.ne = ({ qb, field, value }) => qb.where(field, '!=', value);
  handlers.lt = ({ qb, field, value }) => qb.where(field, '<', value);
  handlers.lte = ({ qb, field, value }) => qb.where(field, '<=', value);
  handlers.gt = ({ qb, field, value }) => qb.where(field, '>', value);
  handlers.gte = ({ qb, field, value }) => qb.where(field, '>=', value);
  handlers.in = ({ qb, field, value }) =>
    qb.whereIn(field, Array.isArray(value) ? value : [value]);
  handlers.nin = ({ qb, field, value }) =>
    qb.whereNotIn(field, Array.isArray(value) ? value : [value]);
  handlers.contains = ({ qb, field, value }) =>
    qb.whereRaw(`${fieldLowerFn(qb)} LIKE LOWER(?)`, [field, `%${value}%`]);
  handlers.ncontains = ({ qb, field, value }) =>
    qb.whereRaw(`${fieldLowerFn(qb)} NOT LIKE LOWER(?)`, [field, `%${value}%`]);
  handlers.containss = ({ qb, field, value }) =>
    qb.where(field, 'like', `%${value}%`);
  handlers.ncontainss = ({ qb, field, value }) =>
    qb.whereNot(field, 'like', `%${value}%`);
  handlers.null = ({ qb, field, value }) =>
    value ? qb.whereNull(field) : qb.whereNotNull(field);

  handlers.and = ({ qb, value }) => {
    return qb.where(andQb => {
      value.forEach(andClause => {
        andQb.where(subQb => {
          if (Array.isArray(andClause)) {
            andClause.forEach(clause =>
              subQb.where(buildWhereClauseWithBinding({ qb: andQb, field: null, operator: 'and', value: clause, andClause, subQb, AND_OR_OPERATOR_META }))
            );
          } else {
            buildWhereClauseWithBinding({ qb: subQb, ...andClause, AND_OR_OPERATOR_META });
          }
        });
      });
    });
  };

  handlers.or = ({ qb, value }) => {
    return qb.where(orQb => {
      value.forEach(orClause => {
        orQb.orWhere(subQb => {
          if (Array.isArray(orClause)) {
            orClause.forEach(orClause =>
              subQb.where(buildWhereClauseWithBinding({ qb: andQb, field: null, operator: 'or', value: orClause, orClause, subQb, AND_OR_OPERATOR_META }))
            );
          } else {
            buildWhereClauseWithBinding({ qb: subQb, ...orClause, AND_OR_OPERATOR_META });
          }
        });
      });
    });
  };

  // temporary binding helper to allow recursion with context preservation
  handlers._bindAndOr = (targetBuilder, { operator, value }) => {
    if (operator === 'and') {
      return targetBuilder.where(subQb => {
        value.forEach(subClause => {
          subQb.where(buildWhereClauseWithBinding({ qb: subQb, ...subClause, AND_OR_OPERATOR_META }));
        });
      });
    }
    if (operator === 'or') {
      return targetBuilder.orWhere(subQb => {
        value.forEach(subClause => {
          subQb.where(buildWhereClauseWithBinding({ qb: subQb, ...subClause, AND_OR_OPERATOR_META }));
        });
      });
    }
    return targetBuilder;
  };

  return handlers;
};

/**
 * Wrapper function to preserve binding context and reduce nesting during recursion
 */
const buildWhereClauseWithBinding = ({
  qb,
  field,
  operator,
  value,
  andClause,
  orClause,
  [Symbol('and/or handler')]: bindingSymbol = false,
}) => {
  if (operator === 'and' || operator === 'or') {
    const targetBuilder = bindingSymbol ? qb : (operator === 'and' ? qb : qb);
    return targetBuilder.where);
  }

  return buildWhereClause({ qb, field, operator, value });
};

const fieldLowerFn = qb => {
  if (qb.client.config.client === 'pg') {
    return 'LOWER(CAST(?? AS VARCHAR))';
  }
  return 'LOWER(??)';
};

const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);