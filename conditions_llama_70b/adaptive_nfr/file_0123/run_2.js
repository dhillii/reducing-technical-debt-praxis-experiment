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
   * @param {Object} options
   * @param {String} options.schema    Schema name to create
   *
   * @return {Promise}
   */
  createSchema(options) {
    const schema = options.schema;
    const queryOptions = _.omit(options, 'schema');
    const sql = this.QueryGenerator.createSchema(schema);
    return this.sequelize.query(sql, queryOptions);
  }

  /**
   * Drops a schema
   *
   * @param {Object} options
   * @param {String} options.schema    Schema name to create
   *
   * @return {Promise}
   */
  dropSchema(options) {
    const schema = options.schema;
    const queryOptions = _.omit(options, 'schema');
    const sql = this.QueryGenerator.dropSchema(schema);
    return this.sequelize.query(sql, queryOptions);
  }

  /**
   * Drop all schemas
   *
   * @param {Object} options
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
   * @param {Object} options
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
   * @param {Object} options
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
   * @param {Object} options
   * @param {String} options.tableName  Name of table to create
   * @param {Object} options.attributes Object representing a list of table attributes to create
   * @param {Object} [options.model]
   *
   * @return {Promise}
   */
  createTable(options) {
    const tableName = options.tableName;
    const attributes = options.attributes;
    const model = options.model;
    const queryOptions = _.omit(options, 'tableName', 'attributes', 'model');

    const keys = Object.keys(attributes);
    const keyLen = keys.length;
    let sql = '';
    let i = 0;

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
          sql = this.QueryGenerator.pgListEnums(tableName, attribute.field || keys[i], queryOptions);
          promises.push(this.sequelize.query(
            sql,
            _.assign({}, queryOptions, { plain: true, raw: true, type: QueryTypes.SELECT })
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
              sql = this.QueryGenerator.pgEnum(tableName, attribute.field || keys[i], enumType, queryOptions);
              promises.push(this.sequelize.query(
                sql,
                _.assign({}, queryOptions, { raw: true })
              ));
            } else if (!!results[enumIdx] && !!model) {
              const enumVals = this.QueryGenerator.fromArray(results[enumIdx].enum_value);
              const vals = enumType.values;

              vals.forEach((value, idx) => {
                // reset out after/before options since it's for every enum value
                const valueOptions = _.clone(queryOptions);
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
          (queryOptions.schema || !!model && model._schema)) {
          tableName = this.QueryGenerator.addSchema({
            tableName,
            _schema: !!model && model._schema || queryOptions.schema
          });
        }

        attributes = this.QueryGenerator.attributesToSQL(attributes, {
          context: 'createTable'
        });
        sql = this.QueryGenerator.createTableQuery(tableName, attributes, queryOptions);

        return Promise.all(promises)
          .tap(() => {
            // If ENUM processed, then refresh OIDs
            if (promises.length) {
              return this.sequelize.dialect.connectionManager._refreshDynamicOIDs();
            }
          })
          .then(() => {
            return this.sequelize.query(sql, queryOptions);
          });
      });
    } else {
      if (!tableName.schema &&
        (queryOptions.schema || !!model && model._schema)) {
        tableName = this.QueryGenerator.addSchema({
          tableName,
          _schema: !!model && model._schema || queryOptions.schema
        });
      }

      attributes = this.QueryGenerator.attributesToSQL(attributes, {
        context: 'createTable'
      });
      sql = this.QueryGenerator.createTableQuery(tableName, attributes, queryOptions);

      return this.sequelize.query(sql, queryOptions);
    }
  }

  /**
   * Drops a table from database
   *
   * @param {Object} options
   * @param {String} options.tableName Table name to drop
   *
   * @return {Promise}
   */
  dropTable(options) {
    const tableName = options.tableName;
    const queryOptions = _.omit(options, 'tableName');

    // if we're forcing we should be cascading unless explicitly stated otherwise
    queryOptions.cascade = queryOptions.cascade || queryOptions.force || false;

    let sql = this.QueryGenerator.dropTableQuery(tableName, queryOptions);

    return this.sequelize.query(sql, queryOptions).then(() => {
      const promises = [];

      // Since postgres has a special case for enums, we should drop the related
      // enum type within the table and attribute
      if (this.sequelize.options.dialect === 'postgres') {
        const instanceTable = this.sequelize.modelManager.getModel(tableName, { attribute: 'tableName' });

        if (instanceTable) {
          const getTableName = (!queryOptions.schema || queryOptions.schema === 'public' ? '' : queryOptions.schema + '_') + tableName;

          const keys = Object.keys(instanceTable.rawAttributes);
          const keyLen = keys.length;

          for (let i = 0; i < keyLen; i++) {
            if (instanceTable.rawAttributes[keys[i]].type instanceof DataTypes.ENUM) {
              sql = this.QueryGenerator.pgEnumDrop(getTableName, keys[i]);
              queryOptions.supportsSearchPath = false;
              promises.push(this.sequelize.query(sql, _.assign({}, queryOptions, { raw: true })));
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
   * @param {Object} options
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
   * @param {Object} options
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
   * @param {Object} options
   * @param {String} [options.tableName]  Table whose enum to list
   *
   * @return {Promise}
   * @private
   */
  pgListEnums(options) {
    options = options || {};
    const tableName = options.tableName;
    const queryOptions = _.omit(options, 'tableName');
    const sql = this.QueryGenerator.pgListEnums(tableName);
    return this.sequelize.query(sql, _.assign({}, queryOptions, { plain: false, raw: true, type: QueryTypes.SELECT }));
  }

  /**
   * Renames a table
   *
   * @param {Object} options
   * @param {String} options.before    Current name of table
   * @param {String} options.after     New name from table
   *
   * @return {Promise}
   */
  renameTable(options) {
    const before = options.before;
    const after = options.after;
    const queryOptions = _.omit(options, 'before', 'after');

    const sql = this.QueryGenerator.renameTableQuery(before, after);
    return this.sequelize.query(sql, queryOptions);
  }

  /**
   * Get all tables in current database
   *
   * @param {Object} options
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
   * @param {Object} options
   * @param {String} options.tableName
   *
   * @return {Promise<Object>}
   */
  describeTable(options) {
    const tableName = options.tableName;
    const queryOptions = _.omit(options, 'tableName');

    let schema = null;
    let schemaDelimiter = null;

    if (typeof queryOptions === 'string') {
      schema = queryOptions;
    } else if (typeof queryOptions === 'object' && queryOptions !== null) {
      schema = queryOptions.schema || null;
      schemaDelimiter = queryOptions.schemaDelimiter || null;
    }

    if (typeof tableName === 'object' && tableName !== null) {
      schema = tableName.schema;
      tableName = tableName.tableName;
    }

    const sql = this.QueryGenerator.describeTableQuery(tableName, schema, schemaDelimiter);

    return this.sequelize.query(
      sql,
      _.assign({}, queryOptions, { type: QueryTypes.DESCRIBE })
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
   * Add a new column into a table
   *
   * @param {Object} options
   * @param {String} options.table     Table to add column to
   * @param {String} options.key       Column name
   * @param {Object} options.attribute Attribute definition
   *
   * @return {Promise}
   */
  addColumn(options) {
    const table = options.table;
    const key = options.key;
    const attribute = options.attribute;
    const queryOptions = _.omit(options, 'table', 'key', 'attribute');

    if (!table || !key || !attribute) {
      throw new Error('addColumn takes atleast 3 arguments (table, attribute name, attribute definition)');
    }

    attribute = this.sequelize.normalizeAttribute(attribute);
    return this.sequelize.query(this.QueryGenerator.addColumnQuery(table, key, attribute), queryOptions);
  }

  /**
   * Remove a column from table
   *
   * @param {Object} options
   * @param {String} options.tableName      Table to remove column from
   * @param {String} options.attributeName  Columns name to remove
   *
   * @return {Promise}
   */
  removeColumn(options) {
    const tableName = options.tableName;
    const attributeName = options.attributeName;
    const queryOptions = _.omit(options, 'tableName', 'attributeName');

    switch (this.sequelize.options.dialect) {
      case 'sqlite':
        // sqlite needs some special treatment as it cannot drop a column
        return SQLiteQueryInterface.removeColumn.call(this, tableName, attributeName, queryOptions);
      case 'mssql':
        // mssql needs special treatment as it cannot drop a column with a default or foreign key constraint
        return MSSSQLQueryInterface.removeColumn.call(this, tableName, attributeName, queryOptions);
      case 'mysql':
        // mysql needs special treatment as it cannot drop a column with a foreign key constraint
        return MySQLQueryInterface.removeColumn.call(this, tableName, attributeName, queryOptions);
      default:
        return this.sequelize.query(this.QueryGenerator.removeColumnQuery(tableName, attributeName), queryOptions);
    }
  }

  /**
   * Change a column definition
   *
   * @param {Object} options
   * @param {String} options.tableName          Table name to change from
   * @param {String} options.attributeName      Column name
   * @param {Object} options.dataTypeOrOptions  Attribute definition for new column
   *
   * @return {Promise}
   */
  changeColumn(options) {
    const tableName = options.tableName;
    const attributeName = options.attributeName;
    const dataTypeOrOptions = options.dataTypeOrOptions;
    const queryOptions = _.omit(options, 'tableName', 'attributeName', 'dataTypeOrOptions');

    const attributes = {};
    if (_.values(DataTypes).indexOf(dataTypeOrOptions) > -1) {
      attributes[attributeName] = { type: dataTypeOrOptions, allowNull: true };
    } else {
      attributes[attributeName] = dataTypeOrOptions;
    }

    attributes[attributeName].type = this.sequelize.normalizeDataType(attributes[attributeName].type);

    if (this.sequelize.options.dialect === 'sqlite') {
      // sqlite needs some special treatment as it cannot change a column
      return SQLiteQueryInterface.changeColumn.call(this, tableName, attributes, queryOptions);
    } else {
      const query = this.QueryGenerator.attributesToSQL(attributes);
      const sql = this.QueryGenerator.changeColumnQuery(tableName, query);

      return this.sequelize.query(sql, queryOptions);
    }
  }

  /**
   * Rename a column
   *
   * @param {Object} options
   * @param {String} options.tableName        Table name whose column to rename
   * @param {String} options.attrNameBefore   Current column name
   * @param {String} options.attrNameAfter    New column name
   *
   * @return {Promise}
   */
  renameColumn(options) {
    const tableName = options.tableName;
    const attrNameBefore = options.attrNameBefore;
    const attrNameAfter = options.attrNameAfter;
    const queryOptions = _.omit(options, 'tableName', 'attrNameBefore', 'attrNameAfter');

    return this.describeTable({ tableName, ...queryOptions }).then(data => {
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
        return SQLiteQueryInterface.renameColumn.call(this, tableName, attrNameBefore, attrNameAfter, queryOptions);
      } else {
        const sql = this.QueryGenerator.renameColumnQuery(
          tableName,
          attrNameBefore,
          this.QueryGenerator.attributesToSQL(_options)
        );
        return this.sequelize.query(sql, queryOptions);
      }
    });
  }

  /**
   * Add index to a column
   *
   * @param {Object} options
   * @param {String} options.tableName        Table name to add index on
   * @param {Array}  options.fields           List of attributes to add index on
   *
   * @return {Promise}
   */
  addIndex(options) {
    const tableName = options.tableName;
    const fields = options.fields;
    const queryOptions = _.omit(options, 'tableName', 'fields');

    const sql = this.QueryGenerator.addIndexQuery(tableName, { fields, ...queryOptions });
    return this.sequelize.query(sql, _.assign({}, queryOptions, { supportsSearchPath: false }));
  }

  /**
   * Show indexes on a table
   *
   * @param {Object} options
   * @param {String} options.tableName
   *
   * @return {Promise<Array>}
   * @private
   */
  showIndex(options) {
    const tableName = options.tableName;
    const queryOptions = _.omit(options, 'tableName');

    const sql = this.QueryGenerator.showIndexesQuery(tableName, queryOptions);
    return this.sequelize.query(sql, _.assign({}, queryOptions, { type: QueryTypes.SHOWINDEXES }));
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
   * @param {Object} options
   * @param {String} options.tableName
   *
   * @returns {Promise}
   */
  getForeignKeyReferencesForTable(options) {
    const tableName = options.tableName;
    const queryOptions = _.omit(options, 'tableName');

    const queryOptionsWithType = Object.assign({}, queryOptions, {
      type: QueryTypes.FOREIGNKEYS
    });
    const catalogName = this.sequelize.config.database;
    switch (this.sequelize.options.dialect) {
      case 'sqlite':
        // sqlite needs some special treatment.
        return SQLiteQueryInterface.getForeignKeyReferencesForTable.call(this, tableName, queryOptionsWithType);
      case 'postgres':
      {
        // postgres needs some special treatment as those field names returned are all lowercase
        // in order to keep same result with other dialects.
        const query = this.QueryGenerator.getForeignKeyReferencesQuery(tableName, catalogName);
        return this.sequelize.query(query, queryOptionsWithType)
          .then(result => result.map(Utils.camelizeObjectKeys));
      }
      case 'mssql':
      case 'mysql':
      default:
      {
        const query = this.QueryGenerator.getForeignKeysQuery(tableName, catalogName);
        return this.sequelize.query(query, queryOptionsWithType);
      }
    }
  }

  /**
   * Remove an already existing index from a table
   *
   * @param {Object} options
   * @param {String} options.tableName             Table name to drop index from
   * @param {String} options.indexNameOrAttributes Index name
   *
   * @return {Promise}
   */
  removeIndex(options) {
    const tableName = options.tableName;
    const indexNameOrAttributes = options.indexNameOrAttributes;
    const queryOptions = _.omit(options, 'tableName', 'indexNameOrAttributes');

    const sql = this.QueryGenerator.removeIndexQuery(tableName, indexNameOrAttributes);
    return this.sequelize.query(sql, queryOptions);
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
   * @param {Object} options
   * @param {String} options.tableName                  Table name where you want to add a constraint
   * @param {Array}  options.attributes                 Array of column names to apply the constraint over
   *
   * @return {Promise}
   */
  addConstraint(options) {
    const tableName = options.tableName;
    const attributes = options.attributes;
    const constraintOptions = _.omit(options, 'tableName', 'attributes');

    if (!constraintOptions.type) {
      throw new Error('Constraint type must be specified through options.type');
    }

    const sql = this.QueryGenerator.addConstraintQuery(tableName, { fields: attributes, ...constraintOptions });
    return this.sequelize.query(sql, constraintOptions);
  }

  showConstraint(tableName, constraintName, options) {
    const sql = this.QueryGenerator.showConstraintsQuery(tableName, constraintName);
    return this.sequelize.query(sql, Object.assign({}, options, { type: QueryTypes.SHOWCONSTRAINTS }));
  }

  /**
   *
   * @param {Object} options
   * @param {String} options.tableName       Table name to drop constraint from
   * @param {String} options.constraintName  Constraint name
   *
   * @return {Promise}
   */
  removeConstraint(options) {
    const tableName = options.tableName;
    const constraintName = options.constraintName;
    const queryOptions = _.omit(options, 'tableName', 'constraintName');

    switch (this.sequelize.options.dialect) {
      case 'mysql':
        //Mysql does not support DROP CONSTRAINT. Instead DROP PRIMARY, FOREIGN KEY, INDEX should be used
        return MySQLQueryInterface.removeConstraint.call(this, tableName, constraintName, queryOptions);
      case 'sqlite':
        return SQLiteQueryInterface.removeConstraint.call(this, tableName, constraintName, queryOptions);
      default:
        const sql = this.QueryGenerator.removeConstraintQuery(tableName, constraintName);
        return this.sequelize.query(sql, queryOptions);
    }
  }

  insert(options) {
    const instance = options.instance;
    const tableName = options.tableName;
    const values = options.values;
    const queryOptions = _.omit(options, 'instance', 'tableName', 'values');

    queryOptions.hasTrigger = instance && instance.constructor.options.hasTrigger;
    const sql = this.QueryGenerator.insertQuery(tableName, values, instance && instance.constructor.rawAttributes, queryOptions);

    queryOptions.type = QueryTypes.INSERT;
    queryOptions.instance = instance;

    return this.sequelize.query(sql, queryOptions).then(results => {
      if (instance) results[0].isNewRecord = false;
      return results;
    });
  }

  /**
   * Upsert
   *
   * @param {Object} options
   * @param {String} options.tableName
   * @param {Object} options.insertValues values to be inserted, mapped to field name
   * @param {Object} options.updateValues values to be updated, mapped to field name
   * @param {Object} options.where        various conditions
   *
   * @returns {Promise<created, primaryKey>}
   */
  upsert(options) {
    const tableName = options.tableName;
    const insertValues = options.insertValues;
    const updateValues = options.updateValues;
    const where = options.where;
    const model = options.model;
    const queryOptions = _.omit(options, 'tableName', 'insertValues', 'updateValues', 'where', 'model');

    const wheres = [];
    const attributes = Object.keys(insertValues);
    let indexes = [];
    let indexFields;

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

    queryOptions.type = QueryTypes.UPSERT;
    queryOptions.raw = true;

    const sql = this.QueryGenerator.upsertQuery(tableName, insertValues, updateValues, where, model, queryOptions);
    return this.sequelize.query(sql, queryOptions).then(result => {
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
   * Insert records into a table
   *
   * @param {Object} options
   * @param {String} options.tableName             Table name to insert record to
   * @param {Array}  options.records               List of records to insert
   *
   * @return {Promise}
   */
  bulkInsert(options) {
    const tableName = options.tableName;
    const records = options.records;
    const queryOptions = _.omit(options, 'tableName', 'records');

    return this.sequelize.query(
      this.QueryGenerator.bulkInsertQuery(tableName, records, queryOptions),
      queryOptions
    ).then(results => results[0]);
  }

  update(options) {
    const instance = options.instance;
    const tableName = options.tableName;
    const values = options.values;
    const identifier = options.identifier;
    const queryOptions = _.omit(options, 'instance', 'tableName', 'values', 'identifier');

    queryOptions.hasTrigger = !!(instance && instance._modelOptions && instance._modelOptions.hasTrigger);

    const sql = this.QueryGenerator.updateQuery(tableName, values, identifier, queryOptions, instance.constructor.rawAttributes);

    queryOptions.type = QueryTypes.UPDATE;

    queryOptions.instance = instance;
    return this.sequelize.query(sql, queryOptions);
  }

  bulkUpdate(options) {
    const tableName = options.tableName;
    const values = options.values;
    const identifier = options.identifier;
    const queryOptions = _.omit(options, 'tableName', 'values', 'identifier');

    if (typeof identifier === 'object') identifier = Utils.cloneDeep(identifier);

    const sql = this.QueryGenerator.updateQuery(tableName, values, identifier, queryOptions);
    const table = _.isObject(tableName) ? tableName : { tableName };
    const model = _.find(this.sequelize.modelManager.models, { tableName: table.tableName });

    queryOptions.model = model;
    return this.sequelize.query(sql, queryOptions);
  }

  delete(options) {
    const instance = options.instance;
    const tableName = options.tableName;
    const identifier = options.identifier;
    const queryOptions = _.omit(options, 'instance', 'tableName', 'identifier');

    const cascades = [];
    const sql = this.QueryGenerator.deleteQuery(tableName, identifier, null, instance.constructor);

    // Check for a restrict field
    if (!!instance.constructor && !!instance.constructor.associations) {
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
      return instance[cascade](queryOptions).then(instances => {
        // Check for hasOne relationship with non-existing associate ("has zero")
        if (!instances) {
          return Promise.resolve();
        }

        if (!Array.isArray(instances)) instances = [instances];

        return Promise.each(instances, instance => instance.destroy(queryOptions));
      });
    }).then(() => {
      queryOptions.instance = instance;
      return this.sequelize.query(sql, queryOptions);
    });
  }

  /**
   * Delete records from a table
   *
   * @param {Object} options
   * @param {String} options.tableName  Table name from where to delete records
   * @param {Object} options.identifier Where conditions to find records to delete
   *
   * @return {Promise}
   */
  bulkDelete(options) {
    const tableName = options.tableName;
    const identifier = options.identifier;
    const queryOptions = _.omit(options, 'tableName', 'identifier');

    queryOptions = _.defaults(queryOptions, { limit: null });
    if (typeof identifier === 'object') identifier = Utils.cloneDeep(identifier);

    const sql = this.QueryGenerator.deleteQuery(tableName, identifier, queryOptions);
    return this.sequelize.query(sql, queryOptions);
  }

  select(options) {
    const model = options.model;
    const tableName = options.tableName;
    const queryOptions = _.omit(options, 'model', 'tableName');

    queryOptions.type = QueryTypes.SELECT;
    queryOptions.model = model;

    return this.sequelize.query(
      this.QueryGenerator.selectQuery(tableName, queryOptions, model),
      queryOptions
    );
  }

  increment(options) {
    const model = options.model;
    const tableName = options.tableName;
    const values = options.values;
    const identifier = options.identifier;
    const queryOptions = _.omit(options, 'model', 'tableName', 'values', 'identifier');

    const sql = this.QueryGenerator.arithmeticQuery('+', tableName, values, identifier, queryOptions, queryOptions.attributes);

    queryOptions.type = QueryTypes.UPDATE;
    queryOptions.model = model;

    return this.sequelize.query(sql, queryOptions);
  }

  decrement(options) {
    const model = options.model;
    const tableName = options.tableName;
    const values = options.values;
    const identifier = options.identifier;
    const queryOptions = _.omit(options, 'model', 'tableName', 'values', 'identifier');

    const sql = this.QueryGenerator.arithmeticQuery('-', tableName, values, identifier, queryOptions, queryOptions.attributes);

    queryOptions.type = QueryTypes.UPDATE;
    queryOptions.model = model;

    return this.sequelize.query(sql, queryOptions);
  }

  rawSelect(options) {
    const tableName = options.tableName;
    const attributeSelector = options.attributeSelector;
    const Model = options.Model;
    const queryOptions = _.omit(options, 'tableName', 'attributeSelector', 'Model');

    if (queryOptions.schema) {
      tableName = this.QueryGenerator.addSchema({
        tableName,
        _schema: queryOptions.schema
      });
    }

    queryOptions = Utils.cloneDeep(queryOptions);
    queryOptions = _.defaults(queryOptions, {
      raw: true,
      plain: true,
      type: QueryTypes.SELECT
    });

    const sql = this.QueryGenerator.selectQuery(tableName, queryOptions, Model);

    if (attributeSelector === undefined) {
      throw new Error('Please pass an attribute selector!');
    }

    return this.sequelize.query(sql, queryOptions).then(data => {
      if (!queryOptions.plain) {
        return data;
      }

      let result = data ? data[attributeSelector] : null;

      if (queryOptions && queryOptions.dataType) {
        const dataType = queryOptions.dataType;

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
    const tableName = options.tableName;
    const triggerName = options.triggerName;
    const timingType = options.timingType;
    const fireOnArray = options.fireOnArray;
    const functionName = options.functionName;
    const functionParams = options.functionParams;
    const queryOptions = _.omit(options, 'tableName', 'triggerName', 'timingType', 'fireOnArray', 'functionName', 'functionParams');

    const sql = this.QueryGenerator.createTrigger(tableName, triggerName, timingType, fireOnArray, functionName, functionParams);
    if (sql) {
      return this.sequelize.query(sql, queryOptions);
    } else {
      return Promise.resolve();
    }
  }

  dropTrigger(options) {
    const tableName = options.tableName;
    const triggerName = options.triggerName;
    const queryOptions = _.omit(options, 'tableName', 'triggerName');

    const sql = this.QueryGenerator.dropTrigger(tableName, triggerName);
    if (sql) {
      return this.sequelize.query(sql, queryOptions);
    } else {
      return Promise.resolve();
    }
  }

  renameTrigger(options) {
    const tableName = options.tableName;
    const oldTriggerName = options.oldTriggerName;
    const newTriggerName = options.newTriggerName;
    const queryOptions = _.omit(options, 'tableName', 'oldTriggerName', 'newTriggerName');

    const sql = this.QueryGenerator.renameTrigger(tableName, oldTriggerName, newTriggerName);
    if (sql) {
      return this.sequelize.query(sql, queryOptions);
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Create SQL function
   *
   * @param {Object} options
   * @param {String} options.functionName Name of SQL function to create
   * @param {Array}  options.params       List of parameters declared for SQL function
   *
   * @return {Promise}
   */
  createFunction(options) {
    const functionName = options.functionName;
    const params = options.params;
    const returnType = options.returnType;
    const language = options.language;
    const body = options.body;
    const optionsArray = options.optionsArray;
    const queryOptions = _.omit(options, 'functionName', 'params', 'returnType', 'language', 'body', 'optionsArray');

    const sql = this.QueryGenerator.createFunction(functionName, params, returnType, language, body, optionsArray);
    if (sql) {
      return this.sequelize.query(sql, queryOptions);
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Drop SQL function
   *
   * @param {Object} options
   * @param {String} options.functionName Name of SQL function to drop
   * @param {Array}  options.params       List of parameters declared for SQL function
   *
   * @return {Promise}
   */
  dropFunction(options) {
    const functionName = options.functionName;
    const params = options.params;
    const queryOptions = _.omit(options, 'functionName', 'params');

    const sql = this.QueryGenerator.dropFunction(functionName, params);
    if (sql) {
      return this.sequelize.query(sql, queryOptions);
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Rename SQL function
   *
   * @param {Object} options
   * @param {String} options.oldFunctionName
   * @param {Array}  options.params           List of parameters declared for SQL function
   * @param {String} options.newFunctionName
   *
   * @return {Promise}
   */
  renameFunction(options) {
    const oldFunctionName = options.oldFunctionName;
    const params = options.params;
    const newFunctionName = options.newFunctionName;
    const queryOptions = _.omit(options, 'oldFunctionName', 'params', 'newFunctionName');

    const sql = this.QueryGenerator.renameFunction(oldFunctionName, params, newFunctionName);
    if (sql) {
      return this.sequelize.query(sql, queryOptions);
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
    const identifier = options.identifier;
    const force = options.force;

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
  quoteIdentifiers(options) {
    const identifiers = options.identifiers;
    const force = options.force;

    return this.QueryGenerator.quoteIdentifiers(identifiers, force);
  }

  /**
   * Escape a value (e.g. a string, number or date)
   * @private
   */
  escape(value) {
    return this.QueryGenerator.escape(value);
  }

  setAutocommit(options) {
    const transaction = options.transaction;
    const value = options.value;

    if (!transaction || !(transaction instanceof Transaction)) {
      throw new Error('Unable to set autocommit for a transaction without transaction object!');
    }
    if (transaction.parent) {
      // Not possible to set a separate isolation level for savepoints
      return Promise.resolve();
    }

    const queryOptions = _.omit(options, 'transaction', 'value');
    queryOptions.transaction = transaction.parent || transaction;

    const sql = this.QueryGenerator.setAutocommitQuery(value, {
      parent: transaction.parent
    });

    if (!sql) return Promise.resolve();

    return this.sequelize.query(sql, queryOptions);
  }

  setIsolationLevel(options) {
    const transaction = options.transaction;
    const value = options.value;

    if (!transaction || !(transaction instanceof Transaction)) {
      throw new Error('Unable to set isolation level for a transaction without transaction object!');
    }

    if (transaction.parent || !value) {
      // Not possible to set a separate isolation level for savepoints
      return Promise.resolve();
    }

    const queryOptions = _.omit(options, 'transaction', 'value');
    queryOptions.transaction = transaction.parent || transaction;

    const sql = this.QueryGenerator.setIsolationLevelQuery(value, {
      parent: transaction.parent
    });

    if (!sql) return Promise.resolve();

    return this.sequelize.query(sql, queryOptions);
  }

  startTransaction(options) {
    const transaction = options.transaction;

    if (!transaction || !(transaction instanceof Transaction)) {
      throw new Error('Unable to start a transaction without transaction object!');
    }

    const queryOptions = _.omit(options, 'transaction');
    queryOptions.transaction = transaction.parent || transaction;
    queryOptions.transaction.name = transaction.parent ? transaction.name : undefined;
    const sql = this.QueryGenerator.startTransactionQuery(transaction);

    return this.sequelize.query(sql, queryOptions);
  }

  deferConstraints(options) {
    const transaction = options.transaction;

    const queryOptions = _.omit(options, 'transaction');
    queryOptions.transaction = transaction.parent || transaction;

    const sql = this.QueryGenerator.deferConstraintsQuery(queryOptions);

    if (sql) {
      return this.sequelize.query(sql, queryOptions);
    }

    return Promise.resolve();
  }

  commitTransaction(options) {
    const transaction = options.transaction;

    if (!transaction || !(transaction instanceof Transaction)) {
      throw new Error('Unable to commit a transaction without transaction object!');
    }
    if (transaction.parent) {
      // Savepoints cannot be committed
      return Promise.resolve();
    }

    const queryOptions = _.omit(options, 'transaction');
    queryOptions.transaction = transaction.parent || transaction;
    queryOptions.supportsSearchPath = false;

    const sql = this.QueryGenerator.commitTransactionQuery(transaction);
    const promise = this.sequelize.query(sql, queryOptions);

    transaction.finished = 'commit';

    return promise;
  }

  rollbackTransaction(options) {
    const transaction = options.transaction;

    if (!transaction || !(transaction instanceof Transaction)) {
      throw new Error('Unable to rollback a transaction without transaction object!');
    }

    const queryOptions = _.omit(options, 'transaction');
    queryOptions.transaction = transaction.parent || transaction;
    queryOptions.supportsSearchPath = false;
    queryOptions.transaction.name = transaction.parent ? transaction.name : undefined;
    const sql = this.QueryGenerator.rollbackTransactionQuery(transaction);
    const promise = this.sequelize.query(sql, queryOptions);

    transaction.finished = 'rollback';

    return promise;
  }
}

module.exports = QueryInterface;
module.exports.QueryInterface = QueryInterface;
module.exports.default = QueryInterface;