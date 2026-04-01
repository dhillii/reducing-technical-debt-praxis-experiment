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
   * Builds output fragment for insert query
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
      outputFragment = this._buildMSSQLOutputFragment(modelAttributes, options);
      if (outputFragment.tmpTable) {
        tmpTable = outputFragment.tmpTable;
        outputFragment = outputFragment.fragment;
      }
    }

    return { outputFragment, tmpTable };
  },

  /**
   * Builds MSSQL-specific output fragment with trigger support
   * @private
   */
  _buildMSSQLOutputFragment(modelAttributes, options) {
    let outputFragment = ' OUTPUT INSERTED.*';
    let tmpTable = '';

    if (!modelAttributes || !options.hasTrigger || !this._dialect.supports.tmpTableTrigger) {
      return { fragment: outputFragment, tmpTable };
    }

    let tmpColumns = '';
    let outputColumns = '';
    tmpTable = 'declare @tmp table (<%= columns %>); ';

    for (const modelKey in modelAttributes) {
      const attribute = modelAttributes[modelKey];
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

    return { fragment: outputFragment, tmpTable };
  },

  /**
   * Handles exception wrapping for PostgreSQL insert
   * @private
   */
  _wrapInsertQueryWithException(valueQuery, options) {
    if (!this._dialect.supports.EXCEPTION || !options.exception) {
      return valueQuery;
    }

    if (semver.gte(this.sequelize.options.databaseVersion, '9.2.0')) {
      return this._buildPostgresExceptionWrapper(valueQuery, options);
    }

    options.exception = 'WHEN unique_violation THEN NULL;';
    return 'CREATE OR REPLACE FUNCTION pg_temp.testfunc() RETURNS SETOF <%= table %> AS $body$ BEGIN RETURN QUERY ' + valueQuery + '; EXCEPTION ' + options.exception + ' END; $body$ LANGUAGE plpgsql; SELECT * FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc();';
  },

  /**
   * Builds PostgreSQL exception wrapper for version >= 9.2
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
   * Processes value hash for insert query
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
      const attribute = modelAttributeMap && modelAttributeMap[key];
      const isAutoIncrement = attribute && attribute.autoIncrement === true;

      if (isAutoIncrement && !value) {
        this._handleAutoIncrementInsert(fields, values, key);
      } else {
        if (isAutoIncrement) {
          identityWrapperRequired = true;
        }
        fields.push(this.quoteIdentifier(key));
        values.push(this.escape(value, attribute || undefined, { context: 'INSERT' }));
      }
    }

    return { fields, values, identityWrapperRequired };
  },

  /**
   * Handles auto-increment field insertion
   * @private
   */
  _handleAutoIncrementInsert(fields, values, key) {
    if (!this._dialect.supports.autoIncrement.defaultValue) {
      return;
    }

    if (this._dialect.supports.DEFAULT) {
      values.push('DEFAULT');
    } else {
      values.push(this.escape(null));
    }

    fields.push(this.quoteIdentifier(key));
  },

  /**
   * Applies duplicate key handling to insert query
   * @private
   */
  _applyDuplicateKeyHandling(query, options) {
    if (!this._dialect.supports['ON DUPLICATE KEY'] || !options.onDuplicate) {
      return query;
    }

    return query + ' ON DUPLICATE KEY ' + options.onDuplicate;
  },

  /**
   * Wraps insert query with identity insert if needed
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
    if (outputFragment) {
      valueQuery += outputFragment;
      emptyQuery += outputFragment;
    }

    valueQuery = this._wrapInsertQueryWithException(valueQuery, options);
    valueQuery = this._applyDuplicateKeyHandling(valueQuery, options);
    emptyQuery = this._applyDuplicateKeyHandling(emptyQuery, options);

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
   * Builds update output fragment
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
        const result = this._buildMSSQLUpdateOutputFragment(attributes);
        outputFragment = result.fragment;
        tmpTable = result.tmpTable;
        selectFromTmp = result.selectFromTmp;
      }
    } else if (this._dialect.supports.returnValues.returning && options.returning) {
      options.mapToModel = true;
      outputFragment = ' RETURNING *';
    }

    return { outputFragment, tmpTable, selectFromTmp };
  },

  /**
   * Builds MSSQL update output fragment
   * @private
   */
  _buildMSSQLUpdateOutputFragment(attributes) {
    let tmpColumns = '';
    let outputColumns = '';
    let tmpTable = 'declare @tmp table (<%= columns %>); ';

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
    const fragment = ' OUTPUT ' + outputColumns + ' into @tmp';
    const selectFromTmp = ';select * from @tmp';

    return { fragment, tmpTable, selectFromTmp };
  },

  /**
   * Processes update values
   * @private
   */
  _processUpdateValues(attrValueHash, modelAttributeMap) {
    const values = [];

    for (const key in attrValueHash) {
      const attribute = modelAttributeMap && modelAttributeMap[key];
      const isAutoIncrement = attribute && attribute.autoIncrement === true;

      if (isAutoIncrement && !this._dialect.supports.autoIncrement.update) {
        continue;
      }

      const value = attr