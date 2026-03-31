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

class QueryGenerator {
  constructor() {
    this._templateSettings = require('lodash').runInContext().templateSettings;
    this.options = {};
    this.OperatorMap = this._buildOperatorMap();
    this.OperatorsAliasMap = {};
  }

  _buildOperatorMap() {
    return {
      [Op.eq]: '=', [Op.ne]: '!=', [Op.gte]: '>=', [Op.gt]: '>',
      [Op.lte]: '<=', [Op.lt]: '<', [Op.not]: 'IS NOT', [Op.is]: 'IS',
      [Op.in]: 'IN', [Op.notIn]: 'NOT IN', [Op.like]: 'LIKE',
      [Op.notLike]: 'NOT LIKE', [Op.iLike]: 'ILIKE', [Op.notILike]: 'NOT ILIKE',
      [Op.regexp]: '~', [Op.notRegexp]: '!~', [Op.iRegexp]: '~*',
      [Op.notIRegexp]: '!~*', [Op.between]: 'BETWEEN', [Op.notBetween]: 'NOT BETWEEN',
      [Op.overlap]: '&&', [Op.contains]: '@>', [Op.contained]: '<@',
      [Op.adjacent]: '-|-', [Op.strictLeft]: '<<', [Op.strictRight]: '>>',
      [Op.noExtendRight]: '&<', [Op.noExtendLeft]: '&>', [Op.any]: 'ANY',
      [Op.all]: 'ALL', [Op.and]: ' AND ', [Op.or]: ' OR ', [Op.col]: 'COL',
      [Op.placeholder]: '$$PLACEHOLDER$$', [Op.raw]: 'DEPRECATED'
    };
  }

  extractTableDetails(tableName, options) {
    options = options || {};
    tableName = tableName || {};
    return {
      schema: tableName.schema || options.schema || 'public',
      tableName: _.isPlainObject(tableName) ? tableName.tableName : tableName,
      delimiter: tableName.delimiter || options.delimiter || '.'
    };
  }

  addSchema(param) {
    if (!param._schema) return param.tableName || param;

    return {
      tableName: param.tableName || param,
      table: param.tableName || param,
      name: param.name || param,
      schema: param._schema,
      delimiter: param._schemaDelimiter || '.',
      toString: () => this.quoteTable(this)
    };
  }

  dropSchema(tableName, options) {
    return this.dropTableQuery(tableName, options);
  }

  describeTableQuery(tableName, schema, schemaDelimiter) {
    const table = this.quoteTable(
      this.addSchema({ tableName, _schema: schema, _schemaDelimiter: schemaDelimiter })
    );
    return `DESCRIBE ${table};`;
  }

  dropTableQuery(tableName) {
    return `DROP TABLE IF EXISTS ${this.quoteTable(tableName)};`;
  }

  renameTableQuery(before, after) {
    return `ALTER TABLE ${this.quoteTable(before)} RENAME TO ${this.quoteTable(after)};`;
  }

  insertQuery(table, valueHash, modelAttributes, options) {
    options = options || {};
    _.defaults(options, this.options);

    const { modelAttributeMap, fields, values } = this._buildInsertValues(valueHash, modelAttributes);
    const { outputFragment, tmpTable } = this._buildInsertOutput(modelAttributes, options);
    const { valueQuery, emptyQuery } = this._buildInsertTemplates(outputFragment, tmpTable);

    let query = this._applyInsertModifiers(valueQuery, emptyQuery, options);
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
    if (this._shouldWrapIdentityInsert(modelAttributeMap, valueHash)) {
      query = this._wrapIdentityInsert(table, query);
    }

    return _.template(query, this._templateSettings)(replacements);
  }

  _buildInsertValues(valueHash, modelAttributes) {
    const modelAttributeMap = {};
    const fields = [];
    const values = [];

    if (modelAttributes) {
      _.each(modelAttributes, (attribute, key) => {
        modelAttributeMap[key] = attribute;
        if (attribute.field) modelAttributeMap[attribute.field] = attribute;
      });
    }

    valueHash = Utils.removeNullValuesFromHash(valueHash, this.options.omitNull);
    for (const key in valueHash) {
      if (valueHash.hasOwnProperty(key)) {
        const value = valueHash[key];
        fields.push(this.quoteIdentifier(key));
        values.push(this._buildInsertValue(key, value, modelAttributeMap));
      }
    }

    return { modelAttributeMap, fields, values };
  }

  _buildInsertValue(key, value, modelAttributeMap) {
    const attr = modelAttributeMap && modelAttributeMap[key];
    if (attr && attr.autoIncrement === true && !value) {
      if (!this._dialect.supports.autoIncrement.defaultValue) return null;
      return this._dialect.supports.DEFAULT ? 'DEFAULT' : this.escape(null);
    }
    return this.escape(value, attr, { context: 'INSERT' });
  }

  _buildInsertOutput(modelAttributes, options) {
    let outputFragment = '';
    let tmpTable = '';

    if (!this._dialect.supports.returnValues || !options.returning) return { outputFragment, tmpTable };

    if (this._dialect.supports.returnValues.returning) {
      outputFragment = ' RETURNING *';
    } else if (this._dialect.supports.returnValues.output) {
      ({ outputFragment, tmpTable } = this._buildMSSQLOutput(modelAttributes, options));
    }

    return { outputFragment, tmpTable };
  }

