'use strict';

const Utils = require('./utils');
const _ = require('lodash');
const DataTypes = require('./data-types');
const SQLiteQueryInterface = require('./dialects/sqlite/query-interface');
const MSSSQLQueryInterface = require('./dialects/mssql/query-interface');
const MySQLQueryInterface = require('./dialects/mysql/query-interface');
const Transaction = require('./transaction');
const Promise = require('./promise');
const QueryTypes = require('./query-types');
const Op = require('./operators');

/**
 * The interface that Sequelize uses to talk to all databases
 *
 * @class QueryInterface
 */
class QueryInterface {
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.QueryGenerator = this.sequelize.dialect.QueryGenerator;
  }

  /**
   * Creates a schema
   *
   * @param {String} schema    Schema name to create
   * @param {Object} [options] Query options
   *
   * @return {Promise}
   */
  createSchema(schema, options) {
    options = options || {};
    const sql = this.QueryGenerator.createSchema(schema);
    return this.sequelize.query(sql, options);
  }

  /**
   * Drops a schema
   *
   * @param {String} schema    Schema name to create
   * @param {Object} [options] Query options
   *
   * @return {Promise}
   */
  dropSchema(schema, options) {
    options = options || {};
    const sql = this.QueryGenerator.dropSchema(schema);
    return this.sequelize.query(sql, options);
  }

  /**
   * Drop all schemas
   *
   * @param {Object} [options] Query options
   *
   * @return {Promise}
   */
  dropAllSchemas(options) {
    options = options || {};

    if (!this.QueryGenerator._dialect.supports.schemas) {
      return this.sequelize.drop(options);
    } else {
      return this.showAllSchemas(options).then(schemaNames => {
        return Promise.all(schemaNames.map(schemaName => this.dropSchema(schemaName, options)));
      });
    }
  }

  /**
   * Show all schemas
   *
   * @param {Object} [options] Query options
   *
   * @return {Promise<Array>}
   */
  showAllSchemas(options) {
    options = _.assign({}, options, {
      raw: true,
      type: this.sequelize.QueryTypes.SELECT
    });

    const showSchemasSql = this.QueryGenerator.showSchemasQuery();

    return this.sequelize.query(showSchemasSql, options).then(schemaNames => {
      return _.flatten(_.map(schemaNames, value => value.schema_name ? value.schema_name : value));
    });
  }

  /**
   * Returns database version
   *
   * @param {Object}    [options]      Query options
   * @param {QueryType} [options.type] Query type
   *
   * @returns {Promise}
   * @private
   */
  databaseVersion(options) {
    return this.sequelize.query(
      this.QueryGenerator.versionQuery(),
      _.assign({}, options, { type: QueryTypes.VERSION })
    );
  }

  /**
   * Create a table with given set of attributes
   *
   * @param {String} tableName  Name of table to create
   * @param {Object} attributes Object representing a list of table attributes to create
   * @param {Object} [options]
   * @param {Model}  [model]
   *
   * @return {Promise}
   */
  createTable(tableName, attributes, options, model) {
    const normalizedAttributes = this.normalizeAttributes(attributes);
    const sql = this.QueryGenerator.createTableQuery(tableName, normalizedAttributes, options);

    return this.sequelize.query(sql, options);
  }

  /**
   * Normalize attributes
   *
   * @param {Object} attributes
   *
   * @return {Object}
   * @private
   */
  normalizeAttributes(attributes) {
    const normalizedAttributes = {};

    Object.keys(attributes).forEach(key => {
      const attribute = attributes[key];

      if (!_.isPlainObject(attribute)) {
        attribute = { type: attribute, allowNull: true };
      }

      attribute = this.sequelize.normalizeAttribute(attribute);

      normalizedAttributes[key] = attribute;
    });

    return normalizedAttributes;
  }

  /**
   * Drops a table from database
   *
   * @param {String} tableName Table name to drop
   * @param {Object} options   Query options
   *
   * @return {Promise}
   */
  dropTable(tableName, options) {
    options = _.clone(options) || {};
    options.cascade = options.cascade || options.force || false;

    let sql = this.QueryGenerator.dropTableQuery(tableName, options);

    return this.sequelize.query(sql, options);
  }

  /**
   * Drop all tables from database
   *
   * @param {Object} [options]
   * @param {Array}  [options.skip] List of table to skip
   *
   * @return {Promise}
   */
  dropAllTables(options) {
    options = options || {};
    const skip = options.skip || [];

    return this.showAllTables(options).then(tableNames => {
      return this.dropTables(tableNames, options);
    });
  }

  /**
   * Drop tables
   *
   * @param {Array} tableNames
   * @param {Object} options
   *
   * @return {Promise}
   * @private
   */
  dropTables(tableNames, options) {
    const promises = [];

    tableNames.forEach(tableName => {
      if (skip.indexOf(tableName.tableName || tableName) === -1) {
        promises.push(this.dropTable(tableName, _.assign({}, options, { cascade: true })));
      }
    });

    return Promise.all(promises);
  }

  /**
   * Get foreign keys for tables
   *
   * @param {Array} tableNames
   * @param {Object} options
   *
   * @return {Promise}
   * @private
   */
  getForeignKeysForTables(tableNames, options) {
    if (tableNames.length === 0) {
      return Promise.resolve({});
    }

    options = _.assign({}, options || {}, { type: QueryTypes.FOREIGNKEYS });

    return Promise.map(tableNames, tableName =>
      this.sequelize.query(this.QueryGenerator.getForeignKeysQuery(tableName, this.sequelize.config.database), options)
    ).then(results => {
      const result = {};

      tableNames.forEach((tableName, i) => {
        if (_.isObject(tableName)) {
          tableName = tableName.schema + '.' + tableName.tableName;
        }

        result[tableName] = _.isArray(results[i])
          ? results[i].map(r => r.constraint_name)
          : [results[i] && results[i].constraint_name];

        result[tableName] = result[tableName].filter(_.identity);
      });

      return result;
    });
  }

  /**
   * Drop foreign keys
   *
   * @param {Array} tableNames
   * @param {Object} foreignKeys
   * @param {Object} options
   *
   * @return {Promise}
   * @private
   */
  dropForeignKeys(tableNames, foreignKeys, options) {
    const promises = [];

    tableNames.forEach(tableName => {
      let normalizedTableName = tableName;
      if (_.isObject(tableName)) {
        normalizedTableName = tableName.schema + '.' + tableName.tableName;
      }

      foreignKeys[normalizedTableName].forEach(foreignKey => {
        const sql = this.QueryGenerator.dropForeignKeyQuery(tableName, foreignKey);
        promises.push(this.sequelize.query(sql, options));
      });
    });

    return Promise.all(promises);
  }

  // ... rest of the code remains the same