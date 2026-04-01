```javascript
'use strict';

const Utils = require('../../utils');
const util = require('util');
const DataTypes = require('../../data-types');
const AbstractQueryGenerator = require('../abstract/query-generator');
const semver = require('semver');
const _ = require('lodash');

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

  // Extract table comments from attributes and return formatted comment string
  _extractTableComments(options) {
    let comments = '';
    if (options.comment && _.isString(options.comment)) {
      comments += '; COMMENT ON TABLE <%= table %> IS ' + this.escape(options.comment);
    }
    return comments;
  },

  // Process attribute definitions and extract inline comments
  _processAttributeDefinitions(attributes) {
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

  // Add unique key constraints to attribute string
  _addUniqueConstraints(attrStr, uniqueKeys) {
    if (uniqueKeys) {
      _.each(uniqueKeys, columns => {
        if (columns.customIndex) {
          attrStr.push(`UNIQUE (${columns.fields.map(field => this.quoteIdentifier(field)).join(', ')})`);
        }
      });
    }
  },

  // Extract and format primary key constraints
  _extractPrimaryKeys(attributes) {
    const pks = _.reduce(attributes, (acc, attribute, key) => {
      if (_.includes(attribute, 'PRIMARY KEY')) {
        acc.push(this.quoteIdentifier(key));
      }
      return acc;
    }, []).join(',');

    return pks.length > 0 ? `PRIMARY KEY (${pks})` : '';
  },

  // Determine if CREATE TABLE IF NOT EXISTS should be used
  _shouldUseIfNotExists(databaseVersion) {
    return databaseVersion === 0 || semver.gte(databaseVersion, '9.1.0');
  },

  createTableQuery(tableName, attributes, options) {
    options = _.extend({}, options || {});

    const databaseVersion = _.get(this, 'sequelize.options.databaseVersion', 0);
    const comments = this._extractTableComments(options);
    const { attrStr, comments: inlineComments } = this._processAttributeDefinitions(attributes);

    this._addUniqueConstraints(attrStr, options.uniqueKeys);

    const primaryKeyConstraint = this._extractPrimaryKeys(attributes);
    if (primaryKeyConstraint) {
      attrStr.push(primaryKeyConstraint);
    }

    const values = {
      table: this.quoteTable(tableName),
      attributes: attrStr.join(', '),
      comments: _.template(comments + inlineComments, this._templateSettings)({ table: this.quoteTable(tableName) })
    };

    const ifNotExists = this._shouldUseIfNotExists(databaseVersion) ? 'IF NOT EXISTS ' : '';
    return `CREATE TABLE ${ifNotExists}${values.table} (${values.attributes})${values.comments};`;
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

    const result = this._parseJsonStatement(stmt, jsonFunctionRegex, jsonOperatorRegex, tokenCaptureRegex);

    if (result.hasJsonFunction && result.hasInvalidToken) {
      throw new Error('Invalid json statement: ' + stmt);
    }

    return result.hasJsonFunction;
  },

  // Parse JSON statement to validate syntax and detect functions
  _parseJsonStatement(stmt, jsonFunctionRegex, jsonOperatorRegex, tokenCaptureRegex) {
    let currentIndex = 0;
    let openingBrackets = 0;
    let closingBrackets = 0;
    let hasJsonFunction = false;
    let hasInvalidToken = false;

    while (currentIndex < stmt.length) {
      const string = stmt.substr(currentIndex);

      const functionMatches = jsonFunctionRegex.exec(string);
      if (functionMatches) {
        currentIndex += functionMatches[0].indexOf('(');
        hasJsonFunction = true;
        continue;
      }

      const operatorMatches = jsonOperatorRegex.exec(string);
      if (operatorMatches) {
        currentIndex += operatorMatches[0].length;
        hasJsonFunction = true;
        continue;
      }

      const tokenMatches = tokenCaptureRegex.exec(string);
      if (tokenMatches) {
        const capturedToken = tokenMatches[1];
        if (capturedToken === '(') {
          openingBrackets++;
        } else if (capturedToken === ')') {
          closingBrackets++;
        } else if (capturedToken === ';') {
          hasInvalidToken = true;
          break;
        }
        currentIndex += tokenMatches[0].length;
        continue;
      }

      break;
    }

    hasInvalidToken |= openingBrackets !== closingBrackets;
    return { hasJsonFunction, hasInvalidToken };
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

  // Handle JSON conditions object
  _handleJsonConditions(conditions) {
    return _.map(this.parseConditionObject(conditions), condition =>
      `${this.jsonPathExtractionQuery(_.first(condition.path), _.tail(condition.path))} = '${condition.value}'`
    ).join(' AND ');
  },

  // Handle JSON path expression
  _handleJsonPath(path) {
    if (this._checkValidJsonStatement(path)) {
      return path;
    }

    const paths = _.toPath(path);
    const column = paths.shift();
    return this.jsonPathExtractionQuery(column, paths);
  },

  // Build JSON query string with optional value comparison
  _buildJsonQuery(pathStr, value) {
    let str = pathStr;
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
        const pathStr = this._handleJsonPath(smth.path);
        return this._buildJsonQuery(pathStr, smth.value);
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

  // Build NOT NULL constraint modification
  _buildNotNullModification(query, tableName, attributeName, definition) {
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

  // Build DEFAULT constraint modification
  _buildDefaultModification(query, tableName, attributeName, definition) {
    let attrSql = '';
    if (definition.indexOf('DEFAULT') > 0) {
      attrSql += _.template(query, this._templateSettings)({
        tableName: this.quoteTable(tableName),
        query: this.quoteIdentifier(attributeName) + ' SET DEFAULT ' + definition.match(/DEFAULT ([^;]+)/)[1]
      });
      definition = definition.replace(/(DEFAULT[^;]+)/, '').trim();
    } else if (!definition.match(/REFERENCES/)) {
      attrSql += _.template(query, this._templateSettings)({
        tableName: this.quoteTable(tableName),
        query: this.quoteIdentifier(attributeName) + ' DROP DEFAULT'
      });
    }
    return { attrSql, definition };
  },

  // Build ENUM type modification
  _buildEnumModification(tableName, attributeName, attributeValue, definition) {
    let attrSql = '';
    if (attributeValue.match(/^ENUM\(/)) {
      attrSql += this.pgEnum(tableName, attributeName, attributeValue);
      definition = definition.replace(/^ENUM\(.+\)/, this.pgEnumName(tableName, attributeName, { schema: false }));
      definition += ' USING (' + this.quoteIdentifier(attributeName) + '::' + this.pgEnumName(tableName, attributeName) + ')';
    }
    return { attrSql, definition };
  },

  // Build UNIQUE constraint modification
  _buildUniqueModification(query, tableName, attributeName, definition) {
    let attrSql = '';
    if (definition.match(/UNIQUE;*$/)) {
      definition = definition.replace(/UNIQUE;*$/, '');
      attrSql += _.template(query.replace('ALTER COLUMN', ''), this._templateSettings)({
        tableName: this.quoteTable(tableName),
        query: 'ADD CONSTRAINT ' + this.quoteIdentifier(attributeName + '_unique_idx') + ' UNIQUE (' + this.quoteIdentifier(attributeName) + ')'
      });
    }
    return { attrSql, definition };
  },

  // Build FOREIGN KEY constraint modification
  _buildForeignKeyModification(query, tableName, attributeName, definition) {
    let attrSql = '';
    if (definition.