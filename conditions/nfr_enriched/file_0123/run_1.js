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
   * Normalize attribute definitions for table creation
   * @private
   */
  _normalizeAttributes(attributes) {
    return _.mapValues(attributes, attribute => {
      if (!_.isPlainObject(attribute)) {
        attribute = { type: attribute, allowNull: true };
      }
      return this.sequelize.normalizeAttribute(attribute);
    });
  }

  /**
   * Check if attribute is ENUM type
   * @private
   */
  _isEnumType(type) {
    return type instanceof DataTypes.ENUM ||
      (type instanceof DataTypes.ARRAY && type.type instanceof DataTypes.ENUM);
  }

  /**
   * Get enum type from attribute
   * @private
   */
  _getEnumType(type) {
    return type.type || type;
  }

  /**
   * Build enum creation promises for PostgreSQL
   * @private
   */
  _buildEnumCreationPromises(attributes, keys, tableName, options) {
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
   * Process enum results and build enum modification promises
   * @private
   */
  _processEnumResults(results, attributes, keys, tableName, options, model) {
    const promises = [];
    let enumIdx = 0;

    for (let i = 0; i < keys.length; i++) {
      const attribute = attributes[keys[i]];
      const type = attribute.type;
      const enumType = this._getEnumType(type);

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
   * Add missing enum values to existing enum type
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
   * Apply schema to table name if needed
   * @private
   */
  _applySchemaToTableName(tableName, options, model) {
    if (!tableName.schema && (options.schema || (!!model && model._schema))) {
      return this.QueryGenerator.addSchema({
        tableName,
        _schema: (!!model && model._schema) || options.schema
      });
    }
    return tableName;
  }

  /**
   * Create table for PostgreSQL with enum handling
   * @private
   */
  _createTablePostgres(tableName, attributes, options, model) {
    const keys = Object.keys(attributes);
    const promises = this._buildEnumCreationPromises(attributes, keys, tableName, options);

    return Promise.all(promises).then(results => {
      const enumPromises = this._processEnumResults(results, attributes, keys, tableName, options, model);

      tableName = this._applySchemaToTableName(tableName, options, model);
      const attributesSql = this.QueryGenerator.attributesToSQL(attributes, { context: 'createTable' });
      const sql = this.QueryGenerator.createTableQuery(tableName, attributesSql, options);

      return Promise.all(enumPromises)
        .tap(() => {
          if (enumPromises.length) {
            return this.sequelize.dialect.connectionManager._refreshDynamicOIDs();
          }
        })
        .then(() => this.sequelize.query(sql, options));
    });
  }

  /**
   * Create table for non-PostgreSQL dialects
   * @private
   */
  _createTableDefault(tableName, attributes, options, model) {
    tableName = this._applySchemaToTableName(tableName, options, model);
    const attributesSql = this.QueryGenerator.attributesToSQL(attributes, { context: 'createTable' });
    const sql = this.QueryGenerator.createTableQuery(tableName, attributesSql, options);
    return this.sequelize.query(sql, options);
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
    options = _.clone(options) || {};
    attributes = this._normalizeAttributes(attributes);

    if (this.sequelize.options.dialect === 'postgres') {
      return this._createTablePostgres(tableName, attributes, options, model);
    } else {
      return this._createTableDefault(tableName, attributes, options, model);
    }
  }

  /**
   * Drop enum types for PostgreSQL
   * @private
   */
  _dropPostgresEnums(tableName, options) {
    const promises = [];
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

    return promises;
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
      const promises = [];

      if (this.sequelize.options.dialect === 'postgres') {
        promises.push(...this._dropPostgresEnums(tableName, options));
      }

      return Promise.all(promises).get(0);
    });
  }

  /**
   * Drop all tables from database - SQLite specific handling
   * @private
   */
  _dropAllTablesSqlite(tableNames, options) {
    const dropAllTables = tableNames => Promise.each(tableNames, tableName => {
      const skip = options.skip || [];
      if (skip.indexOf(tableName.tableName || tableName) === -1) {
        return this.dropTable(tableName, _.assign({}, options, { cascade: true }));
      }
    });

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
   * Drop all tables from database - non-SQLite handling
   * @private
   */
  _dropAllTablesDefault(tableNames, options) {
    const dropAllTables = tableNames => Promise.each(tableNames, tableName => {
      const skip = options.skip || [];
      if (skip.indexOf(tableName.tableName || tableName) === -1) {
        return this.dropTable(tableName, _.assign({}, options, { cascade: true }));
      }
    });

    return this.getForeignKeysForTables(tableNames, options).then(foreignKeys => {
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

      return Promise.all(promises).then(() => dropAllTables(tableNames));
    });
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

    return this.showAllTables(options).then(tableNames => {
      if (this.sequelize.options.dialect === 'sqlite') {
        return this._dropAllTablesSqlite(tableNames, options);
      } else {
        return this._dropAllTablesDefault(tableNames, options);
      }
    });
  }

  /**
   * Drop all enums from database, Postgres Only
   *
   * @param {Object} options Query options
   *
   * @return {Promise}
   * @private
   */
  dropAllEnums(options) {
    if (this.sequelize.getDialect() !== 'postgres') {
      return Promise.resolve();
    }

    options = options || {};

    return this.pgListEnums(null, options).map(result => this.sequelize.query(
      this.QueryGenerator.pgEnumDrop(null, null, this.QueryGenerator.pgEscapeAndQuote(result.enum_name)),
      _.assign({}, options, { raw: true })
    ));
  }

  /**
   * List all enums, Postgres Only
   *
   * @param {String} [tableName]  Table whose enum to list
   * @param {Object} [options]    Query options
   *
   * @return {Promise}
   * @private
   */
  pgListEnums(tableName, options) {
    options = options || {};
    const sql = this.QueryGenerator.pgListEnums(tableName);
    return this.sequelize.query(sql, _.assign({}, options, { plain: false, raw: true, type: QueryTypes.SELECT }));
  }

  /**
   * Renames a table
   *
   * @param {String} before    Current name of table
   * @param {String} after     New name from table
   * @param {Object} [options] Query options
   *
   * @return {Promise}
   */
  renameTable(before, after, options) {
    options = options || {};
    const sql = this.QueryGenerator.renameTableQuery(before, after);
    return this.sequelize.query(sql, options);
  }

  /**
   * Get all tables in current database
   *
   * @param {Object}    [options] Query options
   * @param {Boolean}   [options.raw=true]