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
      const commentIndex = attributes[attr].indexOf('COMMENT');
      if (commentIndex !== -1) {
        comments += '; ' + attributes[attr].substring(commentIndex);
        attributes[attr] = attributes[attr].substring(0, commentIndex);
      }

      const dataType = this.dataTypeMapping(attr, attr, attributes[attr]);
      attrStr.push(this.quoteIdentifier(attr) + ' ' + dataType);
    }

    return { attrStr, comments };
  },

  // Add unique key constraints to attribute string
  _addUniqueConstraints(attributes, options) {
    if (!options.uniqueKeys) {
      return;
    }

    _.each(options.uniqueKeys, columns => {
      if (columns.customIndex) {
        attributes.push(`UNIQUE (${columns.fields.map(field => this.quoteIdentifier(field)).join(', ')})`);
      }
    });
  },

  // Extract and format primary key constraints
  _extractPrimaryKeyConstraint(attributes) {
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

    const { attrStr, comments } = this._processAttributeDefinitions(attributes);
    const tableComments = this._extractTableComments(options);
    const allComments = tableComments + comments;

    this._addUniqueConstraints(attrStr, options);

    const pkConstraint = this._extractPrimaryKeyConstraint(attributes);
    if (pkConstraint) {
      attrStr.push(pkConstraint);
    }

    const values = {
      table: this.quoteTable(tableName),
      attributes: attrStr.join(', '),
      comments: _.template(allComments, this._templateSettings)({ table: this.quoteTable(tableName) })
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

  // Parse JSON statement and track bracket balance and validity
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

  // Handle JSON path extraction
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
      const defaultMatch = definition.match(/DEFAULT ([^;]+)/);
      attrSql += _.template(query, this._templateSettings)({
        tableName: this.quoteTable(tableName),
        query: this.quoteIdentifier(attributeName) + ' SET DEFAULT ' + defaultMatch[1]
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
  _buildEnumModification(attrSql, tableName, attributeName, definition, attributeValue) {
    if (attributeValue.match(/^ENUM\(/)) {
      attrSql += this.pgEnum(tableName, attributeName, attributeValue);
      definition = definition.replace(/^ENUM\(.+\)/, this.pgEnumName(tableName, attributeName, { schema: false }));
      definition += ' USING (' + this.quoteIdentifier(attributeName) + '::' + this.pgEnumName(tableName, attributeName) + ')';
    }
    return { attrSql, definition };
  },

  // Build UNIQUE constraint modification
  _buildUniqueModification(query, attrSql, tableName, attributeName, definition) {
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
  _buildForeignKeyModification(query, attrSql, tableName, attributeName, definition) {
    if (definition.match(/REFERENCES/)) {
      definition = definition.replace(/.+?(?=REFERENCES)/, '');
      attrSql += _.template(query.replace('ALTER COLUMN', ''), this._templateSettings)({
        tableName: this.quoteTable(tableName),
        query: 'ADD CONSTRAINT ' + this.quoteIdentifier(attributeName + '_foreign_idx') + ' FOREIGN KEY (' + this.quoteIdentifier(attributeName) + ') ' + definition
      });
      return { attrSql, definition, isForeignKey: true };
    }
    return { attrSql, definition, isForeignKey: false };
  },

  // Build TYPE modification for non-foreign key columns
  _buildTypeModification(query, attrSql, tableName, attributeName, definition) {
    attrSql += _.template(query, this._templateSettings)({
      tableName: this.quoteTable(tableName),
      query: this.quoteIdentifier(attributeName) + ' TYPE ' + definition
    });
    return attrSql;
  },

  changeColumnQuery(tableName, attributes) {
    const query = 'ALTER TABLE <%= tableName %> ALTER COLUMN <%= query %>;';
    const sql = [];

    for (const attributeName in attributes) {
      let definition = this.dataTypeMapping(tableName, attributeName, attributes[attributeName]);
      let attrSql = '';

      const notNullResult = this._buildNotNullModification(query, tableName, attributeName, definition);
      attrSql = notNullResult.attrSql;
      definition = notNullResult.definition;

      const defaultResult = this._buildDefaultModification(query, tableName, attributeName, definition);
      attrSql += defaultResult.attrSql;
      definition = defaultResult.definition;

      const enumResult = this._buildEnumModification(attrSql, tableName, attributeName, definition, attributes[attributeName]);
      attrSql = enumResult.attrSql;
      definition = enumResult.definition;

      const uniqueResult = this._buildUniqueModification(query, attrSql, tableName, attributeName, definition);
      attrSql = uniqueResult.attrSql;
      definition = uniqueResult.definition;

      const fkResult = this._buildForeignKeyModification(query, attrSql, tableName, attributeName, definition);
      attrSql = fkResult.attrSql;
      definition = fkResult.definition;

      if (!fkResult.isForeignKey) {
        attrSql = this._buildTypeModification(query, attrSql, tableName, attributeName, definition);
      }

      sql.push(attrSql);
    }

    return sql.join('');
  },

  renameColumnQuery(tableName, attrBefore, attributes) {
    const attrString = [];

    for (const attributeName in attributes) {
      attrString.push(_.template('<%= before %> TO <%= after %>', this._templateSettings)({
        before: this.quoteIdentifier(attrBefore),
        after: this.quoteIdentifier(attributeName)
      }));
    }

    return `ALTER TABLE ${this.quoteTable(tableName)} RENAME COLUMN ${attrString.join(', ')};`;
  },

  fn(fnName, tableName, parameters, body, returns, language) {
    fnName = fnName || 'testfunc';
    language = language || 'plpgsql';
    returns = returns ? `RETURNS ${returns}` : '';
    parameters = parameters || '';

    return `CREATE OR REPLACE FUNCTION pg_temp.${fnName}(${parameters}) ${returns} AS $func$ BEGIN ${body} END; $func$ LANGUAGE ${language}; SELECT * FROM pg_temp.${fnName}();`;
  },

  exceptionFn(fnName, tableName, parameters, main, then, when, returns, language) {
    when = when || 'unique_violation';

    const body = `${main} EXCEPTION WHEN ${when} THEN ${then};`;

    return this.fn(fnName, tableName, parameters, body, returns, language);
  },

  upsertQuery(tableName, insertValues, updateValues, where, model, options) {
    const primaryField = this.quoteIdentifier(model.primaryKeyField);

    let insert = this.insertQuery(tableName, insertValues, model.rawAttributes, options);
    let update = this.updateQuery(tableName, updateValues, where, options, model.rawAttributes);

    insert = insert.replace('RETURNING *', `RETURNING ${primaryField} INTO primary_key`);
    update = update.replace('RETURNING *', `RETURNING ${primaryField} INTO primary_key`);

    return this.exceptionFn(
      'sequelize_upsert',
      tableName,
      'OUT created boolean, OUT primary_key text',
      `${insert} created := true;`,
      `${update}; created := false`
    );
  },

  // Build TRUNCATE query with optional options
  _buildTruncateQuery(tableName, options) {
    let query = 'TRUNCATE ' + tableName;

    if (options.restartIdentity) {
      query += ' RESTART IDENTITY';
    }

    if (options.cascade) {
      query += ' CASCADE';
    }

    return query;
  },

  // Build DELETE query with limit and primary keys
  _buildLimitedDeleteQuery(tableName, model, options) {
    const pks = _.map(_.values(model.primaryKeys), pk => this.quoteIdentifier(pk.field)).join(',');

    const replacements = {
      table: tableName,
      where: this.getWhereConditions(options.where, null, model, options),
      limit: options.limit ? ' LIMIT ' + this.escape(options.limit) : '',
      primaryKeys: model.primaryKeyAttributes.length > 1 ? '(' + pks + ')' : pks,
      primaryKeysSelection: pks
    };

    const query = 'DELETE FROM <%= table %> WHERE <%= primaryKeys %> IN (SELECT <%= primaryKeysSelection %> FROM <%= table %><%= where %><%= limit %>)';

    return { query, replacements };
  },

  // Build simple DELETE query without limit
  _buildSimpleDeleteQuery(tableName) {
    return { query: 'DELETE FROM <%= table %><%= where %>', replacements: {} };
  },

  deleteQuery(tableName, where, options, model) {
    options = options || {};
    tableName = this.quoteTable(tableName);

    if (options.truncate === true) {
      return this._buildTruncateQuery(tableName, options);
    }

    if (_.isUndefined(options.limit)) {
      options.limit = 1;
    }

    let queryData;
    if (options.limit) {
      if (!model) {
        throw new Error('Cannot LIMIT delete without a model.');
      }
      queryData = this._buildLimitedDeleteQuery(tableName, model, { where, limit: options.limit });
    } else {
      queryData = this._buildSimpleDeleteQuery(tableName);
      queryData.replacements = {
        table: tableName,
        where: this.getWhereConditions(where, null, model, options)
      };
    }

    if (queryData.replacements.where) {
      queryData.replacements.where = ' WHERE ' + queryData.replacements.where;
    }

    return _.template(queryData.query, this._templateSettings)(queryData.replacements);
  },

  // Build schema join and where clause for index query
  _buildIndexQuerySchemaConditions(tableName) {
    let schemaJoin = '';
    let schemaWhere = '';
    let table = tableName;

    if (!_.isString(tableName)) {
      schemaJoin = ', pg_namespace s';
      schemaWhere = ` AND s.oid = t.relnamespace AND s.nspname = '${tableName.schema}'`;
      table = tableName.tableName;
    }

    return { schemaJoin, schemaWhere, table };
  },

  showIndexesQuery(tableName) {
    const { schemaJoin, schemaWhere, table } = this._buildIndexQuerySchemaConditions(tableName);

    return 'SELECT i.relname AS name, ix.indisprimary AS primary, ix.indisunique AS unique, ix.indkey AS indkey, ' +
      'array_agg(a.attnum) as column_indexes, array_agg(a.attname) AS column_names, pg_get_indexdef(ix.indexrelid) ' +
      `AS definition FROM pg_class t, pg_class i, pg_index ix, pg_attribute a${schemaJoin} ` +
      'WHERE t.oid = ix.indrelid AND i.oid = ix.indexrelid AND a.attrelid = t.oid AND ' +
      `t.relkind = 'r' and t.relname = '${table}'${schemaWhere} ` +
      'GROUP BY i.relname, ix.indexrelid, ix.indisprimary, ix.indisunique, ix.indkey ORDER BY i.relname;';
  },

  showConstraintsQuery(tableName) {
    return [
      'SELECT constraint_catalog AS "constraintCatalog",',
      'constraint_schema AS "constraintSchema",',
      'constraint_name AS "constraintName",',
      'table_catalog AS "tableCatalog",',
      'table_schema AS "tableSchema",',
      'table_name AS "tableName",',
      'constraint_type AS "constraintType",',
      'is_deferrable AS "isDeferrable",',
      'initially_deferred AS "initiallyDeferred"',
      'from INFORMATION_SCHEMA.table_constraints',
      `WHERE table_name='${tableName}';`
    ].join(' ');
  },

  removeIndexQuery(tableName, indexNameOrAttributes) {
    let indexName = indexNameOrAttributes;

    if (typeof indexName !== 'string') {
      indexName = Utils.underscore(tableName + '_' + indexNameOrAttributes.join('_'));
    }

    return `DROP INDEX IF EXISTS ${this.quoteIdentifiers(indexName)}`;
  },

  addLimitAndOffset(options) {
    let fragment = '';
    /* eslint-disable */
    if (options.limit != null) {
      fragment += ' LIMIT ' + this.escape(options.limit);
    }
    if (options.offset != null) {
      fragment += ' OFFSET ' + this.escape(options.offset);
    }
    /* eslint-enable */

    return fragment;
  },

  // Handle ENUM type attribute conversion
  _handleEnumAttribute(attribute) {
    const enumType = attribute.type.type || attribute.type;
    let values = attribute.values;

    if (enumType.values && !attribute.values) {
      values = enumType.values;
    }

    if (!Array.isArray(values) || values.length === 0) {
      throw new Error("Values for ENUM haven't been defined.");
    }

    let type = 'ENUM(' + _.map(values, value => this.escape(value)).join(', ') + ')';

    if (attribute.type instanceof DataTypes.ARRAY) {
      type += '[]';
    }

    return type;
  },

  // Build attribute SQL with constraints
  _buildAttributeConstraints(sql, attribute) {
    if (attribute.hasOwnProperty('allowNull') && !attribute.allowNull) {
      sql += ' NOT NULL';
    }

    if (attribute.autoIncrement) {
      sql += ' SERIAL';
    }

    if (Utils.defaultValueSchemable(attribute.defaultValue)) {
      sql += ' DEFAULT ' + this.escape(attribute.defaultValue, attribute);
    }

    if (attribute.unique === true) {
      sql += ' UNIQUE';
    }

    if (attribute.primaryKey) {
      sql += ' PRIMARY KEY';
    }

    return sql;
  },

  // Build foreign key reference clause
  _buildForeignKeyReference(attribute) {
    const referencesTable = this.quoteTable(attribute.references.model);
    let referencesKey;

    if (attribute.references.key) {
      referencesKey = this.quoteIdentifiers(attribute.references.key);
    } else {
      referencesKey = this.quoteIdentifier('id');
    }

    let sql = ` REFERENCES ${referencesTable} (${referencesKey})`;

    if (attribute.onDelete) {
      sql += ' ON DELETE ' + attribute.onDelete.toUpperCase();
    }

    if (attribute.onUpdate) {
      sql += ' ON UPDATE ' + attribute.onUpdate.toUpperCase();
    }

    if (attribute.references.deferrable) {
      sql += ' ' + attribute.references.deferrable.toString(this);
    }

    return sql;
  },

  attributeToSQL(attribute) {
    if (!_.isPlainObject(attribute)) {
      attribute = {
        type: attribute
      };
    }

    let type;
    if (
      attribute.type instanceof DataTypes.ENUM ||
      (attribute.type instanceof DataTypes.ARRAY && attribute.type.type instanceof DataTypes.ENUM)
    ) {
      type = this._handleEnumAttribute(attribute);
    }

    if (!type) {
      type = attribute.type;
    }

    let sql = type + '';

    sql = this._buildAttributeConstraints(sql, attribute);

    if (attribute.references) {
      sql += this._buildForeignKeyReference(attribute);
    }

    return sql;
  },

  deferConstraintsQuery(options) {
    return options.deferrable.toString(this);
  },

  setConstraintQuery(columns, type) {
    let columnFragment = 'ALL';

    if (columns) {
      columnFragment = columns.map(column => this.quoteIdentifier(column)).join(', ');
    }

    return 'SET CONSTRAINTS ' + columnFragment + ' ' + type;
  },

  setDeferredQuery(columns) {
    return this.setConstraintQuery(columns, 'DEFERRED');
  },

  setImmediateQuery(columns) {
    return this.setConstraintQuery(columns, 'IMMEDIATE');
  },

  attributesToSQL(attributes, options) {
    const result = {};

    for (const key in attributes) {
      const attribute = attributes[key];
      result[attribute.field || key] = this.attributeToSQL(attribute, options);
    }

    return result;
  },

  createTrigger(tableName, triggerName, eventType, fireOnSpec, functionName, functionParams, optionsArray) {
    const decodedEventType = this.decodeTriggerEventType(eventType);
    const eventSpec = this.expandTriggerEventSpec(fireOnSpec);
    const expandedOptions = this.expandOptions(optionsArray);
    const paramList = this.expandFunctionParamList(functionParams);

    return `CREATE ${this.triggerEventTypeIsConstraint(eventType)}TRIGGER ${triggerName}\n`
      + `\t${decodedEventType} ${eventSpec}\n`
      + `\tON ${tableName}\n`
      + `\t${expandedOptions}\n`
      + `\tEXECUTE PROCEDURE ${functionName}(${paramList});`;
  },

  dropTrigger(tableName, triggerName) {
    return `DROP TRIGGER ${triggerName} ON ${tableName} RESTRICT;`;
  },

  renameTrigger(tableName, oldTriggerName, newTriggerName) {
    return `ALTER TRIGGER ${oldTriggerName} ON ${tableName} RENAME TO ${newTriggerName};`;
  },

  createFunction(functionName, params, returnType, language, body, options) {
    if (!functionName || !returnType || !language || !body) throw new Error('createFunction missing some parameters. Did you pass functionName, returnType, language and body?');

    const paramList = this.expandFunctionParamList(params);
    const indentedBody = body.replace('\n', '\n\t');
    const expandedOptions = this.expandOptions(options);

    return `CREATE FUNCTION ${functionName}(${paramList})\n`
      + `RETURNS ${returnType} AS $func$\n`
      + 'BEGIN\n'
      + `\t${indentedBody}\n`
      + 'END;\n'
      + `$func$ language '${language}'${expandedOptions};`;
  },

  dropFunction(functionName, params) {
    if (!functionName) throw new Error('requires functionName');
    const paramList = this.expandFunctionParamList(params);
    return `DROP FUNCTION ${functionName}(${paramList}) RESTRICT;`;
  },

  renameFunction(oldFunctionName, params, newFunctionName) {
    const paramList = this.expandFunctionParamList(params);
    return `ALTER FUNCTION ${oldFunctionName}(${paramList}) RENAME TO ${newFunctionName};`;
  },

  databaseConnectionUri(config) {
    let uri = config.protocol + '://' + config.user + ':' + config.password + '@' + config.host;
    if (config.port) {
      uri += ':' + config.port;
    }
    uri += '/' + config.database;
    if (config.ssl) {
      uri += '?ssl=' + config.ssl;
    }
    return uri;
  },

  pgEscapeAndQuote(val) {
    return this.quoteIdentifier(Utils.removeTicks(this.escape(val), "'"));
  },

  // Build individual function parameter definition
  _buildFunctionParamDef(curParam) {
    const paramDef = [];
    if (_.has(curParam, 'type')) {
      if (_.has(curParam, 'direction')) { paramDef.push(curParam.direction); }
      if (_.has(curParam, 'name')) { paramDef.push(curParam.name); }
      paramDef.push(curParam.type);
    } else {
      throw new Error('function or trigger used with a parameter without any type');
    }
    return paramDef.join(' ');
  },

  expandFunctionParamList(params) {
    if (_.isUndefined(params) || !_.isArray(params)) {
      throw new Error('expandFunctionParamList: function parameters array required, including an empty one for no arguments');
    }

    const paramList = [];
    _.each(params, curParam => {
      const joined = this._buildFunctionParamDef(curParam);
      if (joined) paramList.push(joined);
    });

    return paramList.join(', ');
  },

  expandOptions(options) {
    return _.isUndefined(options) || _.isEmpty(options) ?
      '' : '\n\t' + options.join('\n\t');
  },

  decodeTriggerEventType(eventSpecifier) {
    const EVENT_DECODER = {
      'after': 'AFTER',
      'before': 'BEFORE',
      'instead_of': 'INSTEAD OF',
      'after_constraint': 'AFTER'
    };

    if (!_.has(EVENT_DECODER, eventSpecifier)) {
      throw new Error('Invalid trigger event specified: ' + eventSpecifier);
    }

    return EVENT_DECODER[eventSpecifier];
  },

  triggerEventTypeIsConstraint(eventSpecifier) {
    return eventSpecifier === 'after_constraint' ? 'CONSTRAINT ' : '';
  },

  // Build individual trigger event specification
  _buildTriggerEventSpec(fireValue) {
    const EVENT_MAP = {
      'insert': 'INSERT',
      'update': 'UPDATE',
      'delete': 'DELETE',
      'truncate': 'TRUNCATE'
    };

    if (!_.has(EVENT_MAP, fireValue)) {
      throw new Error('parseTriggerEventSpec: undefined trigger event ' + fireValue);
    }

    let eventSpec = EVENT_MAP[fireValue];
    if (eventSpec === 'UPDATE' && _.isArray(fireValue) && fireValue.length > 0) {
      eventSpec += ' OF ' + fireValue.join(', ');
    }

    return eventSpec;
  },

  expandTriggerEventSpec(fireOnSpec) {
    if (_.isEmpty(fireOnSpec)) {
      throw new Error('no table change events specified to trigger on');
    }

    return _.map(fireOnSpec, (fireValue, fireKey) => {
      return this._buildTriggerEventSpec(fireValue);
    }).join(' OR ');
  },

  pgEnumName(tableName, attr, options) {
    options = options || {};

    const tableDetails = this.extractTableDetails(tableName, options);
    let enumName = Utils.addTicks(Utils.generateEnumName(tableDetails.tableName, attr), '"');

    if (options.schema !== false && tableDetails.schema) {
      enumName = this.quoteIdentifier(tableDetails.schema) + tableDetails.delimiter + enumName;
    }

    return enumName;
  },

  pgListEnums(tableName, attrName, options) {
    let enumName = '';
    const tableDetails = this.extractTableDetails(tableName, options);

    if (tableDetails.tableName && attrName) {
      enumName = ' AND t.typname=' + this.pgEnumName(tableDetails.tableName, attrName, { schema: false }).replace(/"/g, "'");
    }

    return 'SELECT t.typname enum_name, array_agg(e.enumlabel ORDER BY enumsortorder) enum_value FROM pg_type t ' +
      'JOIN pg_enum e ON t.oid = e.enumtypid ' +
      'JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace ' +
      `WHERE n.nspname = '${tableDetails.schema}'${enumName} GROUP BY 1`;
  },

  pgEnum(tableName, attr, dataType, options) {
    const enumName = this.pgEnumName(tableName, attr, options);
    let values;

    if (dataType.values) {
      values = "ENUM('" + dataType.values.join("', '") + "')";
    } else {
      values = dataType.toString().match(/^ENUM\(.+\)/)[0];
    }

    let sql = 'CREATE TYPE ' + enumName + ' AS ' + values + ';';
    if (!!options && options.force === true) {
      sql = this.pgEnumDrop(tableName, attr) + sql;
    }
    return sql;
  },

  pgEnumAdd(tableName, attr, value, options) {
    const enumName = this.pgEnumName(tableName, attr);
    let sql = 'ALTER TYPE ' + enumName + ' ADD VALUE ';

    if (semver.gte(this.sequelize.options.databaseVersion, '9.3.0')) {
      sql += 'IF NOT EXISTS ';
    }
    sql += this.escape(value);

    if (options.before) {
      sql += ' BEFORE ' + this.escape(options.before);
    } else if (options.after) {
      sql += ' AFTER ' + this.escape(options.after);
    }

    return sql;
  },

  pgEnumDrop(tableName, attr, enumName) {
    enumName = enumName || this.pgEnumName(tableName, attr);
    return 'DROP TYPE IF EXISTS ' + enumName + '; ';
  },

  fromArray(text) {
    text = text.replace(/^{/, '').replace(/}$/, '');
    let matches = text.match(/("(?:\\.|[^"\\\\])*"|[^,]*)(?:\s*,\s*|\s*$)/ig);

    if (matches.length < 1) {
      return [];
    }

    matches = matches.map(m => m.replace(/",$/, '').replace(/,$/, '').replace(/(^"|"$)/, ''));

    return matches.slice(0, -1);
  },

  padInt(i) {
    return i < 10 ? '0' + i.toString() : i.toString();
  },

  // Handle SERIAL type conversion
  _handleSerialType(dataType) {
    if (_.includes(dataType, 'BIGINT')) {
      dataType = dataType.replace(/SERIAL/, 'BIGSERIAL');
      dataType = dataType.replace(/BIGINT/, '');
    } else if (_.includes(dataType, 'SMALLINT')) {
      dataType = dataType.replace(/SERIAL/, 'SMALLSERIAL');
      dataType = dataType.replace(/SMALLINT/, '');
    } else {
      dataType = dataType.replace(/INTEGER/, '');
    }
    dataType = dataType.replace(/NOT NULL/, '');
    return dataType;
  },

  dataTypeMapping(tableName, attr, dataType) {
    if (_.includes(dataType, 'PRIMARY KEY')) {
      dataType = dataType.replace(/PRIMARY KEY/, '');
    }

    if (_.includes(dataType, 'SERIAL')) {
      dataType = this._handleSerialType(dataType);
    }

    if (dataType.match(/^ENUM\(/)) {
      dataType = dataType.replace(/^ENUM\(.+\)/, this.pgEnumName(tableName, attr));
    }

    return dataType;
  },

  quoteIdentifier(identifier, force) {
    if (identifier === '*') return identifier;
    if (!force && this.options && this.options.quoteIdentifiers === false && identifier.indexOf('.') === -1 && identifier.indexOf('->') === -1) {
      return Utils.removeTicks(identifier, '"');
    } else {
      return Utils.addTicks(Utils.removeTicks(identifier, '"'), '"');
    }
  },

  /**
   * Generates an SQL query that returns all foreign keys of a table.
   *
   * @param  {String} tableName  The name of the table.
   * @return {String}            The generated sql query.
   * @private
   */
  getForeignKeysQuery(tableName) {
    return 'SELECT conname as constraint_name, pg_catalog.pg_get_constraintdef(r.oid, true) as condef FROM pg_catalog.pg_constraint r ' +
      `WHERE r.conrelid = (SELECT oid FROM pg_class WHERE relname = '${tableName}' LIMIT 1) AND r.contype = 'f' ORDER BY 1;`;
  },

  /**
   * Generate common SQL prefix for getForeignKeyReferencesQuery.
   * @returns {String}
   */
  _getForeignKeyReferencesQueryPrefix() {
    return 'SELECT ' +
        'DISTINCT tc.constraint_name as constraint_name, ' +
        'tc.constraint_schema as constraint_schema, ' +
        'tc.constraint_catalog as constraint_catalog, ' +
        'tc.table_name as table_name,' +
        'tc.table_schema as table_schema,' +
        'tc.table_catalog as table_catalog,' +
        'kcu.column_name as column_name,' +
        'ccu.table_schema  AS referenced_table_schema,' +
        'ccu.table_catalog  AS referenced_table_catalog,' +
        'ccu.table_name  AS referenced_table_name,' +
        'ccu.column_name AS referenced_column_name ' +
      'FROM information_schema.table_constraints AS tc ' +
        'JOIN information_schema.key_column_usage AS kcu ' +
          'ON tc.constraint_name = kcu.constraint_name ' +
        'JOIN information_schema.constraint_column_usage AS ccu ' +
          'ON ccu.constraint_name = tc.constraint_name ';
  },

  /**
   * Generates an SQL query that returns all foreign keys details of a table.
   *
   * As for getForeignKeysQuery is not compatible with getForeignKeyReferencesQuery, so add a new function.
   * @param {String} tableName
   * @param {String} catalogName
   * @param {String} schemaName
   */
  getForeignKeyReferencesQuery(tableName, catalogName, schemaName) {
    return this._getForeignKeyReferencesQueryPrefix() +
      `WHERE constraint_type = 'FOREIGN KEY' AND tc.table_name = '${tableName}'` +
      (catalogName ? ` AND tc.table_catalog = '${catalogName}'` : '') +
      (schemaName ? ` AND tc.table_schema = '${schemaName}'` : '');
  },

  getForeignKeyReferenceQuery(table, columnName) {
    const tableName = table.tableName || table;
    const schema = table.schema;
    return this._getForeignKeyReferencesQueryPrefix() +
      `WHERE constraint_type = 'FOREIGN KEY' AND tc.table_name='${tableName}' AND  kcu.column_name = '${columnName}'` +
      (schema ? ` AND tc.table_schema = '${schema}'` : '');
  },

  /**
   * Generates an SQL query that removes a foreign key from a table.
   *
   * @param  {String} tableName  The name of the table.
   * @param  {String} foreignKey The name of the foreign key constraint.
   * @return {String}            The generated sql query.
   * @private
   */
  dropForeignKeyQuery(tableName, foreignKey) {
    return 'ALTER TABLE ' + this.quoteTable(tableName) + ' DROP CONSTRAINT ' + this.quoteIdentifier(foreignKey) + ';';
  },

  setAutocommitQuery(value, options) {
    if (options.parent) {
      return;
    }

    if (!value || semver.gte(this.sequelize.options.databaseVersion, '9.4.0')) {
      return;
    }

    return AbstractQueryGenerator.setAutocommitQuery.call(this, value, options);
  }
};

module.exports = QueryGenerator;
```