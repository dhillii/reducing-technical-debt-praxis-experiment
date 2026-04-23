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
 * Parameter object for createTable
 * @typedef {Object} CreateTableParams
 * @property {String} tableName
 * @property {Object} attributes
 * @property {Object} [options]
 * @property {Model} [model]
 */

/**
 * Parameter object for addConstraint
 * @typedef {Object} AddConstraintParams
 * @property {String} tableName
 * @property {Array} attributes
 * @property {Object} options
 * @property {String} [rawTablename]
 */

/**
 * Parameter object for addIndex
 * @typedef {Object} AddIndexParams
 * @property {String} tableName
 * @property {Array} attributes
 * @property {Object} options
 * @property {String} [rawTablename]
 */

/**
 * Parameter object for upsert
 * @typedef {Object} UpsertParams
 * @property {String} tableName
 * @property {Object} insertValues
 * @property {Object} updateValues
 * @property {Object} where
 * @property {Model} model
 * @property {Object} [options]
 */

/**
 * Parameter object for bulkInsert
 * @typedef {Object} BulkInsertParams
 * @property {String} tableName
 * @property {Array} records
 * @property {Object} [options]
 * @property {Object} [attributes]
 */

/**
 * Parameter object for bulkUpdate
 * @typedef {Object} BulkUpdateParams
 * @property {String|Object} tableName
 * @property {Object} values
 * @property {Object|String} identifier
 * @property {Object} [options]
 * @property {Object} [attributes]
 */

/**
 * Parameter object for bulkDelete
 * @typedef {Object} BulkDeleteParams
 * @property {String} tableName
 * @property {Object} identifier
 * @property {Object} [options]
 * @property {Model} [model]
 */

/**
 * Parameter object for rawSelect
 * @typedef {Object} RawSelectParams
 * @property {String} tableName
 * @property {Object} options
 * @property {String} attributeSelector
 * @property {Model} Model
 */

