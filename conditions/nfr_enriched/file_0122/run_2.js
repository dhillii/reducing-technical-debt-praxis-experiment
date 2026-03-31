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
        return null; // Will be filtered out
      }
      return this._dialect.supports.DEFAULT ? 'DEFAULT' : this.escape(null);
    }
    
    return this.escape(value, attribute, { context: 'INSERT' });
  },

  _buildInsertQueryTemplate(options) {
    let template = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>';
    
    if (this._dialect.supports.EXCEPTION && options.exception) {
      template = this._wrapExceptionHandler(template, options);
    }
    
    return template;
  },

  _wrapExceptionHandler(template, options) {
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

  _buildInsertOutput(modelAttributes, options) {
    let fragment = '';
    let tmpTable = '';

    if (this._dialect.supports.returnValues.returning) {
      fragment = ' RETURNING *';
    } else if (this._dialect.supports.returnValues.output) {
      fragment = ' OUTPUT INSERTED.*';
      
      if (modelAttributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
        const { tmpColumns, outputColumns } = this._buildTmpTableColumns(modelAttributes);
        tmpTable = `declare @tmp table (${tmpColumns}); `;
        fragment = ` OUTPUT ${outputColumns} into @tmp`;
      }
    }

    return { fragment, tmpTable };
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

  _getEmptyInsertQuery() {
    let query = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %><%= output %><%= onConflictDoNothing %>';
    
    if (this._dialect.supports['DEFAULT VALUES']) {
      query += ' DEFAULT VALUES';
    } else if (this._dialect.supports['VALUES ()']) {
      query += ' VALUES ()';
    }
    
    return query;
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

  bulkInsertQuery(tableName, fieldValueHashes, options, fieldMappedAttributes) {
    options = options || {};
    fieldMappedAttributes = fieldMappedAttributes || {};

    const { allAttributes, tuples, serials } = this._buildBulkInsertData(fieldValueHashes, fieldMappedAttributes);
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

  _buildBulkInsertData(fieldValueHashes, fieldMappedAttributes) {
    const allAttributes = [];
    const serials = {};
    const tuples = [];

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

    return { allAttributes, tuples, serials };
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
    const { outputFragment, tmpTable } = this._buildUpdateOutput(attributes, options);

    if (this._dialect.supports['LIMIT ON UPDATE'] && options.limit && this.dialect !== 'mssql') {
      query += ' LIMIT ' + this.escape(options.limit) + ' ';
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
      const attribute = modelAttributeMap && modelAttributeMap[key];
      
      if (attribute && attribute.autoIncrement === true && !this._dialect.supports.autoIncrement.update) {
        continue;
      }

      const value = attrValueHash[key];
      values.push(this.quoteIdentifier(key) + '=' + this.escape(value, attribute, { context: 'UPDATE' }));
    }

    return values;
  },

  _buildUpdateOutput(attributes, options) {
    let outputFragment = '';
    let tmpTable = '';

    if (this._dialect.supports.returnValues) {
      if (this._dialect.supports.returnValues.output) {
        outputFragment = ' OUTPUT INSERTED.*';

        if (attributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
          const { tmpColumns, outputColumns } = this._buildTmpTableColumns(attributes);
          tmpTable = `declare @tmp table (${tmpColumns}); `;
          outputFragment = ` OUTPUT ${outputColumns} into @tmp`;
        }
      } else if (this._dialect.supports.returnValues && options.returning) {
        options.mapToModel = true;
        outputFragment = ' RETURNING *';
      }
    }

    return { outputFragment, tmpTable };
  },

  arithmeticQuery(operator, tableName, attrValueHash, where, options, attributes) {
    options = options || {};
    _.defaults(options, { returning: true });

    attrValueHash = Utils.removeNullValuesFromHash(attrValueHash, this.options.omitNull);

    const values = [];
    let outputFragment = '';

    for (const key in attrValueHash) {
      const value = attrValueHash[key];
      values.push(this.quoteIdentifier(key) + '=' + this.quoteIdentifier(key) + operator + ' ' + this.escape(value));
    }

    attributes = attributes || {};
    for (const key in attributes) {
      const value = attributes[key];
      values.push(this.quoteIdentifier(key) + '=' + this