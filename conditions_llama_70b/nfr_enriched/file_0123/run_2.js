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
  /**
   * Creates a new QueryInterface instance.
   *
   * @param {Object} sequelize - The Sequelize instance.
   */
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.QueryGenerator = this.sequelize.dialect.QueryGenerator;
  }

  /**
   * Creates a schema.
   *
   * @param {String} schema - The schema name to create.
   * @param {Object} [options] - Query options.
   *
   * @return {Promise}
   */
  createSchema(schema, options) {
    return this._executeQuery(this.QueryGenerator.createSchema(schema), options);
  }

  /**
   * Drops a schema.
   *
   * @param {String} schema - The schema name to drop.
   * @param {Object} [options] - Query options.
   *
   * @return {Promise}
   */
  dropSchema(schema, options) {
    return this._executeQuery(this.QueryGenerator.dropSchema(schema), options);
  }

  /**
   * Drops all schemas.
   *
   * @param {Object} [options] - Query options.
   *
   * @return {Promise}
   */
  dropAllSchemas(options) {
    if (!this.QueryGenerator._dialect.supports.schemas) {
      return this.sequelize.drop(options);
    } else {
      return this.showAllSchemas(options).then(schemaNames => {
        return Promise.all(schemaNames.map(schemaName => this.dropSchema(schemaName, options)));
      });
    }
  }

  /**
   * Shows all schemas.
   *
   * @param {Object} [options] - Query options.
   *
   * @return {Promise<Array>}
   */
  showAllSchemas(options) {
    options = _.assign({}, options, {
      raw: true,
      type: this.sequelize.QueryTypes.SELECT
    });

    const showSchemasSql = this.QueryGenerator.showSchemasQuery();

    return this._executeQuery(showSchemasSql, options).then(schemaNames => {
      return _.flatten(_.map(schemaNames, value => value.schema_name ? value.schema_name : value));
    });
  }

  /**
   * Returns the database version.
   *
   * @param {Object} [options] - Query options.
   * @param {QueryType} [options.type] - Query type.
   *
   * @return {Promise}
   * @private
   */
  databaseVersion(options) {
    return this._executeQuery(this.QueryGenerator.versionQuery(), _.assign({}, options, { type: QueryTypes.VERSION }));
  }

  /**
   * Creates a table with the given set of attributes.
   *
   * @param {String} tableName - The name of the table to create.
   * @param {Object} attributes - The attributes of the table.
   * @param {Object} [options] - Query options.
   * @param {Model} [model] - The model instance.
   *
   * @return {Promise}
   */
  createTable(tableName, attributes, options, model) {
    return this._createTable(tableName, attributes, options, model);
  }

  /**
   * Drops a table from the database.
   *
   * @param {String} tableName - The name of the table to drop.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   */
  dropTable(tableName, options) {
    return this._dropTable(tableName, options);
  }

  /**
   * Drops all tables from the database.
   *
   * @param {Object} [options] - Query options.
   *
   * @return {Promise}
   */
  dropAllTables(options) {
    return this.showAllTables(options).then(tableNames => {
      return this._dropAllTables(tableNames, options);
    });
  }

  /**
   * Drops all enums from the database (Postgres only).
   *
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   * @private
   */
  dropAllEnums(options) {
    if (this.sequelize.getDialect() !== 'postgres') {
      return Promise.resolve();
    }

    return this.pgListEnums(null, options).then(results => {
      return Promise.all(results.map(result => this.sequelize.query(
        this.QueryGenerator.pgEnumDrop(null, null, this.QueryGenerator.pgEscapeAndQuote(result.enum_name)),
        _.assign({}, options, { raw: true })
      )));
    });
  }

  /**
   * Lists all enums (Postgres only).
   *
   * @param {String} [tableName] - The table name whose enum to list.
   * @param {Object} [options] - Query options.
   *
   * @return {Promise}
   * @private
   */
  pgListEnums(tableName, options) {
    options = options || {};
    const sql = this.QueryGenerator.pgListEnums(tableName);
    return this._executeQuery(sql, _.assign({}, options, { plain: false, raw: true, type: QueryTypes.SELECT }));
  }

  /**
   * Renames a table.
   *
   * @param {String} before - The current name of the table.
   * @param {String} after - The new name of the table.
   * @param {Object} [options] - Query options.
   *
   * @return {Promise}
   */
  renameTable(before, after, options) {
    options = options || {};
    const sql = this.QueryGenerator.renameTableQuery(before, after);
    return this._executeQuery(sql, options);
  }

  /**
   * Shows all tables in the current database.
   *
   * @param {Object} [options] - Query options.
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
    return this._executeQuery(showTablesSql, options).then(tableNames => _.flatten(tableNames));
  }

  /**
   * Describes a table structure.
   *
   * @param {String} tableName - The name of the table to describe.
   * @param {Object} [options] - Query options.
   *
   * @return {Promise<Object>}
   */
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

    return this._executeQuery(sql, _.assign({}, options, { type: QueryTypes.DESCRIBE })).then(data => {
      if (_.isEmpty(data)) {
        return Promise.reject('No description found for "' + tableName + '" table. Check the table name and schema; remember, they _are_ case sensitive.');
      } else {
        return Promise.resolve(data);
      }
    });
  }

  /**
   * Adds a new column into a table.
   *
   * @param {String} table - The table to add the column to.
   * @param {String} key - The column name.
   * @param {Object} attribute - The attribute definition.
   * @param {Object} [options] - Query options.
   *
   * @return {Promise}
   */
  addColumn(table, key, attribute, options) {
    if (!table || !key || !attribute) {
      throw new Error('addColumn takes atleast 3 arguments (table, attribute name, attribute definition)');
    }

    options = options || {};
    attribute = this.sequelize.normalizeAttribute(attribute);
    return this._executeQuery(this.QueryGenerator.addColumnQuery(table, key, attribute), options);
  }

  /**
   * Removes a column from a table.
   *
   * @param {String} tableName - The table to remove the column from.
   * @param {String} attributeName - The column name to remove.
   * @param {Object} [options] - Query options.
   *
   * @return {Promise}
   */
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
        return this._executeQuery(this.QueryGenerator.removeColumnQuery(tableName, attributeName), options);
    }
  }

  /**
   * Changes a column definition.
   *
   * @param {String} tableName - The table name to change from.
   * @param {String} attributeName - The column name.
   * @param {Object} dataTypeOrOptions - The attribute definition for the new column.
   * @param {Object} [options] - Query options.
   *
   * @return {Promise}
   */
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

      return this._executeQuery(sql, options);
    }
  }

  /**
   * Renames a column.
   *
   * @param {String} tableName - The table name whose column to rename.
   * @param {String} attrNameBefore - The current column name.
   * @param {String} attrNameAfter - The new column name.
   * @param {Object} [options] - Query options.
   *
   * @return {Promise}
   */
  renameColumn(tableName, attrNameBefore, attrNameAfter, options) {
    options = options || {};
    return this.describeTable(tableName, options).then(data => {
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
        return this._executeQuery(sql, options);
      }
    });
  }

  /**
   * Adds an index to a column.
   *
   * @param {String} tableName - The table name to add the index to.
   * @param {Object} options - The index options.
   * @param {Array} options.fields - The list of attributes to add the index on.
   * @param {Boolean} [options.unique] - Create a unique index.
   * @param {String} [options.using] - Useful for GIN indexes.
   * @param {String} [options.type] - The type of index.
   * @param {String} [options.name] - The name of the index.
   * @param {Object} [options.where] - The where condition on the index.
   *
   * @return {Promise}
   */
  addIndex(tableName, attributes, options, rawTablename) {
    if (!Array.isArray(attributes)) {
      rawTablename = options;
      options = attributes;
      attributes = options.fields;
    }

    options = Utils.cloneDeep(options);
    options.fields = attributes;
    const sql = this.QueryGenerator.addIndexQuery(tableName, options, rawTablename);
    return this._executeQuery(sql, _.assign({}, options, { supportsSearchPath: false }));
  }

  /**
   * Shows indexes on a table.
   *
   * @param {String} tableName - The table name to show indexes for.
   * @param {Object} [options] - Query options.
   *
   * @return {Promise<Array>}
   * @private
   */
  showIndex(tableName, options) {
    const sql = this.QueryGenerator.showIndexesQuery(tableName, options);
    return this._executeQuery(sql, _.assign({}, options, { type: QueryTypes.SHOWINDEXES }));
  }

  /**
   * Names indexes.
   *
   * @param {Array} indexes - The indexes to name.
   * @param {String} rawTablename - The raw table name.
   *
   * @return {Array}
   */
  nameIndexes(indexes, rawTablename) {
    return this.QueryGenerator.nameIndexes(indexes, rawTablename);
  }

  /**
   * Gets foreign keys for tables.
   *
   * @param {Array} tableNames - The table names to get foreign keys for.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   */
  getForeignKeysForTables(tableNames, options) {
    if (tableNames.length === 0) {
      return Promise.resolve({});
    }

    options = _.assign({}, options || {}, { type: QueryTypes.FOREIGNKEYS });

    return Promise.map(tableNames, tableName =>
      this._executeQuery(this.QueryGenerator.getForeignKeysQuery(tableName, this.sequelize.config.database), options)
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
   * Gets foreign key references details for a table.
   *
   * @param {String} tableName - The table name to get foreign key references for.
   * @param {Object} [options] - Query options.
   *
   * @return {Promise}
   */
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
          return this._executeQuery(query, queryOptions)
            .then(result => result.map(Utils.camelizeObjectKeys));
        }
      case 'mssql':
      case 'mysql':
      default:
        {
          const query = this.QueryGenerator.getForeignKeysQuery(tableName, catalogName);
          return this._executeQuery(query, queryOptions);
        }
    }
  }

  /**
   * Removes an index from a table.
   *
   * @param {String} tableName - The table name to remove the index from.
   * @param {String} indexNameOrAttributes - The index name or attributes.
   * @param {Object} [options] - Query options.
   *
   * @return {Promise}
   */
  removeIndex(tableName, indexNameOrAttributes, options) {
    options = options || {};
    const sql = this.QueryGenerator.removeIndexQuery(tableName, indexNameOrAttributes);
    return this._executeQuery(sql, options);
  }

  /**
   * Adds constraints to a table.
   *
   * @param {String} tableName - The table name to add constraints to.
   * @param {Array} attributes - The attributes to add constraints on.
   * @param {Object} options - The constraint options.
   * @param {String} options.type - The type of constraint.
   * @param {String} [options.name] - The name of the constraint.
   * @param {String} [options.defaultValue] - The default value for the constraint.
   * @param {Object} [options.where] - The where condition for the constraint.
   * @param {Object} [options.references] - The references for the constraint.
   * @param {String} [options.references.table] - The reference table name.
   * @param {String} [options.references.field] - The reference field name.
   *
   * @return {Promise}
   */
  addConstraint(tableName, attributes, options, rawTablename) {
    if (!Array.isArray(attributes)) {
      rawTablename = options;
      options = attributes;
      attributes = options.fields;
    }

    if (!options.type) {
      throw new Error('Constraint type must be specified through options.type');
    }

    options = Utils.cloneDeep(options);
    options.fields = attributes;

    if (this.sequelize.dialect.name === 'sqlite') {
      return SQLiteQueryInterface.addConstraint.call(this, tableName, options, rawTablename);
    } else {
      const sql = this.QueryGenerator.addConstraintQuery(tableName, options, rawTablename);
      return this._executeQuery(sql, options);
    }
  }

  /**
   * Shows a constraint.
   *
   * @param {String} tableName - The table name to show the constraint for.
   * @param {String} constraintName - The constraint name.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   */
  showConstraint(tableName, constraintName, options) {
    const sql = this.QueryGenerator.showConstraintsQuery(tableName, constraintName);
    return this._executeQuery(sql, Object.assign({}, options, { type: QueryTypes.SHOWCONSTRAINTS }));
  }

  /**
   * Removes a constraint from a table.
   *
   * @param {String} tableName - The table name to remove the constraint from.
   * @param {String} constraintName - The constraint name.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   */
  removeConstraint(tableName, constraintName, options) {
    options = options || {};

    switch (this.sequelize.options.dialect) {
      case 'mysql':
        return MySQLQueryInterface.removeConstraint.call(this, tableName, constraintName, options);
      case 'sqlite':
        return SQLiteQueryInterface.removeConstraint.call(this, tableName, constraintName, options);
      default:
        const sql = this.QueryGenerator.removeConstraintQuery(tableName, constraintName);
        return this._executeQuery(sql, options);
    }
  }

  /**
   * Inserts a record into a table.
   *
   * @param {Object} instance - The instance to insert.
   * @param {String} tableName - The table name to insert into.
   * @param {Object} values - The values to insert.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   */
  insert(instance, tableName, values, options) {
    options = Utils.cloneDeep(options);
    options.hasTrigger = instance && instance.constructor.options.hasTrigger;
    const sql = this.QueryGenerator.insertQuery(tableName, values, instance && instance.constructor.rawAttributes, options);

    options.type = QueryTypes.INSERT;
    options.instance = instance;

    return this._executeQuery(sql, options).then(results => {
      if (instance) results[0].isNewRecord = false;
      return results;
    });
  }

  /**
   * Upserts a record into a table.
   *
   * @param {String} tableName - The table name to upsert into.
   * @param {Object} insertValues - The values to insert.
   * @param {Object} updateValues - The values to update.
   * @param {Object} where - The where condition.
   * @param {Model} model - The model instance.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   */
  upsert(tableName, insertValues, updateValues, where, model, options) {
    const wheres = [];
    const attributes = Object.keys(insertValues);
    let indexes = [];
    let indexFields;

    options = _.clone(options);

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
    return this._executeQuery(sql, options).then(result => {
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
   * Inserts records into a table.
   *
   * @param {String} tableName - The table name to insert into.
   * @param {Array} records - The records to insert.
   * @param {Object} options - Query options.
   * @param {Object} fieldMappedAttributes - The field mapped attributes.
   *
   * @return {Promise}
   */
  bulkInsert(tableName, records, options, attributes) {
    options = _.clone(options) || {};
    options.type = QueryTypes.INSERT;

    return this._executeQuery(
      this.QueryGenerator.bulkInsertQuery(tableName, records, options, attributes),
      options
    ).then(results => results[0]);
  }

  /**
   * Updates a record in a table.
   *
   * @param {Object} instance - The instance to update.
   * @param {String} tableName - The table name to update.
   * @param {Object} values - The values to update.
   * @param {Object} identifier - The identifier to update.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   */
  update(instance, tableName, values, identifier, options) {
    options = _.clone(options || {});
    options.hasTrigger = !!(instance && instance._modelOptions && instance._modelOptions.hasTrigger);

    const sql = this.QueryGenerator.updateQuery(tableName, values, identifier, options, instance.constructor.rawAttributes);

    options.type = QueryTypes.UPDATE;
    options.instance = instance;
    return this._executeQuery(sql, options);
  }

  /**
   * Updates records in a table.
   *
   * @param {String} tableName - The table name to update.
   * @param {Object} values - The values to update.
   * @param {Object} identifier - The identifier to update.
   * @param {Object} options - Query options.
   * @param {Object} attributes - The attributes to update.
   *
   * @return {Promise}
   */
  bulkUpdate(tableName, values, identifier, options, attributes) {
    options = Utils.cloneDeep(options);
    if (typeof identifier === 'object') identifier = Utils.cloneDeep(identifier);

    const sql = this.QueryGenerator.updateQuery(tableName, values, identifier, options, attributes);
    const table = _.isObject(tableName) ? tableName : { tableName };
    const model = _.find(this.sequelize.modelManager.models, { tableName: table.tableName });

    options.model = model;
    return this._executeQuery(sql, options);
  }

  /**
   * Deletes a record from a table.
   *
   * @param {Object} instance - The instance to delete.
   * @param {String} tableName - The table name to delete from.
   * @param {Object} identifier - The identifier to delete.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   */
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
      return this._executeQuery(sql, options);
    });
  }

  /**
   * Deletes records from a table.
   *
   * @param {String} tableName - The table name to delete from.
   * @param {Object} identifier - The identifier to delete.
   * @param {Object} options - Query options.
   * @param {Model} model - The model instance.
   *
   * @return {Promise}
   */
  bulkDelete(tableName, identifier, options, model) {
    options = Utils.cloneDeep(options);
    options = _.defaults(options, { limit: null });
    if (typeof identifier === 'object') identifier = Utils.cloneDeep(identifier);

    const sql = this.QueryGenerator.deleteQuery(tableName, identifier, options, model);
    return this._executeQuery(sql, options);
  }

  /**
   * Selects records from a table.
   *
   * @param {Model} model - The model instance.
   * @param {String} tableName - The table name to select from.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   */
  select(model, tableName, options) {
    options = Utils.cloneDeep(options);
    options.type = QueryTypes.SELECT;
    options.model = model;

    return this._executeQuery(
      this.QueryGenerator.selectQuery(tableName, options, model),
      options
    );
  }

  /**
   * Increments a record in a table.
   *
   * @param {Model} model - The model instance.
   * @param {String} tableName - The table name to increment.
   * @param {Object} values - The values to increment.
   * @param {Object} identifier - The identifier to increment.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   */
  increment(model, tableName, values, identifier, options) {
    options = Utils.cloneDeep(options);

    const sql = this.QueryGenerator.arithmeticQuery('+', tableName, values, identifier, options, options.attributes);

    options.type = QueryTypes.UPDATE;
    options.model = model;

    return this._executeQuery(sql, options);
  }

  /**
   * Decrements a record in a table.
   *
   * @param {Model} model - The model instance.
   * @param {String} tableName - The table name to decrement.
   * @param {Object} values - The values to decrement.
   * @param {Object} identifier - The identifier to decrement.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   */
  decrement(model, tableName, values, identifier, options) {
    options = Utils.cloneDeep(options);

    const sql = this.QueryGenerator.arithmeticQuery('-', tableName, values, identifier, options, options.attributes);

    options.type = QueryTypes.UPDATE;
    options.model = model;

    return this._executeQuery(sql, options);
  }

  /**
   * Executes a raw select query.
   *
   * @param {String} tableName - The table name to select from.
   * @param {Object} options - Query options.
   * @param {String} attributeSelector - The attribute selector.
   * @param {Model} Model - The model instance.
   *
   * @return {Promise}
   */
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

    return this._executeQuery(sql, options).then(data => {
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

  /**
   * Creates a trigger.
   *
   * @param {String} tableName - The table name to create the trigger on.
   * @param {String} triggerName - The trigger name.
   * @param {String} timingType - The timing type.
   * @param {Array} fireOnArray - The fire on array.
   * @param {String} functionName - The function name.
   * @param {Array} functionParams - The function parameters.
   * @param {Array} optionsArray - The options array.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   */
  createTrigger(tableName, triggerName, timingType, fireOnArray, functionName, functionParams, optionsArray, options) {
    const sql = this.QueryGenerator.createTrigger(tableName, triggerName, timingType, fireOnArray, functionName, functionParams, optionsArray);
    options = options || {};

    if (sql) {
      return this._executeQuery(sql, options);
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Drops a trigger.
   *
   * @param {String} tableName - The table name to drop the trigger from.
   * @param {String} triggerName - The trigger name.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   */
  dropTrigger(tableName, triggerName, options) {
    const sql = this.QueryGenerator.dropTrigger(tableName, triggerName);
    options = options || {};

    if (sql) {
      return this._executeQuery(sql, options);
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Renames a trigger.
   *
   * @param {String} tableName - The table name to rename the trigger on.
   * @param {String} oldTriggerName - The old trigger name.
   * @param {String} newTriggerName - The new trigger name.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   */
  renameTrigger(tableName, oldTriggerName, newTriggerName, options) {
    const sql = this.QueryGenerator.renameTrigger(tableName, oldTriggerName, newTriggerName);
    options = options || {};

    if (sql) {
      return this._executeQuery(sql, options);
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Creates a SQL function.
   *
   * @param {String} functionName - The function name.
   * @param {Array} params - The function parameters.
   * @param {String} returnType - The return type.
   * @param {String} language - The language.
   * @param {String} body - The function body.
   * @param {Array} optionsArray - The options array.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   */
  createFunction(functionName, params, returnType, language, body, optionsArray, options) {
    const sql = this.QueryGenerator.createFunction(functionName, params, returnType, language, body, optionsArray);
    options = options || {};

    if (sql) {
      return this._executeQuery(sql, options);
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Drops a SQL function.
   *
   * @param {String} functionName - The function name.
   * @param {Array} params - The function parameters.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   */
  dropFunction(functionName, params, options) {
    const sql = this.QueryGenerator.dropFunction(functionName, params);
    options = options || {};

    if (sql) {
      return this._executeQuery(sql, options);
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Renames a SQL function.
   *
   * @param {String} oldFunctionName - The old function name.
   * @param {Array} params - The function parameters.
   * @param {String} newFunctionName - The new function name.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   */
  renameFunction(oldFunctionName, params, newFunctionName, options) {
    const sql = this.QueryGenerator.renameFunction(oldFunctionName, params, newFunctionName);
    options = options || {};

    if (sql) {
      return this._executeQuery(sql, options);
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Quotes an identifier.
   *
   * @param {String} identifier - The identifier to quote.
   * @param {Boolean} force - Whether to force quoting.
   *
   * @return {String}
   * @private
   */
  quoteIdentifier(identifier, force) {
    return this.QueryGenerator.quoteIdentifier(identifier, force);
  }

  /**
   * Quotes a table.
   *
   * @param {String} identifier - The table to quote.
   *
   * @return {String}
   */
  quoteTable(identifier) {
    return this.QueryGenerator.quoteTable(identifier);
  }

  /**
   * Quotes identifiers.
   *
   * @param {Array} identifiers - The identifiers to quote.
   * @param {Boolean} force - Whether to force quoting.
   *
   * @return {Array}
   * @private
   */
  quoteIdentifiers(identifiers, force) {
    return this.QueryGenerator.quoteIdentifiers(identifiers, force);
  }

  /**
   * Escapes a value.
   *
   * @param {String} value - The value to escape.
   *
   * @return {String}
   * @private
   */
  escape(value) {
    return this.QueryGenerator.escape(value);
  }

  /**
   * Sets the autocommit mode for a transaction.
   *
   * @param {Transaction} transaction - The transaction instance.
   * @param {Boolean} value - The autocommit value.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   */
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

    return this._executeQuery(sql, options);
  }

  /**
   * Sets the isolation level for a transaction.
   *
   * @param {Transaction} transaction - The transaction instance.
   * @param {String} value - The isolation level value.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   */
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

    return this._executeQuery(sql, options);
  }

  /**
   * Starts a transaction.
   *
   * @param {Transaction} transaction - The transaction instance.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   */
  startTransaction(transaction, options) {
    if (!transaction || !(transaction instanceof Transaction)) {
      throw new Error('Unable to start a transaction without transaction object!');
    }

    options = _.assign({}, options, {
      transaction: transaction.parent || transaction
    });
    options.transaction.name = transaction.parent ? transaction.name : undefined;
    const sql = this.QueryGenerator.startTransactionQuery(transaction);

    return this._executeQuery(sql, options);
  }

  /**
   * Defers constraints for a transaction.
   *
   * @param {Transaction} transaction - The transaction instance.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   */
  deferConstraints(transaction, options) {
    options = _.assign({}, options, {
      transaction: transaction.parent || transaction
    });

    const sql = this.QueryGenerator.deferConstraintsQuery(options);

    if (sql) {
      return this._executeQuery(sql, options);
    }

    return Promise.resolve();
  }

  /**
   * Commits a transaction.
   *
   * @param {Transaction} transaction - The transaction instance.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   */
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
    const promise = this._executeQuery(sql, options);

    transaction.finished = 'commit';

    return promise;
  }

  /**
   * Rolls back a transaction.
   *
   * @param {Transaction} transaction - The transaction instance.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   */
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
    const promise = this._executeQuery(sql, options);

    transaction.finished = 'rollback';

    return promise;
  }

  /**
   * Executes a query.
   *
   * @param {String} sql - The SQL query to execute.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   * @private
   */
  _executeQuery(sql, options) {
    return this.sequelize.query(sql, options);
  }

  /**
   * Creates a table.
   *
   * @param {String} tableName - The table name to create.
   * @param {Object} attributes - The table attributes.
   * @param {Object} options - Query options.
   * @param {Model} model - The model instance.
   *
   * @return {Promise}
   * @private
   */
  _createTable(tableName, attributes, options, model) {
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
      const promises = [];

      for (i = 0; i < keyLen; i++) {
        const attribute = attributes[keys[i]];
        const type = attribute.type;

        if (
          type instanceof DataTypes.ENUM ||
          (type instanceof DataTypes.ARRAY && type.type instanceof DataTypes.ENUM)
        ) {
          sql = this.QueryGenerator.pgListEnums(tableName, attribute.field || keys[i], options);
          promises.push(this._executeQuery(
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
            (type instanceof DataTypes.ARRAY && enumType instanceof DataTypes.ENUM)
          ) {
            if (!results[enumIdx]) {
              sql = this.QueryGenerator.pgEnum(tableName, attribute.field || keys[i], enumType, options);
              promises.push(this._executeQuery(
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
                  promises.push(this._executeQuery(
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
        sql = this.QueryGenerator.createTableQuery(tableName, attributes, options);

        return Promise.all(promises)
          .tap(() => {
            if (promises.length) {
              return this.sequelize.dialect.connectionManager._refreshDynamicOIDs();
            }
          })
          .then(() => {
            return this._executeQuery(sql, options);
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

      return this._executeQuery(sql, options);
    }
  }

  /**
   * Drops a table.
   *
   * @param {String} tableName - The table name to drop.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   * @private
   */
  _dropTable(tableName, options) {
    options = _.clone(options) || {};
    options.cascade = options.cascade || options.force || false;

    let sql = this.QueryGenerator.dropTableQuery(tableName, options);

    return this._executeQuery(sql, options).then(() => {
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
              promises.push(this._executeQuery(sql, _.assign({}, options, { raw: true })));
            }
          }
        }
      }

      return Promise.all(promises).get(0);
    });
  }

  /**
   * Drops all tables.
   *
   * @param {Array} tableNames - The table names to drop.
   * @param {Object} options - Query options.
   *
   * @return {Promise}
   * @private
   */
  _dropAllTables(tableNames, options) {
    const dropAllTables = tableNames => Promise.each(tableNames, tableName => {
      if (options.skip.indexOf(tableName.tableName || tableName) === -1) {
        return this._dropTable(tableName, _.assign({}, options, { cascade: true }));
      }
    });

    return this.getForeignKeysForTables(tableNames, options).then(foreignKeys => {
      const promises = [];

      tableNames.forEach(tableName => {
        let normalizedTableName = tableName;
        if (_.isObject(tableName)) {
          normalizedTableName = tableName.schema + '.' + tableName.tableName;
        }

        foreignKeys[normalizedTableName].forEach(foreignKey => {
          const sql = this.QueryGenerator.dropForeignKeyQuery(tableName, foreignKey);
          promises.push(this._executeQuery(sql, options));
        });
      });

      return Promise.all(promises).then(() => dropAllTables(tableNames));
    });
  }
}

module.exports = QueryInterface;
module.exports.QueryInterface = QueryInterface;
module.exports.default = QueryInterface;
```