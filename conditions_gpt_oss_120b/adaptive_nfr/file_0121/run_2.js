'use strict';

const _ = require('lodash');
const Utils = require('../../utils');
const DataTypes = require('../../data-types');
const TableHints = require('../../table-hints');
const AbstractQueryGenerator = require('../abstract/query-generator');
const randomBytes = require('crypto').randomBytes;
const semver = require('semver');

const Op = require('../../operators');

/* istanbul ignore next */
function throwMethodUndefined(methodName) {
  throw new Error('The method "' + methodName + '" is not defined! Please add it to your sql dialect.');
}

/**
 * Checks if a clause object has only truthy values.
 * @param {Object} clause
 * @returns {boolean}
 */
function isClauseValid(clause) {
  for (const key in clause) {
    if (!clause[key]) {
      return false;
    }
  }
  return true;
}

/**
 * Determines whether any identity column is being updated.
 * @param {Object} updateValues
 * @param {Array<string>} identityAttrs
 * @returns {boolean}
 */
function hasIdentityUpdate(updateValues, identityAttrs) {
  return identityAttrs.some(key => updateValues[key] && updateValues[key] !== null);
}

/**
 * Builds a join snippet for MERGE statements.
 * @param {Array<string>} keys
 * @param {string} targetAlias
 * @param {string} sourceAlias
 * @param {function(string):string} quoteIdentifier
 * @returns {string}
 */
function buildJoinSnippet(keys, targetAlias, sourceAlias, quoteIdentifier) {
  return keys
    .map(key => `${targetAlias}.${quoteIdentifier(key)} = ${sourceAlias}.${quoteIdentifier(key)}`)
    .join(' AND ');
}

/**
 * Determines the appropriate join condition based on provided clauses.
 * @param {Array<Object>} clauses
 * @param {Array<string>} primaryKeysAttrs
 * @param {Array<string>} uniqueAttrs
 * @param {string} targetAlias
 * @param {string} sourceAlias
 * @param {function(string):string} quoteIdentifier
 * @returns {string}
 * @throws {Error}
 */
function determineJoinCondition(clauses, primaryKeysAttrs, uniqueAttrs, targetAlias, sourceAlias, quoteIdentifier) {
  if (clauses.length === 0) {
    throw new Error('Primary Key or Unique key should be passed to upsert query');
  }

  for (const clause of clauses) {
    const keys = Object.keys(clause);
    if (primaryKeysAttrs.includes(keys[0])) {
      return buildJoinSnippet(primaryKeysAttrs, targetAlias, sourceAlias, quoteIdentifier);
    }
  }

  return buildJoinSnippet(uniqueAttrs, targetAlias, sourceAlias, quoteIdentifier);
}

/**
 * Filters out invalid WHERE clauses (those containing null values).
 * @param {Object} where
 * @returns {Array<Object>}
 */
function filterValidClauses(where) {
  if (!where || !where[Op.or]) return [];
  return where[Op.or].filter(isClauseValid);
}

/**
 * Generates the UPDATE snippet for MERGE statements, excluding identity columns.
 * @param {Array<string>} updateKeys
 * @param {Object} updateValues
 * @param {Array<string>} identityAttrs
 * @param {string} targetAlias
 * @param {function(string):string} quoteIdentifier
 * @param {function(string):string} escape
 * @returns {string}
 */
function buildUpdateSnippet(updateKeys, updateValues, identityAttrs, targetAlias, quoteIdentifier, escape) {
  return updateKeys
    .filter(key => !identityAttrs.includes(key))
    .map(key => {
      const value = escape(updateValues[key]);
      const quotedKey = quoteIdentifier(key);
      return `${targetAlias}.${quotedKey} = ${value}`;
    })
    .join(', ');
}

/**
 * Generates the INSERT snippet for MERGE statements.
 * @param {Array<string>} insertKeys
 * @param {Object} insertValues
 * @param {function(string):string} quoteIdentifier
 * @param {function(string):string} escape
 * @returns {string}
 */
function buildInsertSnippet(insertKeys, insertValues, quoteIdentifier, escape) {
  const keysQuoted = insertKeys.map(k => quoteIdentifier(k)).join(', ');
  const valuesEscaped = insertKeys.map(k => escape(insertValues[k])).join(', ');
  return `(${keysQuoted}) VALUES(${valuesEscaped})`;
}

/**
 * Determines whether the current SQL Server version requires legacy TOP/OFFSET handling.
 * @param {string} version
 * @returns {boolean}
 */
function isLegacyVersion(version) {
  return semver.valid(version) && semver.lt(version, '11.0.0');
}

/**
 * Generates the TOP fragment for legacy SELECT queries.
 * @param {Object} options
 * @returns {string}
 */
function getLegacyTopFragment(options) {
  return options.limit ? `TOP ${options.limit} ` : '';
}

