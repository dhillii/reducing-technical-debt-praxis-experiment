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

const DIALECT_HANDLERS = {
  sqlite: SQLiteQueryInterface,
  mssql: MSSSQLQueryInterface,
  mysql: MySQLQueryInterface
};

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
    }

    return this.showAllSchemas(options).map(schemaName => this.dropSchema(schemaName, options));
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

    return this.sequelize.query(showSchemasSql, options).then(schemaNames =>
      _.flatten(_.map(schemaNames, value => value.schema_name || value))
    );
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
    options = _.clone(options) || {};

    attributes = _.mapValues(attributes, attribute => {
      if (!_.isPlainObject(attribute)) {
        attribute = { type: attribute, allowNull: true };
      }
      return this.sequelize.normalizeAttribute(attribute);
    });

    if (this.sequelize.options.dialect === 'postgres') {
      return this._createTablePostgres(tableName, attributes, options, model);
    }

    return this._createTableGeneric(tableName, attributes, options, model);
  }

  _createTablePostgres(tableName, attributes, options, model) {
    const keys = Object.keys(attributes);
    const promises = [];

    // Check for existing enums
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

    return Promise.all(promises).then(results => this._handlePostgresEnums(tableName, attributes, results, options, model));
  }

  _isEnumType(type) {
    return type instanceof DataTypes.ENUM ||
      (type instanceof DataTypes.ARRAY && type.type instanceof DataTypes.ENUM);
  }

  _handlePostgresEnums(tableName, attributes, results, options, model) {
    const keys = Object.keys(attributes);
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
        } else if (results[enumIdx] && model) {
          this._addMissingEnumValues(tableName, attribute, enumType, results[enumIdx], options, promises, keys[i]);
          enumIdx++;
        }
      }
    }

    return this._finalizeTableCreation(tableName, attributes, options, model, promises);
  }

  _addMissingEnumValues(tableName, attribute, enumType, enumResult, options, promises, fieldName) {
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

  _finalizeTableCreation(tableName, attributes, options, model, promises) {
    tableName = this._addSchemaToTableName(tableName, options, model);
    const convertedAttributes = this.QueryGenerator.attributesToSQL(attributes, { context: 'createTable' });
    const sql = this.QueryGenerator.createTableQuery(tableName, convertedAttributes, options);

    return Promise.all(promises)
      .tap(() => {
        if (promises.length) {
          return this.sequelize.dialect.connectionManager._refreshDynamicOIDs();
        }
      })
      .then(() => this.sequelize.query(sql, options));
  }

  _createTableGeneric(tableName, attributes, options, model) {
    tableName = this._addSchemaToTableName(tableName, options, model);
    const convertedAttributes = this.QueryGenerator.attributesToSQL(attributes, { context: 'createTable' });
    const sql = this.QueryGenerator.createTableQuery(tableName, convertedAttributes, options);
    return this.sequelize.query(sql, options);
  }

  _addSchemaToTableName(tableName, options, model) {
    if (!tableName.schema && (options.schema || (model && model._schema))) {
      return this.QueryGenerator.addSchema({
        tableName,
        _schema: (model && model._schema) || options.schema
      });
    }
    return tableName;
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
      if (this.sequelize.options.dialect === 'postgres') {
        return this._dropPostgresEnums(tableName, options);
      }
      return Promise.resolve();
    });
  }

  _dropPostgresEnums(tableName, options) {
    const promises = [];
    const instanceTable = this.sequelize.modelManager.getModel(tableName, { attribute: 'tableName' });

    if (instanceTable) {
      const getTableName = (!options || !options.schema || options.schema === 'public' ? '' : options.schema + '_') + tableName;
      const keys = Object.keys(instanceTable.rawAttributes);

      for (let i = 0; i < keys.length; i++) {
        if (instanceTable.rawAttributes[keys[i]].type instanceof DataTypes.ENUM) {
          const sql = this.QueryGenerator.pgEnumDrop(getTableName, keys[i]);
          options.supportsSearchPath = false;
          promises.push(this.sequelize.query(sql, _.assign({}, options, { raw: true })));
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
        return this._dropAllTablesSQLite(tableNames, options, dropAllTables);
      }

      return this._dropAllTablesGeneric(tableNames, options, dropAllTables);
    });
  }

  _dropAllTablesSQLite(tableNames, options, dropAllTables) {
    return this.sequelize.query('PRAGMA foreign_keys;', options).then(result => {
      const foreignKeysAreEnabled = result.foreign_keys === 1;

      if (foreignKeysAreEnabled) {
        return this.sequelize.query('PRAGMA foreign_keys = OFF', options)
          .then(() => dropAllTables(tableNames))
          .then(() => this.sequelize.query('PRAGMA foreign_keys = ON', options));
      }

      return dropAllTables(tableNames);
    });
  }

  _dropAllTablesGeneric(tableNames, options, dropAllTables) {
    return this.getForeignKeysForTables(tableNames, options).then(foreignKeys => {
      const promises = [];

      tableNames.forEach(tableName => {
        const normalizedTableName = _.isObject(tableName)
          ? tableName.schema + '.' + tableName.tableName
          : tableName;

        foreignKeys[normalizedTableName].forEach(foreignKey => {
          const sql = this.QueryGenerator.dropForeignKeyQuery(tableName, foreignKey);
          promises.push(this.sequelize.query(sql, options));
        });
      });

      return Promise.all(promises).then(() => dropAllTables(tableNames));
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
   * @param {Boolean}   [options.raw=true] Run query in raw mode
   * @param {QueryType} [options.type=QueryType.SHOWTABLE]
   *
   * @return {Promise<Array>}
   * @private
   */
  showAllTables(options) {
    options = _.assign({}, options, {
      raw: true,
      type: QueryTypes.SHOWTABLES
    });

    const showTablesSql = this.QueryGenerator.showTablesQuery();
    return this.sequelize.query(showTablesSql, options).then(tableNames => _.flatten(tableNames));
  }

  /**
   * Describe a table structure
   *
   * @param {String} tableName
   * @param {Object} [options] Query options
   *
   * @return {Promise<Object>}
   */
  describeTable(tableName, options) {
    const { schema, schemaDelimiter } = this._parseDescribeOptions(tableName, options);

    const sql = this.QueryGenerator.describeTableQuery(tableName, schema, schemaDelimiter);

    return this.sequelize.query(
      sql,
      _.assign({}, options, { type: QueryTypes.DESCRIBE })
    ).then(data => {
      if (_.isEmpty(data)) {
        return Promise.reject(`No description found for "${tableName}" table. Check the table name and schema; remember, they _are_ case sensitive.`);
      }
      return Promise.resolve(data);
    });
  }

  _parseDescribeOptions(tableName, options) {
    let schema = null;
    let schemaDelimiter = null;

    if (typeof options ===