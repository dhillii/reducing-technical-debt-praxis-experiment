'use strict';

const _ = require('lodash');
const { keys, each, prop, isEmpty } = require('lodash/fp');
const { singular } = require('pluralize');
const { toQueries, runPopulateQueries } = require('./utils/populate-queries');

const BOOLEAN_OPERATORS = ['or', 'and'];

/**
 * Builds a bookshelf query based on filters.
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

/**
 * Helper class to build joins and where clauses.
 */
class JoinsBuilder {
  /**
   * @param {Object} qb - Knex query builder
   * @param {Object} model - Bookshelf model
   * @param {Object} filters - Query filters
   */
  constructor(qb, model, filters) {
    this.qb = qb;
    this.model = model;
    this.filters = filters;
    this.aliasMap = {};
    this.tree = {
      alias: model.collectionName,
      assoc: null,
      model,
      joins: {},
    };
  }

  /**
   * Generates an alias for a name (simple incremental alias name)
   * @param {string} name - name to alias
   */
  generateAlias(name) {
    if (!this.aliasMap[name]) {
      this.aliasMap[name] = 1;
    }
    const alias = `${name}_${this.aliasMap[name]}`;
    this.aliasMap[name] += 1;
    return alias;
  }

  /**
   * Builds a query joins and where clauses from a query tree
   * @param {Object} qb - Knex query builder
   * @param {Object} tree - Query tree
   */
  buildJoinsFromTree(qb, queryTree) {
    Object.keys(queryTree.joins).forEach(key => {
      const subQueryTree = queryTree.joins[key];
      this.buildJoin(qb, subQueryTree.assoc, queryTree, subQueryTree);
      this.buildJoinsFromTree(qb, subQueryTree);
    });
  }

