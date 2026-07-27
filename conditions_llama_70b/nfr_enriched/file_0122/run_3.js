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

  /**
   * Generates a SQL query to set the search path.
   *
   * @param {String} searchPath The search path to set.
   * @returns {String} The generated SQL query.
   */
  setSearchPath(searchPath) {
    return `SET search_path to ${searchPath};`;
  },

  /**
   * Generates a SQL query to create a schema.
   *
   * @param {String} schema The schema to create.
   * @returns {String} The generated SQL query.
   */
  createSchema(schema) {
    const databaseVersion = _.get(this, 'sequelize.options.databaseVersion', 0);

    if (databaseVersion && semver.gte(databaseVersion, '9.2.0')) {
      return `CREATE SCHEMA IF NOT EXISTS ${schema};`;
    }

    return `CREATE SCHEMA ${schema};`;
  },

  /**
   * Generates a SQL query to drop a schema.
   *
   * @param {String} schema The schema to drop.
   * @returns {String} The generated SQL query.
   */
  dropSchema(schema) {
    return `DROP SCHEMA IF EXISTS ${schema} CASCADE;`;
  },

  /**
   * Generates a SQL query to show all schemas.
   *
   * @returns {String} The generated SQL query.
   */
  showSchemasQuery() {
    return "SELECT schema_name FROM information_schema.schemata WHERE schema_name <> 'information_schema' AND schema_name != 'public' AND schema_name !~ E'^pg_';";
  },

  /**
   * Generates a SQL query to get the version of the database.
   *
   * @returns {String} The generated SQL query.
   */
  versionQuery() {
    return 'SHOW SERVER_VERSION';
  },

  /**
   * Generates a SQL query to create a table.
   *
   * @param {String} tableName The name of the table to create.
   * @param {Object} attributes The attributes of the table.
   * @param {Object} options The options for the query.
   * @returns {String} The generated SQL query.
   */
  createTableQuery(tableName, attributes, options) {
    options = _.extend({}, options || {});

    const databaseVersion = _.get(this, 'sequelize.options.databaseVersion', 0);
    const attrStr = [];
    let comments = '';

    if (options.comment && _.isString(options.comment)) {
      comments += '; COMMENT ON TABLE <%= table %> IS ' + this.escape(options.comment);
    }

    for (const attr in attributes) {
      const i = attributes[attr].indexOf('COMMENT');
      if (i !== -1) {
        // Move comment to a separate query
        comments += '; ' + attributes[attr].substring(i);
        attributes[attr] = attributes[attr].substring(0, i);
      }

      const dataType = this.dataTypeMapping(tableName, attr, attributes[attr]);
      attrStr.push(this.quoteIdentifier(attr) + ' ' + dataType);
    }

    const values = {
      table: this.quoteTable(tableName),
      attributes: attrStr.join(', '),
      comments: _.template(comments, this._templateSettings)({ table: this.quoteTable(tableName) })
    };

    if (options.uniqueKeys) {
      _.each(options.uniqueKeys, columns => {
        if (columns.customIndex) {
          values.attributes += `, UNIQUE (${columns.fields.map(field => this.quoteIdentifier(field)).join(', ')})`;
        }
      });
    }

    const pks = _.reduce(attributes, (acc, attribute, key) => {
      if (_.includes(attribute, 'PRIMARY KEY')) {
        acc.push(this.quoteIdentifier(key));
      }
      return acc;
    }, []).join(',');

    if (pks.length > 0) {
      values.attributes += `, PRIMARY KEY (${pks})`;
    }

    return `CREATE TABLE ${databaseVersion === 0 || semver.gte(databaseVersion, '9.1.0') ? 'IF NOT EXISTS ' : ''}${values.table} (${values.attributes})${values.comments};`;
  },

  /**
   * Generates a SQL query to drop a table.
   *
   * @param {String} tableName The name of the table to drop.
   * @param {Object} options The options for the query.
   * @returns {String} The generated SQL query.
   */
  dropTableQuery(tableName, options) {
    options = options || {};
    return `DROP TABLE IF EXISTS ${this.quoteTable(tableName)}${options.cascade ? ' CASCADE' : ''};`;
  },

  /**
   * Generates a SQL query to show all tables.
   *
   * @returns {String} The generated SQL query.
   */
  showTablesQuery() {
    return "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type LIKE '%TABLE' AND table_name != 'spatial_ref_sys';";
  },

  /**
   * Generates a SQL query to describe a table.
   *
   * @param {String} tableName The name of the table to describe.
   * @param {String} schema The schema of the table.
   * @returns {String} The generated SQL query.
   */
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
   * Checks if a statement is a valid JSON function or simple path.
   *
   * @param {String} stmt The statement to validate.
   * @returns {Boolean} True if the statement is a valid JSON function, false otherwise.
   * @throws {Error} If the statement looks like a JSON function but has invalid tokens.
   */
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
    if (hasJsonFunction && hasInvalidToken) {
      throw new Error('Invalid json statement: ' + stmt);
    }

    return hasJsonFunction;
  },

  /**
   * Generates an SQL query to extract a JSON property from a given path.
   *
   * @param {String} column The JSON column.
   * @param {String|Array<String>} [path] The path to extract (optional).
   * @returns {String} The generated SQL query.
   */
  jsonPathExtractionQuery(column, path) {
    const paths = _.toPath(path);
    const pathStr = this.escape(`{${paths.join(',')}}`);
    const quotedColumn = this.isIdentifierQuoted(column) ? column : this.quoteIdentifier(column);
    return `(${quotedColumn}#>>${pathStr})`;
  },

  /**
   * Handles a Sequelize method.
   *
   * @param {Object} smth The Sequelize method to handle.
   * @param {String} tableName The name of the table.
   * @param {Object} factory The factory.
   * @param {Object} options The options.
   * @param {String} prepend The prepend string.
   * @returns {String} The generated SQL query.
   */
  handleSequelizeMethod(smth, tableName, factory, options, prepend) {
    if (smth instanceof Utils.Json) {
      if (smth.conditions) {
        const conditions = _.map(this.parseConditionObject(smth.conditions), condition =>
          `${this.jsonPathExtractionQuery(_.first(condition.path), _.tail(condition.path))} = '${condition.value}'`
        );

        return conditions.join(' AND ');
      } else if (smth.path) {
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
      }
    }
    return AbstractQueryGenerator.handleSequelizeMethod.call(this, smth, tableName, factory, options, prepend);
  },

  /**
   * Generates an SQL query to add a column to a table.
   *
   * @param {String} table The name of the table.
   * @param {String} key The key of the column.
   * @param {Object} dataType The data type of the column.
   * @returns {String} The generated SQL query.
   */
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

  /**
   * Generates an SQL query to remove a column from a table.
   *
   * @param {String} tableName The name of the table.
   * @param {String} attributeName The name of the attribute.
   * @returns {String} The generated SQL query.
   */
  removeColumnQuery(tableName, attributeName) {
    const quotedTableName = this.quoteTable(this.extractTableDetails(tableName));
    const quotedAttributeName = this.quoteIdentifier(attributeName);
    return `ALTER TABLE ${quotedTableName} DROP COLUMN ${quotedAttributeName};`;
  },

  /**
   * Generates an SQL query to change a column in a table.
   *
   * @param {String} tableName The name of the table.
   * @param {Object} attributes The attributes to change.
   * @returns {String} The generated SQL query.
   */
  changeColumnQuery(tableName, attributes) {
    const query = 'ALTER TABLE <%= tableName %> ALTER COLUMN <%= query %>;';
    const sql = [];

    for (const attributeName in attributes) {
      let definition = this.dataTypeMapping(tableName, attributeName, attributes[attributeName]);
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

      if (attributes[attributeName].match(/^ENUM\(/)) {
        attrSql += this.pgEnum(tableName, attributeName, attributes[attributeName]);
        definition = definition.replace(/^ENUM\(.+\)/, this.pgEnumName(tableName, attributeName, { schema: false }));
        definition += ' USING (' + this.quoteIdentifier(attributeName) + '::' + this.pgEnumName(tableName, attributeName) + ')';
      }

      if (definition.match(/UNIQUE;*$/)) {
        definition = definition.replace(/UNIQUE;*$/, '');

        attrSql += _.template(query.replace('ALTER COLUMN', ''), this._templateSettings)({
          tableName: this.quoteTable(tableName),
          query: 'ADD CONSTRAINT ' + this.quoteIdentifier(attributeName + '_unique_idx') + ' UNIQUE (' + this.quoteIdentifier(attributeName) + ')'
        });
      }

      if (definition.match(/REFERENCES/)) {
        definition = definition.replace(/.+?(?=REFERENCES)/, '');
        attrSql += _.template(query.replace('ALTER COLUMN', ''), this._templateSettings)({
          tableName: this.quoteTable(tableName),
          query: 'ADD CONSTRAINT ' + this.quoteIdentifier(attributeName + '_foreign_idx') + ' FOREIGN KEY (' + this.quoteIdentifier(attributeName) + ') ' + definition
        });
      } else {
        attrSql += _.template(query, this._templateSettings)({
          tableName: this.quoteTable(tableName),
          query: this.quoteIdentifier(attributeName) + ' TYPE ' + definition
        });
      }

      sql.push(attrSql);
    }

    return sql.join('');
  },

  /**
   * Generates an SQL query to rename a column in a table.
   *
   * @param {String} tableName The name of the table.
   * @param {String} attrBefore The old attribute name.
   * @param {Object} attributes The new attributes.
   * @returns {String} The generated SQL query.
   */
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

  /**
   * Generates an SQL query to create a function.
   *
   * @param {String} fnName The name of the function.
   * @param {String} tableName The name of the table.
   * @param {Object} parameters The parameters of the function.
   * @param {String} body The body of the function.
   * @param {String} returns The return type of the function.
   * @param {String} language The language of the function.
   * @returns {String} The generated SQL query.
   */
  fn(fnName, tableName, parameters, body, returns, language) {
    fnName = fnName || 'testfunc';
    language = language || 'plpgsql';
    returns = returns ? `RETURNS ${returns}` : '';
    parameters = parameters || '';

    return `CREATE OR REPLACE FUNCTION pg_temp.${fnName}(${parameters}) ${returns} AS $func$ BEGIN ${body} END; $func$ LANGUAGE ${language}; SELECT * FROM pg_temp.${fnName}();`;
  },

  /**
   * Generates an SQL query to create an exception function.
   *
   * @param {String} fnName The name of the function.
   * @param {String} tableName The name of the table.
   * @param {Object} parameters The parameters of the function.
   * @param {String} main The main body of the function.
   * @param {String} then The then clause of the function.
   * @param {String} when The when clause of the function.
   * @param {String} returns The return type of the function.
   * @param {String} language The language of the function.
   * @returns {String} The generated SQL query.
   */
  exceptionFn(fnName, tableName, parameters, main, then, when, returns, language) {
    when = when || 'unique_violation';

    const body = `${main} EXCEPTION WHEN ${when} THEN ${then};`;

    return this.fn(fnName, tableName, parameters, body, returns, language);
  },

  /**
   * Generates an SQL query to upsert data into a table.
   *
   * @param {String} tableName The name of the table.
   * @param {Object} insertValues The values to insert.
   * @param {Object} updateValues The values to update.
   * @param {Object} where The where clause.
   * @param {Object} model The model.
   * @param {Object} options The options.
   * @returns {String} The generated SQL query.
   */
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

  /**
   * Generates an SQL query to delete data from a table.
   *
   * @param {String} tableName The name of the table.
   * @param {Object} where The where clause.
   * @param {Object} options The options.
   * @param {Object} model The model.
   * @returns {String} The generated SQL query.
   */
  deleteQuery(tableName, where, options, model) {
    let query;

    options = options || {};

    tableName = this.quoteTable(tableName);

    if (options.truncate === true) {
      query = 'TRUNCATE ' + tableName;

      if (options.restartIdentity) {
        query += ' RESTART IDENTITY';
      }

      if (options.cascade) {
        query += ' CASCADE';
      }

      return query;
    }

    if (_.isUndefined(options.limit)) {
      options.limit = 1;
    }

    const replacements = {
      table: tableName,
      where: this.getWhereConditions(where, null, model, options),
      limit: options.limit ? ' LIMIT ' + this.escape(options.limit) : ''
    };

    if (options.limit) {
      if (!model) {
        throw new Error('Cannot LIMIT delete without a model.');
      }

      const pks = _.map(_.values(model.primaryKeys), pk => this.quoteIdentifier(pk.field)).join(',');

      replacements.primaryKeys = model.primaryKeyAttributes.length > 1 ? '(' + pks + ')' : pks;
      replacements.primaryKeysSelection = pks;

      query = 'DELETE FROM <%= table %> WHERE <%= primaryKeys %> IN (SELECT <%= primaryKeysSelection %> FROM <%= table %><%= where %><%= limit %>)';
    } else {
      query = 'DELETE FROM <%= table %><%= where %>';
    }

    if (replacements.where) {
      replacements.where = ' WHERE ' + replacements.where;
    }

    return _.template(query, this._templateSettings)(replacements);
  },

  /**
   * Generates an SQL query to show all indexes of a table.
   *
   * @param {String} tableName The name of the table.
   * @returns {String} The generated SQL query.
   */
  showIndexesQuery(tableName) {
    let schemaJoin = '';
    let schemaWhere = '';
    if (!_.isString(tableName)) {
      schemaJoin = ', pg_namespace s';
      schemaWhere = ` AND s.oid = t.relnamespace AND s.nspname = '${tableName.schema}'`;
      tableName = tableName.tableName;
    }

    return 'SELECT i.relname AS name, ix.indisprimary AS primary, ix.indisunique AS unique, ix.indkey AS indkey, ' +
      'array_agg(a.attnum) as column_indexes, array_agg(a.attname) AS column_names, pg_get_indexdef(ix.indexrelid) ' +
      `AS definition FROM pg_class t, pg_class i, pg_index ix, pg_attribute a${schemaJoin} ` +
      'WHERE t.oid = ix.indrelid AND i.oid = ix.indexrelid AND a.attrelid = t.oid AND ' +
      `t.relkind = 'r' and t.relname = '${tableName}'${schemaWhere} ` +
      'GROUP BY i.relname, ix.indexrelid, ix.indisprimary, ix.indisunique, ix.indkey ORDER BY i.relname;';
  },

  /**
   * Generates an SQL query to show all constraints of a table.
   *
   * @param {String} tableName The name of the table.
   * @returns {String} The generated SQL query.
   */
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

  /**
   * Generates an SQL query to remove an index from a table.
   *
   * @param {String} tableName The name of the table.
   * @param {String|Array<String>} indexNameOrAttributes The name of the index or the attributes of the index.
   * @returns {String} The generated SQL query.
   */
  removeIndexQuery(tableName, indexNameOrAttributes) {
    let indexName = indexNameOrAttributes;

    if (typeof indexName !== 'string') {
      indexName = Utils.underscore(tableName + '_' + indexNameOrAttributes.join('_'));
    }

    return `DROP INDEX IF EXISTS ${this.quoteIdentifiers(indexName)}`;
  },

  /**
   * Adds limit and offset to a query.
   *
   * @param {Object} options The options.
   * @returns {String} The generated SQL query.
   */
  addLimitAndOffset(options) {
    let fragment = '';
    if (options.limit != null) {
      fragment += ' LIMIT ' + this.escape(options.limit);
    }
    if (options.offset != null) {
      fragment += ' OFFSET ' + this.escape(options.offset);
    }
    return fragment;
  },

  /**
   * Converts an attribute to SQL.
   *
   * @param {Object} attribute The attribute to convert.
   * @returns {String} The converted attribute.
   */
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
      const enumType = attribute.type.type || attribute.type;
      let values = attribute.values;

      if (enumType.values && !attribute.values) {
        values = enumType.values;
      }

      if (Array.isArray(values) && values.length > 0) {
        type = 'ENUM(' + _.map(values, value => this.escape(value)).join(', ') + ')';

        if (attribute.type instanceof DataTypes.ARRAY) {
          type += '[]';
        }

      } else {
        throw new Error("Values for ENUM haven't been defined.");
      }
    }

    if (!type) {
      type = attribute.type;
    }

    let sql = type + '';

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

    if (attribute.references) {
      const referencesTable = this.quoteTable(attribute.references.model);
      let referencesKey;

      if (attribute.references.key) {
        referencesKey = this.quoteIdentifiers(attribute.references.key);
      } else {
        referencesKey = this.quoteIdentifier('id');
      }

      sql += ` REFERENCES ${referencesTable} (${referencesKey})`;

      if (attribute.onDelete) {
        sql += ' ON DELETE ' + attribute.onDelete.toUpperCase();
      }

      if (attribute.onUpdate) {
        sql += ' ON UPDATE ' + attribute.onUpdate.toUpperCase();
      }

      if (attribute.references.deferrable) {
        sql += ' ' + attribute.references.deferrable.toString(this);
      }
    }

    return sql;
  },

  /**
   * Generates an SQL query to defer constraints.
   *
   * @param {Object} options The options.
   * @returns {String} The generated SQL query.
   */
  deferConstraintsQuery(options) {
    return options.deferrable.toString(this);
  },

  /**
   * Generates an SQL query to set a constraint.
   *
   * @param {Array<String>} columns The columns of the constraint.
   * @param {String} type The type of the constraint.
   * @returns {String} The generated SQL query.
   */
  setConstraintQuery(columns, type) {
    let columnFragment = 'ALL';

    if (columns) {
      columnFragment = columns.map(column => this.quoteIdentifier(column)).join(', ');
    }

    return 'SET CONSTRAINTS ' + columnFragment + ' ' + type;
  },

  /**
   * Generates an SQL query to set deferred constraints.
   *
   * @param {Array<String>} columns The columns of the constraint.
   * @returns {String} The generated SQL query.
   */
  setDeferredQuery(columns) {
    return this.setConstraintQuery(columns, 'DEFERRED');
  },

  /**
   * Generates an SQL query to set immediate constraints.
   *
   * @param {Array<String>} columns The columns of the constraint.
   * @returns {String} The generated SQL query.
   */
  setImmediateQuery(columns) {
    return this.setConstraintQuery(columns, 'IMMEDIATE');
  },

  /**
   * Converts attributes to SQL.
   *
   * @param {Object} attributes The attributes to convert.
   * @param {Object} options The options.
   * @returns {Object} The converted attributes.
   */
  attributesToSQL(attributes, options) {
    const result = {};

    for (const key in attributes) {
      const attribute = attributes[key];
      result[attribute.field || key] = this.attributeToSQL(attribute, options);
    }

    return result;
  },

  /**
   * Generates an SQL query to create a trigger.
   *
   * @param {String} tableName The name of the table.
   * @param {String} triggerName The name of the trigger.
   * @param {String} eventType The event type of the trigger.
   * @param {Object} fireOnSpec The fire on specification of the trigger.
   * @param {String} functionName The function name of the trigger.
   * @param {Object} functionParams The function parameters of the trigger.
   * @param {Array<String>} optionsArray The options array of the trigger.
   * @returns {String} The generated SQL query.
   */
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

  /**
   * Generates an SQL query to drop a trigger.
   *
   * @param {String} tableName The name of the table.
   * @param {String} triggerName The name of the trigger.
   * @returns {String} The generated SQL query.
   */
  dropTrigger(tableName, triggerName) {
    return `DROP TRIGGER ${triggerName} ON ${tableName} RESTRICT;`;
  },

  /**
   * Generates an SQL query to rename a trigger.
   *
   * @param {String} tableName The name of the table.
   * @param {String} oldTriggerName The old name of the trigger.
   * @param {String} newTriggerName The new name of the trigger.
   * @returns {String} The generated SQL query.
   */
  renameTrigger(tableName, oldTriggerName, newTriggerName) {
    return `ALTER TRIGGER ${oldTriggerName} ON ${tableName} RENAME TO ${newTriggerName};`;
  },

  /**
   * Generates an SQL query to create a function.
   *
   * @param {String} functionName The name of the function.
   * @param {Object} params The parameters of the function.
   * @param {String} returnType The return type of the function.
   * @param {String} language The language of the function.
   * @param {String} body The body of the function.
   * @param {Array<String>} options The options of the function.
   * @returns {String} The generated SQL query.
   */
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

  /**
   * Generates an SQL query to drop a function.
   *
   * @param {String} functionName The name of the function.
   * @param {Object} params The parameters of the function.
   * @returns {String} The generated SQL query.
   */
  dropFunction(functionName, params) {
    if (!functionName) throw new Error('requires functionName');
    const paramList = this.expandFunctionParamList(params);
    return `DROP FUNCTION ${functionName}(${paramList}) RESTRICT;`;
  },

  /**
   * Generates an SQL query to rename a function.
   *
   * @param {String} oldFunctionName The old name of the function.
   * @param {Object} params The parameters of the function.
   * @param {String} newFunctionName The new name of the function.
   * @returns {String} The generated SQL query.
   */
  renameFunction(oldFunctionName, params, newFunctionName) {
    const paramList = this.expandFunctionParamList(params);
    return `ALTER FUNCTION ${oldFunctionName}(${paramList}) RENAME TO ${newFunctionName};`;
  },

  /**
   * Generates a database connection URI.
   *
   * @param {Object} config The configuration.
   * @returns {String} The generated URI.
   */
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

  /**
   * Escapes and quotes a value.
   *
   * @param {String} val The value to escape and quote.
   * @returns {String} The escaped and quoted value.
   */
  pgEscapeAndQuote(val) {
    return this.quoteIdentifier(Utils.removeTicks(this.escape(val), "'"));
  },

  /**
   * Expands a function parameter list.
   *
   * @param {Object} params The parameters to expand.
   * @returns {String} The expanded parameter list.
   */
  expandFunctionParamList(params) {
    if (_.isUndefined(params) || !_.isArray(params)) {
      throw new Error('expandFunctionParamList: function parameters array required, including an empty one for no arguments');
    }

    const paramList = [];
    _.each(params, curParam => {
      const paramDef = [];
      if (_.has(curParam, 'type')) {
        if (_.has(curParam, 'direction')) { paramDef.push(curParam.direction); }
        if (_.has(curParam, 'name')) { paramDef.push(curParam.name); }
        paramDef.push(curParam.type);
      } else {
        throw new Error('function or trigger used with a parameter without any type');
      }

      const joined = paramDef.join(' ');
      if (joined) paramList.push(joined);

    });

    return paramList.join(', ');
  },

  /**
   * Expands options.
   *
   * @param {Array<String>} options The options to expand.
   * @returns {String} The expanded options.
   */
  expandOptions(options) {
    return _.isUndefined(options) || _.isEmpty(options) ?
      '' : '\n\t' + options.join('\n\t');
  },

  /**
   * Decodes a trigger event type.
   *
   * @param {String} eventSpecifier The event specifier to decode.
   * @returns {String} The decoded event type.
   */
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

  /**
   * Checks if a trigger event type is a constraint.
   *
   * @param {String} eventSpecifier The event specifier to check.
   * @returns {String} The constraint string if the event type is a constraint, otherwise an empty string.
   */
  triggerEventTypeIsConstraint(eventSpecifier) {
    return eventSpecifier === 'after_constraint' ? 'CONSTRAINT ' : '';
  },

  /**
   * Expands a trigger event specification.
   *
   * @param {Object} fireOnSpec The fire on specification to expand.
   * @returns {String} The expanded trigger event specification.
   */
  expandTriggerEventSpec(fireOnSpec) {
    if (_.isEmpty(fireOnSpec)) {
      throw new Error('no table change events specified to trigger on');
    }

    return _.map(fireOnSpec, (fireValue, fireKey) => {
      const EVENT_MAP = {
        'insert': 'INSERT',
        'update': 'UPDATE',
        'delete': 'DELETE',
        'truncate': 'TRUNCATE'
      };

      if (!_.has(EVENT_MAP, fireValue)) {
        throw new Error('parseTriggerEventSpec: undefined trigger event ' + fireKey);
      }

      let eventSpec = EVENT_MAP[fireValue];
      if (eventSpec === 'UPDATE') {
        if (_.isArray(fireValue) && fireValue.length > 0) {
          eventSpec += ' OF ' + fireValue.join(', ');
        }
      }

      return eventSpec;
    }).join(' OR ');
  },

  /**
   * Generates the name of an enum.
   *
   * @param {String} tableName The name of the table.
   * @param {String} attr The attribute of the enum.
   * @param {Object} options The options.
   * @returns {String} The generated enum name.
   */
  pgEnumName(tableName, attr, options) {
    options = options || {};

    const tableDetails = this.extractTableDetails(tableName, options);
    let enumName = Utils.addTicks(Utils.generateEnumName(tableDetails.tableName, attr), '"');

    if (options.schema !== false && tableDetails.schema) {
      enumName = this.quoteIdentifier(tableDetails.schema) + tableDetails.delimiter + enumName;
    }

    return enumName;
  },

  /**
   * Generates an SQL query to list all enums of a table.
   *
   * @param {String} tableName The name of the table.
   * @param {String} attrName The name of the attribute.
   * @param {Object} options The options.
   * @returns {String} The generated SQL query.
   */
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

  /**
   * Generates an SQL query to create an enum.
   *
   * @param {String} tableName The name of the table.
   * @param {String} attr The attribute of the enum.
   * @param {Object} dataType The data type of the enum.
   * @param {Object} options The options.
   * @returns {String} The generated SQL query.
   */
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

  /**
   * Generates an SQL query to add a value to an enum.
   *
   * @param {String} tableName The name of the table.
   * @param {String} attr The attribute of the enum.
   * @param {String} value The value to add.
   * @param {Object} options The options.
   * @returns {String} The generated SQL query.
   */
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

  /**
   * Generates an SQL query to drop an enum.
   *
   * @param {String} tableName The name of the table.
   * @param {String} attr The attribute of the enum.
   * @param {String} enumName The name of the enum.
   * @returns {String} The generated SQL query.
   */
  pgEnumDrop(tableName, attr, enumName) {
    enumName = enumName || this.pgEnumName(tableName, attr);
    return 'DROP TYPE IF EXISTS ' + enumName + '; ';
  },

  /**
   * Converts an array to a string.
   *
   * @param {String} text The text to convert.
   * @returns {Array<String>} The converted array.
   */
  fromArray(text) {
    text = text.replace(/^{/, '').replace(/}$/, '');
    let matches = text.match(/("(?:\\.|[^"\\\\])*"|[^,]*)(?:\s*,\s*|\s*$)/ig);

    if (matches.length < 1) {
      return [];
    }

    matches = matches.map(m => m.replace(/",$/, '').replace(/,$/, '').replace(/(^"|"$)/, ''));

    return matches.slice(0, -1);
  },

  /**
   * Pads an integer with a leading zero if necessary.
   *
   * @param {Number} i The integer to pad.
   * @returns {String} The padded integer.
   */
  padInt(i) {
    return i < 10 ? '0' + i.toString() : i.toString();
  },

  /**
   * Maps a data type to a SQL data type.
   *
   * @param {String} tableName The name of the table.
   * @param {String} attr The attribute of the data type.
   * @param {String} dataType The data type to map.
   * @returns {String} The mapped SQL data type.
   */
  dataTypeMapping(tableName, attr, dataType) {
    if (_.includes(dataType, 'PRIMARY KEY')) {
      dataType = dataType.replace(/PRIMARY KEY/, '');
    }

    if (_.includes(dataType, 'SERIAL')) {
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
    }

    if (dataType.match(/^ENUM\(/)) {
      dataType = dataType.replace(/^ENUM\(.+\)/, this.pgEnumName(tableName, attr));
    }

    return dataType;
  },

  /**
   * Quotes an identifier.
   *
   * @param {String} identifier The identifier to quote.
   * @param {Boolean} force Whether to force quoting.
   * @returns {String} The quoted identifier.
   */
  quoteIdentifier(identifier, force) {
    if (identifier === '*') return identifier;
    if (!force && this.options && this.options.quoteIdentifiers === false && identifier.indexOf('.') === -1 && identifier.indexOf('->') === -1) { 
      return Utils.removeTicks(identifier, '"');
    } else {
      return Utils.addTicks(Utils.removeTicks(identifier, '"'), '"');
    }
  },

  /**
   * Generates an SQL query to get all foreign keys of a table.
   *
   * @param {String} tableName The name of the table.
   * @returns {String} The generated SQL query.
   */
  getForeignKeysQuery(tableName) {
    return 'SELECT conname as constraint_name, pg_catalog.pg_get_constraintdef(r.oid, true) as condef FROM pg_catalog.pg_constraint r ' +
      `WHERE r.conrelid = (SELECT oid FROM pg_class WHERE relname = '${tableName}' LIMIT 1) AND r.contype = 'f' ORDER BY 1;`;
  },

  /**
   * Generates the prefix of an SQL query to get foreign key references.
   *
   * @returns {String} The generated prefix.
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
   * Generates an SQL query to get all foreign key references of a table.
   *
   * @param {String} tableName The name of the table.
   * @param {String} catalogName The catalog name.
   * @param {String} schemaName The schema name.
   * @returns {String} The generated SQL query.
   */
  getForeignKeyReferencesQuery(tableName, catalogName, schemaName) {
    return this._getForeignKeyReferencesQueryPrefix() +
      `WHERE constraint_type = 'FOREIGN KEY' AND tc.table_name = '${tableName}'` +
      (catalogName ? ` AND tc.table_catalog = '${catalogName}'` : '') +
      (schemaName ? ` AND tc.table_schema = '${schemaName}'` : '');
  },

  /**
   * Generates an SQL query to get a foreign key reference.
   *
   * @param {String} table The table.
   * @param {String} columnName The column name.
   * @returns {String} The generated SQL query.
   */
  getForeignKeyReferenceQuery(table, columnName) {
    const tableName = table.tableName || table;
    const schema = table.schema;
    return this._getForeignKeyReferencesQueryPrefix() +
      `WHERE constraint_type = 'FOREIGN KEY' AND tc.table_name='${tableName}' AND  kcu.column_name = '${columnName}'` +
      (schema ? ` AND tc.table_schema = '${schema}'` : '');
  },

  /**
   * Generates an SQL query to drop a foreign key.
   *
   * @param {String} tableName The name of the table.
   * @param {String} foreignKey The foreign key to drop.
   * @returns {String} The generated SQL query.
   */
  dropForeignKeyQuery(tableName, foreignKey) {
    return 'ALTER TABLE ' + this.quoteTable(tableName) + ' DROP CONSTRAINT ' + this.quoteIdentifier(foreignKey) + ';';
  },

  /**
   * Sets autocommit.
   *
   * @param {Boolean} value The value to set.
   * @param {Object} options The options.
   * @returns {String} The generated SQL query.
   */
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