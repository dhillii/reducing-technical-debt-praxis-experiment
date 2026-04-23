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
 * Wrap identifier with single quotes safely.
 */
function wrapSingleQuote(identifier) {
  return Utils.addTicks(Utils.removeTicks(identifier, "'"), "'");
}

/**
 * Extract primary keys, foreign keys and attribute strings for CREATE TABLE.
 */
function extractCreateTableComponents(gen, attributes) {
  const primaryKeys = [];
  const foreignKeys = {};
  const attrStr = [];

  for (const attr in attributes) {
    if (!attributes.hasOwnProperty(attr)) continue;
    const dataType = attributes[attr];
    let match;

    if (_.includes(dataType, 'PRIMARY KEY')) {
      primaryKeys.push(attr);
      if (_.includes(dataType, 'REFERENCES')) {
        match = dataType.match(/^(.+) (REFERENCES.*)$/);
        attrStr.push(gen.quoteIdentifier(attr) + ' ' + match[1].replace(/PRIMARY KEY/, ''));
        foreignKeys[attr] = match[2];
      } else {
        attrStr.push(gen.quoteIdentifier(attr) + ' ' + dataType.replace(/PRIMARY KEY/, ''));
      }
    } else if (_.includes(dataType, 'REFERENCES')) {
      match = dataType.match(/^(.+) (REFERENCES.*)$/);
      attrStr.push(gen.quoteIdentifier(attr) + ' ' + match[1]);
      foreignKeys[attr] = match[2];
    } else {
      attrStr.push(gen.quoteIdentifier(attr) + ' ' + dataType);
    }
  }

  return { primaryKeys, foreignKeys, attrStr };
}

/**
 * Append unique key constraints to attribute string.
 */
function appendUniqueKeys(gen, values, options, tableName) {
  if (!options.uniqueKeys) return;
  _.each(options.uniqueKeys, (columns, indexName) => {
    if (!columns.customIndex) return;
    if (!_.isString(indexName)) {
      indexName = 'uniq_' + tableName + '_' + columns.fields.join('_');
    }
    values.attributes += `, CONSTRAINT ${gen.quoteIdentifier(indexName)} UNIQUE (${columns.fields.map(f => gen.quoteIdentifier(f)).join(', ')})`;
  });
}

/**
 * Append primary key definition.
 */
function appendPrimaryKey(gen, values, primaryKeys) {
  const pkString = primaryKeys.map(pk => gen.quoteIdentifier(pk)).join(', ');
  if (pkString.length > 0) {
    values.attributes += `, PRIMARY KEY (${pkString})`;
  }
}

/**
 * Append foreign key definitions.
 */
function appendForeignKeys(gen, values, foreignKeys) {
  for (const fkey in foreignKeys) {
    if (!foreignKeys.hasOwnProperty(fkey)) continue;
    values.attributes += ', FOREIGN KEY (' + gen.quoteIdentifier(fkey) + ') ' + foreignKeys[fkey];
  }
}

/**
 * Prepare bulk insert attribute collection.
 */
function collectBulkInsertAttributes(gen, attrValueHashes, options, attributes) {
  const allAttributes = [];
  let needIdentityInsertWrapper = false;

  _.forEach(attrValueHashes, hash => {
    _.forOwn(hash, (value, key) => {
      if (value !== null && attributes[key] && attributes[key].autoIncrement) {
        needIdentityInsertWrapper = true;
      }
      if (allAttributes.indexOf(key) === -1) {
        if (value === null && attributes[key] && attributes[key].autoIncrement) return;
        allAttributes.push(key);
      }
    });
  });

  return { allAttributes, needIdentityInsertWrapper };
}

/**
 * Build tuple strings for bulk insert.
 */
function buildBulkInsertTuples(gen, attrValueHashes, allAttributes) {
  const tuples = [];
  _.forEach(attrValueHashes, hash => {
    tuples.push('(' + allAttributes.map(key => gen.escape(hash[key])).join(',') + ')');
  });
  return tuples;
}

/**
 * Generate bulk insert command fragments.
 */
