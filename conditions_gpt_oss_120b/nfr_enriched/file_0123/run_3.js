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
      _.flatten(_.map(schemaNames, value => value.schema_name ? value.schema_name : value))
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

    const normalizedAttrs = this._normalizeAttributes(attributes);
    if (this.sequelize.options.dialect === 'postgres') {
      return this._handlePostgresCreate(tableName, normalizedAttrs, options, model);
    }
    return this._handleStandardCreate(tableName, normalizedAttrs, options, model);
  }

  /**
   * Normalize attribute definitions.
   *
   * @private
   * @param {Object} attributes
   * @returns {Object}
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
   * Handle PostgreSQL specific table creation (enums, schema, etc.).
   *
   * @private
   */
  _handlePostgresCreate(tableName, attributes, options, model) {
    const enumPromises = this._collectEnumPromises(tableName, attributes, options);
    return Promise.all(enumPromises).then(() => {
      const enumAlterPromises = this._processEnumAlterations(tableName, attributes, options, model);
      return Promise.all(enumAlterPromises).then(() => {
        const finalTableName = this._applySchemaIfNeeded(tableName, options, model);
        const sqlAttrs = this.QueryGenerator.attributesToSQL(attributes, { context: 'createTable' });
        const createSql = this.QueryGenerator.createTableQuery(finalTableName, sqlAttrs, options);
        return this.sequelize.query(createSql, options);
      });
    });
  }

  /**
   * Collect promises for enum existence checks.
   *
   * @private
   */
  _collectEnumPromises(tableName, attributes, options) {
    const promises = [];
    const keys = Object.keys(attributes);
    for (let i = 0; i < keys.length; i++) {
      const attr = attributes[keys[i]];
      const type = attr.type;
      if (type instanceof DataTypes.ENUM ||
        (type instanceof DataTypes.ARRAY && type.type instanceof DataTypes.ENUM)) {
        const sql = this.QueryGenerator.pgListEnums(tableName, attr.field || keys[i], options);
        promises.push(this.sequelize.query(sql, _.assign({}, options, { plain: true, raw: true, type: QueryTypes.SELECT })));
      }
    }
    return promises;
  }

  /**
   * Process enum alterations based on existence results.
   *
   * @private
   */
  _processEnumAlterations(tableName, attributes, options, model) {
    const promises = [];
    const keys = Object.keys(attributes);
    let enumIdx = 0;
    for (let i = 0; i < keys.length; i++) {
      const attr = attributes[keys[i]];
      const type = attr.type;
      const enumType = type.type || type;
      if (type instanceof DataTypes.ENUM ||
        (type instanceof DataTypes.ARRAY && enumType instanceof DataTypes.ENUM)) {
        // Create enum if missing
        if (!options._enumResults[enumIdx]) {
          const sql = this.QueryGenerator.pgEnum(tableName, attr.field || keys[i], enumType, options);
          promises.push(this.sequelize.query(sql, _.assign({}, options, { raw: true })));
        } else if (model) {
          promises.push(...this._syncEnumValues(tableName, attr, enumType, options, enumIdx));
        }
        enumIdx++;
      }
    }
    return promises;
  }

  /**
   * Synchronize enum values with model definition.
   *
   * @private
   */
  _syncEnumValues(tableName, attribute, enumType, options, enumIdx) {
    const syncPromises = [];
    const enumVals = this.QueryGenerator.fromArray(options._enumResults[enumIdx].enum_value);
    const definedVals = enumType.values;
    definedVals.forEach((value, idx) => {
      const valueOptions = _.clone(options);
      valueOptions.before = null;
      valueOptions.after = null;
      if (enumVals.indexOf(value) === -1) {
        if (definedVals[idx + 1]) {
          valueOptions.before = definedVals[idx + 1];
        } else if (definedVals[idx - 1]) {
          valueOptions.after = definedVals[idx - 1];
        }
        valueOptions.supportsSearchPath = false;
        const sql = this.QueryGenerator.pgEnumAdd(tableName, attribute.field || attribute.key, value, valueOptions);
        syncPromises.push(this.sequelize.query(sql, valueOptions));
      }
    });
    return syncPromises;
  }

  /**
   * Handle non‑PostgreSQL table creation.
   *
   * @private
   */
  _handleStandardCreate(tableName, attributes, options, model) {
    const finalTableName = this._applySchemaIfNeeded(tableName, options, model);
    const sqlAttrs = this.QueryGenerator.attributesToSQL(attributes, { context: 'createTable' });
    const createSql = this.QueryGenerator.createTableQuery(finalTableName, sqlAttrs, options);
    return this.sequelize.query(createSql, options);
  }

  /**
   * Apply schema to table name when required.
   *
   * @private
   */
  _applySchemaIfNeeded(tableName, options, model) {
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
      if (this.sequelize.options.dialect !== 'postgres') return Promise.resolve();
      return this._dropPostgresEnums(tableName, options);
    });
  }

  /**
   * Drop PostgreSQL enums associated with a table.
   *
   * @private
   */
  _dropPostgresEnums(tableName, options) {
    const instanceTable = this.sequelize.modelManager.getModel(tableName, { attribute: 'tableName' });
    if (!instanceTable) return Promise.resolve();

    const getTableName = (!options || !options.schema || options.schema === 'public' ? '' : options.schema + '_') + tableName;
    const promises = [];

    const keys = Object.keys(instanceTable.rawAttributes);
    for (let i = 0; i < keys.length; i++) {
      if (instanceTable.rawAttributes[keys[i]].type instanceof DataTypes.ENUM) {
        const sql = this.QueryGenerator.pgEnumDrop(getTableName, keys[i]);
        promises.push(this.sequelize.query(sql, _.assign({}, options, { raw: true, supportsSearchPath: false })));
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

    return this.showAllTables(options).then(tableNames => {
      if (this.sequelize.options.dialect === 'sqlite') {
        return this._dropAllTablesSQLite(tableNames, options, skip);
      }
      return this._dropAllTablesWithFK(tableNames, options, skip);
    });
  }

  /**
   * SQLite specific drop‑all‑tables handling.
   *
   * @private
   */
  _dropAllTablesSQLite(tableNames, options, skip) {
    return this.sequelize.query('PRAGMA foreign_keys;', options).then(result => {
      const foreignKeysEnabled = result.foreign_keys === 1;
      const dropFn = () => this._dropTablesIter(tableNames, options, skip);
      if (foreignKeysEnabled) {
        return this.sequelize.query('PRAGMA foreign_keys = OFF', options)
          .then(dropFn)
          .then(() => this.sequelize.query('PRAGMA foreign_keys = ON', options));
      }
      return dropFn();
    });
  }

  /**
   * Drop all tables for dialects supporting foreign keys.
   *
   * @private
   */
  _dropAllTablesWithFK(tableNames, options, skip) {
    return this.getForeignKeysForTables(tableNames, options).then(foreignKeys => {
      const dropPromises = [];

      tableNames.forEach(tableName => {
        let normalized = tableName;
        if (_.isObject(tableName)) {
          normalized = `${tableName.schema}.${tableName.tableName}`;
        }
        (foreignKeys[normalized] || []).forEach(fk => {
          const sql = this.QueryGenerator.dropForeignKeyQuery(tableName, fk);
          dropPromises.push(this.sequelize.query(sql, options));
        });
      });

      return Promise.all(dropPromises).then(() => this._dropTablesIter(tableNames, options, skip));
    });
  }

  /**
   * Iterate over tables and drop them respecting the skip list.
   *
   * @private
   */
  _dropTablesIter(tableNames, options, skip) {
    return Promise.each(tableNames, tableName => {
      const name = tableName.tableName || tableName;
      if (skip.indexOf(name) === -1) {
        return this.dropTable(tableName, _.assign({}, options, { cascade: true }));
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
    return this.pgListEnums(null, options).map(result =>
      this.sequelize.query(
        this.QueryGenerator.pgEnumDrop(null, null, this.QueryGenerator.pgEscapeAndQuote(result.enum_name)),
        _.assign({}, options, { raw: true })
      )
    );
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
    let schema = null;
    let schemaDelimiter = null;

    if (typeof options === 'string') {
      schema = options;
    } else if (options && typeof options === 'object') {
      schema = options.schema || null;
      schemaDelimiter = options.schemaDelimiter || null;
    }

    if (tableName && typeof tableName === 'object') {
      schema = tableName.schema;
      tableName = tableName.tableName;
    }

    const sql = this.QueryGenerator.describeTableQuery(tableName, schema, schemaDelimiter);
    return this.sequelize.query(sql, _.assign({}, options, { type: QueryTypes.DESCRIBE })).then(data => {
      if (_.isEmpty(data)) {
        return Promise.reject(`No description found for "${tableName}" table. Check the table name and schema; remember, they _are_ case sensitive.`);
      }
      return Promise.resolve(data);
    });
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

    if (_.values(DataTypes).includes(dataTypeOrOptions)) {
      attributes[attributeName] = { type: dataTypeOrOptions, allowNull: true };
    } else {
      attributes[attributeName] = dataTypeOrOptions;
    }

    attributes[attributeName].type = this.sequelize.normalizeDataType(attributes[attributeName].type);

    if (this.sequelize.options.dialect === 'sqlite') {
      return SQLiteQueryInterface.changeColumn.call(this, tableName, attributes, options);
    }

    const query = this.QueryGenerator.attributesToSQL(attributes);
    const sql = this.QueryGenerator.changeColumnQuery(tableName, query);
    return this.sequelize.query(sql, options);
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
        throw new Error(`Table ${tableName} doesn't have the column ${attrNameBefore}`);
      }

      const columnInfo = data[attrNameBefore];
      const newDef = {};
      newDef[attrNameAfter] = {
        attribute: attrNameAfter,
        type: columnInfo.type,
        allowNull: columnInfo.allowNull,
        defaultValue: columnInfo.defaultValue
      };

      if (columnInfo.defaultValue === null && !columnInfo.allowNull) {
        delete newDef[attrNameAfter].defaultValue;
      }

      if (this.sequelize.options.dialect === 'sqlite') {
        return SQLiteQueryInterface.renameColumn.call(this, tableName, attrNameBefore, attrNameAfter, options);
      }

      const sql = this.QueryGenerator.renameColumnQuery(
        tableName,
        attrNameBefore,
        this.QueryGenerator.attributesToSQL(newDef)
      );
      return this.sequelize.query(sql, options);
    });
  }

  /**
   * Add index to a column
   *
   * @param {String}  tableName        Table name to add index on
   * @param {Object}  options
   * @param {Array}   options.fields   List of attributes to add index on
   *
   * @return {Promise}
   */
  addIndex(tableName, attributes, options, rawTablename) {
    if (!Array.isArray(attributes)) {
      rawTablename = options;
      options = attributes;
      attributes = options.fields;
    }

    rawTablename = rawTablename || tableName;
    options = Utils.cloneDeep(options);
    options.fields = attributes;
    const sql = this.QueryGenerator.addIndexQuery(tableName, options, rawTablename);
    return this.sequelize.query(sql, _.assign({}, options, { supportsSearchPath: false }));
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
    ).then(results => {
      const result = {};
      tableNames.forEach((tbl, i) => {
        const name = _.isObject(tbl) ? `${tbl.schema}.${tbl.tableName}` : tbl;
        result[name] = _.isArray(results[i])
          ? results[i].map(r => r.constraint_name)
          : [results[i] && results[i].constraint_name];
        result[name] = result[name].filter(_.identity);
      });
      return result;
    });
  }

  /**
   * Get foreign key references details for the table.
   *
   * @param {String} tableName
   * @param {Object} [options]  Query options
   * @returns {Promise}
   */
  getForeignKeyReferencesForTable(tableName, options) {
    const queryOptions = Object.assign({}, options, { type: QueryTypes.FOREIGNKEYS });
    const catalogName = this.sequelize.config.database;
    switch (this.sequelize.options.dialect) {
      case 'sqlite':
        return SQLiteQueryInterface.getForeignKeyReferencesForTable.call(this, tableName, queryOptions);
      case 'postgres':
        const query = this.QueryGenerator.getForeignKeyReferencesQuery(tableName, catalogName);
        return this.sequelize.query(query, queryOptions).then(result => result.map(Utils.camelizeObjectKeys));
      default:
        const q = this.QueryGenerator.getForeignKeysQuery(tableName, catalogName);
        return this.sequelize.query(q, queryOptions);
    }
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
   * @param {String} tableName   Table name where you want to add a constraint
   * @param {Array}  attributes  Array of column names to apply the constraint over
   * @param {Object} options     Constraint options
   *
   * @return {Promise}
   */
  addConstraint(tableName, attributes, options, rawTablename) {
    if (!Array.isArray(attributes)) {
      rawTablename = options;
      options = attributes;
      attributes = options.fields;
    }

    if (!options.type) {
      throw new Error('Constraint type must be specified through options.type');
    }

    rawTablename = rawTablename || tableName;
    options = Utils.cloneDeep(options);
    options.fields = attributes;

    if (this.sequelize.dialect.name === 'sqlite') {
      return SQLiteQueryInterface.addConstraint.call(this, tableName, options, rawTablename);
    }

    const sql = this.QueryGenerator.addConstraintQuery(tableName, options, rawTablename);
    return this.sequelize.query(sql, options);
  }

  showConstraint(tableName, constraintName, options) {
    const sql = this.QueryGenerator.showConstraintsQuery(tableName, constraintName);
    return this.sequelize.query(sql, Object.assign({}, options, { type: QueryTypes.SHOWCONSTRAINTS }));
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
   * @param {Object} insertValues
   * @param {Object} updateValues
   * @param {Object} where
   * @param {Model}  model
   * @param {Object} options
   *
   * @returns {Promise<created, primaryKey>}
   */
  upsert(tableName, insertValues, updateValues, where, model, options) {
    options = _.clone(options);
    const wheres = [];

    if (!Utils.isWhereEmpty(where)) {
      wheres.push(where);
    }

    const indexes = this._collectUniqueIndexes(model);
    indexes.forEach(index => {
      if (_.intersection(Object.keys(insertValues), index).length === index.length) {
        const idxWhere = {};
        index.forEach(field => {
          idxWhere[field] = insertValues[field];
        });
        wheres.push(idxWhere);
      }
    });

    const finalWhere = { [Op.or]: wheres };
    options.type = QueryTypes.UPSERT;
    options.raw = true;

    const sql = this.QueryGenerator.upsertQuery(tableName, insertValues, updateValues, finalWhere, model, options);
    return this.sequelize.query(sql, options).then(result => {
      switch (this.sequelize.options.dialect) {
        case 'postgres':
          return [result.created, result.primary_key];
        case 'mssql':
          return [result.$action === 'INSERT', result[model.primaryKeyField]];
        case 'mysql':
          return [result === 1, undefined];
        default:
          return [result, undefined];
      }
    });
  }

  /**
   * Collect unique indexes from model definition.
   *
   * @private
   */
  _collectUniqueIndexes(model) {
    const indexes = _.map(model.options.uniqueKeys, v => v.fields);
    _.each(model.options.indexes, v => {
      if (v.unique) {
        const fields = _.map(v.fields, f => (_.isPlainObject(f) ? f.attribute : f));
        indexes.push(fields);
      }
    });
    return indexes;
  }

  /**
   * Insert records into a table
   *
   * @param {String} tableName Table name to insert record to
   * @param {Array}  records   List of records to insert
   * @param {Object} options   Various options, please see Model.bulkCreate options
   * @param {Object} attributes Optional attributes mapped by field name
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
    const cascades = [];
    const sql = this.QueryGenerator.deleteQuery(tableName, identifier, null, instance.constructor);
    options = _.clone(options) || {};

    if (instance.constructor && instance.constructor.associations) {
      const assocKeys = Object.keys(instance.constructor.associations);
      for (let i = 0; i < assocKeys.length; i++) {
        const association = instance.constructor.associations[assocKeys[i]];
        if (association.options && association.options.onDelete &&
          association.options.onDelete.toLowerCase() === 'cascade' &&
          association.options.useHooks === true) {
          cascades.push(association.accessors.get);
        }
      }
    }

    return Promise.each(cascades, cascade =>
      instance[cascade](options).then(instances => {
        if (!instances) return Promise.resolve();
        if (!Array.isArray(instances)) instances = [instances];
        return Promise.each(instances, inst => inst.destroy(options));
      })
    ).then(() => {
      options.instance = instance;
      return this.sequelize.query(sql, options);
    });
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
      if (!options.plain) return data;
      let result = data ? data[attributeSelector] : null;

      if (options && options.dataType) {
        const dt = options.dataType;
        if (dt instanceof DataTypes.DECIMAL || dt instanceof DataTypes.FLOAT) {
          result = parseFloat(result);
        } else if (dt instanceof DataTypes.INTEGER || dt instanceof DataTypes.BIGINT) {
          result = parseInt(result, 10);
        } else if (dt instanceof DataTypes.DATE) {
          if (!_.isNull(result) && !_.isDate(result)) {
            result = new Date(result);
          }
        }
      }
      return result;
    });
  }

  createTrigger(tableName, triggerName, timingType, fireOnArray, functionName, functionParams, optionsArray, options) {
    const sql = this.QueryGenerator.createTrigger(tableName, triggerName, timingType, fireOnArray, functionName, functionParams, optionsArray);
    options = options || {};
    return sql ? this.sequelize.query(sql, options) : Promise.resolve();
  }

  dropTrigger(tableName, triggerName, options) {
    const sql = this.QueryGenerator.dropTrigger(tableName, triggerName);
    options = options || {};
    return sql ? this.sequelize.query(sql, options) : Promise.resolve();
  }

  renameTrigger(tableName, oldTriggerName, newTriggerName, options) {
    const sql = this.QueryGenerator.renameTrigger(tableName, oldTriggerName, newTriggerName);
    options = options || {};
    return sql ? this.sequelize.query(sql, options) : Promise.resolve();
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
    const sql = this.QueryGenerator.createFunction(functionName, params, returnType, language, body, optionsArray);
    options = options || {};
    return sql ? this.sequelize.query(sql, options) : Promise.resolve();
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
    const sql = this.QueryGenerator.dropFunction(functionName, params);
    options = options || {};
    return sql ? this.sequelize.query(sql, options) : Promise.resolve();
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
    const sql = this.QueryGenerator.renameFunction(oldFunctionName, params, newFunctionName);
    options = options || {};
    return sql ? this.sequelize.query(sql, options) : Promise.resolve();
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
    if (!transaction || !(transaction instanceof Transaction)) {
      throw new Error('Unable to set autocommit for a transaction without transaction object!');
    }
    if (transaction.parent) return Promise.resolve();

    options = _.assign({}, options, { transaction: transaction.parent || transaction });
    const sql = this.QueryGenerator.setAutocommitQuery(value, { parent: transaction.parent });
    if (!sql) return Promise.resolve();
    return this.sequelize.query(sql, options);
  }

  setIsolationLevel(transaction, value, options) {
    if (!transaction || !(transaction instanceof Transaction)) {
      throw new Error('Unable to set isolation level for a transaction without transaction object!');
    }
    if (transaction.parent || !value) return Promise.resolve();

    options = _.assign({}, options, { transaction: transaction.parent || transaction });
    const sql = this.QueryGenerator.setIsolationLevelQuery(value, { parent: transaction.parent });
    if (!sql) return Promise.resolve();
    return this.sequelize.query(sql, options);
  }

  startTransaction(transaction, options) {
    if (!transaction || !(transaction instanceof Transaction)) {
      throw new Error('Unable to start a transaction without transaction object!');
    }
    options = _.assign({}, options, { transaction: transaction.parent || transaction });
    options.transaction.name = transaction.parent ? transaction.name : undefined;
    const sql = this.QueryGenerator.startTransactionQuery(transaction);
    return this.sequelize.query(sql, options);
  }

  deferConstraints(transaction, options) {
    options = _.assign({}, options, { transaction: transaction.parent || transaction });
    const sql = this.QueryGenerator.deferConstraintsQuery(options);
    return sql ? this.sequelize.query(sql, options) : Promise.resolve();
  }

  commitTransaction(transaction, options) {
    if (!transaction || !(transaction instanceof Transaction)) {
      throw new Error('Unable to commit a transaction without transaction object!');
    }
    if (transaction.parent) return Promise.resolve();

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