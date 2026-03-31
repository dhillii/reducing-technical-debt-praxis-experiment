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

const VALID_ORDER_OPTIONS = [
  'ASC', 'DESC', 'ASC NULLS LAST', 'DESC NULLS LAST',
  'ASC NULLS FIRST', 'DESC NULLS FIRST', 'NULLS FIRST', 'NULLS LAST'
];

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

    const modelAttributeMap = this._buildModelAttributeMap(modelAttributes);
    const { fields, values } = this._buildInsertFieldsAndValues(valueHash, modelAttributeMap);
    
    let query = this._buildInsertQueryTemplate(options);
    let outputFragment = '';
    let tmpTable = '';

    if (this._dialect.supports.returnValues && options.returning) {
      const output = this._buildInsertOutput(modelAttributes, options);
      outputFragment = output.fragment;
      tmpTable = output.tmpTable;
    }

    if (this._dialect.supports['ON DUPLICATE KEY'] && options.onDuplicate) {
      query += ' ON DUPLICATE KEY ' + options.onDuplicate;
    }

    const replacements = {
      ignoreDuplicates: options.ignoreDuplicates ? this._dialect.supports.IGNORE : '',
      onConflictDoNothing: options.ignoreDuplicates ? this._dialect.supports.onConflictDoNothing : '',
      table: this.quoteTable(table),
      attributes: fields.join(','),
      output: outputFragment,
      values: values.join(','),
      tmpTable
    };

    query = (replacements.attributes.length ? query : this._getEmptyInsertQuery()) + ';';
    
    if (this._shouldWrapIdentityInsert(fields)) {
      query = this._wrapIdentityInsert(table, query);
    }

    return _.template(query, this._templateSettings)(replacements);
  },

  _buildModelAttributeMap(modelAttributes) {
    const map = {};
    if (modelAttributes) {
      _.each(modelAttributes, (attribute, key) => {
        map[key] = attribute;
        if (attribute.field) {
          map[attribute.field] = attribute;
        }
      });
    }
    return map;
  },

  _buildInsertFieldsAndValues(valueHash, modelAttributeMap) {
    const fields = [];
    const values = [];
    
    valueHash = Utils.removeNullValuesFromHash(valueHash, this.options.omitNull);
    
    for (const key in valueHash) {
      if (valueHash.hasOwnProperty(key)) {
        const value = valueHash[key];
        const attribute = modelAttributeMap[key];
        
        if (this._isAutoIncrementField(attribute, value)) {
          if (this._dialect.supports.autoIncrement.defaultValue) {
            fields.push(this.quoteIdentifier(key));
            values.push('DEFAULT');
          }
        } else {
          fields.push(this.quoteIdentifier(key));
          values.push(this.escape(value, attribute, { context: 'INSERT' }));
        }
      }
    }
    
    return { fields, values };
  },

  _isAutoIncrementField(attribute, value) {
    return attribute && attribute.autoIncrement === true && !value;
  },

  _shouldWrapIdentityInsert(fields) {
    return fields.length > 0 && this._dialect.supports.autoIncrement.identityInsert;
  },

  _wrapIdentityInsert(table, query) {
    return [
      'SET IDENTITY_INSERT', this.quoteTable(table), 'ON;',
      query,
      'SET IDENTITY_INSERT', this.quoteTable(table), 'OFF;'
    ].join(' ');
  },

  _buildInsertQueryTemplate(options) {
    let template = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %><%= onConflictDoNothing %>';
    
    if (this._dialect.supports.EXCEPTION && options.exception) {
      template = this._buildExceptionTemplate(template, options);
    }
    
    return template;
  },

  _buildExceptionTemplate(template, options) {
    if (semver.gte(this.sequelize.options.databaseVersion, '9.2.0')) {
      const delimiter = '$func_' + uuid.v4().replace(/-/g, '') + '$';
      options.exception = 'WHEN unique_violation THEN GET STACKED DIAGNOSTICS sequelize_caught_exception = PG_EXCEPTION_DETAIL;';
      return 'CREATE OR REPLACE FUNCTION pg_temp.testfunc(OUT response <%= table %>, OUT sequelize_caught_exception text) RETURNS RECORD AS ' + delimiter +
        ' BEGIN ' + template + ' INTO response; EXCEPTION ' + options.exception + ' END ' + delimiter +
        ' LANGUAGE plpgsql; SELECT (testfunc.response).*, testfunc.sequelize_caught_exception FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc()';
    } else {
      options.exception = 'WHEN unique_violation THEN NULL;';
      return 'CREATE OR REPLACE FUNCTION pg_temp.testfunc() RETURNS SETOF <%= table %> AS $body$ BEGIN RETURN QUERY ' + template + '; EXCEPTION ' + options.exception + ' END; $body$ LANGUAGE plpgsql; SELECT * FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc();';
    }
  },

  _getEmptyInsertQuery() {
    let query = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %><%= output %><%= onConflictDoNothing %>';
    
    if (this._dialect.supports['DEFAULT VALUES']) {
      query += ' DEFAULT VALUES';
    } else if (this._dialect.supports['VALUES ()']) {
      query += ' VALUES ()';
    }
    
    return query;
  },

  _buildInsertOutput(modelAttributes, options) {
    let outputFragment = '';
    let tmpTable = '';

    if (this._dialect.supports.returnValues.returning) {
      outputFragment = ' RETURNING *';
    } else if (this._dialect.supports.returnValues.output) {
      outputFragment = ' OUTPUT INSERTED.*';

      if (modelAttributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
        const { tmpColumns, outputColumns } = this._buildTmpTableColumns(modelAttributes);
        tmpTable = 'declare @tmp table (<%= columns %>); ';
        const replacement = { columns: tmpColumns };
        tmpTable = _.template(tmpTable, this._templateSettings)(replacement).trim();
        outputFragment = ' OUTPUT ' + outputColumns + ' into @tmp';
      }
    }

    return { fragment: outputFragment, tmpTable };
  },

  _buildTmpTableColumns(modelAttributes) {
    let tmpColumns = '';
    let outputColumns = '';

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

    return { tmpColumns, outputColumns };
  },

  bulkInsertQuery(tableName, fieldValueHashes, options, fieldMappedAttributes) {
    options = options || {};
    fieldMappedAttributes = fieldMappedAttributes || {};

    const { allAttributes, serials } = this._collectBulkAttributes(fieldValueHashes, fieldMappedAttributes);
    const tuples = this._buildBulkTuples(fieldValueHashes, allAttributes, serials);
    const onDuplicateKeyUpdate = this._buildOnDuplicateKeyUpdate(options);

    const replacements = {
      ignoreDuplicates: options.ignoreDuplicates ? this._dialect.supports.ignoreDuplicates : '',
      table: this.quoteTable(tableName),
      attributes: allAttributes.map(attr => this.quoteIdentifier(attr)).join(','),
      tuples: tuples.join(','),
      onDuplicateKeyUpdate,
      returning: this._dialect.supports.returnValues && options.returning ? ' RETURNING *' : '',
      onConflictDoNothing: options.ignoreDuplicates ? this._dialect.supports.onConflictDoNothing : ''
    };

    const query = 'INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>) VALUES <%= tuples %><%= onDuplicateKeyUpdate %><%= onConflictDoNothing %><%= returning %>;';
    return _.template(query, this._templateSettings)(replacements);
  },

  _collectBulkAttributes(fieldValueHashes, fieldMappedAttributes) {
    const allAttributes = [];
    const serials = {};

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

    return { allAttributes, serials };
  },

  _buildBulkTuples(fieldValueHashes, allAttributes, serials) {
    return fieldValueHashes.map(fieldValueHash => {
      const values = allAttributes.map(key => {
        if (this._dialect.supports.bulkDefault && serials[key] === true) {
          return fieldValueHash[key] || 'DEFAULT';
        }
        return this.escape(fieldValueHash[key], undefined, { context: 'INSERT' });
      });
      return `(${values.join(',')})`;
    });
  },

  _buildOnDuplicateKeyUpdate(options) {
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

    const modelAttributeMap = this._buildModelAttributeMap(attributes);
    const values = this._buildUpdateValues(attrValueHash, modelAttributeMap);
    
    let query = '<%= tmpTable %>UPDATE <%= table %> SET <%= values %><%= output %> <%= where %>';
    let outputFragment = '';
    let tmpTable = '';

    if (this._dialect.supports['LIMIT ON UPDATE'] && options.limit && this.dialect !== 'mssql') {
      query += ' LIMIT ' + this.escape(options.limit) + ' ';
    }

    if (this._dialect.supports.returnValues) {
      const output = this._buildUpdateOutput(attributes, options);
      outputFragment = output.fragment;
      tmpTable = output.tmpTable;
      if (output.selectFromTmp) {
        query += output.selectFromTmp;
      }
    }

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

  _buildUpdateValues(attrValueHash, modelAttributeMap) {
    const values = [];

    for (const key in attrValueHash) {
      if (modelAttributeMap && modelAttributeMap[key] &&
          modelAttributeMap[key].autoIncrement === true &&
          !this._dialect.supports.autoIncrement.update) {
        continue;
      }

      const value = attrValueHash[key];
      const attribute = modelAttributeMap && modelAttributeMap[key];
      values.push(this.quoteIdentifier(key) + '=' + this.escape(value, attribute, { context: 'UPDATE' }));
    }

    return values;
  },

  _buildUpdateOutput(attributes, options) {
    let outputFragment = '';
    let tmpTable = '';
    let selectFromTmp = '';

    if (this._dialect.supports.returnValues.output) {
      outputFragment = ' OUTPUT INSERTED.*';

      if (attributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
        const { tmpColumns, outputColumns } = this._buildTmpTableColumns(attributes);
        tmpTable = 'declare @tmp table (<%= columns %>); ';
        const replacement = { columns: tmpColumns };
        tmpTable = _.template(tmpTable, this._templateSettings)(replacement).trim();
        outputFragment = ' OUTPUT ' + outputColumns + ' into @tmp';
        selectFromTmp = ';select * from @tmp';
      }
    } else if (this._dialect.supports.returnValues && options.returning) {
      options.mapToModel = true;
      outputFragment = ' RETURNING *';
    }

    return { fragment: outputFragment, tmpTable, selectFromTmp };
  },

  arithmeticQuery(operator, tableName, attrValueHash, where, options,