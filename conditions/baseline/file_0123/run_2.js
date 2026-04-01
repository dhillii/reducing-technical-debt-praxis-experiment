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

  _normalizeCreateTableAttributes(attributes) {
    return _.mapValues(attributes, attribute => {
      if (!_.isPlainObject(attribute)) {
        attribute = { type: attribute, allowNull: true };
      }

      attribute = this.sequelize.normalizeAttribute(attribute);

      return attribute;
    });
  }

  _processPostgresEnums(tableName, attributes, options, model, keys) {
    const promises = [];
    const keyLen = keys.length;
    let sql = '';
    let i = 0;

    for (i = 0; i < keyLen; i++) {
      const attribute = attributes[keys[i]];
      const type = attribute.type;

      if (
        type instanceof DataTypes.ENUM ||
        (type instanceof DataTypes.ARRAY && type.type instanceof DataTypes.ENUM)
      ) {
        sql = this.QueryGenerator.pgListEnums(tableName, attribute.field || keys[i], options);
        promises.push(this.sequelize.query(
          sql,
          _.assign({}, options, { plain: true, raw: true, type: QueryTypes.SELECT })
        ));
      }
    }

    return promises;
  }

  _handlePostgresEnumResults(results, tableName, attributes, options, model, keys) {
    const promises = [];
    let enumIdx = 0;
    const keyLen = keys.length;
    let i = 0;
    let sql = '';

    for (i = 0; i < keyLen; i++) {
      const attribute = attributes[keys[i]];
      const type = attribute.type;
      const enumType = type.type || type;

      if (
        type instanceof DataTypes.ENUM ||
        (type instanceof DataTypes.ARRAY && enumType instanceof DataTypes.ENUM)
      ) {
        if (!results[enumIdx]) {
          sql = this.QueryGenerator.pgEnum(tableName, attribute.field || keys[i], enumType, options);
          promises.push(this.sequelize.query(
            sql,
            _.assign({}, options, { raw: true })
          ));
        } else if (!!results[enumIdx] && !!model) {
          this._addMissingEnumValues(promises, results[enumIdx], enumType, tableName, attribute, keys[i], options);
          enumIdx++;
        }
      }
    }

    return promises;
  }

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

  _prepareTableNameWithSchema(tableName, options, model) {
    if (!tableName.schema &&
      (options.schema || !!model && model._schema)) {
      return this.QueryGenerator.addSchema({
        tableName,
        _schema: !!model && model._schema || options.schema
      });
    }
    return tableName;
  }

  _createTablePostgres(tableName, attributes, options, model) {
    const keys = Object.keys(attributes);
    const keyLen = keys.length;

    const enumPromises = this._processPostgresEnums(tableName, attributes, options, model, keys);

    return Promise.all(enumPromises).then(results => {
      const promises = this._handlePostgresEnumResults(results, tableName, attributes, options, model, keys);

      tableName = this._prepareTableNameWithSchema(tableName, options, model);

      const attributesSql = this.QueryGenerator.attributesToSQL(attributes, {
        context: 'createTable'
      });
      const sql = this.QueryGenerator.createTableQuery(tableName, attributesSql, options);

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
  }

  _createTableDefault(tableName, attributes, options, model) {
    tableName = this._prepareTableNameWithSchema(tableName, options, model);

    const attributesSql = this.QueryGenerator.attributesToSQL(attributes, {
      context: 'createTable'
    });
    const sql = this.QueryGenerator.createTableQuery(tableName, attributesSql, options);

    return this.sequelize.query(sql, options);
  }

  /**
   * Create a table with given set of attributes
   *
   * ```js
   * queryInterface.createTable(
   *   'nameOfTheNewTable',
   *   {
   *     id: {
   *       type: Sequelize.INTEGER,
   *       primaryKey: true,
   *       autoIncrement: true
   *     },
   *     createdAt: {
   *       type: Sequelize.DATE
   *     },
   *     updatedAt: {
   *       type: Sequelize.DATE
   *     },
   *     attr1: Sequelize.STRING,
   *     attr2: Sequelize.INTEGER,
   *     attr3: {
   *       type: Sequelize.BOOLEAN,
   *       defaultValue: false,
   *       allowNull: false
   *     },
   *     //foreign key usage
   *     attr4: {
   *       type: Sequelize.INTEGER,
   *       references: {
   *         model: 'another_table_name',
   *         key: 'id'
   *       },
   *       onUpdate: 'cascade',
   *       onDelete: 'cascade'
   *     }
   *   },
   *   {
   *     engine: 'MYISAM',    // default: 'InnoDB'
   *     charset: 'latin1',   // default: null
   *     schema: 'public'     // default: public, PostgreSQL only.
   *   }
   * )
   * ```
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

    attributes = this._normalizeCreateTableAttributes(attributes);

    if (this.sequelize.options.dialect === 'postgres') {
      return this._createTablePostgres(tableName, attributes, options, model);
    } else {
      return this._createTableDefault(tableName, attributes, options, model);
    }
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

    let sql = this.QueryGenerator.dropTableQuery(tableName, options);

    return this.sequelize.query(sql, options).then(() => {
      const promises = [];

      if (this.sequelize.options.dialect === 'postgres') {
        this._dropPostgresEnums(tableName, options, promises);
      }

      return Promise.all(promises).get(0);
    });
  }

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

  _dropAllTablesForDialect(tableNames, options, skip) {
    const dropAllTables = tableNames => Promise.each(tableNames, tableName => {
      if (skip.indexOf(tableName.tableName || tableName) === -1) {
        return this.dropTable(tableName, _.assign({}, options, { cascade: true }));
      }
    });

    if (this.sequelize.options.dialect === 'sqlite') {
      return this._dropAllTablesSqlite(tableNames, options, dropAllTables);
    } else {
      return this._dropAllTablesDefault(tableNames, options, dropAllTables);
    }
  }

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

  _dropAllTablesDefault(tableNames, options, dropAllTables) {
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
    const skip = options.skip || [];

    return this.showAllTables(options).then(tableNames => {
      return this._dropAllTablesForDialect(tableNames, options, skip);
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
   * @param {String} before    Current name