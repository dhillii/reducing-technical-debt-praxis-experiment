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

/* private helper */
function wrapSingleQuote(identifier) {
  return Utils.addTicks(Utils.removeTicks(identifier, "'"), "'");
}

/* QueryGenerator definition */
const QueryGenerator = {
  __proto__: AbstractQueryGenerator,
  options: {},
  dialect: 'mssql',

  /* ---------- Schema ---------- */
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

  /* ---------- Table creation ---------- */
  createTableQuery(tableName, attributes, options) {
    const info = this._collectAttributeInfo(attributes);
    const values = {
      table: this.quoteTable(tableName),
      attributes: this._buildAttributesString(info, options)
    };
    const query = "IF OBJECT_ID('<%= table %>', 'U') IS NULL CREATE TABLE <%= table %> (<%= attributes %>)";
    return _.template(query, this._templateSettings)(values).trim() + ';';
  },

  _collectAttributeInfo(attributes) {
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

    return { primaryKeys, foreignKeys, attrStr };
  },

  _buildAttributesString(info, options) {
    let attributes = info.attrStr.join(', ');
    const pkString = info.primaryKeys.map(pk => this.quoteIdentifier(pk)).join(', ');

    if (options.uniqueKeys) {
      _.each(options.uniqueKeys, (columns, indexName) => {
        if (columns.customIndex) {
          if (!_.isString(indexName)) {
            indexName = 'uniq_' + options.tableName + '_' + columns.fields.join('_');
          }
          attributes += `, CONSTRAINT ${this.quoteIdentifier(indexName)} UNIQUE (${columns.fields.map(f => this.quoteIdentifier(f)).join(', ')})`;
        }
      });
    }

    if (pkString.length) {
      attributes += `, PRIMARY KEY (${pkString})`;
    }

    for (const fkey in info.foreignKeys) {
      if (!info.foreignKeys.hasOwnProperty(fkey)) continue;
      attributes += ', FOREIGN KEY (' + this.quoteIdentifier(fkey) + ') ' + info.foreignKeys[fkey];
    }

    return attributes;
  },

  /* ---------- Table description ---------- */
  describeTableQuery(tableName, schema) {
    let sql = [
      'SELECT',
      "c.COLUMN_NAME AS \'Name\',",
      "c.DATA_TYPE AS \'Type\',",
      "c.CHARACTER_MAXIMUM_LENGTH AS \'Length\',",
      "c.IS_NULLABLE as \'IsNull\',",
      "COLUMN_DEFAULT AS \'Default\',",
      "pk.CONSTRAINT_TYPE AS \'Constraint\',",
      "COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA+\'.\'+c.TABLE_NAME), c.COLUMN_NAME, \'IsIdentity\') as \'IsIdentity\'",
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
      finalQuery += constraintString.length ? ' ' : '';
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

  /* ---------- Bulk Insert ---------- */
  bulkInsertQuery(tableName, attrValueHashes, options, attributes) {
    options = options || {};
    attributes = attributes || {};

    const { needIdentityInsertWrapper, outputFragment, allAttributes, allQueries, tuples } =
      this._prepareBulkInsert(attrValueHashes, options, attributes, tableName);

    const commands = this._buildBulkInsertCommands(tableName, allAttributes, allQueries, tuples, outputFragment, needIdentityInsertWrapper);
    return commands.join(';');
  },

  _prepareBulkInsert(attrValueHashes, options, attributes, tableName) {
    const query = 'INSERT INTO <%= table %> (<%= attributes %>)<%= output %> VALUES <%= tuples %>;',
      emptyQuery = 'INSERT INTO <%= table %><%= output %> DEFAULT VALUES';
    const tuples = [];
    const allAttributes = [];
    const allQueries = [];

    let needIdentityInsertWrapper = false;
    let outputFragment;

    if (options.returning) {
      outputFragment = ' OUTPUT INSERTED.*';
    }

    _.forEach(attrValueHashes, attrValueHash => {
      const fields = Object.keys(attrValueHash);
      const firstAttr = attributes[fields[0]];
      if (fields.length === 1 && firstAttr && firstAttr.autoIncrement && attrValueHash[fields[0]] === null) {
        allQueries.push(emptyQuery);
        return;
      }

      _.forOwn(attrValueHash, (value, key) => {
        if (value !== null && attributes[key] && attributes[key].autoIncrement) {
          needIdentityInsertWrapper = true;
        }
        if (allAttributes.indexOf(key) === -1) {
          if (value === null && attributes[key] && attributes[key].autoIncrement) return;
          allAttributes.push(key);
        }
      });
    });

    if (allAttributes.length > 0) {
      _.forEach(attrValueHashes, attrValueHash => {
        tuples.push('(' + allAttributes.map(key => this.escape(attrValueHash[key])).join(',') + ')');
      });
      allQueries.push(query);
    }

    return { needIdentityInsertWrapper, outputFragment, allAttributes, allQueries, tuples };
  },

  _buildBulkInsertCommands(tableName, allAttributes, allQueries, tuples, outputFragment, needIdentityInsertWrapper) {
    const commands = [];
    let offset = 0;
    const batch = Math.floor(250 / (allAttributes.length + 1)) + 1;
    while (offset < Math.max(tuples.length, 1)) {
      const replacements = {
        table: this.quoteTable(tableName),
        attributes: allAttributes.map(attr => this.quoteIdentifier(attr)).join(','),
        tuples: tuples.slice(offset, Math.min(tuples.length, offset + batch)),
        output: outputFragment
      };
      let generatedQuery = _.template(allQueries.join(';'), this._templateSettings)(replacements);
      if (needIdentityInsertWrapper) {
        generatedQuery = [
          'SET IDENTITY_INSERT', this.quoteTable(tableName), 'ON;',
          generatedQuery,
          'SET IDENTITY_INSERT', this.quoteTable(tableName), 'OFF;'
        ].join(' ');
      }
      commands.push(generatedQuery);
      offset += batch;
    }
    return commands;
  },

  /* ---------- Update ---------- */
  updateQuery(tableName, attrValueHash, where, options, attributes) {
    let sql = super.updateQuery(tableName, attrValueHash, where, options, attributes);
    if (options.limit) {
      const updateArgs = `UPDATE TOP(${this.escape(options.limit)})`;
      sql = sql.replace('UPDATE', updateArgs);
    }
    return sql;
  },

  /* ---------- Upsert ---------- */
  upsertQuery(tableName, insertValues, updateValues, where, model) {
    const {
      primaryKeysAttrs,
      uniqueAttrs,
      identityAttrs,
      needIdentityInsertWrapper,
      joinCondition,
      updateSnippet,
      insertSnippet
    } = this._prepareUpsert(tableName, insertValues, updateValues, where, model);

    const tableNameQuoted = this.quoteTable(tableName);
    const sourceTableQuery = `VALUES(${Object.keys(insertValues).map(k => this.escape(insertValues[k])).join(', ')})`;
    let query = `MERGE INTO ${tableNameQuoted} WITH(HOLDLOCK) AS ${this.quoteTable(tableName + '_target')} USING (${sourceTableQuery}) AS ${this.quoteTable(tableName + '_source')}(${Object.keys(insertValues).map(k => this.quoteIdentifier(k)).join(', ')}) ON ${joinCondition}`;
    query += ` WHEN MATCHED THEN UPDATE SET ${updateSnippet} WHEN NOT MATCHED THEN INSERT ${insertSnippet} OUTPUT $action, INSERTED.*;`;
    if (needIdentityInsertWrapper) {
      query = `SET IDENTITY_INSERT ${tableNameQuoted} ON; ${query} SET IDENTITY_INSERT ${tableNameQuoted} OFF;`;
    }
    return query;
  },

  _prepareUpsert(tableName, insertValues, updateValues, where, model) {
    const primaryKeysAttrs = [];
    const uniqueAttrs = [];
    const identityAttrs = [];

    for (const key in model.rawAttributes) {
      const attr = model.rawAttributes[key];
      if (attr.primaryKey) primaryKeysAttrs.push(attr.field || key);
      if (attr.unique) uniqueAttrs.push(attr.field || key);
      if (attr.autoIncrement) identityAttrs.push(attr.field || key);
    }

    model.options.indexes?.forEach(index => {
      if (index.unique && index.fields) {
        index.fields.forEach(field => {
          const fieldName = typeof field === 'string' ? field : field.name || field.attribute;
          if (uniqueAttrs.indexOf(fieldName) === -1 && model.rawAttributes[fieldName]) {
            uniqueAttrs.push(fieldName);
          }
        });
      }
    });

    const needIdentityInsertWrapper = identityAttrs.some(key => updateValues[key] && updateValues[key] !== null);

    const clauses = where[Op.or].filter(clause => {
      for (const key in clause) {
        if (!clause[key]) return false;
      }
      return true;
    });

    const joinCondition = this._determineJoinCondition(clauses, primaryKeysAttrs, uniqueAttrs, tableName);

    const updateSnippet = this._buildUpdateSnippet(updateValues, identityAttrs);
    const insertSnippet = this._buildInsertSnippet(insertValues);

    return {
      primaryKeysAttrs,
      uniqueAttrs,
      identityAttrs,
      needIdentityInsertWrapper,
      joinCondition,
      updateSnippet,
      insertSnippet
    };
  },

  _determineJoinCondition(clauses, primaryKeysAttrs, uniqueAttrs, tableName) {
    const targetAlias = this.quoteTable(`${tableName}_target`);
    const sourceAlias = this.quoteTable(`${tableName}_source`);
    const getJoinSnippet = arr => arr.map(key => `${targetAlias}.${this.quoteIdentifier(key)} = ${sourceAlias}.${this.quoteIdentifier(key)}`);

    if (clauses.length === 0) {
      throw new Error('Primary Key or Unique key should be passed to upsert query');
    }

    for (const clause of clauses) {
      const keys = Object.keys(clause);
      if (primaryKeysAttrs.includes(keys[0])) {
        return getJoinSnippet(primaryKeysAttrs).join(' AND ');
      }
    }
    return getJoinSnippet(uniqueAttrs).join(' AND ');
  },

  _buildUpdateSnippet(updateValues, identityAttrs) {
    return Object.keys(updateValues)
      .filter(key => !identityAttrs.includes(key))
      .map(key => {
        const value = this.escape(updateValues[key]);
        const quotedKey = this.quoteIdentifier(key);
        const targetAlias = this.quoteTable(`${key}_target`);
        return `${targetAlias}.${quotedKey} = ${value}`;
      })
      .join(', ');
  },

  _buildInsertSnippet(insertValues) {
    const keys = Object.keys(insertValues);
    const quotedKeys = keys.map(k => this.quoteIdentifier(k)).join(', ');
    const escapedVals = keys.map(k => this.escape(insertValues[k])).join(', ');
    return `(${quotedKeys}) VALUES(${escapedVals})`;
  },

  /* ---------- Delete ---------- */
  deleteQuery(tableName, where, options) {
    options = options || {};

    const table = this.quoteTable(tableName);
    if (options.truncate === true) {
      return 'TRUNCATE TABLE ' + table;
    }

    where = this.getWhereConditions(where);
    let limit = '';
    const query = 'DELETE<%= limit %> FROM <%= table %><%= where %>; SELECT @@ROWCOUNT AS AFFECTEDROWS;';

    if (_.isUndefined(options.limit)) {
      options.limit = 1;
    }

    if (options.limit) {
      limit = ' TOP(' + this.escape(options.limit) + ')';
    }

    const replacements = { limit, table, where };
    if (replacements.where) {
      replacements.where = ' WHERE ' + replacements.where;
    }

    return _.template(query, this._templateSettings)(replacements);
  },

  /* ---------- Indexes & Constraints ---------- */
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
    if (!_.isPlainObject(attribute)) {
      attribute = { type: attribute };
    }

    if (attribute.references) {
      if (attribute.Model && attribute.Model.tableName === attribute.references.model) {
        this.sequelize.log('MSSQL does not support self referencial constraints, we will remove it but we recommend restructuring your query');
        attribute.onDelete = '';
        attribute.onUpdate = '';
      }
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

    if (attribute.allowNull === false) {
      template += ' NOT NULL';
    } else if (!attribute.primaryKey && !Utils.defaultValueSchemable(attribute.defaultValue)) {
      template += ' NULL';
    }

    if (attribute.autoIncrement) template += ' IDENTITY(1,1)';

    if (attribute.type !== 'TEXT' && attribute.type._binary !== true && Utils.defaultValueSchemable(attribute.defaultValue)) {
      template += ' DEFAULT ' + this.escape(attribute.defaultValue);
    }

    if (attribute.unique === true) template += ' UNIQUE';
    if (attribute.primaryKey) template += ' PRIMARY KEY';

    if (attribute.references) {
      template += ' REFERENCES ' + this.quoteTable(attribute.references.model);
      if (attribute.references.key) {
        template += ' (' + this.quoteIdentifier(attribute.references.key) + ')';
      } else {
        template += ' (' + this.quoteIdentifier('id') + ')';
      }
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

  /* ---------- Triggers & Functions (not supported) ---------- */
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
    if (table.schema) {
      sql += ' AND SCHEMA_NAME(TB.SCHEMA_ID) =' + wrapSingleQuote(table.schema);
    }
    return sql;
  },

  getForeignKeyQuery(table, attributeName) {
    const tableName = table.tableName || table;
    let sql = this._getForeignKeysQueryPrefix() + ' WHERE TB.NAME =' + wrapSingleQuote(tableName) + ' AND COL.NAME =' + wrapSingleQuote(attributeName);
    if (table.schema) {
      sql += ' AND SCHEMA_NAME(TB.SCHEMA_ID) =' + wrapSingleQuote(table.schema);
    }
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
    if (transaction.parent) {
      return 'SAVE TRANSACTION ' + this.quoteIdentifier(transaction.name) + ';';
    }
    return 'BEGIN TRANSACTION;';
  },

  commitTransactionQuery(transaction) {
    if (transaction.parent) return;
    return 'COMMIT TRANSACTION;';
  },

  rollbackTransactionQuery(transaction) {
    if (transaction.parent) {
      return 'ROLLBACK TRANSACTION ' + this.quoteIdentifier(transaction.name) + ';';
    }
    return 'ROLLBACK TRANSACTION;';
  },

  /* ---------- Select fragment ---------- */
  selectFromTableFragment(options, model, attributes, tables, mainTableAs, where) {
    if (this._useLegacyTop(options)) {
      return this._buildLegacySelectFragment(options, model, attributes, tables, mainTableAs, where);
    }

    let fragment = 'SELECT ' + attributes.join(', ') + ' FROM ' + tables;
    if (mainTableAs) fragment += ' AS ' + mainTableAs;
    if (options.tableHint && TableHints[options.tableHint]) {
      fragment += ` WITH (${TableHints[options.tableHint]})`;
    }
    return fragment;
  },

  _useLegacyTop(options) {
    return semver.valid(this.sequelize.options.databaseVersion) &&
      semver.lt(this.sequelize.options.databaseVersion, '11.0.0');
  },

  _buildLegacySelectFragment(options, model, attributes, tables, mainTableAs, where) {
    let topFragment = '';
    if (options.limit) topFragment = 'TOP ' + options.limit + ' ';
    if (!options.offset) {
      let fragment = 'SELECT ' + topFragment + attributes.join(', ') + ' FROM ' + tables;
      if (mainTableAs) fragment += ' AS ' + mainTableAs;
      return fragment;
    }

    const offset = options.offset || 0;
    const isSubQuery = options.hasIncludeWhere || options.hasIncludeRequired || options.hasMultiAssociation;
    const orders = this.getQueryOrders(options, model, isSubQuery);
    if (!orders.mainQueryOrder.length) {
      orders.mainQueryOrder.push(this.quoteIdentifier(model.primaryKeyField));
    }
    const tmpTable = mainTableAs ? mainTableAs : 'OffsetTable';
    const whereFragment = where ? ' WHERE ' + where : '';
    return 'SELECT TOP 100 PERCENT ' + attributes.join(', ') + ' FROM (' +
      'SELECT ' + topFragment + '* FROM (' +
      'SELECT ROW_NUMBER() OVER (ORDER BY ' + orders.mainQueryOrder.join(', ') + ') as row_num, * ' +
      'FROM ' + tables + ' AS ' + tmpTable + whereFragment + ')' +
      ' AS ' + tmpTable + ' WHERE row_num > ' + offset + ')' +
      ' AS ' + tmpTable;
  },

  /* ---------- Limit & Offset ---------- */
  addLimitAndOffset(options, model) {
    if (this._useLegacyTop(options)) return '';
    const offset = options.offset || 0;
    const isSubQuery = options.subQuery === undefined
      ? options.hasIncludeWhere || options.hasIncludeRequired || options.hasMultiAssociation
      : options.subQuery;

    let fragment = '';
    const orders = options.order ? this.getQueryOrders(options, model, isSubQuery) : {};

    if (options.limit || options.offset) {
      if (!options.order || (options.include && !orders.subQueryOrder.length)) {
        fragment += (options.order && !isSubQuery ? ', ' : ' ORDER BY ');
        fragment += this.quoteTable(options.tableAs || model.name) + '.' + this.quoteIdentifier(model.primaryKeyField);
      }
      if (options.offset || options.limit) {
        fragment += ' OFFSET ' + this.escape(offset) + ' ROWS';
      }
      if (options.limit) {
        fragment += ' FETCH NEXT ' + this.escape(options.limit) + ' ROWS ONLY';
      }
    }
    return fragment;
  },

  booleanValue(value) {
    return value ? 1 : 0;
  }
};

module.exports = QueryGenerator;