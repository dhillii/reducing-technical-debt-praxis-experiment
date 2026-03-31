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
    const { fields, values } = this._extractFieldsAndValues(valueHash, modelAttributeMap, options);
    
    let query = this._buildInsertQuery(options, fields, values);
    const outputFragment = this._buildOutputFragment(options, modelAttributes);
    
    const replacements = {
      ignoreDuplicates: options.ignoreDuplicates ? this._dialect.supports.IGNORE : '',
      onConflictDoNothing: options.ignoreDuplicates ? this._dialect.supports.onConflictDoNothing : '',
      table: this.quoteTable(table),
      attributes: fields.join(','),
      output: outputFragment,
      values: values.join(','),
      tmpTable: this._buildTmpTable(options, modelAttributes)
    };

    query = (replacements.attributes.length ? query : this._getEmptyInsertQuery(options)) + ';';
    
    if (this._shouldWrapIdentityInsert(fields, options)) {
      query = this._wrapIdentityInsert(query, table);
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

  _extractFieldsAndValues(valueHash, modelAttributeMap, options) {
    const fields = [];
    const values = [];
    
    valueHash = Utils.removeNullValuesFromHash(valueHash, this.options.omitNull);
    
    for (const key in valueHash) {
      if (valueHash.hasOwnProperty(key)) {
        const value = valueHash[key];
        const attribute = modelAttributeMap[key];
        
        if (this._isAutoIncrementField(attribute, value)) {
          if (!this._dialect.supports.autoIncrement.defaultValue) {
            continue;
          }
          if (this._dialect.supports.DEFAULT) {
            values.push('DEFAULT');
          } else {
            values.push(this.escape(null));
          }
        } else {
          values.push(this.escape(value, attribute, { context: 'INSERT' }));
        }
        
        fields.push(this.quoteIdentifier(key));
      }
    }
    
    return { fields, values };
  },

  _isAutoIncrementField(attribute, value) {
    return attribute && attribute.autoIncrement === true && !value;
  },

  _buildInsertQuery(options, fields, values) {
    let query = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>';
    
    if (this._dialect.supports['ON DUPLICATE KEY'] && options.onDuplicate) {
      query += ' ON DUPLICATE KEY ' + options.onDuplicate;
    }
    
    if (this._dialect.supports.EXCEPTION && options.exception) {
      query = this._wrapExceptionHandler(query, options);
    }
    
    return query;
  },

  _getEmptyInsertQuery(options) {
    let query = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %><%= output %><%= onConflictDoNothing %>';
    
    if (this._dialect.supports['DEFAULT VALUES']) {
      query += ' DEFAULT VALUES';
    } else if (this._dialect.supports['VALUES ()']) {
      query += ' VALUES ()';
    }
    
    if (this._dialect.supports['ON DUPLICATE KEY'] && options.onDuplicate) {
      query += ' ON DUPLICATE KEY ' + options.onDuplicate;
    }
    
    return query;
  },

  _buildOutputFragment(options, modelAttributes) {
    if (!this._dialect.supports.returnValues || !options.returning) {
      return '';
    }

    if (this._dialect.supports.returnValues.returning) {
      return ' RETURNING *';
    }

    if (this._dialect.supports.returnValues.output) {
      return this._buildMssqlOutputFragment(options, modelAttributes);
    }

    return '';
  },

  _buildMssqlOutputFragment(options, modelAttributes) {
    if (!modelAttributes || !options.hasTrigger || !this._dialect.supports.tmpTableTrigger) {
      return ' OUTPUT INSERTED.*';
    }

    const columns = this._extractTmpTableColumns(modelAttributes);
    const outputColumns = this._extractOutputColumns(modelAttributes);
    
    return {
      tmpTable: `declare @tmp table (${columns}); `,
      outputFragment: ` OUTPUT ${outputColumns} into @tmp`,
      selectFromTmp: ';select * from @tmp'
    };
  },

  _extractTmpTableColumns(modelAttributes) {
    const columns = [];
    for (const modelKey in modelAttributes) {
      const attribute = modelAttributes[modelKey];
      if (!(attribute.type instanceof DataTypes.VIRTUAL)) {
        columns.push(this.quoteIdentifier(attribute.field) + ' ' + attribute.type.toSql());
      }
    }
    return columns.join(',');
  },

  _extractOutputColumns(modelAttributes) {
    const columns = [];
    for (const modelKey in modelAttributes) {
      const attribute = modelAttributes[modelKey];
      if (!(attribute.type instanceof DataTypes.VIRTUAL)) {
        columns.push('INSERTED.' + this.quoteIdentifier(attribute.field));
      }
    }
    return columns.join(',');
  },

  _buildTmpTable(options, modelAttributes) {
    if (!this._dialect.supports.returnValues || !this._dialect.supports.returnValues.output ||
        !modelAttributes || !options.hasTrigger || !this._dialect.supports.tmpTableTrigger) {
      return '';
    }

    const columns = this._extractTmpTableColumns(modelAttributes);
    return `declare @tmp table (${columns}); `;
  },

  _wrapExceptionHandler(query, options) {
    if (semver.gte(this.sequelize.options.databaseVersion, '9.2.0')) {
      const delimiter = '$func_' + uuid.v4().replace(/-/g, '') + '$';
      options.exception = 'WHEN unique_violation THEN GET STACKED DIAGNOSTICS sequelize_caught_exception = PG_EXCEPTION_DETAIL;';
      return 'CREATE OR REPLACE FUNCTION pg_temp.testfunc(OUT response <%= table %>, OUT sequelize_caught_exception text) RETURNS RECORD AS ' + delimiter +
        ' BEGIN ' + query + ' INTO response; EXCEPTION ' + options.exception + ' END ' + delimiter +
        ' LANGUAGE plpgsql; SELECT (testfunc.response).*, testfunc.sequelize_caught_exception FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc()';
    } else {
      options.exception = 'WHEN unique_violation THEN NULL;';
      return 'CREATE OR REPLACE FUNCTION pg_temp.testfunc() RETURNS SETOF <%= table %> AS $body$ BEGIN RETURN QUERY ' + query + '; EXCEPTION ' + options.exception + ' END; $body$ LANGUAGE plpgsql; SELECT * FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc();';
    }
  },

  _shouldWrapIdentityInsert(fields, options) {
    return fields.length > 0 && this._dialect.supports.autoIncrement.identityInsert;
  },

  _wrapIdentityInsert(query, table) {
    return [
      'SET IDENTITY_INSERT', this.quoteTable(table), 'ON;',
      query,
      'SET IDENTITY_INSERT', this.quoteTable(table), 'OFF;'
    ].join(' ');
  },

  bulkInsertQuery(tableName, fieldValueHashes, options, fieldMappedAttributes) {
    options = options || {};
    fieldMappedAttributes = fieldMappedAttributes || {};

    const { allAttributes, serials, tuples } = this._processBulkInsertRows(fieldValueHashes, fieldMappedAttributes);
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

  _processBulkInsertRows(fieldValueHashes, fieldMappedAttributes) {
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

    return { allAttributes, serials, tuples };
  },

  _buildOnDuplicateKeyUpdate(options) {
    if (!this._dialect.supports.updateOnDuplicate || !options.updateOnDuplicate) {
      return '';
    }

    return ' ON DUPLICATE KEY UPDATE ' + options.updateOnDuplicate.map(attr => {
      const key = this.quoteIdentifier(attr);
      return key + '=VALUES(' + key + ')';
    }).join(',');
  },

  updateQuery(tableName, attrValueHash, where, options, attributes) {
    options = options || {};
    _.defaults(options, this.options);

    attrValueHash = Utils.removeNullValuesFromHash(attrValueHash, options.omitNull, options);

    const modelAttributeMap = this._buildModelAttributeMap(attributes);
    const values = this._buildUpdateValues(attrValueHash, modelAttributeMap, options);

    if (values.length === 0) {
      return '';
    }

    const outputFragment = this._buildUpdateOutputFragment(options, attributes);
    let query = '<%= tmpTable %>UPDATE <%= table %> SET <%= values %><%= output %> <%= where %>';

    if (this._dialect.supports['LIMIT ON UPDATE'] && options.limit && this.dialect !== 'mssql') {
      query += ' LIMIT ' + this.escape(options.limit) + ' ';
    }

    const replacements = {
      table: this.quoteTable(tableName),
      values: values.join(','),
      output: outputFragment,
      where: this.whereQuery(where, options),
      tmpTable: ''
    };

    return _.template(query, this._templateSettings)(replacements).trim();
  },

  _buildUpdateValues(attrValueHash, modelAttributeMap, options) {
    const values = [];

    for (const key in attrValueHash) {
      if (modelAttributeMap && modelAttributeMap[key] &&
          modelAttributeMap[key].autoIncrement === true &&
          !this._dialect.supports.autoIncrement.update) {
        continue;
      }

      const value = attrValueHash[key];
      values.push(this.quoteIdentifier(key) + '=' + this.escape(value, modelAttributeMap && modelAttributeMap[key] || undefined, { context: 'UPDATE' }));
    }

    return values;
  },

  _buildUpdateOutputFragment(options, attributes) {
    if (!this._dialect.supports.returnValues) {
      return '';
    }

    if (this._dialect.supports.returnValues.output) {
      if (attributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
        const columns = this._extractTmpTableColumns(attributes);
        const outputColumns = this._extractOutputColumns(attributes);
        return ` OUTPUT ${outputColumns} into @tmp`;
      }
      return ' OUTPUT INSERTED.*';
    }

    if (this._dialect.supports.returnValues.