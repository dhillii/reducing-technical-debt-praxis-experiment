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

  createTableQuery(tableName, attributes, options) {
    options = _.extend({}, options || {});

    const databaseVersion = _.get(this, 'sequelize.options.databaseVersion', 0);
    const attrStr = [];
    let comments = '';

    comments = this._extractTableComments(options, comments);
    this._processAttributeDefinitions(tableName, attributes, attrStr, comments);

    const values = {
      table: this.quoteTable(tableName),
      attributes: attrStr.join(', '),
      comments: _.template(comments, this._templateSettings)({ table: this.quoteTable(tableName) })
    };

    this._addUniqueConstraints(values, options);
    this._addPrimaryKeyConstraint(values, attributes);

    return `CREATE TABLE ${databaseVersion === 0 || semver.gte(databaseVersion, '9.1.0') ? 'IF NOT EXISTS ' : ''}${values.table} (${values.attributes})${values.comments};`;
  },

  _extractTableComments(options, comments) {
    if (options.comment && _.isString(options.comment)) {
      comments += '; COMMENT ON TABLE <%= table %> IS ' + this.escape(options.comment);
    }
    return comments;
  },

  _processAttributeDefinitions(tableName, attributes, attrStr, comments) {
    for (const attr in attributes) {
      const commentIndex = attributes[attr].indexOf('COMMENT');
      if (commentIndex !== -1) {
        comments += '; ' + attributes[attr].substring(commentIndex);
        attributes[attr] = attributes[attr].substring(0, commentIndex);
      }

      const dataType = this.dataTypeMapping(tableName, attr, attributes[attr]);
      attrStr.push(this.quoteIdentifier(attr) + ' ' + dataType);
    }
  },

  _addUniqueConstraints(values, options) {
    if (options.uniqueKeys) {
      _.each(options.uniqueKeys, columns => {
        if (columns.customIndex) {
          values.attributes += `, UNIQUE (${columns.fields.map(field => this.quoteIdentifier(field)).join(', ')})`;
        }
      });
    }
  },

  _addPrimaryKeyConstraint(values, attributes) {
    const pks = _.reduce(attributes, (acc, attribute, key) => {
      if (_.includes(attribute, 'PRIMARY KEY')) {
        acc.push(this.quoteIdentifier(key));
      }
      return acc;
    }, []).join(',');

    if (pks.length > 0) {
      values.attributes += `, PRIMARY KEY (${pks})`;
    }
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

    const parseResult = this._parseJsonStatement(stmt, jsonFunctionRegex, jsonOperatorRegex, tokenCaptureRegex);

    if (parseResult.hasJsonFunction && parseResult.hasInvalidToken) {
      throw new Error('Invalid json statement: ' + stmt);
    }

    return parseResult.hasJsonFunction;
  },

  _parseJsonStatement(stmt, jsonFunctionRegex, jsonOperatorRegex, tokenCaptureRegex) {
    let currentIndex = 0;
    let openingBrackets = 0;
    let closingBrackets = 0;
    let hasJsonFunction = false;
    let hasInvalidToken = false;

    while (currentIndex < stmt.length) {
      const string = stmt.substr(currentIndex);

      if (this._matchJsonFunction(string, jsonFunctionRegex)) {
        const functionMatches = jsonFunctionRegex.exec(string);
        currentIndex += functionMatches[0].indexOf('(');
        hasJsonFunction = true;
        continue;
      }

      if (this._matchJsonOperator(string, jsonOperatorRegex)) {
        const operatorMatches = jsonOperatorRegex.exec(string);
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

  _matchJsonFunction(string, jsonFunctionRegex) {
    return jsonFunctionRegex.test(string);
  },

  _matchJsonOperator(string, jsonOperatorRegex) {
    return jsonOperatorRegex.test(string);
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

  _handleJsonMethod(smth) {
    if (smth.conditions) {
      return this._buildJsonConditions(smth);
    } else if (smth.path) {
      return this._buildJsonPath(smth);
    }
    return '';
  },

  _buildJsonConditions(smth) {
    const conditions = _.map(this.parseConditionObject(smth.conditions), condition =>
      `${this.jsonPathExtractionQuery(_.first(condition.path), _.tail(condition.path))} = '${condition.value}'`
    );
    return conditions.join(' AND ');
  },

  _buildJsonPath(smth) {
    let str;

    if (this._checkValidJsonStatement(smth.path)) {
      str = smth.path;
    } else {
      const paths = _.toPath(smth.path);
      const column = paths.shift();
      str = this.jsonPathExtractionQuery(column, paths);
    }

    if (smth.value) {
      str += util.format(' = %s', this.escape(smth.value));
    }

    return str;
  },

  addColumnQuery(table, key, dataType) {
    const dbDataType = this.attributeToSQL(dataType, { context: 'addColumn' });
    const definition = this.dataTypeMapping(table, key, dbDataType);
    const quotedKey = this.quoteIdentifier(key);
    const quotedTable = this.quoteTable(this.extractTableDetails(table));

    let query = `ALTER TABLE ${quotedTable} ADD COLUMN ${quotedKey} ${definition};`;

    if (this._isEnumType(dataType)) {
      query = this.pgEnum(table, key, dataType) + query;
    }

    return query;
  },

  _isEnumType(dataType) {
    return (dataType.type && dataType.type instanceof DataTypes.ENUM) || dataType instanceof DataTypes.ENUM;
  },

  removeColumnQuery(tableName, attributeName) {
    const quotedTableName = this.quoteTable(this.extractTableDetails(tableName));
    const quotedAttributeName = this.quoteIdentifier(attributeName);
    return `ALTER TABLE ${quotedTableName} DROP COLUMN ${quotedAttributeName};`;
  },

  changeColumnQuery(tableName, attributes) {
    const sql = [];

    for (const attributeName in attributes) {
      const attrSql = this._buildChangeColumnQuery(tableName, attributeName, attributes[attributeName]);
      sql.push(attrSql);
    }

    return sql.join('');
  },

  _buildChangeColumnQuery(tableName, attributeName, attributeDefinition) {
    const query = 'ALTER TABLE <%= tableName %> ALTER COLUMN <%= query %>;';
    let definition = this.dataTypeMapping(tableName, attributeName, attributeDefinition);
    let attrSql = '';

    attrSql += this._buildNotNullConstraint(query, tableName, attributeName, definition);
    definition = this._updateDefinitionAfterNotNull(definition);

    attrSql += this._buildDefaultConstraint(query, tableName, attributeName, definition);
    definition = this._updateDefinitionAfterDefault(definition);

    attrSql += this._buildEnumConstraint(query, tableName, attributeName, attributeDefinition, definition);
    definition = this._updateDefinitionAfterEnum(tableName, attributeName, definition);

    attrSql += this._buildUniqueConstraint(query, tableName, attributeName, definition);
    definition = this._updateDefinitionAfterUnique(definition);

    attrSql += this._buildForeignKeyConstraint(query, tableName, attributeName, definition);

    return attrSql;
  },

  _buildNotNullConstraint(query, tableName, attributeName, definition) {
    let attrSql = '';
    if (definition.indexOf('NOT NULL') > 0) {
      attrSql += _.template(query, this._templateSettings)({
        tableName: this.quoteTable(tableName),
        query: this.quoteIdentifier(attributeName) + ' SET NOT NULL'
      });
    } else if (!definition.match(/REFERENCES/)) {
      attrSql += _.template(query, this._templateSettings)({
        tableName: this.quoteTable(tableName),
        query: this.quoteIdentifier(attributeName) + ' DROP NOT NULL'
      });
    }
    return attrSql;
  },

  _updateDefinitionAfterNotNull(definition) {
    return definition.replace('NOT NULL', '').trim();
  },

  _buildDefaultConstraint(query, tableName, attributeName, definition) {
    let attrSql = '';
    if (definition.indexOf('DEFAULT') > 0) {
      const defaultMatch = definition.match(/DEFAULT ([^;]+)/);
      if (defaultMatch) {
        attrSql += _.template(query, this._templateSettings)({
          tableName: this.quoteTable(tableName),
          query: this.quoteIdentifier(attributeName) + ' SET DEFAULT ' + defaultMatch[1]
        });
      }
    } else if (!definition.match(/REFERENCES/)) {
      attrSql += _.template(query, this._templateSettings)({
        tableName: this.quoteTable(tableName),
        query: this.quoteIdentifier(attributeName) + ' DROP DEFAULT'
      });
    }
    return attrSql;
  },

  _updateDefinitionAfterDefault(definition) {
    return definition.replace(/(DEFAULT[^;]+)/, '').trim();
  },

  _buildEnumConstraint(query, tableName, attributeName, attributeDefinition, definition) {