/**
 * Generates the OFFSET emulation fragment for legacy SELECT queries.
 * @param {Object} params
 * @param {string} params.tables
 * @param {Array<string>} params.attributes
 * @param {Object} params.options
 * @param {Object} params.model
 * @param {string} params.where
 * @param {string} params.tmpTable
 * @param {Array<string>} params.orderClause
 * @returns {string}
 */
function buildLegacyOffsetFragment({ tables, attributes, options, model, where, tmpTable, orderClause }) {
  const whereFragment = where ? ` WHERE ${where}` : '';
  const orderBy = orderClause.length ? orderClause.join(', ') : model.primaryKeyField;
  return (
    `SELECT TOP 100 PERCENT ${attributes.join(', ')} FROM (` +
    `SELECT ${getLegacyTopFragment(options)}* FROM (` +
    `SELECT ROW_NUMBER() OVER (ORDER BY ${orderBy}) as row_num, * FROM ${tables} AS ${tmpTable}${whereFragment}` +
    `) AS ${tmpTable} WHERE row_num > ${options.offset}` +
    `) AS ${tmpTable}`
  );
}

/**
 * Generates the ORDER BY fragment for modern SELECT queries when needed.
 * @param {Object} params
 * @param {Object} params.options
 * @param {Object} params.model
 * @param {boolean} params.isSubQuery
 * @param {function(string):string} params.quoteTable
 * @param {function(string):string} params.quoteIdentifier
 * @returns {string}
 */
function buildModernOrderFragment({ options, model, isSubQuery, quoteTable, quoteIdentifier }) {
  if (!options.order) return '';
  const orderClause = options.order;
  const tableAlias = quoteTable(options.tableAs || model.name);
  const primaryKey = `${tableAlias}.${quoteIdentifier(model.primaryKeyField)}`;
  return ` ORDER BY ${orderClause.length ? '' : primaryKey}`;
}

/**
 * Generates LIMIT/OFFSET fragment for modern SELECT queries.
 * @param {Object} params
 * @param {Object} params.options
 * @param {function(string):string} params.escape
 * @returns {string}
 */
function buildModernLimitOffsetFragment({ options, escape }) {
  const offset = options.offset || 0;
  let fragment = '';
  if (options.limit || options.offset) {
    fragment += ` OFFSET ${escape(offset)} ROWS`;
    if (options.limit) {
      fragment += ` FETCH NEXT ${escape(options.limit)} ROWS ONLY`;
    }
  }
  return fragment;
}

/**
 * Generates the LIMIT/OFFSET fragment for modern SELECT queries, handling missing ORDER BY.
 * @param {Object} params
 * @param {Object} params.options
 * @param {Object} params.model
 * @param {boolean} params.isSubQuery
 * @param {function(string):string} params.quoteTable
 * @param {function(string):string} params.quoteIdentifier
 * @param {function(string):string} params.escape
 * @returns {string}
 */
function buildModernOrderAndLimitFragment({ options, model, isSubQuery, quoteTable, quoteIdentifier, escape }) {
  let fragment = '';
  if (options.limit || options.offset) {
    if (!options.order) {
      fragment += ` ORDER BY ${quoteTable(options.tableAs || model.name)}.${quoteIdentifier(model.primaryKeyField)}`;
    }
    fragment += buildModernLimitOffsetFragment({ options, escape });
  }
  return fragment;
}

/**
 * Generates the SELECT fragment for legacy SQL Server versions.
 * @param {Object} params
 * @param {Object} params.options
 * @param {Object} params.model
 * @param {Array<string>} params.attributes
 * @param {string} params.tables
 * @param {string} params.mainTableAs
 * @param {string} params.where
 * @param {function(string):string} params.quoteIdentifier
 * @param {function(string):string} params.quoteTable
 * @returns {string}
 */
function buildLegacySelectFragment({ options, model, attributes, tables, mainTableAs, where, quoteIdentifier, quoteTable }) {
  const topFragment = getLegacyTopFragment(options);
  if (options.offset) {
    const tmpTable = mainTableAs || 'OffsetTable';
    const orderClause = options.order ? [] : [quoteIdentifier(model.primaryKeyField)];
    return buildLegacyOffsetFragment({
      tables,
      attributes,
      options,
      model,
      where,
      tmpTable,
      orderClause
    });
  }
  let fragment = `SELECT ${topFragment}${attributes.join(', ')} FROM ${tables}`;
  if (mainTableAs) {
    fragment += ` AS ${mainTableAs}`;
  }
  return fragment;
}

/**
 * Generates the SELECT fragment for modern SQL Server versions.
 * @param {Object} params
 * @param {Object} params.options
 * @param {Object} params.model
 * @param {Array<string>} params.attributes
 * @param {string} params.tables
 * @param {string} params.mainTableAs
 * @param {string} params.where
 * @param {function(string):string} params.quoteIdentifier
 * @param {function(string):string} params.quoteTable
 * @param {function(string):string} params.escape
 * @returns {string}
 */
