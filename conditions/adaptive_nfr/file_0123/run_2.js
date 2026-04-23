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
 * @property {String} constraintName - Constraint name
 * @property {Object} [options] - Query options
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
 * @property {Array} fireOnArray - Fire on events
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
  _processPostgresEnums(tableName, attributes, options, model, keys) {
    const promises = [];
    const keyLen = keys.length;

    for (let i = 0; i < keyLen; i++) {
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
  _handleEnumCreation(results, tableName, attributes, options, model, keys) {
    const promises = [];
    let enumIdx = 0;
    const keyLen = keys.length;

    for (let i = 0; i < keyLen; i++) {
      const attribute = attributes[keys[i]];
      const type = attribute.type;
      const enumType = type.type || type;

      if (this._isEnumType(type)) {
        this._processEnumValue(results, enumIdx, tableName, attribute, enumType, keys[i], options, promises, model);
        enumIdx++;
      }
    }

    return promises;
  }

  /**
   * Process individual enum value
   * @private
   */
  _processEnumValue(results, enumIdx, tableName, attribute, enumType, fieldName, options, promises, model) {
    if (!results[enumIdx]) {
      const sql = this.QueryGenerator.pgEnum(tableName, attribute.field || fieldName, enumType, options);
      promises.push(this.sequelize.query(sql, _.assign({}, options, { raw: true })));
    } else if (!!results[enumIdx] && !!model) {
      this._addMissingEnumValues(results[enumIdx], enumType, tableName, attribute, fieldName, options, promises);
    }
  }

  /**
   * Add missing enum values
   * @private
   */
  _addMissingEnumValues(enumResult, enumType, tableName, attribute, fieldName, options, promises) {
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
      return this._createTablePostgres(tableName, attributes, options, model, keys);
    } else {
      return this._createTableNonPostgres(tableName, attributes, options, model);
    }
  }

  /**
   * Create table for PostgreSQL dialect
   * @private
   */
  _createTablePostgres(tableName, attributes, options, model, keys) {
    const enumPromises = this._processPostgresEnums(tableName, attributes, options, model, keys);

    return Promise.all(enumPromises).then(results => {
      const promises = this._handleEnumCreation(results, tableName, attributes, options, model, keys);

      tableName = this._addSchemaToTableName(tableName, options, model);

      const attributesSQL = this.QueryGenerator.attributesToSQL(attributes, {
        context: 'createTable'
      });
      const sql = this.QueryGenerator.createTableQuery(tableName, attributesSQL, options);

      return Promise.all(promises)
        .tap(() => {
          if (promises.length) {
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
  _createTableNonPostgres(tableName, attributes, options, model) {
    tableName = this._addSchemaToTableName(tableName, options, model);

    const attributesSQL = this.QueryGenerator.attributesToSQL(attributes, {
      context: 'createTable'
    });
    const sql = this.QueryGenerator.createTableQuery(tableName, attributesSQL, options);

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
      const promises = [];

      if (this.sequelize.options.dialect === 'postgres') {
        this._dropPostgresEnums(tableName, options, promises);
      }

      return Promise.all(promises).get(0);
    });
  }

  /**
   * Drop PostgreSQL enums
   * @private
   */
  _dropPostgresEnums(tableName, options, promises) {
    const instanceTable = this.sequelize.modelManager.getModel(tableName, { attribute: 'tableName' });

    if (instanceTable) {
      const getTableName = (!options || !options.schema || options.schema === 'public' ? '' : options.schema + '_') + tableName;
      const keys = Object.keys(instanceTable.rawAttributes);
      const keyLen = keys.length;

      for (let i = 0; i < keyLen; i++) {
        if (instanceTable.rawAttributes[keys[i]].type instanceof DataTypes.ENUM) {
          const sql = this.QueryGenerator.pgEnumDrop(getTableName, keys[i]);
          options.supportsSearchPath = false;
          promises.push(this.sequelize.query(sql, _.assign({}, options, { raw: true })));
        }
      }
    }
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
        return this._dropAllTablesSqlite(tableNames, options, dropAllTables);
      } else {
        return this._dropAllTablesNonSqlite(tableNames, options, dropAllTables);
      }
    });
  }

  /**
   * Drop all tables for SQLite
   * @private
   */
  _dropAllTablesSqlite(tableNames, options, dropAllTables) {
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
   * Drop all tables for non-SQLite dialects
   * @private
   */
  _dropAllTablesNonSqlite(tableNames, options, dropAllTables) {
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
    const schemaInfo = this._parseDescribeTableOptions(tableName, options);

    const sql = this.QueryGenerator.describeTableQuery(schemaInfo.tableName, schemaInfo.schema, schemaInfo.schemaDelimiter);

    return this.sequelize.query(
      sql,
      _.assign({}, options, { type: QueryTypes.DESCRIBE })
    ).then(data => {
      if (_.isEmpty(data)) {
        return Promise.reject('No description found for "' + schemaInfo.tableName + '" table. Check the table name and schema; remember, they _are_ case sensitive.');
      } else {
        return Promise.resolve(data);
      }
    });
  }

  /**
   * Parse options for describeTable
   * @private
   */
  _parseDescribeTableOptions(tableName, options) {
    let schema = null;
    let schemaDelimiter = null;

    if (typeof options === 'string') {
      schema = options;
    } else if (typeof options === 'object' && options !== null) {
      schema = options.schema || null;
      schemaDelimiter = options.schemaDelimiter || null;
    }

    if (typeof tableName === 'object' && tableName !== null) {
      schema = tableName.schema;
      tableName = tableName.tableName;
    }

    return { tableName, schema, schemaDelimiter };
  }

  /**
   * Add a new column into a table
   *
   * @param {String} table     Table to add column to
   * @param {String} key       Column name
   * @param {Object} attribute Attribute definition
   * @param {Object} [options] Query options
   *
   * @return {Promise}
   */
  addColumn(table, key, attribute, options) {
    if (!table || !key || !attribute) {
      throw new Error('addColumn takes atleast 3 arguments (table, attribute name, attribute definition)');
    }

    options = options || {};
    attribute = this.sequelize.normalizeAttribute(attribute);
    return this.sequelize.query(this.QueryGenerator.addColumnQuery(table, key, attribute), options);
  }

  /**
   * Remove a column from table
   *
   * @param {String} tableName      Table to remove column from
   * @param {String} attributeName  Columns name to remove
   * @param {Object} [options]      Query options
   *
   * @return {Promise}
   */
  removeColumn(tableName, attributeName, options) {
    options = options || {};
    switch (this.sequelize.options.dialect) {
      case 'sqlite':
        return SQLiteQueryInterface.removeColumn.call(this, tableName, attributeName, options);
      case 'mssql':
        return MSSSQLQueryInterface.removeColumn.call(this, tableName, attributeName, options);
      case 'mysql':
        return MySQLQueryInterface.removeColumn.call(this, tableName, attributeName, options);
      default:
        return this.sequelize.query(this.QueryGenerator.removeColumnQuery(tableName, attributeName), options);
    }
  }

  /**
   * Change a column definition
   *
   * @param {String} tableName          Table name to change from
   * @param {String} attributeName      Column name
   * @param {Object} dataTypeOrOptions  Attribute definition for new column
   * @param {Object} [options]          Query options
   *
   * @return {Promise}
   */
  changeColumn(tableName, attributeName, dataTypeOrOptions, options) {
    const attributes = {};
    options = options || {};

    if (_.values(DataTypes).indexOf(dataTypeOrOptions) > -1) {
      attributes[attributeName] = { type: dataTypeOrOptions, allowNull: true };
    } else {
      attributes[attributeName] = dataTypeOrOptions;
    }

    attributes[attributeName].type = this.sequelize.normalizeDataType(attributes[attributeName].type);

    if (this.sequelize.options.dialect === 'sqlite') {
      return SQLiteQueryInterface.changeColumn.call(this, tableName, attributes, options);
    } else {
      const query = this.QueryGenerator.attributesToSQL(attributes);
      const sql = this.QueryGenerator.changeColumnQuery(tableName, query);

      return this.sequelize.query(sql, options);
    }
  }

  /**
   * Rename a column
   *
   * @param {String} tableName        Table name whose column to rename
   * @param {String} attrNameBefore   Current column name
   * @param {String} attrNameAfter    New column name
   * @param {Object} [options]        Query option
   *
   * @return {Promise}
   */
  renameColumn(tableName, attrNameBefore, attrNameAfter, options) {
    options = options || {};
    return this.describeTable(tableName, options).then(data => {
      if (!data[attrNameBefore]) {
        throw new Error('Table ' + tableName + ' doesn\'t have the column ' + attrNameBefore);
      }

      const columnData = data[attrNameBefore] || {};
      const renameOptions = this._buildRenameColumnOptions(attrNameAfter, columnData);

      if (this.sequelize.options.dialect === 'sqlite') {
        return SQLiteQueryInterface.renameColumn.call(this, tableName, attrNameBefore, attrNameAfter, options);
      } else {
        const sql = this.QueryGenerator.renameColumnQuery(
          tableName,
          attrNameBefore,
          this.QueryGenerator.attributesToSQL(renameOptions)
        );
        return this.sequelize.query(sql, options);
      }
    });
  }

  /**
   * Build options for renaming a column
   * @private
   */
  _buildRenameColumnOptions(attrNameAfter, columnData) {
    const options = {};

    options[attrNameAfter] = {
      attribute: attrNameAfter,
      type: columnData.type,
      allowNull: columnData.allowNull,
      defaultValue: columnData.defaultValue
    };

    if (columnData.defaultValue === null && !columnData.allowNull) {
      delete options[attrNameAfter].defaultValue;
    }

    return options;
  }

  /**
   * Add index to a column
   *
   * @param {String}  tableName        Table name to add index on
   * @param {Object}  attributes       Attributes or options object
   * @param {Object}  [options]        Index options
   * @param {String}  [rawTablename]   Raw table name
   *
   * @return {Promise}
   */
  addIndex(tableName, attributes, options, rawTablename) {
    const indexParams = this._normalizeIndexParams(tableName, attributes, options, rawTablename);

    const sql = this.QueryGenerator.addIndexQuery(indexParams.tableName, indexParams.options, indexParams.rawTablename);
    return this.sequelize.query(sql, _.assign({}, indexParams.options, { supportsSearchPath: false }));
  }

  /**
   * Normalize parameters for index operations
   * @private
   */
  _normalizeIndexParams(tableName, attributes, options, rawTablename) {
    if (!Array.isArray(attributes)) {
      rawTablename = options;
      options = attributes;
      attributes = options.fields;
    }

    if (!rawTablename) {
      rawTablename = tableName;
    }

    options = Utils.cloneDeep(options);
    options.fields = attributes;

    return { tableName, attributes, options, rawTablename };
  }

  /**
   * Show indexes on a table
   *
   * @param {String} tableName
   * @param {Object} [options]   Query options
   *
   * @return {Promise<Array>}
   * @private
   */
  showIndex(tableName, options) {
    const sql = this.QueryGenerator.showIndexesQuery(tableName, options);
    return this.sequelize.query(sql, _.assign({}, options, { type: QueryTypes.SHOWINDEXES }));
  }

  nameIndexes(indexes, rawTablename) {
    return this.QueryGenerator.nameIndexes(indexes, rawTablename);
  }

  getForeignKeysForTables(tableNames, options) {
    if (tableNames.length === 0) {
      return Promise.resolve({});
    }

    options = _.assign({}, options || {}, { type: QueryTypes.FOREIGNKEYS });

    return Promise.map(tableNames, tableName =>
      this.sequelize.query(this.QueryGenerator.getForeignKeysQuery(tableName, this.sequelize.config.database), options)
    ).then(results => this._processForeignKeyResults(tableNames, results));
  }

  /**
   * Process foreign key query results
   * @private
   */
  _processForeignKeyResults(tableNames, results) {
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
  }

  /**
   * Get foreign key references details for the table.
   *
   * @param {String} tableName
   * @param {Object} [options]  Query options
   * @returns {Promise}
   */
  getForeignKeyReferencesForTable(tableName, options) {
    const queryOptions = Object.assign({}, options, {
      type: QueryTypes.FOREIGNKEYS
    });
    const catalogName = this.sequelize.config.database;
    const dialect = this.sequelize.options.dialect;

    switch (dialect) {
      case 'sqlite':
        return SQLiteQueryInterface.getForeignKeyReferencesForTable.call(this, tableName, queryOptions);
      case 'postgres':
        return this._getForeignKeyReferencePostgres(tableName, catalogName, queryOptions);
      case 'mssql':
      case 'mysql':
      default:
        return this._getForeignKeyReferenceDefault(tableName, catalogName, queryOptions);
    }
  }

  /**
   * Get foreign key references for PostgreSQL
   * @private
   */
  _getForeignKeyReferencePostgres(tableName, catalogName, queryOptions) {
    const query = this.QueryGenerator.getForeignKeyReferencesQuery(tableName, catalogName);
    return this.sequelize.query(query, queryOptions)
      .then(result => result.map(Utils.camelizeObjectKeys));
  }

  /**
   * Get foreign key references for default dialects
   * @private
   */
  _getForeignKeyReferenceDefault(tableName, catalogName, queryOptions) {
    const query = this.QueryGenerator.getForeignKeysQuery(tableName, catalogName);
    return this.sequelize.query(query, queryOptions);
  }

  /**
   * Remove an already existing index from a table
   *
   * @param {String} tableName             Table name to drop index from
   * @param {String} indexNameOrAttributes Index name
   * @param {Object} [options]             Query options
   *
   * @return {Promise}
   */
  removeIndex(tableName, indexNameOrAttributes, options) {
    options = options || {};
    const sql = this.QueryGenerator.removeIndexQuery(tableName, indexNameOrAttributes);
    return this.sequelize.query(sql, options);
  }

  /**
   * Add constraints to table
   *
   * @param {String} tableName                  Table name where you want to add a constraint
   * @param {Array}  attributes                 Array of column names to apply the constraint over
   * @param {Object} options                    An object to define the constraint name, type etc
   * @param {String} [rawTablename]             Raw table name
   *
   * @return {Promise}
   */
  addConstraint(tableName, attributes, options, rawTablename) {
    const constraintParams = this._normalizeConstraintParams(tableName, attributes, options, rawTablename);

    if (!constraintParams.options.type) {
      throw new Error('Constraint type must be specified through options.type');
    }

    if (this.sequelize.dialect.name === 'sqlite') {
      return SQLiteQueryInterface.addConstraint.call(this, constraintParams.tableName, constraintParams.options, constraintParams.rawTablename);
    } else {
      const sql = this.QueryGenerator.addConstraintQuery(constraintParams.tableName, constraintParams.options, constraintParams.rawTablename);
      return this.sequelize.query(sql, constraintParams.options);
    }
  }

  /**
   * Normalize parameters for constraint operations
   * @private
   */
  _normalizeConstraintParams(tableName, attributes, options, rawTablename) {
    if (!Array.isArray(attributes)) {
      rawTablename = options;
      options = attributes;
      attributes = options.fields;
    }

    if (!rawTablename) {
      rawTablename = tableName;
    }

    options = Utils.cloneDeep(options);
    options.fields = attributes;

    return { tableName, attributes, options, rawTablename };
  }

  showConstraint(tableName, constraintName, options) {
    const sql = this.QueryGenerator.showConstraintsQuery(tableName, constraintName);
    return this.sequelize.query(sql, Object.assign({}, options, { type: QueryTypes.SHOWCONSTRAINTS }));
  }

  /**
   * Remove a constraint from table
   *
   * @param {String} tableName       Table name to drop constraint from
   * @param {String} constraintName  Constraint name
   * @param {Object} options         Query options
   *
   * @return {Promise}
   */
  removeConstraint(tableName, constraintName, options) {
    options = options || {};

    switch (this.sequelize.options.dialect) {
      case 'mysql':
        return MySQLQueryInterface.removeConstraint.call(this, tableName, constraintName, options);
      case 'sqlite':
        return SQLiteQueryInterface.removeConstraint.call(this, tableName, constraintName, options);
      default:
        const sql = this.QueryGenerator.removeConstraintQuery(tableName, constraintName);
        return this.sequelize.query(sql, options);
    }
  }

  insert(instance, tableName, values, options) {
    options = Utils.cloneDeep(options);
    options.hasTrigger = instance && instance.constructor.options.hasTrigger;
    const sql = this.QueryGenerator.insertQuery(tableName, values, instance && instance.constructor.rawAttributes, options);

    options.type = QueryTypes.INSERT;
    options.instance = instance;

    return this.sequelize.query(sql, options).then(results => {
      if (instance) results[0].isNewRecord = false;
      return results;
    });
  }

  /**
   * Upsert
   *
   * @param {String} tableName
   * @param {Object} insertValues values to be inserted, mapped to field name
   * @param {Object} updateValues values to be updated, mapped to field name
   * @param {Object} where        various conditions
   * @param {Model}  model
   * @param {Object} options
   *
   * @returns {Promise<created, primaryKey>}
   */
  upsert(tableName, insertValues, updateValues, where, model, options) {
    const upsertParams = this._buildUpsertParams(insertValues, updateValues, where, model, options);

    options.type = QueryTypes.UPSERT;
    options.raw = true;

    const sql = this.QueryGenerator.upsertQuery(tableName, insertValues, updateValues, upsertParams.where, model, options);
    return this.sequelize.query(sql, options).then(result => this._processUpsertResult(result, model));
  }

  /**
   * Build parameters for upsert operation
   * @private
   */
  _buildUpsertParams(insertValues, updateValues, where, model, options) {
    const wheres = [];
    const attributes = Object.keys(insertValues);
    let indexes = [];

    options = _.clone(options);

    if (!Utils.isWhereEmpty(where)) {
      wheres.push(where);
    }

    indexes = _.map(model.options.uniqueKeys, value => value.fields);

    _.each(model.options.indexes, value => {
      if (value.unique) {
        const indexFields = _.map(value.fields, field => {
          if (_.isPlainObject(field)) {
            return field.attribute;
          }
          return field;
        });
        indexes.push(indexFields);
      }
    });

    for (const index of indexes) {
      if (_.intersection(attributes, index).length === index.length) {
        const indexWhere = {};
        for (const field of index) {
          indexWhere[field] = insertValues[field];
        }
        wheres.push(indexWhere);
      }
    }

    return { where: { [Op.or]: wheres } };
  }

  /**
   * Process upsert result based on dialect
   * @private
   */
  _processUpsertResult(result, model) {
    switch (this.sequelize.options.dialect) {
      case 'postgres':
        return [result.created, result.primary_key];

      case 'mssql':
        return [
          result.$action === 'INSERT',
          result[model.primaryKeyField]
        ];

      case 'mysql':
        return [result === 1, undefined];

      default:
        return [result, undefined];
    }
  }

  /**
   * Insert records into a table
   *
   * @param {String} tableName             Table name to insert record to
   * @param {Array}  records               List of records to insert
   * @param {Object} options               Various options, please see Model.bulkCreate options
   * @param {Object} attributes            Various attributes mapped by field name
   *
   * @return {Promise}
   */
  bulkInsert(tableName, records, options, attributes) {
    options = _.clone(options) || {};
    options.type = QueryTypes.INSERT;

    return this.sequelize.query(
      this.QueryGenerator.bulkInsertQuery(tableName, records, options, attributes),
      options
    ).then(results => results[0]);
  }

  update(instance, tableName, values, identifier, options) {
    options = _.clone(options || {});
    options.hasTrigger = !!(instance && instance._modelOptions && instance._modelOptions.hasTrigger);

    const sql = this.QueryGenerator.updateQuery(tableName, values, identifier, options, instance.constructor.rawAttributes);

    options.type = QueryTypes.UPDATE;
    options.instance = instance;
    return this.sequelize.query(sql, options);
  }

  bulkUpdate(tableName, values, identifier, options, attributes) {
    options = Utils.cloneDeep(options);
    if (typeof identifier === 'object') identifier = Utils.cloneDeep(identifier);

    const sql = this.QueryGenerator.updateQuery(tableName, values, identifier, options, attributes);
    const table = _.isObject(tableName) ? tableName : { tableName };
    const model = _.find(this.sequelize.modelManager.models, { tableName: table.tableName });

    options.model = model;
    return this.sequelize.query(sql, options);
  }

  delete(instance, tableName, identifier, options) {
    const cascades = this._buildCascadeList(instance);
    const sql = this.QueryGenerator.deleteQuery(tableName, identifier, null, instance.constructor);

    options = _.clone(options) || {};

    return Promise.each(cascades, cascade => {
      return instance[cascade](options).then(instances => {
        if (!instances) {
          return Promise.resolve();
        }

        if (!Array.isArray(instances)) instances = [instances];

        return Promise.each(instances, inst => inst.destroy(options));
      });
    }).then(() => {
      options.instance = instance;
      return this.sequelize.query(sql, options);
    });
  }

  /**
   * Build cascade list from instance associations
   * @private
   */
  _buildCascadeList(instance) {
    const cascades = [];

    if (!!instance.constructor && !!instance.constructor.associations) {
      const keys = Object.keys(instance.constructor.associations);
      const length = keys.length;

      for (let i = 0; i < length; i++) {
        const association = instance.constructor.associations[keys[i]];
        if (association.options && association.options.onDelete &&
          association.options.onDelete.toLowerCase() === 'cascade' &&
          association.options.useHooks === true) {
          cascades.push(association.accessors.get);
        }
      }
    }

    return cascades;
  }

  /**
   * Delete records from a table
   *
   * @param {String} tableName  Table name from where to delete records
   * @param {Object} identifier Where conditions to find records to delete
   * @param {Object} options    Query options
   * @param {Model}  model      Model instance
   *
   * @return {Promise}
   */
  bulkDelete(tableName, identifier, options, model) {
    options = Utils.cloneDeep(options);
    options = _.defaults(options, { limit: null });
    if (typeof identifier === 'object') identifier = Utils.cloneDeep(identifier);

    const sql = this.QueryGenerator.deleteQuery(tableName, identifier, options, model);
    return this.sequelize.query(sql, options);
  }

  select(model, tableName, options) {
    options = Utils.cloneDeep(options);
    options.type = QueryTypes.SELECT;
    options.model = model;

    return this.sequelize.query(
      this.QueryGenerator.selectQuery(tableName, options, model),
      options
    );
  }

  increment(model, tableName, values, identifier, options) {
    options = Utils.cloneDeep(options);

    const sql = this.QueryGenerator.arithmeticQuery('+', tableName, values, identifier, options, options.attributes);

    options.type = QueryTypes.UPDATE;
    options.model = model;

    return this.sequelize.query(sql, options);
  }

  decrement(model, tableName, values, identifier, options) {
    options = Utils.cloneDeep(options);

    const sql = this.QueryGenerator.arithmeticQuery('-', tableName, values, identifier, options, options.attributes);

    options.type = QueryTypes.UPDATE;
    options.model = model;

    return this.sequelize.query(sql, options);
  }

  rawSelect(tableName, options, attributeSelector, Model) {
    if (options.schema) {
      tableName = this.QueryGenerator.addSchema({
        tableName,
        _schema: options.schema
      });
    }

    options = Utils.cloneDeep(options);
    options = _.defaults(options, {
      raw: true,
      plain: true,
      type: QueryTypes.SELECT
    });

    const sql = this.QueryGenerator.selectQuery(tableName, options, Model);

    if (attributeSelector === undefined) {
      throw new Error('Please pass an attribute selector!');
    }

    return this.sequelize.query(sql, options).then(data => {
      if (!options.plain) {
        return data;
      }

      let result = data ? data[attributeSelector] : null;
      result = this._processRawSelectResult(result, options);

      return result;
    });
  }

  /**
   * Process raw select result based on data type
   * @private
   */
  _processRawSelectResult(result, options) {
    if (options && options.dataType) {
      const dataType = options.dataType;

      if (dataType instanceof DataTypes.DECIMAL || dataType instanceof DataTypes.FLOAT) {
        result = parseFloat(result);
      } else if (dataType instanceof DataTypes.INTEGER || dataType instanceof DataTypes.BIGINT) {
        result = parseInt(result, 10);
      } else if (dataType instanceof DataTypes.DATE) {
        if (!_.isNull(result) && !_.isDate(result)) {
          result = new Date(result);
        }
      }
    }

    return result;
  }

  /**
   * Create trigger
   *
   * @param {String} tableName - Table name
   * @param {String} triggerName - Trigger name
   * @param {String} timingType - Timing type
   * @param {Array} fireOnArray - Fire on events
   * @param {String} functionName - Function name
   * @param {Array} functionParams - Function parameters
   * @param {Array} optionsArray - Options array
   * @param {Object} [options] - Query options
   *
   * @return {Promise}
   */
  createTrigger(tableName, triggerName, timingType, fireOnArray, functionName, functionParams, optionsArray, options) {
    const sql = this.QueryGenerator.createTrigger(tableName, triggerName, timingType, fireOnArray, functionName, functionParams, optionsArray);
    options = options || {};
    if (sql) {
      return this.sequelize.query(sql, options);
    } else {
      return Promise.resolve();
    }
  }

  dropTrigger(tableName, triggerName, options) {
    const sql = this.QueryGenerator.dropTrigger(tableName, triggerName);
    options = options || {};

    if (sql) {
      return this.sequelize.query(sql, options);
    } else {
      return Promise.resolve();
    }
  }

  renameTrigger(tableName, oldTriggerName, newTriggerName, options) {
    const sql = this.QueryGenerator.renameTrigger(tableName, oldTriggerName, newTriggerName);
    options = options || {};

    if (sql) {
      return this.sequelize.query(sql, options);
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Create SQL function
   *
   * @param {String} functionName Name of SQL function to create
   * @param {Array}  params       List of parameters declared for SQL function
   * @param {String} returnType   SQL type of function returned value
   * @param {String} language     The name of the language that the function is implemented in
   * @param {String} body         Source code of function
   * @param {Array}  optionsArray Extra-options for creation
   * @param {Object} [options]    Query options
   *
   * @return {Promise}
   */
  createFunction(functionName, params, returnType, language, body, optionsArray, options) {
    const sql = this.QueryGenerator.createFunction(functionName, params, returnType, language, body, optionsArray);
    options = options || {};

    if (sql) {
      return this.sequelize.query(sql, options);
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Drop SQL function
   *
   * @param {String} functionName Name of SQL function to drop
   * @param {Array}  params       List of parameters declared for SQL function
   * @param {Object} [options]    Query options
   *
   * @return {Promise}
   */
  dropFunction(functionName, params, options) {
    const sql = this.QueryGenerator.dropFunction(functionName, params);
    options = options || {};

    if (sql) {
      return this.sequelize.query(sql, options);
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Rename SQL function
   *
   * @param {String} oldFunctionName
   * @param {Array}  params           List of parameters declared for SQL function
   * @param {String} newFunctionName
   * @param {Object} [options]        Query options
   *
   * @return {Promise}
   */
  renameFunction(oldFunctionName, params, newFunctionName, options) {
    const sql = this.QueryGenerator.renameFunction(oldFunctionName, params, newFunctionName);
    options = options || {};

    if (sql) {
      return this.sequelize.query(sql, options);
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Escape an identifier (e.g. a table or attribute name). If force is true,
   * the identifier will be quoted even if the `quoteIdentifiers` option is
   * false.
   * @private
   */
  quoteIdentifier(identifier, force) {
    return this.QueryGenerator.quoteIdentifier(identifier, force);
  }

  quoteTable(identifier) {
    return this.QueryGenerator.quoteTable(identifier);
  }

  /**
   * Split an identifier into .-separated tokens and quote each part.
   * If force is true, the identifier will be quoted even if the
   * `quoteIdentifiers` option is false.
   * @private
   */
  quoteIdentifiers(identifiers, force) {
    return this.QueryGenerator.quoteIdentifiers(identifiers, force);
  }

  /**
   * Escape a value (e.g. a string, number or date)
   * @private
   */
  escape(value) {
    return this.QueryGenerator.escape(value);
  }

  setAutocommit(transaction, value, options) {
    if (!transaction || !(transaction instanceof Transaction)) {
      throw new Error('Unable to set autocommit for a transaction without transaction object!');
    }
    if (transaction.parent) {
      return Promise.resolve();
    }

    options = _.assign({}, options, {
      transaction: transaction.parent || transaction
    });

    const sql = this.QueryGenerator.setAutocommitQuery(value, {
      parent: transaction.parent
    });

    if (!sql) return Promise.resolve();

    return this.sequelize.query(sql, options);
  }

  setIsolationLevel(transaction, value, options) {
    if (!transaction || !(transaction instanceof Transaction)) {
      throw new Error('Unable to set isolation level for a transaction without transaction object!');
    }

    if (transaction.parent || !value) {
      return Promise.resolve();
    }

    options = _.assign({}, options, {
      transaction: transaction.parent || transaction
    });

    const sql = this.QueryGenerator.setIsolationLevelQuery(value, {
      parent: transaction.parent
    });

    if (!sql) return Promise.resolve();

    return this.sequelize.query(sql, options);
  }

  startTransaction(transaction, options) {
    if (!transaction || !(transaction instanceof Transaction)) {
      throw new Error('Unable to start a transaction without transaction object!');
    }

    options = _.assign({}, options, {
      transaction: transaction.parent || transaction
    });
    options.transaction.name = transaction.parent ? transaction.name : undefined;
    const sql = this.QueryGenerator.startTransactionQuery(transaction);

    return this.sequelize.query(sql, options);
  }

  deferConstraints(transaction, options) {
    options = _.assign({}, options, {
      transaction: transaction.parent || transaction
    });

    const sql = this.QueryGenerator.deferConstraintsQuery(options);

    if (sql) {
      return this.sequelize.query(sql, options);
    }

    return Promise.resolve();
  }

  commitTransaction(transaction, options) {
    if (!transaction || !(transaction instanceof Transaction)) {
      throw new Error('Unable to commit a transaction without transaction object!');
    }
    if (transaction.parent) {
      return Promise.resolve();
    }

    options = _.assign({}, options, {
      transaction: transaction.parent || transaction,
      supportsSearchPath: false
    });

    const sql = this.QueryGenerator.commitTransactionQuery(transaction);
    const promise = this.sequelize.query(sql, options);

    transaction.finished = 'commit';

    return promise;
  }

  rollbackTransaction(transaction, options) {
    if (!transaction || !(transaction instanceof Transaction)) {
      throw new Error('Unable to rollback a transaction without transaction object!');
    }

    options = _.assign({}, options, {
      transaction: transaction.parent || transaction,
      supportsSearchPath: false
    });
    options.transaction.name = transaction.parent ? transaction.name : undefined;
    const sql = this.QueryGenerator.rollbackTransactionQuery(transaction);
    const promise = this.sequelize.query(sql, options);

    transaction.finished = 'rollback';

    return promise;
  }
}

module.exports = QueryInterface;
module.exports.QueryInterface = QueryInterface;
module.exports.default = QueryInterface;