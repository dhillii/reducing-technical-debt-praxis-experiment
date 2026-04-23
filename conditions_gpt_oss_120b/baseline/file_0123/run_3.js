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

class QueryInterface {
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.QueryGenerator = this.sequelize.dialect.QueryGenerator;
  }

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
      _.flatten(_.map(schemaNames, value => (value.schema_name ? value.schema_name : value)))
    );
  }

  databaseVersion(options) {
    return this.sequelize.query(
      this.QueryGenerator.versionQuery(),
      _.assign({}, options, { type: QueryTypes.VERSION })
    );
  }

  async createTable(tableName, attributes, options, model) {
    options = _.clone(options) || {};

    attributes = _.mapValues(attributes, attribute => {
      if (!_.isPlainObject(attribute)) {
        attribute = { type: attribute, allowNull: true };
      }
      return this.sequelize.normalizeAttribute(attribute);
    });

    if (this.sequelize.options.dialect === 'postgres') {
      const enumAttrs = [];
      for (const key of Object.keys(attributes)) {
        const attr = attributes[key];
        const type = attr.type;
        if (
          type instanceof DataTypes.ENUM ||
          (type instanceof DataTypes.ARRAY && type.type instanceof DataTypes.ENUM)
        ) {
          enumAttrs.push({ key, attr });
        }
      }

      const listPromises = enumAttrs.map(e =>
        this.sequelize.query(
          this.QueryGenerator.pgListEnums(tableName, e.attr.field || e.key, options),
          _.assign({}, options, { plain: true, raw: true, type: QueryTypes.SELECT })
        )
      );
      const results = await Promise.all(listPromises);

      const createPromises = [];
      let enumIdx = 0;

      for (const { key, attr } of enumAttrs) {
        const type = attr.type;
        const enumType = type.type || type;

        const result = results[enumIdx];
        if (!result) {
          const sql = this.QueryGenerator.pgEnum(tableName, attr.field || key, enumType, options);
          createPromises.push(this.sequelize.query(sql, _.assign({}, options, { raw: true })));
        } else if (model) {
          const existingVals = this.QueryGenerator.fromArray(result.enum_value);
          const definedVals = enumType.values;

          for (let i = 0; i < definedVals.length; i++) {
            const value = definedVals[i];
            const valueOptions = _.clone(options);
            valueOptions.before = null;
            valueOptions.after = null;

            if (!existingVals.includes(value)) {
              if (definedVals[i + 1]) {
                valueOptions.before = definedVals[i + 1];
              } else if (definedVals[i - 1]) {
                valueOptions.after = definedVals[i - 1];
              }
              valueOptions.supportsSearchPath = false;
              const sql = this.QueryGenerator.pgEnumAdd(
                tableName,
                attr.field || key,
                value,
                valueOptions
              );
              createPromises.push(this.sequelize.query(sql, valueOptions));
            }
          }
        }
        enumIdx++;
      }

      if (!tableName.schema && (options.schema || (model && model._schema))) {
        tableName = this.QueryGenerator.addSchema({
          tableName,
          _schema: (model && model._schema) || options.schema
        });
      }

      attributes = this.QueryGenerator.attributesToSQL(attributes, { context: 'createTable' });
      const sql = this.QueryGenerator.createTableQuery(tableName, attributes, options);

      if (createPromises.length) {
        await this.sequelize.dialect.connectionManager._refreshDynamicOIDs();
        await Promise.all(createPromises);
      }

      return this.sequelize.query(sql, options);
    }

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

  dropTable(tableName, options) {
    options = _.clone(options) || {};
    options.cascade = options.cascade || options.force || false;

    const sql = this.QueryGenerator.dropTableQuery(tableName, options);

    return this.sequelize.query(sql, options).then(() => {
      const promises = [];

      if (this.sequelize.options.dialect === 'postgres') {
        const instanceTable = this.sequelize.modelManager.getModel(tableName, { attribute: 'tableName' });

        if (instanceTable) {
          const getTableName =
            (!options || !options.schema || options.schema === 'public' ? '' : options.schema + '_') + tableName;

          const keys = Object.keys(instanceTable.rawAttributes);
          for (let i = 0; i < keys.length; i++) {
            if (instanceTable.rawAttributes[keys[i]].type instanceof DataTypes.ENUM) {
              const sqlEnum = this.QueryGenerator.pgEnumDrop(getTableName, keys[i]);
              options.supportsSearchPath = false;
              promises.push(this.sequelize.query(sqlEnum, _.assign({}, options, { raw: true })));
            }
          }
        }
      }

      return Promise.all(promises).get(0);
    });
  }

  async dropAllTables(options) {
    options = options || {};
    const skip = options.skip || [];

    const tableNames = await this.showAllTables(options);

    const dropTableIfNotSkipped = async tableName => {
      const name = tableName.tableName || tableName;
      if (!skip.includes(name)) {
        await this.dropTable(tableName, _.assign({}, options, { cascade: true }));
      }
    };

    if (this.sequelize.options.dialect === 'sqlite') {
      const result = await this.sequelize.query('PRAGMA foreign_keys;', options);
      const foreignKeysAreEnabled = result.foreign_keys === 1;

      if (foreignKeysAreEnabled) {
        await this.sequelize.query('PRAGMA foreign_keys = OFF', options);
        await Promise.all(tableNames.map(dropTableIfNotSkipped));
        await this.sequelize.query('PRAGMA foreign_keys = ON', options);
      } else {
        await Promise.all(tableNames.map(dropTableIfNotSkipped));
      }
      return;
    }

    const foreignKeys = await this.getForeignKeysForTables(tableNames, options);
    const fkPromises = [];

    for (const tbl of tableNames) {
      let normalized = tbl;
      if (_.isObject(tbl)) {
        normalized = tbl.schema + '.' + tbl.tableName;
      }
      const fks = foreignKeys[normalized] || [];
      for (const fk of fks) {
        const sql = this.QueryGenerator.dropForeignKeyQuery(tbl, fk);
        fkPromises.push(this.sequelize.query(sql, options));
      }
    }

    await Promise.all(fkPromises);
    await Promise.all(tableNames.map(dropTableIfNotSkipped));
  }

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

    const showTablesSql = this.QueryGenerator.showTablesQuery();
    return this.sequelize.query(showTablesSql, options).then(tableNames => _.flatten(tableNames));
  }

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

    return this.sequelize
      .query(sql, _.assign({}, options, { type: QueryTypes.DESCRIBE }))
      .then(data => {
        if (_.isEmpty(data)) {
          return Promise.reject(
            'No description found for "' + tableName + '" table. Check the table name and schema; remember, they _are_ case sensitive.'
          );
        }
        return Promise.resolve(data);
      });
  }

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

  async renameColumn(tableName, attrNameBefore, attrNameAfter, options) {
    options = options || {};
    const data = await this.describeTable(tableName, options);
    if (!data[attrNameBefore]) {
      throw new Error('Table ' + tableName + " doesn't have the column " + attrNameBefore);
    }

    const columnInfo = data[attrNameBefore] || {};

    const newAttrs = {};
    newAttrs[attrNameAfter] = {
      attribute: attrNameAfter,
      type: columnInfo.type,
      allowNull: columnInfo.allowNull,
      defaultValue: columnInfo.defaultValue
    };

    if (columnInfo.defaultValue === null && !columnInfo.allowNull) {
      delete newAttrs[attrNameAfter].defaultValue;
    }

    if (this.sequelize.options.dialect === 'sqlite') {
      return SQLiteQueryInterface.renameColumn.call(this, tableName, attrNameBefore, attrNameAfter, options);
    }

    const sql = this.QueryGenerator.renameColumnQuery(
      tableName,
      attrNameBefore,
      this.QueryGenerator.attributesToSQL(newAttrs)
    );
    return this.sequelize.query(sql, options);
  }

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
    const catalogName = this.sequelize.config.database;
    switch (this.sequelize.options.dialect) {
      case 'sqlite':
        return SQLiteQueryInterface.getForeignKeyReferencesForTable.call(this, tableName, queryOptions);
      case 'postgres':
        {
          const query = this.QueryGenerator.getForeignKeyReferencesQuery(tableName, catalogName);
          return this.sequelize.query(query, queryOptions).then(result => result.map(Utils.camelizeObjectKeys));
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

  removeIndex(tableName, indexNameOrAttributes, options) {
    options = options || {};
    const sql = this.QueryGenerator.removeIndexQuery(tableName, indexNameOrAttributes);
    return this.sequelize.query(sql, options);
  }

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
        indexFields = _.map(value.fields, field => (_.isPlainObject(field) ? field.attribute : field));
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

    return this.sequelize
      .query(this.QueryGenerator.bulkInsertQuery(tableName, records, options, attributes), options)
      .then(results => results[0]);
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
      const keys = Object.keys(instance.constructor.associations);
      for (let i = 0; i < keys.length; i++) {
        const association = instance.constructor.associations[keys[i]];
        if (
          association.options &&
          association.options.onDelete &&
          association.options.onDelete.toLowerCase() === 'cascade' &&
          association.options.useHooks === true
        ) {
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

    return this.sequelize.query(this.QueryGenerator.selectQuery(tableName, options, model), options);
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

  createTrigger(tableName, triggerName, timingType, fireOnArray, functionName, functionParams, optionsArray, options) {
    const sql = this.QueryGenerator.createTrigger(
      tableName,
      triggerName,
      timingType,
      fireOnArray,
      functionName,
      functionParams,
      optionsArray
    );
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

    return sql ? this.sequelize.query(sql, options) : Promise.resolve();
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