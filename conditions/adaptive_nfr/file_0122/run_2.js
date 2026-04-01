```javascript
'use strict';

const Utils = require('../../utils');
const util = require('util');
const DataTypes = require('../../data-types');
const AbstractQueryGenerator = require('../abstract/query-generator');
const semver = require('semver');
const _ = require('lodash');

/**
 * Parameter object for createTableQuery
 * @typedef {Object} CreateTableOptions
 * @property {String} [comment] - Table comment
 * @property {Array} [uniqueKeys] - Unique key constraints
 */

/**
 * Parameter object for column operations
 * @typedef {Object} ColumnOperationParams
 * @property {String} tableName - Table name
 * @property {String} attributeName - Attribute/column name
 * @property {String} definition - Column definition
 */

/**
 * Parameter object for trigger operations
 * @typedef {Object} TriggerOperationParams
 * @property {String} tableName - Table name
 * @property {String} triggerName - Trigger name
 * @property {String} eventType - Event type
 * @property {Object} fireOnSpec - Fire on specification
 * @property {String} functionName - Function name
 * @property {Array} functionParams - Function parameters
 * @property {Array} optionsArray - Options array
 */

/**
 * Parameter object for function operations
 * @typedef {Object} FunctionOperationParams
 * @property {String} functionName - Function name
 * @property {Array} params - Parameters
 * @property {String} returnType - Return type
 * @property {String} language - Language
 * @property {String} body - Function body
 * @property {Array} [options] - Options
 */

/**
 * Parameter object for foreign key queries
 * @typedef {Object} ForeignKeyQueryParams
 * @property {String} tableName - Table name
 * @property {String} [catalogName] - Catalog name
 * @property {String} [schemaName] - Schema name
 */

const QueryGenerator = {
  __proto__: AbstractQueryGenerator,
  options: {},
  dialect: 'postgres',

  setSearchPath(searchPath) {
    return `SET search_path to ${searchPath};`;
  },

  createSchema(schema) {
    const databaseVersion = _.get(this, 'sequelize.options.databaseVersion', 0);

    if (databaseVersion && semver.gte(databaseVersion, '9.2.0')) {
      return `CREATE SCHEMA IF NOT EXISTS ${schema};`;
    }

    return `CREATE SCHEMA ${schema};`;
  },

  dropSchema(schema) {
    return `DROP SCHEMA IF EXISTS ${schema} CASCADE;`;
  },

  showSchemasQuery() {
    return "SELECT schema_name FROM information_schema.schemata WHERE schema_name <> 'information_schema' AND schema_name != 'public' AND schema_name !~ E'^pg_';";
  },

  versionQuery() {
    return 'SHOW SERVER_VERSION';
  },

  /**
   * Extracts and processes table attributes for CREATE TABLE
   * @private
   */
  _processTableAttributes(attributes) {
    const attrStr = [];
    let comments = '';

    for (const attr in attributes) {
      const i = attributes[attr].indexOf('COMMENT');
      if (i !== -1) {
        comments += '; ' + attributes[attr].substring(i);
        attributes[attr] = attributes[attr].substring(0, i);
      }

      const dataType = this.dataTypeMapping(attr, attr, attributes[attr]);
      attrStr.push(this.quoteIdentifier(attr) + ' ' + dataType);
    }

    return { attrStr, comments };
  },

  /**
   * Builds primary key constraint
   * @private
   */
  _buildPrimaryKeyConstraint(attributes) {
    const pks = _.reduce(attributes, (acc, attribute, key) => {
      if (_.includes(attribute, 'PRIMARY KEY')) {
        acc.push(this.quoteIdentifier(key));
      }
      return acc;
    }, []).join(',');

    return pks.length > 0 ? `, PRIMARY KEY (${pks})` : '';
  },

  /**
   * Builds unique key constraints
   * @private
   */
  _buildUniqueKeyConstraints(uniqueKeys) {
    let constraints = '';
    if (uniqueKeys) {
      _.each(uniqueKeys, columns => {
        if (columns.customIndex) {
          constraints += `, UNIQUE (${columns.fields.map(field => this.quoteIdentifier(field)).join(', ')})`;
        }
      });
    }
    return constraints;
  },

  createTableQuery(tableName, attributes, options) {
    options = _.extend({}, options || {});
    const databaseVersion = _.get(this, 'sequelize.options.databaseVersion', 0);

    const { attrStr, comments } = this._processTableAttributes(attributes);
    const pkConstraint = this._buildPrimaryKeyConstraint(attributes);
    const ukConstraints = this._buildUniqueKeyConstraints(options.uniqueKeys);

    let commentsSql = '';
    if (options.comment && _.isString(options.comment)) {
      commentsSql = '; COMMENT ON TABLE <%= table %> IS ' + this.escape(options.comment);
    }
    commentsSql += comments;

    const values = {
      table: this.quoteTable(tableName),
      attributes: attrStr.join(', ') + ukConstraints + pkConstraint,
      comments: _.template(commentsSql, this._templateSettings)({ table: this.quoteTable(tableName) })
    };

    return `CREATE TABLE ${databaseVersion === 0 || semver.gte(databaseVersion, '9.1.0') ? 'IF NOT EXISTS ' : ''}${values.table} (${values.attributes})${values.comments};`;
  },

  dropTableQuery(tableName, options) {
    options = options || {};
    return `DROP TABLE IF EXISTS ${this.quoteTable(tableName)}${options.cascade ? ' CASCADE' : ''};`;
  },

  showTablesQuery() {
    return "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type LIKE '%TABLE' AND table_name != 'spatial_ref_sys';";
  },

  describeTableQuery(tableName, schema) {
    if (!schema) {
      schema = 'public';
    }
    return 'SELECT pk.constraint_type as "Constraint", c.column_name as "Field", ' +
              'c.column_default as "Default", c.is_nullable as "Null", ' +
              '(CASE WHEN c.udt_name = \'hstore\' THEN c.udt_name ELSE c.data_type END) || (CASE WHEN c.character_maximum_length IS NOT NULL THEN \'(\' || c.character_maximum_length || \')\' ELSE \'\' END) as "Type", ' +
              '(SELECT array_agg(e.enumlabel) ' +
              'FROM pg_catalog.pg_type t JOIN pg_catalog.pg_enum e ON t.oid=e.enumtypid ' +
              'WHERE t.typname=c.udt_name) AS "special" ' +
            'FROM information_schema.columns c ' +
            'LEFT JOIN (SELECT tc.table_schema, tc.table_name, ' +
              'cu.column_name, tc.constraint_type ' +
              'FROM information_schema.TABLE_CONSTRAINTS tc ' +
              'JOIN information_schema.KEY_COLUMN_USAGE  cu ' +
              'ON tc.table_schema=cu.table_schema and tc.table_name=cu.table_name ' +
                'and tc.constraint_name=cu.constraint_name ' +
                'and tc.constraint_type=\'PRIMARY KEY\') pk ' +
            'ON pk.table_schema=c.table_schema ' +
            'AND pk.table_name=c.table_name ' +
            'AND pk.column_name=c.column_name ' +
      `WHERE c.table_name = ${this.escape(tableName)} AND c.table_schema = ${this.escape(schema)} `;
  },

  /**
   * Check whether the statement is json function or simple path
   * @private
   */
  _checkValidJsonStatement(stmt) {
    if (!_.isString(stmt)) {
      return false;
    }

    const jsonFunctionRegex = /^\s*((?:[a-z]+_){0,2}jsonb?(?:_[a-z]+){0,2})\([^)]*\)/i;
    const jsonOperatorRegex = /^\s*(->>?|#>>?|@>|<@|\?[|&]?|\|{2}|#-)/i;
    const tokenCaptureRegex = /^\s*((?:([`"'])(?:(?!\2).|\2{2})*\2)|[\w\d\s]+|[().,;+-])/i;

    return this._validateJsonStatement(stmt, jsonFunctionRegex, jsonOperatorRegex, tokenCaptureRegex);
  },

  /**
   * Validates JSON statement syntax
   * @private
   */
  _validateJsonStatement(stmt, jsonFunctionRegex, jsonOperatorRegex, tokenCaptureRegex) {
    let currentIndex = 0;
    let openingBrackets = 0;
    let closingBrackets = 0;
    let hasJsonFunction = false;
    let hasInvalidToken = false;

    while (currentIndex < stmt.length) {
      const string = stmt.substr(currentIndex);
      
      if (this._matchJsonFunction(string, jsonFunctionRegex)) {
        const matches = jsonFunctionRegex.exec(string);
        currentIndex += matches[0].indexOf('(');
        hasJsonFunction = true;
        continue;
      }

      if (this._matchJsonOperator(string, jsonOperatorRegex)) {
        const matches = jsonOperatorRegex.exec(string);
        currentIndex += matches[0].length;
        hasJsonFunction = true;
        continue;
      }

      const tokenMatches = tokenCaptureRegex.exec(string);
      if (tokenMatches) {
        const result = this._processJsonToken(tokenMatches[1]);
        openingBrackets += result.openingBrackets;
        closingBrackets += result.closingBrackets;
        if (result.hasInvalidToken) {
          hasInvalidToken = true;
          break;
        }
        currentIndex += tokenMatches[0].length;
        continue;
      }

      break;
    }

    hasInvalidToken |= openingBrackets !== closingBrackets;
    if (hasJsonFunction && hasInvalidToken) {
      throw new Error('Invalid json statement: ' + stmt);
    }

    return hasJsonFunction;
  },

  /**
   * Matches JSON function pattern
   * @private
   */
  _matchJsonFunction(string, regex) {
    return regex.test(string);
  },

  /**
   * Matches JSON operator pattern
   * @private
   */
  _matchJsonOperator(string, regex) {
    return regex.test(string);
  },

  /**
   * Processes individual JSON token
   * @private
   */
  _processJsonToken(token) {
    let openingBrackets = 0;
    let closingBrackets = 0;
    let hasInvalidToken = false;

    if (token === '(') {
      openingBrackets = 1;
    } else if (token === ')') {
      closingBrackets = 1;
    } else if (token === ';') {
      hasInvalidToken = true;
    }

    return { openingBrackets, closingBrackets, hasInvalidToken };
  },

  /**
   * Generates an SQL query that extract JSON property of given path.
   */
  jsonPathExtractionQuery(column, path) {
    const paths = _.toPath(path);
    const pathStr = this.escape(`{${paths.join(',')}}`);
    const quotedColumn = this.isIdentifierQuoted(column) ? column : this.quoteIdentifier(column);
    return `(${quotedColumn}#>>${pathStr})`;
  },

  /**
   * Handles JSON conditions
   * @private
   */
  _handleJsonConditions(conditions) {
    return _.map(this.parseConditionObject(conditions), condition =>
      `${this.jsonPathExtractionQuery(_.first(condition.path), _.tail(condition.path))} = '${condition.value}'`
    ).join(' AND ');
  },

  /**
   * Handles JSON path extraction
   * @private
   */
  _handleJsonPath(path, value) {
    let str;

    if (this._checkValidJsonStatement(path)) {
      str = path;
    } else {
      const paths = _.toPath(path);
      const column = paths.shift();
      str = this.jsonPathExtractionQuery(column, paths);
    }

    if (value) {
      str += util.format(' = %s', this.escape(value));
    }

    return str;
  },

  handleSequelizeMethod(smth, tableName, factory, options, prepend) {
    if (smth instanceof Utils.Json) {
      if (smth.conditions) {
        return this._handleJsonConditions(smth.conditions);
      } else if (smth.path) {
        return this._handleJsonPath(smth.path, smth.value);
      }
    }
    return AbstractQueryGenerator.handleSequelizeMethod.call(this, smth, tableName, factory, options, prepend);
  },

  addColumnQuery(table, key, dataType) {
    const dbDataType = this.attributeToSQL(dataType, { context: 'addColumn' });
    const definition = this.dataTypeMapping(table, key, dbDataType);
    const quotedKey = this.quoteIdentifier(key);
    const quotedTable = this.quoteTable(this.extractTableDetails(table));

    let query = `ALTER TABLE ${quotedTable} ADD COLUMN ${quotedKey} ${definition};`;

    if (dataType.type && dataType.type instanceof DataTypes.ENUM || dataType instanceof DataTypes.ENUM) {
      query = this.pgEnum(table, key, dataType) + query;
    }

    return query;
  },

  removeColumnQuery(tableName, attributeName) {
    const quotedTableName = this.quoteTable(this.extractTableDetails(tableName));
    const quotedAttributeName = this.quoteIdentifier(attributeName);
    return `ALTER TABLE ${quotedTableName} DROP COLUMN ${quotedAttributeName};`;
  },

  /**
   * Processes NOT NULL constraint for column change
   * @private
   */
  _processNotNullConstraint(definition, tableName, attributeName) {
    const query = 'ALTER TABLE <%= tableName %> ALTER COLUMN <%= query %>;';
    let attrSql = '';

    if (definition.indexOf('NOT NULL') > 0) {
      attrSql += _.template(query, this._templateSettings)({
        tableName: this.quoteTable(tableName),
        query: this.quoteIdentifier(attributeName) + ' SET NOT NULL'
      });
      definition = definition.replace('NOT NULL', '').trim();
    } else if (!definition.match(/REFERENCES/)) {
      attrSql += _.template(query, this._templateSettings)({
        tableName: this.quoteTable(tableName),
        query: this.quoteIdentifier(attributeName) + ' DROP NOT NULL'
      });
    }

    return { attrSql, definition };
  },

  /**
   * Processes DEFAULT constraint for column change
   * @private
   */
  _processDefaultConstraint(definition, tableName, attributeName) {
    const query = 'ALTER TABLE <%= tableName %> ALTER COLUMN <%= query %>;';
    let attrSql = '';

    if (definition.indexOf('DEFAULT') > 0) {
      attrSql += _.template(query, this._templateSettings)({
        tableName: this.quoteTable(tableName),
        query: this.quoteIdentifier(attributeName) + ' SET DEFAULT ' + definition