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
   * @param {Object} options
   * @param {String} options.schema    Schema name to create
   * @param {Object} [options.queryOptions] Query options
   *
   * @return {Promise}
   */
  createSchema(options) {
    const { schema, queryOptions } = options;
    const sql = this.QueryGenerator.createSchema(schema);
    return this.sequelize.query(sql, queryOptions);
  }

  /**
   * Drops a schema
   *
   * @param {Object} options
   * @param {String} options.schema    Schema name to create
   * @param {Object} [options.queryOptions] Query options
   *
   * @return {Promise}
   */
  dropSchema(options) {
    const { schema, queryOptions } = options;
    const sql = this.QueryGenerator.dropSchema(schema);
    return this.sequelize.query(sql, queryOptions);
  }

  /**
   * Drop all schemas
   *
   * @param {Object} options
   * @param {Object} [options.queryOptions] Query options
   *
   * @return {Promise}
   */
  dropAllSchemas(options) {
    const { queryOptions } = options;
    if (!this.QueryGenerator._dialect.supports.schemas) {
      return this.sequelize.drop(queryOptions);
    } else {
      return this.showAllSchemas(options).then(schemaNames => {
        return Promise.all(schemaNames.map(schemaName => this.dropSchema({ schema: schemaName, queryOptions })));
      });
    }
  }

  /**
   * Show all schemas
   *
   * @param {Object} options
   * @param {Object} [options.queryOptions] Query options
   *
   * @return {Promise<Array>}
   */
  showAllSchemas(options) {
    const { queryOptions } = options;
    const showSchemasSql = this.QueryGenerator.showSchemasQuery();
    return this.sequelize.query(showSchemasSql, queryOptions).then(schemaNames => {
      return _.flatten(_.map(schemaNames, value => value.schema_name ? value.schema_name : value));
    });
  }

  /**
   * Returns database version
   *
   * @param {Object} options
   * @param {Object} [options.queryOptions] Query options
   *
   * @returns {Promise}
   * @private
   */
  databaseVersion(options) {
    const { queryOptions } = options;
    return this.sequelize.query(
      this.QueryGenerator.versionQuery(),
      _.assign({}, queryOptions, { type: QueryTypes.VERSION })
    );
  }

  /**
   * Create a table with given set of attributes
   *
   * @param {Object} options
   * @param {String} options.tableName  Name of table to create
   * @param {Object} options.attributes Object representing a list of table attributes to create
   * @param {Object} [options.queryOptions] Query options
   * @param {Model}  [options.model]
   *
   * @return {Promise}
   */
  createTable(options) {
    const { tableName, attributes, queryOptions, model } = options;
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
   * @param {Object} [options.queryOptions] Query options
   *
   * @return {Promise}
   */
  dropTable(options) {
    const { tableName, queryOptions } = options;
    queryOptions = _.clone(queryOptions) || {};
    queryOptions.cascade = queryOptions.cascade || queryOptions.force || false;

    let sql = this.QueryGenerator.dropTableQuery(tableName, queryOptions);

    return this.sequelize.query(sql, queryOptions).then(() => {
      const promises = [];

      if (this.sequelize.options.dialect === 'postgres') {
        const instanceTable = this.sequelize.modelManager.getModel(tableName, { attribute: 'tableName' });

        if (instanceTable) {
          const getTableName = (!queryOptions || !queryOptions.schema || queryOptions.schema === 'public' ? '' : queryOptions.schema + '_') + tableName;

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
   * @param {Object} [options.queryOptions] Query options
   * @param {Array}  [options.skip] List of table to skip
   *
   * @return {Promise}
   */
  dropAllTables(options) {
    const { queryOptions, skip } = options;
    const dropAllTables = tableNames => Promise.each(tableNames, tableName => {
      if (skip.indexOf(tableName.tableName || tableName) === -1) {
        return this.dropTable({ tableName, queryOptions: _.assign({}, queryOptions, { cascade: true }) });
      }
    });

    return this.showAllTables(options).then(tableNames => {
      if (this.sequelize.options.dialect === 'sqlite') {
        return this.sequelize.query('PRAGMA foreign_keys;', queryOptions).then(result => {
          const foreignKeysAreEnabled = result.foreign_keys === 1;

          if (foreignKeysAreEnabled) {
            return this.sequelize.query('PRAGMA foreign_keys = OFF', queryOptions)
              .then(() => dropAllTables(tableNames))
              .then(() => this.sequelize.query('PRAGMA foreign_keys = ON', queryOptions));
          } else {
            return dropAllTables(tableNames);
          }
        });
      } else {
        return this.getForeignKeysForTables(tableNames, queryOptions).then(foreignKeys => {
          const promises = [];

          tableNames.forEach(tableName => {
            let normalizedTableName = tableName;
            if (_.isObject(tableName)) {
              normalizedTableName = tableName.schema + '.' + tableName.tableName;
            }

            foreignKeys[normalizedTableName].forEach(foreignKey => {
              const sql = this.QueryGenerator.dropForeignKeyQuery(tableName, foreignKey);
              promises.push(this.sequelize.query(sql, queryOptions));
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
   * @param {Object} [options.queryOptions] Query options
   *
   * @return {Promise}
   * @private
   */
  dropAllEnums(options) {
    if (this.sequelize.getDialect() !== 'postgres') {
      return Promise.resolve();
    }

    const { queryOptions } = options;
    return this.pgListEnums(null, queryOptions).map(result => this.sequelize.query(
      this.QueryGenerator.pgEnumDrop(null, null, this.QueryGenerator.pgEscapeAndQuote(result.enum_name)),
      _.assign({}, queryOptions, { raw: true })
    ));
  }

  /**
   * List all enums, Postgres Only
   *
   * @param {Object} options
   * @param {String} [options.tableName]  Table whose enum to list
   * @param {Object} [options.queryOptions] Query options
   *
   * @return {Promise}
   * @private
   */
  pgListEnums(options) {
    const { tableName, queryOptions } = options;
    const sql = this.QueryGenerator.pgListEnums(tableName);
    return this.sequelize.query(sql, _.assign({}, queryOptions, { plain: false, raw: true, type: QueryTypes.SELECT }));
  }

  /**
   * Renames a table
   *
   * @param {Object} options
   * @param {String} options.before    Current name of table
   * @param {String} options.after     New name from table
   * @param {Object} [options.queryOptions] Query options
   *
   * @return {Promise}
   */
  renameTable(options) {
    const { before, after, queryOptions } = options;
    const sql = this.QueryGenerator.renameTableQuery(before, after);
    return this.sequelize.query(sql, queryOptions);
  }

  /**
   * Get all tables in current database
   *
   * @param {Object} options
   * @param {Object} [options.queryOptions] Query options
   *
   * @return {Promise<Array>}
   * @private
   */
  showAllTables(options) {
    const { queryOptions } = options;
    const showTablesSql = this.QueryGenerator.showTablesQuery();
    return this.sequelize.query(showTablesSql, queryOptions).then(tableNames => _.flatten(tableNames));
  }

  /**
   * Describe a table structure
   *
   * @param {Object} options
   * @param {String} options.tableName
   * @param {Object} [options.queryOptions] Query options
   *
   * @return {Promise<Object>}
   */
  describeTable(options) {
    const { tableName, queryOptions } = options;
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
   * @param {Object} [options.queryOptions] Query options
   *
   * @return {Promise}
   */
  addColumn(options) {
    const { table, key, attribute, queryOptions } = options;
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
   * @param {Object} [options.queryOptions] Query options
   *
   * @return {Promise}
   */
  removeColumn(options) {
    const { tableName, attributeName, queryOptions } = options;
    switch (this.sequelize.options.dialect) {
      case 'sqlite':
        return SQLiteQueryInterface.removeColumn.call(this, tableName, attributeName, queryOptions);
      case 'mssql':
        return MSSSQLQueryInterface.removeColumn.call(this, tableName, attributeName, queryOptions);
      case 'mysql':
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
   * @param {Object} [options.queryOptions]     Query options
   *
   * @return {Promise}
   */
  changeColumn(options) {
    const { tableName, attributeName, dataTypeOrOptions, queryOptions } = options;
    const attributes = {};
    attributes[attributeName] = dataTypeOrOptions;

    attributes[attributeName].type = this.sequelize.normalizeDataType(attributes[attributeName].type);

    if (this.sequelize.options.dialect === 'sqlite') {
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
   * @param {Object} [options.queryOptions]   Query option
   *
   * @return {Promise}
   */
  renameColumn(options) {
    const { tableName, attrNameBefore, attrNameAfter, queryOptions } = options;
    return this.describeTable({ tableName, queryOptions }).then(data => {
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
   * @param {Object} options.indexOptions
   * @param {Array}   options.indexOptions.fields   List of attributes to add index on
   * @param {Boolean} [options.indexOptions.unique] Create a unique index
   * @param {String}  [options.indexOptions.using]  Useful for GIN indexes
   * @param {String}  [options.indexOptions.type]   Type of index, available options are UNIQUE|FULLTEXT|SPATIAL
   * @param {String}  [options.indexOptions.name]   Name of the index. Default is <table>_<attr1>_<attr2>
   * @param {Object}  [options.indexOptions.where]  Where condition on index, for partial indexes
   * @param {Object} [options.queryOptions] Query options
   *
   * @return {Promise}
   */
  addIndex(options) {
    const { tableName, indexOptions, queryOptions } = options;
    const sql = this.QueryGenerator.addIndexQuery(tableName, indexOptions, tableName);
    return this.sequelize.query(sql, _.assign({}, indexOptions, { supportsSearchPath: false }));
  }

  /**
   * Show indexes on a table
   *
   * @param {Object} options
   * @param {String} options.tableName
   * @param {Object} [options.queryOptions] Query options
   *
   * @return {Promise<Array>}
   * @private
   */
  showIndex(options) {
    const { tableName, queryOptions } = options;
    const sql = this.QueryGenerator.showIndexesQuery(tableName, queryOptions);
    return this.sequelize.query(sql, _.assign({}, queryOptions, { type: QueryTypes.SHOWINDEXES }));
  }

  nameIndexes(indexes, rawTablename) {
    return this.QueryGenerator.nameIndexes(indexes, rawTablename);
  }

  getForeignKeysForTables(tableNames, queryOptions) {
    if (tableNames.length === 0) {
      return Promise.resolve({});
    }

    queryOptions = _.assign({}, queryOptions || {}, { type: QueryTypes.FOREIGNKEYS });

    return Promise.map(tableNames, tableName =>
      this.sequelize.query(this.QueryGenerator.getForeignKeysQuery(tableName, this.sequelize.config.database), queryOptions)
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
   * @param {Object} options
   * @param {String} options.tableName
   * @param {Object} [options.queryOptions] Query options
   *
   * @returns {Promise}
   */
  getForeignKeyReferencesForTable(options) {
    const { tableName, queryOptions } = options;
    const queryOptionsWithType = Object.assign({}, queryOptions, {
      type: QueryTypes.FOREIGNKEYS
    });
    const catalogName = this.sequelize.config.database;
    switch (this.sequelize.options.dialect) {
      case 'sqlite':
        return SQLiteQueryInterface.getForeignKeyReferencesForTable.call(this, tableName, queryOptionsWithType);
      case 'postgres':
      {
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
   * @param {Object} [options.queryOptions]        Query options
   *
   * @return {Promise}
   */
  removeIndex(options) {
    const { tableName, indexNameOrAttributes, queryOptions } = options;
    const sql = this.QueryGenerator.removeIndexQuery(tableName, indexNameOrAttributes);
    return this.sequelize.query(sql, queryOptions);
  }

  /**
   * Add constraints to table
   *
   * @param {Object} options
   * @param {String} options.tableName                  Table name where you want to add a constraint
   * @param {Array}  options.attributes                 Array of column names to apply the constraint over
   * @param {Object} options.constraintOptions          An object to define the constraint name, type etc
   * @param {String} options.constraintOptions.type     Type of constraint. One of the values in available constraints(case insensitive)
   * @param {String} [options.constraintOptions.name]   Name of the constraint. If not specified, sequelize automatically creates a named constraint based on constraint type, table & column names
   * @param {String} [options.constraintOptions.defaultValue] The value for the default constraint
   * @param {Object} [options.constraintOptions.where]  Where clause/expression for the CHECK constraint
   * @param {Object} [options.constraintOptions.references] Object specifying target table, column name to create foreign key constraint
   * @param {String} [options.constraintOptions.references.table] Target table name
   * @param {String} [options.constraintOptions.references.field] Target column name
   * @param {Object} [options.queryOptions]             Query options
   *
   * @return {Promise}
   */
  addConstraint(options) {
    const { tableName, attributes, constraintOptions, queryOptions } = options;
    if (!constraintOptions.type) {
      throw new Error('Constraint type must be specified through options.type');
    }

    constraintOptions.fields = attributes;

    if (this.sequelize.dialect.name === 'sqlite') {
      return SQLiteQueryInterface.addConstraint.call(this, tableName, constraintOptions, tableName);
    } else {
      const sql = this.QueryGenerator.addConstraintQuery(tableName, constraintOptions, tableName);
      return this.sequelize.query(sql, constraintOptions);
    }
  }

  showConstraint(tableName, constraintName, queryOptions) {
    const sql = this.QueryGenerator.showConstraintsQuery(tableName, constraintName);
    return this.sequelize.query(sql, Object.assign({}, queryOptions, { type: QueryTypes.SHOWCONSTRAINTS }));
  }

  /**
   *
   * @param {Object} options
   * @param {String} options.tableName       Table name to drop constraint from
   * @param {String} options.constraintName  Constraint name
   * @param {Object} [options.queryOptions] Query options
   *
   * @return {Promise}
   */
  removeConstraint(options) {
    const { tableName, constraintName, queryOptions } = options;
    switch (this.sequelize.options.dialect) {
      case 'mysql':
        return MySQLQueryInterface.removeConstraint.call(this, tableName, constraintName, queryOptions);
      case 'sqlite':
        return SQLiteQueryInterface.removeConstraint.call(this, tableName, constraintName, queryOptions);
      default:
        const sql = this.QueryGenerator.removeConstraintQuery(tableName, constraintName);
        return this.sequelize.query(sql, queryOptions);
    }
  }

  insert(options) {
    const { instance, tableName, values, queryOptions } = options;
    queryOptions = Utils.cloneDeep(queryOptions);
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
   * @param {Model}  options.model
   * @param {Object} [options.queryOptions]
   *
   * @returns {Promise<created, primaryKey>}
   */
  upsert(options) {
    const { tableName, insertValues, updateValues, where, model, queryOptions } = options;
    const wheres = [];
    const attributes = Object.keys(insertValues);
    let indexes = [];
    let indexFields;

    queryOptions = _.clone(queryOptions);

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
   * @param {Object} [options.queryOptions]        Various options, please see Model.bulkCreate options
   * @param {Object} [options.fieldMappedAttributes] Various attributes mapped by field name
   *
   * @return {Promise}
   */
  bulkInsert(options) {
    const { tableName, records, queryOptions, fieldMappedAttributes } = options;
    queryOptions = _.clone(queryOptions) || {};
    queryOptions.type = QueryTypes.INSERT;

    return this.sequelize.query(
      this.QueryGenerator.bulkInsertQuery(tableName, records, queryOptions, fieldMappedAttributes),
      queryOptions
    ).then(results => results[0]);
  }

  update(options) {
    const { instance, tableName, values, identifier, queryOptions } = options;
    queryOptions = _.clone(queryOptions || {});
    queryOptions.hasTrigger = !!(instance && instance._modelOptions && instance._modelOptions.hasTrigger);

    const sql = this.QueryGenerator.updateQuery(tableName, values, identifier, queryOptions, instance.constructor.rawAttributes);

    queryOptions.type = QueryTypes.UPDATE;

    queryOptions.instance = instance;
    return this.sequelize.query(sql, queryOptions);
  }

  bulkUpdate(options) {
    const { tableName, values, identifier, queryOptions, attributes } = options;
    queryOptions = Utils.cloneDeep(queryOptions);
    if (typeof identifier === 'object') identifier = Utils.cloneDeep(identifier);

    const sql = this.QueryGenerator.updateQuery(tableName, values, identifier, queryOptions, attributes);
    const table = _.isObject(tableName) ? tableName : { tableName };
    const model = _.find(this.sequelize.modelManager.models, { tableName: table.tableName });

    queryOptions.model = model;
    return this.sequelize.query(sql, queryOptions);
  }

  delete(options) {
    const { instance, tableName, identifier, queryOptions } = options;
    const cascades = [];
    const sql = this.QueryGenerator.deleteQuery(tableName, identifier, null, instance.constructor);

    queryOptions = _.clone(queryOptions) || {};

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
   * @param {Object} [options.queryOptions]
   * @param {Model}  [options.model]
   *
   * @return {Promise}
   */
  bulkDelete(options) {
    const { tableName, identifier, queryOptions, model } = options;
    queryOptions = Utils.cloneDeep(queryOptions);
    queryOptions = _.defaults(queryOptions, { limit: null });
    if (typeof identifier === 'object') identifier = Utils.cloneDeep(identifier);

    const sql = this.QueryGenerator.deleteQuery(tableName, identifier, queryOptions, model);
    return this.sequelize.query(sql, queryOptions);
  }

  select(options) {
    const { model, tableName, queryOptions } = options;
    queryOptions = Utils.cloneDeep(queryOptions);
    queryOptions.type = QueryTypes.SELECT;
    queryOptions.model = model;

    return this.sequelize.query(
      this.QueryGenerator.selectQuery(tableName, queryOptions, model),
      queryOptions
    );
  }

  increment(options) {
    const { model, tableName, values, identifier, queryOptions } = options;
    queryOptions = Utils.cloneDeep(queryOptions);

    const sql = this.QueryGenerator.arithmeticQuery('+', tableName, values, identifier, queryOptions, queryOptions.attributes);

    queryOptions.type = QueryTypes.UPDATE;
    queryOptions.model = model;

    return this.sequelize.query(sql, queryOptions);
  }

  decrement(options) {
    const { model, tableName, values, identifier, queryOptions } = options;
    queryOptions = Utils.cloneDeep(queryOptions);

    const sql = this.QueryGenerator.arithmeticQuery('-', tableName, values, identifier, queryOptions, queryOptions.attributes);

    queryOptions.type = QueryTypes.UPDATE;
    queryOptions.model = model;

    return this.sequelize.query(sql, queryOptions);
  }

  rawSelect(options) {
    const { tableName, queryOptions, attributeSelector, Model } = options;
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
    const { tableName, triggerName, timingType, fireOnArray, functionName, functionParams, optionsArray, queryOptions } = options;
    const sql = this.QueryGenerator.createTrigger(tableName, triggerName, timingType, fireOnArray, functionName, functionParams, optionsArray);
    if (sql) {
      return this.sequelize.query(sql, queryOptions);
    } else {
      return Promise.resolve();
    }
  }

  dropTrigger(options) {
    const { tableName, triggerName, queryOptions } = options;
    const sql = this.QueryGenerator.dropTrigger(tableName, triggerName);

    if (sql) {
      return this.sequelize.query(sql, queryOptions);
    } else {
      return Promise.resolve();
    }
  }

  renameTrigger(options) {
    const { tableName, oldTriggerName, newTriggerName, queryOptions } = options;
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
   * @param {String} options.returnType   SQL type of function returned value
   * @param {String} options.language     The name of the language that the function is implemented in
   * @param {String} options.body         Source code of function
   * @param {Array}  options.optionsArray Extra-options for creation
   * @param {Object} [options.queryOptions]
   *
   * @return {Promise}
   */
  createFunction(options) {
    const { functionName, params, returnType, language, body, optionsArray, queryOptions } = options;
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
   * @param {Object} [options.queryOptions]
   *
   * @return {Promise}
   */
  dropFunction(options) {
    const { functionName, params, queryOptions } = options;
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
   * @param {Object} [options.queryOptions]
   *
   * @return {Promise}
   */
  renameFunction(options) {
    const { oldFunctionName, params, newFunctionName, queryOptions } = options;
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
```