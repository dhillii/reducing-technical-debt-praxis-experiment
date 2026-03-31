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

// Extract table details helper
const extractTableDetails = (tableName, options = {}) => {
  tableName = tableName || {};
  return {
    schema: tableName.schema || options.schema || 'public',
    tableName: _.isPlainObject(tableName) ? tableName.tableName : tableName,
    delimiter: tableName.delimiter || options.delimiter || '.'
  };
};

// Schema handling helper
const addSchema = (param, quoteTable) => {
  if (!param._schema) return param.tableName || param;
  return {
    tableName: param.tableName || param,
    table: param.tableName || param,
    name: param.name || param,
    schema: param._schema,
    delimiter: param._schemaDelimiter || '.',
    toString() {
      return quoteTable(this);
    }
  };
};

// Insert query builders
const buildInsertQueryTemplate = (options) => {
  const templates = {
    value: '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>',
    empty: '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %><%= output %><%= onConflictDoNothing %>'
  };
  return templates;
};

const buildModelAttributeMap = (modelAttributes) => {
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
};

const processInsertValues = (valueHash, modelAttributeMap, escape, dialect) => {
  const fields = [];
  const values = [];
  let identityWrapperRequired = false;

  valueHash = Utils.removeNullValuesFromHash(valueHash, dialect.options.omitNull);

  for (const key in valueHash) {
    if (valueHash.hasOwnProperty(key)) {
      const value = valueHash[key];
      fields.push(key);

      const attr = modelAttributeMap && modelAttributeMap[key];
      if (attr && attr.autoIncrement === true && !value) {
        if (!dialect.supports.autoIncrement.defaultValue) {
          fields.splice(-1, 1);
        } else if (dialect.supports.DEFAULT) {
          values.push('DEFAULT');
        } else {
          values.push(escape(null));
        }
      } else {
        if (attr && attr.autoIncrement === true) {
          identityWrapperRequired = true;
        }
        values.push(escape(value, attr, { context: 'INSERT' }));
      }
    }
  }

  return { fields, values, identityWrapperRequired };
};

