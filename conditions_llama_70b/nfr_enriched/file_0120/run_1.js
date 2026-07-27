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
   * Returns an insert into command. Parameters: table name + hash of attribute-value-pairs.
   * @private
   */
  insertQuery(table, valueHash, modelAttributes, options) {
    options = options || {};
    _.defaults(options, this.options);

    const query = this._buildInsertQuery(table, valueHash, modelAttributes, options);
    return query;
  },

  _buildInsertQuery(table, valueHash, modelAttributes, options) {
    const query = this._getInsertQueryTemplate(options);
    const replacements = this._getInsertQueryReplacements(table, valueHash, modelAttributes, options);
    return _.template(query, this._templateSettings)(replacements);
  },

  _getInsertQueryTemplate(options) {
    let query = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>';
    if (options.exception) {
      query = this._addExceptionToQuery(query, options);
    }
    if (options.onDuplicate) {
      query += ' ON DUPLICATE KEY ' + options.onDuplicate;
    }
    return query;
  },

  _addExceptionToQuery(query, options) {
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

  _getInsertQueryReplacements(table, valueHash, modelAttributes, options) {
    const fields = [];
    const values = [];
    let outputFragment;
    let tmpTable = '';
    let identityWrapperRequired = false;

    valueHash = Utils.removeNullValuesFromHash(valueHash, this.options.omitNull);
    for (const key in valueHash) {
      if (valueHash.hasOwnProperty(key)) {
        const value = valueHash[key];
        fields.push(this.quoteIdentifier(key));

        if (modelAttributes && modelAttributes[key] && modelAttributes[key].autoIncrement === true && !value) {
          if (!this._dialect.supports.autoIncrement.defaultValue) {
            fields.splice(-1, 1);
          } else if (this._dialect.supports.DEFAULT) {
            values.push('DEFAULT');
          } else {
            values.push(this.escape(null));
          }
        } else {
          if (modelAttributes && modelAttributes[key] && modelAttributes[key].autoIncrement === true) {
            identityWrapperRequired = true;
          }

          values.push(this.escape(value, modelAttributes && modelAttributes[key] || undefined, { context: 'INSERT' }));
        }
      }
    }

    if (this._dialect.supports.returnValues && options.returning) {
      if (this._dialect.supports.returnValues.returning) {
        outputFragment = ' RETURNING *';
      } else if (this._dialect.supports.returnValues.output) {
        outputFragment = ' OUTPUT INSERTED.*';
      }
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

    if (identityWrapperRequired && this._dialect.supports.autoIncrement.identityInsert) {
      replacements.tmpTable = 'SET IDENTITY_INSERT ' + this.quoteTable(table) + ' ON;';
      replacements.onConflictDoNothing = 'SET IDENTITY_INSERT ' + this.quoteTable(table) + ' OFF;';
    }

    return replacements;
  },

  /**
   * Returns an insert into command for multiple values.
   * Parameters: table name + list of hashes of attribute-value-pairs.
   * @private
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
        if (
          fieldMappedAttributes[key]
          && fieldMappedAttributes[key].autoIncrement === true
        ) {
          serials[key] = true;
        }
      });
    }

    for (const fieldValueHash of fieldValueHashes) {
      const values = allAttributes.map(key => {
        if (
          this._dialect.supports.bulkDefault
          && serials[key] === true
        ) {
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
   * Returns an update query.
   * Parameters:
   *   - tableName -> Name of the table
   *   - values -> A hash with attribute-value-pairs
   *   - where -> A hash with conditions (e.g. {name: 'foo'})
   *              OR an ID as integer
   *              OR a string with conditions (e.g. 'name="foo"').
   *              If you use a string, you have to escape it on your own.
   * @private
   */
  updateQuery(tableName, attrValueHash, where, options, attributes) {
    options = options || {};
    _.defaults(options, this.options);

    attrValueHash = Utils.removeNullValuesFromHash(attrValueHash, options.omitNull, options);

    const values = [];
    const modelAttributeMap = {};
    let query = '<%= tmpTable %>UPDATE <%= table %> SET <%= values %><%= output %> <%= where %>';
    let outputFragment;
    let tmpTable = '';        // tmpTable declaration for trigger
    let selectFromTmp = '';   // Select statement for trigger

    if (this._dialect.supports['LIMIT ON UPDATE'] && options.limit) {
      if (this.dialect !== 'mssql') {
        query += ' LIMIT ' + this.escape(options.limit) + ' ';
      }
    }

    if (this._dialect.supports.returnValues) {
      if (this._dialect.supports.returnValues.output) {
        // we always need this for mssql
        outputFragment = ' OUTPUT INSERTED.*';

        //To capture output rows when there is a trigger on MSSQL DB
        if (attributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
          tmpTable = 'declare @tmp table (<%= columns %>); ';
          let tmpColumns = '';
          let outputColumns = '';

          for (const modelKey in attributes) {
            const attribute = attributes[modelKey];
            if (!(attribute.type instanceof DataTypes.VIRTUAL)) {
              if (tmpColumns.length > 0) {
                tmpColumns += ',';
                outputColumns += ',';
              }

              tmpColumns += this.quoteIdentifier(attribute.field) + ' ' + attribute.type.toSql();
              outputColumns += 'INSERTED.' + this.quoteIdentifier(attribute.field);
            }
          }

          const replacement ={
            columns: tmpColumns
          };

          tmpTable = _.template(tmpTable, this._templateSettings)(replacement).trim();
          outputFragment = ' OUTPUT ' + outputColumns + ' into @tmp';
          selectFromTmp = ';select * from @tmp';

          query += selectFromTmp;
        }
      } else if (this._dialect.supports.returnValues && options.returning) {
        // ensure that the return output is properly mapped to model fields.
        options.mapToModel = true;
        query += ' RETURNING *';
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
        // not allowed to update identity column
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

  /**
   * Returns an update query.
   * Parameters:
   *   - operator -> String with the arithmetic operator (e.g. '+' or '-')
   *   - tableName -> Name of the table
   *   - values -> A hash with attribute-value-pairs
   *   - where -> A hash with conditions (e.g. {name: 'foo'})
   *              OR an ID as integer
   *              OR a string with conditions (e.g. 'name="foo"').
   *              If you use a string, you have to escape it on your own.
   * @private
   */
  arithmeticQuery(operator, tableName, attrValueHash, where, options, attributes) {
    options = options || {};
    _.defaults(options, { returning: true });

    attrValueHash = Utils.removeNullValuesFromHash(attrValueHash, this.options.omitNull);

    const values = [];
    let query = 'UPDATE <%= table %> SET <%= values %><%= output %> <%= where %>';
    let outputFragment;

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

  // ... rest of the code remains the same ...