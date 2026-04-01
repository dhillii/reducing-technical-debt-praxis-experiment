```javascript
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
 * Parameter object for table creation options
 * @typedef {Object} CreateTableParams
 * @property {String} tableName - Table name
 * @property {Object} attributes - Column attributes
 * @property {Object} options - Query options
 * @property {Model} [model] - Model instance
 */

/**
 * Parameter object for column operations
 * @typedef {Object} ColumnOperationParams
 * @property {String} tableName - Table name
 * @property {String} attributeName - Column name
 * @property {Object} [options] - Query options
 */

/**
 * Parameter object for constraint operations
 * @typedef {Object} ConstraintOperationParams
 * @property {String} tableName - Table name
 * @property {Array} attributes - Column names
 * @property {Object} options - Constraint options
 * @property {String} [rawTablename] - Raw table name
 */

/**
 * Parameter object for index operations
 * @typedef {Object} IndexOperationParams
 * @property {String} tableName - Table name
 * @property {Array} attributes - Column names
 * @property {Object} options - Index options
 * @property {String} [rawTablename] - Raw table name
 */

/**
 * Parameter object for upsert operations
 * @typedef {Object} UpsertParams
 * @property {String} tableName - Table name
 * @property {Object} insertValues - Values to insert
 * @property {Object} updateValues - Values to update
 * @property {Object} where - Where conditions
 * @property {Model} model - Model instance
 * @property {Object} options - Query options
 */

/**
 * Parameter object for trigger operations
 * @typedef {Object} TriggerParams
 * @property {String} tableName - Table name
 * @property {String} triggerName - Trigger name
 * @property {String} timingType - Timing type
 * @property {Array} fireOnArray - Fire on array
 * @property {String} functionName - Function name
 * @property {Array} functionParams - Function parameters
 * @property {Array} optionsArray - Options array
 * @property {Object} [options] - Query options
 */

/**
 * Parameter object for function operations
 * @typedef {Object} FunctionParams
 * @property {String} functionName - Function name
 * @property {Array} params - Parameters
 * @property {String} returnType - Return type
 * @property {String} language - Language
 * @property {String} body - Function body
 * @property {Array} optionsArray - Options array
 * @property {Object} [options] - Query options
 */

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
      return this.showAllSchemas(options).map(schemaName => this.dropSchema(schemaName, options));
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

    return this.sequelize.query(showSchemasSql, options).then(schemaNames => _.flatten(
      _.map(schemaNames, value => value.schema_name ? value.schema_name : value)
    ));
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
   * Normalize attribute definition
   * @private
   */
  _normalizeAttribute(attribute) {
    if (!_.isPlainObject(attribute)) {
      attribute = { type: attribute, allowNull: true };
    }
    return this.sequelize.normalizeAttribute(attribute);
  }

  /**
   * Process PostgreSQL enums for table creation
   * @private
   */
  _processPostgresEnums(params) {
    const { tableName, attributes, options, model, keys } = params;
    const promises = [];

    for (let i = 0; i < keys.length; i++) {
      const attribute = attributes[keys[i]];
      const type = attribute.type;

      if (this._isEnumType(type)) {
        const sql = this.QueryGenerator.pgListEnums(tableName, attribute.field || keys[i], options);
        promises.push(this.sequelize.query(
          sql,
          _.assign({}, options, { plain: true, raw: true, type: QueryTypes.SELECT })
        ));
      }
    }

    return promises;
  }

  /**
   * Check if type is ENUM or ARRAY of ENUM
   * @private
   */
  _isEnumType(type) {
    return type instanceof DataTypes.ENUM ||
      (type instanceof DataTypes.ARRAY && type.type instanceof DataTypes.ENUM);
  }

  /**
   * Handle enum creation and updates
   * @private
   */
  _handleEnumCreation(params) {
    const { results, tableName, attributes, options, model, keys } = params;
    const promises = [];
    let enumIdx = 0;

    for (let i = 0; i < keys.length; i++) {
      const attribute = attributes[keys[i]];
      const type = attribute.type;
      const enumType = type.type || type;

      if (this._isEnumType(type)) {
        if (!results[enumIdx]) {
          const sql = this.QueryGenerator.pgEnum(tableName, attribute.field || keys[i], enumType, options);
          promises.push(this.sequelize.query(sql, _.assign({}, options, { raw: true })));
        } else if (!!results[enumIdx] && !!model) {
          this._addMissingEnumValues(promises, results[enumIdx], enumType, tableName, attribute, keys[i], options);
          enumIdx++;
        }
      }
    }

    return promises;
  }

  /**
   * Add missing enum values
   * @private
   */
  _addMissingEnumValues(promises, enumResult, enumType, tableName, attribute, fieldName, options) {
    const enumVals = this.QueryGenerator.fromArray(enumResult.enum_value);
    const vals = enumType.values;

    vals.forEach((value, idx) => {
      const valueOptions = _.clone(options);
      valueOptions.before = null;
      valueOptions.after = null;

      if (enumVals.indexOf(value) === -1) {
        if (vals[idx + 1]) {
          valueOptions.before = vals[idx + 1];
        } else if (vals[idx - 1]) {
          valueOptions.after = vals[idx - 1];
        }
        valueOptions.supportsSearchPath = false;
        promises.push(this.sequelize.query(
          this.QueryGenerator.pgEnumAdd(tableName, attribute.field || fieldName, value, valueOptions),
          valueOptions
        ));
      }
    });
  }

  /**
   * Add schema to table name if needed
   * @private
   */
  _addSchemaToTableName(tableName, options, model) {
    if (!tableName.schema && (options.schema || (!!model && model._schema))) {
      return this.QueryGenerator.addSchema({
        tableName,
        _schema: (!!model && model._schema) || options.schema
      });
    }
    return tableName;
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
    const keys = Object.keys(attributes);
    const keyLen = keys.length;

    options = _.clone(options) || {};

    attributes = _.mapValues(attributes, attribute => this._normalizeAttribute(attribute));

    // Postgres requires a special SQL command for enums
    if (this.sequelize.options.dialect === 'postgres') {
      return this._createTablePostgres({ tableName, attributes, options, model, keys, keyLen });
    } else {
      return this._createTableNonPostgres({ tableName, attributes, options, model });
    }
  }

  /**
   * Create table for PostgreSQL
   * @private
   */
  _createTablePostgres(params) {
    const { tableName, attributes, options, model, keys, keyLen } = params;
    const enumPromises = this._processPostgresEnums({ tableName, attributes, options, model, keys });

    return Promise.all(enumPromises).then(results => {
      const createPromises = this._handleEnumCreation({ results, tableName, attributes, options, model, keys });
      const finalTableName = this._addSchemaToTableName(tableName, options, model);
      const finalAttributes = this.QueryGenerator.attributesToSQL(attributes, { context: 'createTable' });
      const sql = this.QueryGenerator.createTableQuery(finalTableName, finalAttributes, options);

      return Promise.all(createPromises)
        .tap(() => {
          if (createPromises.length) {
            return this.sequelize.dialect.connectionManager._refreshDynamicOIDs();
          }
        })
        .then(() => this.sequelize.query(sql, options));
    });
  }

  /**
   * Create table for non-PostgreSQL databases
   * @private
   */
  _createTableNonPostgres(params) {
    const { tableName, attributes, options, model } = params;
    const finalTableName = this._addSchemaToTableName(tableName, options, model);
    const finalAttributes = this.QueryGenerator.attributesToSQL(attributes, { context: 'createTable' });
    const sql = this.QueryGenerator.createTableQuery(finalTableName, finalAttributes, options);

    return this.sequelize.query(sql, options);
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

    const sql = this.QueryGenerator.dropTableQuery(tableName, options);

    return this.sequelize.query(sql, options).then(() => {
      return this._dropTableEnums({ tableName, options });
    });
  }

  /**
   * Drop enums for table (PostgreSQL only)
   * @private
   */
  _dropTableEnums(params) {
    const { tableName, options } = params;
    const promises = [];

    if (this.sequelize.options.dialect === 'postgres') {
      const instanceTable = this.sequelize.modelManager.getModel(tableName, { attribute: 'tableName' });

      if (instanceTable) {
        const getTableName = (!options || !options.schema || options.schema === 'public' ? '' : options.schema + '_') + tableName;
        const keys = Object.keys(instanceTable.rawAttributes);

        for (let i = 0; i < keys.length; i++) {
          if (instanceTable.rawAttributes[keys[i]].type instanceof DataTypes.ENUM) {
            const sql = this.QueryGenerator.pgEnumDrop(getTableName, keys[i]);
            const enumOptions = _.assign({}, options, { raw: true, supportsSearchPath: false });
            promises.push(this.sequelize.query(sql, enumOptions));
          }
        }
      }
    }

    return Promise.all(promises).get(0);
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

    const dropAllTables = tableNames => Promise.each(tableNames, tableName => {
      if (skip.indexOf(tableName.tableName || tableName) === -1) {
        return this.dropTable(tableName, _.assign({}, options, { cascade: true }));
      }
    });

    return this.showAllTables(options).then(tableNames => {
      if (this.sequelize.options.dialect === 'sqlite') {
        return this._dropAllTablesSqlite({ tableNames, options, dropAllTables });
      } else {
        return this._dropAllTablesNonSqlite({ tableNames, options, dropAllTables });
      }
    });
  }

  /**
   * Drop all tables for SQLite
   * @private
   */
  _dropAllTablesSqlite(params) {
    const { tableNames, options, dropAllTables } = params;

    return this.sequelize.query('PRAGMA foreign_keys;', options).then(result => {
      const foreignKeysAreEnabled = result.foreign_keys === 1;

      if (foreignKeysAreEnabled) {
        return this.sequelize.query('PRAGMA foreign_keys = OFF', options)
          .then(() => dropAllTables(tableNames))
          .then(() => this.sequelize.query('PRAGMA foreign_keys = ON', options));
      } else {
        return dropAllTables(tableNames);
      }
    });
  }

  /**
   * Drop all tables for non-SQLite databases
   * @private
   */
  _dropAllTablesNonSqlite(params) {
    const { tableNames, options, dropAllTables } = params;

    return this.getForeignKeysForTables(tableNames, options).then(foreignKeys => {
      const promises = [];

      tableNames.forEach(