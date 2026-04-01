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
 * @typedef {Object} ColumnOperationContext
 * @property {String} tableName - Table name
 * @property {String} attributeName - Attribute/column name
 * @property {String} definition - Column definition
 */

/**
 * Parameter object for trigger operations
 * @typedef {Object} TriggerContext
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
 * @typedef {Object} FunctionContext
 * @property {String} functionName - Function name
 * @property {Array} params - Parameters
 * @property {String} returnType - Return type
 * @property {String} language - Language
 * @property {String} body - Function body
 * @property {Array} [options] - Options
 */

/**
 * Parameter object for foreign key queries
 * @typedef {Object} ForeignKeyQueryContext
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
   * Extracts comment from attribute definition
   * @private
   */
  _extractAttributeComment(attribute) {
    const commentIndex = attribute.indexOf('COMMENT');
    if (commentIndex !== -1) {
      return {
        comment: attribute.substring(commentIndex),
        definition: attribute.substring(0, commentIndex)
      };
    }
    return { comment: '', definition: attribute };
  },

  /**
   * Builds attribute strings for table creation
   * @private
   */
  _buildAttributeStrings(tableName, attributes) {
    const attrStr = [];
    let comments = '';

    for (const attr in attributes) {
      const { comment, definition } = this._extractAttributeComment(attributes[attr]);
      if (comment) {
        comments += '; ' + comment;
      }

      const dataType = this.dataTypeMapping(tableName, attr, definition);
      attrStr.push(this.quoteIdentifier(attr) + ' ' + dataType);
    }

    return { attrStr, comments };
  },

  /**
   * Adds unique key constraints to attributes
   * @private
   */
  _addUniqueConstraints(attributes, uniqueKeys) {
    if (!uniqueKeys) return;

    _.each(uniqueKeys, columns => {
      if (columns.customIndex) {
        attributes += `, UNIQUE (${columns.fields.map(field => this.quoteIdentifier(field)).join(', ')})`;
      }
    });

    return attributes;
  },

  /**
   * Extracts and formats primary keys
   * @private
   */
  _extractPrimaryKeys(attributes) {
    const pks = _.reduce(attributes, (acc, attribute, key) => {
      if (_.includes(attribute, 'PRIMARY KEY')) {
        acc.push(this.quoteIdentifier(key));
      }
      return acc;
    }, []).join(',');

    return pks.length > 0 ? `, PRIMARY KEY (${pks})` : '';
  },

  createTableQuery(tableName, attributes, options) {
    options = _.extend({}, options || {});

    const databaseVersion = _.get(this, 'sequelize.options.databaseVersion', 0);
    const { attrStr, comments: extractedComments } = this._buildAttributeStrings(tableName, attributes);

    let comments = '';
    if (options.comment && _.isString(options.comment)) {
      comments += '; COMMENT ON TABLE <%= table %> IS ' + this.escape(options.comment);
    }
    comments += extractedComments;

    let attributesStr = attrStr.join(', ');
    attributesStr = this._addUniqueConstraints(attributesStr, options.uniqueKeys);
    attributesStr += this._extractPrimaryKeys(attributes);

    const values = {
      table: this.quoteTable(tableName),
      attributes: attributesStr,
      comments: _.template(comments, this._templateSettings)({ table: this.quoteTable(tableName) })
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
   * Check whether the statmement is json function or simple path
   *
   * @param   {String}  stmt  The statement to validate
   * @returns {Boolean}       true if the given statement is json function
   * @throws  {Error}         throw if the statement looks like json function but has invalid token
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
   * Validates JSON statement structure
   * @private
   */
  _validateJsonStatement(stmt, jsonFunctionRegex, jsonOperatorRegex, tokenCaptureRegex) {
    let currentIndex = 0;
    let openingBrackets = 0;
    let closingBrackets = 0;
    let hasJsonFunction = false;
    let hasInvalidToken = false;

    while (currentIndex < stmt.length) {
      const result = this._processJsonToken(stmt, currentIndex, jsonFunctionRegex, jsonOperatorRegex, tokenCaptureRegex);
      
      if (result.matched) {
        currentIndex = result.nextIndex;
        hasJsonFunction = result.hasJsonFunction || hasJsonFunction;
        openingBrackets += result.openingBrackets;
        closingBrackets += result.closingBrackets;
        
        if (result.hasInvalidToken) {
          hasInvalidToken = true;
          break;
        }
      } else {
        break;
      }
    }

    hasInvalidToken |= openingBrackets !== closingBrackets;
    if (hasJsonFunction && hasInvalidToken) {
      throw new Error('Invalid json statement: ' + stmt);
    }

    return hasJsonFunction;
  },

  /**
   * Processes a single JSON token
   * @private
   */
  _processJsonToken(stmt, currentIndex, jsonFunctionRegex, jsonOperatorRegex, tokenCaptureRegex) {
    const string = stmt.substr(currentIndex);
    
    const functionMatches = jsonFunctionRegex.exec(string);
    if (functionMatches) {
      return {
        matched: true,
        nextIndex: currentIndex + functionMatches[0].indexOf('('),
        hasJsonFunction: true,
        openingBrackets: 0,
        closingBrackets: 0,
        hasInvalidToken: false
      };
    }

    const operatorMatches = jsonOperatorRegex.exec(string);
    if (operatorMatches) {
      return {
        matched: true,
        nextIndex: currentIndex + operatorMatches[0].length,
        hasJsonFunction: true,
        openingBrackets: 0,
        closingBrackets: 0,
        hasInvalidToken: false
      };
    }

    const tokenMatches = tokenCaptureRegex.exec(string);
    if (tokenMatches) {
      const capturedToken = tokenMatches[1];
      let openingBrackets = 0;
      let closingBrackets = 0;
      let hasInvalidToken = false;

      if (capturedToken === '(') {
        openingBrackets = 1;
      } else if (capturedToken === ')') {
        closingBrackets = 1;
      } else if (capturedToken === ';') {
        hasInvalidToken = true;
      }

      return {
        matched: true,
        nextIndex: currentIndex + tokenMatches[0].length,
        hasJsonFunction: false,
        openingBrackets,
        closingBrackets,
        hasInvalidToken
      };
    }

    return { matched: false };
  },

  /**
   * Generates an SQL query that extract JSON property of given path.
   *
   * @param   {String}               column  The JSON column
   * @param   {String|Array<String>} [path]  The path to extract (optional)
   * @returns {String}                       The generated sql query
   * @private
   */
  jsonPathExtractionQuery(column, path) {
    const paths = _.toPath(path);
    const pathStr = this.escape(`{${paths.join(',')}}`);
    const quotedColumn = this.isIdentifierQuoted(column) ? column : this.quoteIdentifier(column);
    return `(${quotedColumn}#>>${pathStr})`;
  },

  handleSequelizeMethod(smth, tableName, factory, options, prepend) {
    if (smth instanceof Utils.Json) {
      return this._handleJsonMethod(smth);
    }
    return AbstractQueryGenerator.handleSequelizeMethod.call(this, smth, tableName, factory, options, prepend);
  },

  /**
   * Handles JSON method processing
   * @private
   */
  _handleJsonMethod(jsonObj) {
    if (jsonObj.conditions) {
      const conditions = _.map(this.parseConditionObject(jsonObj.conditions), condition =>
        `${this.jsonPathExtractionQuery(_.first(condition.path), _.tail(condition.path))} = '${condition.value}'`
      );
      return conditions.join(' AND ');
    } else if (jsonObj.path) {
      return this._buildJsonPathQuery(jsonObj);
    }
    return '';
  },

  /**
   * Builds JSON path query
   * @private
   */
  _buildJsonPathQuery(jsonObj) {
    let str;

    if (this._checkValidJsonStatement(jsonObj.path)) {
      str = jsonObj.path;
    } else {
      const paths = _.toPath(jsonObj.path);
      const column = paths.shift();
      str = this.jsonPathExtractionQuery(column, paths);
    }

    if (jsonObj.value) {
      str += util.format(' = %s', this.escape(jsonObj.value));
    }

    return str;
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
  _processNotNullConstraint(definition, tableName, attributeName