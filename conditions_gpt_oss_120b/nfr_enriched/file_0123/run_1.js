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

    return this.sequelize.query(showSchemasSql, options).then(schemaNames =>
      _.flatten(_.map(schemaNames, value => value.schema_name ? value.schema_name : value))
    );
  }

  databaseVersion(options) {
    return this.sequelize.query(
      this.QueryGenerator.versionQuery(),
      _.assign({}, options, { type: QueryTypes.VERSION })
    );
  }

  // -------------------------------------------------------------------------
  // Table creation
  // -------------------------------------------------------------------------

  createTable(tableName, attributes, options, model) {
    options = _.clone(options) || {};

    attributes = _.mapValues(attributes, attribute => {
      if (!_.isPlainObject(attribute)) {
        attribute = { type: attribute, allowNull: true };
      }
      return this.sequelize.normalizeAttribute(attribute);
    });

    if (this.sequelize.options.dialect === 'postgres') {
      return this._createTablePostgres(tableName, attributes, options, model);
    }

    return this._createTableGeneric(tableName, attributes, options, model);
  }

  _createTableGeneric(tableName, attributes, options, model) {
    if (!tableName.schema && (options.schema || (model && model._schema))) {
      tableName = this.QueryGenerator.addSchema({
        tableName,
        _schema: (model && model._schema) || options.schema
      });
    }

    attributes = this.QueryGenerator.attributesToSQL(attributes, { context: 'createTable' });
    const sql = this.QueryGenerator.createTableQuery(tableName, attributes, options);
    return this.sequelize.query(sql, options);
  }

  _createTablePostgres(tableName, attributes, options, model) {
    const enumPromises = this._collectEnumPromises(attributes, options);
    return Promise.all(enumPromises).then(enumResults => {
      const enumCreationPromises = this._processEnumResults(enumResults, attributes, options, model);
      return Promise.all(enumCreationPromises).then(() => {
        if (!tableName.schema && (options.schema || (model && model._schema))) {
          tableName = this.QueryGenerator.addSchema({
            tableName,
            _schema: (model && model._schema) || options.schema
          });
        }
        attributes = this.QueryGenerator.attributesToSQL(attributes, { context: 'createTable' });
        const sql = this.QueryGenerator.createTableQuery(tableName, attributes, options);
        return this.sequelize.query(sql, options);
      });
    });
  }

  _collectEnumPromises(attributes, options) {
    const promises = [];
    const keys = Object.keys(attributes);
    for (let i = 0; i < keys.length; i++) {
      const attribute = attributes[keys[i]];
      const type = attribute.type;
      if (type instanceof DataTypes.ENUM ||
        (type instanceof DataTypes.ARRAY && type.type instanceof DataTypes.ENUM)) {
        const sql = this.QueryGenerator.pgListEnums(
          null,
          attribute.field || keys[i],
          options
        );
        promises.push(this.sequelize.query(
          sql,
          _.assign({}, options, { plain: true, raw: true, type: QueryTypes.SELECT })
        ));
      }
    }
    return promises;
  }

  _processEnumResults(results, attributes, options, model) {
    const promises = [];
    const keys = Object.keys(attributes);
    let enumIdx = 0;

    for (let i = 0; i < keys.length; i++) {
      const attribute = attributes[keys[i]];
      const type = attribute.type;
      const enumType = type.type || type;

      if (type instanceof DataTypes.ENUM ||
        (type instanceof DataTypes.ARRAY && enumType instanceof DataTypes.ENUM)) {
        if (!results[enumIdx]) {
          const sql = this.QueryGenerator.pgEnum(
            null,
            attribute.field || keys[i],
            enumType,
            options
          );
          promises.push(this.sequelize.query(sql, _.assign({}, options, { raw: true })));
        } else if (model) {
          const existingVals = this.QueryGenerator.fromArray(results[enumIdx].enum_value);
          const definedVals = enumType.values;
          definedVals.forEach((value, idx) => {
            const valueOptions = _.clone(options);
            valueOptions.before = null;
            valueOptions.after = null;

            if (existingVals.indexOf(value) === -1) {
              if (definedVals[idx + 1]) {
                valueOptions.before = definedVals[idx + 1];
              } else if (definedVals[idx - 1]) {
                valueOptions.after = definedVals[idx - 1];
              }
              valueOptions.supportsSearchPath = false;
              const sql = this.QueryGenerator.pgEnumAdd(
                null,
                attribute.field || keys[i],
                value,
                valueOptions
              );
              promises.push(this.sequelize.query(sql, valueOptions));
            }
          });
        }
        enumIdx++;
      }
    }

    if (promises.length) {
      promises.push(() => this.sequelize.dialect.connectionManager._refreshDynamicOIDs());
    }

    return promises;
  }

  // -------------------------------------------------------------------------
  // Table removal
  // -------------------------------------------------------------------------

  dropTable(tableName, options) {
    options = _.clone(options) || {};
    options.cascade = options.cascade || options.force || false;

    const sql = this.QueryGenerator.dropTableQuery(tableName, options);
    return this.sequelize.query(sql, options).then(() => {
      if (this.sequelize.options.dialect !== 'postgres') {
        return Promise.resolve();
      }
      return this._dropPostgresEnums(tableName, options);
    });
  }

  _dropPostgresEnums(tableName, options) {
    const instanceTable = this.sequelize.modelManager.getModel(tableName, { attribute: 'tableName' });
    if (!instanceTable) return Promise.resolve();

    const schemaPrefix = (!options || !options.schema || options.schema === 'public') ? '' : options.schema + '_';
    const fullTableName = schemaPrefix + tableName;
    const promises = [];

    const keys = Object.keys(instanceTable.rawAttributes);
    for (let i = 0; i < keys.length; i++) {
      if (instanceTable.rawAttributes[keys[i]].type instanceof DataTypes.ENUM) {
        const sql = this.QueryGenerator.pgEnumDrop(fullTableName, keys[i]);
        promises.push(this.sequelize.query(sql, _.assign({}, options, { raw: true, supportsSearchPath: false })));
      }
    }
    return Promise.all(promises).get(0);
  }

  dropAllTables(options) {
    options = options || {};
    const skip = options.skip || [];

    const dropAll = tableNames => Promise.each(tableNames, tn => {
      const name = tn.tableName || tn;
      if (skip.indexOf(name) === -1) {
        return this.dropTable(tn, _.assign({}, options, { cascade: true }));
      }
    });

    return this.showAllTables(options).then(tableNames => {
      if (this.sequelize.options.dialect === 'sqlite') {
        return this._dropAllTablesSQLite(tableNames, options, dropAll);
      }
      return this._dropAllTablesWithFKs(tableNames, options, dropAll);
    });
  }

  _dropAllTablesSQLite(tableNames, options, dropAll) {
    return this.sequelize.query('PRAGMA foreign_keys;', options).then(result => {
      const enabled = result.foreign_keys === 1;
      if (!enabled) return dropAll(tableNames);
      return this.sequelize.query('PRAGMA foreign_keys = OFF', options)
        .then(() => dropAll(tableNames))
        .then(() => this.sequelize.query('PRAGMA foreign_keys = ON', options));
    });
  }

  _dropAllTablesWithFKs(tableNames, options, dropAll) {
    return this.getForeignKeysForTables(tableNames, options).then(foreignKeys => {
      const promises = [];

      tableNames.forEach(tn => {
        let normalized = tn;
        if (_.isObject(tn)) normalized = tn.schema + '.' + tn.tableName;
        foreignKeys[normalized].forEach(fk => {
          const sql = this.QueryGenerator.dropForeignKeyQuery(tn, fk);
          promises.push(this.sequelize.query(sql, options));
        });
      });

      return Promise.all(promises).then(() => dropAll(tableNames));
    });
  }

  // -------------------------------------------------------------------------
  // Misc table utilities
  // -------------------------------------------------------------------------

  dropAllEnums(options) {
    if (this.sequelize.getDialect() !== 'postgres') {
      return Promise.resolve();
    }
    options = options || {};
    return this.pgListEnums(null, options).map(res =>
      this.sequelize.query(
        this.QueryGenerator.pgEnumDrop(null, null, this.QueryGenerator.pgEscapeAndQuote(res.enum_name)),
        _.assign({}, options, { raw: true })
      )
    );
  }

  pgListEnums(tableName, options) {
    options = options || {};
    const sql = this.QueryGenerator.pgListEnums(tableName);
    return this.sequelize.query(sql, _.assign({}, options, { plain: false, raw: true, type: QueryTypes.SELECT }));
  }

  renameTable(before, after, options) {
    options = options || {};
    const sql = this.QueryGenerator.renameTableQuery(before, after);
    return this.sequelize.query(sql, options);
  }

  showAllTables(options) {
    options = _.assign({}, options, {
      raw: true,
      type: QueryTypes.SHOWTABLES
    });
    const sql = this.QueryGenerator.showTablesQuery();
    return this.sequelize.query(sql, options).then(t => _.flatten(t));
  }

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
    return this.sequelize.query(sql, _.assign({}, options, { type: QueryTypes.DESCRIBE }))
      .then(data => {
        if (_.isEmpty(data)) {
          return Promise.reject(`No description found for "${tableName}" table. Check the table name and schema; remember, they _are_ case sensitive.`);
        }
        return Promise.resolve(data);
      });
  }

  // -------------------------------------------------------------------------
  // Column manipulation
  // -------------------------------------------------------------------------

  addColumn(table, key, attribute, options) {
    if (!table || !key || !attribute) {
      throw new Error('addColumn takes atleast 3 arguments (table, attribute name, attribute definition)');
    }
    options = options || {};
    attribute = this.sequelize.normalizeAttribute(attribute);
    const sql = this.QueryGenerator.addColumnQuery(table, key, attribute);
    return this.sequelize.query(sql, options);
  }

  removeColumn(tableName, attributeName, options) {
    options = options || {};
    const dialect = this.sequelize.options.dialect;
    if (dialect === 'sqlite') {
      return SQLiteQueryInterface.removeColumn.call(this, tableName, attributeName, options);
    }
    if (dialect === 'mssql') {
      return MSSSQLQueryInterface.removeColumn.call(this, tableName, attributeName, options);
    }
    if (dialect === 'mysql') {
      return MySQLQueryInterface.removeColumn.call(this, tableName, attributeName, options);
    }
    const sql = this.QueryGenerator.removeColumnQuery(tableName, attributeName);
    return this.sequelize.query(sql, options);
  }

  changeColumn(tableName, attributeName, dataTypeOrOptions, options) {
    options = options || {};
    const attributes = {};

    if (_.values(DataTypes).includes(dataTypeOrOptions)) {
      attributes[attributeName] = { type: dataTypeOrOptions, allowNull: true };
    } else {
      attributes[attributeName] = dataTypeOrOptions;
    }

    attributes[attributeName].type = this.sequelize.normalizeDataType(attributes[attributeName].type);

    if (this.sequelize.options.dialect === 'sqlite') {
      return SQLiteQueryInterface.changeColumn.call(this, tableName, attributes, options);
    }

    const sql = this.QueryGenerator.changeColumnQuery(
      tableName,
      this.QueryGenerator.attributesToSQL(attributes)
    );
    return this.sequelize.query(sql, options);
  }

  renameColumn(tableName, before, after, options) {
    options = options || {};
    return this.describeTable(tableName, options).then(data => {
      if (!data[before]) {
        throw new Error(`Table ${tableName} doesn't have the column ${before}`);
      }
      const col = data[before];
      const newDef = {
        [after]: {
          attribute: after,
          type: col.type,
          allowNull: col.allowNull,
          defaultValue: col.defaultValue
        }
      };
      if (col.defaultValue === null && !col.allowNull) {
        delete newDef[after].defaultValue;
      }

      if (this.sequelize.options.dialect === 'sqlite') {
        return SQLiteQueryInterface.renameColumn.call(this, tableName, before, after, options);
      }

      const sql = this.QueryGenerator.renameColumnQuery(
        tableName,
        before,
        this.QueryGenerator.attributesToSQL(newDef)
      );
      return this.sequelize.query(sql, options);
    });
  }

  // -------------------------------------------------------------------------
  // Index handling
  // -------------------------------------------------------------------------

  addIndex(tableName, attributes, options, rawTablename) {
    if (!Array.isArray(attributes)) {
      rawTablename = options;
      options = attributes;
      attributes = options.fields;
    }
    if (!rawTablename) rawTablename = tableName;

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

  // -------------------------------------------------------------------------
  // Foreign key utilities
  // -------------------------------------------------------------------------

  getForeignKeysForTables(tableNames, options) {
    if (!tableNames.length) return Promise.resolve({});
    options = _.assign({}, options || {}, { type: QueryTypes.FOREIGNKEYS });

    return Promise.map(tableNames, tn =>
      this.sequelize.query(this.QueryGenerator.getForeignKeysQuery(tn, this.sequelize.config.database), options)
    ).then(results => {
      const map = {};
      tableNames.forEach((tn, i) => {
        const key = _.isObject(tn) ? `${tn.schema}.${tn.tableName}` : tn;
        const rows = _.isArray(results[i]) ? results[i] : [results[i]];
        map[key] = rows.map(r => r.constraint_name).filter(_.identity);
      });
      return map;
    });
  }

  getForeignKeyReferencesForTable(tableName, options) {
    const queryOptions = Object.assign({}, options, { type: QueryTypes.FOREIGNKEYS });
    const catalog = this.sequelize.config.database;
    const dialect = this.sequelize.options.dialect;

    if (dialect === 'sqlite') {
      return SQLiteQueryInterface.getForeignKeyReferencesForTable.call(this, tableName, queryOptions);
    }
    if (dialect === 'postgres') {
      const sql = this.QueryGenerator.getForeignKeyReferencesQuery(tableName, catalog);
      return this.sequelize.query(sql, queryOptions).then(res => res.map(Utils.camelizeObjectKeys));
    }
    const sql = this.QueryGenerator.getForeignKeysQuery(tableName, catalog);
    return this.sequelize.query(sql, queryOptions);
  }

  removeIndex(tableName, indexNameOrAttributes, options) {
    options = options || {};
    const sql = this.QueryGenerator.removeIndexQuery(tableName, indexNameOrAttributes);
    return this.sequelize.query(sql, options);
  }

  // -------------------------------------------------------------------------
  // Constraint handling
  // -------------------------------------------------------------------------

  addConstraint(tableName, attributes, options, rawTablename) {
    if (!Array.isArray(attributes)) {
      rawTablename = options;
      options = attributes;
      attributes = options.fields;
    }
    if (!options.type) {
      throw new Error('Constraint type must be specified through options.type');
    }
    if (!rawTablename) rawTablename = tableName;

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

  removeConstraint(tableName, constraintName, options) {
    options = options || {};
    const dialect = this.sequelize.options.dialect;
    if (dialect === 'mysql') {
      return MySQLQueryInterface.removeConstraint.call(this, tableName, constraintName, options);
    }
    if (dialect === 'sqlite') {
      return SQLiteQueryInterface.removeConstraint.call(this, tableName, constraintName, options);
    }
    const sql = this.QueryGenerator.removeConstraintQuery(tableName, constraintName);
    return this.sequelize.query(sql, options);
  }

  // -------------------------------------------------------------------------
  // Data manipulation
  // -------------------------------------------------------------------------

  insert(instance, tableName, values, options) {
    options = Utils.cloneDeep(options);
    options.hasTrigger = instance && instance.constructor.options.hasTrigger;
    const sql = this.QueryGenerator.insertQuery(
      tableName,
      values,
      instance && instance.constructor.rawAttributes,
      options
    );
    options.type = QueryTypes.INSERT;
    options.instance = instance;
    return this.sequelize.query(sql, options).then(results => {
      if (instance) results[0].isNewRecord = false;
      return results;
    });
  }

  upsert(tableName, insertValues, updateValues, where, model, options) {
    options = _.clone(options);
    const wheres = [];

    if (!Utils.isWhereEmpty(where)) wheres.push(where);

    const indexes = this._collectUniqueIndexes(model);
    indexes.forEach(idx => {
      if (_.intersection(Object.keys(insertValues), idx).length === idx.length) {
        const clause = {};
        idx.forEach(f => clause[f] = insertValues[f]);
        wheres.push(clause);
      }
    });

    const finalWhere = { [Op.or]: wheres };
    options.type = QueryTypes.UPSERT;
    options.raw = true;

    const sql = this.QueryGenerator.upsertQuery(tableName, insertValues, updateValues, finalWhere, model, options);
    return this.sequelize.query(sql, options).then(result => {
      const dialect = this.sequelize.options.dialect;
      if (dialect === 'postgres') return [result.created, result.primary_key];
      if (dialect === 'mssql') return [result.$action === 'INSERT', result[model.primaryKeyField]];
      if (dialect === 'mysql') return [result === 1, undefined];
      return [result, undefined];
    });
  }

  _collectUniqueIndexes(model) {
    const uniq = _.map(model.options.uniqueKeys, v => v.fields);
    model.options.indexes.forEach(idx => {
      if (idx.unique) {
        const fields = _.map(idx.fields, f => (_.isPlainObject(f) ? f.attribute : f));
        uniq.push(fields);
      }
    });
    return uniq;
  }

  bulkInsert(tableName, records, options, attributes) {
    options = _.clone(options) || {};
    options.type = QueryTypes.INSERT;
    const sql = this.QueryGenerator.bulkInsertQuery(tableName, records, options, attributes);
    return this.sequelize.query(sql, options).then(res => res[0]);
  }

  update(instance, tableName, values, identifier, options) {
    options = _.clone(options || {});
    options.hasTrigger = !!(instance && instance._modelOptions && instance._modelOptions.hasTrigger);
    const sql = this.QueryGenerator.updateQuery(
      tableName,
      values,
      identifier,
      options,
      instance.constructor.rawAttributes
    );
    options.type = QueryTypes.UPDATE;
    options.instance = instance;
    return this.sequelize.query(sql, options);
  }

  bulkUpdate(tableName, values, identifier, options, attributes) {
    options = Utils.cloneDeep(options);
    if (typeof identifier === 'object') identifier = Utils.cloneDeep(identifier);
    const sql = this.QueryGenerator.updateQuery(tableName, values, identifier, options, attributes);
    const model = _.find(this.sequelize.modelManager.models, { tableName: _.isObject(tableName) ? tableName.tableName : tableName });
    options.model = model;
    return this.sequelize.query(sql, options);
  }

  delete(instance, tableName, identifier, options) {
    const cascades = this._collectCascadeAssociations(instance);
    const sql = this.QueryGenerator.deleteQuery(tableName, identifier, null, instance.constructor);
    options = _.clone(options) || {};

    return Promise.each(cascades, cascade =>
      instance[cascade](options).then(instances => {
        if (!instances) return;
        const list = Array.isArray(instances) ? instances : [instances];
        return Promise.each(list, i => i.destroy(options));
      })
    ).then(() => {
      options.instance = instance;
      return this.sequelize.query(sql, options);
    });
  }

  _collectCascadeAssociations(instance) {
    const cascades = [];
    if (!instance.constructor || !instance.constructor.associations) return cascades;
    const assocKeys = Object.keys(instance.constructor.associations);
    assocKeys.forEach(k => {
      const assoc = instance.constructor.associations[k];
      if (assoc.options && assoc.options.onDelete && assoc.options.onDelete.toLowerCase() === 'cascade' && assoc.options.useHooks) {
        cascades.push(assoc.accessors.get);
      }
    });
    return cascades;
  }

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
    const sql = this.QueryGenerator.selectQuery(tableName, options, model);
    return this.sequelize.query(sql, options);
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
      tableName = this.QueryGenerator.addSchema({ tableName, _schema: options.schema });
    }
    options = Utils.cloneDeep(options);
    options = _.defaults(options, { raw: true, plain: true, type: QueryTypes.SELECT });
    const sql = this.QueryGenerator.selectQuery(tableName, options, Model);
    if (attributeSelector === undefined) throw new Error('Please pass an attribute selector!');

    return this.sequelize.query(sql, options).then(data => {
      if (!options.plain) return data;
      let result = data ? data[attributeSelector] : null;
      if (options && options.dataType) {
        const dt = options.dataType;
        if (dt instanceof DataTypes.DECIMAL || dt instanceof DataTypes.FLOAT) result = parseFloat(result);
        else if (dt instanceof DataTypes.INTEGER || dt instanceof DataTypes.BIGINT) result = parseInt(result, 10);
        else if (dt instanceof DataTypes.DATE && result && !_.isDate(result)) result = new Date(result);
      }
      return result;
    });
  }

  // -------------------------------------------------------------------------
  // Trigger & function utilities
  // -------------------------------------------------------------------------

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

  createFunction(functionName, params, returnType, language, body, optionsArray, options) {
    const sql = this.QueryGenerator.createFunction(functionName, params, returnType, language, body, optionsArray);
    options = options || {};
    return sql ? this.sequelize.query(sql, options) : Promise.resolve();
  }

  dropFunction(functionName, params, options) {
    const sql = this.QueryGenerator.dropFunction(functionName, params);
    options = options || {};
    return sql ? this.sequelize.query(sql, options) : Promise.resolve();
  }

  renameFunction(oldFunctionName, params, newFunctionName, options) {
    const sql = this.QueryGenerator.renameFunction(oldFunctionName, params, newFunctionName);
    options = options || {};
    return sql ? this.sequelize.query(sql, options) : Promise.resolve();
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