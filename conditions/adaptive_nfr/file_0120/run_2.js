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
   * Builds output fragment for INSERT queries with RETURNING/OUTPUT support
   * @private
   */
  _buildOutputFragment(modelAttributes, options) {
    if (!this._dialect.supports.returnValues) {
      return { outputFragment: '', tmpTable: '' };
    }

    if (this._dialect.supports.returnValues.returning) {
      return { outputFragment: ' RETURNING *', tmpTable: '' };
    }

    if (!this._dialect.supports.returnValues.output) {
      return { outputFragment: '', tmpTable: '' };
    }

    return this._buildMSSQLOutputFragment(modelAttributes, options);
  },

  /**
   * Builds MSSQL-specific output fragment with trigger support
   * @private
   */
  _buildMSSQLOutputFragment(modelAttributes, options) {
    const outputFragment = ' OUTPUT INSERTED.*';

    if (!modelAttributes || !options.hasTrigger || !this._dialect.supports.tmpTableTrigger) {
      return { outputFragment, tmpTable: '' };
    }

    const { tmpColumns, outputColumns } = this._buildTmpTableColumns(modelAttributes);
    const tmpTable = `declare @tmp table (<%= columns %>); `;
    const replacement = { columns: tmpColumns };
    const compiledTmpTable = _.template(tmpTable, this._templateSettings)(replacement).trim();
    const selectFromTmp = ';select * from @tmp';

    return {
      outputFragment: ' OUTPUT ' + outputColumns + ' into @tmp',
      tmpTable: compiledTmpTable,
      selectFromTmp
    };
  },

  /**
   * Builds temporary table columns for MSSQL trigger output
   * @private
   */
  _buildTmpTableColumns(modelAttributes) {
    let tmpColumns = '';
    let outputColumns = '';

    for (const modelKey in modelAttributes) {
      const attribute = modelAttributes[modelKey];
      if (attribute.type instanceof DataTypes.VIRTUAL) {
        continue;
      }

      if (tmpColumns.length > 0) {
        tmpColumns += ',';
        outputColumns += ',';
      }

      tmpColumns += this.quoteIdentifier(attribute.field) + ' ' + attribute.type.toSql();
      outputColumns += 'INSERTED.' + this.quoteIdentifier(attribute.field);
    }

    return { tmpColumns, outputColumns };
  },

  /**
   * Handles PostgreSQL exception wrapping for INSERT queries
   * @private
   */
  _wrapPostgresException(valueQuery, options) {
    if (!this._dialect.supports.EXCEPTION || !options.exception) {
      return valueQuery;
    }

    if (semver.gte(this.sequelize.options.databaseVersion, '9.2.0')) {
      return this._wrapPostgresExceptionV92(valueQuery, options);
    }

    return this._wrapPostgresExceptionLegacy(valueQuery, options);
  },

  /**
   * Wraps PostgreSQL 9.2+ exception handling
   * @private
   */
  _wrapPostgresExceptionV92(valueQuery, options) {
    const delimiter = '$func_' + uuid.v4().replace(/-/g, '') + '$';
    options.exception = 'WHEN unique_violation THEN GET STACKED DIAGNOSTICS sequelize_caught_exception = PG_EXCEPTION_DETAIL;';

    return 'CREATE OR REPLACE FUNCTION pg_temp.testfunc(OUT response <%= table %>, OUT sequelize_caught_exception text) RETURNS RECORD AS ' + delimiter +
      ' BEGIN ' + valueQuery + ' INTO response; EXCEPTION ' + options.exception + ' END ' + delimiter +
      ' LANGUAGE plpgsql; SELECT (testfunc.response).*, testfunc.sequelize_caught_exception FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc()';
  },

  /**
   * Wraps PostgreSQL legacy exception handling
   * @private
   */
  _wrapPostgresExceptionLegacy(valueQuery, options) {
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
      if (!valueHash.hasOwnProperty(key)) {
        continue;
      }

      const value = valueHash[key];
      fields.push(this.quoteIdentifier(key));

      const result = this._processInsertValue(key, value, modelAttributeMap);
      if (result.skip) {
        fields.splice(-1, 1);
        continue;
      }

      if (result.identityWrapperRequired) {
        identityWrapperRequired = true;
      }

      values.push(result.value);
    }

    return { fields, values, identityWrapperRequired };
  },

  /**
   * Processes a single INSERT value
   * @private
   */
  _processInsertValue(key, value, modelAttributeMap) {
    const attr = modelAttributeMap && modelAttributeMap[key];

    if (!attr || attr.autoIncrement !== true) {
      return {
        value: this.escape(value, attr, { context: 'INSERT' }),
        identityWrapperRequired: false,
        skip: false
      };
    }

    if (!value) {
      if (!this._dialect.supports.autoIncrement.defaultValue) {
        return { skip: true };
      }

      if (this._dialect.supports.DEFAULT) {
        return { value: 'DEFAULT' };
      }

      return { value: this.escape(null) };
    }

    return {
      value: this.escape(value, attr, { context: 'INSERT' }),
      identityWrapperRequired: true,
      skip: false
    };
  },

  /*
    Returns an insert into command. Parameters: table name + hash of attribute-value-pairs.
   @private
  */
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

    const outputData = this._buildOutputFragment(modelAttributes, options);
    let outputFragment = outputData.outputFragment;
    let tmpTable = outputData.tmpTable;
    const selectFromTmp = outputData.selectFromTmp || '';

    if (selectFromTmp) {
      valueQuery += selectFromTmp;
      emptyQuery += selectFromTmp;
    }

    valueQuery = this._wrapPostgresException(valueQuery, options);

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
      output: outputFragment,
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

  /*
    Returns an insert into command for multiple values.
    Parameters: table name + list of hashes of attribute-value-pairs.
   @private
  */
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
    if (!this._dialect.supports.returnValues) {
      return { outputFragment: '', tmpTable: '', selectFromTmp: '' };
    }

    if (this._dialect.supports.returnValues.output) {
      return this._buildUpdateMSSQLOutput(attributes, options);
    }

    if (this._dialect.supports.returnValues && options.returning) {
      return { outputFragment: ' RETURNING *', tmpTable: '', selectFromTmp: '' };
    }

    return { outputFragment: '', tmpTable: '', selectFromTmp: '' };
  },

  /**
   * Builds MSSQL-specific UPDATE output
   * @private
   */
  _buildUpdateMSSQLOutput(attributes, options) {
    const outputFragment = ' OUTPUT INSERTED.*';

    if (!attributes || !options.hasTrigger || !this._dialect.supports.tmpTableTrigger) {
      return { outputFragment, tmpTable: '', selectFromTmp: '' };
    }

    const { tmpColumns, outputColumns } = this._buildTmpTableColumns(attributes);
    const tmpTable = 'declare @tmp table (<%= columns %>); ';
    const replacement = { columns: tmpColumns };
    const compiledTmpTable = _.template(tmpTable, this._templateSettings)(replacement).trim();
    const selectFromTmp = ';select * from @tmp';

    return {
      outputFragment: ' OUTPUT ' + outputColumns + ' into @tmp',
      tmpTable: compiledTmpTable,
      selectFromTmp
    };
  },

  /**
   * Processes UPDATE values, filtering out identity columns
   * @private
   */
  _processUpdateValues(attrValueHash, modelAttributeMap) {
    const values = [];

    for (const key in attrValueHash) {
      if (modelAttributeMap && model