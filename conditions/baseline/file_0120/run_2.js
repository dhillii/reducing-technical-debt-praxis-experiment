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

  _buildInsertValueQuery(valueHash, modelAttributeMap, options) {
    const fields = [];
    const values = [];

    valueHash = Utils.removeNullValuesFromHash(valueHash, this.options.omitNull);
    
    for (const key in valueHash) {
      if (valueHash.hasOwnProperty(key)) {
        const value = valueHash[key];
        fields.push(this.quoteIdentifier(key));
        values.push(this._getInsertValue(key, value, modelAttributeMap));
      }
    }

    return { fields, values };
  },

  _getInsertValue(key, value, modelAttributeMap) {
    const attribute = modelAttributeMap && modelAttributeMap[key];
    
    if (attribute && attribute.autoIncrement === true && !value) {
      if (!this._dialect.supports.autoIncrement.defaultValue) {
        return null;
      } else if (this._dialect.supports.DEFAULT) {
        return 'DEFAULT';
      } else {
        return this.escape(null);
      }
    }

    return this.escape(value, attribute || undefined, { context: 'INSERT' });
  },

  _buildInsertQueryTemplate(options) {
    let valueQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>';
    let emptyQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %><%= output %><%= onConflictDoNothing %>';

    if (this._dialect.supports['DEFAULT VALUES']) {
      emptyQuery += ' DEFAULT VALUES';
    } else if (this._dialect.supports['VALUES ()']) {
      emptyQuery += ' VALUES ()';
    }

    return { valueQuery, emptyQuery };
  },

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
      
      if (modelAttributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
        const tmpData = this._buildTmpTableForTrigger(modelAttributes);
        tmpTable = tmpData.tmpTable;
        outputFragment = tmpData.outputFragment;
      }
    }

    return { outputFragment, tmpTable };
  },

  _buildTmpTableForTrigger(modelAttributes) {
    let tmpColumns = '';
    let outputColumns = '';
    let tmpTable = 'declare @tmp table (<%= columns %>); ';

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
    const outputFragment = ' OUTPUT ' + outputColumns + ' into @tmp';
    const selectFromTmp = ';select * from @tmp';

    return { tmpTable, outputFragment, selectFromTmp };
  },

  _applyInsertExceptionHandling(valueQuery, emptyQuery, options) {
    if (!this._dialect.supports.EXCEPTION || !options.exception) {
      return { valueQuery, emptyQuery };
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

    return { valueQuery, emptyQuery };
  },

  _applyInsertDuplicateHandling(valueQuery, emptyQuery, options) {
    if (this._dialect.supports['ON DUPLICATE KEY'] && options.onDuplicate) {
      valueQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
      emptyQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
    }
    return { valueQuery, emptyQuery };
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

    const { valueQuery: baseValueQuery, emptyQuery: baseEmptyQuery } = this._buildInsertQueryTemplate(options);
    const { outputFragment, tmpTable } = this._buildInsertOutputFragment(modelAttributes, options);
    
    let valueQuery = baseValueQuery;
    let emptyQuery = baseEmptyQuery;

    if (outputFragment) {
      valueQuery += outputFragment;
      emptyQuery += outputFragment;
    }

    const { valueQuery: exValueQuery, emptyQuery: exEmptyQuery } = this._applyInsertExceptionHandling(valueQuery, emptyQuery, options);
    valueQuery = exValueQuery;
    emptyQuery = exEmptyQuery;

    const { valueQuery: dupValueQuery, emptyQuery: dupEmptyQuery } = this._applyInsertDuplicateHandling(valueQuery, emptyQuery, options);
    valueQuery = dupValueQuery;
    emptyQuery = dupEmptyQuery;

    const { fields, values } = this._buildInsertValueQuery(valueHash, modelAttributeMap, options);

    let identityWrapperRequired = false;
    for (const key in valueHash) {
      if (valueHash.hasOwnProperty(key) && modelAttributeMap && modelAttributeMap[key] && modelAttributeMap[key].autoIncrement === true) {
        identityWrapperRequired = true;
        break;
      }
    }

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
    if (identityWrapperRequired && this._dialect.supports.autoIncrement.identityInsert) {
      query = [
        'SET IDENTITY_INSERT', this.quoteTable(table), 'ON;',
        query,
        'SET IDENTITY_INSERT', this.quoteTable(table), 'OFF;'
      ].join(' ');
    }

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
        if (
          fieldMappedAttributes[key]
          && fieldMappedAttributes[key].autoIncrement === true
        ) {
          serials[key] = true;
        }
      });
    }

    for (const fieldValueHash of fieldValueHashes) {
      const values = allAttributes.map(key => {
        if (
          this._dialect.supports.bulkDefault
          && serials[key] === true
        ) {
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
        const tmpData = this._buildTmpTableForTrigger(attributes);
        tmpTable = tmpData.tmpTable;
        outputFragment = tmpData.outputFragment;
        selectFromTmp = tmpData.selectFromTmp;
      }
    } else if (this._dialect.supports.returnValues.returning && options.returning) {
      options.mapToModel = true;
      outputFragment = ' RETURNING *';
    }

    return { outputFragment, tmpTable, selectFromTmp };
  },

  updateQuery(tableName, attrValueHash, where, options, attributes) {
    options = options || {};
    _.defaults(options, this.options);

    attrValueHash = Utils.removeNullValuesFromHash(attrValueHash, options.omitNull, options);

    const values = [];
    const modelAttributeMap = {};
    let query = '<%= tmpTable %>UPDATE <%= table %> SET <%= values %><%= output %> <%= where %>';

    if (attributes) {
      _.each(attributes, (attribute, key) => {
        modelAttributeMap[key] = attribute;
        if (attribute.field) {
          modelAttributeMap[attribute.field] = attribute;
        }
      });
    }

    for (const key in attrValueHash) {
      if (modelAttributeMap && modelAttributeMap[key] &&
          modelAttributeMap[key].autoIncrement === true &&
          !this._dialect.supports.autoIncrement.update) {
        continue;
      }

      const value = attrValueHash[key];
      values.push(this.quoteIdentifier(key) + '=' + this.escape(value, modelAttributeMap && modelAttributeMap[key] || undefined, { context: 'UPDATE' }));
    }

    if (values.length === 0) {
      return '';
    }

    const { outputFragment, tmpTable, selectFromTmp } = this._buildUpdateOutputFragment(attributes, options);

    let finalQuery = query;
    if (selectFromTmp) {
      finalQuery += selectFromTmp;
    }

    if (this._dialect.supports['LIMIT ON UPDATE'] && options.limit) {
      if (this.dialect !== 'mssql') {
        finalQuery += ' LIMIT ' + this.escape(options.limit) + ' ';
      }
    }

    const replacements = {
      table: this.quoteTable(tableName),
      values: values.join(','),