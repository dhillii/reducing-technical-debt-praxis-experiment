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
    const ifNotExists = databaseVersion && semver.gte(databaseVersion, '9.2.0') ? 'IF NOT EXISTS ' : '';
    return `CREATE SCHEMA ${ifNotExists}${schema};`;
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

  _extractComments(attributes) {
    const comments = [];
    for (const attr in attributes) {
      const i = attributes[attr].indexOf('COMMENT');
      if (i !== -1) {
        comments.push(attributes[attr].substring(i));
        attributes[attr] = attributes[attr].substring(0, i);
      }
    }
    return comments;
  },

  _buildAttributeStrings(tableName, attributes) {
    return Object.entries(attributes).map(([attr, definition]) => {
      const dataType = this.dataTypeMapping(tableName, attr, definition);
      return this.quoteIdentifier(attr) + ' ' + dataType;
    });
  },

  _addUniqueConstraints(values, options) {
    if (!options.uniqueKeys) return;
    _.each(options.uniqueKeys, columns => {
      if (columns.customIndex) {
        values.attributes += `, UNIQUE (${columns.fields.map(field => this.quoteIdentifier(field)).join(', ')})`;
      }
    });
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

  createTableQuery(tableName, attributes, options) {
    options = _.extend({}, options || {});
    const databaseVersion = _.get(this, 'sequelize.options.databaseVersion', 0);
    
    const attrStr = this._buildAttributeStrings(tableName, attributes);
    const comments = this._extractComments(attributes);
    
    let commentStr = '';
    if (options.comment && _.isString(options.comment)) {
      commentStr = '; COMMENT ON TABLE <%= table %> IS ' + this.escape(options.comment);
    }
    commentStr += comments.map(c => '; ' + c).join('');

    const values = {
      table: this.quoteTable(tableName),
      attributes: attrStr.join(', '),
      comments: _.template(commentStr, this._templateSettings)({ table: this.quoteTable(tableName) })
    };

    this._addUniqueConstraints(values, options);
    this._addPrimaryKeyConstraint(values, attributes);

    const ifNotExists = databaseVersion === 0 || semver.gte(databaseVersion, '9.1.0') ? 'IF NOT EXISTS ' : '';
    return `CREATE TABLE ${ifNotExists}${values.table} (${values.attributes})${values.comments};`;
  },

  dropTableQuery(tableName, options) {
    options = options || {};
    const cascade = options.cascade ? ' CASCADE' : '';
    return `DROP TABLE IF EXISTS ${this.quoteTable(tableName)}${cascade};`;
  },

  showTablesQuery() {
    return "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type LIKE '%TABLE' AND table_name != 'spatial_ref_sys';";
  },

  describeTableQuery(tableName, schema) {
    schema = schema || 'public';
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

  _checkValidJsonStatement(stmt) {
    if (!_.isString(stmt)) {
      return false;
    }

    const jsonFunctionRegex = /^\s*((?:[a-z]+_){0,2}jsonb?(?:_[a-z]+){0,2})\([^)]*\)/i;
    const jsonOperatorRegex = /^\s*(->>?|#>>?|@>|<@|\?[|&]?|\|{2}|#-)/i;
    const tokenCaptureRegex = /^\s*((?:([`"'])(?:(?!\2).|\2{2})*\2)|[\w\d\s]+|[().,;+-])/i;

    let currentIndex = 0;
    let openingBrackets = 0;
    let closingBrackets = 0;
    let hasJsonFunction = false;

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
        if (capturedToken === '(') openingBrackets++;
        else if (capturedToken === ')') closingBrackets++;
        else if (capturedToken === ';') break;
        
        currentIndex += tokenMatches[0].length;
        continue;
      }

      break;
    }

    const hasInvalidToken = openingBrackets !== closingBrackets;
    if (hasJsonFunction && hasInvalidToken) {
      throw new Error('Invalid json statement: ' + stmt);
    }

    return hasJsonFunction;
  },

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
      const conditions = _.map(this.parseConditionObject(smth.conditions), condition =>
        `${this.jsonPathExtractionQuery(_.first(condition.path), _.tail(condition.path))} = '${condition.value}'`
      );
      return conditions.join(' AND ');
    }
    
    if (smth.path) {
      let str = this._checkValidJsonStatement(smth.path) ? smth.path : this._buildJsonPathQuery(smth.path);
      if (smth.value) {
        str += util.format(' = %s', this.escape(smth.value));
      }
      return str;
    }
  },

  _buildJsonPathQuery(path) {
    const paths = _.toPath(path);
    const column = paths.shift();
    return this.jsonPathExtractionQuery(column, paths);
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

  _buildChangeColumnSql(tableName, attributeName, definition) {
    const query = 'ALTER TABLE <%= tableName %> ALTER COLUMN <%= query %>;';
    let attrSql = '';

    attrSql += this._handleNotNullConstraint(tableName, attributeName, definition, query);
    attrSql += this._handleDefaultConstraint(tableName, attributeName, definition, query);
    attrSql += this._handleEnumType(tableName, attributeName, definition, query);
    attrSql += this._handleUniqueConstraint(tableName, attributeName, definition, query);
    attrSql += this._handleForeignKeyConstraint(tableName, attributeName, definition, query);

    return attrSql;
  },

  _handleNotNullConstraint(tableName, attributeName, definition, query) {
    let sql = '';
    if (definition.indexOf('NOT NULL') > 0) {
      sql += _.template(query, this._templateSettings)({
        tableName: this.quoteTable(tableName),
        query: this.quoteIdentifier(attributeName) + ' SET NOT NULL'
      });
      return sql;
    }
    if (!definition.match(/REFERENCES/)) {
      sql += _.template(query, this._templateSettings)({
        tableName: this.quoteTable(tableName),
        query: this.quoteIdentifier(attributeName) + ' DROP NOT NULL'
      });
    }
    return sql;
  },

  _handleDefaultConstraint(tableName, attributeName, definition, query) {
    let sql = '';
    if (definition.indexOf('DEFAULT') > 0) {
      sql += _.template(query, this._templateSettings)({
        tableName: this.quoteTable(tableName),
        query: this.quoteIdentifier(attributeName) + ' SET DEFAULT ' + definition.match(/DEFAULT ([^;]+)/)[1]
      });
      return sql;
    }
    if (!definition.match(/REFERENCES/)) {
      sql += _.template(query, this._templateSettings)({
        tableName: this.quoteTable(tableName),
        query: this.quoteIdentifier(attributeName) + ' DROP DEFAULT'
      });
    }
    return sql;
  },

  _handleEnumType(tableName, attributeName, definition, query) {
    if (!definition.match(/^ENUM\(/)) return '';
    
    let sql = this.pgEnum(tableName, attributeName, definition);
    definition = definition.replace(/^ENUM\(.+\)/, this.pgEnumName(tableName, attributeName, { schema: false }));
    definition += ' USING (' + this.quoteIdentifier(attributeName) + '::' + this.pgEnumName(tableName, attributeName) + ')';
    
    sql += _.template(query, this._templateSettings)({
      tableName: this.quoteTable(tableName),
      query: this.quoteIdentifier(attributeName) + ' TYPE ' + definition
    });
    return sql;
  },

  _handleUniqueConstraint(tableName, attributeName, definition, query) {
    if (!definition.match(/UNIQUE;*$/)) return '';
    
    definition = definition.replace(/UNIQUE;*$/, '');
    return _.template(query.replace('ALTER COLUMN', ''), this._templateSettings)({
      tableName: this.quoteTable(tableName),
      query: 'ADD CONSTRAINT ' + this.quoteIdentifier(attributeName + '_unique_idx') + ' UNIQUE (' + this.quoteIdentifier(attributeName) + ')'
    });
  },

  _handleForeignKeyConstraint(tableName, attributeName, definition, query) {
    if (!definition.match(/REFERENCES/)) {
      return _.template(query, this._templateSettings)({
        tableName: this.quoteTable(tableName),
        query: this.quoteIdentifier(attributeName) + ' TYPE ' + definition
      });
    }
    
    definition = definition.replace(/.+?(?=REFERENCES)/, '');
    return _.template(query.replace('ALTER COLUMN', ''), this._templateSettings)({
      tableName: this.quoteTable(tableName),
      query: 'ADD CONSTRAINT ' + this.quoteIdentifier(attributeName + '_foreign_idx') + ' FOREIGN KEY (' + this.quoteIdentifier(attributeName) + ') ' + definition
    });
  },

  changeColumnQuery(tableName, attributes) {
    const sql = [];
    for (const attributeName in attributes) {
      let definition = this.dataTypeMapping(tableName, attributeName, attributes[attributeName]);
      sql.push(this._buildChangeColumnSql(tableName, attributeName, definition));
    }
    return sql.join('');
  },

  renameColumnQuery(tableName, attrBefore, attributes) {
    const attrString = [];
    for (const attributeName in attributes) {
      attrString.push(_.template('<%= before %> TO <%= after %>', this._templateSettings)