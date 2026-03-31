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

    const modelAttributeMap = this._buildModelAttributeMap(modelAttributes);
    const { fields, values } = this._buildInsertFieldsAndValues(valueHash, modelAttributeMap);
    
    let query = this._getInsertQueryTemplate();
    let emptyQuery = this._getInsertEmptyQueryTemplate();
    let outputFragment = '';
    let tmpTable = '';
    let identityWrapperRequired = false;

    this._configureInsertDefaults(emptyQuery);
    
    const { outputFragment: outFrag, tmpTable: tmp, identityWrapperRequired: idRequired } = 
      this._handleInsertReturnValues(options, modelAttributes, fields);
    
    outputFragment = outFrag;
    tmpTable = tmp;
    identityWrapperRequired = idRequired;

    if (this._dialect.supports['ON DUPLICATE KEY'] && options.onDuplicate) {
      query += ' ON DUPLICATE KEY ' + options.onDuplicate;
      emptyQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
    }

    const replacements = this._buildInsertReplacements(options, table, fields, values, outputFragment, tmpTable);
    query = (replacements.attributes.length ? query : emptyQuery) + ';';
    
    if (identityWrapperRequired && this._dialect.supports.autoIncrement.identityInsert) {
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
    const attr = modelAttributeMap && modelAttributeMap[key];
    
    if (attr && attr.autoIncrement === true && !value) {
      if (!this._dialect.supports.autoIncrement.defaultValue) {
        return null;
      }
      return this._dialect.supports.DEFAULT ? 'DEFAULT' : this.escape(null);
    }
    
    return this.escape(value, attr, { context: 'INSERT' });
  },

  _getInsertQueryTemplate() {
    return '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>';
  },

  _getInsertEmptyQueryTemplate() {
    return '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %><%= output %><%= onConflictDoNothing %>';
  },

  _configureInsertDefaults(emptyQuery) {
    if (this._dialect.supports['DEFAULT VALUES']) {
      emptyQuery += ' DEFAULT VALUES';
    } else if (this._dialect.supports['VALUES ()']) {
      emptyQuery += ' VALUES ()';
    }
  },

  _handleInsertReturnValues(options, modelAttributes, fields) {
    let outputFragment = '';
    let tmpTable = '';
    let identityWrapperRequired = false;

    if (!this._dialect.supports.returnValues || !options.returning) {
      return { outputFragment, tmpTable, identityWrapperRequired };
    }

    if (this._dialect.supports.returnValues.returning) {
      outputFragment = ' RETURNING *';
    } else if (this._dialect.supports.returnValues.output) {
      outputFragment = ' OUTPUT INSERTED.*';
      const result = this._buildTmpTableForTrigger(modelAttributes);
      if (result) {
        tmpTable = result.tmpTable;
        outputFragment = result.outputFragment;
      }
    }

    return { outputFragment, tmpTable, identityWrapperRequired };
  },

  _buildTmpTableForTrigger(modelAttributes) {
    if (!modelAttributes || !this.options.hasTrigger || !this._dialect.supports.tmpTableTrigger) {
      return null;
    }

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

    const tmpTableTemplate = 'declare @tmp table (<%= columns %>); ';
    const tmpTable = _.template(tmpTableTemplate, this._templateSettings)({ columns: tmpColumns }).trim();
    const outputFragment = ' OUTPUT ' + outputColumns + ' into @tmp';
    const selectFromTmp = ';select * from @tmp';

    return { tmpTable, outputFragment, selectFromTmp };
  },

  _buildInsertReplacements(options, table, fields, values, outputFragment, tmpTable) {
    return {
      ignoreDuplicates: options.ignoreDuplicates ? this._dialect.supports.IGNORE : '',
      onConflictDoNothing: options.ignoreDuplicates ? this._dialect.supports.onConflictDoNothing : '',
      table: this.quoteTable(table),
      attributes: fields.join(','),
      output: outputFragment,
      values: values.join(','),
      tmpTable
    };
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

    const { allAttributes, serials, tuples } = this._buildBulkInsertData(fieldValueHashes, fieldMappedAttributes);
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
    const values = this._buildUpdateValues(attrValueHash, modelAttributeMap);
    
    let query = '<%= tmpTable %>UPDATE <%= table %> SET <%= values %><%= output %> <%= where %>';
    let outputFragment = '';
    let tmpTable = '';

    if (this._dialect.supports['LIMIT ON UPDATE'] && options.limit && this.dialect !== 'mssql') {
      query += ' LIMIT ' + this.escape(options.limit) + ' ';
    }

    const { outputFragment: outFrag, tmpTable: tmp } = this._handleUpdateReturnValues(options, attributes);
    outputFragment = outFrag;
    tmpTable = tmp;

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
      const attr = modelAttributeMap && modelAttributeMap[key];
      values.push(this.quoteIdentifier(key) + '=' + this.escape(value, attr, { context: 'UPDATE' }));
    }

    return values;
  },

  _handleUpdateReturnValues(options, attributes) {
    let outputFragment = '';
    let tmpTable = '';

    if (!this._dialect.supports.returnValues) {
      return { outputFragment, tmpTable };
    }

    if (this._dialect.supports.returnValues.output) {
      outputFragment = ' OUTPUT INSERTED.*';
      const result = this._buildTmpTableForTrigger(attributes);
      if (result) {
        tmpTable = result.tmpTable;
        outputFragment = result.outputFragment;
      }
    } else if (this._dialect.supports.returnValues && options.returning) {
      options.mapToModel = true;
      outputFragment = ' RETURNING *';
    }

    return { outputFragment, tmpTable };
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

    return _.template(query, this