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

const DIALECT_SPECIFIC_HANDLERS = {
  sqlite: SQLiteQueryInterface,
  mssql: MSSSQLQueryInterface,
  mysql: MySQLQueryInterface
};

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
      _.flatten(_.map(schemaNames, value => value.schema_name || value))
    );
  }

  databaseVersion(options) {
    return this.sequelize.query(
      this.QueryGenerator.versionQuery(),
      _.assign({}, options, { type: QueryTypes.VERSION })
    );
  }

  createTable(tableName, attributes, options, model) {
    options = _.clone(options) || {};
    attributes = this._normalizeAttributes(attributes);

    if (this.sequelize.options.dialect === 'postgres') {
      return this._createTablePostgres(tableName, attributes, options, model);
    }
    return this._createTableGeneric(tableName, attributes, options, model);
  }

  _normalizeAttributes(attributes) {
    return _.mapValues(attributes, attribute => {
      if (!_.isPlainObject(attribute)) {
        attribute = { type: attribute, allowNull: true };
      }
      return this.sequelize.normalizeAttribute(attribute);
    });
  }

  _createTablePostgres(tableName, attributes, options, model) {
    const keys = Object.keys(attributes);
    const promises = [];

    for (let i = 0; i < keys.length; i++) {
      const attribute = attributes[keys[i]];
      if (this._isEnumType(attribute.type)) {
        const sql = this.QueryGenerator.pgListEnums(tableName, attribute.field || keys[i], options);
        promises.push(this.sequelize.query(
          sql,
          _.assign({}, options, { plain: true, raw: true, type: QueryTypes.SELECT })
        ));
      }
    }

    return Promise.all(promises).then(results => this._processPostgresEnums(tableName, attributes, results, options, model));
  }

  _isEnumType(type) {
    return type instanceof DataTypes.ENUM ||
      (type instanceof DataTypes.ARRAY && type.type instanceof DataTypes.ENUM);
  }

  _processPostgresEnums(tableName, attributes, results, options, model) {
    const keys = Object.keys(attributes);
    const promises = [];
    let enumIdx = 0;

    for (let i = 0; i < keys.length; i++) {
      const attribute = attributes[keys[i]];
      const type = attribute.type;
      const enumType = type.type || type;

      if (this._isEnumType(type)) {
        if (!results[enumIdx]) {
          const sql = this.QueryGenerator.pgEnum(tableName, attribute.field || keys[i], enumType, options);
          promises.push(this.sequelize.query(sql, _.assign({}, options, { raw: true })));
        } else if (results[enumIdx] && model) {
          this._addMissingEnumValues(tableName, attribute, enumType, results[enumIdx], options, promises, keys[i]);
          enumIdx++;
        }
      }
    }

    return this._finalizeTableCreation(tableName, attributes, options, promises);
  }

  _addMissingEnumValues(tableName, attribute, enumType, result, options, promises, fieldName) {
    const enumVals = this.QueryGenerator.fromArray(result.enum_value);
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

  _finalizeTableCreation(tableName, attributes, options, promises) {
    tableName = this._addSchemaToTableName(tableName, options);
    const attributesSql = this.QueryGenerator.attributesToSQL(attributes, { context: 'createTable' });
    const sql = this.QueryGenerator.createTableQuery(tableName, attributesSql, options);

    return Promise.all(promises)
      .tap(() => {
        if (promises.length) {
          return this.sequelize.dialect.connectionManager._refreshDynamicOIDs();
        }
      })
      .then(() => this.sequelize.query(sql, options));
  }

  _createTableGeneric(tableName, attributes, options, model) {
    tableName = this._addSchemaToTableName(tableName, options, model);
    const attributesSql = this.QueryGenerator.attributesToSQL(attributes, { context: 'createTable' });
    const sql = this.QueryGenerator.createTableQuery(tableName, attributesSql, options);
    return this.sequelize.query(sql, options);
  }

  _addSchemaToTableName(tableName, options, model) {
    if (!tableName.schema && (options.schema || (model && model._schema))) {
      return this.QueryGenerator.addSchema({
        tableName,
        _schema: (model && model._schema) || options.schema
      });
    }
    return tableName;
  }

  dropTable(tableName, options) {
    options = _.clone(options) || {};
    options.cascade = options.cascade || options.force || false;

    const sql = this.QueryGenerator.dropTableQuery(tableName, options);

    return this.sequelize.query(sql, options).then(() => {
      if (this.sequelize.options.dialect === 'postgres') {
        return this._dropPostgresEnums(tableName, options);
      }
      return Promise.resolve();
    });
  }

  _dropPostgresEnums(tableName, options) {
    const promises = [];
    const instanceTable = this.sequelize.modelManager.getModel(tableName, { attribute: 'tableName' });

    if (instanceTable) {
      const getTableName = (!options || !options.schema || options.schema === 'public' ? '' : options.schema + '_') + tableName;
      const keys = Object.keys(instanceTable.rawAttributes);

      for (let i = 0; i < keys.length; i++) {
        if (instanceTable.rawAttributes[keys[i]].type instanceof DataTypes.ENUM) {
          const sql = this.QueryGenerator.pgEnumDrop(getTableName, keys[i]);
          options.supportsSearchPath = false;
          promises.push(this.sequelize.query(sql, _.assign({}, options, { raw: true })));
        }
      }
    }

    return Promise.all(promises).get(0);
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
        return this._dropAllTablesSQLite(tableNames, options, dropAllTables);
      }
      return this._dropAllTablesGeneric(tableNames, options, dropAllTables);
    });
  }

  _dropAllTablesSQLite(tableNames, options, dropAllTables) {
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

  _dropAllTablesGeneric(tableNames, options, dropAllTables) {
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
    const { schema, schemaDelimiter } = this._parseDescribeOptions(tableName, options);

    if (typeof tableName === 'object' && tableName !== null) {
      tableName = tableName.tableName;
    }

    const sql = this.QueryGenerator.describeTableQuery(tableName, schema, schemaDelimiter);

    return this.sequelize.query(
      sql,
      _.assign({}, options, { type: QueryTypes.DESCRIBE })
    ).then(data => {
      if (_.isEmpty(data)) {
        return Promise.reject(`No description found for "${tableName}" table. Check the table name and schema; remember, they _are_ case sensitive.`);
      }
      return Promise.resolve(data);
    });
  }

  _parseDescribeOptions(tableName, options) {
    let schema = null;
    let schemaDelimiter = null;

    if (typeof options === 'string') {
      schema = options;
    } else if (typeof options === 'object' && options !== null) {
      schema = options.schema || null;
      schemaDelimiter = options.schemaDelimiter || null;
    }

    return { schema, schemaDelimiter };
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
    const dialect = this.sequelize.options.dialect;
    const handler = DIALECT_SPECIFIC_HANDLERS[dialect];

    if (handler && handler.removeColumn) {
      return handler.removeColumn.call(this, tableName, attributeName, options);
    }
    return this.sequelize.query(this.QueryGenerator.removeColumnQuery(tableName, attributeName), options);
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
        throw new Error(`Table ${tableName} doesn't have the column ${attrNameBefore}`);
      }

      const columnData = data[attrNameBefore] || {};
      const _options = this._buildRenameColumnOptions(attrNameAfter, columnData);

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