function generateBulkInsertCommands(gen, tableName, allAttributes, tuples, outputFragment, needIdentityInsertWrapper) {
  const commands = [];
  const batchSize = Math.floor(250 / (allAttributes.length + 1)) + 1;
  let offset = 0;

  while (offset < Math.max(tuples.length, 1)) {
    const replacements = {
      table: gen.quoteTable(tableName),
      attributes: allAttributes.map(a => gen.quoteIdentifier(a)).join(','),
      tuples: tuples.slice(offset, Math.min(tuples.length, offset + batchSize)),
      output: outputFragment
    };
    let sql = _.template('INSERT INTO <%= table %> (<%= attributes %>)<%= output %> VALUES <%= tuples %>;', gen._templateSettings)(replacements);
    if (needIdentityInsertWrapper) {
      sql = [
        'SET IDENTITY_INSERT', gen.quoteTable(tableName), 'ON;',
        sql,
        'SET IDENTITY_INSERT', gen.quoteTable(tableName), 'OFF;'
      ].join(' ');
    }
    commands.push(sql);
    offset += batchSize;
  }
  return commands;
}

/**
 * Extract primary, unique and identity attributes from model.
 */
function extractModelKeyInfo(model) {
  const primaryKeysAttrs = [];
  const identityAttrs = [];
  const uniqueAttrs = [];

  for (const key in model.rawAttributes) {
    const attr = model.rawAttributes[key];
    if (attr.primaryKey) primaryKeysAttrs.push(attr.field || key);
    if (attr.unique) uniqueAttrs.push(attr.field || key);
    if (attr.autoIncrement) identityAttrs.push(attr.field || key);
  }

  // include unique indexes defined in model options
  (model.options.indexes || []).forEach(idx => {
    if (idx.unique && idx.fields) {
      idx.fields.forEach(f => {
        const fieldName = typeof f === 'string' ? f : f.name || f.attribute;
        if (uniqueAttrs.indexOf(fieldName) === -1 && model.rawAttributes[fieldName]) {
          uniqueAttrs.push(fieldName);
        }
      });
    }
  });

  return { primaryKeysAttrs, identityAttrs, uniqueAttrs };
}

/**
 * Filter valid WHERE clauses for upsert.
 */
function filterValidClauses(where) {
  return (where[Op.or] || []).filter(clause => {
    for (const key in clause) {
      if (!clause[key]) return false;
    }
    return true;
  });
}

/**
 * Build join condition snippet for upsert.
 */
function buildJoinCondition(gen, targetAlias, sourceAlias, primaryKeys, uniqueKeys, clauses) {
  const getSnippet = arr => arr.map(k => `${targetAlias}.${gen.quoteIdentifier(k)} = ${sourceAlias}.${gen.quoteIdentifier(k)}`).join(' AND ');
  if (clauses.length === 0) {
    throw new Error('Primary Key or Unique key should be passed to upsert query');
  }
  for (const clause of clauses) {
    const keys = Object.keys(clause);
    if (primaryKeys.indexOf(keys[0]) !== -1) {
      return getSnippet(primaryKeys);
    }
  }
  return getSnippet(uniqueKeys);
}

/**
 * Build update snippet for upsert.
 */
function buildUpdateSnippet(gen, targetAlias, updateValues, identityAttrs) {
  return Object.keys(updateValues)
    .filter(k => identityAttrs.indexOf(k) === -1)
    .map(k => `${targetAlias}.${gen.quoteIdentifier(k)} = ${gen.escape(updateValues[k])}`)
    .join(', ');
}

/**
 * Build SELECT fragment for older SQL Server versions.
 */
function buildLegacySelectFragment(gen, options, model, attributes, tables, mainTableAs, where) {
  const offset = options.offset || 0;
  const isSubQuery = options.hasIncludeWhere || options.hasIncludeRequired || options.hasMultiAssociation;
  const orders = options.order ? gen.getQueryOrders(options, model, isSubQuery) : { mainQueryOrder: [] };
  if (!orders.mainQueryOrder.length) {
    orders.mainQueryOrder.push(gen.quoteIdentifier(model.primaryKeyField));
  }
  const tmpTable = mainTableAs || 'OffsetTable';
  const whereFragment = where ? ' WHERE ' + where : '';
  return 'SELECT TOP 100 PERCENT ' + attributes.join(', ') + ' FROM (' +
    'SELECT ' + (options.limit ? 'TOP ' + options.limit + ' ' : '') + '*' +
    ' FROM (SELECT ROW_NUMBER() OVER (ORDER BY ' + orders.mainQueryOrder.join(', ') + ') as row_num, *' +
    ' FROM ' + tables + ' AS ' + tmpTable + whereFragment + ')' +
    ' AS ' + tmpTable + ' WHERE row_num > ' + offset + ')' +
    ' AS ' + tmpTable;
}

