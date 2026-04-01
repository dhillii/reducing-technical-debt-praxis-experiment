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

  insertQuery(table, valueHash, modelAttributes, options) {
    options = options || {};
    _.defaults(options, this.options);

    const modelAttributeMap = {};
    const fields = [];
    const values = [];
    let query;
    let valueQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>';
    let emptyQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %><%= output %><%= onConflictDoNothing %>';
    let outputFragment;
    let identityWrapperRequired = false;
    let tmpTable = '';

    this._buildModelAttributeMap(modelAttributeMap, modelAttributes);
    this._buildEmptyQueryTemplate(emptyQuery);
    this._handleReturnValues(valueQuery, emptyQuery, outputFragment, modelAttributes, options, tmpTable);
    this._handleExceptionHandling(valueQuery, options);
    this._handleOnDuplicateKey(valueQuery, emptyQuery, options);

    valueHash = Utils.removeNullValuesFromHash(valueHash, this.options.omitNull);
    this._buildInsertValues(valueHash, modelAttributeMap, fields, values, identityWrapperRequired);

    const replacements = {
      ignoreDuplicates: options.ignoreDuplicates ? this._dialect.supports.IGNORE : '',
      onConflictDoNothing: options.ignoreDuplicates ? this._dialect.supports.onConflictDoNothing : '',
      table: this.quoteTable(table),
      attributes: fields.join(','),
      output: outputFragment,
      values: values.join(','),
      tmpTable
    };

    query = (replacements.attributes.length ? valueQuery : emptyQuery) + ';';
    if (identityWrapperRequired && this._dialect.supports.autoIncrement.identityInsert) {
      query = [
        'SET IDENTITY_INSERT', this.quoteTable(table), 'ON;',
        query,
        'SET IDENTITY_INSERT', this.quoteTable(table), 'OFF;'
      ].join(' ');
    }

    return _.template(query, this._templateSettings)(replacements);
  },

  _buildModelAttributeMap(modelAttributeMap, modelAttributes) {
    if (modelAttributes) {
      _.each(modelAttributes, (attribute, key) => {
        modelAttributeMap[key] = attribute;
        if (attribute.field) {
          modelAttributeMap[attribute.field] = attribute;
        }
      });
    }
  },

  _buildEmptyQueryTemplate(emptyQuery) {
    if (this._dialect.supports['DEFAULT VALUES']) {
      return emptyQuery + ' DEFAULT VALUES';
    } else if (this._dialect.supports['VALUES ()']) {
      return emptyQuery + ' VALUES ()';
    }
    return emptyQuery;
  },

  _handleReturnValues(valueQuery, emptyQuery, outputFragment, modelAttributes, options, tmpTable) {
    if (!this._dialect.supports.returnValues || !options.returning) {
      return;
    }

    if (this._dialect.supports.returnValues.returning) {
      valueQuery += ' RETURNING *';
      emptyQuery += ' RETURNING *';
    } else if (this._dialect.supports.returnValues.output) {
      outputFragment = ' OUTPUT INSERTED.*';
      this._handleMSSQLTrigger(modelAttributes, options, tmpTable, valueQuery, emptyQuery, outputFragment);
    }
  },

  _handleMSSQLTrigger(modelAttributes, options, tmpTable, valueQuery, emptyQuery, outputFragment) {
    if (!modelAttributes || !options.hasTrigger || !this._dialect.supports.tmpTableTrigger) {
      return;
    }

    let tmpColumns = '';
    let outputColumns = '';
    tmpTable = 'declare @tmp table (<%= columns %>); ';

    for (const modelKey in modelAttributes) {
      const attribute = modelAttributes[modelKey];
      if (!(attribute.type instanceof DataTypes.VIRTUAL)) {
        if (tmpColumns.length > 0) {
          tmpColumns += ',';
          outputColumns += ',';
        }
        tmpColumns += this.quoteIdentifier(attribute.field) + ' ' + attribute.type.toSql();
        outputColumns += 'INSERTED.' + this.quoteIdentifier(attribute.field);
      }
    }

    const replacement = { columns: tmpColumns };
    tmpTable = _.template(tmpTable, this._templateSettings)(replacement).trim();
    outputFragment = ' OUTPUT ' + outputColumns + ' into @tmp';
    const selectFromTmp = ';select * from @tmp';

    valueQuery += selectFromTmp;
    emptyQuery += selectFromTmp;
  },

  _handleExceptionHandling(valueQuery, options) {
    if (!this._dialect.supports.EXCEPTION || !options.exception) {
      return;
    }

    if (semver.gte(this.sequelize.options.databaseVersion, '9.2.0')) {
      const delimiter = '$func_' + uuid.v4().replace(/-/g, '') + '$';
      options.exception = 'WHEN unique_violation THEN GET STACKED DIAGNOSTICS sequelize_caught_exception = PG_EXCEPTION_DETAIL;';
      valueQuery = 'CREATE OR REPLACE FUNCTION pg_temp.testfunc(OUT response <%= table %>, OUT sequelize_caught_exception text) RETURNS RECORD AS ' + delimiter +
        ' BEGIN ' + valueQuery + ' INTO response; EXCEPTION ' + options.exception + ' END ' + delimiter +
        ' LANGUAGE plpgsql; SELECT (testfunc.response).*, testfunc.sequelize_caught_exception FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc()';
    } else {
      options.exception = 'WHEN unique_violation THEN NULL;';
      valueQuery = 'CREATE OR REPLACE FUNCTION pg_temp.testfunc() RETURNS SETOF <%= table %> AS $body$ BEGIN RETURN QUERY ' + valueQuery + '; EXCEPTION ' + options.exception + ' END; $body$ LANGUAGE plpgsql; SELECT * FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc();';
    }
  },

  _handleOnDuplicateKey(valueQuery, emptyQuery, options) {
    if (this._dialect.supports['ON DUPLICATE KEY'] && options.onDuplicate) {
      valueQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
      emptyQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
    }
  },

  _buildInsertValues(valueHash, modelAttributeMap, fields, values, identityWrapperRequired) {
    for (const key in valueHash) {
      if (valueHash.hasOwnProperty(key)) {
        const value = valueHash[key];
        fields.push(this.quoteIdentifier(key));
        this._handleInsertValue(key, value, modelAttributeMap, fields, values, identityWrapperRequired);
      }
    }
  },

  _handleInsertValue(key, value, modelAttributeMap, fields, values, identityWrapperRequired) {
    const attr = modelAttributeMap && modelAttributeMap[key];
    
    if (attr && attr.autoIncrement === true && !value) {
      if (!this._dialect.supports.autoIncrement.defaultValue) {
        fields.splice(-1, 1);
      } else if (this._dialect.supports.DEFAULT) {
        values.push('DEFAULT');
      } else {
        values.push(this.escape(null));
      }
    } else {
      if (attr && attr.autoIncrement === true) {
        identityWrapperRequired = true;
      }
      values.push(this.escape(value, attr || undefined, { context: 'INSERT' }));
    }
  },

  bulkInsertQuery(tableName, fieldValueHashes, options, fieldMappedAttributes) {
    options = options || {};
    fieldMappedAttributes = fieldMappedAttributes || {};

    const query = 'INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>) VALUES <%= tuples %><%= onDuplicateKeyUpdate %><%= onConflictDoNothing %><%= returning %>;';
    const tuples = [];
    const serials = {};
    const allAttributes = [];
    let onDuplicateKeyUpdate = '';

    this._collectBulkAttributes(fieldValueHashes, fieldMappedAttributes, allAttributes, serials);
    this._buildBulkTuples(fieldValueHashes, allAttributes, serials, tuples);
    this._buildOnDuplicateKeyUpdate(options, onDuplicateKeyUpdate);

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

  _collectBulkAttributes(fieldValueHashes, fieldMappedAttributes, allAttributes, serials) {
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
  },

  _buildBulkTuples(fieldValueHashes, allAttributes, serials, tuples) {
    for (const fieldValueHash of fieldValueHashes) {
      const values = allAttributes.map(key => {
        if (this._dialect.supports.bulkDefault && serials[key] === true) {
          return fieldValueHash[key] || 'DEFAULT';
        }
        return this.escape(fieldValueHash[key], fieldMappedAttributes[key], { context: 'INSERT' });
      });
      tuples.push(`(${values.join(',')})`);
    }
  },

  _buildOnDuplicateKeyUpdate(options, onDuplicateKeyUpdate) {
    if (this._dialect.supports.updateOnDuplicate && options.updateOnDuplicate) {
      return ' ON DUPLICATE KEY UPDATE ' + options.updateOnDuplicate.map(attr => {
        const key = this.quoteIdentifier(attr);
        return key + '=VALUES(' + key + ')';
      }).join(',');
    }
    return '';
  },

  updateQuery(tableName, attrValueHash, where, options, attributes) {
    options = options || {};
    _.defaults(options, this.options);

    attrValueHash = Utils.removeNullValuesFromHash(attrValueHash, options.omitNull, options);

    const values = [];
    const modelAttributeMap = {};
    let query = '<%= tmpTable %>UPDATE <%= table %> SET <%= values %><%= output %> <%= where %>';
    let outputFragment;
    let tmpTable = '';
    let selectFromTmp = '';

    this._addLimitToUpdateQuery(query, options);
    this._handleUpdateReturnValues(outputFragment, attributes, options, tmpTable, selectFromTmp, query);
    this._buildUpdateModelAttributeMap(attributes, modelAttributeMap);
    this._buildUpdateValues(attrValueHash, modelAttributeMap, values);

    const replacements = {
      table: this.quoteTable(tableName),
      values: values.join(','),
      output: outputFragment,
      where: this.whereQuery(where, options),
      tmpTable
    };

    if (values.length === 0) {
      return '';
    }

    return _.template(query, this._templateSettings)(replacements).trim();
  },

  _addLimitToUpdateQuery(query, options) {
    if (this._dialect.supports['LIMIT ON UPDATE'] && options.limit && this.dialect !== 'mssql') {
      query += ' LIMIT ' + this.escape(options.limit) + ' ';
    }
  },

  _handleUpdateReturnValues(outputFragment, attributes, options, tmpTable, selectFromTmp, query) {
    if (!this._dialect.supports.returnValues) {
      return;
    }

    if (this._dialect.supports.returnValues.output) {
      outputFragment = ' OUTPUT INSERTED.*';
      if (attributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
        this._buildUpdateTriggerOutput(attributes, tmpTable, outputFragment, selectFromTmp, query);
      }
    } else if (options.returning) {
      options.mapToModel = true;
      query += ' RETURNING *';
    }
  },

  _buildUpdateTriggerOutput(attributes, tmpTable, outputFragment, selectFromTmp, query) {
    tmpTable = 'declare @tmp table (<%= columns %>); ';
    let tmpColumns = '';
    let outputColumns = '';

    for (const modelKey in attributes) {
      const attribute = attributes[modelKey];
      if (!(attribute.type instanceof DataTypes.VIRTUAL)) {
        if (tmpColumns.length > 0) {
          tmpColumns += ',';
          outputColumns += ',';
        }
        tmpColumns += this.quoteIdentifier(attribute.field) + ' ' + attribute.type.toSql();
        outputColumns += 'INSERTED.' + this.quoteIdentifier(