function buildModernSelectFragment({ options, model, attributes, tables, mainTableAs, where, quoteIdentifier, quoteTable, escape }) {
  let fragment = `SELECT ${attributes.join(', ')} FROM ${tables}`;
  if (mainTableAs) {
    fragment += ` AS ${mainTableAs}`;
  }
  if (options.tableHint && TableHints[options.tableHint]) {
    fragment += ` WITH (${TableHints[options.tableHint]})`;
  }
  const orderAndLimit = buildModernOrderAndLimitFragment({
    options,
    model,
    isSubQuery: false,
    quoteTable,
    quoteIdentifier,
    escape
  });
  return fragment + orderAndLimit;
}

/**
 * Generates the SELECT fragment handling both legacy and modern SQL Server versions.
 * @param {Object} options
 * @param {Object} model
 * @param {Array<string>} attributes
 * @param {string} tables
 * @param {string} mainTableAs
 * @param {string} where
 * @returns {string}
 */
function generateSelectFragment(options, model, attributes, tables, mainTableAs, where) {
  const version = this.sequelize && this.sequelize.options ? this.sequelize.options.databaseVersion : null;
  if (isLegacyVersion(version)) {
    return buildLegacySelectFragment.call(this, {
      options,
      model,
      attributes,
      tables,
      mainTableAs,
      where,
      quoteIdentifier: this.quoteIdentifier,
      quoteTable: this.quoteTable
    });
  }
  return buildModernSelectFragment.call(this, {
    options,
    model,
    attributes,
    tables,
    mainTableAs,
    where,
    quoteIdentifier: this.quoteIdentifier,
    quoteTable: this.quoteTable,
    escape: this.escape
  });
}

/**
 * Generates the LIMIT/OFFSET fragment for modern SQL Server versions.
 * @param {Object} options
 * @param {Object} model
 * @returns {string}
 */
function generateLimitOffsetFragment(options, model) {
  const version = this.sequelize && this.sequelize.options ? this.sequelize.options.databaseVersion : null;
  if (isLegacyVersion(version)) {
    return '';
  }
  return buildModernOrderAndLimitFragment({
    options,
    model,
    isSubQuery: false,
    quoteTable: this.quoteTable,
    quoteIdentifier: this.quoteIdentifier,
    escape: this.escape
  });
}

/**
 * Generates the upsert query for MSSQL.
 * @param {string} tableName
 * @param {Object} insertValues
 * @param {Object} updateValues
 * @param {Object} where
 * @param {Object} model
 * @returns {string}
 */
function generateUpsertQuery(tableName, insertValues, updateValues, where, model) {
  const targetAlias = this.quoteTable(`${tableName}_target`);
  const sourceAlias = this.quoteTable(`${tableName}_source`);
  const primaryKeysAttrs = [];
  const identityAttrs = [];
  const uniqueAttrs = [];

  for (const key in model.rawAttributes) {
    const attr = model.rawAttributes[key];
    if (attr.primaryKey) primaryKeysAttrs.push(attr.field || key);
    if (attr.unique) uniqueAttrs.push(attr.field || key);
    if (attr.autoIncrement) identityAttrs.push(attr.field || key);
  }

  for (const index of model.options.indexes || []) {
    if (index.unique && index.fields) {
      for (const field of index.fields) {
        const fieldName = typeof field === 'string' ? field : field.name || field.attribute;
        if (!uniqueAttrs.includes(fieldName) && model.rawAttributes[fieldName]) {
          uniqueAttrs.push(fieldName);
        }
      }
    }
  }

  const insertKeys = Object.keys(insertValues);
  const insertSnippet = buildInsertSnippet(insertKeys, insertValues, this.quoteIdentifier.bind(this), this.escape.bind(this));
  const updateSnippet = buildUpdateSnippet(Object.keys(updateValues), updateValues, identityAttrs, targetAlias, this.quoteIdentifier.bind(this), this.escape.bind(this));

  const needIdentityInsertWrapper = hasIdentityUpdate(updateValues, identityAttrs);
  const clauses = filterValidClauses(where);
  const joinCondition = determineJoinCondition(clauses, primaryKeysAttrs, uniqueAttrs, targetAlias, sourceAlias, this.quoteIdentifier.bind(this));

  let query = `MERGE INTO ${this.quoteTable(tableName)} WITH(HOLDLOCK) AS ${targetAlias} USING (${insertSnippet}) AS ${sourceAlias}(${insertKeys.map(k => this.quoteIdentifier(k)).join(', ')}) ON ${joinCondition}`;
  query += ` WHEN MATCHED THEN UPDATE SET ${updateSnippet} WHEN NOT MATCHED THEN INSERT ${insertSnippet} OUTPUT $action, INSERTED.*;`;

  if (needIdentityInsertWrapper) {
    query = `SET IDENTITY_INSERT ${this.quoteTable(tableName)} ON; ${query} SET IDENTITY_INSERT ${this.quoteTable(tableName)} OFF;`;
  }
  return query;
}

/**
 * Generates the bulk insert query for MSSQL.
 * @param {string} tableName
 * @param {Array<Object>} attrValueHashes
 * @param {Object} options
 * @param {Object} attributes
 * @returns {string}
 */
