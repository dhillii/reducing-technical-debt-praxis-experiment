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
    const outputFragment = this._buildOutputFragment(modelAttributes, options);
    
    const replacements = {
      ignoreDuplicates: options.ignoreDuplicates ? this._dialect.supports.IGNORE : '',
      onConflictDoNothing: options.ignoreDuplicates ? this._dialect.supports.onConflictDoNothing : '',
      table: this.quoteTable(table),
      attributes: fields.join(','),
      output: outputFragment,
      values: values.join(','),
      tmpTable: this._buildTmpTable(modelAttributes, options)
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
        fields.push(this.quoteIdentifier(key));
        values.push(this._escapeInsertValue(value, key, modelAttributeMap));
      }
    }
    
    return { fields, values };
  },

  _escapeInsertValue(value, key, modelAttributeMap) {
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
    
    return this.escape(value, attribute, { context: 'INSERT' });
  },

  _buildInsertQuery(options, fields, values) {
    let query = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>';
    
    if (this._dialect.supports['ON DUPLICATE KEY'] && options.onDuplicate) {
      query += ' ON DUPLICATE KEY ' + options.onDuplicate;
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

  _buildOutputFragment(modelAttributes, options) {
    if (!this._dialect.supports.returnValues || !options.returning) {
      return '';
    }

    if (this._dialect.supports.returnValues.returning) {
      return ' RETURNING *';
    } else if (this._dialect.supports.returnValues.output) {
      return this._buildMssqlOutputFragment(modelAttributes, options);
    }
    
    return '';
  },

  _buildMssqlOutputFragment(modelAttributes, options) {
    let outputFragment = ' OUTPUT INSERTED.*';
    
    if (modelAttributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
      const { tmpColumns, outputColumns } = this._buildTmpTableColumns(modelAttributes);
      outputFragment = ' OUTPUT ' + outputColumns + ' into @tmp';
    }
    
    return outputFragment;
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

  _buildTmpTable(modelAttributes, options) {
    if (!modelAttributes || !options.hasTrigger || !this._dialect.supports.tmpTableTrigger) {
      return '';
    }

    const { tmpColumns } = this._buildTmpTableColumns(modelAttributes);
    const tmpTable = 'declare @tmp table (<%= columns %>); ';
    const replacement = { columns: tmpColumns };
    
    return _.template(tmpTable, this._templateSettings)(replacement).trim();
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

    const { allAttributes, tuples, serials } = this._buildBulkInsertTuples(
      fieldValueHashes,
      fieldMappedAttributes
    );

    const onDuplicateKeyUpdate = this._buildOnDuplicateKeyUpdate(options, allAttributes);

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

  _buildBulkInsertTuples(fieldValueHashes, fieldMappedAttributes) {
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

  _buildOnDuplicateKeyUpdate(options, allAttributes) {
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

    const outputFragment = this._buildUpdateOutputFragment(attributes, options);
    let query = '<%= tmpTable %>UPDATE <%= table %> SET <%= values %><%= output %> <%= where %>';

    if (this._dialect.supports['LIMIT ON UPDATE'] && options.limit && this.dialect !== 'mssql') {
      query += ' LIMIT ' + this.escape(options.limit) + ' ';
    }

    const replacements = {
      table: this.quoteTable(tableName),
      values: values.join(','),
      output: outputFragment,
      where: this.whereQuery(where, options),
      tmpTable: this._buildUpdateTmpTable(attributes, options)
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
      values.push(this.quoteIdentifier(key) + '=' + this.escape(value, modelAttributeMap && modelAttributeMap[key], { context: 'UPDATE' }));
    }

    return values;
  },

  _buildUpdateOutputFragment(attributes, options) {
    if (!this._dialect.supports.returnValues) {
      return '';
    }

    if (this._dialect.supports.returnValues.output) {
      if (attributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
        return this._buildMssqlUpdateOutputFragment(attributes);
      }
      return ' OUTPUT INSERTED.*';
    } else if (this._dialect.supports.returnValues && options.returning) {
      options.mapToModel = true;
      return ' RETURNING *';
    }

    return '';
  },

  _buildMssqlUpdateOutputFragment(attributes) {
    const { tmpColumns, outputColumns } = this._buildTmpTableColumns(attributes);
    return ' OUTPUT ' + outputColumns + ' into @tmp';
  },

  _buildUpdateTmpTable(attributes, options) {
    if (!attributes || !options.hasTrigger || !this._dialect.supports.tmpTableTrigger) {
      return '';
    }

    const { tmpColumns } = this._buildTmpTableColumns(attributes);
    const tmpTable = 'declare @tmp table (<%= columns %>); ';
    const replacement = { columns: tmpColumns };
    
    return _.template(tmpTable, this._templateSettings)(replacement).trim();
  },

  arithmeticQuery(operator, tableName, attrValueHash, where, options, attributes) {
    options = options || {};
    _.defaults(options, { returning: true });

    attrValueHash = Utils.removeNullValuesFromHash(attrValueHash, this.options.omitNull);

    const values = [];
    let query = 'UPDATE <%= table %> SET <%= values %><%= output %> <%= where %>';
    let outputFragment = '';

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
      values.push(this.qu