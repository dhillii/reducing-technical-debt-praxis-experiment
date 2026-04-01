```javascript
'use strict';

const Utils = require('../../utils');
const SqlString = require('../../sql-string');
const Model = require('../../model');
const DataTypes = require('../../data-types');
const util = require('util');
const _ = require('lodash');
const Dottie = require('dottie');
const Association = require('../../associations/base');
const BelongsTo = require('../../associations/belongs-to');
const BelongsToMany = require('../../associations/belongs-to-many');
const HasMany = require('../../associations/has-many');
const Op = require('../../operators');
const uuid = require('uuid');
const semver = require('semver');

const QueryGenerator = {
  _templateSettings: require('lodash').runInContext().templateSettings,
  options: {},

  extractTableDetails(tableName, options) {
    options = options || {};
    tableName = tableName || {};
    return {
      schema: tableName.schema || options.schema || 'public',
      tableName: _.isPlainObject(tableName) ? tableName.tableName : tableName,
      delimiter: tableName.delimiter || options.delimiter || '.'
    };
  },

  addSchema(param) {
    const self = this;

    if (!param._schema) return param.tableName || param;

    return {
      tableName: param.tableName || param,
      table: param.tableName || param,
      name: param.name || param,
      schema: param._schema,
      delimiter: param._schemaDelimiter || '.',
      toString() {
        return self.quoteTable(this);
      }
    };
  },

  dropSchema(tableName, options) {
    return this.dropTableQuery(tableName, options);
  },

  describeTableQuery(tableName, schema, schemaDelimiter) {
    const table = this.quoteTable(
      this.addSchema({
        tableName,
        _schema: schema,
        _schemaDelimiter: schemaDelimiter
      })
    );

    return 'DESCRIBE ' + table + ';';
  },

  dropTableQuery(tableName) {
    return `DROP TABLE IF EXISTS ${this.quoteTable(tableName)};`;
  },

  renameTableQuery(before, after) {
    return `ALTER TABLE ${this.quoteTable(before)} RENAME TO ${this.quoteTable(after)};`;
  },

  /**
   * Builds output fragment for INSERT queries
   * @private
   */
  _buildInsertOutputFragment(modelAttributes, options) {
    let outputFragment;
    let tmpTable = '';

    if (!this._dialect.supports.returnValues || !options.returning) {
      return { outputFragment, tmpTable };
    }

    if (this._dialect.supports.returnValues.returning) {
      outputFragment = ' RETURNING *';
    } else if (this._dialect.supports.returnValues.output) {
      outputFragment = ' OUTPUT INSERTED.*';
      tmpTable = this._buildTmpTableForTrigger(modelAttributes, options);
    }

    return { outputFragment, tmpTable };
  },

  /**
   * Builds temporary table declaration for MSSQL triggers
   * @private
   */
  _buildTmpTableForTrigger(modelAttributes, options) {
    if (!modelAttributes || !options.hasTrigger || !this._dialect.supports.tmpTableTrigger) {
      return '';
    }

    let tmpColumns = '';
    for (const modelKey in modelAttributes) {
      const attribute = modelAttributes[modelKey];
      if (attribute.type instanceof DataTypes.VIRTUAL) continue;

      if (tmpColumns.length > 0) {
        tmpColumns += ',';
      }
      tmpColumns += this.quoteIdentifier(attribute.field) + ' ' + attribute.type.toSql();
    }

    const tmpTable = 'declare @tmp table (<%= columns %>); ';
    const replacement = { columns: tmpColumns };
    return _.template(tmpTable, this._templateSettings)(replacement).trim();
  },

  /**
   * Builds output columns for MSSQL trigger output
   * @private
   */
  _buildTriggerOutputColumns(modelAttributes) {
    let outputColumns = '';
    for (const modelKey in modelAttributes) {
      const attribute = modelAttributes[modelKey];
      if (attribute.type instanceof DataTypes.VIRTUAL) continue;

      if (outputColumns.length > 0) {
        outputColumns += ',';
      }
      outputColumns += 'INSERTED.' + this.quoteIdentifier(attribute.field);
    }
    return outputColumns;
  },

  /**
   * Handles exception wrapping for PostgreSQL
   * @private
   */
  _wrapInsertQueryWithException(valueQuery, options) {
    if (!this._dialect.supports.EXCEPTION || !options.exception) {
      return valueQuery;
    }

    if (semver.gte(this.sequelize.options.databaseVersion, '9.2.0')) {
      return this._buildPostgresExceptionWrapper(valueQuery, options);
    }

    return this._buildPostgresLegacyExceptionWrapper(valueQuery, options);
  },

  /**
   * Builds PostgreSQL 9.2+ exception wrapper
   * @private
   */
  _buildPostgresExceptionWrapper(valueQuery, options) {
    const delimiter = '$func_' + uuid.v4().replace(/-/g, '') + '$';
    options.exception = 'WHEN unique_violation THEN GET STACKED DIAGNOSTICS sequelize_caught_exception = PG_EXCEPTION_DETAIL;';
    
    return 'CREATE OR REPLACE FUNCTION pg_temp.testfunc(OUT response <%= table %>, OUT sequelize_caught_exception text) RETURNS RECORD AS ' + delimiter +
      ' BEGIN ' + valueQuery + ' INTO response; EXCEPTION ' + options.exception + ' END ' + delimiter +
      ' LANGUAGE plpgsql; SELECT (testfunc.response).*, testfunc.sequelize_caught_exception FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc()';
  },

  /**
   * Builds PostgreSQL legacy exception wrapper
   * @private
   */
  _buildPostgresLegacyExceptionWrapper(valueQuery, options) {
    options.exception = 'WHEN unique_violation THEN NULL;';
    return 'CREATE OR REPLACE FUNCTION pg_temp.testfunc() RETURNS SETOF <%= table %> AS $body$ BEGIN RETURN QUERY ' + valueQuery + '; EXCEPTION ' + options.exception + ' END; $body$ LANGUAGE plpgsql; SELECT * FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc();';
  },

  /**
   * Processes value hash for INSERT query
   * @private
   */
  _processInsertValues(valueHash, modelAttributeMap, options) {
    const fields = [];
    const values = [];
    let identityWrapperRequired = false;

    valueHash = Utils.removeNullValuesFromHash(valueHash, this.options.omitNull);

    for (const key in valueHash) {
      if (!valueHash.hasOwnProperty(key)) continue;

      const value = valueHash[key];
      fields.push(this.quoteIdentifier(key));

      const result = this._processInsertValue(key, value, modelAttributeMap);
      if (result.skip) {
        fields.splice(-1, 1);
        continue;
      }

      values.push(result.value);
      if (result.identityWrapperRequired) {
        identityWrapperRequired = true;
      }
    }

    return { fields, values, identityWrapperRequired };
  },

  /**
   * Processes a single INSERT value
   * @private
   */
  _processInsertValue(key, value, modelAttributeMap) {
    const attr = modelAttributeMap && modelAttributeMap[key];
    const isAutoIncrement = attr && attr.autoIncrement === true;

    if (isAutoIncrement && !value) {
      return this._handleAutoIncrementNull();
    }

    if (isAutoIncrement) {
      return {
        value: this.escape(value, attr, { context: 'INSERT' }),
        identityWrapperRequired: true,
        skip: false
      };
    }

    return {
      value: this.escape(value, attr, { context: 'INSERT' }),
      identityWrapperRequired: false,
      skip: false
    };
  },

  /**
   * Handles NULL value for auto-increment column
   * @private
   */
  _handleAutoIncrementNull() {
    if (!this._dialect.supports.autoIncrement.defaultValue) {
      return { skip: true, value: null, identityWrapperRequired: false };
    }

    if (this._dialect.supports.DEFAULT) {
      return { skip: false, value: 'DEFAULT', identityWrapperRequired: false };
    }

    return { skip: false, value: this.escape(null), identityWrapperRequired: false };
  },

  /**
   * Wraps query with identity insert if needed
   * @private
   */
  _wrapWithIdentityInsert(query, table, identityWrapperRequired) {
    if (!identityWrapperRequired || !this._dialect.supports.autoIncrement.identityInsert) {
      return query;
    }

    return [
      'SET IDENTITY_INSERT', this.quoteTable(table), 'ON;',
      query,
      'SET IDENTITY_INSERT', this.quoteTable(table), 'OFF;'
    ].join(' ');
  },

  insertQuery(table, valueHash, modelAttributes, options) {
    options = options || {};
    _.defaults(options, this.options);

    const modelAttributeMap = {};
    if (modelAttributes) {
      _.each(modelAttributes, (attribute, key) => {
        modelAttributeMap[key] = attribute;
        if (attribute.field) {
          modelAttributeMap[attribute.field] = attribute;
        }
      });
    }

    let valueQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>';
    let emptyQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %><%= output %><%= onConflictDoNothing %>';

    if (this._dialect.supports['DEFAULT VALUES']) {
      emptyQuery += ' DEFAULT VALUES';
    } else if (this._dialect.supports['VALUES ()']) {
      emptyQuery += ' VALUES ()';
    }

    const { outputFragment, tmpTable } = this._buildInsertOutputFragment(modelAttributes, options);

    if (outputFragment && this._dialect.supports.returnValues.output && modelAttributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
      const outputColumns = this._buildTriggerOutputColumns(modelAttributes);
      const selectFromTmp = ';select * from @tmp';
      valueQuery += ' OUTPUT ' + outputColumns + ' into @tmp' + selectFromTmp;
      emptyQuery += ' OUTPUT ' + outputColumns + ' into @tmp' + selectFromTmp;
    } else if (outputFragment) {
      valueQuery += outputFragment;
      emptyQuery += outputFragment;
    }

    valueQuery = this._wrapInsertQueryWithException(valueQuery, options);

    if (this._dialect.supports['ON DUPLICATE KEY'] && options.onDuplicate) {
      valueQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
      emptyQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
    }

    const { fields, values, identityWrapperRequired } = this._processInsertValues(valueHash, modelAttributeMap, options);

    const replacements = {
      ignoreDuplicates: options.ignoreDuplicates ? this._dialect.supports.IGNORE : '',
      onConflictDoNothing: options.ignoreDuplicates ? this._dialect.supports.onConflictDoNothing : '',
      table: this.quoteTable(table),
      attributes: fields.join(','),
      output: outputFragment || '',
      values: values.join(','),
      tmpTable
    };

    let query = (replacements.attributes.length ? valueQuery : emptyQuery) + ';';
    query = this._wrapWithIdentityInsert(query, table, identityWrapperRequired);

    return _.template(query, this._templateSettings)(replacements);
  },

  bulkInsertQuery(tableName, fieldValueHashes, options, fieldMappedAttributes) {
    options = options || {};
    fieldMappedAttributes = fieldMappedAttributes || {};

    const query = 'INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>) VALUES <%= tuples %><%= onDuplicateKeyUpdate %><%= onConflictDoNothing %><%= returning %>;';
    const tuples = [];
    const serials = {};
    const allAttributes = [];
    let onDuplicateKeyUpdate = '';

    for (const fieldValueHash of fieldValueHashes) {
      _.forOwn(fieldValueHash, (value, key) => {
        if (allAttributes.indexOf(key) === -1) {
          allAttributes.push(key);
        }
        if (fieldMappedAttributes[key] && fieldMappedAttributes[key].autoIncrement === true) {
          serials[key] = true;
        }
      });
    }

    for (const fieldValueHash of fieldValueHashes) {
      const values = allAttributes.map(key => {
        if (this._dialect.supports.bulkDefault && serials[key] === true) {
          return fieldValueHash[key] || 'DEFAULT';
        }
        return this.escape(fieldValueHash[key], fieldMappedAttributes[key], { context: 'INSERT' });
      });

      tuples.push(`(${values.join(',')})`);
    }

    if (this._dialect.supports.updateOnDuplicate && options.updateOnDuplicate) {
      onDuplicateKeyUpdate = ' ON DUPLICATE KEY UPDATE ' + options.updateOnDuplicate.map(attr => {
        const key = this.quoteIdentifier(attr);
        return key + '=VALUES(' + key + ')';
      }).join(',');
    }

    const replacements = {
      ignoreDuplicates: options.ignoreDuplicates ? this._dialect.supports.ignoreDuplicates : '',
      table: this.quoteTable(tableName),
      attributes: allAttributes.map(attr => this.quoteIdentifier(attr)).join(','),
      tuples: tuples.join(','),
      onDuplicateKeyUpdate,
      returning: this._dialect.supports.returnValues && options.returning ? ' RETURNING *' : '',
      onConflictDoNothing: options.ignoreDuplicates ? this._dialect.supports.onConflictDoNothing : ''
    };

    return _.template(query, this._templateSettings)(replacements);
  },

  /**
   * Builds output fragment for UPDATE queries
   * @private
   */
  _buildUpdateOutputFragment(attributes, options) {
    let outputFragment;
    let tmpTable = '';
    let selectFromTmp = '';

    if (!this._dialect.supports.returnValues) {
      return { outputFragment, tmpTable, selectFromTmp };
    }

    if (this._dialect.supports.returnValues.output) {
      outputFragment = ' OUTPUT INSERTED.*';

      if (attributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
        tmpTable = 'declare @tmp table (<%= columns %>); ';
        let tmpColumns = '';
        let outputColumns = '';

        for (const modelKey in attributes) {
          const attribute = attributes[modelKey];
          if (attribute.type instanceof DataTypes.VIRTUAL) continue;

          if (tmpColumns.length > 0) {
            tmpColumns += ',';
            outputColumns += ',';
          }

          tmpColumns += this.quoteIdentifier(attribute.field) + ' ' + attribute.type.toSql();
          outputColumns += 'INSERTED.' + this.quoteIdentifier(attribute.field);
        }

        const replacement = { columns: tmpColumns };
        tmpTable = _.template(tmpTable, this._templateSettings)(replacement).trim();
        outputFragment = ' OUTPUT ' + outputColumns + ' into @tmp';
        selectFromTmp = ';select * from @tmp';
      }
    } else if (this._dialect.supports.returnValues && options.returning) {
      options.mapToModel = true;
      outputFragment = ' RETURNING *';
    }

    return { outputFragment, tmpTable, selectFromTmp };
  },

  /**
   * Processes UPDATE values
   * @private
   */
  _processUpdateValues(attrValueHash, modelAttributeMap) {
    const values = [];

    for (const key in attrValueHash) {
      if (!this._canUpdateAttribute(key, modelAttributeMap)) {
        continue;
      }

      const value = attrValueHash[key];
      values.push(this.quoteIdentifier(key) + '=' + this.escape(value, modelAttributeMap && modelAttributeMap[key], { context: 'UPDATE' }));
    }

    return values;
  },

  /**
   * Checks if attribute can be updated
   * @private
   */
  _canUpdateAttribute(key, modelAttributeMap) {
    if (!modelAttributeMap || !modelAttributeMap[key]) {
      return true;
    }

    const attr = modelAttributeMap[key];
    return !(attr.autoIncrement === true && !this._dialect.supports.autoIncrement.update);
  },

  updateQuery(tableName, attrValueHash, where, options, attributes) {
    options = options || {};
    _.defaults(options, this.options);

    attrValueHash = Utils.removeNullValuesFromHash(attrValueHash, options.omitNull, options);

    const modelAttributeMap = {};
    if (attributes) {
      _.each(attributes, (attribute, key) => {
        modelAttributeMap[key] = attribute;
        if (attribute.field) {
          modelAttributeMap[attribute.field] = attribute;
        }
      });
    }

    let query = '<%= tmpTable %>UPDATE <%= table %> SET <%= values %><%= output %> <%= where %>';

    if (this._dialect.supports['LIMIT ON UPDATE'] && options.limit && this.dialect !== 'mssql') {
      query += ' LIMIT ' + this.escape(options.limit) + ' ';
    }

    const { outputFragment, tmpTable, selectFromTmp } = this._buildUpdateOutputFragment(attributes, options);

    if (selectFromTmp) {
      query += selectFromTmp;
    }

    const values = this._processUpdateValues(attrValueHash, modelAttributeMap);

    if (values.length === 0) {
      return '';
    }

    const replacements = {
      table: this.quoteTable(tableName),
      values: values.join(','),
      output: outputFragment || '',
      where: this.whereQuery(where, options),
      tmpTable
    };

    return _.template(query, this._templateSettings)(replacements).trim();
  },

  arithmeticQuery(operator, tableName, attrValueHash, where, options, attributes) {
    options = options || {};
    _.defaults(options, { returning: true });

    attrValueHash = Utils.removeNullValuesFromHash(attrValueHash, this.options.omitNull);

    const values = [];
    let query = 'UPDATE <%= table %> SET <%= values %><%= output %> <%= where %>';
    let outputFragment;

    if (this._dialect.supports.returnValues && options.returning) {
      if (this._dialect.supports.returnValues.returning) {
        options.mapToModel = true;
        query += ' RETURNING *';
      } else if (this._dialect.supports.returnValues.output) {
        outputFragment = ' OUTPUT INSERTED.*';
      }
    }

    for (const key in attrValueHash) {
      const value = attrValueHash[key];
      values.push(this.quoteIdentifier(key) + '=' + this.quoteIdentifier(key) + operator + ' ' + this.escape(value));
    }

    attributes = attributes || {};
    for (const key in attributes) {
      const value = attributes[key];
      values.push(this.quoteIdentifier(key) + '=' + this.escape(value));
    }

    const replacements = {
      table: this.quoteTable(tableName),
      values: values.join(','),
      output: outputFragment,
      where: this.whereQuery(where)
    };

    return _.template(query, this._templateSettings)(replacements);
  },

  nameIndexes(indexes, rawTablename) {
    if (typeof rawTablename === 'object') {
      rawTablename = rawTablename.tableName;
    }

    return _.map(indexes, index => {
      if (!index.hasOwnProperty('name')) {
        const onlyAttributeNames = index.fields.map(field => typeof field === 'string' ? field : field.name || field.attribute);
        index.name = Utils.underscore(rawTablename + '_' + onlyAttributeNames.join('_'));
      }

      return index;
    });
  },

  /**
   * Processes index field definition
   * @private
   */
  _processIndexField(field) {
    if (typeof field === 'string') {
      return this.quoteIdentifier(field);
    }

    if (field instanceof Utils.SequelizeMethod) {
      return this.handleSequelizeMethod(field);
    }

    return this._buildIndexFieldDefinition(field);
  },

  /**
   * Builds index field definition with collation and order
   * @private
   */
  _buildIndexFieldDefinition(field) {
    let result = '';

    if (field.attribute) {
      field.name = field.attribute;
    }

    if (!field.name) {
      throw new Error('The following index field has no name: ' + util.inspect(field));
    }

    result += this.quoteIdentifier(field.name);

    if (this._dialect.supports.index.collate && field.collate) {
      result += ' COLLATE ' + this.quoteIdentifier(field.collate);
    }

    if (this._dialect.supports.index.length && field.length) {
      result += '(' + field.length + ')';
    }

    if (field.order) {
      result += ' ' + field.order;
    }

    return result;
  },

  /**
   * Normalizes index options
   * @private
   */
  _normalizeIndexOptions(options, rawTablename, tableName) {
    if (!options.name) {
      options = this.nameIndexes([options], options.prefix)[0];
    }

    options = Model._conformIndex(options);

    if (!this._dialect.supports.index.type) {
      delete options.type;
    }

    if (options.where) {
      options.where = this.whereQuery(options.where);
    }

    if (_.isString(tableName)) {
      tableName = this.quoteIdentifiers(tableName);
    } else {
      tableName = this.quoteTable(tableName);
    }

    return { options, tableName };
  },

  /**
   * Builds index SQL parts
   * @private
   */
  _buildIndexSqlParts(options, tableName, fieldsSql) {
    const concurrently = this._dialect.supports.index.concurrently && options.concurrently ? 'CONCURRENTLY' : undefined;
    let ind;

    if (this._dialect.supports.indexViaAlter) {
      ind = ['ALTER TABLE', tableName, concurrently, 'ADD'];
    } else {
      ind = ['CREATE'];
    }

    ind = ind.concat(
      options.unique ? 'UNIQUE' : '',
      options.type,
      'INDEX',
      !this._dialect.supports.indexViaAlter ? concurrently : undefined,
      this.quoteIdentifiers(options.name),
      this._dialect.supports.index.using === 1 && options.using ? 'USING ' + options.using : '',
      !this._dialect.supports.indexViaAlter ? 'ON ' + tableName : undefined,
      this._dialect.supports.index.using === 2 && options.using ? 'USING ' + options.using : '',
      '(' + fieldsSql.join(', ') + (options.operator ? ' ' + options.operator : '') + ')',
      this._dialect.supports.index.parser && options.parser ? 'WITH PARSER ' + options.parser : undefined,
      this._dialect.supports.index.where && options.where ? options.where : undefined
    );

    return ind;
  },

  addIndexQuery(tableName, attributes, options, rawTablename) {
    options = options || {};

    if (!Array.isArray(attributes)) {
      options = attributes;
      attributes = undefined;
    } else {
      options.fields = attributes;
    }

    if (options.indexName) {
      options.name = options.indexName;
    }
    if (options.indicesType) {
      options.type = options.indicesType;
    }
    if (options.indexType || options.method) {
      options.using = options.indexType || options.method;
    }

    options.prefix = options.prefix || rawTablename || tableName;
    if (options.prefix && _.isString(options.prefix)) {
      options.prefix = options.prefix.replace(/\./g, '_');
      options.prefix = options.prefix.replace(/(\"|\')/g, '');
    }

    const fieldsSql = options.fields.map(field => this._processIndexField(field));

    const { options: normalizedOptions, tableName: quotedTableName } = this._normalizeIndexOptions(options, rawTablename, tableName);

    const ind = this._buildIndexSqlParts(normalizedOptions, quotedTableName, fieldsSql);

    return _.compact(ind).join(' ');
  },

  addConstraintQuery(tableName, options) {
    options = options || {};
    const constraintSnippet = this.getConstraintSnippet(tableName, options);

    if (typeof tableName === 'string') {
      tableName = this.quoteIdentifiers(tableName);
    } else {
      tableName = this.quoteTable(tableName);
    }

    return `ALTER TABLE ${tableName} ADD ${constraintSnippet};`;
  },

  /**
   * Processes constraint field definition
   * @private
   */
  _processConstraintField(field) {
    if (typeof field === 'string') {
      return this.quoteIdentifier(field);
    }

    if (field._isSequelizeMethod) {
      return this.handleSequelizeMethod(field);
    }

    if (field.attribute) {
      field.name = field.attribute;
    }

    if (!field.name) {
      throw new Error('The following index field has no name: ' + field);
    }

    return this.quoteIdentifier(field.name);
  },

  /**
   * Builds UNIQUE constraint snippet
   * @private
   */
  _buildUniqueConstraint(tableName, options, fieldsSqlQuotedString, fieldsSqlString) {
    const constraintName = this.quoteIdentifier(options.name || `${tableName}_${fieldsSqlString}_uk`);
    return `CONSTRAINT ${constraintName} UNIQUE (${fieldsSqlQuotedString})`;
  },

  /**
   * Builds CHECK constraint snippet
   * @private
   */
  _buildCheckConstraint(tableName, options, fieldsSqlString) {
    options.where = this.whereItemsQuery(options.where);
    const constraintName = this.quoteIdentifier(options.name || `${tableName}_${fieldsSqlString}_ck`);
    return `CONSTRAINT ${constraintName} CHECK (${options.where})`;
  },

  /**
   * Builds DEFAULT constraint snippet
   * @private
   */
  _buildDefaultConstraint(tableName, options, fieldsSqlString, fieldsSql) {
    if (options.defaultValue === undefined) {
      throw new Error('Default value must be specifed for DEFAULT CONSTRAINT');
    }

    if (this._dialect.name !== 'mssql') {
      throw new Error('Default constraints are supported only for MSSQL dialect.');
    }

    const constraintName = this.quoteIdentifier(options.name || `${tableName}_${fieldsSqlString}_df`);
    return `CONSTRAINT ${constraintName} DEFAULT (${this.escape(options.defaultValue)}) FOR ${fieldsSql[0]}`;
  },

  /**
   * Builds PRIMARY KEY constraint snippet
   * @private
   */
  _buildPrimaryKeyConstraint(tableName, options, fieldsSqlQuotedString, fieldsSqlString) {
    const constraintName = this.quoteIdentifier(options.name || `${tableName}_${fieldsSqlString}_pk`);
    return `CONSTRAINT ${constraintName} PRIMARY KEY (${fieldsSqlQuotedString})`;
  },

  /**
   * Builds FOREIGN KEY constraint snippet
   * @private
   */
  _buildForeignKeyConstraint(tableName, options, fieldsSqlQuotedString, fieldsSqlString) {
    const references = options.references;
    if (!references || !references.table || !references.field) {
      throw new Error('references object with table and field must be specified');
    }

    const constraintName = this.quoteIdentifier(options.name || `${tableName}_${fieldsSqlString}_${references.table}_fk`);
    const referencesSnippet = `${this.quoteTable(references.table)} (${this.quoteIdentifier(references.field)})`;
    let constraintSnippet = `CONSTRAINT ${constraintName} FOREIGN KEY (${fieldsSqlQuotedString}) REFERENCES ${referencesSnippet}`;

    if (options.onUpdate) {
      constraintSnippet += ` ON UPDATE ${options.onUpdate.toUpperCase()}`;
    }
    if (options.onDelete) {
      constraintSnippet += ` ON DELETE ${options.onDelete.toUpperCase()}`;
    }

    return constraintSnippet;
  },

  getConstraintSnippet(tableName, options) {
    const fieldsSql = options.fields.map(field => this._processConstraintField(field));
    const fieldsSqlQuotedString = fieldsSql.join(', ');
    const fieldsSqlString = fieldsSql.join('_');

    switch (options.type.toUpperCase()) {
      case 'UNIQUE':
        return this._buildUniqueConstraint(tableName, options, fieldsSqlQuotedString, fieldsSqlString);
      case 'CHECK':
        return this._buildCheckConstraint(tableName, options, fieldsSqlString);
      case 'DEFAULT':
        return this._buildDefaultConstraint(tableName, options, fieldsSqlString, fieldsSql);
      case 'PRIMARY KEY':
        return this._buildPrimaryKeyConstraint(tableName, options, fieldsSqlQuotedString, fieldsSqlString);
      case 'FOREIGN KEY':
        return this._buildForeignKeyConstraint(tableName, options, fieldsSqlQuotedString, fieldsSqlString);
      default:
        throw new Error(`${options.type} is invalid.`);
    }
  },

  removeConstraintQuery(tableName, constraintName) {
    return `ALTER TABLE ${this.quoteIdentifiers(tableName)} DROP CONSTRAINT ${this.quoteIdentifiers(constraintName)}`;
  },

  /**
   * Quotes table with schema support
   * @private
   */
  _quoteTableWithSchema(param) {
    let table = '';

    if (this._dialect.supports.schemas) {
      if (param.schema) {
        table += this.quoteIdentifier(param.schema) + '.';
      }
      table += this.quoteIdentifier(param.tableName);
    } else {
      if (param.schema) {
        table += param.schema + (param.delimiter || '.');
      }
      table += param.tableName;
      table = this.quoteIdentifier(table);
    }

    return table;
  },

  quoteTable(param, as) {
    let table = '';

    if (as === true) {
      as = param.as || param.name || param;
    }

    if (_.isObject(param)) {
      table = this._quoteTableWithSchema(param);
    } else {
      table = this.quoteIdentifier(param);
    }

    if (as) {
      table += ' AS ' + this.quoteIdentifier(as);
    }

    return table;
  },

  /**
   * Checks if item is a model class
   * @private
   */
  _isModel(item) {
    return typeof item === 'function' && item.prototype instanceof Model;
  },

  /**
   * Checks if item is a model object
   * @private
   */
  _isModelObject(item) {
    return _.isPlainObject(item) && item.model && this._isModel(item.model);
  },

  /**
   * Processes collection item into association
   * @private
   */
  _processCollectionItem(item, previousModel, previousAssociation) {
    if (!previousModel || !previousModel.prototype instanceof Model) {
      return item;
    }

    let model;
    let as;

    if (this._isModel(item)) {
      model = item;
    } else if (this._isModelObject(item)) {
      model = item.model;
      as = item.as;
    }

    if (!model) {
      return item;
    }

    if (!as && previousAssociation && previousAssociation instanceof Association && previousAssociation.through && previousAssociation.through.model === model) {
      return new Association(previousModel, model, { as: model.name });
    }

    let association = previousModel.getAssociationForAlias(model, as);

    if (!association) {
      association = previousModel.getAssociationForAlias(model, model.name);
    }

    if (!(association instanceof Association)) {
      throw new Error(util.format('Unable to find a valid association for model, \'%s\'', model.name));
    }

    return association;
  },

  /**
   * Processes string item in collection
   * @private
   */
  _processStringCollectionItem(item, index, previousModel, validOrderOptions) {
    const orderIndex = validOrderOptions.indexOf(item.toUpperCase());

    if (index > 0 && orderIndex !== -1) {
      return this.sequelize.literal(' ' + validOrderOptions[orderIndex]);
    }

    if (!previousModel || !previousModel.prototype instanceof Model) {
      return item;
    }

    if (previousModel.associations && previousModel.associations[item]) {
      return previousModel.associations[item];
    }

    if (previousModel.rawAttributes && previousModel.rawAttributes[item] && item !== previousModel.rawAttributes[item].field) {
      return previousModel.rawAttributes[item].field;
    }

    return this._processJsonPathItem(item, previousModel);
  },

  /**
   * Processes JSON path extraction
   * @private
   */
  _processJsonPathItem(item, previousModel) {
    if (item.indexOf('.') === -1 || !previousModel.rawAttributes) {
      return item;
    }

    const itemSplit = item.split('.');
    const firstAttr = previousModel.rawAttributes[itemSplit[0]];

    if (!firstAttr || !(firstAttr.type instanceof DataTypes.JSON)) {
      return item;
    }

    const identifier = this.quoteIdentifiers(previousModel.name + '.' + firstAttr.field);
    const path = itemSplit.slice(1);
    const extractedPath = this.jsonPathExtractionQuery(identifier, path);

    return this.sequelize.literal(extractedPath);
  },

  /**
   * Checks if item is string or method
   * @private
   */
  _isStringOrMethod(item) {
    return typeof item === 'string' || item._modelAttribute || item instanceof Utils.SequelizeMethod;
  },

  /**
   * Builds quoted table names from collection
   * @private
   */
  _buildTableNamesFromCollection(collection) {
    const tableNames = [];

    for (let i = 0; i < collection.length - 1; i++) {
      const item = collection[i];

      if (this._isStringOrMethod(item)) {
        return { tableNames, breakIndex: i };
      }

      if (item instanceof Association) {
        tableNames[i] = item.as;
      }
    }

    return { tableNames, breakIndex: collection.length - 1 };
  },

  /**
   * Builds SQL from collection items
   * @private
   */
  _buildSqlFromCollection(collection, tableNames, breakIndex, parent) {
    let sql = '';

    if (breakIndex > 0) {
      sql += this.quoteIdentifier(tableNames.join('.')) + '.';
    } else if (typeof collection[0] === 'string' && parent) {
      sql += this.quoteIdentifier(parent.name) + '.';
    }

    collection.slice(breakIndex).forEach(collectionItem => {
      sql += this.quote(collectionItem, parent, '.');
    }, this);

    return sql;
  },

  quote(collection, parent, connector) {
    const validOrderOptions = [
      'ASC', 'DESC', 'ASC NULLS LAST', 'DESC NULLS LAST',
      'ASC NULLS FIRST', 'DESC NULLS FIRST', 'NULLS FIRST', 'NULLS LAST'
    ];

    connector = connector || '.';

    if (typeof collection === 'string') {
      return this.quoteIdentifiers(collection);
    }

    if (Array.isArray(collection)) {
      return this._processArrayCollection(collection, parent, validOrderOptions, connector);
    }

    if (collection._modelAttribute) {
      return this.quoteTable(collection.Model.name) + '.' + this.quoteIdentifier(collection.fieldName);
    }

    if (collection instanceof Utils.SequelizeMethod) {
      return this.handleSequelizeMethod(collection);
    }

    if (_.isPlainObject(collection) && collection.raw) {
      throw new Error('The `{raw: "..."}` syntax is no longer supported.  Use `sequelize.literal` instead.');
    }

    throw new Error('Unknown structure passed to order / group: ' + util.inspect(collection));
  },

  /**
   * Processes array collection for quoting
   * @private
   */
  _processArrayCollection(collection, parent, validOrderOptions, connector) {
    collection.forEach((item, index) => {
      const previous = collection[index - 1];
      let previousAssociation;
      let previousModel;

      if (!previous && parent !== undefined) {
        previousModel = parent;
      } else if (previous && previous instanceof Association) {
        previousAssociation = previous;
        previousModel = previous.target;
      }

      if (typeof item === 'string') {
        collection[index] = this._processStringCollectionItem(item, index, previousModel, validOrderOptions);
      } else if (previousModel) {
        collection[index] = this._processCollectionItem(item, previousModel, previousAssociation);
      }
    }, this);

    const { tableNames, breakIndex } = this._buildTableNamesFromCollection(collection);
    return this._buildSqlFromCollection(collection, tableNames, breakIndex, parent);
  },

  quoteIdentifiers(identifiers) {
    if (identifiers.indexOf('.') !== -1) {
      identifiers = identifiers.split('.');
      return this.quoteIdentifier(identifiers.slice(0, identifiers.length - 1).join('.')) + '.' + this.quoteIdentifier(identifiers[identifiers.length - 1]);
    } else {
      return this.quoteIdentifier(identifiers);
    }
  },

  /**
   * Handles field type validation and stringification
   * @private
   */
  _handleFieldTypeProcessing(value, field, options) {
    if (!field || !field.type) {
      return value;
    }

    if (this.typeValidation && field.type.validate && value) {
      this._validateFieldValue(value, field, options);
    }

    if (field.type.stringify) {
      return this._stringifyFieldValue(value, field, options);
    }

    return value;
  },

  /**
   * Validates field value
   * @private
   */
  _validateFieldValue(value, field, options) {
    if (options.isList && Array.isArray(value)) {
      for (const item of value) {
        field.type.validate(item, options);
      }
    } else {
      field.type.validate(value, options);
    }
  },

  /**
   * Stringifies field value
   * @private
   */
  _stringifyFieldValue(value, field, options) {
    const simpleEscape = _.partialRight(SqlString.escape, this.options.timezone, this.dialect);
    const stringified = field.type.stringify(value, { escape: simpleEscape, field, timezone: this.options.timezone, operation: options.operation });

    if (field.type.escape === false) {
      return stringified;
    }

    return null;
  },

  escape(value, field, options) {
    options = options || {};

    if (value === null || value === undefined) {
      return SqlString.escape(value, this.options.timezone, this.dialect);
    }

    if (value instanceof Utils.SequelizeMethod) {
      return this.handleSequelizeMethod(value);
    }

    const processed = this._handleFieldTypeProcessing(value, field, options);
    if (processed !== value && field && field.type && field.type.stringify) {
      return processed;
    }

    return SqlString.escape(value, this.options.timezone, this.dialect);
  },

  /**
   * Determines if subquery is needed
   * @private
   */
  _shouldUseSubQuery(limit, hasMultiAssociation, subQuery) {
    if (subQuery !== undefined) {
      return subQuery;
    }
    return limit && hasMultiAssociation;
  },

  /**
   * Ensures primary keys in subquery attributes
   * @private
   */
  _ensurePrimaryKeysInSubQuery(attributes, mainTable) {
    if (!mainTable.model || !mainTable.model.primaryKeyAttributes) {
      return;
    }

    for (const keyAtt of mainTable.model.primaryKeyAttributes) {
      if (!_.find(attributes, attr => keyAtt === attr || keyAtt === attr[0] || keyAtt === attr[1])) {
        const field = mainTable.model.rawAttributes[keyAtt].field;
        attributes.push(field ? [keyAtt, field] : keyAtt);
      }
    }
  },

  /**
   * Processes include options
   * @private
   */
  _processIncludeOptions(options, mainTable, topLevelInfo) {
    const mainJoinQueries = [];
    const subJoinQueries = [];

    if (!options.include) {
      return { mainJoinQueries, subJoinQueries };
    }

    for (const include of options.include) {
      if (include.separate) {
        continue;
      }

      const joinQueries = this.generateInclude(include, { externalAs: mainTable.as, internalAs: mainTable.as }, topLevelInfo);

      subJoinQueries.push(...joinQueries.subQuery.split(''));
      mainJoinQueries.push(...joinQueries.mainQuery.split(''));
    }

    return { mainJoinQueries, subJoinQueries };
  },

  /**
   * Handles grouped limit query generation
   * @private
   */
  _handleGroupedLimitQuery(options, mainTable, tableName, model, topLevelInfo) {
    if (!options.groupedLimit) {
      return null;
    }

    if (!mainTable.as) {
      mainTable.as = mainTable.quotedName;
    }

    const where = Object.assign({}, options.where);
    const groupedLimitOptions = this._buildGroupedLimitOptions(options, model);

    if (groupedLimitOptions.include) {
      options.hasJoin = true;
      options.hasMultiAssociation = true;
      options.includeMap = Object.assign(groupedLimitOptions.includeMap, options.includeMap);
      options.includeNames = groupedLimitOptions.includeNames.concat(options.includeNames || []);
    }

    const groupedLimitOrder = this._processGroupedLimitOrder(options);
    const baseQuery = this._buildGroupedLimitBaseQuery(tableName, options, model, groupedLimitOrder, where, groupedLimitOptions.include);

    return { baseQuery, where, groupedLimitOrder, groupedLimitOptions };
  },

  /**
   * Builds grouped limit options
   * @private
   */
  _buildGroupedLimitOptions(options, model) {
    const result = {
      include: null,
      includeMap: {},
      includeNames: []
    };

    if (!options.groupedLimit.on || !(options.groupedLimit.on instanceof BelongsToMany)) {
      return result;
    }

    const groupedLimitOptions = Model._validateIncludedElements({
      include: [{
        association: options.groupedLimit.on.manyFromSource,
        duplicating: false,
        required: true,
        where: Object.assign({
          [Op.placeholder]: true
        }, options.groupedLimit.through && options.groupedLimit.through.where)
      }],
      model
    });

    result.include = groupedLimitOptions.include;
    result.includeMap = groupedLimitOptions.includeMap;
    result.includeNames = groupedLimitOptions.includeNames;

    return result;
  },

  /**
   * Processes grouped limit order
   * @private
   */
  _processGroupedLimitOrder(options) {
    if (!Array.isArray(options.order)) {
      return options.order;
    }

    options.order.forEach((order, i) => {
      if (Array.isArray(order)) {
        order = order[0];
      }

      const alias = `subquery_order_${i}`;
      options.attributes.push([order, alias]);

      const quotedAlias = this.sequelize.literal(this.quote(alias));

      if (Array.isArray(options.order[i])) {
        options.order[i][0] = quotedAlias;
      } else {
        options.order[i] = quotedAlias;
      }
    });

    return options.order;
  },

  /**
   * Builds grouped limit base query
   * @private
   */
  _buildGroupedLimitBaseQuery(tableName, options, model, groupedLimitOrder, where, include) {
    return 'SELECT * FROM (' + this.selectQuery(
      tableName,
      {
        attributes: options.attributes,
        limit: options.groupedLimit.limit,
        offset: options.offset,
        order: groupedLimitOrder,
        where,
        include,
        model
      },
      model
    ).replace(/;$/, '') + ') AS sub';
  },

  /**
   * Gets where key for grouped limit
   * @private
   */
  _getGroupedLimitWhereKey(options) {
    if (typeof options.groupedLimit.on === 'string') {
      return options.groupedLimit.on;
    }

    if (options.groupedLimit.on instanceof HasMany) {
      return options.groupedLimit.on.foreignKeyField;
    }

    return null;
  },

  /**
   * Builds grouped where condition
   * @private
   */
  _buildGroupedWhere(whereKey, value, options) {
    if (whereKey) {
      return { [whereKey]: value };
    }

    if (options.groupedLimit.on instanceof BelongsToMany) {
      return { [options.groupedLimit.on.foreignIdentifierField]: value };
    }

    return null;
  },

  selectQuery(tableName, options, model) {
    options = options || {};
    const limit = options.limit;
    const mainQueryItems = [];
    const subQueryItems = [];
    const subQuery = this._shouldUseSubQuery(limit, options.hasMultiAssociation, options.subQuery);
    const attributes = {
      main: options.attributes && options.attributes.slice(),
      subQuery: null
    };
    const mainTable = {
      name: tableName,
      quotedName: null,
      as: null,
      model
    };
    const topLevelInfo = {
      names: mainTable,
      options,
      subQuery
    };

    if (options.tableAs) {
      mainTable.as = this.quoteIdentifier(options.tableAs);
    } else if (!Array.isArray(mainTable.name) && mainTable.model) {
      mainTable.as = this.quoteIdentifier(mainTable.model.name);
    }

    mainTable.quotedName = !Array.isArray(mainTable.name) ? this.quoteTable(mainTable.name) : tableName.map(t => {
      return Array.isArray(t) ? this.quoteTable(t[0], t[1]) : this.quoteTable(t, true);
    }).join(', ');

    if (subQuery && attributes.main) {
      this._ensurePrimaryKeysInSubQuery(attributes.main, mainTable);
    }

    attributes.main = this.escapeAttributes(attributes.main, options, mainTable.as);
    attributes.main = attributes.main || (options.include ? [`${mainTable.as}.*`] : ['*']);

    if (subQuery || options.groupedLimit) {
      attributes.subQuery = attributes.main;
      attributes.main = [(mainTable.as || mainTable.quotedName) + '.*'];
    }

    const { mainJoinQueries, subJoinQueries } = this._processIncludeOptions(options, mainTable, topLevelInfo);

    if (subQuery) {
      subQueryItems.push(this.selectFromTableFragment(options, mainTable.model, attributes.subQuery, mainTable.quotedName, mainTable.as));
      subQueryItems.push(subJoinQueries.join(''));
    } else {
      const groupedLimitResult = this._handleGroupedLimitQuery(options, mainTable, tableName, model, topLevelInfo);

      if (groupedLimitResult) {
        const whereKey = this._getGroupedLimitWhereKey(options);
        const baseQuery = groupedLimitResult.baseQuery;
        const placeHolder = this.whereItemQuery(Op.placeholder, true, { model });
        const splicePos = baseQuery.indexOf(placeHolder);

        mainQueryItems.push(this.selectFromTableFragment(options, mainTable.model, attributes.main, '(' +
          options.groupedLimit.values.map(value => {
            const groupWhere = this._buildGroupedWhere(whereKey, value, options);
            return Utils.spliceStr(baseQuery, splicePos, placeHolder.length, this.getWhereConditions(groupWhere, mainTable.as || tableName));
          }).join(this._dialect.supports['UNION ALL'] ? ' UNION ALL ' : ' UNION ') + ')', mainTable.as));
      } else {
        mainQueryItems.push(this.selectFromTableFragment(options, mainTable.model, attributes.main, mainTable.quotedName, mainTable.as));
      }

      mainQueryItems.push(mainJoinQueries.join(''));
    }

    if (options.hasOwnProperty('where') && !options.groupedLimit) {
      options.where = this.getWhereConditions(options.where, mainTable.as || tableName, model, options);
      if (options.where) {
        if (subQuery) {
          subQueryItems.push(' WHERE ' + options.where);
        } else {
          mainQueryItems.push(' WHERE ' + options.where);
          _.each(mainQueryItems, (value, key) => {
            if (value.match(/^SELECT/)) {
              mainQueryItems[key] = this.selectFromTableFragment(options, model, attributes.main, mainTable.quotedName, mainTable.as, options.where);
            }
          });
        }
      }
    }

    if (options.group) {
      options.group = Array.isArray(options.group) ? options.group.map(t => this.quote(t, model)).join(', ') : this.quote(options.group, model);
      if (subQuery) {
        subQueryItems.push(' GROUP BY ' + options.group);
      } else {
        mainQueryItems.push(' GROUP BY ' + options.group);
      }
    }

    if (options.hasOwnProperty('having')) {
      options.having = this.getWhereConditions(options.having, tableName, model, options, false);
      if (options.having) {
        if (subQuery) {
          subQueryItems.push(' HAVING ' + options.having);
        } else {
          mainQueryItems.push(' HAVING ' + options.having);
        }
      }
    }

    if (options.order) {
      const orders = this.getQueryOrders(options, model, subQuery);
      if (orders.mainQueryOrder.length) {
        mainQueryItems.push(' ORDER BY ' + orders.mainQueryOrder.join(', '));
      }
      if (orders.subQueryOrder.length) {
        subQueryItems.push(' ORDER BY ' + orders.subQueryOrder.join(', '));
      }
    }

    const limitOrder = this.addLimitAndOffset(options, mainTable.model);
    if (limitOrder && !options.groupedLimit) {
      if (subQuery) {
        subQueryItems.push(limitOrder);
      } else {
        mainQueryItems.push(limitOrder);
      }
    }

    let query;
    if (subQuery) {
      query = `SELECT ${attributes.main.join(', ')} FROM (${subQueryItems.join('')}) AS ${mainTable.as}${mainJoinQueries.join('')}${mainQueryItems.join('')}`;
    } else {
      query = mainQueryItems.join('');
    }

    query = this._applyLockToQuery(query, options);

    return `${query};`;
  },

  /**
   * Applies lock clause to query
   * @private
   */
  _applyLockToQuery(query, options) {
    if (!options.lock || !this._dialect.supports.lock) {
      return query;
    }

    let lock = options.lock;
    if (typeof options.lock === 'object') {
      lock = options.lock.level;
    }

    if (this._dialect.supports.lockKey && (lock === 'KEY SHARE' || lock === 'NO KEY UPDATE')) {
      query += ' FOR ' + lock;
    } else if (lock === 'SHARE') {
      query += ' ' + this._dialect.supports.forShare;
    } else {
      query += ' FOR UPDATE';
    }

    if (this._dialect.supports.lockOf && options.lock.of && options.lock.of.prototype instanceof Model) {
      query += ' OF ' + this.quoteTable(options.lock.of.name);
    }

    return query;
  },

  escapeAttributes(attributes, options, mainTableAs) {
    return attributes && attributes.map(attr => {
      let addTable = true;

      if (attr instanceof Utils.SequelizeMethod) {
        return this.handleSequelizeMethod(attr);
      }

      if (Array.isArray(attr)) {
        if (attr.length !== 2) {
          throw new Error(JSON.stringify(attr) + ' is not a valid attribute definition. Please use the following format: [\'attribute definition\', \'alias\']');
        }
        attr = attr.slice();

        if (attr[0] instanceof Utils.SequelizeMethod) {
          attr[0] = this.handleSequelizeMethod(attr[0]);
          addTable = false;
        } else if (attr[0].indexOf('(') === -1 && attr[0].indexOf(')') === -1) {
          attr[0] = this.quoteIdentifier(attr[0]);
        } else {
          Utils.deprecate('Use sequelize.fn / sequelize.literal to construct attributes');
        }
        attr = [attr[0], this.quoteIdentifier(attr[1])].join(' AS ');
      } else {
        attr = attr.indexOf(Utils.TICK_CHAR) < 0 && attr.indexOf('"') < 0
          ? this.quoteIdentifiers(attr)
          : this.escape(attr);
      }

      if (!_.isEmpty(options.include) && attr.indexOf('.') === -1 && addTable) {
        attr = mainTableAs + '.' + attr;
      }

      return attr;
    });
  },

  /**
   * Processes include attributes
   * @private
   */
  _processIncludeAttributes(include, includeAs, topLevelInfo) {
    if (topLevelInfo.options.includeIgnoreAttributes === false) {
      return [];
    }

    return include.attributes.map(attr => this._buildIncludeAttribute(attr, includeAs));
  },

  /**
   * Builds single include attribute
   * @private
   */
  _buildIncludeAttribute(attr, includeAs) {
    let attrAs = attr;
    let verbatim = false;

    if (Array.isArray(attr) && attr.length === 2) {
      if (attr[0] instanceof Utils.SequelizeMethod && (
        attr[0] instanceof Utils.Literal ||
        attr[0] instanceof Utils.Cast ||
        attr[0] instanceof Utils.Fn
      )) {
        verbatim = true;
      }

      attr = attr.map(a => a instanceof Utils.SequelizeMethod ? this.handleSequelizeMethod(a) : a);
      attrAs = attr[1];
      attr = attr[0];
    } else if (attr instanceof Utils.Literal) {
      return attr.val;
    } else if (attr instanceof Utils.Cast || attr instanceof Utils.Fn) {
      throw new Error(
        'Tried to select attributes using Sequelize.cast or Sequelize.fn without specifying an alias for the result, during eager loading. ' +
        'This means the attribute will not be added to the returned instance'
      );
    }

    const prefix = verbatim === true ? attr : `${this.quoteIdentifier(includeAs.internalAs)}.${this.quoteIdentifier(attr)}`;
    return `${prefix} AS ${this.quoteIdentifier(`${includeAs.externalAs}.${attrAs}`, true)}`;
  },

  /**
   * Adds include attributes to result
   * @private
   */
  _addIncludeAttributesToResult(includeAttributes, include, topLevelInfo, attributes) {
    if (include.subQuery && topLevelInfo.subQuery) {
      attributes.subQuery.push(...includeAttributes);
    } else {
      attributes.main.push(...includeAttributes);
    }
  },

  /**
   * Processes child includes
   * @private
   */
  _processChildIncludes(include, includeAs, topLevelInfo, attributes) {
    const mainChildIncludes = [];
    const subChildIncludes = [];
    let requiredMismatch = false;

    if (!include.include) {
      return { mainChildIncludes, subChildIncludes, requiredMismatch };
    }

    for (const childInclude of include.include) {
      if (childInclude.separate || childInclude._pseudo) {
        continue;
      }

      const childJoinQueries = this.generateInclude(childInclude, includeAs, topLevelInfo);

      if (include.required === false && childInclude.required === true) {
        requiredMismatch = true;
      }

      if (childInclude.subQuery && topLevelInfo.subQuery) {
        subChildIncludes.push(childJoinQueries.subQuery);
      }

      if (childJoinQueries.mainQuery) {
        mainChildIncludes.push(childJoinQueries.mainQuery);
      }

      if (childJoinQueries.attributes.main.length > 0) {
        attributes.main.push(...childJoinQueries.attributes.main);
      }

      if (childJoinQueries.attributes.subQuery.length > 0) {
        attributes.subQuery.push(...childJoinQueries.attributes.subQuery);
      }
    }

    return { mainChildIncludes, subChildIncludes, requiredMismatch };
  },

  /**
   * Builds join queries for include
   * @private
   */
  _buildIncludeJoinQueries(include, includeAs, topLevelInfo, joinQuery, mainChildIncludes, subChildIncludes, requiredMismatch) {
    const joinQueries = {
      mainQuery: [],
      subQuery: []
    };

    if (include.subQuery && topLevelInfo.subQuery) {
      if (requiredMismatch && subChildIncludes.length > 0) {
        joinQueries.subQuery.push(` ${joinQuery.join} ( ${joinQuery.body}${subChildIncludes.join('')} ) ON ${joinQuery.condition}`);
      } else {
        joinQueries.subQuery.push(` ${joinQuery.join} ${joinQuery.body} ON ${joinQuery.condition}`);
        if (subChildIncludes.length > 0) {
          joinQueries.subQuery.push(subChildIncludes.join(''));
        }
      }
      joinQueries.mainQuery.push(mainChildIncludes.join(''));
    } else {
      if (requiredMismatch && mainChildIncludes.length > 0) {
        joinQueries.mainQuery.push(` ${joinQuery.join} ( ${joinQuery.body}${mainChildIncludes.join('')} ) ON ${joinQuery.condition}`);
      } else {
        joinQueries.mainQuery.push(` ${joinQuery.join} ${joinQuery.body} ON ${joinQuery.condition}`);
        if (mainChildIncludes.length > 0) {
          joinQueries.mainQuery.push(mainChildIncludes.join(''));
        }
      }
      joinQueries.subQuery.push(subChildIncludes.join(''));
    }

    return joinQueries;
  },

  generateInclude(include, parentTableName, topLevelInfo) {
    const includeAs = {
      internalAs: include.as,
      externalAs: include.as
    };

    if (topLevelInfo.names.name !== parentTableName.externalAs && topLevelInfo.names.as !== parentTableName.externalAs) {
      includeAs.internalAs = `${parentTableName.internalAs}->${include.as}`;
      includeAs.externalAs = `${parentTableName.externalAs}.${include.as}`;
    }

    topLevelInfo.options.keysEscaped = true;

    const attributes = {
      main: [],
      subQuery: []
    };

    const includeAttributes = this._processIncludeAttributes(include, includeAs, topLevelInfo);
    this._addIncludeAttributesToResult(includeAttributes, include, topLevelInfo, attributes);

    const joinQuery = include.through
      ? this.generateThroughJoin(include, includeAs, parentTableName.internalAs, topLevelInfo)
      : this._generateJoinWithSubQueryFilter(include, includeAs, topLevelInfo);

    if (joinQuery.attributes.main.length > 0) {
      attributes.main.push(...joinQuery.attributes.main);
    }

    if (joinQuery.attributes.subQuery.length > 0) {
      attributes.subQuery.push(...joinQuery.attributes.subQuery);
    }

    const { mainChildIncludes, subChildIncludes, requiredMismatch } = this._processChildIncludes(include, includeAs, topLevelInfo, attributes);

    const joinQueries = this._buildIncludeJoinQueries(include, includeAs, topLevelInfo, joinQuery, mainChildIncludes, subChildIncludes, requiredMismatch);

    return {
      mainQuery: joinQueries.mainQuery.join(''),
      subQuery: joinQueries.subQuery.join(''),
      attributes
    };
  },

  /**
   * Generates join with subquery filter
   * @private
   */
  _generateJoinWithSubQueryFilter(include, includeAs, topLevelInfo) {
    this._generateSubQueryFilter(include, includeAs, topLevelInfo);
    return this.generateJoin(include, topLevelInfo);
  },

  /**
   * Builds join on condition
   * @private
   */
  _buildJoinOnCondition(association, asLeft, asRight, fieldLeft, fieldRight, topLevelInfo, include, parent, parentIsTop) {
    let joinOn = `${this.quoteTable(asLeft)}.${this.quoteIdentifier(fieldLeft)}`;

    if (topLevelInfo.options.groupedLimit && parentIsTop || topLevelInfo.subQuery && include.parent.subQuery && !include.subQuery) {
      if (parentIsTop) {
        const attrLeft = association instanceof BelongsTo ? association.identifier : association.sourceKeyAttribute || parent.model.primaryKeyAttribute;
        joinOn = `${this.quoteTable(parent.as || parent.model.name)}.${this.quoteIdentifier(attrLeft)}`;
      } else {
        const attrLeft = association instanceof BelongsTo ? association.identifier : association.sourceKeyAttribute || parent.model.primaryKeyAttribute;
        joinOn = this.quoteIdentifier(`${asLeft.replace(/->/g, '.')}.${attrLeft}`);
      }
    }

    joinOn += ` = ${this.quoteIdentifier(asRight)}.${this.quoteIdentifier(fieldRight)}`;

    return joinOn;
  },

  /**
   * Adds where conditions to join
   * @private
   */
  _addWhereToJoin(joinOn, include, asRight) {
    if (include.on) {
      return this.whereItemsQuery(include.on, {
        prefix: this.sequelize.literal(this.quoteIdentifier(asRight)),
        model: include.model
      });
    }

    if (include.where) {
      const joinWhere = this.whereItemsQuery(include.where, {
        prefix: this.sequelize.literal(this.quoteIdentifier(asRight)),
        model: include.model
      });

      if (joinWhere) {
        return joinOn + (include.or ? ` OR ${joinWhere}` : ` AND ${joinWhere}`);
      }
    }

    return joinOn;
  },

  generateJoin(include, topLevelInfo) {
    const association = include.association;
    const parent = include.parent;
    const parentIsTop = !!parent && !include.parent.association && include.parent.model.name === topLevelInfo.options.model.name;

    const left = association.source;
    const attrLeft = association instanceof BelongsTo ? association.identifier : association.sourceKeyAttribute || left.primaryKeyAttribute;
    const fieldLeft = association instanceof BelongsTo ? association.identifierField : left.rawAttributes[association.sourceKeyAttribute || left.primaryKeyAttribute].field;

    const right = include.model;
    const tableRight = right.getTableName();
    const fieldRight = association instanceof BelongsTo ? right.rawAttributes[association.targetIdentifier || right.primaryKeyAttribute].field : association.identifierField;

    let asLeft = this._buildJoinAsLeft(include, parent);
    let asRight = include.as;

    if (asLeft) {
      asRight = `${asLeft}->${asRight}`;
    }

    let joinOn = this._buildJoinOnCondition(association, asLeft, asRight, fieldLeft, fieldRight, topLevelInfo, include, parent, parentIsTop);
    joinOn = this._addWhereToJoin(joinOn, include, asRight);

    return {
      join: include.required ? 'INNER JOIN' : 'LEFT OUTER JOIN',
      body: this.quoteTable(tableRight, asRight),
      condition: joinOn,
      attributes: {
        main: [],
        subQuery: []
      }
    };
  },

  /**
   * Builds join as left side
   * @private
   */
  _buildJoinAsLeft(include, parent) {
    let asLeft;
    let $parent = include.parent;

    while (($parent = $parent && $parent.parent || include.parent) && $parent.association) {
      if (asLeft) {
        asLeft = `${$parent.as}->${asLeft}`;
      } else {
        asLeft = $parent.as;
      }
    }

    if (!asLeft) {
      asLeft = parent.as || parent.model.name;
    }

    return asLeft;
  },

  /**
   * Builds through join source condition
   * @private
   */
  _buildThroughJoinSourceCondition(tableSource, attrSource, throughAs, identSource, topLevelInfo, include, parentIsTop) {
    if (topLevelInfo.subQuery && !include.subQuery && include.parent.subQuery && !parentIsTop) {
      return `${this.quoteIdentifier(`${tableSource}.${attrSource}`)} = `;
    }

    return `${this.quoteTable(tableSource)}.${this.quoteIdentifier(attrSource)} = `;
  },

  /**
   * Builds through join body
   * @private
   */
  _buildThroughJoinBody(throughTable, throughAs, includeAs, include, targetJoinOn, throughWhere, joinType) {
    if (this._dialect.supports.joinTableDependent) {
      let joinBody = `( ${this.quoteTable(throughTable, throughAs)} INNER JOIN ${this.quoteTable(include.model.getTableName(), includeAs.internalAs)} ON ${targetJoinOn}`;
      if (throughWhere) {
        joinBody += ` AND ${throughWhere}`;
      }
      joinBody += ')';
      return joinBody;
    }

    return `${this.quoteTable(throughTable, throughAs)} ON ${this._buildThroughJoinSourceCondition()} ${joinType} ${this.quoteTable(include.model.getTableName(), includeAs.internalAs)}`;
  },

  generateThroughJoin(include, includeAs, parentTableName, topLevelInfo) {
    const through = include.through;
    const throughTable = through.model.getTableName();
    const throughAs = `${includeAs.internalAs}->${through.as}`;
    const externalThroughAs = `${includeAs.externalAs}.${through.as}`;

    const throughAttributes = through.attributes.map(attr =>
      this.quoteIdentifier(throughAs) + '.' + this.quoteIdentifier(Array.isArray(attr) ? attr[0] : attr)
      + ' AS '
      + this.quoteIdentifier(externalThroughAs + '.' + (Array.isArray(attr) ? attr[1] : attr))
    );

    const association = include.association;
    const parentIsTop = !include.parent.association && include.parent.model.name === topLevelInfo.options.model.name;
    const primaryKeysSource = association.source.primaryKeyAttributes;
    const tableSource = parentTableName;
    const identSource = association.identifierField;
    const primaryKeysTarget = association.target.primaryKeyAttributes;
    const tableTarget = includeAs.internalAs;
    const identTarget = association.foreignIdentifierField;
    const attrTarget = association.target.rawAttributes[primaryKeysTarget[0]].field || primaryKeysTarget[0];

    const joinType = include.required ? 'INNER JOIN' : 'LEFT OUTER JOIN';
    const attributes = {
      main: [],
      subQuery: []
    };

    if (topLevelInfo.options.includeIgnoreAttributes !== false) {
      attributes.main.push(...throughAttributes);
    }

    let attrSource = primaryKeysSource[0];
    if (!topLevelInfo.subQuery) {
      attrSource = association.source.rawAttributes[primaryKeysSource[0]].field;
    }
    if (topLevelInfo.subQuery && !include.subQuery && !include.parent.subQuery && include.parent.model !== topLevelInfo.options.mainModel) {
      attrSource = association.source.rawAttributes[primaryKeysSource[0]].field;
    }

    const sourceJoinOn = this._buildThroughJoinSourceCondition(tableSource, attrSource, throughAs, identSource, topLevelInfo, include, parentIsTop)
      + `${this.quoteIdentifier(throughAs)}.${this.quoteIdentifier(identSource)}`;

    const targetJoinOn = `${this.quoteIdentifier(tableTarget)}.${this.quoteIdentifier(attrTarget)} = `
      + `${this.quoteIdentifier(throughAs)}.${this.quoteIdentifier(identTarget)}`;

    const throughWhere = through.where ? this.getWhereConditions(through.where, this.sequelize.literal(this.quoteIdentifier(throughAs)), through.model) : null;

    const joinBody = this._buildThroughJoinBody(throughTable, throughAs, includeAs, include, targetJoinOn, throughWhere, joinType);
    let joinCondition = this._dialect.supports.joinTableDependent ? sourceJoinOn : targetJoinOn;

    if (throughWhere && !this._dialect.supports.joinTableDependent) {
      joinCondition += ` AND ${throughWhere}`;
    }

    if (include.where) {
      const targetWhere = this.getWhereConditions(include.where, this.sequelize.literal(this.quoteIdentifier(includeAs.internalAs)), include.model, topLevelInfo.options);
      if (targetWhere) {
        joinCondition += ` AND ${targetWhere}`;
      }
    }

    this._generateSubQueryFilter(include, includeAs, topLevelInfo);

    return {
      join: joinType,
      body: joinBody,
      condition: joinCondition,
      attributes
    };
  },

  /**
   * Builds subquery filter for through model
   * @private
   */
  _buildThroughSubQueryFilter(topInclude, topParent, topAssociation) {
    return this.selectQuery(topInclude.through.model.getTableName(), {
      attributes: [topInclude.through.model.primaryKeyField],
      include: Model._validateIncludedElements({
        model: topInclude.through.model,
        include: [{
          association: topAssociation.toTarget,
          required: true,
          where: topInclude.where,
          include: topInclude.include
        }]
      }).include,
      model: topInclude.through.model,
      where: {
        [Op.and]: [
          this.sequelize.asIs([
            this.quoteTable(topParent.model.name) + '.' + this.quoteIdentifier(topParent.model.primaryKeyField),
            this.quoteIdentifier(topInclude.through.model.name) + '.' + this.quoteIdentifier(topAssociation.identifierField)
          ].join(' = ')),
          topInclude.through.where
        ]
      },
      limit: 1,
      includeIgnoreAttributes: false
    }, topInclude.through.model);
  },

  /**
   * Builds subquery filter for regular model
   * @private
   */
  _buildRegularSubQueryFilter(topInclude, topParent, topAssociation) {
    const isBelongsTo = topAssociation.associationType === 'BelongsTo';
    const sourceField = isBelongsTo ? topAssociation.identifierField : (topAssociation.sourceKeyField || topParent.model.primaryKeyField);
    const targetField = isBelongsTo ? (topAssociation.sourceKeyField || topInclude.model.primaryKeyField) : topAssociation.identifierField;

    const join = [
      this.quoteIdentifier(topInclude.as) + '.' + this.quoteIdentifier(targetField),
      this.quoteTable(topParent.as || topParent.model.name) + '.' + this.quoteIdentifier(sourceField)
    ].join(' = ');

    return this.selectQuery(topInclude.model.getTableName(), {
      attributes: [targetField],
      include: Model._validateIncludedElements(topInclude).include,
      model: topInclude.model,
      where: {
        [Op.and]: [
          topInclude.where,
          { [Op.join]: this.sequelize.asIs(join) }
        ]
      },
      limit: 1,
      tableAs: topInclude.as,
      includeIgnoreAttributes: false
    }, topInclude.model);
  },

  _generateSubQueryFilter(include, includeAs, topLevelInfo) {
    if (!topLevelInfo.subQuery || !include.subQueryFilter) {
      return;
    }

    if (!topLevelInfo.options.where) {
      topLevelInfo.options.where = {};
    }

    let parent = include;
    let child = include;
    let nestedIncludes = this._getRequiredClosure(include).include;

    while ((parent = parent.parent)) {
      if (parent.parent && !parent.required) {
        return;
      }

      if (parent.subQueryFilter) {
        return;
      }

      nestedIncludes = [_.extend({}, child, { include: nestedIncludes, attributes: [] })];
      child = parent;
    }

    const topInclude = nestedIncludes[0];
    const topParent = topInclude.parent;
    const topAssociation = topInclude.association;
    topInclude.association = undefined;

    const query = topInclude.through && Object(topInclude.through.model) === topInclude.through.model
      ? this._buildThroughSubQueryFilter(topInclude, topParent, topAssociation)
      : this._buildRegularSubQueryFilter(topInclude, topParent, topAssociation);

    if (!topLevelInfo.options.where[Op.and]) {
      topLevelInfo.options.where[Op.and] = [];
    }

    topLevelInfo.options.where[`__${includeAs.internalAs}`] = this.sequelize.asIs([
      '(',
      query.replace(/\;$/, ''),
      ')',
      'IS NOT NULL'
    ].join(' '));
  },

  _getRequiredClosure(include) {
    const copy = _.extend({}, include, { attributes: [], include: [] });

    if (Array.isArray(include.include)) {
      copy.include = include.include
        .filter(i => i.required)
        .map(inc => this._getRequiredClosure(inc));
    }

    return copy;
  },

  /**
   * Determines if order item is subquery order
   * @private
   */
  _isSubQueryOrder(order, model, subQuery) {
    if (!subQuery || !Array.isArray(order) || !order[0]) {
      return false;
    }

    if (order[0] instanceof Association || typeof order[0] === 'function' && order[0].prototype instanceof Model) {
      return false;
    }

    if (typeof order[0].model === 'function' && order[0].model.prototype instanceof Model) {
      return false;
    }

    if (typeof order[0] === 'string' && model && model.associations !== undefined && model.associations[order[0]]) {
      return false;
    }

    return true;
  },

  /**
   * Processes single order item
   * @private
   */
  _processSingleOrderItem(order, model, subQuery, options) {
    if (!Array.isArray(order)) {
      order = [order];
    }

    const isSubQueryOrder = this._isSubQueryOrder(order, model, subQuery);

    if (subQuery && isSubQueryOrder) {
      return { subQuery: this.quote(order, model, '->'), main: null };
    }

    if (subQuery) {
      const subQueryAttribute = options.attributes.find(a => Array.isArray(a) && a[0] === order[0] && a[1]);
      if (subQueryAttribute) {
        order[0] = new Utils.Col(subQueryAttribute[1]);
      }
    }

    return { main: this.quote(order, model, '->'), subQuery: null };
  },

  getQueryOrders(options, model, subQuery) {
    const mainQueryOrder = [];
    const subQueryOrder = [];

    if (Array.isArray(options.order)) {
      for (let order of options.order) {
        const { main, subQuery: sub } = this._processSingleOrderItem(order, model, subQuery, options);
        if (main) mainQueryOrder.push(main);
        if (sub) subQueryOrder.push(sub);
      }
    } else if (options.order instanceof Utils.SequelizeMethod) {
      const sql = this.quote(options.order, model, '->');
      if (subQuery) {
        subQueryOrder.push(sql);
      }
      mainQueryOrder.push(sql);
    } else {
      throw new Error('Order must be type of array or instance of a valid sequelize method.');
    }

    return { mainQueryOrder, subQueryOrder };
  },

  selectFromTableFragment(options, model, attributes, tables, mainTableAs, where) {
    let fragment = 'SELECT ' + attributes.join(', ') + ' FROM ' + tables;

    if (mainTableAs) {
      fragment += ' AS ' + mainTableAs;
    }

    if (where) {
      fragment += ' WHERE ' + where;
    }

    return fragment;
  },

  setAutocommitQuery(value, options) {
    if (options.parent) {
      return;
    }

    if (typeof value === 'undefined' || value === null) {
      return;
    }

    return 'SET autocommit = ' + (value ? 1 : 0) + ';';
  },

  setIsolationLevelQuery(value, options) {
    if (options.parent) {
      return;
    }

    return 'SET SESSION TRANSACTION ISOLATION LEVEL ' + value + ';';
  },

  generateTransactionId() {
    return uuid.v4();
  },

  startTransactionQuery(transaction) {
    if (transaction.parent) {
      return 'SAVEPOINT ' + this.quoteIdentifier(transaction.name, true) + ';';
    }

    return 'START TRANSACTION;';
  },

  deferConstraintsQuery() {},

  setConstraintQuery() {},
  setDeferredQuery() {},
  setImmediateQuery() {},

  commitTransactionQuery(transaction) {
    if (transaction.parent) {
      return;
    }

    return 'COMMIT;';
  },

  rollbackTransactionQuery(transaction) {
    if (transaction.parent) {
      return 'ROLLBACK TO SAVEPOINT ' + this.quoteIdentifier(transaction.name, true) + ';';
    }

    return 'ROLLBACK;';
  },

  addLimitAndOffset(options) {
    let fragment = '';

    if (options.offset != null && options.limit == null) {
      fragment += ' LIMIT ' + this.escape(options.offset) + ', ' + 10000000000000;
    } else if (options.limit != null) {
      if (options.offset != null) {
        fragment += ' LIMIT ' + this.escape(options.offset) + ', ' + this.escape(options.limit);
      } else {
        fragment += ' LIMIT ' + this.escape(options.limit);
      }
    }

    return fragment;
  },

  /**
   * Handles Where instance
   * @private
   */
  _handleWhereInstance(smth, tableName, factory, options, prepend) {
    let value = smth.logic;
    let key;

    if (smth.attribute instanceof Utils.SequelizeMethod) {
      key = this.getWhereConditions(smth.attribute, tableName, factory, options, prepend);
    } else {
      key = this.quoteTable(smth.attribute.Model.name) + '.' + this.quoteIdentifier(smth.attribute.field || smth.attribute.fieldName);
    }

    if (value && value instanceof Utils.SequelizeMethod) {
      value = this.getWhereConditions(value, tableName, factory, options, prepend);
      return value === 'NULL' ? key + ' IS NULL' : [key, value].join(smth.comparator);
    }

    if (_.isPlainObject(value)) {
      return this.whereItemQuery(smth.attribute, value, { model: factory });
    }

    if (typeof value === 'boolean') {
      value = this.booleanValue(value);
    } else {
      value = this.escape(value);
    }

    return value === 'NULL' ? key + ' IS NULL' : [key, value].join(' ' + smth.comparator + ' ');
  },

  /**
   * Handles Cast instance
   * @private
   */
  _handleCastInstance(smth, tableName, factory, options, prepend) {
    let result;

    if (smth.val instanceof Utils.SequelizeMethod) {
      result = this.handleSequelizeMethod(smth.val, tableName, factory, options, prepend);
    } else if (_.isPlainObject(smth.val)) {
      result = this.whereItemsQuery(smth.val);
    } else {
      result = this.escape(smth.val);
    }

    return 'CAST(' + result + ' AS ' + smth.type.toUpperCase() + ')';
  },

  /**
   * Handles Fn instance
   * @private
   */
  _handleFnInstance(smth, tableName, factory, options, prepend) {
    return smth.fn + '(' + smth.args.map(arg => {
      if (arg instanceof Utils.SequelizeMethod) {
        return this.handleSequelizeMethod(arg, tableName, factory, options, prepend);
      } else if (_.isPlainObject(arg)) {
        return this.whereItemsQuery(arg);
      } else {
        return this.escape(arg);
      }
    }).join(', ') + ')';
  },

  /**
   * Handles Col instance
   * @private
   */
  _handleColInstance(smth, factory) {
    if (Array.isArray(smth.col)) {
      if (!factory) {
        throw new Error('Cannot call Sequelize.col() with array outside of order / group clause');
      }
    } else if (smth.col.indexOf('*') === 0) {
      return '*';
    }

    return this.quote(smth.col, factory);
  },

  handleSequelizeMethod(smth, tableName, factory, options, prepend) {
    if (this.OperatorMap.hasOwnProperty(smth.comparator)) {
      smth.comparator = this.OperatorMap[smth.comparator];
    }

    if (smth instanceof Utils.Where) {
      return this._handleWhereInstance(smth, tableName, factory, options, prepend);
    }

    if (smth instanceof Utils.Literal) {
      return smth.val;
    }

    if (smth instanceof Utils.Cast) {
      return this._handleCastInstance(smth, tableName, factory, options, prepend);
    }

    if (smth instanceof Utils.Fn) {
      return this._handleFnInstance(smth, tableName, factory, options, prepend);
    }

    if (smth instanceof Utils.Col) {
      return this._handleColInstance(smth, factory);
    }

    return smth.toString(this, factory);
  },

  whereQuery(where, options) {
    const query = this.whereItemsQuery(where, options);
    if (query && query.length) {
      return 'WHERE ' + query;
    }
    return '';
  },

  whereItemsQuery(where, options, binding) {
    if (where === null || where === undefined || Utils.getComplexSize(where) === 0) {
      return '';
    }

    if (_.isString(where)) {
      throw new Error('Support for `{where: \'raw query\'}` has been removed.');
    }

    const items = [];
    binding = binding || 'AND';
    if (binding.substr(0, 1) !== ' ') binding = ' ' + binding + ' ';

    if (_.isPlainObject(where)) {
      Utils.getComplexKeys(where).forEach(prop => {
        items.push(this.whereItemQuery(prop, where[prop], options));
      });
    } else {
      items.push(this.whereItemQuery(undefined, where, options));
    }

    return items.length && items.filter(item => item && item.length).join(binding) || '';
  },

  OperatorMap: {
    [Op.eq]: '=',
    [Op.ne]: '!=',
    [Op.gte]: '>=',
    [Op.gt]: '>',
    [Op.lte]: '<=',
    [Op.lt]: '<',
    [Op.not]: 'IS NOT',
    [Op.is]: 'IS',
    [Op.in]: 'IN',
    [Op.notIn]: 'NOT IN',
    [Op.like]: 'LIKE',
    [Op.notLike]: 'NOT LIKE',
    [Op.iLike]: 'ILIKE',
    [Op.notILike]: 'NOT ILIKE',
    [Op.regexp]: '~',
    [Op.notRegexp]: '!~',
    [Op.iRegexp]: '~*',
    [Op.notIRegexp]: '!~*',
    [Op.between]: 'BETWEEN',
    [Op.notBetween]: 'NOT BETWEEN',
    [Op.overlap]: '&&',
    [Op.contains]: '@>',
    [Op.contained]: '<@',
    [Op.adjacent]: '-|-',
    [Op.strictLeft]: '<<',
    [Op.strictRight]: '>>',
    [Op.noExtendRight]: '&<',
    [Op.noExtendLeft]: '&>',
    [Op.any]: 'ANY',
    [Op.all]: 'ALL',
    [Op.and]: ' AND ',
    [Op.or]: ' OR ',
    [Op.col]: 'COL',
    [Op.placeholder]: '$$PLACEHOLDER$$',
    [Op.raw]: 'DEPRECATED'
  },

  OperatorsAliasMap: {},

  setOperatorsAliases(aliases) {
    if (!aliases || _.isEmpty(aliases)) {
      this.OperatorsAliasMap = false;
    } else {
      this.OperatorsAliasMap = _.assign({}, aliases);
    }
  },

  /**
   * Handles JSON path in where clause
   * @private
   */
  _handleJsonPathWhere(key, keyParts, value, options) {
    const tmp = {};
    const field = options.model.rawAttributes[keyParts[0]];
    Dottie.set(tmp, keyParts.slice(1), value);
    return this.whereItemQuery(field.field || keyParts[0], tmp, Object.assign({ field }, options));
  },

  /**
   * Checks if key contains JSON path
   * @private
   */
  _isJsonPathKey(key, options) {
    if (!key || typeof key !== 'string' || key.indexOf('.') === -1 || !options.model) {
      return false;
    }

    const keyParts = key.split('.');
    return options.model.rawAttributes[keyParts[0]] && options.model.rawAttributes[keyParts[0]].type instanceof DataTypes.JSON;
  },

  /**
   * Handles undefined key
   * @private
   */
  _handleUndefinedKey(value, options) {
    if (typeof value === 'string') {
      return value;
    }

    const isPlainObject = _.isPlainObject(value);
    if (isPlainObject) {
      const valueKeys = Utils.getComplexKeys(value);
      if (valueKeys.length === 1) {
        return this.whereItemQuery(valueKeys[0], value[valueKeys[0]], options);
      }
    }

    return null;
  },

  /**
   * Handles null/undefined value
   * @private
   */
  _handleNullValue(key, value, field, options) {
    const operator = value === null ? this.OperatorMap[Op.is] : this.OperatorMap[Op.eq];
    return this._joinKeyValue(key, this.escape(value, field), operator, options.prefix);
  },

  /**
   * Handles array value
   * @private
   */
  _handleArrayValue(key, value, fieldType, options) {
    if (fieldType instanceof DataTypes.ARRAY) {
      return this._joinKeyValue(key, this.escape(value, null), this.OperatorMap[Op.eq], options.prefix);
    }

    if (Utils.canTreatArrayAsAnd(value)) {
      return this._whereGroupBind(Op.and, value, options);
    }

    throw new Error('Support for literal replacements in the `where` object has been removed.');
  },

  /**
   * Handles plain object value
   * @private
   */
  _handlePlainObjectValue(key, value, fieldType, options) {
    const valueKeys = Utils.getComplexKeys(value);

    if (fieldType instanceof DataTypes.JSON && options.json !== false) {
      return this._whereJSON(key, value, options);
    }

    if (valueKeys.length > 1) {
      return this._whereBind(this.OperatorMap[Op.and], key, value, options);
    }

    if (this.OperatorMap[valueKeys[0]]) {
      return this._whereParseSingleValueObject(key, null, valueKeys[0], value[valueKeys[0]], options);
    }

    return this._whereParseSingleValueObject(key, null, this.OperatorMap[Op.eq], value, options);
  },

  whereItemQuery(key, value, options) {
    options = options || {};

    if (this._isJsonPathKey(key, options)) {
      const keyParts = key.split('.');
      return this._handleJsonPathWhere(key, keyParts, value, options);
    }

    const field = this._findField(key, options);
    const fieldType = field && field.type || options.type;

    const isPlainObject = _.isPlainObject(value);
    const isArray = !isPlainObject && Array.isArray(value);

    key = this.OperatorsAliasMap && this.OperatorsAliasMap[key] || key;

    if (isPlainObject) {
      value = this._replaceAliases(value);
    }

    if (key === undefined) {
      const result = this._handleUndefinedKey(value, options);
      if (result !== null) {
        return result;
      }
    }

    if (!value) {
      return this._handleNullValue(key, value, field, options);
    }

    if (value instanceof Utils.SequelizeMethod && !(key !== undefined && value instanceof Utils.Fn)) {
      return this.handleSequelizeMethod(value);
    }

    if (key === undefined && isArray) {
      return this._handleArrayValue(key, value, fieldType, options);
    }

    if (key === Op.or || key === Op.and || key === Op.not) {
      return this._whereGroupBind(key, value, options);
    }

    if (value[Op.or]) {
      return this._whereBind(this.OperatorMap[Op.or], key, value[Op.or], options);
    }

    if (value[Op.and]) {
      return this._whereBind(this.OperatorMap[Op.and], key, value[Op.and], options);
    }

    if (isArray) {
      return this._handleArrayValue(key, value, fieldType, options);
    }

    if (isPlainObject) {
      return this._handlePlainObjectValue(key, value, fieldType, options);
    }

    if (key === Op.placeholder) {
      return this._joinKeyValue(this.OperatorMap[key], this.escape(value, field), this.OperatorMap[Op.eq], options.prefix);
    }

    return this._joinKeyValue(key, this.escape(value, field), this.OperatorMap[Op.eq], options.prefix);
  },

  _findField(key, options) {
    if (options.field) {
      return options.field;
    }

    if (options.model && options.model.rawAttributes && options.model.rawAttributes[key]) {
      return options.model.rawAttributes[key];
    }

    if (options.model && options.model.fieldRawAttributesMap && options.model.fieldRawAttributesMap[key]) {
      return options.model.fieldRawAttributesMap[key];
    }
  },

  _replaceAliases(orig) {
    const obj = {};
    if (!this.OperatorsAliasMap) {
      return orig;
    }

    Utils.getOperators(orig).forEach(op => {
      const item = orig[op];
      if (_.isPlainObject(item)) {
        obj[op] = this._replaceAliases(item);
      } else {
        obj[op] = item;
      }
    });

    _.forOwn(orig, (item, prop) => {
      prop = this.OperatorsAliasMap[prop] || prop;
      if (_.isPlainObject(item)) {
        item = this._replaceAliases(item);
      }
      obj[prop] = item;
    });

    return obj;
  },

  _whereGroupBind(key, value, options) {
    const binding = key === Op.or ? this.OperatorMap[Op.or] : this.OperatorMap[Op.and];
    const outerBinding = key === Op.not ? 'NOT ' : '';

    if (Array.isArray(value)) {
      value = value.map(item => {
        let itemQuery = this.whereItemsQuery(item, options, this.OperatorMap[Op.and]);
        if (itemQuery && itemQuery.length && (Array.isArray(item) || _.isPlainObject(item)) && Utils.getComplexSize(item) > 1) {
          itemQuery = '(' + itemQuery + ')';
        }
        return itemQuery;
      }).filter(item => item && item.length);

      value = value.length && value.join(binding);
    } else {
      value = this.whereItemsQuery(value, options, binding);
    }

    if ((key === Op.or || key === Op.not) && !value) {
      return '0 = 1';
    }

    return value ? outerBinding + '(' + value + ')' : undefined;
  },

  _whereBind(binding, key, value, options) {
    if (_.isPlainObject(value)) {
      value = Utils.getComplexKeys(value).map(prop => {
        const item = value[prop];
        return this.whereItemQuery(key, { [prop]: item }, options);
      });
    } else {
      value = value.map(item => this.whereItemQuery(key, item, options));
    }

    value = value.filter(item => item && item.length);

    return value.length ? '(' + value.join(binding) + ')' : undefined;
  },

  _whereJSON(key, value, options) {
    const items = [];
    let baseKey = this.quoteIdentifier(key);

    if (options.prefix) {
      if (options.prefix instanceof Utils.Literal) {
        baseKey = `${this.handleSequelizeMethod(options.prefix)}.${baseKey}`;
      } else {
        baseKey = `${this.quoteTable(options.prefix)}.${baseKey}`;
      }
    }

    Utils.getOperators(value).forEach(op => {
      const where = {};
      where[op] = value[op];
      items.push(this.whereItemQuery(key, where, _.assign({}, options, { json: false })));
    });

    _.forOwn(value, (item, prop) => {
      this._traverseJSON(items, baseKey, prop, item, [prop]);
    });

    const result = items.join(this.OperatorMap[Op.and]);
    return items.length > 1 ? '(' + result + ')' : result;
  },

  _traverseJSON(items, baseKey, prop, item, path) {
    let cast;

    if (path[path.length - 1].indexOf('::') > -1) {
      const tmp = path[path.length - 1].split('::');
      cast = tmp[1];
      path[path.length - 1] = tmp[0];
    }

    const pathKey = this.jsonPathExtractionQuery(baseKey, path);

    if (_.isPlainObject(item)) {
      Utils.getOperators(item).forEach(op => {
        const value = this._toJSONValue(item[op]);
        items.push(this.whereItemQuery(this._castKey(pathKey, value, cast), { [op]: value }));
      });

      _.forOwn(item, (value, itemProp) => {
        this._traverseJSON(items, baseKey, itemProp, value, path.concat([itemProp]));
      });

      return;
    }

    item = this._toJSONValue(item);
    items.push(this.whereItemQuery(this._castKey(pathKey, item, cast), { [Op.eq]: item }));
  },

  _toJSONValue(value) {
    return value;
  },

  _castKey(key, value, cast, json) {
    cast = cast || this._getJsonCast(Array.isArray(value) ? value[0] : value);
    if (cast) {
      return new Utils.Literal(this.handleSequelizeMethod(new Utils.Cast(new Utils.Literal(key), cast, json)));
    }

    return new Utils.Literal(key);
  },

  _getJsonCast(value) {
    if (typeof value === 'number') {
      return 'double precision';
    }
    if (value instanceof Date) {
      return 'timestamptz';
    }
    if (typeof value === 'boolean') {
      return 'boolean';
    }
  },

  _joinKeyValue(key, value, comparator, prefix) {
    if (!key) {
      return value;
    }
    if (comparator === undefined) {
      throw new Error(`${key} and ${value} has no comparator`);
    }

    key = this._getSafeKey(key, prefix);
    return [key, value].join(' ' + comparator + ' ');
  },

  _getSafeKey(key, prefix) {
    if (key instanceof Utils.SequelizeMethod) {
      key = this.handleSequelizeMethod(key);
      return this._prefixKey(this.handleSequelizeMethod(key), prefix);
    }

    if (Utils.isColString(key)) {
      key = key.substr(1, key.length - 2).split('.');

      if (key.length > 2) {
        key = [
          key.slice(0, -1).join('->'),
          key[key.length - 1]
        ];
      }

      return key.map(identifier => this.quoteIdentifier(identifier)).join('.');
    }

    return this._prefixKey(this.quoteIdentifier(key), prefix);
  },

  _prefixKey(key, prefix) {
    if (prefix) {
      if (prefix instanceof Utils.Literal) {
        return [this.handleSequelizeMethod(prefix), key].join('.');
      }

      return [this.quoteTable(prefix), key].join('.');
    }

    return key;
  },

  /**
   * Handles IN/NOT IN operators
   * @private
   */
  _handleInOperator(key, value, field, comparator, options) {
    if (value instanceof Utils.Literal) {
      return this._joinKeyValue(key, value.val, comparator, options.prefix);
    }

    if (value.length) {
      return this._joinKeyValue(key, `(${value.map(item => this.escape(item, field)).join(', ')})`, comparator, options.prefix);
    }

    if (comparator === this.OperatorMap[Op.in]) {
      return this._joinKeyValue(key, '(NULL)', comparator, options.prefix);
    }

    return '';
  },

  /**
   * Handles ANY/ALL operators
   * @private
   */
  _handleAnyAllOperator(key, value, field, prop, options) {
    const comparator = `${this.OperatorMap[Op.eq]} ${this.OperatorMap[prop]}`;

    if (value[Op.values]) {
      return this._joinKeyValue(key, `(VALUES ${value[Op.values].map(item => `(${this.escape(item)})`).join(', ')})`, comparator, options.prefix);
    }

    return this._joinKeyValue(key, `(${this.escape(value, field)})`, comparator, options.prefix);
  },

  /**
   * Handles BETWEEN/NOT BETWEEN operators
   * @private
   */
  _handleBetweenOperator(key, value, comparator, options) {
    return this._joinKeyValue(key, `${this.escape(value[0])} AND ${this.escape(value[1])}`, comparator, options.prefix);
  },

  /**
   * Handles COL operator
   * @private
   */
  _handleColOperator(key, value, options) {
    const comparator = this.OperatorMap[Op.eq];
    let colValue = value.split('.');

    if (colValue.length > 2) {
      colValue = [
        colValue.slice(0, -1).join('->'),
        colValue[colValue.length - 1]
      ];
    }

    return this._joinKeyValue(key, colValue.map(identifier => this.quoteIdentifier(identifier)).join('.'), comparator, options.prefix);
  },

  /**
   * Handles complex plain object values
   * @private
   */
  _handleComplexPlainObjectValue(key, value, field, options) {
    const escapeOptions = {
      acceptStrings: false
    };

    if (value[Op.col]) {
      return this._joinKeyValue(key, this.whereItemQuery(null, value), this.OperatorMap[Op.eq], options.prefix);
    }

    if (value[Op.any]) {
      escapeOptions.isList = true;
      return this._joinKeyValue(key, `(${this.escape(value[Op.any], field, escapeOptions)})`, `${this.OperatorMap[Op.eq]} ${this.OperatorMap[Op.any]}`, options.prefix);
    }

    if (value[Op.all]) {
      escapeOptions.isList = true;
      return this._joinKeyValue(key, `(${this.escape(value[Op.all], field, escapeOptions)})`, `${this.OperatorMap[Op.eq]} ${this.OperatorMap[Op.all]}`, options.prefix);
    }

    return null;
  },

  /**
   * Handles null comparisons
   * @private
   */
  _handleNullComparison(key, value, field, comparator, options, escapeOptions) {
    if (value === null && comparator === this.OperatorMap[Op.eq]) {
      return this._joinKeyValue(key, this.escape(value, field, escapeOptions), this.OperatorMap[Op.is], options.prefix);
    }

    if (value === null && comparator === this.OperatorMap[Op.ne]) {
      return this._joinKeyValue(key, this.escape(value, field, escapeOptions), this.OperatorMap[Op.not], options.prefix);
    }

    return null;
  },

  _whereParseSingleValueObject(key, field, prop, value, options) {
    if (prop === Op.not) {
      if (Array.isArray(value)) {
        prop = Op.notIn;
      } else if ([null, true, false].indexOf(value) < 0) {
        prop = Op.ne;
      }
    }

    let comparator = this.OperatorMap[prop] || this.OperatorMap[Op.eq];

    switch (prop) {
      case Op.in:
      case Op.notIn:
        return this._handleInOperator(key, value, field, comparator, options);
      case Op.any:
      case Op.all:
        return this._handleAnyAllOperator(key, value, field, prop, options);
      case Op.between:
      case Op.notBetween:
        return this._handleBetweenOperator(key, value, comparator, options);
      case Op.raw:
        throw new Error('The `$raw` where property is no longer supported.  Use `sequelize.literal` instead.');
      case Op.col:
        return this._handleColOperator(key, value, options);
    }

    const escapeOptions = {
      acceptStrings: comparator.indexOf(this.OperatorMap[Op.like]) !== -1
    };

    if (_.isPlainObject(value)) {
      const result = this._handleComplexPlainObjectValue(key, value, field, options);
      if (result !== null) {
        return result;
      }
    }

    const nullComparison = this._handleNullComparison(key, value, field, comparator, options, escapeOptions);
    if (nullComparison !== null) {
      return nullComparison;
    }

    return this._joinKeyValue(key, this.escape(value, field, escapeOptions), comparator, options.prefix);
  },

  /**
   * Handles SequelizeMethod in where conditions
   * @private
   */
  _handleSequelizeMethodWhere(smth, tableName, factory, options, prepend) {
    return this.handleSequelizeMethod(smth, tableName, factory, options, prepend);
  },

  /**
   * Handles plain object in where conditions
   * @private
   */
  _handlePlainObjectWhere(smth, tableName, factory, options, prepend) {
    return this.whereItemsQuery(smth, {
      model: factory,
      prefix: prepend && tableName
    });
  },

  /**
   * Handles number in where conditions
   * @private
   */
  _handleNumberWhere(smth, tableName, factory, options, prepend) {
    const primaryKeys = factory ? Object.keys(factory.primaryKeys) : [];
    const key = primaryKeys.length > 0 ? primaryKeys[0] : 'id';
    const where = { [key]: smth };

    return this.whereItemsQuery(where, {
      model: factory,
      prefix: prepend && tableName
    });
  },

  /**
   * Handles string in where conditions
   * @private
   */
  _handleStringWhere(smth, tableName, factory, options, prepend) {
    return this.whereItemsQuery(smth, {
      model: factory,
      prefix: prepend && tableName
    });
  },

  /**
   * Handles buffer in where conditions
   * @private
   */
  _handleBufferWhere(smth) {
    return this.escape(smth);
  },

  /**
   * Handles array in where conditions
   * @private
   */
  _handleArrayWhere(smth, tableName, factory, options, prepend) {
    if (smth.length === 0 || (smth.length > 0 && smth[0].length === 0)) {
      return '1=1';
    }

    if (Utils.canTreatArrayAsAnd(smth)) {
      const _smth = { [Op.and]: smth };
      return this.getWhereConditions(_smth, tableName, factory, options, prepend);
    }

    throw new Error('Support for literal replacements in the `where` object has been removed.');
  },

  /**
   * Handles null in where conditions
   * @private
   */
  _handleNullWhere(smth, tableName, factory, options, prepend) {
    return this.whereItemsQuery(smth, {
      model: factory,
      prefix: prepend && tableName
    });
  },

  getWhereConditions(smth, tableName, factory, options, prepend) {
    let result = null;
    const where = {};

    if (Array.isArray(tableName)) {
      tableName = tableName[0];
      if (Array.isArray(tableName)) {
        tableName = tableName[1];
      }
    }

    options = options || {};

    if (typeof prepend === 'undefined') {
      prepend = true;
    }

    if (smth && smth instanceof Utils.SequelizeMethod) {
      result = this._handleSequelizeMethodWhere(smth, tableName, factory, options, prepend);
    } else if (_.isPlainObject(smth)) {
      result = this._handlePlainObjectWhere(smth, tableName, factory, options, prepend);
    } else if (typeof smth === 'number') {
      result = this._handleNumberWhere(smth, tableName, factory, options, prepend);
    } else if (typeof smth === 'string') {
      result = this._handleStringWhere(smth, tableName, factory, options, prepend);
    } else if (Buffer.isBuffer(smth)) {
      result = this._handleBufferWhere(smth);
    } else if (Array.isArray(smth)) {
      result = this._handleArrayWhere(smth, tableName, factory, options, prepend);
    } else if (smth === null) {
      result = this._handleNullWhere(smth, tableName, factory, options, prepend);
    }

    return result ? result : '1=1';
  },

  parseConditionObject(conditions, path) {
    path = path || [];
    return _.reduce(conditions, (result, value, key) => {
      if (_.isObject(value)) {
        result = result.concat(this.parseConditionObject(value, path.concat(key)));
      } else {
        result.push({ path: path.concat(key), value });
      }
      return result;
    }, []);
  },

  isIdentifierQuoted(string) {
    return /^\s*(?:([`"'])(?:(?!\1).|\1{2})*\1\.?)+\s*$/i.test(string);
  },

  booleanValue(value) {
    return value;
  }
};

module.exports = QueryGenerator;
```