function generateBulkInsertQuery(tableName, attrValueHashes, options, attributes) {
  options = options || {};
  attributes = attributes || {};

  const needIdentityInsertWrapper = attrValueHashes.some(hash =>
    Object.entries(hash).some(([key, value]) => value !== null && attributes[key] && attributes[key].autoIncrement)
  );

  const outputFragment = options.returning ? ' OUTPUT INSERTED.*' : '';
  const allAttributes = [];
  const allQueries = [];

  for (const hash of attrValueHashes) {
    const fields = Object.keys(hash);
    const firstAttr = attributes[fields[0]];
    if (fields.length === 1 && firstAttr && firstAttr.autoIncrement && hash[fields[0]] === null) {
      allQueries.push('INSERT INTO <%= table %><%= output %> DEFAULT VALUES');
      continue;
    }

    for (const key of fields) {
      if (!allAttributes.includes(key)) {
        if (hash[key] === null && attributes[key] && attributes[key].autoIncrement) continue;
        allAttributes.push(key);
      }
    }
  }

  const tuples = attrValueHashes.map(hash => '(' + allAttributes.map(key => this.escape(hash[key])).join(',') + ')');
  if (allAttributes.length) {
    allQueries.push('INSERT INTO <%= table %> (<%= attributes %>)<%= output %> VALUES <%= tuples %>');
  }

  const batchSize = Math.floor(250 / (allAttributes.length + 1)) + 1;
  const commands = [];
  for (let offset = 0; offset < Math.max(tuples.length, 1); offset += batchSize) {
    const replacements = {
      table: this.quoteTable(tableName),
      attributes: allAttributes.map(attr => this.quoteIdentifier(attr)).join(','),
      tuples: tuples.slice(offset, offset + batchSize),
      output: outputFragment
    };
    let generated = _.template(allQueries.join(';'), this._templateSettings)(replacements);
    if (needIdentityInsertWrapper) {
      generated = [
        'SET IDENTITY_INSERT', this.quoteTable(tableName), 'ON;',
        generated,
        'SET IDENTITY_INSERT', this.quoteTable(tableName), 'OFF;'
      ].join(' ');
    }
    commands.push(generated);
  }
  return commands.join(';');
}

/**
 * Generates the SELECT fragment for a query, handling legacy and modern SQL Server versions.
 * @param {Object} options
 * @param {Object} model
 * @param {Array<string>} attributes
 * @param {string} tables
 * @param {string} mainTableAs
 * @param {string} where
 * @returns {string}
 */
function selectFromTableFragment(options, model, attributes, tables, mainTableAs, where) {
  return generateSelectFragment.call(this, options, model, attributes, tables, mainTableAs, where);
}

/**
 * Generates the LIMIT/OFFSET fragment for a query, handling legacy and modern SQL Server versions.
 * @param {Object} options
 * @param {Object} model
 * @returns {string}
 */
function addLimitAndOffset(options, model) {
  return generateLimitOffsetFragment.call(this, options, model);
}

