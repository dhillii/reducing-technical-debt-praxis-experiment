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
    return this._executeSchemaCommand('create', schema, options);
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
    return this._executeSchemaCommand('drop', schema, options);
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
    const createTableOptions = {
      tableName,
      attributes,
      options,
      model
    };

    return this._createTableInternal(createTableOptions);
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
    const dropTableOptions = {
      tableName,
      options
    };

    return this._dropTableInternal(dropTableOptions);
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
    const dropAllTablesOptions = {
      options
    };

    return this._dropAllTablesInternal(dropAllTablesOptions);
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
    const dropAllEnumsOptions = {
      options
    };

    return this._dropAllEnumsInternal(dropAllEnumsOptions);
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
    const pgListEnumsOptions = {
      tableName,
      options
    };

    return this._pgListEnumsInternal(pgListEnumsOptions);
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
    const renameTableOptions = {
      before,
      after,
      options
    };

    return this._renameTableInternal(renameTableOptions);
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
    const showAllTablesOptions = {
      options
    };

    return this._showAllTablesInternal(showAllTablesOptions);
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
    const describeTableOptions = {
      tableName,
      options
    };

    return this._describeTableInternal(describeTableOptions);
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
    const addColumnOptions = {
      table,
      key,
      attribute,
      options
    };

    return this._addColumnInternal(addColumnOptions);
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
    const removeColumnOptions = {
      tableName,
      attributeName,
      options
    };

    return this._removeColumnInternal(removeColumnOptions);
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
    const changeColumnOptions = {
      tableName,
      attributeName,
      dataTypeOrOptions,
      options
    };

    return this._changeColumnInternal(changeColumnOptions);
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
    const renameColumnOptions = {
      tableName,
      attrNameBefore,
      attrNameAfter,
      options
    };

    return this._renameColumnInternal(renameColumnOptions);
  }

  /**
   * Add index to a column
   *
   * @param {String}  tableName        Table name to add index on
   * @param {Object}  options
   * @param {Array}   options.fields   List of attributes to add index on
   * @param {Boolean} [options.unique] Create a unique index
   * @param {String}  [options.using]  Useful for GIN indexes
   * @param {String}  [options.type]   Type of index, available options are UNIQUE|FULLTEXT|SPATIAL
   * @param {String}  [options.name]   Name of the index. Default is <table>_<attr1>_<attr2>
   * @param {Object}  [options.where]  Where condition on index, for partial indexes
   *
   * @return {Promise}
   */
  addIndex(tableName, attributes, options, rawTablename) {
    const addIndexOptions = {
      tableName,
      attributes,
      options,
      rawTablename
    };

    return this._addIndexInternal(addIndexOptions);
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
    const showIndexOptions = {
      tableName,
      options
    };

    return this._showIndexInternal(showIndexOptions);
  }

  /**
   * Get foreign key references details for the table.
   *
   * @param {String} tableName
   * @param {Object} [options]  Query options
   * @returns {Promise}
   */
  getForeignKeyReferencesForTable(tableName, options) {
    const getForeignKeyReferencesForTableOptions = {
      tableName,
      options
    };

    return this._getForeignKeyReferencesForTableInternal(getForeignKeyReferencesForTableOptions);
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
    const removeIndexOptions = {
      tableName,
      indexNameOrAttributes,
      options
    };

    return this._removeIndexInternal(removeIndexOptions);
  }

  /**
   * Add constraints to table
   *
   * @param {String} tableName                  Table name where you want to add a constraint
   * @param {Array}  attributes                 Array of column names to apply the constraint over
   * @param {Object} options                    An object to define the constraint name, type etc
   * @param {String} options.type               Type of constraint. One of the values in available constraints(case insensitive)
   * @param {String} [options.name]             Name of the constraint. If not specified, sequelize automatically creates a named constraint based on constraint type, table & column names
   * @param {String} [options.defaultValue]     The value for the default constraint
   * @param {Object} [options.where]            Where clause/expression for the CHECK constraint
   * @param {Object} [options.references]       Object specifying target table, column name to create foreign key constraint
   * @param {String} [options.references.table] Target table name
   * @param {String} [options.references.field] Target column name
   *
   * @return {Promise}
   */
  addConstraint(tableName, attributes, options, rawTablename) {
    const addConstraintOptions = {
      tableName,
      attributes,
      options,
      rawTablename
    };

    return this._addConstraintInternal(addConstraintOptions);
  }

  /**
   *
   * @param {String} tableName       Table name to drop constraint from
   * @param {String} constraintName  Constraint name
   * @param {Object} options         Query options
   *
   * @return {Promise}
   */
  removeConstraint(tableName, constraintName, options) {
    const removeConstraintOptions = {
      tableName,
      constraintName,
      options
    };

    return this._removeConstraintInternal(removeConstraintOptions);
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
    const upsertOptions = {
      tableName,
      insertValues,
      updateValues,
      where,
      model,
      options
    };

    return this._upsertInternal(upsertOptions);
  }

  /**
   * Insert records into a table
   *
   * @param {String} tableName             Table name to insert record to
   * @param {Array}  records               List of records to insert
   * @param {Object} options               Various options, please see Model.bulkCreate options
   * @param {Object} fieldMappedAttributes Various attributes mapped by field name
   *
   * @return {Promise}
   */
  bulkInsert(tableName, records, options, attributes) {
    const bulkInsertOptions = {
      tableName,
      records,
      options,
      attributes
    };

    return this._bulkInsertInternal(bulkInsertOptions);
  }

  /**
   * Delete records from a table
   *
   * @param {String} tableName  Table name from where to delete records
   * @param {Object} identifier Where conditions to find records to delete
   *
   * @return {Promise}
   */
  bulkDelete(tableName, identifier, options, model) {
    const bulkDeleteOptions = {
      tableName,
      identifier,
      options,
      model
    };

    return this._bulkDeleteInternal(bulkDeleteOptions);
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
   * @param {Object} [options]
   *
   * @return {Promise}
   */
  createFunction(functionName, params, returnType, language, body, optionsArray, options) {
    const createFunctionOptions = {
      functionName,
      params,
      returnType,
      language,
      body,
      optionsArray,
      options
    };

    return this._createFunctionInternal(createFunctionOptions);
  }

  /**
   * Drop SQL function
   *
   * @param {String} functionName Name of SQL function to drop
   * @param {Array}  params       List of parameters declared for SQL function
   * @param {Object} [options]
   *
   * @return {Promise}
   */
  dropFunction(functionName, params, options) {
    const dropFunctionOptions = {
      functionName,
      params,
      options
    };

    return this._dropFunctionInternal(dropFunctionOptions);
  }

  /**
   * Rename SQL function
   *
   * @param {String} oldFunctionName
   * @param {Array}  params           List of parameters declared for SQL function
   * @param {String} newFunctionName
   * @param {Object} [options]
   *
   * @return {Promise}
   */
  renameFunction(oldFunctionName, params, newFunctionName, options) {
    const renameFunctionOptions = {
      oldFunctionName,
      params,
      newFunctionName,
      options
    };

    return this._renameFunctionInternal(renameFunctionOptions);
  }

  // Helper methods useful for querying

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
    const setAutocommitOptions = {
      transaction,
      value,
      options
    };

    return this._setAutocommitInternal(setAutocommitOptions);
  }

  setIsolationLevel(transaction, value, options) {
    const setIsolationLevelOptions = {
      transaction,
      value,
      options
    };

    return this._setIsolationLevelInternal(setIsolationLevelOptions);
  }

  startTransaction(transaction, options) {
    const startTransactionOptions = {
      transaction,
      options
    };

    return this._startTransactionInternal(startTransactionOptions);
  }

  deferConstraints(transaction, options) {
    const deferConstraintsOptions = {
      transaction,
      options
    };

    return this._deferConstraintsInternal(deferConstraintsOptions);
  }

  commitTransaction(transaction, options) {
    const commitTransactionOptions = {
      transaction,
      options
    };

    return this._commitTransactionInternal(commitTransactionOptions);
  }

  rollbackTransaction(transaction, options) {
    const rollbackTransactionOptions = {
      transaction,
      options
    };

    return this._rollbackTransactionInternal(rollbackTransactionOptions);
  }

  /**
   * Internal implementation for schema creation and dropping
   * @private
   */
  _executeSchemaCommand(command, schema, options) {
    options = options || {};
    const sql = this.QueryGenerator[`${command}Schema`](schema);
    return this.sequelize.query(sql, options);
  }

  /**
   * Internal implementation for table creation
   * @private
   */
  _createTableInternal(createTableOptions) {
    const { tableName, attributes, options, model } = createTableOptions;
    const keys = Object.keys(attributes);
    const keyLen = keys.length;
    let sql = '';
    let i = 0;

    options = _.clone(options) || {};

    attributes = _.mapValues(attributes, attribute => {
      if (!_.isPlainObject(attribute)) {
        attribute = { type: attribute, allowNull: true };
      }

      attribute = this.sequelize.normalizeAttribute(attribute);

      return attribute;
    });

    // Postgres requires a special SQL command for enums
    if (this.sequelize.options.dialect === 'postgres') {
      const promises = [];

      for (i = 0; i < keyLen; i++) {
        const attribute = attributes[keys[i]];
        const type = attribute.type;

        if (
          type instanceof DataTypes.ENUM ||
          (type instanceof DataTypes.ARRAY && type.type instanceof DataTypes.ENUM) //ARRAY sub type is ENUM
        ) {
          sql = this.QueryGenerator.pgListEnums(tableName, attribute.field || keys[i], options);
          promises.push(this.sequelize.query(
            sql,
            _.assign({}, options, { plain: true, raw: true, type: QueryTypes.SELECT })
          ));
        }
      }

      return Promise.all(promises).then(results => {
        const promises = [];
        let enumIdx = 0;

        for (i = 0; i < keyLen; i++) {
          const attribute = attributes[keys[i]];
          const type = attribute.type;
          const enumType = type.type || type;

          if (
            type instanceof DataTypes.ENUM ||
            (type instanceof DataTypes.ARRAY && enumType instanceof DataTypes.ENUM) //ARRAY sub type is ENUM
          ) {
            // If the enum type doesn't exist then create it
            if (!results[enumIdx]) {
              sql = this.QueryGenerator.pgEnum(tableName, attribute.field || keys[i], enumType, options);
              promises.push(this.sequelize.query(
                sql,
                _.assign({}, options, { raw: true })
              ));
            } else if (!!results[enumIdx] && !!model) {
              const enumVals = this.QueryGenerator.fromArray(results[enumIdx].enum_value);
              const vals = enumType.values;

              vals.forEach((value, idx) => {
                // reset out after/before options since it's for every enum value
                const valueOptions = _.clone(options);
                valueOptions.before = null;
                valueOptions.after = null;

                if (enumVals.indexOf(value) === -1) {
                  if (vals[idx + 1]) {
                    valueOptions.before = vals[idx + 1];
                  }
                  else if (vals[idx - 1]) {
                    valueOptions.after = vals[idx - 1];
                  }
                  valueOptions.supportsSearchPath = false;
                  promises.push(this.sequelize.query(this.QueryGenerator.pgEnumAdd(tableName, attribute.field || keys[i], value, valueOptions), valueOptions));
                }
              });
              enumIdx++;
            }
          }
        }

        if (!tableName.schema &&
          (options.schema || !!model && model._schema)) {
          tableName = this.QueryGenerator.addSchema({
            tableName,
            _schema: !!model && model._schema || options.schema
          });
        }

        attributes = this.QueryGenerator.attributesToSQL(attributes, {
          context: 'createTable'
        });
        sql = this.QueryGenerator.createTableQuery(tableName, attributes, options);

        return Promise.all(promises)
          .tap(() => {
            // If ENUM processed, then refresh OIDs
            if (promises.length) {
              return this.sequelize.dialect.connectionManager._refreshDynamicOIDs();
            }
          })
          .then(() => {
            return this.sequelize.query(sql, options);
          });
      });
    } else {
      if (!tableName.schema &&
        (options.schema || !!model && model._schema)) {
        tableName = this.QueryGenerator.addSchema({
          tableName,
          _schema: !!model && model._schema || options.schema
        });
      }

      attributes = this.QueryGenerator.attributesToSQL(attributes, {
        context: 'createTable'
      });
      sql = this.QueryGenerator.createTableQuery(tableName, attributes, options);

      return this.sequelize.query(sql, options);
    }
  }

  /**
   * Internal implementation for table dropping
   * @private
   */
  _dropTableInternal(dropTableOptions) {
    const { tableName, options } = dropTableOptions;
    // if we're forcing we should be cascading unless explicitly stated otherwise
    options = _.clone(options) || {};
    options.cascade = options.cascade || options.force || false;

    let sql = this.QueryGenerator.dropTableQuery(tableName, options);

    return this.sequelize.query(sql, options).then(() => {
      const promises = [];

      // Since postgres has a special case for enums, we should drop the related
      // enum type within the table and attribute
      if (this.sequelize.options.dialect === 'postgres') {
        const instanceTable = this.sequelize.modelManager.getModel(tableName, { attribute: 'tableName' });

        if (instanceTable) {
          const getTableName = (!options || !options.schema || options.schema === 'public' ? '' : options.schema + '_') + tableName;

          const keys = Object.keys(instanceTable.rawAttributes);
          const keyLen = keys.length;

          for (let i = 0; i < keyLen; i++) {
            if (instanceTable.rawAttributes[keys[i]].type instanceof DataTypes.ENUM) {
              sql = this.QueryGenerator.pgEnumDrop(getTableName, keys[i]);
              options.supportsSearchPath = false;
              promises.push(this.sequelize.query(sql, _.assign({}, options, { raw: true })));
            }
          }
        }
      }

      return Promise.all(promises).get(0);
    });
  }

  /**
   * Internal implementation for dropping all tables
   * @private
   */
  _dropAllTablesInternal(dropAllTablesOptions) {
    const { options } = dropAllTablesOptions;
    options = options || {};
    const skip = options.skip || [];

    const dropAllTables = tableNames => Promise.each(tableNames, tableName => {
      // if tableName is not in the Array of tables names then dont drop it
      if (skip.indexOf(tableName.tableName || tableName) === -1) {
        return this.dropTable(tableName, _.assign({}, options, { cascade: true }) );
      }
    });

    return this.showAllTables(options).then(tableNames => {
      if (this.sequelize.options.dialect === 'sqlite') {
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
      } else {
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
    });
  }

  /**
   * Internal implementation for dropping all enums
   * @private
   */
  _dropAllEnumsInternal(dropAllEnumsOptions) {
    const { options } = dropAllEnumsOptions;
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
   * Internal implementation for listing enums
   * @private
   */
  _pgListEnumsInternal(pgListEnumsOptions) {
    const { tableName, options } = pgListEnumsOptions;
    options = options || {};
    const sql = this.QueryGenerator.pgListEnums(tableName);
    return this.sequelize.query(sql, _.assign({}, options, { plain: false, raw: true, type: QueryTypes.SELECT }));
  }

  /**
   * Internal implementation for renaming a table
   * @private
   */
  _renameTableInternal(renameTableOptions) {
    const { before, after, options } = renameTableOptions;
    options = options || {};
    const sql = this.QueryGenerator.renameTableQuery(before, after);
    return this.sequelize.query(sql, options);
  }

  /**
   * Internal implementation for showing all tables
   * @private
   */
  _showAllTablesInternal(showAllTablesOptions) {
    const { options } = showAllTablesOptions;
    options = _.assign({}, options, {
      raw: true,
      type: QueryTypes.SHOWTABLES
    });

    const showTablesSql = this.QueryGenerator.showTablesQuery();
    return this.sequelize.query(showTablesSql, options).then(tableNames => _.flatten(tableNames));
  }

  /**
   * Internal implementation for describing a table
   * @private
   */
  _describeTableInternal(describeTableOptions) {
    const { tableName, options } = describeTableOptions;
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

    const sql = this.QueryGenerator.describeTableQuery(tableName, schema, schemaDelimiter);

    return this.sequelize.query(
      sql,
      _.assign({}, options, { type: QueryTypes.DESCRIBE })
    ).then(data => {
      // If no data is returned from the query, then the table name may be wrong.
      // Query generators that use information_schema for retrieving table info will just return an empty result set,
      // it will not throw an error like built-ins do (e.g. DESCRIBE on MySql).
      if (_.isEmpty(data)) {
        return Promise.reject('No description found for "' + tableName + '" table. Check the table name and schema; remember, they _are_ case sensitive.');
      } else {
        return Promise.resolve(data);
      }
    });
  }

  /**
   * Internal implementation for adding a column
   * @private
   */
  _addColumnInternal(addColumnOptions) {
    const { table, key, attribute, options } = addColumnOptions;
    if (!table || !key || !attribute) {
      throw new Error('addColumn takes atleast 3 arguments (table, attribute name, attribute definition)');
    }

    options = options || {};
    attribute = this.sequelize.normalizeAttribute(attribute);
    return this.sequelize.query(this.QueryGenerator.addColumnQuery(table, key, attribute), options);
  }

  /**
   * Internal implementation for removing a column
   * @private
   */
  _removeColumnInternal(removeColumnOptions) {
    const { tableName, attributeName, options } = removeColumnOptions;
    options = options || {};
    switch (this.sequelize.options.dialect) {
      case 'sqlite':
        // sqlite needs some special treatment as it cannot drop a column
        return SQLiteQueryInterface.removeColumn.call(this, tableName, attributeName, options);
      case 'mssql':
        // mssql needs special treatment as it cannot drop a column with a default or foreign key constraint
        return MSSSQLQueryInterface.removeColumn.call(this, tableName, attributeName, options);
      case 'mysql':
        // mysql needs special treatment as it cannot drop a column with a foreign key constraint
        return MySQLQueryInterface.removeColumn.call(this, tableName, attributeName, options);
      default:
        return this.sequelize.query(this.QueryGenerator.removeColumnQuery(tableName, attributeName), options);
    }
  }

  /**
   * Internal implementation for changing a column
   * @private
   */
  _changeColumnInternal(changeColumnOptions) {
    const { tableName, attributeName, dataTypeOrOptions, options } = changeColumnOptions;
    const attributes = {};
    options = options || {};

    if (_.values(DataTypes).indexOf(dataTypeOrOptions) > -1) {
      attributes[attributeName] = { type: dataTypeOrOptions, allowNull: true };
    } else {
      attributes[attributeName] = dataTypeOrOptions;
    }

    attributes[attributeName].type = this.sequelize.normalizeDataType(attributes[attributeName].type);

    if (this.sequelize.options.dialect === 'sqlite') {
      // sqlite needs some special treatment as it cannot change a column
      return SQLiteQueryInterface.changeColumn.call(this, tableName, attributes, options);
    } else {
      const query = this.QueryGenerator.attributesToSQL(attributes);
      const sql = this.QueryGenerator.changeColumnQuery(tableName, query);

      return this.sequelize.query(sql, options);
    }
  }

  /**
   * Internal implementation for renaming a column
   * @private
   */
  _renameColumnInternal(renameColumnOptions) {
    const { tableName, attrNameBefore, attrNameAfter, options } = renameColumnOptions;
    options = options || {};
    return this.describeTable(tableName, options).then(data => {
      if (!data[attrNameBefore]) {
        throw new Error('Table ' + tableName + ' doesn\'t have the column ' + attrNameBefore);
      }

      data = data[attrNameBefore] || {};

      const _options = {};

      _options[attrNameAfter] = {
        attribute: attrNameAfter,
        type: data.type,
        allowNull: data.allowNull,
        defaultValue: data.defaultValue
      };

      // fix: a not-null column cannot have null as default value
      if (data.defaultValue === null && !data.allowNull) {
        delete _options[attrNameAfter].defaultValue;
      }

      if (this.sequelize.options.dialect === 'sqlite') {
        // sqlite needs some special treatment as it cannot rename a column
        return SQLiteQueryInterface.renameColumn.call(this, tableName, attrNameBefore, attrNameAfter, options);
      } else {
        const sql = this.QueryGenerator.renameColumnQuery(
          tableName,
          attrNameBefore,
          this.QueryGenerator.attributesToSQL(_options)
        );
        return this.sequelize.query(sql, options);
      }
    });
  }

  /**
   * Internal implementation for adding an index
   * @private
   */
  _addIndexInternal(addIndexOptions) {
    const { tableName, attributes, options, rawTablename } = addIndexOptions;
    // Support for passing tableName, attributes, options or tableName, options (with a fields param which is the attributes)
    if (!Array.isArray(attributes)) {
      rawTablename = options;
      options = attributes;
      attributes = options.fields;
    }
    // testhint argsConform.end

    if (!rawTablename) {
      // Map for backwards compat
      rawTablename = tableName;
    }

    options = Utils.cloneDeep(options);
    options.fields = attributes;
    const sql = this.QueryGenerator.addIndexQuery(tableName, options, rawTablename);
    return this.sequelize.query(sql, _.assign({}, options, { supportsSearchPath: false }));
  }

  /**
   * Internal implementation for showing indexes
   * @private
   */
  _showIndexInternal(showIndexOptions) {
    const { tableName, options } = showIndexOptions;
    const sql = this.QueryGenerator.showIndexesQuery(tableName, options);
    return this.sequelize.query(sql, _.assign({}, options, { type: QueryTypes.SHOWINDEXES }));
  }

  /**
   * Internal implementation for getting foreign key references
   * @private
   */
  _getForeignKeyReferencesForTableInternal(getForeignKeyReferencesForTableOptions) {
    const { tableName, options } = getForeignKeyReferencesForTableOptions;
    const queryOptions = Object.assign({}, options, {
      type: QueryTypes.FOREIGNKEYS
    });
    const catalogName = this.sequelize.config.database;
    switch (this.sequelize.options.dialect) {
      case 'sqlite':
        // sqlite needs some special treatment.
        return SQLiteQueryInterface.getForeignKeyReferencesForTable.call(this, tableName, queryOptions);
      case 'postgres':
      {
        // postgres needs some special treatment as those field names returned are all lowercase
        // in order to keep same result with other dialects.
        const query = this.QueryGenerator.getForeignKeyReferencesQuery(tableName, catalogName);
        return this.sequelize.query(query, queryOptions)
          .then(result => result.map(Utils.camelizeObjectKeys));
      }
      case 'mssql':
      case 'mysql':
      default:
      {
        const query = this.QueryGenerator.getForeignKeysQuery(tableName, catalogName);
        return this.sequelize.query(query, queryOptions);
      }
    }
  }

  /**
   * Internal implementation for removing an index
   * @private
   */
  _removeIndexInternal(removeIndexOptions) {
    const { tableName, indexNameOrAttributes, options } = removeIndexOptions;
    options = options || {};
    const sql = this.QueryGenerator.removeIndexQuery(tableName, indexNameOrAttributes);
    return this.sequelize.query(sql, options);
  }

  /**
   * Internal implementation for adding a constraint
   * @private
   */
  _addConstraintInternal(addConstraintOptions) {
    const { tableName, attributes, options, rawTablename } = addConstraintOptions;
    if (!Array.isArray(attributes)) {
      rawTablename = options;
      options = attributes;
      attributes = options.fields;
    }

    if (!options.type) {
      throw new Error('Constraint type must be specified through options.type');
    }

    if (!rawTablename) {
      // Map for backwards compat
      rawTablename = tableName;
    }

    options = Utils.cloneDeep(options);
    options.fields = attributes;

    if (this.sequelize.dialect.name === 'sqlite') {
      return SQLiteQueryInterface.addConstraint.call(this, tableName, options, rawTablename);
    } else {
      const sql = this.QueryGenerator.addConstraintQuery(tableName, options, rawTablename);
      return this.sequelize.query(sql, options);
    }
  }

  /**
   * Internal implementation for removing a constraint
   * @private
   */
  _removeConstraintInternal(removeConstraintOptions) {
    const { tableName, constraintName, options } = removeConstraintOptions;
    options = options || {};

    switch (this.sequelize.options.dialect) {
      case 'mysql':
        //Mysql does not support DROP CONSTRAINT. Instead DROP PRIMARY, FOREIGN KEY, INDEX should be used
        return MySQLQueryInterface.removeConstraint.call(this, tableName, constraintName, options);
      case 'sqlite':
        return SQLiteQueryInterface.removeConstraint.call(this, tableName, constraintName, options);
      default:
        const sql = this.QueryGenerator.removeConstraintQuery(tableName, constraintName);
        return this.sequelize.query(sql, options);
    }
  }

  /**
   * Internal implementation for upsert
   * @private
   */
  _upsertInternal(upsertOptions) {
    const { tableName, insertValues, updateValues, where, model, options } = upsertOptions;
    const wheres = [];
    const attributes = Object.keys(insertValues);
    let indexes = [];
    let indexFields;

    options = _.clone(options);

    if (!Utils.isWhereEmpty(where)) {
      wheres.push(where);
    }

    // Lets combine uniquekeys and indexes into one
    indexes = _.map(model.options.uniqueKeys, value => {
      return value.fields;
    });

    _.each(model.options.indexes, value => {
      if (value.unique) {
        // fields in the index may both the strings or objects with an attribute property - lets sanitize that
        indexFields = _.map(value.fields, field => {
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
        where = {};
        for (const field of index) {
          where[field] = insertValues[field];
        }
        wheres.push(where);
      }
    }

    where = { [Op.or]: wheres };

    options.type = QueryTypes.UPSERT;
    options.raw = true;

    const sql = this.QueryGenerator.upsertQuery(tableName, insertValues, updateValues, where, model, options);
    return this.sequelize.query(sql, options).then(result => {
      switch (this.sequelize.options.dialect) {
        case 'postgres':
          return [result.created, result.primary_key];

        case 'mssql':
          return [
            result.$action === 'INSERT',
            result[model.primaryKeyField]
          ];

        // MySQL returns 1 for inserted, 2 for updated
        // http://dev.mysql.com/doc/refman/5.0/en/insert-on-duplicate.html.
        case 'mysql':
          return [result === 1, undefined];

        default:
          return [result, undefined];
      }
    });
  }

  /**
   * Internal implementation for bulk insert
   * @private
   */
  _bulkInsertInternal(bulkInsertOptions) {
    const { tableName, records, options, attributes } = bulkInsertOptions;
    options = _.clone(options) || {};
    options.type = QueryTypes.INSERT;

    return this.sequelize.query(
      this.QueryGenerator.bulkInsertQuery(tableName, records, options, attributes),
      options
    ).then(results => results[0]);
  }

  /**
   * Internal implementation for bulk delete
   * @private
   */
  _bulkDeleteInternal(bulkDeleteOptions) {
    const { tableName, identifier, options, model } = bulkDeleteOptions;
    options = Utils.cloneDeep(options);
    options = _.defaults(options, {limit: null});
    if (typeof identifier === 'object') identifier = Utils.cloneDeep(identifier);

    const sql = this.QueryGenerator.deleteQuery(tableName, identifier, options, model);
    return this.sequelize.query(sql, options);
  }

  /**
   * Internal implementation for creating a function
   * @private
   */
  _createFunctionInternal(createFunctionOptions) {
    const { functionName, params, returnType, language, body, optionsArray, options } = createFunctionOptions;
    const sql = this.QueryGenerator.createFunction(functionName, params, returnType, language, body, optionsArray);
    options = options || {};

    if (sql) {
      return this.sequelize.query(sql, options);
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Internal implementation for dropping a function
   * @private
   */
  _dropFunctionInternal(dropFunctionOptions) {
    const { functionName, params, options } = dropFunctionOptions;
    const sql = this.QueryGenerator.dropFunction(functionName, params);
    options = options || {};

    if (sql) {
      return this.sequelize.query(sql, options);
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Internal implementation for renaming a function
   * @private
   */
  _renameFunctionInternal(renameFunctionOptions) {
    const { oldFunctionName, params, newFunctionName, options } = renameFunctionOptions;
    const sql = this.QueryGenerator.renameFunction(oldFunctionName, params, newFunctionName);
    options = options || {};

    if (sql) {
      return this.sequelize.query(sql, options);
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Internal implementation for setting autocommit
   * @private
   */
  _setAutocommitInternal(setAutocommitOptions) {
    const { transaction, value, options } = setAutocommitOptions;
    if (!transaction || !(transaction instanceof Transaction)) {
      throw new Error('Unable to set autocommit for a transaction without transaction object!');
    }
    if (transaction.parent) {
      // Not possible to set a separate isolation level for savepoints
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

  /**
   * Internal implementation for setting isolation level
   * @private
   */
  _setIsolationLevelInternal(setIsolationLevelOptions) {
    const { transaction, value, options } = setIsolationLevelOptions;
    if (!transaction || !(transaction instanceof Transaction)) {
      throw new Error('Unable to set isolation level for a transaction without transaction object!');
    }

    if (transaction.parent || !value) {
      // Not possible to set a separate isolation level for savepoints
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

  /**
   * Internal implementation for starting a transaction
   * @private
   */
  _startTransactionInternal(startTransactionOptions) {
    const { transaction, options } = startTransactionOptions;
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

  /**
   * Internal implementation for deferring constraints
   * @private
   */
  _deferConstraintsInternal(deferConstraintsOptions) {
    const { transaction, options } = deferConstraintsOptions;
    options = _.assign({}, options, {
      transaction: transaction.parent || transaction
    });

    const sql = this.QueryGenerator.deferConstraintsQuery(options);

    if (sql) {
      return this.sequelize.query(sql, options);
    }

    return Promise.resolve();
  }

  /**
   * Internal implementation for committing a transaction
   * @private
   */
  _commitTransactionInternal(commitTransactionOptions) {
    const { transaction, options } = commitTransactionOptions;
    if (!transaction || !(transaction instanceof Transaction)) {
      throw new Error('Unable to commit a transaction without transaction object!');
    }
    if (transaction.parent) {
      // Savepoints cannot be committed
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

  /**
   * Internal implementation for rolling back a transaction
   * @private
   */
  _rollbackTransactionInternal(rollbackTransactionOptions) {
    const { transaction, options } = rollbackTransactionOptions;
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