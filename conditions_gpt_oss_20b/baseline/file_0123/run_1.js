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

  /* Schema methods */

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
    } else {
      return this.showAllSchemas(options).map(schemaName => this.dropSchema(schemaName, options));
    }
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

  /* Table methods */

  async createTable(tableName, attributes, options, model) {
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
      const { promises, sql: enumSql } = await this._handlePostgresEnums(tableName, attributes, options, model);
      await Promise.all(promises);
      await this.sequelize.dialect.connectionManager._refreshDynamicOIDs();
      return this.sequelize.query(enumSql, options);
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

  async _handlePostgresEnums(tableName, attributes, options, model) {
    const promises = [];
    const enumPromises = [];
    const keys = Object.keys(attributes);
    const keyLen = keys.length;

    for (let i = 0; i < keyLen; i++) {
      const attribute = attributes[keys[i]];
      const type = attribute.type;

      if (
        type instanceof DataTypes.ENUM ||
        (type instanceof DataTypes.ARRAY && type.type instanceof DataTypes.ENUM)
      ) {
        const sql = this.QueryGenerator.pgListEnums(tableName, attribute.field || keys[i], options);
        enumPromises.push(this.sequelize.query(
          sql,
          _.assign({}, options, { plain: true, raw: true, type: QueryTypes.SELECT })
        ));
      }
    }

    const results = await Promise.all(enumPromises);
    let enumIdx = 0;

    for (let i = 0; i < keyLen; i++) {
      const attribute = attributes[keys[i]];
      const type = attribute.type;
      const enumType = type.type || type;

      if (
        type instanceof DataTypes.ENUM ||
        (type instanceof DataTypes.ARRAY && enumType instanceof DataTypes.ENUM)
      ) {
        if (!results[enumIdx]) {
          const sql = this.QueryGenerator.pgEnum(tableName, attribute.field || keys[i], enumType, options);
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
              } else if (vals[idx - 1]) {
                valueOptions.after = vals[idx - 1];
              }
              valueOptions.supportsSearchPath = false;
              promises.push(this.sequelize.query(
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
    const sql = this.QueryGenerator.createTableQuery(tableName, attributes, options);

    return { promises, sql };
  }

  dropTable(tableName, options) {
    options = _.clone(options) || {};
    options.cascade = options.cascade || options.force || false;

    const sql = this.QueryGenerator.dropTableQuery(tableName, options);

    return this.sequelize.query(sql, options).then(() => this._dropPostgresEnums(tableName, options));
  }

  async _dropPostgresEnums(tableName, options) {
    const instanceTable = this.sequelize.modelManager.getModel(tableName, { attribute: 'tableName' });

    if (!instanceTable) return;

    const getTableName = (!options || !options.schema || options.schema === 'public' ? '' : options.schema + '_') + tableName;

    const keys = Object.keys(instanceTable.rawAttributes);
    const keyLen = keys.length;

    const promises = [];

    for (let i = 0; i < keyLen; i++) {
      if (instanceTable.rawAttributes[keys[i]].type instanceof DataTypes.ENUM) {
        const sql = this.QueryGenerator.pgEnumDrop(getTableName, keys[i]);
        options.supportsSearchPath = false;
        promises.push(this.sequelize.query(sql, _.assign({}, options, { raw: true })));
      }
    }

    return Promise.all(promises).get(0);
  }

  dropAllTables(options) {
    options = options || {};
    const skip = options.skip || [];

    const dropAllTables = tableNames => Promise.each(tableNames, tableName => {
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
              .then(() => this._dropAllTables(tableNames, {}, options))
              .then(() => this.sequelize.query('PRAGMA foreign_keys = ON', options));
          } else {
            return this._dropAllTables(tableNames, {}, options);
          }
        });
      } else {
        return this.getForeignKeysForTables(tableNames, options).then(foreignKeys => this._dropAllTables(tableNames, foreignKeys, options));
      }
    });
  }

  async _dropAllTables(tableNames, foreignKeys, options) {
    const promises = [];

    for (const tableName of tableNames) {
      let normalizedTableName = tableName;
      if (_.isObject(tableName)) {
        normalizedTableName = tableName.schema + '.' + tableName.tableName;
      }

      (foreignKeys[normalizedTableName] || []).forEach(foreignKey => {
        const sql = this.QueryGenerator.dropForeignKeyQuery(tableName, foreignKey);
        promises.push(this.sequelize.query(sql, options));
      });
    }

    await Promise.all(promises);
    return Promise.each(tableNames, tableName => this.dropTable(tableName, _.assign({}, options, { cascade: true })));
  }

  /* Constraint methods */

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
    } else {
      const sql = this.QueryGenerator.addConstraintQuery(tableName, options, rawTablename);
      return this.sequelize.query(sql, options);
    }
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

  /* Column methods */

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
    } else {
      const query = this.QueryGenerator.attributesToSQL(attributes);
      const sql = this.QueryGenerator.changeColumnQuery(tableName, query);

      return this.sequelize.query(sql, options);
    }
  }

  async renameColumn(tableName, attrNameBefore, attrNameAfter, options) {
    options = options || {};
    const data = await this.describeTable(tableName, options);
    if (!data[attrNameBefore]) {
      throw new Error(`Table ${tableName} doesn\'t have the column ${attrNameBefore}`);
    }

    const attrData = data[attrNameBefore] || {};

    const _options = {};

    _options[attrNameAfter] = {
      attribute: attrNameAfter,
      type: attrData.type,
      allowNull: attrData.allowNull,
      defaultValue: attrData.defaultValue
    };

    if (attrData.defaultValue === null && !attrData.allowNull) {
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
  }

  /* Index methods */

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

  showIndex(tableName, options) {
    const sql = this.QueryGenerator.showIndexesQuery(tableName, options);
    return this.sequelize.query(sql, _.assign({}, options, { type: QueryTypes.SHOWINDEXES }));
  }

  nameIndexes(indexes, rawTablename) {
    return this.QueryGenerator.nameIndexes(indexes, rawTablename);
  }

  removeIndex(tableName, indexNameOrAttributes, options) {
    options = options || {};
    const sql = this.QueryGenerator.removeIndexQuery(tableName, indexNameOrAttributes);
    return this.sequelize.query(sql, options);
  }

  /* Foreign key methods */

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

  getForeignKeyReferencesForTable(tableName, options) {
    const queryOptions = Object.assign({}, options, {
      type: QueryTypes.FOREIGNKEYS
    });
    const dialect = this.sequelize.options.dialect;

    if (dialect === 'sqlite') {
      return SQLiteQueryInterface.getForeignKeyReferencesForTable.call(this, tableName, queryOptions);
    }

    const catalogName = this.sequelize.config.database;

    if (dialect === 'postgres') {
      const query = this.QueryGenerator.getForeignKeyReferencesQuery(tableName, catalogName);
      return this.sequelize.query(query, queryOptions)
        .then(result => result.map(Utils.camelizeObjectKeys));
    }

    const query = this.QueryGenerator.getForeignKeysQuery(tableName, catalogName);
    return this.sequelize.query(query, queryOptions);
  }

  /* CRUD methods */

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

  async upsert(tableName, insertValues, updateValues, where, model, options) {
    const wheres = [];
    const attributes = Object.keys(insertValues);
    let indexes = [];
    let indexFields;

    options = _.clone(options);

    if (!Utils.isWhereEmpty(where)) {
      wheres.push(where);
    }

    indexes = _.map(model.options.uniqueKeys, value => value.fields);

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
    const result = await this.sequelize.query(sql, options);

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
  }

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

  bulkDelete(tableName, identifier, options, model) {
    options = Utils.cloneDeep(options);
    options = _.defaults(options, {limit: null});
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

  /* Trigger methods */

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

  /* Function methods */

  createFunction(functionName, params, returnType, language, body, optionsArray, options) {
    const sql = this.QueryGenerator.createFunction(functionName, params, returnType, language, body, optionsArray);
    options = options || {};

    if (sql) {
      return this.sequelize.query(sql, options);
    } else {
      return Promise.resolve();
    }
  }

  dropFunction(functionName, params, options) {
    const sql = this.QueryGenerator.dropFunction(functionName, params);
    options = options || {};

    if (sql) {
      return this.sequelize.query(sql, options);
    } else {
      return Promise.resolve();
    }
  }

  renameFunction(oldFunctionName, params, newFunctionName, options) {
    const sql = this.QueryGenerator.renameFunction(oldFunctionName, params, newFunctionName);
    options = options || {};

    if (sql) {
      return this.sequelize.query(sql, options);
    } else {
      return Promise.resolve();
    }
  }

  /* Helper methods */

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

  /* Transaction methods */

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
    if (!transaction || !transaction instanceof Transaction) {
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