  _buildMSSQLOutput(modelAttributes, options) {
    let outputFragment = ' OUTPUT INSERTED.*';
    let tmpTable = '';

    if (modelAttributes && options.hasTrigger && this._dialect.supports.tmpTableTrigger) {
      const { tmpColumns, outputColumns } = this._buildTmpTableColumns(modelAttributes);
      tmpTable = `declare @tmp table (<%= columns %>); `;
      const replacement = { columns: tmpColumns };
      tmpTable = _.template(tmpTable, this._templateSettings)(replacement).trim();
      outputFragment = ` OUTPUT ${outputColumns} into @tmp`;
      tmpTable += ';select * from @tmp';
    }

    return { outputFragment, tmpTable };
  }

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
  }

  _buildInsertTemplates(outputFragment, tmpTable) {
    let valueQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>';
    let emptyQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %><%= output %><%= onConflictDoNothing %>';

    if (this._dialect.supports['DEFAULT VALUES']) {
      emptyQuery += ' DEFAULT VALUES';
    } else if (this._dialect.supports['VALUES ()']) {
      emptyQuery += ' VALUES ()';
    }

    return { valueQuery, emptyQuery };
  }

  _applyInsertModifiers(valueQuery, emptyQuery, options) {
    let query = valueQuery;

    if (this._dialect.supports.EXCEPTION && options.exception) {
      query = this._buildExceptionQuery(valueQuery, options);
    }

    if (this._dialect.supports['ON DUPLICATE KEY'] && options.onDuplicate) {
      valueQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
      emptyQuery += ' ON DUPLICATE KEY ' + options.onDuplicate;
    }

    return query;
  }

  _buildExceptionQuery(valueQuery, options) {
    if (semver.gte(this.sequelize.options.databaseVersion, '9.2.0')) {
      const delimiter = '$func_' + uuid.v4().replace(/-/g, '') + '$';
      options.exception = 'WHEN unique_violation THEN GET STACKED DIAGNOSTICS sequelize_caught_exception = PG_EXCEPTION_DETAIL;';
      return `CREATE OR REPLACE FUNCTION pg_temp.testfunc(OUT response <%= table %>, OUT sequelize_caught_exception text) RETURNS RECORD AS ${delimiter} BEGIN ${valueQuery} INTO response; EXCEPTION ${options.exception} END ${delimiter} LANGUAGE plpgsql; SELECT (testfunc.response).*, testfunc.sequelize_caught_exception FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc()`;
    }
    options.exception = 'WHEN unique_violation THEN NULL;';
    return `CREATE OR REPLACE FUNCTION pg_temp.testfunc() RETURNS SETOF <%= table %> AS $body$ BEGIN RETURN QUERY ${valueQuery}; EXCEPTION ${options.exception} END; $body$ LANGUAGE plpgsql; SELECT * FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc();`;
  }

  _shouldWrapIdentityInsert(modelAttributeMap, valueHash) {
    if (!this._dialect.supports.autoIncrement.identityInsert) return false;
    for (const key in valueHash) {
      if (modelAttributeMap && modelAttributeMap[key] && modelAttributeMap[key].autoIncrement === true) {
        return true;
      }
    }
    return false;
  }

  _wrapIdentityInsert(table, query) {
    return [
      'SET IDENTITY_INSERT', this.quoteTable(table), 'ON;',
      query,
      'SET IDENTITY_INSERT', this.quoteTable(table), 'OFF;'
    ].join(' ');
  }

  bulkInsertQuery(tableName, fieldValueHashes, options, fieldMappedAttributes) {
    options = options || {};
    fieldMappedAttributes = fieldMappedAttributes || {};

    const { allAttributes, serials, tuples } = this._buildBulkInsertTuples(fieldValueHashes, fieldMappedAttributes);
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
  }

  _buildBulkInsertTuples(fieldValueHashes, fieldMappedAttributes) {
    const allAttributes = [];
    const serials = {};
    const tuples = [];

    for (const fieldValueHash of fieldValueHashes) {
      _.forOwn(fieldValueHash, (value, key) => {
        if (allAttributes.indexOf(key) === -1) allAttributes.push(key);
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
  }

  _buildOnDuplicateKeyUpdate(options) {
    if (!this._dialect.supports.updateOnDuplicate || !options.updateOnDuplicate) return '';
    return ' ON DUPLICATE KEY UPDATE ' + options.updateOnDuplicate.map(attr => {
      const key = this.quoteIdentifier(attr);
      return `${key}=VALUES(${key})`;
    }).join(',');
  }

  updateQuery(tableName, attrValueHash, where, options, attributes) {
    options = options || {};
    _.defaults(options, this.options);

    attrValueHash = Utils.removeNullValuesFromHash(attrValueHash, options.omitNull, options);

    const { values, modelAttributeMap } = this._buildUpdateValues(attrValueHash, attributes);
    const { outputFragment, tmpTable } = this._buildUpdateOutput(attributes, options);

    let query = '<%= tmpTable %>UPDATE <%= table %> SET <%= values %><%= output %> <%= where %>';

    if (this._dialect.supports['LIMIT ON UPDATE'] && options.limit && this.dialect !== 'mssql') {
      query += ' LIMIT ' + this.escape(options.limit) + ' ';
    }

    if (outputFragment && tmpTable) query += ';select * from @tmp';
    else if (this._dialect.supports.returnValues && options.returning) {
      options.mapToModel = true;
      query += ' RETURNING *';
    }

    const replacements = {
      table: this.quoteTable(tableName),
      values: values.join(','),
      output: outputFragment,
      where: this.whereQuery(where, options),
      tmpTable
    };

    if (values.length === 0) return '';
    return _.template(