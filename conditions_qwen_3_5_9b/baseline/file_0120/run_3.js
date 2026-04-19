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

  insertQuery(table, valueHash, modelAttributes, options) {
    options = options || {};
    _.defaults(options, this.options);

    const modelAttributeMap = this.buildModelAttributeMap(modelAttributes);
    const fields = [];
    const values = [];
    let query;
    let valueQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>';
    let emptyQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %><%= output %><%= onConflictDoNothing %>';
    let outputFragment;
    let identityWrapperRequired = false;
    let tmpTable = '';

    this.buildEmptyQuery(emptyQuery);
    this.buildValueQuery(valueQuery, modelAttributeMap);
    this.buildOutputFragment(valueQuery, emptyQuery, modelAttributeMap, options);
    this.buildExceptionHandling(valueQuery, emptyQuery, table, options);
    this.buildOnDuplicateHandling(valueQuery, emptyQuery, options);

    valueHash = Utils.removeNullValuesFromHash(valueHash, this.options.omitNull);
    this.buildFieldsAndValues(valueHash, modelAttributeMap, fields, values, identityWrapperRequired);

    const replacements = {
      ignoreDuplicates: options.ignoreDuplicates ? this._dialect.supports.IGNORE : '',
      onConflictDoNothing: options.ignoreDuplicates ? this._dialect.supports.onConflictDoNothing : '',
      table: this.quoteTable(table),
      attributes: fields.join(','),
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

  buildModelAttributeMap(modelAttributes) {
    const modelAttributeMap = {};

    if (modelAttributes) {
      _.each(modelAttributes, (attribute, key) => {
        modelAttributeMap[key] = attribute;
        if (attribute.field) {
          modelAttributeMap[attribute.field] = attribute;
        }
      });
    }

    return modelAttributeMap;
  },

  buildEmptyQuery(emptyQuery) {
    if (this._dialect.supports['DEFAULT VALUES']) {
      emptyQuery += ' DEFAULT VALUES';
    } else if (this._dialect.supports['VALUES ()']) {
      emptyQuery += ' VALUES ()';
    }
  },

  buildValueQuery(valueQuery, modelAttributeMap) {
    if (this._dialect.supports.returnValues && options.returning) {
      if (this._dialect.supports.returnValues.returning) {
        valueQuery += ' RETURNING *';
      } else if (this._dialect.supports.returnValues.output) {
        this.buildMSSQLOutputFragment(valueQuery, modelAttributeMap);
      }
    }
  },

  buildOutputFragment(valueQuery, emptyQuery, modelAttributeMap, options) {
    if (this._dialect.supports.returnValues && options.returning) {
      if (this._dialect.supports.returnValues.returning) {
        valueQuery += ' RETURNING *';
        emptyQuery += ' RETURNING *';
      } else if (this._dialect.supports.returnValues.output) {
        outputFragment = ' OUTPUT INSERTED.*';

        if (modelAttributeMap && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
          const tmpColumns = this.buildTmpColumns(modelAttributeMap);
          const outputColumns = this.buildOutputColumns(modelAttributeMap);
          tmpTable = 'declare @tmp table (<%= columns %>); ';

          const replacement = {
            columns: tmpColumns
          };

          tmpTable = _.template(tmpTable, this._templateSettings)(replacement).trim();
          outputFragment = ' OUTPUT ' + outputColumns + ' into @tmp';
          const selectFromTmp = ';select * from @tmp';

          valueQuery += selectFromTmp;
          emptyQuery += selectFromTmp;
        }
      }
    }
  },

  buildExceptionHandling(valueQuery, emptyQuery, table, options) {
    if (this._dialect.supports.EXCEPTION && options.exception) {
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
    }
  },

  buildOnDuplicateHandling(valueQuery, emptyQuery, options) {
    if (this._dialect.supports['ON DUPLICATE KEY'] && options.onDuplicate) {
      valueQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
      emptyQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
    }
  },

  buildFieldsAndValues(valueHash, modelAttributeMap, fields, values, identityWrapperRequired) {
    for (const key in valueHash) {
      if (valueHash.hasOwnProperty(key)) {
        const value = valueHash[key];
        fields.push(this.quoteIdentifier(key));

        if (modelAttributeMap && modelAttributeMap[key] && modelAttributeMap[key].autoIncrement === true && !value) {
          if (!this._dialect.supports.autoIncrement.defaultValue) {
            fields.splice(-1, 1);
          } else if (this._dialect.supports.DEFAULT) {
            values.push('DEFAULT');
          } else {
            values.push(this.escape(null));
          }
        } else {
          if (modelAttributeMap && modelAttributeMap[key] && modelAttributeMap[key].autoIncrement === true) {
            identityWrapperRequired = true;
          }

          values.push(this.escape(value, modelAttributeMap && modelAttributeMap[key] || undefined, { context: 'INSERT' }));
        }
      }
    }
  },

  buildMSSQLOutputFragment(valueQuery, modelAttributeMap) {
    outputFragment = ' OUTPUT INSERTED.*';

    if (modelAttributeMap && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
      const tmpColumns = this.buildTmpColumns(modelAttributeMap);
      const outputColumns = this.buildOutputColumns(modelAttributeMap);
      tmpTable = 'declare @tmp table (<%= columns %>); ';

      const replacement = {
        columns: tmpColumns
      };

      tmpTable = _.template(tmpTable, this._templateSettings)(replacement).trim();
      outputFragment = ' OUTPUT ' + outputColumns + ' into @tmp';
      const selectFromTmp = ';select * from @tmp';

      valueQuery += selectFromTmp;
    }
  },

  buildTmpColumns(modelAttributeMap) {
    let tmpColumns = '';

    for (const modelKey in modelAttributeMap) {
      const attribute = modelAttributeMap[modelKey];
      if (!(attribute.type instanceof DataTypes.VIRTUAL)) {
        if (tmpColumns.length > 0) {
          tmpColumns += ',';
        }

        tmpColumns += this.quoteIdentifier(attribute.field) + ' ' + attribute.type.toSql();
      }
    }

    return tmpColumns;
  },

  buildOutputColumns(modelAttributeMap) {
    let outputColumns = '';

    for (const modelKey in modelAttributeMap) {
      const attribute = modelAttributeMap[modelKey];
      if (!(attribute.type instanceof DataTypes.VIRTUAL)) {
        if (outputColumns.length > 0) {
          outputColumns += ',';
        }

        outputColumns += 'INSERTED.' + this.quoteIdentifier(attribute.field);
      }
    }

    return outputColumns;
  }
};

module.exports = QueryGenerator;
```