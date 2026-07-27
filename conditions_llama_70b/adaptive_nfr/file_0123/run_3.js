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
   * @param {Object} options - Options for creating schema
   * @param {String} options.schema - Schema name to create
   *
   * @return {Promise}
   */
  createSchema(options) {
    const schema = options.schema;
    const sql = this.QueryGenerator.createSchema(schema);
    return this.sequelize.query(sql, options);
  }

  /**
   * Drops a schema
   *
   * @param {Object} options - Options for dropping schema
   * @param {String} options.schema - Schema name to drop
   *
   * @return {Promise}
   */
  dropSchema(options) {
    const schema = options.schema;
    const sql = this.QueryGenerator.dropSchema(schema);
    return this.sequelize.query(sql, options);
  }

  /**
   * Drop all schemas
   *
   * @param {Object} options - Options for dropping all schemas
   *
   * @return {Promise}
   */
  dropAllSchemas(options) {
    options = options || {};

    if (!this.QueryGenerator._dialect.supports.schemas) {
      return this.sequelize.drop(options);
    } else {
      return this.showAllSchemas(options).then(schemaNames => schemaNames.map(schemaName => this.dropSchema({ schema: schemaName }, options)));
    }
  }

  /**
   * Show all schemas
   *
   * @param {Object} options - Options for showing all schemas
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
   * @param {Object} options - Options for getting database version
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
   * @param {Object} options - Options for creating table
   * @param {String} options.tableName - Name of table to create
   * @param {Object} options.attributes - Object representing a list of table attributes to create
   * @param {Object} [options.model] - Model instance
   *
   * @return {Promise}
   */
  createTable(options) {
    const tableName = options.tableName;
    const attributes = options.attributes;
    const model = options.model;

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
   * Drops a table from database
   *
   * @param {Object} options - Options for dropping table
   * @param {String} options.tableName - Table name to drop
   *
   * @return {Promise}
   */
  dropTable(options) {
    // if we're forcing we should be cascading unless explicitly stated otherwise
    options = _.clone(options) || {};
    options.cascade = options.cascade || options.force || false;

    let sql = this.QueryGenerator.dropTableQuery(options.tableName, options);

    return this.sequelize.query(sql, options).then(() => {
      const promises = [];

      // Since postgres has a special case for enums, we should drop the related
      // enum type within the table and attribute
      if (this.sequelize.options.dialect === 'postgres') {
        const instanceTable = this.sequelize.modelManager.getModel(options.tableName, { attribute: 'tableName' });

        if (instanceTable) {
          const getTableName = (!options || !options.schema || options.schema === 'public' ? '' : options.schema + '_') + options.tableName;

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
   * Drop all tables from database
   *
   * @param {Object} options - Options for dropping all tables
   *
   * @return {Promise}
   */
  dropAllTables(options) {
    options = options || {};
    const skip = options.skip || [];

    const dropAllTables = tableNames => Promise.each(tableNames, tableName => {
      // if tableName is not in the Array of tables names then dont drop it
      if (skip.indexOf(tableName.tableName || tableName) === -1) {
        return this.dropTable({ tableName, ...options, cascade: true });
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
   * Drop all enums from database, Postgres Only
   *
   * @param {Object} options - Options for dropping all enums
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
   * @param {Object} options - Options for listing all enums
   * @param {String} [options.tableName] - Table whose enum to list
   *
   * @return {Promise}
   * @private
   */
  pgListEnums(options) {
    options = options || {};
    const sql = this.QueryGenerator.pgListEnums(options.tableName);
    return this.sequelize.query(sql, _.assign({}, options, { plain: false, raw: true, type: QueryTypes.SELECT }));
  }

  /**
   * Renames a table
   *
   * @param {Object} options - Options for renaming table
   * @param {String} options.before - Current name of table
   * @param {String} options.after - New name from table
   *
   * @return {Promise}
   */
  renameTable(options) {
    options = options || {};
    const sql = this.QueryGenerator.renameTableQuery(options.before, options.after);
    return this.sequelize.query(sql, options);
  }

  /**
   * Get all tables in current database
   *
   * @param {Object} options - Options for getting all tables
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
   * This method returns an array of hashes containing information about all attributes in the table.
   *
   * @param {Object} options - Options for describing table
   * @param {String} options.tableName - Table name to describe
   *
   * @return {Promise<Object>}
   */
  describeTable(options) {
    let schema = null;
    let schemaDelimiter = null;

    if (typeof options === 'string') {
      schema = options;
    } else if (typeof options === 'object' && options !== null) {
      schema = options.schema || null;
      schemaDelimiter = options.schemaDelimiter || null;
    }

    if (typeof options.tableName === 'object' && options.tableName !== null) {
      schema = options.tableName.schema;
      options.tableName = options.tableName.tableName;
    }

    const sql = this.QueryGenerator.describeTableQuery(options.tableName, schema, schemaDelimiter);

    return this.sequelize.query(
      sql,
      _.assign({}, options, { type: QueryTypes.DESCRIBE })
    ).then(data => {
      // If no data is returned from the query, then the table name may be wrong.
      // Query generators that use information_schema for retrieving table info will just return an empty result set,
      // it will not throw an error like built-ins do (e.g. DESCRIBE on MySql).
      if (_.isEmpty(data)) {
        return Promise.reject('No description found for "' + options.tableName + '" table. Check the table name and schema; remember, they _are_ case sensitive.');
      } else {
        return Promise.resolve(data);
      }
    });
  }

  /**
   * Add a new column into a table
   *
   * @param {Object} options - Options for adding column
   * @param {String} options.table - Table to add column to
   * @param {String} options.key - Column name
   * @param {Object} options.attribute - Attribute definition
   *
   * @return {Promise}
   */
  addColumn(options) {
    if (!options.table || !options.key || !options.attribute) {
      throw new Error('addColumn takes atleast 3 arguments (table, attribute name, attribute definition)');
    }

    options = options || {};
    options.attribute = this.sequelize.normalizeAttribute(options.attribute);
    return this.sequelize.query(this.QueryGenerator.addColumnQuery(options.table, options.key, options.attribute), options);
  }

  /**
   * Remove a column from table
   *
   * @param {Object} options - Options for removing column
   * @param {String} options.tableName - Table to remove column from
   * @param {String} options.attributeName - Columns name to remove
   *
   * @return {Promise}
   */
  removeColumn(options) {
    options = options || {};
    switch (this.sequelize.options.dialect) {
      case 'sqlite':
        // sqlite needs some special treatment as it cannot drop a column
        return SQLiteQueryInterface.removeColumn.call(this, options.tableName, options.attributeName, options);
      case 'mssql':
        // mssql needs special treatment as it cannot drop a column with a default or foreign key constraint
        return MSSSQLQueryInterface.removeColumn.call(this, options.tableName, options.attributeName, options);
      case 'mysql':
        // mysql needs special treatment as it cannot drop a column with a foreign key constraint
        return MySQLQueryInterface.removeColumn.call(this, options.tableName, options.attributeName, options);
      default:
        return this.sequelize.query(this.QueryGenerator.removeColumnQuery(options.tableName, options.attributeName), options);
    }
  }

  /**
   * Change a column definition
   *
   * @param {Object} options - Options for changing column
   * @param {String} options.tableName - Table name to change from
   * @param {String} options.attributeName - Column name
   * @param {Object} options.dataTypeOrOptions - Attribute definition for new column
   *
   * @return {Promise}
   */
  changeColumn(options) {
    const attributes = {};
    options = options || {};

    if (_.values(DataTypes).indexOf(options.dataTypeOrOptions) > -1) {
      attributes[options.attributeName] = { type: options.dataTypeOrOptions, allowNull: true };
    } else {
      attributes[options.attributeName] = options.dataTypeOrOptions;
    }

    attributes[options.attributeName].type = this.sequelize.normalizeDataType(attributes[options.attributeName].type);

    if (this.sequelize.options.dialect === 'sqlite') {
      // sqlite needs some special treatment as it cannot change a column
      return SQLiteQueryInterface.changeColumn.call(this, options.tableName, attributes, options);
    } else {
      const query = this.QueryGenerator.attributesToSQL(attributes);
      const sql = this.QueryGenerator.changeColumnQuery(options.tableName, query);

      return this.sequelize.query(sql, options);
    }
  }

  /**
   * Rename a column
   *
   * @param {Object} options - Options for renaming column
   * @param {String} options.tableName - Table name whose column to rename
   * @param {String} options.attrNameBefore - Current column name
   * @param {String} options.attrNameAfter - New column name
   *
   * @return {Promise}
   */
  renameColumn(options) {
    options = options || {};
    return this.describeTable(options).then(data => {
      if (!data[options.attrNameBefore]) {
        throw new Error('Table ' + options.tableName + ' doesn\'t have the column ' + options.attrNameBefore);
      }

      data = data[options.attrNameBefore] || {};

      const _options = {};

      _options[options.attrNameAfter] = {
        attribute: options.attrNameAfter,
        type: data.type,
        allowNull: data.allowNull,
        defaultValue: data.defaultValue
      };

      // fix: a not-null column cannot have null as default value
      if (data.defaultValue === null && !data.allowNull) {
        delete _options[options.attrNameAfter].defaultValue;
      }

      if (this.sequelize.options.dialect === 'sqlite') {
        // sqlite needs some special treatment as it cannot rename a column
        return SQLiteQueryInterface.renameColumn.call(this, options.tableName, options.attrNameBefore, options.attrNameAfter, options);
      } else {
        const sql = this.QueryGenerator.renameColumnQuery(
          options.tableName,
          options.attrNameBefore,
          this.QueryGenerator.attributesToSQL(_options)
        );
        return this.sequelize.query(sql, options);
      }
    });
  }

  /**
   * Add index to a column
   *
   * @param {Object} options - Options for adding index
   * @param {String} options.tableName - Table name to add index on
   * @param {Array} options.fields - List of attributes to add index on
   *
   * @return {Promise}
   */
  addIndex(options) {
    options = options || {};

    const sql = this.QueryGenerator.addIndexQuery(options.tableName, options);
    return this.sequelize.query(sql, _.assign({}, options, { supportsSearchPath: false }));
  }

  /**
   * Show indexes on a table
   *
   * @param {Object} options - Options for showing indexes
   * @param {String} options.tableName - Table name to show indexes on
   *
   * @return {Promise<Array>}
   * @private
   */
  showIndex(options) {
    const sql = this.QueryGenerator.showIndexesQuery(options.tableName, options);
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
   * Those details contains constraintSchema, constraintName, constraintCatalog
   * tableCatalog, tableSchema, tableName, columnName,
   * referencedTableCatalog, referencedTableCatalog, referencedTableSchema, referencedTableName, referencedColumnName.
   * Remind: constraint informations won't return if it's sqlite.
   *
   * @param {Object} options - Options for getting foreign key references
   * @param {String} options.tableName - Table name to get foreign key references for
   *
   * @returns {Promise}
   */
  getForeignKeyReferencesForTable(options) {
    const queryOptions = Object.assign({}, options, {
      type: QueryTypes.FOREIGNKEYS
    });
    const catalogName = this.sequelize.config.database;
    switch (this.sequelize.options.dialect) {
      case 'sqlite':
        // sqlite needs some special treatment.
        return SQLiteQueryInterface.getForeignKeyReferencesForTable.call(this, options.tableName, queryOptions);
      case 'postgres':
      {
        // postgres needs some special treatment as those field names returned are all lowercase
        // in order to keep same result with other dialects.
        const query = this.QueryGenerator.getForeignKeyReferencesQuery(options.tableName, catalogName);
        return this.sequelize.query(query, queryOptions)
          .then(result => result.map(Utils.camelizeObjectKeys));
      }
      case 'mssql':
      case 'mysql':
      default:
      {
        const query = this.QueryGenerator.getForeignKeysQuery(options.tableName, catalogName);
        return this.sequelize.query(query, queryOptions);
      }
    }
  }

  /**
   * Remove an already existing index from a table
   *
   * @param {Object} options - Options for removing index
   * @param {String} options.tableName - Table name to drop index from
   * @param {String} options.indexNameOrAttributes - Index name
   *
   * @return {Promise}
   */
  removeIndex(options) {
    options = options || {};
    const sql = this.QueryGenerator.removeIndexQuery(options.tableName, options.indexNameOrAttributes);
    return this.sequelize.query(sql, options);
  }

  /**
   * Add constraints to table
   *
   * Available constraints:
   * - UNIQUE
   * - DEFAULT (MSSQL only)
   * - CHECK (MySQL - Ignored by the database engine )
   * - FOREIGN KEY
   * - PRIMARY KEY
   *
   * @param {Object} options - Options for adding constraint
   * @param {String} options.tableName - Table name where you want to add a constraint
   * @param {Array} options.attributes - Array of column names to apply the constraint over
   * @param {Object} options.options - An object to define the constraint name, type etc
   *
   * @return {Promise}
   */
  addConstraint(options) {
    options = options || {};

    if (!options.options.type) {
      throw new Error('Constraint type must be specified through options.type');
    }

    options.options.fields = options.attributes;

    if (this.sequelize.dialect.name === 'sqlite') {
      return SQLiteQueryInterface.addConstraint.call(this, options.tableName, options.options, options.tableName);
    } else {
      const sql = this.QueryGenerator.addConstraintQuery(options.tableName, options.options, options.tableName);
      return this.sequelize.query(sql, options.options);
    }
  }

  showConstraint(options) {
    const sql = this.QueryGenerator.showConstraintsQuery(options.tableName, options.constraintName);
    return this.sequelize.query(sql, Object.assign({}, options, { type: QueryTypes.SHOWCONSTRAINTS }));
  }

  /**
   *
   * @param {Object} options - Options for removing constraint
   * @param {String} options.tableName - Table name to drop constraint from
   * @param {String} options.constraintName - Constraint name
   *
   * @return {Promise}
   */
  removeConstraint(options) {
    options = options || {};

    switch (this.sequelize.options.dialect) {
      case 'mysql':
        //Mysql does not support DROP CONSTRAINT. Instead DROP PRIMARY, FOREIGN KEY, INDEX should be used
        return MySQLQueryInterface.removeConstraint.call(this, options.tableName, options.constraintName, options);
      case 'sqlite':
        return SQLiteQueryInterface.removeConstraint.call(this, options.tableName, options.constraintName, options);
      default:
        const sql = this.QueryGenerator.removeConstraintQuery(options.tableName, options.constraintName);
        return this.sequelize.query(sql, options);
    }
  }

  insert(options) {
    options = Utils.cloneDeep(options);
    options.hasTrigger = options.instance && options.instance.constructor.options.hasTrigger;
    const sql = this.QueryGenerator.insertQuery(options.tableName, options.values, options.instance && options.instance.constructor.rawAttributes, options);

    options.type = QueryTypes.INSERT;
    options.instance = options.instance;

    return this.sequelize.query(sql, options).then(results => {
      if (options.instance) results[0].isNewRecord = false;
      return results;
    });
  }

  /**
   * Upsert
   *
   * @param {Object} options - Options for upsert
   * @param {String} options.tableName - Table name to upsert
   * @param {Object} options.insertValues - Values to be inserted, mapped to field name
   * @param {Object} options.updateValues - Values to be updated, mapped to field name
   * @param {Object} options.where - Various conditions
   * @param {Model} options.model - Model instance
   *
   * @returns {Promise<created, primaryKey>}
   */
  upsert(options) {
    const wheres = [];
    const attributes = Object.keys(options.insertValues);
    let indexes = [];
    let indexFields;

    options = _.clone(options);

    if (!Utils.isWhereEmpty(options.where)) {
      wheres.push(options.where);
    }

    // Lets combine uniquekeys and indexes into one
    indexes = _.map(options.model.options.uniqueKeys, value => {
      return value.fields;
    });

    _.each(options.model.options.indexes, value => {
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
        options.where = {};
        for (const field of index) {
          options.where[field] = options.insertValues[field];
        }
        wheres.push(options.where);
      }
    }

    options.where = { [Op.or]: wheres };

    options.type = QueryTypes.UPSERT;
    options.raw = true;

    const sql = this.QueryGenerator.upsertQuery(options.tableName, options.insertValues, options.updateValues, options.where, options.model, options);
    return this.sequelize.query(sql, options).then(result => {
      switch (this.sequelize.options.dialect) {
        case 'postgres':
          return [result.created, result.primary_key];

        case 'mssql':
          return [
            result.$action === 'INSERT',
            result[options.model.primaryKeyField]
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
   * Insert records into a table
   *
   * @param {Object} options - Options for bulk inserting
   * @param {String} options.tableName - Table name to insert record to
   * @param {Array} options.records - List of records to insert
   *
   * @return {Promise}
   */
  bulkInsert(options) {
    options = _.clone(options) || {};
    options.type = QueryTypes.INSERT;

    return this.sequelize.query(
      this.QueryGenerator.bulkInsertQuery(options.tableName, options.records, options, options.attributes),
      options
    ).then(results => results[0]);
  }

  update(options) {
    options = _.clone(options || {});
    options.hasTrigger = !!(options.instance && options.instance._modelOptions && options.instance._modelOptions.hasTrigger);

    const sql = this.QueryGenerator.updateQuery(options.tableName, options.values, options.identifier, options, options.instance.constructor.rawAttributes);

    options.type = QueryTypes.UPDATE;

    options.instance = options.instance;
    return this.sequelize.query(sql, options);
  }

  bulkUpdate(options) {
    options = Utils.cloneDeep(options);
    if (typeof options.identifier === 'object') options.identifier = Utils.cloneDeep(options.identifier);

    const sql = this.QueryGenerator.updateQuery(options.tableName, options.values, options.identifier, options, options.attributes);
    const table = _.isObject(options.tableName) ? options.tableName : { tableName: options.tableName };
    const model = _.find(this.sequelize.modelManager.models, { tableName: table.tableName });

    options.model = model;
    return this.sequelize.query(sql, options);
  }

  delete(options) {
    const cascades = [];
    const sql = this.QueryGenerator.deleteQuery(options.tableName, options.identifier, null, options.instance.constructor);

    options = _.clone(options) || {};

    // Check for a restrict field
    if (!!options.instance.constructor && !!options.instance.constructor.associations) {
      const keys = Object.keys(options.instance.constructor.associations);
      const length = keys.length;
      let association;

      for (let i = 0; i < length; i++) {
        association = options.instance.constructor.associations[keys[i]];
        if (association.options && association.options.onDelete &&
          association.options.onDelete.toLowerCase() === 'cascade' &&
          association.options.useHooks === true) {
          cascades.push(association.accessors.get);
        }
      }
    }

    return Promise.each(cascades, cascade => {
      return options.instance[cascade](options).then(instances => {
        // Check for hasOne relationship with non-existing associate ("has zero")
        if (!instances) {
          return Promise.resolve();
        }

        if (!Array.isArray(instances)) instances = [instances];

        return Promise.each(instances, instance => instance.destroy(options));
      });
    }).then(() => {
      options.instance = options.instance;
      return this.sequelize.query(sql, options);
    });
  }

  /**
   * Delete records from a table
   *
   * @param {Object} options - Options for bulk deleting
   * @param {String} options.tableName - Table name from where to delete records
   * @param {Object} options.identifier - Where conditions to find records to delete
   *
   * @return {Promise}
   */
  bulkDelete(options) {
    options = Utils.cloneDeep(options);
    options = _.defaults(options, { limit: null });
    if (typeof options.identifier === 'object') options.identifier = Utils.cloneDeep(options.identifier);

    const sql = this.QueryGenerator.deleteQuery(options.tableName, options.identifier, options, options.model);
    return this.sequelize.query(sql, options);
  }

  select(options) {
    options = Utils.cloneDeep(options);
    options.type = QueryTypes.SELECT;
    options.model = options.model;

    return this.sequelize.query(
      this.QueryGenerator.selectQuery(options.tableName, options, options.model),
      options
    );
  }

  increment(options) {
    options = Utils.cloneDeep(options);

    const sql = this.QueryGenerator.arithmeticQuery('+', options.tableName, options.values, options.identifier, options, options.attributes);

    options.type = QueryTypes.UPDATE;
    options.model = options.model;

    return this.sequelize.query(sql, options);
  }

  decrement(options) {
    options = Utils.cloneDeep(options);

    const sql = this.QueryGenerator.arithmeticQuery('-', options.tableName, options.values, options.identifier, options, options.attributes);

    options.type = QueryTypes.UPDATE;
    options.model = options.model;

    return this.sequelize.query(sql, options);
  }

  rawSelect(options) {
    if (options.schema) {
      options.tableName = this.QueryGenerator.addSchema({
        tableName: options.tableName,
        _schema: options.schema
      });
    }

    options = Utils.cloneDeep(options);
    options = _.defaults(options, {
      raw: true,
      plain: true,
      type: QueryTypes.SELECT
    });

    const sql = this.QueryGenerator.selectQuery(options.tableName, options, options.Model);

    if (options.attributeSelector === undefined) {
      throw new Error('Please pass an attribute selector!');
    }

    return this.sequelize.query(sql, options).then(data => {
      if (!options.plain) {
        return data;
      }

      let result = data ? data[options.attributeSelector] : null;

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
        } else if (dataType instanceof DataTypes.STRING) {
          // Nothing to do, result is already a string.
        }
      }

      return result;
    });
  }

  createTrigger(options) {
    const sql = this.QueryGenerator.createTrigger(options.tableName, options.triggerName, options.timingType, options.fireOnArray, options.functionName, options.functionParams, options.optionsArray);
    options = options || {};
    if (sql) {
      return this.sequelize.query(sql, options);
    } else {
      return Promise.resolve();
    }
  }

  dropTrigger(options) {
    const sql = this.QueryGenerator.dropTrigger(options.tableName, options.triggerName);
    options = options || {};

    if (sql) {
      return this.sequelize.query(sql, options);
    } else {
      return Promise.resolve();
    }
  }

  renameTrigger(options) {
    const sql = this.QueryGenerator.renameTrigger(options.tableName, options.oldTriggerName, options.newTriggerName);
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
   * @param {Object} options - Options for creating SQL function
   * @param {String} options.functionName - Name of SQL function to create
   * @param {Array} options.params - List of parameters declared for SQL function
   * @param {String} options.returnType - SQL type of function returned value
   * @param {String} options.language - The name of the language that the function is implemented in
   * @param {String} options.body - Source code of function
   * @param {Array} options.optionsArray - Extra-options for creation
   *
   * @return {Promise}
   */
  createFunction(options) {
    const sql = this.QueryGenerator.createFunction(options.functionName, options.params, options.returnType, options.language, options.body, options.optionsArray);
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
   * @param {Object} options - Options for dropping SQL function
   * @param {String} options.functionName - Name of SQL function to drop
   * @param {Array} options.params - List of parameters declared for SQL function
   *
   * @return {Promise}
   */
  dropFunction(options) {
    const sql = this.QueryGenerator.dropFunction(options.functionName, options.params);
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
   * @param {Object} options - Options for renaming SQL function
   * @param {String} options.oldFunctionName - Old name of SQL function
   * @param {Array} options.params - List of parameters declared for SQL function
   * @param {String} options.newFunctionName - New name of SQL function
   *
   * @return {Promise}
   */
  renameFunction(options) {
    const sql = this.QueryGenerator.renameFunction(options.oldFunctionName, options.params, options.newFunctionName);
    options = options || {};

    if (sql) {
      return this.sequelize.query(sql, options);
    } else {
      return Promise.resolve();
    }
  }

  // Helper methods useful for querying

  /**
   * Escape an identifier (e.g. a table or attribute name). If force is true,
   * the identifier will be quoted even if the `quoteIdentifiers` option is
   * false.
   * @private
   */
  quoteIdentifier(options) {
    return this.QueryGenerator.quoteIdentifier(options.identifier, options.force);
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
  quoteIdentifiers(options) {
    return this.QueryGenerator.quoteIdentifiers(options.identifiers, options.force);
  }

  /**
   * Escape a value (e.g. a string, number or date)
   * @private
   */
  escape(value) {
    return this.QueryGenerator.escape(value);
  }

  setAutocommit(options) {
    if (!options.transaction || !(options.transaction instanceof Transaction)) {
      throw new Error('Unable to set autocommit for a transaction without transaction object!');
    }
    if (options.transaction.parent) {
      // Not possible to set a separate isolation level for savepoints
      return Promise.resolve();
    }

    options = _.assign({}, options, {
      transaction: options.transaction.parent || options.transaction
    });

    const sql = this.QueryGenerator.setAutocommitQuery(options.value, {
      parent: options.transaction.parent
    });

    if (!sql) return Promise.resolve();

    return this.sequelize.query(sql, options);
  }

  setIsolationLevel(options) {
    if (!options.transaction || !(options.transaction instanceof Transaction)) {
      throw new Error('Unable to set isolation level for a transaction without transaction object!');
    }

    if (options.transaction.parent || !options.value) {
      // Not possible to set a separate isolation level for savepoints
      return Promise.resolve();
    }

    options = _.assign({}, options, {
      transaction: options.transaction.parent || options.transaction
    });

    const sql = this.QueryGenerator.setIsolationLevelQuery(options.value, {
      parent: options.transaction.parent
    });

    if (!sql) return Promise.resolve();

    return this.sequelize.query(sql, options);
  }

  startTransaction(options) {
    if (!options.transaction || !(options.transaction instanceof Transaction)) {
      throw new Error('Unable to start a transaction without transaction object!');
    }

    options = _.assign({}, options, {
      transaction: options.transaction.parent || options.transaction
    });
    options.transaction.name = options.transaction.parent ? options.transaction.name : undefined;
    const sql = this.QueryGenerator.startTransactionQuery(options.transaction);

    return this.sequelize.query(sql, options);
  }

  deferConstraints(options) {
    options = _.assign({}, options, {
      transaction: options.transaction.parent || options.transaction
    });

    const sql = this.QueryGenerator.deferConstraintsQuery(options);

    if (sql) {
      return this.sequelize.query(sql, options);
    }

    return Promise.resolve();
  }

  commitTransaction(options) {
    if (!options.transaction || !(options.transaction instanceof Transaction)) {
      throw new Error('Unable to commit a transaction without transaction object!');
    }
    if (options.transaction.parent) {
      // Savepoints cannot be committed
      return Promise.resolve();
    }

    options = _.assign({}, options, {
      transaction: options.transaction.parent || options.transaction,
      supportsSearchPath: false
    });

    const sql = this.QueryGenerator.commitTransactionQuery(options.transaction);
    const promise = this.sequelize.query(sql, options);

    options.transaction.finished = 'commit';

    return promise;
  }

  rollbackTransaction(options) {
    if (!options.transaction || !(options.transaction instanceof Transaction)) {
      throw new Error('Unable to rollback a transaction without transaction object!');
    }

    options = _.assign({}, options, {
      transaction: options.transaction.parent || options.transaction,
      supportsSearchPath: false
    });
    options.transaction.name = options.transaction.parent ? options.transaction.name : undefined;
    const sql = this.QueryGenerator.rollbackTransactionQuery(options.transaction);
    const promise = this.sequelize.query(sql, options);

    options.transaction.finished = 'rollback';

    return promise;
  }
}

module.exports = QueryInterface;
module.exports.QueryInterface = QueryInterface;
module.exports.default = QueryInterface;