const QueryGenerator = {
  __proto__: AbstractQueryGenerator,
  options: {},
  dialect: 'mssql',

  createSchema(schema) {
    return [
      'IF NOT EXISTS (SELECT schema_name',
      'FROM information_schema.schemata',
      'WHERE schema_name =', wrapSingleQuote(schema), ')',
      'BEGIN',
      "EXEC sp_executesql N'CREATE SCHEMA",
      this.quoteIdentifier(schema),
      ";'",
      'END;'
    ].join(' ');
  },

  dropSchema(schema) {
    const quotedSchema = wrapSingleQuote(schema);
    return [
      'IF EXISTS (SELECT schema_name',
      'FROM information_schema.schemata',
      'WHERE schema_name =', quotedSchema, ')',
      'BEGIN',
      'DECLARE @id INT, @ms_sql NVARCHAR(2000);',
      'DECLARE @cascade TABLE (',
      'id INT NOT NULL IDENTITY PRIMARY KEY,',
      'ms_sql NVARCHAR(2000) NOT NULL );',
      'INSERT INTO @cascade ( ms_sql )',
      "SELECT CASE WHEN o.type IN ('F','PK')",
      "THEN N'ALTER TABLE ['+ s.name + N'].[' + p.name + N'] DROP CONSTRAINT [' + o.name + N']'",
      "ELSE N'DROP TABLE ['+ s.name + N'].[' + o.name + N']' END",
      'FROM sys.objects o',
      'JOIN sys.schemas s on o.schema_id = s.schema_id',
      'LEFT OUTER JOIN sys.objects p on o.parent_object_id = p.object_id',
      "WHERE o.type IN ('F', 'PK', 'U') AND s.name = ", quotedSchema,
      'ORDER BY o.type ASC;',
      'SELECT TOP 1 @id = id, @ms_sql = ms_sql FROM @cascade ORDER BY id;',
      'WHILE @id IS NOT NULL',
      'BEGIN',
      'BEGIN TRY EXEC sp_executesql @ms_sql; END TRY',
      'BEGIN CATCH BREAK; THROW; END CATCH;',
      'DELETE FROM @cascade WHERE id = @id;',
      'SELECT @id = NULL, @ms_sql = NULL;',
      'SELECT TOP 1 @id = id, @ms_sql = ms_sql FROM @cascade ORDER BY id;',
      'END',
      "EXEC sp_executesql N'DROP SCHEMA", this.quoteIdentifier(schema), ";'",
      'END;'
    ].join(' ');
  },

  showSchemasQuery() {
    return [
      'SELECT "name" as "schema_name" FROM sys.schemas as s',
      'WHERE "s"."name" NOT IN (',
      "'INFORMATION_SCHEMA', 'dbo', 'guest', 'sys', 'archive'",
      ')', 'AND', '"s"."name" NOT LIKE', "'db_%'"
    ].join(' ');
  },

  versionQuery() {
    return [
      'DECLARE @ms_ver NVARCHAR(20);',
      "SET @ms_ver = REVERSE(CONVERT(NVARCHAR(20), SERVERPROPERTY('ProductVersion')));",
      "SELECT REVERSE(SUBSTRING(@ms_ver, CHARINDEX('.', @ms_ver)+1, 20)) AS 'version'"
    ].join(' ');
  },

  createTableQuery(tableName, attributes, options) {
    const query = "IF OBJECT_ID('<%= table %>', 'U') IS NULL CREATE TABLE <%= table %> (<%= attributes %>)",
      primaryKeys = [],
      foreignKeys = {},
      attrStr = [];

    for (const attr in attributes) {
      if (!attributes.hasOwnProperty(attr)) continue;
      const dataType = attributes[attr];
      let match;

      if (_.includes(dataType, 'PRIMARY KEY')) {
        primaryKeys.push(attr);
        if (_.includes(dataType, 'REFERENCES')) {
          match = dataType.match(/^(.+) (REFERENCES.*)$/);
          attrStr.push(this.quoteIdentifier(attr) + ' ' + match[1].replace(/PRIMARY KEY/, ''));
          foreignKeys[attr] = match[2];
        } else {
          attrStr.push(this.quoteIdentifier(attr) + ' ' + dataType.replace(/PRIMARY KEY/, ''));
        }
      } else if (_.includes(dataType, 'REFERENCES')) {
        match = dataType.match(/^(.+) (REFERENCES.*)$/);
        attrStr.push(this.quoteIdentifier(attr) + ' ' + match[1]);
        foreignKeys[attr] = match[2];
      } else {
        attrStr.push(this.quoteIdentifier(attr) + ' ' + dataType);
      }
    }

    const values = {
        table: this.quoteTable(tableName),
        attributes: attrStr.join(', ')
      },
      pkString = primaryKeys.map(pk => this.quoteIdentifier(pk)).join(', ');

    if (options.uniqueKeys) {
      _.each(options.uniqueKeys, (columns, indexName) => {
        if (!columns.customIndex) return;
        if (!_.isString(indexName)) {
          indexName = 'uniq_' + tableName + '_' + columns.fields.join('_');
        }
        values.attributes += `, CONSTRAINT ${this.quoteIdentifier(indexName)} UNIQUE (${columns.fields.map(field => this.quoteIdentifier(field)).join(', ')})`;
      });
    }

    if (pkString) {
      values.attributes += `, PRIMARY KEY (${pkString})`;
    }

    for (const fkey in foreignKeys) {
      if (!foreignKeys.hasOwnProperty(fkey)) continue;
      values.attributes += ', FOREIGN KEY (' + this.quoteIdentifier(fkey) + ') ' + foreignKeys[fkey];
    }

    return _.template(query, this._templateSettings)(values).trim() + ';';
  },

  describeTableQuery(tableName, schema) {
    let sql = [
      'SELECT',
      "c.COLUMN_NAME AS 'Name',",
      "c.DATA_TYPE AS 'Type',",
      "c.CHARACTER_MAXIMUM_LENGTH AS 'Length',",
      "c.IS_NULLABLE as 'IsNull',",
      "COLUMN_DEFAULT AS 'Default',",
      "pk.CONSTRAINT_TYPE AS 'Constraint',",
      "COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA+'.'+c.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') as 'IsIdentity'",
      'FROM',
      'INFORMATION_SCHEMA.TABLES t',
      'INNER JOIN',
      'INFORMATION_SCHEMA.COLUMNS c ON t.TABLE_NAME = c.TABLE_NAME AND t.TABLE_SCHEMA = c.TABLE_SCHEMA',
      'LEFT JOIN (SELECT tc.table_schema, tc.table_name, ',
      'cu.column_name, tc.constraint_type ',
      'FROM information_schema.TABLE_CONSTRAINTS tc ',
      'JOIN information_schema.KEY_COLUMN_USAGE  cu ',
      'ON tc.table_schema=cu.table_schema and tc.table_name=cu.table_name ',
      'and tc.constraint_name=cu.constraint_name ',
      'and tc.constraint_type=\'PRIMARY KEY\') pk ',
      'ON pk.table_schema=c.table_schema ',
      'AND pk.table_name=c.table_name ',
      'AND pk.column_name=c.column_name ',
      'WHERE t.TABLE_NAME =', wrapSingleQuote(tableName)
    ].join(' ');

    if (schema) {
      sql += 'AND t.TABLE_SCHEMA =' + wrapSingleQuote(schema);
    }

    return sql;
  },

  renameTableQuery(before, after) {
    const query = 'EXEC sp_rename <%= before %>, <%= after %>;';
    return _.template(query, this._templateSettings)({
      before: this.quoteTable(before),
      after: this.quoteTable(after)
    });
  },

  showTablesQuery() {
    return 'SELECT TABLE_NAME, TABLE_SCHEMA FROM INFORMATION_SCHEMA.TABLES;';
  },

  dropTableQuery(tableName) {
    const query = "IF OBJECT_ID('<%= table %>', 'U') IS NOT NULL DROP TABLE <%= table %>";
    const values = { table: this.quoteTable(tableName) };
    return _.template(query, this._templateSettings)(values).trim() + ';';
  },

  addColumnQuery(table, key, dataType) {
    dataType.field = key;
    const query = 'ALTER TABLE <%= table %> ADD <%= attribute %>;',
      attribute = _.template('<%= key %> <%= definition %>', this._templateSettings)({
        key: this.quoteIdentifier(key),
        definition: this.attributeToSQL(dataType, { context: 'addColumn' })
      });
    return _.template(query, this._templateSettings)({
      table: this.quoteTable(table),
      attribute
    });
  },

  removeColumnQuery(tableName, attributeName) {
    const query = 'ALTER TABLE <%= tableName %> DROP COLUMN <%= attributeName %>;';
    return _.template(query, this._templateSettings)({
      tableName: this.quoteTable(tableName),
      attributeName: this.quoteIdentifier(attributeName)
    });
  },

  changeColumnQuery(tableName, attributes) {
    const query = 'ALTER TABLE <%= tableName %> <%= query %>;',
      attrString = [],
      constraintString = [];

    for (const attributeName in attributes) {
      const definition = attributes[attributeName];
      if (definition.match(/REFERENCES/)) {
        constraintString.push(_.template('<%= fkName %> FOREIGN KEY (<%= attrName %>) <%= definition %>', this._templateSettings)({
          fkName: this.quoteIdentifier(attributeName + '_foreign_idx'),
          attrName: this.quoteIdentifier(attributeName),
          definition: definition.replace(/.+?(?=REFERENCES)/, '')
        }));
      } else {
        attrString.push(_.template('<%= attrName %> <%= definition %>', this._templateSettings)({
          attrName: this.quoteIdentifier(attributeName),
          definition
        }));
      }
    }

    let finalQuery = '';
    if (attrString.length) {
      finalQuery += 'ALTER COLUMN ' + attrString.join(', ');
      if (constraintString.length) finalQuery += ' ';
    }
    if (constraintString.length) {
      finalQuery += 'ADD CONSTRAINT ' + constraintString.join(', ');
    }

    return _.template(query, this._templateSettings)({
      tableName: this.quoteTable(tableName),
      query: finalQuery
    });
  },

  renameColumnQuery(tableName, attrBefore, attributes) {
    const query = "EXEC sp_rename '<%= tableName %>.<%= before %>', '<%= after %>', 'COLUMN';",
      newName = Object.keys(attributes)[0];
    return _.template(query, this._templateSettings)({
      tableName: this.quoteTable(tableName),
      before: attrBefore,
      after: newName
    });
  },

  bulkInsertQuery(tableName, attrValueHashes, options, attributes) {
    return generateBulkInsertQuery.call(this, tableName, attrValueHashes, options, attributes);
  },

  updateQuery(tableName, attrValueHash, where, options, attributes) {
    let sql = super.updateQuery(tableName, attrValueHash, where, options, attributes);
    if (options.limit) {
      const updateArgs = `UPDATE TOP(${this.escape(options.limit)})`;
      sql = sql.replace('UPDATE', updateArgs);
    }
    return sql;
  },

  upsertQuery(tableName, insertValues, updateValues, where, model) {
    return generateUpsertQuery.call(this, tableName, insertValues, updateValues, where, model);
  },

  deleteQuery(tableName, where, options) {
    options = options || {};
    const table = this.quoteTable(tableName);
    if (options.truncate) return 'TRUNCATE TABLE ' + table;

    where = this.getWhereConditions(where);
    if (_.isUndefined(options.limit)) options.limit = 1;

    const limit = options.limit ? ` TOP(${this.escape(options.limit)})` : '';
    const replacements = {
      limit,
      table,
      where: where ? ` WHERE ${where}` : ''
    };
    const query = 'DELETE<%= limit %> FROM <%= table %><%= where %>; SELECT @@ROWCOUNT AS AFFECTEDROWS;';
    return _.template(query, this._templateSettings)(replacements);
  },

  showIndexesQuery(tableName) {
    const sql = "EXEC sys.sp_helpindex @objname = N'<%= tableName %>';";
    return _.template(sql, this._templateSettings)({
      tableName: this.quoteTable(tableName)
    });
  },

  showConstraintsQuery(tableName) {
    return `EXEC sp_helpconstraint @objname = ${this.escape(this.quoteTable(tableName))};`;
  },

  removeIndexQuery(tableName, indexNameOrAttributes) {
    const sql = 'DROP INDEX <%= indexName %> ON <%= tableName %>';
    let indexName = indexNameOrAttributes;
    if (typeof indexName !== 'string') {
      indexName = Utils.underscore(tableName + '_' + indexNameOrAttributes.join('_'));
    }
    const values = {
      tableName: this.quoteIdentifiers(tableName),
      indexName: this.quoteIdentifiers(indexName)
    };
    return _.template(sql, this._templateSettings)(values);
  },

  attributeToSQL(attribute) {
    if (!_.isPlainObject(attribute)) attribute = { type: attribute };
    if (attribute.references && attribute.Model && attribute.Model.tableName === attribute.references.model) {
      this.sequelize.log('MSSQL does not support self referencial constraints, we will remove it but we recommend restructuring your query');
      attribute.onDelete = '';
      attribute.onUpdate = '';
    }

    let template;
    if (attribute.type instanceof DataTypes.ENUM) {
      if (attribute.type.values && !attribute.values) attribute.values = attribute.type.values;
      template = attribute.type.toSql();
      template += ' CHECK (' + this.quoteIdentifier(attribute.field) + ' IN(' + _.map(attribute.values, value => this.escape(value)).join(', ') + '))';
      return template;
    }
    template = attribute.type.toString();

    if (attribute.allowNull === false) {
      template += ' NOT NULL';
    } else if (!attribute.primaryKey && !Utils.defaultValueSchemable(attribute.defaultValue)) {
      template += ' NULL';
    }

    if (attribute.autoIncrement) template += ' IDENTITY(1,1)';

    if (attribute.type !== 'TEXT' && attribute.type._binary !== true && Utils.defaultValueSchemable(attribute.defaultValue)) {
      template += ' DEFAULT ' + this.escape(attribute.defaultValue);
    }

    if (attribute.unique) template += ' UNIQUE';
    if (attribute.primaryKey) template += ' PRIMARY KEY';

    if (attribute.references) {
      template += ' REFERENCES ' + this.quoteTable(attribute.references.model);
      const refKey = attribute.references.key || 'id';
      template += ` (${this.quoteIdentifier(refKey)})`;
      if (attribute.onDelete) template += ' ON DELETE ' + attribute.onDelete.toUpperCase();
      if (attribute.onUpdate) template += ' ON UPDATE ' + attribute.onUpdate.toUpperCase();
    }

    return template;
  },

  attributesToSQL(attributes, options) {
    const result = {};
    const existingConstraints = [];

    for (const key in attributes) {
      const attribute = attributes[key];
      if (attribute.references) {
        if (existingConstraints.includes(attribute.references.model.toString())) {
          attribute.onDelete = '';
          attribute.onUpdate = '';
        } else {
          existingConstraints.push(attribute.references.model.toString());
          attribute.onUpdate = '';
        }
      }
      if (key && !attribute.field) attribute.field = key;
      result[attribute.field || key] = this.attributeToSQL(attribute, options);
    }

    return result;
  },

  createTrigger() { throwMethodUndefined('createTrigger'); },
  dropTrigger() { throwMethodUndefined('dropTrigger'); },
  renameTrigger() { throwMethodUndefined('renameTrigger'); },
  createFunction() { throwMethodUndefined('createFunction'); },
  dropFunction() { throwMethodUndefined('dropFunction'); },
  renameFunction() { throwMethodUndefined('renameFunction'); },

  quoteIdentifier(identifier) {
    if (identifier === '*') return identifier;
    return '[' + identifier.replace(/[\[\]']+/g, '') + ']';
  },

  _getForeignKeysQueryPrefix(catalogName) {
    return 'SELECT ' +
        'constraint_name = OBJ.NAME, ' +
        'constraintName = OBJ.NAME, ' +
        (catalogName ? `constraintCatalog = '${catalogName}', ` : '') +
        'constraintSchema = SCHEMA_NAME(OBJ.SCHEMA_ID), ' +
        'tableName = TB.NAME, ' +
        'tableSchema = SCHEMA_NAME(TB.SCHEMA_ID), ' +
        (catalogName ? `tableCatalog = '${catalogName}', ` : '') +
        'columnName = COL.NAME, ' +
        'referencedTableSchema = SCHEMA_NAME(RTB.SCHEMA_ID), ' +
        (catalogName ? `referencedCatalog = '${catalogName}', ` : '') +
        'referencedTableName = RTB.NAME, ' +
        'referencedColumnName = RCOL.NAME ' +
      'FROM SYS.FOREIGN_KEY_COLUMNS FKC ' +
        'INNER JOIN SYS.OBJECTS OBJ ON OBJ.OBJECT_ID = FKC.CONSTRAINT_OBJECT_ID ' +
        'INNER JOIN SYS.TABLES TB ON TB.OBJECT_ID = FKC.PARENT_OBJECT_ID ' +
        'INNER JOIN SYS.COLUMNS COL ON COL.COLUMN_ID = PARENT_COLUMN_ID AND COL.OBJECT_ID = TB.OBJECT_ID ' +
        'INNER JOIN SYS.TABLES RTB ON RTB.OBJECT_ID = FKC.REFERENCED_OBJECT_ID ' +
        'INNER JOIN SYS.COLUMNS RCOL ON RCOL.COLUMN_ID = REFERENCED_COLUMN_ID AND RCOL.OBJECT_ID = RTB.OBJECT_ID';
  },

  getForeignKeysQuery(table, catalogName) {
    const tableName = table.tableName || table;
    let sql = this._getForeignKeysQueryPrefix(catalogName) + ' WHERE TB.NAME =' + wrapSingleQuote(tableName);
    if (table.schema) sql += ' AND SCHEMA_NAME(TB.SCHEMA_ID) =' + wrapSingleQuote(table.schema);
    return sql;
  },

  getForeignKeyQuery(table, attributeName) {
    const tableName = table.tableName || table;
    let sql = this._getForeignKeysQueryPrefix() + ' WHERE TB.NAME =' + wrapSingleQuote(tableName) + ' AND COL.NAME =' + wrapSingleQuote(attributeName);
    if (table.schema) sql += ' AND SCHEMA_NAME(TB.SCHEMA_ID) =' + wrapSingleQuote(table.schema);
    return sql;
  },

  getPrimaryKeyConstraintQuery(table, attributeName) {
    const tableName = wrapSingleQuote(table.tableName || table);
    return [
      'SELECT K.TABLE_NAME AS tableName,',
      'K.COLUMN_NAME AS columnName,',
      'K.CONSTRAINT_NAME AS constraintName',
      'FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS AS C',
      'JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE AS K',
      'ON C.TABLE_NAME = K.TABLE_NAME',
      'AND C.CONSTRAINT_CATALOG = K.CONSTRAINT_CATALOG',
      'AND C.CONSTRAINT_SCHEMA = K.CONSTRAINT_SCHEMA',
      'AND C.CONSTRAINT_NAME = K.CONSTRAINT_NAME',
      'WHERE C.CONSTRAINT_TYPE = \'PRIMARY KEY\'',
      `AND K.COLUMN_NAME = ${wrapSingleQuote(attributeName)}`,
      `AND K.TABLE_NAME = ${tableName};`
    ].join(' ');
  },

  dropForeignKeyQuery(tableName, foreignKey) {
    return _.template('ALTER TABLE <%= table %> DROP <%= key %>', this._templateSettings)({
      table: this.quoteTable(tableName),
      key: this.quoteIdentifier(foreignKey)
    });
  },

  getDefaultConstraintQuery(tableName, attributeName) {
    const sql = 'SELECT name FROM SYS.DEFAULT_CONSTRAINTS ' +
      "WHERE PARENT_OBJECT_ID = OBJECT_ID('<%= table %>', 'U') " +
      "AND PARENT_COLUMN_ID = (SELECT column_id FROM sys.columns WHERE NAME = ('<%= column %>') " +
      "AND object_id = OBJECT_ID('<%= table %>', 'U'));";
    return _.template(sql, this._templateSettings)({
      table: this.quoteTable(tableName),
      column: attributeName
    });
  },

  dropConstraintQuery(tableName, constraintName) {
    const sql = 'ALTER TABLE <%= table %> DROP CONSTRAINT <%= constraint %>;';
    return _.template(sql, this._templateSettings)({
      table: this.quoteTable(tableName),
      constraint: this.quoteIdentifier(constraintName)
    });
  },

  setAutocommitQuery() { return ''; },

  setIsolationLevelQuery() {},

  generateTransactionId() {
    return randomBytes(10).toString('hex');
  },

  startTransactionQuery(transaction) {
    if (transaction.parent) return 'SAVE TRANSACTION ' + this.quoteIdentifier(transaction.name) + ';';
    return 'BEGIN TRANSACTION;';
  },

  commitTransactionQuery(transaction) {
    if (transaction.parent) return;
    return 'COMMIT TRANSACTION;';
  },

  rollbackTransactionQuery(transaction) {
    if (transaction.parent) return 'ROLLBACK TRANSACTION ' + this.quoteIdentifier(transaction.name) + ';';
    return 'ROLLBACK TRANSACTION;';
  },

  selectFromTableFragment,

  addLimitAndOffset,

  booleanValue(value) {
    return value ? 1 : 0;
  }
};

function wrapSingleQuote(identifier) {
  return Utils.addTicks(Utils.removeTicks(identifier, "'"), "'");
}

module.exports = QueryGenerator;