/**
 * Parameter object for function management
 * @typedef {Object} FunctionParams
 * @property {String} functionName
 * @property {Array} params
 * @property {String} [returnType]
 * @property {String} [language]
 * @property {String} [body]
 * @property {Array} [optionsArray]
 * @property {Object} [options]
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

  // -------------------------------------------------------------------------
  // Schema management
  // -------------------------------------------------------------------------

  createSchema(schema, options) {
    options = options || {};
    const sql = this.QueryGenerator.createSchema(schema);
    return this.sequelize.query(sql, options);
  }

  dropSchema(schema, options) {
    options = options || {};
    const sql = this.QueryGenerator.dropSchema(schema);
    return this.sequelize.query(sql, options);
  }

  dropAllSchemas(options) {
    options = options || {};

    if (!this.QueryGenerator._dialect.supports.schemas) {
      return this.sequelize.drop(options);
    }
    return this.showAllSchemas(options).map(schemaName => this.dropSchema(schemaName, options));
  }

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

  databaseVersion(options) {
    return this.sequelize.query(
      this.QueryGenerator.versionQuery(),
      _.assign({}, options, { type: QueryTypes.VERSION })
    );
  }

  // -------------------------------------------------------------------------
  // Table management
  // -------------------------------------------------------------------------

  /**
   * Create a table using a parameter object.
   * @param {CreateTableParams} params
   * @returns {Promise}
   */
  createTable(params) {
    const { tableName, attributes, options = {}, model } = params;
    const keys = Object.keys(attributes);
    const keyLen = keys.length;
    let sql = '';
    let i = 0;

    const clonedOptions = _.clone(options) || {};

    const normalizedAttributes = _.mapValues(attributes, attribute => {
      if (!_.isPlainObject(attribute)) {
        attribute = { type: attribute, allowNull: true };
      }
      return this.sequelize.normalizeAttribute(attribute);
    });

    if (this.sequelize.options.dialect === 'postgres') {
      return this._handlePostgresCreateTable(tableName, normalizedAttributes, clonedOptions, model, keys, keyLen);
    }

    return this._handleStandardCreateTable(tableName, normalizedAttributes, clonedOptions, model);
  }

  // Backward compatible signature
  createTableLegacy(tableName, attributes, options, model) {
    return this.createTable({ tableName, attributes, options, model });
  }

  _handlePostgresCreateTable(tableName, attributes, options, model, keys, keyLen) {
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
            enumPromises.push(this.sequelize.query(sql, _.assign({}, options, { raw: true })));
          } else if (model) {
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

      if (!tableName.schema && (options.schema || (model && model._schema))) {
        tableName = this.QueryGenerator.addSchema({
          tableName,
          _schema: (model && model._schema) || options.schema
        });
      }

      const sqlAttributes = this.QueryGenerator.attributesToSQL(attributes, { context: 'createTable' });
      const sql = this.QueryGenerator.createTableQuery(tableName, sqlAttributes, options);

      return Promise.all(enumPromises)
        .tap(() => {
          if (enumPromises.length) {
            return this.sequelize.dialect.connectionManager._refreshDynamicOIDs();
          }
        })
        .then(() => this.sequelize.query(sql, options));
    });
  }

  _handleStandardCreateTable(tableName, attributes, options, model) {
    if (!tableName.schema && (options.schema || (model && model._schema))) {
      tableName = this.QueryGenerator.addSchema({
        tableName,
        _schema: (model && model._schema) || options.schema
      });
    }

    const sqlAttributes = this.QueryGenerator.attributesToSQL(attributes, { context: 'createTable' });
    const sql = this.QueryGenerator.createTableQuery(tableName, sqlAttributes, options);
    return this.sequelize.query(sql, options);
  }

  // Backward compatible wrapper
  createTable(tableName, attributes, options, model) {
    return this.createTableLegacy(tableName, attributes, options, model);
  }

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

  // -------------------------------------------------------------------------
  // Table description
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Column management
  // -------------------------------------------------------------------------

  addColumn(table, key, attribute, options) {
    if (!table || !key || !attribute) {
      throw new Error('addColumn takes atleast 3 arguments (table, attribute name, attribute definition)');
    }

    options = options || {};
    attribute = this.sequelize.normalizeAttribute(attribute);
    return this.sequelize.query(this.QueryGenerator.addColumnQuery(table, key, attribute), options);
  }

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

  renameColumn(tableName, attrNameBefore, attrNameAfter, options) {
    options = options || {};
    return this.describeTable(tableName, options).then(data => {
      if (!data[attrNameBefore]) {
        throw new Error('Table ' + tableName + ' doesn\'t have the column ' + attrNameBefore);
      }

      const columnInfo = data[attrNameBefore] || {};

      const _options = {};
      _options[attrNameAfter] = {
        attribute: attrNameAfter,
        type: columnInfo.type,
        allowNull: columnInfo.allowNull,
        defaultValue: columnInfo.defaultValue
      };

      if (columnInfo.defaultValue === null && !columnInfo.allowNull) {
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

  // -------------------------------------------------------------------------
  // Index management
  // -------------------------------------------------------------------------

  /**
   * Add an index using a parameter object.
   * @param {AddIndexParams} params
   * @returns {Promise}
   */
  addIndex(params) {
    const { tableName, attributes, options, rawTablename } = params;
    let opts = Utils.cloneDeep(options);
    opts.fields = attributes;
    const sql = this.QueryGenerator.addIndexQuery(tableName, opts, rawTablename);
    return this.sequelize.query(sql, _.assign({}, opts, { supportsSearchPath: false }));
  }

  // Backward compatible wrapper
  addIndexLegacy(tableName, attributes, options, rawTablename) {
    if (!Array.isArray(attributes)) {
      rawTablename = options;
      options = attributes;
      attributes = options.fields;
    }
    if (!rawTablename) {
      rawTablename = tableName;
    }
    return this.addIndex({ tableName, attributes, options, rawTablename });
  }

  showIndex(tableName, options) {
    const sql = this.QueryGenerator.showIndexesQuery(tableName, options);
    return this.sequelize.query(sql, _.assign({}, options, { type: QueryTypes.SHOWINDEXES }));
  }

  nameIndexes(indexes, rawTablename) {
    return this.QueryGenerator.nameIndexes(indexes, rawTablename);
  }

  // -------------------------------------------------------------------------
  // Constraint management
  // -------------------------------------------------------------------------

  /**
   * Add a constraint using a parameter object.
   * @param {AddConstraintParams} params
   * @returns {Promise}
   */
  addConstraint(params) {
    const { tableName, attributes, options, rawTablename } = params;
    const opts = Utils.cloneDeep(options);
    opts.fields = attributes;

    if (this.sequelize.dialect.name === 'sqlite') {
      return SQLiteQueryInterface.addConstraint.call(this, tableName, opts, rawTablename);
    }

    const sql = this.QueryGenerator.addConstraintQuery(tableName, opts, rawTablename);
    return this.sequelize.query(sql, opts);
  }

  // Backward compatible wrapper
  addConstraintLegacy(tableName, attributes, options, rawTablename) {
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
    return this.addConstraint({ tableName, attributes, options, rawTablename });
  }

  showConstraint(tableName, constraintName, options) {
    const sql = this.QueryGenerator.showConstraintsQuery(tableName, constraintName);
    return this.sequelize.query(sql, Object.assign({}, options, { type: QueryTypes.SHOWCONSTRAINTS }));
  }

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

  // -------------------------------------------------------------------------
  // Data manipulation
  // -------------------------------------------------------------------------

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
   * Upsert using a parameter object.
   * @param {UpsertParams} params
   * @returns {Promise}
   */
  upsert(params) {
    const { tableName, insertValues, updateValues, where, model, options = {} } = params;
    const wheres = [];
    const attributes = Object.keys(insertValues);
    let indexes = [];
    let indexFields;

    const clonedOptions = _.clone(options);

    if (!Utils.isWhereEmpty(where)) {
      wheres.push(where);
    }

    indexes = _.map(model.options.uniqueKeys, value => value.fields);

    _.each(model.options.indexes, value => {
      if (value.unique) {
        indexFields = _.map(value.fields, field => _.isPlainObject(field) ? field.attribute : field);
        indexes.push(indexFields);
      }
    });

    for (const index of indexes) {
      if (_.intersection(attributes, index).length === index.length) {
        const whereClause = {};
        for (const field of index) {
          whereClause[field] = insertValues[field];
        }
        wheres.push(whereClause);
      }
    }

    const finalWhere = { [Op.or]: wheres };
    clonedOptions.type = QueryTypes.UPSERT;
    clonedOptions.raw = true;

    const sql = this.QueryGenerator.upsertQuery(tableName, insertValues, updateValues, finalWhere, model, clonedOptions);
    return this.sequelize.query(sql, clonedOptions).then(result => {
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

  // Backward compatible wrapper
  upsertLegacy(tableName, insertValues, updateValues, where, model, options) {
    return this.upsert({ tableName, insertValues, updateValues, where, model, options });
  }

  bulkInsert(params) {
    const { tableName, records, options = {}, attributes } = params;
    const clonedOptions = _.clone(options) || {};
    clonedOptions.type = QueryTypes.INSERT;

    return this.sequelize.query(
      this.QueryGenerator.bulkInsertQuery(tableName, records, clonedOptions, attributes),
      clonedOptions
    ).then(results => results[0]);
  }

  bulkInsertLegacy(tableName, records, options, attributes) {
    return this.bulkInsert({ tableName, records, options, attributes });
  }

  update(instance, tableName, values, identifier, options) {
    options = _.clone(options || {});
    options.hasTrigger = !!(instance && instance._modelOptions && instance._modelOptions.hasTrigger);

    const sql = this.QueryGenerator.updateQuery(tableName, values, identifier, options, instance.constructor.rawAttributes);

    options.type = QueryTypes.UPDATE;
    options.instance = instance;
    return this.sequelize.query(sql, options);
  }

  bulkUpdate(params) {
    const { tableName, values, identifier, options = {}, attributes } = params;
    const clonedOptions = Utils.cloneDeep(options);
    if (typeof identifier === 'object') identifier = Utils.cloneDeep(identifier);

    const sql = this.QueryGenerator.updateQuery(tableName, values, identifier, clonedOptions, attributes);
    const table = _.isObject(tableName) ? tableName : { tableName };
    const model = _.find(this.sequelize.modelManager.models, { tableName: table.tableName });

    clonedOptions.model = model;
    return this.sequelize.query(sql, clonedOptions);
  }

  bulkUpdateLegacy(tableName, values, identifier, options, attributes) {
    return this.bulkUpdate({ tableName, values, identifier, options, attributes });
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
        if (!instances) return Promise.resolve();
        if (!Array.isArray(instances)) instances = [instances];
        return Promise.each(instances, instance => instance.destroy(options));
      });
    }).then(() => {
      options.instance = instance;
      return this.sequelize.query(sql, options);
    });
  }

  bulkDelete(params) {
    const { tableName, identifier, options = {}, model } = params;
    const clonedOptions = Utils.cloneDeep(options);
    clonedOptions.limit = clonedOptions.limit || null;
    const id = typeof identifier === 'object' ? Utils.cloneDeep(identifier) : identifier;
    const sql = this.QueryGenerator.deleteQuery(tableName, id, clonedOptions, model);
    return this.sequelize.query(sql, clonedOptions);
  }

  bulkDeleteLegacy(tableName, identifier, options, model) {
    return this.bulkDelete({ tableName, identifier, options, model });
  }

  select(model, tableName, options) {
    const clonedOptions = Utils.cloneDeep(options);
    clonedOptions.type = QueryTypes.SELECT;
    clonedOptions.model = model;

    return this.sequelize.query(
      this.QueryGenerator.selectQuery(tableName, clonedOptions, model),
      clonedOptions
    );
  }

  increment(model, tableName, values, identifier, options) {
    const clonedOptions = Utils.cloneDeep(options);
    const sql = this.QueryGenerator.arithmeticQuery('+', tableName, values, identifier, clonedOptions, clonedOptions.attributes);
    clonedOptions.type = QueryTypes.UPDATE;
    clonedOptions.model = model;
    return this.sequelize.query(sql, clonedOptions);
  }

  decrement(model, tableName, values, identifier, options) {
    const clonedOptions = Utils.cloneDeep(options);
    const sql = this.QueryGenerator.arithmeticQuery('-', tableName, values, identifier, clonedOptions, clonedOptions.attributes);
    clonedOptions.type = QueryTypes.UPDATE;
    clonedOptions.model = model;
    return this.sequelize.query(sql, clonedOptions);
  }

  rawSelect(params) {
    const { tableName, options, attributeSelector, Model } = params;
    let finalTableName = tableName;

    if (options.schema) {
      finalTableName = this.QueryGenerator.addSchema({
        tableName,
        _schema: options.schema
      });
    }

    const clonedOptions = Utils.cloneDeep(options);
    const mergedOptions = _.defaults(clonedOptions, {
      raw: true,
      plain: true,
      type: QueryTypes.SELECT
    });

    const sql = this.QueryGenerator.selectQuery(finalTableName, mergedOptions, Model);

    if (attributeSelector === undefined) {
      throw new Error('Please pass an attribute selector!');
    }

    return this.sequelize.query(sql, mergedOptions).then(data => {
      if (!mergedOptions.plain) {
        return data;
      }

      let result = data ? data[attributeSelector] : null;

      if (mergedOptions && mergedOptions.dataType) {
        const dataType = mergedOptions.dataType;

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

  rawSelectLegacy(tableName, options, attributeSelector, Model) {
    return this.rawSelect({ tableName, options, attributeSelector, Model });
  }

  // -------------------------------------------------------------------------
  // Trigger and function management
  // -------------------------------------------------------------------------

  createTrigger(params) {
    const { tableName, triggerName, timingType, fireOnArray, functionName, functionParams, optionsArray, options } = params;
    const sql = this.QueryGenerator.createTrigger(tableName, triggerName, timingType, fireOnArray, functionName, functionParams, optionsArray);
    const opts = options || {};
    if (sql) {
      return this.sequelize.query(sql, opts);
    }
    return Promise.resolve();
  }

  dropTrigger(params) {
    const { tableName, triggerName, options } = params;
    const sql = this.QueryGenerator.dropTrigger(tableName, triggerName);
    const opts = options || {};
    if (sql) {
      return this.sequelize.query(sql, opts);
    }
    return Promise.resolve();
  }

  renameTrigger(params) {
    const { tableName, oldTriggerName, newTriggerName, options } = params;
    const sql = this.QueryGenerator.renameTrigger(tableName, oldTriggerName, newTriggerName);
    const opts = options || {};
    if (sql) {
      return this.sequelize.query(sql, opts);
    }
    return Promise.resolve();
  }

  createFunction(params) {
    const { functionName, params: fnParams, returnType, language, body, optionsArray, options } = params;
    const sql = this.QueryGenerator.createFunction(functionName, fnParams, returnType, language, body, optionsArray);
    const opts = options || {};
    if (sql) {
      return this.sequelize.query(sql, opts);
    }
    return Promise.resolve();
  }

  dropFunction(params) {
    const { functionName, params: fnParams, options } = params;
    const sql = this.QueryGenerator.dropFunction(functionName, fnParams);
    const opts = options || {};
    if (sql) {
      return this.sequelize.query(sql, opts);
    }
    return Promise.resolve();
  }

  renameFunction(params) {
    const { oldFunctionName, params: fnParams, newFunctionName, options } = params;
    const sql = this.QueryGenerator.renameFunction(oldFunctionName, fnParams, newFunctionName);
    const opts = options || {};
    if (sql) {
      return this.sequelize.query(sql, opts);
    }
    return Promise.resolve();
  }

  // -------------------------------------------------------------------------
  // Helper methods
  // -------------------------------------------------------------------------

  quoteIdentifier(identifier, force) {
    return this.QueryGenerator.quoteIdentifier(identifier, force);
  }

  quoteTable(identifier) {
    return this.QueryGenerator.quoteTable(identifier);
  }

  quoteIdentifiers(identifiers, force) {
    return this.QueryGenerator.quoteIdentifiers(identifiers, force);
  }

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

// Backward compatible method aliases
QueryInterface.prototype.createTable = QueryInterface.prototype.createTableLegacy;
QueryInterface.prototype.addIndex = QueryInterface.prototype.addIndexLegacy;
QueryInterface.prototype.addConstraint = QueryInterface.prototype.addConstraintLegacy;
QueryInterface.prototype.upsert = QueryInterface.prototype.upsertLegacy;
QueryInterface.prototype.bulkInsert = QueryInterface.prototype.bulkInsertLegacy;
QueryInterface.prototype.bulkUpdate = QueryInterface.prototype.bulkUpdateLegacy;
QueryInterface.prototype.bulkDelete = QueryInterface.prototype.bulkDeleteLegacy;
QueryInterface.prototype.rawSelect = QueryInterface.prototype.rawSelectLegacy;

module.exports = QueryInterface;
module.exports.QueryInterface = QueryInterface;
module.exports.default = QueryInterface;