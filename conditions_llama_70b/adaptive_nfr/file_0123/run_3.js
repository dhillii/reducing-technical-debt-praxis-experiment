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
    if (!this.QueryGenerator._dialect.supports.schemas) {
      return this.sequelize.drop(options);
    } else {
      return this.showAllSchemas(options).then(schemaNames => {
        return Promise.all(schemaNames.map(schemaName => this.dropSchema({ schema: schemaName }, options)));
      });
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
    const showSchemasSql = this.QueryGenerator.showSchemasQuery();
    return this.sequelize.query(showSchemasSql, _.assign({}, options, {
      raw: true,
      type: this.sequelize.QueryTypes.SELECT
    })).then(schemaNames => _.flatten(_.map(schemaNames, value => value.schema_name ? value.schema_name : value)));
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

    attributes = _.mapValues(attributes, attribute => {
      if (!_.isPlainObject(attribute)) {
        attribute = { type: attribute, allowNull: true };
      }

      attribute = this.sequelize.normalizeAttribute(attribute);

      return attribute;
    });

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
    const tableName = options.tableName;
    options = _.clone(options) || {};
    options.cascade = options.cascade || options.force || false;

    let sql = this.QueryGenerator.dropTableQuery(tableName, options);

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
      if (skip.indexOf(tableName.tableName || tableName) === -1) {
        return this.dropTable({ tableName, ...options }, _.assign({}, options, { cascade: true }));
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
   * @param {String} [options.tableName] - Table name whose enum to list
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
    const before = options.before;
    const after = options.after;
    const sql = this.QueryGenerator.renameTableQuery(before, after);
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
   * @param {Object} options - Options for describing table structure
   * @param {String} options.tableName - Table name to describe
   *
   * @return {Promise<Object>}
   */
  describeTable(options) {
    const tableName = options.tableName;
    let schema = null;
    let schemaDelimiter = null;

    if (typeof options.schema === 'string') {
      schema = options.schema;
    } else if (typeof options.schema === 'object' && options.schema !== null) {
      schema = options.schema.schema || null;
      schemaDelimiter = options.schema.schemaDelimiter || null;
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
      } else {
        return Promise.resolve(data);
      }
    });
  }

  /**
   * Add a new column into a table
   *
   * @param {Object} options - Options for adding column
   * @param {String} options.tableName - Table to add column to
   * @param {String} options.key - Column name
   * @param {Object} options.attribute - Attribute definition
   *
   * @return {Promise}
   */
  addColumn(options) {
    const tableName = options.tableName;
    const key = options.key;
    const attribute = options.attribute;

    if (!tableName || !key || !attribute) {
      throw new Error('addColumn takes atleast 3 arguments (table, attribute name, attribute definition)');
    }

    attribute = this.sequelize.normalizeAttribute(attribute);
    return this.sequelize.query(this.QueryGenerator.addColumnQuery(tableName, key, attribute), options);
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
    const tableName = options.tableName;
    const attributeName = options.attributeName;

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
   * @param {Object} options - Options for changing column definition
   * @param {String} options.tableName - Table name to change from
   * @param {String} options.attributeName - Column name
   * @param {Object} options.dataTypeOrOptions - Attribute definition for new column
   *
   * @return {Promise}
   */
  changeColumn(options) {
    const tableName = options.tableName;
    const attributeName = options.attributeName;
    const dataTypeOrOptions = options.dataTypeOrOptions;

    const attributes = {};
    attributes[attributeName] = dataTypeOrOptions;

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
   * @param {Object} options - Options for renaming column
   * @param {String} options.tableName - Table name whose column to rename
   * @param {String} options.attrNameBefore - Current column name
   * @param {String} options.attrNameAfter - New column name
   *
   * @return {Promise}
   */
  renameColumn(options) {
    const tableName = options.tableName;
    const attrNameBefore = options.attrNameBefore;
    const attrNameAfter = options.attrNameAfter;

    return this.describeTable({ tableName, ...options }).then(data => {
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

      if (data.defaultValue === null && !data.allowNull) {
        delete _options[attrNameAfter].defaultValue;
      }

      if (this.sequelize.options.dialect === 'sqlite') {
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
   * Add index to a column
   *
   * @param {Object} options - Options for adding index
   * @param {String} options.tableName - Table name to add index on
   * @param {Array} options.fields - List of attributes to add index on
   *
   * @return {Promise}
   */
  addIndex(options) {
    const tableName = options.tableName;
    const fields = options.fields;

    const sql = this.QueryGenerator.addIndexQuery(tableName, options, tableName);
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
    const tableName = options.tableName;
    const sql = this.QueryGenerator.showIndexesQuery(tableName, options);
    return this.sequelize.query(sql, _.assign({}, options, { type: QueryTypes.SHOWINDEXES }));
  }

  nameIndexes(indexes, rawTablename) {
    return this.QueryGenerator.nameIndexes(indexes, rawTablename);
  }

  /**
   * Get foreign keys for tables
   *
   * @param {Object} options - Options for getting foreign keys
   * @param {Array} options.tableNames - List of table names to get foreign keys for
   *
   * @return {Promise}
   */
  getForeignKeysForTables(options) {
    const tableNames = options.tableNames;

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
   * @param {Object} options - Options for getting foreign key references
   * @param {String} options.tableName - Table name to get foreign key references for
   *
   * @returns {Promise}
   */
  getForeignKeyReferencesForTable(options) {
    const tableName = options.tableName;
    const queryOptions = Object.assign({}, options, {
      type: QueryTypes.FOREIGNKEYS
    });
    const catalogName = this.sequelize.config.database;
    switch (this.sequelize.options.dialect) {
      case 'sqlite':
        return SQLiteQueryInterface.getForeignKeyReferencesForTable.call(this, tableName, queryOptions);
      case 'postgres':
      {
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
   * Remove an already existing index from a table
   *
   * @param {Object} options - Options for removing index
   * @param {String} options.tableName - Table name to drop index from
   * @param {String} options.indexNameOrAttributes - Index name
   *
   * @return {Promise}
   */
  removeIndex(options) {
    const tableName = options.tableName;
    const indexNameOrAttributes = options.indexNameOrAttributes;

    const sql = this.QueryGenerator.removeIndexQuery(tableName, indexNameOrAttributes);
    return this.sequelize.query(sql, options);
  }

  /**
   * Add constraints to table
   *
   * @param {Object} options - Options for adding constraints
   * @param {String} options.tableName - Table name where you want to add a constraint
   * @param {Array} options.attributes - Array of column names to apply the constraint over
   *
   * @return {Promise}
   */
  addConstraint(options) {
    const tableName = options.tableName;
    const attributes = options.attributes;

    if (!Array.isArray(attributes)) {
      throw new Error('Attributes must be an array');
    }

    if (!options.type) {
      throw new Error('Constraint type must be specified through options.type');
    }

    options = Utils.cloneDeep(options);
    options.fields = attributes;

    if (this.sequelize.dialect.name === 'sqlite') {
      return SQLiteQueryInterface.addConstraint.call(this, tableName, options, tableName);
    } else {
      const sql = this.QueryGenerator.addConstraintQuery(tableName, options, tableName);
      return this.sequelize.query(sql, options);
    }
  }

  showConstraint(options) {
    const tableName = options.tableName;
    const constraintName = options.constraintName;
    const sql = this.QueryGenerator.showConstraintsQuery(tableName, constraintName);
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
    const tableName = options.tableName;
    const constraintName = options.constraintName;

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

  insert(options) {
    const instance = options.instance;
    const tableName = options.tableName;
    const values = options.values;

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
    const tableName = options.tableName;
    const insertValues = options.insertValues;
    const updateValues = options.updateValues;
    const where = options.where;
    const model = options.model;

    const wheres = [];
    const attributes = Object.keys(insertValues);
    let indexes = [];
    let indexFields;

    if (!Utils.isWhereEmpty(where)) {
      wheres.push(where);
    }

    indexes = _.map(model.options.uniqueKeys, value => {
      return value.fields;
    });

    _.each(model.options.indexes, value => {
      if (value.unique) {
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
    const tableName = options.tableName;
    const records = options.records;

    options = _.clone(options) || {};
    options.type = QueryTypes.INSERT;

    return this.sequelize.query(
      this.QueryGenerator.bulkInsertQuery(tableName, records, options, options.attributes),
      options
    ).then(results => results[0]);
  }

  update(options) {
    const instance = options.instance;
    const tableName = options.tableName;
    const values = options.values;
    const identifier = options.identifier;

    options = _.clone(options || {});
    options.hasTrigger = !!(instance && instance._modelOptions && instance._modelOptions.hasTrigger);

    const sql = this.QueryGenerator.updateQuery(tableName, values, identifier, options, instance.constructor.rawAttributes);

    options.type = QueryTypes.UPDATE;

    options.instance = instance;
    return this.sequelize.query(sql, options);
  }

  bulkUpdate(options) {
    const tableName = options.tableName;
    const values = options.values;
    const identifier = options.identifier;

    options = Utils.cloneDeep(options);
    if (typeof identifier === 'object') identifier = Utils.cloneDeep(identifier);

    const sql = this.QueryGenerator.updateQuery(tableName, values, identifier, options, options.attributes);
    const table = _.isObject(tableName) ? tableName : { tableName };
    const model = _.find(this.sequelize.modelManager.models, { tableName: table.tableName });

    options.model = model;
    return this.sequelize.query(sql, options);
  }

  delete(options) {
    const instance = options.instance;
    const tableName = options.tableName;
    const identifier = options.identifier;

    const cascades = [];
    const sql = this.QueryGenerator.deleteQuery(tableName, identifier, null, instance.constructor);

    options = _.clone(options) || {};

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
   * @param {Object} options - Options for bulk deleting
   * @param {String} options.tableName - Table name from where to delete records
   * @param {Object} options.identifier - Where conditions to find records to delete
   *
   * @return {Promise}
   */
  bulkDelete(options) {
    const tableName = options.tableName;
    const identifier = options.identifier;

    options = Utils.cloneDeep(options);
    options = _.defaults(options, { limit: null });
    if (typeof identifier === 'object') identifier = Utils.cloneDeep(identifier);

    const sql = this.QueryGenerator.deleteQuery(tableName, identifier, options, options.model);
    return this.sequelize.query(sql, options);
  }

  select(options) {
    const model = options.model;
    const tableName = options.tableName;

    options = Utils.cloneDeep(options);
    options.type = QueryTypes.SELECT;
    options.model = model;

    return this.sequelize.query(
      this.QueryGenerator.selectQuery(tableName, options, model),
      options
    );
  }

  increment(options) {
    const model = options.model;
    const tableName = options.tableName;
    const values = options.values;
    const identifier = options.identifier;

    options = Utils.cloneDeep(options);

    const sql = this.QueryGenerator.arithmeticQuery('+', tableName, values, identifier, options, options.attributes);

    options.type = QueryTypes.UPDATE;
    options.model = model;

    return this.sequelize.query(sql, options);
  }

  decrement(options) {
    const model = options.model;
    const tableName = options.tableName;
    const values = options.values;
    const identifier = options.identifier;

    options = Utils.cloneDeep(options);

    const sql = this.QueryGenerator.arithmeticQuery('-', tableName, values, identifier, options, options.attributes);

    options.type = QueryTypes.UPDATE;
    options.model = model;

    return this.sequelize.query(sql, options);
  }

  rawSelect(options) {
    const tableName = options.tableName;
    const attributeSelector = options.attributeSelector;
    const Model = options.Model;

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
    const optionsArray = options.optionsArray;

    const sql = this.QueryGenerator.createTrigger(tableName, triggerName, timingType, fireOnArray, functionName, functionParams, optionsArray);
    options = options || {};
    if (sql) {
      return this.sequelize.query(sql, options);
    } else {
      return Promise.resolve();
    }
  }

  dropTrigger(options) {
    const tableName = options.tableName;
    const triggerName = options.triggerName;

    const sql = this.QueryGenerator.dropTrigger(tableName, triggerName);
    options = options || {};

    if (sql) {
      return this.sequelize.query(sql, options);
    } else {
      return Promise.resolve();
    }
  }

  renameTrigger(options) {
    const tableName = options.tableName;
    const oldTriggerName = options.oldTriggerName;
    const newTriggerName = options.newTriggerName;

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
    const functionName = options.functionName;
    const params = options.params;
    const returnType = options.returnType;
    const language = options.language;
    const body = options.body;
    const optionsArray = options.optionsArray;

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
   * @param {Object} options - Options for dropping SQL function
   * @param {String} options.functionName - Name of SQL function to drop
   * @param {Array} options.params - List of parameters declared for SQL function
   *
   * @return {Promise}
   */
  dropFunction(options) {
    const functionName = options.functionName;
    const params = options.params;

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
   * @param {Object} options - Options for renaming SQL function
   * @param {String} options.oldFunctionName - Old name of SQL function
   * @param {Array} options.params - List of parameters declared for SQL function
   * @param {String} options.newFunctionName - New name of SQL function
   *
   * @return {Promise}
   */
  renameFunction(options) {
    const oldFunctionName = options.oldFunctionName;
    const params = options.params;
    const newFunctionName = options.newFunctionName;

    const sql = this.QueryGenerator.renameFunction(oldFunctionName, params, newFunctionName);
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

  setIsolationLevel(options) {
    const transaction = options.transaction;
    const value = options.value;

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

  startTransaction(options) {
    const transaction = options.transaction;

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

  deferConstraints(options) {
    const transaction = options.transaction;

    options = _.assign({}, options, {
      transaction: transaction.parent || transaction
    });

    const sql = this.QueryGenerator.deferConstraintsQuery(options);

    if (sql) {
      return this.sequelize.query(sql, options);
    }

    return Promise.resolve();
  }

  commitTransaction(options) {
    const transaction = options.transaction;

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

  rollbackTransaction(options) {
    const transaction = options.transaction;

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