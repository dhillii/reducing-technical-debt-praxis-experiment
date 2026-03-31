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
    let outputFragment = '';
    let tmpTable = '';
    let identityWrapperRequired = false;

    if (this._dialect.supports['DEFAULT VALUES']) {
      query = query.replace('<%= defaultValues %>', ' DEFAULT VALUES');
    } else if (this._dialect.supports['VALUES ()']) {
      query = query.replace('<%= defaultValues %>', ' VALUES ()');
    } else {
      query = query.replace('<%= defaultValues %>', '');
    }

    if (this._dialect.supports.returnValues && options.returning) {
      const returnResult = this._buildReturnFragment(modelAttributes, options);
      outputFragment = returnResult.fragment;
      tmpTable = returnResult.tmpTable;
      query = query.replace('<%= output %>', outputFragment);
      if (returnResult.selectFromTmp) {
        query = query.replace('<%= selectFromTmp %>', returnResult.selectFromTmp);
      }
    }

    if (this._dialect.supports['ON DUPLICATE KEY'] && options.onDuplicate) {
      query += ' ON DUPLICATE KEY ' + options.onDuplicate;
    }

    identityWrapperRequired = this._checkIdentityWrapperRequired(fields, modelAttributeMap);

    const replacements = {
      ignoreDuplicates: options.ignoreDuplicates ? this._dialect.supports.IGNORE : '',
      onConflictDoNothing: options.ignoreDuplicates ? this._dialect.supports.onConflictDoNothing : '',
      table: this.quoteTable(table),
      attributes: fields.join(','),
      values: values.join(','),
      tmpTable
    };

    query = (replacements.attributes.length ? query : query.replace('(<%= attributes %>)<%= output %> VALUES (<%= values %>)', '')) + ';';
    
    if (identityWrapperRequired && this._dialect.supports.autoIncrement.identityInsert) {
      query = [
        'SET IDENTITY_INSERT', this.quoteTable(table), 'ON;',
        query,
        'SET IDENTITY_INSERT', this.quoteTable(table), 'OFF;'
      ].join(' ');
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
        
        if (attribute && attribute.autoIncrement === true && !value) {
          if (this._dialect.supports.autoIncrement.defaultValue) {
            fields.push(this.quoteIdentifier(key));
            values.push(this._dialect.supports.DEFAULT ? 'DEFAULT' : this.escape(null));
          }
        } else {
          fields.push(this.quoteIdentifier(key));
          values.push(this.escape(value, attribute, { context: 'INSERT' }));
        }
      }
    }
    
    return { fields, values };
  },

  _getInsertQueryTemplate() {
    return '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %><%= selectFromTmp %>';
  },

  _buildReturnFragment(modelAttributes, options) {
    let fragment = '';
    let tmpTable = '';
    let selectFromTmp = '';

    if (this._dialect.supports.returnValues.returning) {
      fragment = ' RETURNING *';
    } else if (this._dialect.supports.returnValues.output) {
      fragment = ' OUTPUT INSERTED.*';

      if (modelAttributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
        const result = this._buildTmpTableForTrigger(modelAttributes);
        tmpTable = result.tmpTable;
        fragment = result.outputFragment;
        selectFromTmp = result.selectFromTmp;
      }
    }

    return { fragment, tmpTable, selectFromTmp };
  },

  _buildTmpTableForTrigger(modelAttributes) {
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

  _checkIdentityWrapperRequired(fields, modelAttributeMap) {
    return fields.some(field => {
      const key = field.replace(/[`"]/g, '');
      return modelAttributeMap[key] && modelAttributeMap[key].autoIncrement === true;
    });
  },

  bulkInsertQuery(tableName, fieldValueHashes, options, fieldMappedAttributes) {
    options = options || {};
    fieldMappedAttributes = fieldMappedAttributes || {};

    const { allAttributes, serials, tuples } = this._buildBulkInsertData(fieldValueHashes, fieldMappedAttributes);
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

  _buildOnDuplicateKeyUpdate(options, allAttributes) {
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
    
    if (values.length === 0) {
      return '';
    }

    let query = '<%= tmpTable %>UPDATE <%= table %> SET <%= values %><%= output %> <%= where %>';
    let outputFragment = '';
    let tmpTable = '';

    if (this._dialect.supports['LIMIT ON UPDATE'] && options.limit && this.dialect !== 'mssql') {
      query += ' LIMIT ' + this.escape(options.limit) + ' ';
    }

    if (this._dialect.supports.returnValues) {
      const returnResult = this._buildUpdateReturnFragment(attributes, options);
      outputFragment = returnResult.fragment;
      tmpTable = returnResult.tmpTable;
      if (returnResult.selectFromTmp) {
        query += returnResult.selectFromTmp;
      }
    }

    const replacements = {
      table: this.quoteTable(tableName),
      values: values.join(','),
      output: outputFragment,
      where: this.whereQuery(where, options),
      tmpTable
    };

    return _.template(query, this._templateSettings)(replacements).trim();
  },

  _buildUpdateValues(attrValueHash, modelAttributeMap) {
    const values = [];
    
    for (const key in attrValueHash) {
      const attribute = modelAttributeMap[key];
      if (attribute && attribute.autoIncrement === true && !this._dialect.supports.autoIncrement.update) {
        continue;
      }
      const value = attrValueHash[key];
      values.push(this.quoteIdentifier(key) + '=' + this.escape(value, attribute, { context: 'UPDATE' }));
    }
    
    return values;
  },

  _buildUpdateReturnFragment(attributes, options) {
    let fragment = '';
    let tmpTable = '';
    let selectFromTmp = '';

    if (this._dialect.supports.returnValues.output) {
      fragment = ' OUTPUT INSERTED.*';

      if (attributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
        const result = this._buildTmpTableForTrigger(attributes);
        tmpTable = result.tmpTable;
        fragment = result.outputFragment;
        selectFromTmp = result.selectFromTmp;
      }
    } else if (this._dialect.supports.returnValues && options.returning) {
      options.mapToModel = true;
      fragment = ' RETURNING *';
    }

    return { fragment, tmpTable, selectFromTmp };
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

    return _.template(query, this._templateSettings)(replacements);
  },

  nameIndexes(indexes, rawTablename) {
    if (typeof rawTablename === 'object') {
      rawTablename = rawTablename.tableName;
    }

    return _.map(indexes, index => {
      if (!