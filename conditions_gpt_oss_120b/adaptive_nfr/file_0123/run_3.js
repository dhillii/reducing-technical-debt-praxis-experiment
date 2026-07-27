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

    if (this.sequelize.options.dialect === 'postgres') {
      return this._createTablePostgres(tableName, attributes, options, model, keys, keyLen);
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

    return this.sequelize.query(sql, options);
  }

  /**
   * Helper for PostgreSQL specific table creation logic.
   *
   * @private
   */
  _createTablePostgres(tableName, attributes, options, model, keys, keyLen) {
    const promises = [];

    for (i = 0; i < keyLen; i++) {
      const attribute = attributes[keys[i]];
      const type = attribute.type;

      if (
        type instanceof DataTypes.ENUM ||
        (type instanceof DataTypes.ARRAY && type.type instanceof DataTypes.ENUM)
      ) {
        const sql = this.QueryGenerator.pgListEnums(tableName, attribute.field || keys[i], options);
        promises.push(this.sequelize.query(
          sql,
          _.assign({}, options, { plain: true, raw: true, type: QueryTypes.SELECT })
        ));
      }
    }

    return Promise.all(promises).then(results => {
      const enumPromises = [];
      let enumIdx = 0;

      for (i = 0; i < keyLen; i++) {
        const attribute = attributes[keys[i]];
        const type = attribute.type;
        const enumType = type.type || type;

        if (
          type instanceof DataTypes.ENUM ||
          (type instanceof DataTypes.ARRAY && enumType instanceof DataTypes.ENUM)
        ) {
          if (!results[enumIdx]) {
            const sql = this.QueryGenerator.pgEnum(tableName, attribute.field || keys[i], enumType, options);
            enumPromises.push(this.sequelize.query(
              sql,
              _.assign({}, options, { raw: true })
            ));
          } else if (!!results[enumIdx] && !!model) {
            const enumVals = this.QueryGenerator.fromArray(results[enumIdx].enum_value);
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
                enumPromises.push(this.sequelize.query(
                  this.QueryGenerator.pgEnumAdd(tableName, attribute.field || keys[i], value, valueOptions),
                  valueOptions
                ));
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
      const createSql = this.QueryGenerator.createTableQuery(tableName, attributes, options);

      return Promise.all(enumPromises)
        .tap(() => {
          if (enumPromises.length) {
            return this.sequelize.dialect.connectionManager._refreshDynamicOIDs();
          }
        })
        .then(() => this.sequelize.query(createSql, options));
    });
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

      return Promise.all(promises).get(0);
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
    const skip = options.skip || [];

    const dropAllTables = tableNames => Promise.each(tableNames, tableName => {
      if (skip.indexOf(tableName.tableName || tableName) === -1) {
        return this.dropTable(tableName, _.assign({}, options, { cascade: true }));
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
          }
          return dropAllTables(tableNames);
        });
      }

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
      if (_.isEmpty(data)) {
        return Promise.reject('No description found for "' + tableName + '" table. Check the table name and schema; remember, they _are_ case sensitive.');
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

    if (_.values(DataTypes).indexOf(dataTypeOrOptions) > -1) {
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
        throw new Error('Table ' + tableName + ' doesn\'t have the column ' + attrNameBefore);
      }

      const _options = {};

      _options[attrNameAfter] = {
        attribute: attrNameAfter,
        type: data[attrNameBefore].type,
        allowNull: data[attrNameBefore].allowNull,
        defaultValue: data[attrNameBefore].defaultValue
      };

      if (data[attrNameBefore].defaultValue === null && !data[attrNameBefore].allowNull) {
        delete _options[attrNameAfter].defaultValue;
      }

      if (this.sequelize.options.dialect === 'sqlite') {
        return SQLiteQueryInterface.renameColumn.call(this, tableName, attrNameBefore, attrNameAfter, options);
      }

      const sql = this.QueryGenerator.renameColumnQuery(
        tableName,
        attrNameBefore,
        this.QueryGenerator.attributesToSQL(_options)
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
   * @param {Boolean} [options.unique] Create a unique index
   * @param {String}  [options.using]  Useful for GIN indexes
   * @param {String}  [options.type]   Type of index, available options are UNIQUE|FULLTEXT|SPATIAL
   * @param {String}  [options.name]   Name of the index. Default is <table>_<attr1>_<attr2>
   * @param {Object}  [options.where]  Where condition on index, for partial indexes
   *
   * @return {Promise}
   */
  addIndex(tableName, attributes, options, rawTablename) {
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
    switch (this.sequelize.options.dialect) {
      case 'sqlite':
        return SQLiteQueryInterface.getForeignKeyReferencesForTable.call(this, tableName, queryOptions);
      case 'postgres':
        const query = this.QueryGenerator.getForeignKeyReferencesQuery(tableName, catalogName);
        return this.sequelize.query(query, queryOptions)
          .then(result => result.map(Utils.camelizeObjectKeys));
      case 'mssql':
      case 'mysql':
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
   * @param {String} tableName                  Table name where you want to add a constraint
   * @param {Array}  attributes                 Array of column names to apply the constraint over
   * @param {Object} options                    An object to define the constraint name, type etc
   * @param {String} rawTablename               Raw table name for dialect specific handling
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

    if (!rawTablename) {
      rawTablename = tableName;
    }

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
    const upsertParams = new UpsertParams({
      tableName,
      insertValues,
      updateValues,
      where,
      model,
      options
    });
    return upsertParams.execute(this);
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
    const bulkUpdateParams = new BulkUpdateParams({
      tableName,
      values,
      identifier,
      options,
      attributes
    });
    return bulkUpdateParams.execute(this);
  }

  delete(instance, tableName, identifier, options) {
    const cascades = [];
    const sql = this.QueryGenerator.deleteQuery(tableName, identifier, null, instance.constructor);

    options = _.clone(options) || {};

    if (instance.constructor && instance.constructor.associations) {
      const keys = Object.keys(instance.constructor.associations);
      const length = keys.length;
      let association;

      for (let i = 0; i < length; i++) {
        association = instance.constructor.associations[keys[i]];
        if (association.options && association.options.onDelete &&
          association.options.onDelete.toLowerCase() === 'cascade' &&
          association.options.useHooks === true) {
          cascades.push(association.accessors.get);
        }
      }
    }

    return Promise.each(cascades, cascade => {
      return instance[cascade](options).then(instances => {
        if (!instances) {
          return Promise.resolve();
        }

        if (!Array.isArray(instances)) instances = [instances];

        return Promise.each(instances, instance => instance.destroy(options));
      });
    }).then(() => {
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
    const bulkDeleteParams = new BulkDeleteParams({
      tableName,
      identifier,
      options,
      model
    });
    return bulkDeleteParams.execute(this);
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
    });
  }

  /**
   * Create a trigger
   *
   * @param {CreateTriggerParams} params Parameter object
   * @return {Promise}
   */
  createTrigger(params) {
    const { tableName, triggerName, timingType, fireOnArray, functionName, functionParams, optionsArray, options } = params;
    const sql = this.QueryGenerator.createTrigger(tableName, triggerName, timingType, fireOnArray, functionName, functionParams, optionsArray);
    const opts = options || {};
    if (sql) {
      return this.sequelize.query(sql, opts);
    }
    return Promise.resolve();
  }

  /**
   * Legacy wrapper for createTrigger to preserve original signature.
   */
  createTriggerLegacy(tableName, triggerName, timingType, fireOnArray, functionName, functionParams, optionsArray, options) {
    return this.createTrigger(new CreateTriggerParams({
      tableName,
      triggerName,
      timingType,
      fireOnArray,
      functionName,
      functionParams,
      optionsArray,
      options
    }));
  }

  dropTrigger(tableName, triggerName, options) {
    const sql = this.QueryGenerator.dropTrigger(tableName, triggerName);
    options = options || {};

    if (sql) {
      return this.sequelize.query(sql, options);
    }
    return Promise.resolve();
  }

  renameTrigger(tableName, oldTriggerName, newTriggerName, options) {
    const sql = this.QueryGenerator.renameTrigger(tableName, oldTriggerName, newTriggerName);
    options = options || {};

    if (sql) {
      return this.sequelize.query(sql, options);
    }
    return Promise.resolve();
  }

  /**
   * Create SQL function (legacy wrapper)
   *
   * @param {String} functionName
   * @param {Array}  params
   * @param {String} returnType
   * @param {String} language
   * @param {String} body
   * @param {Array}  optionsArray
   * @param {Object} [options]
   *
   * @return {Promise}
   */
  createFunctionLegacy(functionName, params, returnType, language, body, optionsArray, options) {
    return this.createFunction(new CreateFunctionParams({
      functionName,
      params,
      returnType,
      language,
      body,
      optionsArray,
      options
    }));
  }

  /**
   * Create SQL function using parameter object.
   *
   * @param {CreateFunctionParams} params
   * @return {Promise}
   */
  createFunction(params) {
    const { functionName, params: fnParams, returnType, language, body, optionsArray, options } = params;
    const sql = this.QueryGenerator.createFunction(functionName, fnParams, returnType, language, body, optionsArray);
    const opts = options || {};

    if (sql) {
      return this.sequelize.query(sql, opts);
    }
    return Promise.resolve();
  }

  /**
   * Drop SQL function (legacy wrapper)
   *
   * @param {String} functionName
   * @param {Array}  params
   * @param {Object} [options]
   *
   * @return {Promise}
   */
  dropFunctionLegacy(functionName, params, options) {
    return this.dropFunction(new DropFunctionParams({
      functionName,
      params,
      options
    }));
  }

  /**
   * Drop SQL function using parameter object.
   *
   * @param {DropFunctionParams} params
   * @return {Promise}
   */
  dropFunction(params) {
    const { functionName, params: fnParams, options } = params;
    const sql = this.QueryGenerator.dropFunction(functionName, fnParams);
    const opts = options || {};

    if (sql) {
      return this.sequelize.query(sql, opts);
    }
    return Promise.resolve();
  }

  /**
   * Rename SQL function (legacy wrapper)
   *
   * @param {String} oldFunctionName
   * @param {Array}  params
   * @param {String} newFunctionName
   * @param {Object} [options]
   *
   * @return {Promise}
   */
  renameFunctionLegacy(oldFunctionName, params, newFunctionName, options) {
    return this.renameFunction(new RenameFunctionParams({
      oldFunctionName,
      params,
      newFunctionName,
      options
    }));
  }

  /**
   * Rename SQL function using parameter object.
   *
   * @param {RenameFunctionParams} params
   * @return {Promise}
   */
  renameFunction(params) {
    const { oldFunctionName, params: fnParams, newFunctionName, options } = params;
    const sql = this.QueryGenerator.renameFunction(oldFunctionName, fnParams, newFunctionName);
    const opts = options || {};

    if (sql) {
      return this.sequelize.query(sql, opts);
    }
    return Promise.resolve();
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

/**
 * Parameter object for upsert operation.
 *
 * @typedef {Object} UpsertParams
 * @property {String} tableName
 * @property {Object} insertValues
 * @property {Object} updateValues
 * @property {Object} where
 * @property {Model}  model
 * @property {Object} options
 */
class UpsertParams {
  constructor({ tableName, insertValues, updateValues, where, model, options }) {
    this.tableName = tableName;
    this.insertValues = insertValues;
    this.updateValues = updateValues;
    this.where = where;
    this.model = model;
    this.options = options || {};
  }

  execute(context) {
    const wheres = [];
    const attributes = Object.keys(this.insertValues);
    let indexes = [];
    let indexFields;

    this.options = _.clone(this.options);

    if (!Utils.isWhereEmpty(this.where)) {
      wheres.push(this.where);
    }

    indexes = _.map(this.model.options.uniqueKeys, value => value.fields);

    _.each(this.model.options.indexes, value => {
      if (value.unique) {
        indexFields = _.map(value.fields, field => _.isPlainObject(field) ? field.attribute : field);
        indexes.push(indexFields);
      }
    });

    for (const index of indexes) {
      if (_.intersection(attributes, index).length === index.length) {
        const where = {};
        for (const field of index) {
          where[field] = this.insertValues[field];
        }
        wheres.push(where);
      }
    }

    const finalWhere = { [Op.or]: wheres };
    this.options.type = QueryTypes.UPSERT;
    this.options.raw = true;

    const sql = context.QueryGenerator.upsertQuery(this.tableName, this.insertValues, this.updateValues, finalWhere, this.model, this.options);
    return context.sequelize.query(sql, this.options).then(result => {
      switch (context.sequelize.options.dialect) {
        case 'postgres':
          return [result.created, result.primary_key];
        case 'mssql':
          return [result.$action === 'INSERT', result[context.model.primaryKeyField]];
        case 'mysql':
          return [result === 1, undefined];
        default:
          return [result, undefined];
      }
    });
  }
}

/**
 * Parameter object for bulkUpdate operation.
 *
 * @typedef {Object} BulkUpdateParams
 * @property {String} tableName
 * @property {Object} values
 * @property {Object|String} identifier
 * @property {Object} options
 * @property {Object} attributes
 */
class BulkUpdateParams {
  constructor({ tableName, values, identifier, options, attributes }) {
    this.tableName = tableName;
    this.values = values;
    this.identifier = identifier;
    this.options = options || {};
    this.attributes = attributes;
  }

  execute(context) {
    this.options = Utils.cloneDeep(this.options);
    if (typeof this.identifier === 'object') this.identifier = Utils.cloneDeep(this.identifier);

    const sql = context.QueryGenerator.updateQuery(this.tableName, this.values, this.identifier, this.options, this.attributes);
    const table = _.isObject(this.tableName) ? this.tableName : { tableName: this.tableName };
    const model = _.find(context.sequelize.modelManager.models, { tableName: table.tableName });

    this.options.model = model;
    return context.sequelize.query(sql, this.options);
  }
}

/**
 * Parameter object for bulkDelete operation.
 *
 * @typedef {Object} BulkDeleteParams
 * @property {String} tableName
 * @property {Object|String} identifier
 * @property {Object} options
 * @property {Model} model
 */
class BulkDeleteParams {
  constructor({ tableName, identifier, options, model }) {
    this.tableName = tableName;
    this.identifier = identifier;
    this.options = options || {};
    this.model = model;
  }

  execute(context) {
    this.options = Utils.cloneDeep(this.options);
    this.options = _.defaults(this.options, { limit: null });
    if (typeof this.identifier === 'object') this.identifier = Utils.cloneDeep(this.identifier);

    const sql = context.QueryGenerator.deleteQuery(this.tableName, this.identifier, this.options, this.model);
    return context.sequelize.query(sql, this.options);
  }
}

/**
 * Parameter object for createFunction.
 *
 * @typedef {Object} CreateFunctionParams
 * @property {String} functionName
 * @property {Array}  params
 * @property {String} returnType
 * @property {String} language
 * @property {String} body
 * @property {Array}  optionsArray
 * @property {Object} [options]
 */
class CreateFunctionParams {
  constructor({ functionName, params, returnType, language, body, optionsArray, options }) {
    this.functionName = functionName;
    this.params = params;
    this.returnType = returnType;
    this.language = language;
    this.body = body;
    this.optionsArray = optionsArray;
    this.options = options;
  }
}

/**
 * Parameter object for dropFunction.
 *
 * @typedef {Object} DropFunctionParams
 * @property {String} functionName
 * @property {Array}  params
 * @property {Object} [options]
 */
class DropFunctionParams {
  constructor({ functionName, params, options }) {
    this.functionName = functionName;
    this.params = params;
    this.options = options;
  }
}

/**
 * Parameter object for renameFunction.
 *
 * @typedef {Object} RenameFunctionParams
 * @property {String} oldFunctionName
 * @property {Array}  params
 * @property {String} newFunctionName
 * @property {Object} [options]
 */
class RenameFunctionParams {
  constructor({ oldFunctionName, params, newFunctionName, options }) {
    this.oldFunctionName = oldFunctionName;
    this.params = params;
    this.newFunctionName = newFunctionName;
    this.options = options;
  }
}

/**
 * Parameter object for createTrigger.
 *
 * @typedef {Object} CreateTriggerParams
 * @property {String} tableName
 * @property {String} triggerName
 * @property {String} timingType
 * @property {Array}  fireOnArray
 * @property {String} functionName
 * @property {Array}  functionParams
 * @property {Array}  optionsArray
 * @property {Object} [options]
 */
class CreateTriggerParams {
  constructor({ tableName, triggerName, timingType, fireOnArray, functionName, functionParams, optionsArray, options }) {
    this.tableName = tableName;
    this.triggerName = triggerName;
    this.timingType = timingType;
    this.fireOnArray = fireOnArray;
    this.functionName = functionName;
    this.functionParams = functionParams;
    this.optionsArray = optionsArray;
    this.options = options;
  }
}

/**
 * Backwards compatible method names.
 */
QueryInterface.prototype.createFunction = QueryInterface.prototype.createFunctionLegacy;
QueryInterface.prototype.dropFunction = QueryInterface.prototype.dropFunctionLegacy;
QueryInterface.prototype.renameFunction = QueryInterface.prototype.renameFunctionLegacy;
QueryInterface.prototype.createTrigger = QueryInterface.prototype.createTriggerLegacy;

module.exports = QueryInterface;
module.exports.QueryInterface = QueryInterface;
module.exports.default = QueryInterface;