/**
 * Build ORDER/OFFSET/FETCH fragment for newer SQL Server versions.
 */
function buildModernLimitOffset(gen, options, model) {
  const offset = options.offset || 0;
  const isSubQuery = options.subQuery === undefined
    ? options.hasIncludeWhere || options.hasIncludeRequired || options.hasMultiAssociation
    : options.subQuery;
  let fragment = '';
  const orders = options.order ? gen.getQueryOrders(options, model, isSubQuery) : {};

  if (options.limit || options.offset) {
    if (!options.order || (options.include && !orders.subQueryOrder.length)) {
      fragment += (options.order && !isSubQuery ? ', ' : ' ORDER BY ');
      fragment += gen.quoteTable(options.tableAs || model.name) + '.' + gen.quoteIdentifier(model.primaryKeyField);
    }
    if (options.offset || options.limit) {
      fragment += ' OFFSET ' + gen.escape(offset) + ' ROWS';
    }
    if (options.limit) {
      fragment += ' FETCH NEXT ' + gen.escape(options.limit) + ' ROWS ONLY';
    }
  }
  return fragment;
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
    const { primaryKeys, foreignKeys, attrStr } = extractCreateTableComponents(this, attributes);
    const values = {
      table: this.quoteTable(tableName),
      attributes: attrStr.join(', ')
    };
    appendUniqueKeys(this, values, options, tableName);
    appendPrimaryKey(this, values, primaryKeys);
    appendForeignKeys(this, values, foreignKeys);
    const query = "IF OBJECT_ID('<%= table %>', 'U') IS NULL CREATE TABLE <%= table %> (<%= attributes %>)";
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
    const query = 'ALTER TABLE <%= table %> ADD <%= attribute %>;';
    const attribute = _.template('<%= key %> <%= definition %>', this._templateSettings)({
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
    const query = 'ALTER TABLE <%= tableName %> <%= query %>;';
    const attrString = [];
    const constraintString = [];

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
    const query = "EXEC sp_rename '<%= tableName %>.<%= before %>', '<%= after %>', 'COLUMN';";
    const newName = Object.keys(attributes)[0];
    return _.template(query, this._templateSettings)({
      tableName: this.quoteTable(tableName),
      before: attrBefore,
      after: newName
    });
  },

  bulkInsertQuery(tableName, attrValueHashes, options, attributes) {
    options = options || {};
    attributes = attributes || {};

    const { allAttributes, needIdentityInsertWrapper } = collectBulkInsertAttributes(this, attrValueHashes, options, attributes);
    const tuples = allAttributes.length ? buildBulkInsertTuples(this, attrValueHashes, allAttributes) : [];
    const outputFragment = options.returning ? ' OUTPUT INSERTED.*' : undefined;

    const commands = generateBulkInsertCommands(this, tableName, allAttributes, tuples, outputFragment, needIdentityInsertWrapper);
    return commands.join(';');
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
    const targetAlias = this.quoteTable(`${tableName}_target`);
    const sourceAlias = this.quoteTable(`${tableName}_source`);
    const { primaryKeysAttrs, identityAttrs, uniqueAttrs } = extractModelKeyInfo(model);
    const tableQuoted = this.quoteTable(tableName);
    const insertKeys = Object.keys(insertValues);
    const insertKeysQuoted = insertKeys.map(k => this.quoteIdentifier(k)).join(', ');
    const insertValsEscaped = insertKeys.map(k => this.escape(insertValues[k])).join(', ');
    const sourceTableQuery = `VALUES(${insertValsEscaped})`;

    const clauses = filterValidClauses(where);
    const joinCondition = buildJoinCondition(this, targetAlias, sourceAlias, primaryKeysAttrs, uniqueAttrs, clauses);
    const updateSnippet = buildUpdateSnippet(this, targetAlias, updateValues, identityAttrs);
    const insertSnippet = `(${insertKeysQuoted}) VALUES(${insertValsEscaped})`;

    let query = `MERGE INTO ${tableQuoted} WITH(HOLDLOCK) AS ${targetAlias} USING (${sourceTableQuery}) AS ${sourceAlias}(${insertKeysQuoted}) ON ${joinCondition}`;
    query += ` WHEN MATCHED THEN UPDATE SET ${updateSnippet} WHEN NOT MATCHED THEN INSERT ${insertSnippet} OUTPUT $action, INSERTED.*;`;

    const needIdentityInsertWrapper = identityAttrs.some(k => updateValues[k] && updateValues[k] !== null);
    if (needIdentityInsertWrapper) {
      query = `SET IDENTITY_INSERT ${tableQuoted} ON; ${query} SET IDENTITY_INSERT ${tableQuoted} OFF;`;
    }
    return query;
  },

  deleteQuery(tableName, where, options) {
    options = options || {};
    const table = this.quoteTable(tableName);
    if (options.truncate) return 'TRUNCATE TABLE ' + table;

    where = this.getWhereConditions(where);
    let limit = '';
    if (_.isUndefined(options.limit)) options.limit = 1;
    if (options.limit) limit = ' TOP(' + this.escape(options.limit) + ')';

    const replacements = {
      limit,
      table,
      where: where ? ' WHERE ' + where : ''
    };
    const query = 'DELETE<%= limit %> FROM <%= table %><%= where %>; SELECT @@ROWCOUNT AS AFFECTEDROWS;';
    return _.template(query, this._templateSettings)(replacements);
  },

  showIndexesQuery(tableName) {
    const sql = "EXEC sys.sp_helpindex @objname = N'<%= tableName %>';";
    return _.template(sql, this._templateSettings)({ tableName: this.quoteTable(tableName) });
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
      template += ' CHECK (' + this.quoteIdentifier(attribute.field) + ' IN(' + _.map(attribute.values, v => this.escape(v)).join(', ') + '))';
      return template;
    } else {
      template = attribute.type.toString();
    }

    if (attribute.allowNull === false) template += ' NOT NULL';
    else if (!attribute.primaryKey && !Utils.defaultValueSchemable(attribute.defaultValue)) template += ' NULL';
    if (attribute.autoIncrement) template += ' IDENTITY(1,1)';
    if (attribute.type !== 'TEXT' && attribute.type._binary !== true && Utils.defaultValueSchemable(attribute.defaultValue)) {
      template += ' DEFAULT ' + this.escape(attribute.defaultValue);
    }
    if (attribute.unique === true) template += ' UNIQUE';
    if (attribute.primaryKey) template += ' PRIMARY KEY';
    if (attribute.references) {
      template += ' REFERENCES ' + this.quoteTable(attribute.references.model);
      template += ' (' + this.quoteIdentifier(attribute.references.key || 'id') + ')';
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
        if (existingConstraints.indexOf(attribute.references.model.toString()) !== -1) {
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
    const tbl = wrapSingleQuote(table.tableName || table);
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
      `AND K.TABLE_NAME = ${tbl};`
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

  selectFromTableFragment(options, model, attributes, tables, mainTableAs, where) {
    if (semver.valid(this.sequelize.options.databaseVersion) && semver.lt(this.sequelize.options.databaseVersion, '11.0.0')) {
      if (options.offset) {
        return buildLegacySelectFragment(this, options, model, attributes, tables, mainTableAs, where);
      }
      const top = options.limit ? 'TOP ' + options.limit + ' ' : '';
      let fragment = 'SELECT ' + top + attributes.join(', ') + ' FROM ' + tables;
      if (mainTableAs) fragment += ' AS ' + mainTableAs;
      if (options.tableHint && TableHints[options.tableHint]) fragment += ` WITH (${TableHints[options.tableHint]})`;
      return fragment;
    }

    let mainFragment = 'SELECT ' + attributes.join(', ') + ' FROM ' + tables;
    if (mainTableAs) mainFragment += ' AS ' + mainTableAs;
    if (options.tableHint && TableHints[options.tableHint]) mainFragment += ` WITH (${TableHints[options.tableHint]})`;
    return mainFragment;
  },

  addLimitAndOffset(options, model) {
    if (semver.valid(this.sequelize.options.databaseVersion) && semver.lt(this.sequelize.options.databaseVersion, '11.0.0')) {
      return '';
    }
    return buildModernLimitOffset(this, options, model);
  },

  booleanValue(value) {
    return value ? 1 : 0;
  }
};

module.exports = QueryGenerator;