  /**
   * Add table joins
   * @param {Object} qb - Knex query builder
   * @param {Object} assoc - Models association info
   * @param {Object} originInfo - origin from which you are making a join
   * @param {Object} destinationInfo - destination with which we are making a join
   */
  buildJoin(qb, assoc, originInfo, destinationInfo) {
    if (['manyToMany', 'manyWay'].includes(assoc.nature)) {
      const joinTableAlias = this.generateAlias(assoc.tableCollectionName);

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
  }

  /**
   * Create a query tree node from a key an assoc and a model
   * @param {Object} model - Strapi model
   * @param {Object} assoc - Strapi association
   */
  createTreeNode(model, assoc = null) {
    return {
      alias: this.generateAlias(model.collectionName),
      assoc,
      model,
      joins: {},
    };
  }

  /**
   * Returns the SQL path for a query field.
   * Adds table to the joins tree
   * @param {string} field a field used to filter
   * @param {Object} tree joins tree
   */
  generateNestedJoins(field, tree) {
    let [key, ...parts] = field.split('.');

    const assoc = findAssoc(tree.model, key);
    // if the key is an attribute add as where clause
    if (!assoc) {
      return `${tree.alias}.${key}`;
    }

    const assocModel = strapi.db.getModelByAssoc(assoc);

    // if the last part of the path is an association
    // add the primary key of the model to the parts
    if (parts.length === 0) {
      parts = [assocModel.primaryKey];
    }

    // init sub query tree
    if (!tree.joins[key]) {
      tree.joins[key] = this.createTreeNode(assocModel, assoc);
    }

    return this.generateNestedJoins(parts.join('.'), tree.joins[key]);
  }

  /**
   * Format every where clauses with the right table name aliases.
   * Add table joins to the joins list
   * @param {Array<{field, operator, value}>} whereClauses a list of where clauses
   * @param {Object} context
   * @param {Object} context.model model on which the query is run
   */
  buildWhereClauses(whereClauses, { model }) {
    return whereClauses.map(whereClause => {
      const { field, operator, value } = whereClause;

      if (BOOLEAN_OPERATORS.includes(operator)) {
        return {
          field,
          operator,
          value: value.map(v => this.buildWhereClauses(v, { model })),
        };
      }

      const path = this.generateNestedJoins(field, this.tree);

      return {
        field: path,
        operator,
        value,
      };
    });
  }

  /**
   * Add queries on tree's joins (deep search, deep sort) based on given filters
   * @param {Object} tree - joins tree
   */
  addFiltersQueriesToJoinTree(tree) {
    _.each(tree.joins, value => {
      const { alias, model } = value;

      // PublicationState
      runPopulateQueries(
        toQueries({
          publicationState: { query: this.filters.publicationState, model, alias },
        }),
        this.qb
      );

      this.addFiltersQueriesToJoinTree(value);
    });
  }

  /**
   * Build the joins tree and apply filters to the query builder.
   * @returns {Object} The joins tree
   */
  build() {
    const { where: whereClauses = [], sort: sortClauses = [] } = this.filters;

    const aliasedWhereClauses = this.buildWhereClauses(whereClauses, { model: this.model });
    aliasedWhereClauses.forEach(w => buildWhereClause({ qb: this.qb, ...w }));

    // Force needed joins for deep sort clauses
    each(field => this.generateNestedJoins(field, this.tree))(sortClauses.map(prop('field')));

    this.buildJoinsFromTree(this.qb, this.tree);
    this.addFiltersQueriesToJoinTree(this.tree);

    return this.tree;
  }
}

/**
 * Add joins and where filters
 * @param {Object} qb - knex query builder
 * @param {Object} model - Bookshelf model
 * @param {Object} filters - The query filters
 */
const buildJoinsAndFilter = (qb, model, filters) => {
  const builder = new JoinsBuilder(qb, model, filters);
  return builder.build();
};

/**
 * Builds a sql where clause
 * @param {Object} options - Options
 * @param {Object} options.qb - Bookshelf (knex) query builder
 * @param {Object} options.model - Bookshelf model
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

  const handlers = {
    and: (val, qb) => {
      qb.where(andQb => {
        val.forEach(andClause => {
          if (Array.isArray(andClause)) {
            andClause.forEach(clause =>
              andQb.where(andQb2 => buildWhereClause({ qb: andQb2, ...clause }))
            );
          } else {
            buildWhereClause({ qb: andQb, ...andClause });
          }
        });
      });
    },
    or: (val, qb) => {
      qb.where(orQb => {
        val.forEach(orClause => {
          if (Array.isArray(orClause)) {
            orClause.forEach(clause =>
              orQb.orWhere(andQb => buildWhereClause({ qb: andQb, ...clause }))
            );
          } else {
            buildWhereClause({ qb: orQb, ...orClause });
          }
        });
      });
    },
    eq: (val, qb) => qb.where(field, val),
    ne: (val, qb) => qb.where(field, '!=', val),
    lt: (val, qb) => qb.where(field, '<', val),
    lte: (val, qb) => qb.where(field, '<=', val),
    gt: (val, qb) => qb.where(field, '>', val),
    gte: (val, qb) => qb.where(field, '>=', val),
    in: (val, qb) => qb.whereIn(field, Array.isArray(val) ? val : [val]),
    nin: (val, qb) => qb.whereNotIn(field, Array.isArray(val) ? val : [val]),
    contains: (val, qb) =>
      qb.whereRaw(`${fieldLowerFn(qb)} LIKE LOWER(?)`, [field, `%${val}%`]),
    ncontains: (val, qb) =>
      qb.whereRaw(`${fieldLowerFn(qb)} NOT LIKE LOWER(?)`, [field, `%${val}%`]),
    containss: (val, qb) => qb.where(field, 'like', `%${val}%`),
    ncontainss: (val, qb) => qb.whereNot(field, 'like', `%${val}%`),
    null: (val, qb) => (val ? qb.whereNull(field) : qb.whereNotNull(field)),
  };

  const handler = handlers[operator];
  if (!handler) {
    throw new Error(`Unhandled whereClause : ${field} ${operator} ${value}`);
  }
  handler(value, qb);
};

const fieldLowerFn = qb => {
  // Postgres requires string to be passed
  if (qb.client.config.client === 'pg') {
    return 'LOWER(CAST(?? AS VARCHAR))';
  }
  return 'LOWER(??)';
};

const findAssoc = (model, key) => model.associations.find(assoc => assoc.alias === key);

module.exports = buildQuery;