const QueryGenerator = {
  _templateSettings: require('lodash').runInContext().templateSettings,
  options: {},

  extractTableDetails(tableName, options) {
    return extractTableDetails(tableName, options);
  },

  addSchema(param) {
    return addSchema(param, this.quoteTable.bind(this));
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

    const modelAttributeMap = buildModelAttributeMap(modelAttributes);
    const templates = buildInsertQueryTemplate(options);
    let query;
    let valueQuery = templates.value;
    let emptyQuery = templates.empty;
    let outputFragment = '';
    let tmpTable = '';

    if (this._dialect.supports['DEFAULT VALUES']) {
      emptyQuery += ' DEFAULT VALUES';
    } else if (this._dialect.supports['VALUES ()']) {
      emptyQuery += ' VALUES ()';
    }

    if (this._dialect.supports.returnValues && options.returning) {
      const returnConfig = this._buildReturnFragment(modelAttributes, options);
      outputFragment = returnConfig.fragment;
      tmpTable = returnConfig.tmpTable;
      if (returnConfig.selectFromTmp) {
        valueQuery += returnConfig.selectFromTmp;
        emptyQuery += returnConfig.selectFromTmp;
      }
    }

    if (this._dialect.supports.EXCEPTION && options.exception) {
      valueQuery = this._wrapExceptionQuery(valueQuery, options);
    }

    if (this._dialect.supports['ON DUPLICATE KEY'] && options.onDuplicate) {
      valueQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
      emptyQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
    }

    const { fields, values, identityWrapperRequired } = processInsertValues(
      valueHash,
      modelAttributeMap,
      this.escape.bind(this),
      this._dialect
    );

    const replacements = {
      ignoreDuplicates: options.ignoreDuplicates ? this._dialect.supports.IGNORE : '',
      onConflictDoNothing: options.ignoreDuplicates ? this._dialect.supports.onConflictDoNothing : '',
      table: this.quoteTable(table),
      attributes: fields.map(f => this.quoteIdentifier(f)).join(','),
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

  _buildReturnFragment(modelAttributes, options) {
    const result = { fragment: '', tmpTable: '', selectFromTmp: '' };

    if (this._dialect.supports.returnValues.returning) {
      result.fragment = ' RETURNING *';
    } else if (this._dialect.supports.returnValues.output) {
      result.fragment = ' OUTPUT INSERTED.*';

      if (modelAttributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
        const tmpConfig = this._buildTmpTableConfig(modelAttributes);
        result.tmpTable = tmpConfig.tmpTable;
        result.fragment = tmpConfig.outputFragment;
        result.selectFromTmp = tmpConfig.selectFromTmp;
      }
    }

    return result;
  },

  _buildTmpTableConfig(modelAttributes) {
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

    const tmpTable = _.template('declare @tmp table (<%= columns %>); ', this._templateSettings)({
      columns: tmpColumns
    }).trim();

    return {
      tmpTable,
      outputFragment: ' OUTPUT ' + outputColumns + ' into @tmp',
      selectFromTmp: ';select * from @tmp'
    };
  },

  _wrapExceptionQuery(valueQuery, options) {
    if (semver.gte(this.sequelize.options.databaseVersion, '9.2.0')) {
      const delimiter = '$func_' + uuid.v4().replace(/-/g, '') + '$';
      options.exception = 'WHEN unique_violation THEN GET STACKED DIAGNOSTICS sequelize_caught_exception = PG_EXCEPTION_DETAIL;';
      return 'CREATE OR REPLACE FUNCTION pg_temp.testfunc(OUT response <%= table %>, OUT sequelize_caught_exception text) RETURNS RECORD AS ' + delimiter +
        ' BEGIN ' + valueQuery + ' INTO response; EXCEPTION ' + options.exception + ' END ' + delimiter +
        ' LANGUAGE plpgsql; SELECT (testfunc.response).*, testfunc.sequelize_caught_exception FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc()';
    } else {
      options.exception = 'WHEN unique_violation THEN NULL;';
      return 'CREATE OR REPLACE FUNCTION pg_temp.testfunc() RETURNS SETOF <%= table %> AS $body$ BEGIN RETURN QUERY ' + valueQuery + '; EXCEPTION ' + options.exception + ' END; $body$ LANGUAGE plpgsql; SELECT * FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc();';
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

  updateQuery(tableName, attrValueHash, where, options, attributes) {
    options = options || {};
    _.defaults(options, this.options);

    attrValueHash = Utils.removeNullValuesFromHash(attrValueHash, options.omitNull, options);

    const values = [];
    const modelAttributeMap = {};
    let query = '<%= tmpTable %>UPDATE <%= table %> SET <%= values %><%= output %> <%= where %>';
    let outputFragment = '';
    let tmpTable = '';
    let selectFromTmp = '';

    if (this._dialect.supports['LIMIT ON UPDATE'] && options.limit) {
      if (this.dialect !== 'mssql') {
        query += ' LIMIT ' + this.escape(options.limit) + ' ';
      }
    }

    if (this._dialect.supports.returnValues) {
      const returnConfig = this._buildUpdateReturnFragment(attributes, options);
      outputFragment = returnConfig.fragment;
      tmpTable = returnConfig.tmpTable;
      selectFromTmp = returnConfig.selectFromTmp;
      if (selectFromTmp) {
        query += selectFromTmp;
      }
    }

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

  _buildUpdateReturnFragment(attributes, options) {
    const result = { fragment: '', tmpTable: '', selectFromTmp: '' };

    if (this._dialect.supports.returnValues.output) {
      result.fragment = ' OUTPUT INSERTED.*';

      if (attributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
        const tmpConfig = this._buildTmpTableConfig(attributes);
        result.tmpTable = tmpConfig.tmpTable;
        result.fragment = tmpConfig.outputFragment;
        result.selectFromTmp = tmpConfig.selectFromTmp;
      }
    } else if (this._dialect.supports.returnValues && options.returning) {
      options.mapToModel = true;
      result.fragment = ' RETURNING *';
    }

    return result;
  },

  arithmeticQuery(operator, tableName, attrValueHash, where, options, attributes) {
    options = options || {};
    _.defaults(options, { returning: true });

    attrValueHash = Utils.removeNullValuesFromHash(attrValueHash, this.options.omitNull);