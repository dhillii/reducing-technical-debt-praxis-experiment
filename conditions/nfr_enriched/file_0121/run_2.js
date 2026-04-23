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
const throwMethodUndefined = function(methodName) {
  throw new Error('The method "' + methodName + '" is not defined! Please add it to your sql dialect.');
};

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
    // Mimics Postgres CASCADE, will drop objects belonging to the schema
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
    // Uses string manipulation to convert the MS Maj.Min.Patch.Build to semver Maj.Min.Patch
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

    this._processTableAttributes(attributes, primaryKeys, foreignKeys, attrStr);

    const values = {
        table: this.quoteTable(tableName),
        attributes: attrStr.join(', ')
      },
      pkString = primaryKeys.map(pk => { return this.quoteIdentifier(pk); }).join(', ');

    this._addUniqueConstraints(options, tableName, values);

    if (pkString.length > 0) {
      values.attributes += `, PRIMARY KEY (${pkString})`;
    }

    this._addForeignKeyConstraints(foreignKeys, values);

    return _.template(query, this._templateSettings)(values).trim() + ';';
  },

  _processTableAttributes(attributes, primaryKeys, foreignKeys, attrStr) {
    // Process each attribute and categorize them
    for (const attr in attributes) {
      if (attributes.hasOwnProperty(attr)) {
        const dataType = attributes[attr];
        let match;

        if (_.includes(dataType, 'PRIMARY KEY')) {
          primaryKeys.push(attr);
          this._handlePrimaryKeyAttribute(attr, dataType, foreignKeys, attrStr);
        } else if (_.includes(dataType, 'REFERENCES')) {
          this._handleReferencesAttribute(attr, dataType, foreignKeys, attrStr);
        } else {
          attrStr.push(this.quoteIdentifier(attr) + ' ' + dataType);
        }
      }
    }
  },

  _handlePrimaryKeyAttribute(attr, dataType, foreignKeys, attrStr) {
    // Handle attributes that are primary keys
    if (_.includes(dataType, 'REFERENCES')) {
      const match = dataType.match(/^(.+) (REFERENCES.*)$/);
      attrStr.push(this.quoteIdentifier(attr) + ' ' + match[1].replace(/PRIMARY KEY/, ''));
      foreignKeys[attr] = match[2];
    } else {
      attrStr.push(this.quoteIdentifier(attr) + ' ' + dataType.replace(/PRIMARY KEY/, ''));
    }
  },

  _handleReferencesAttribute(attr, dataType, foreignKeys, attrStr) {
    // Handle attributes with REFERENCES clause
    const match = dataType.match(/^(.+) (REFERENCES.*)$/);
    attrStr.push(this.quoteIdentifier(attr) + ' ' + match[1]);
    foreignKeys[attr] = match[2];
  },

  _addUniqueConstraints(options, tableName, values) {
    // Add unique constraints from options
    if (options.uniqueKeys) {
      _.each(options.uniqueKeys, (columns, indexName) => {
        if (columns.customIndex) {
          if (!_.isString(indexName)) {
            indexName = 'uniq_' + tableName + '_' + columns.fields.join('_');
          }
          values.attributes += `, CONSTRAINT ${this.quoteIdentifier(indexName)} UNIQUE (${columns.fields.map(field => this.quoteIdentifier(field)).join(', ')})`;
        }
      });
    }
  },

  _addForeignKeyConstraints(foreignKeys, values) {
    // Add foreign key constraints
    for (const fkey in foreignKeys) {
      if (foreignKeys.hasOwnProperty(fkey)) {
        values.attributes += ', FOREIGN KEY (' + this.quoteIdentifier(fkey) + ') ' + foreignKeys[fkey];
      }
    }
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
    const values = {
      table: this.quoteTable(tableName)
    };

    return _.template(query, this._templateSettings)(values).trim() + ';';
  },

  addColumnQuery(table, key, dataType) {
    // FIXME: attributeToSQL SHOULD be using attributes in addColumnQuery
    //        but instead we need to pass the key along as the field here
    dataType.field = key;

    const query = 'ALTER TABLE <%= table %> ADD <%= attribute %>;',
      attribute = _.template('<%= key %> <%= definition %>', this._templateSettings)({
        key: this.quoteIdentifier(key),
        definition: this.attributeToSQL(dataType, {
          context: 'addColumn'
        })
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
    const attrString = [],
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
    const query = "EXEC sp_rename '<%= tableName %>.<%= before %>', '<%= after %>', 'COLUMN';",
      newName = Object.keys(attributes)[0];

    return _.template(query, this._templateSettings)({
      tableName: this.quoteTable(tableName),
      before: attrBefore,
      after: newName
    });
  },

  bulkInsertQuery(tableName, attrValueHashes, options, attributes) {
    options = options || {};
    attributes = attributes || {};
    const query = 'INSERT INTO <%= table %> (<%= attributes %>)<%= output %> VALUES <%= tuples %>;',
      emptyQuery = 'INSERT INTO <%= table %><%= output %> DEFAULT VALUES',
      tuples = [],
      allAttributes = [],
      allQueries = [];

    let needIdentityInsertWrapper = false,
      outputFragment;

    if (options.returning) {
      outputFragment = ' OUTPUT INSERTED.*';
    }

    this._processBulkInsertHashes(attrValueHashes, attributes, allQueries, allAttributes, emptyQuery);

    if (allAttributes.length > 0) {
      this._buildBulkInsertTuples(attrValueHashes, allAttributes, tuples);
      allQueries.push(query);
    }

    needIdentityInsertWrapper = this._checkNeedIdentityInsert(attrValueHashes, attributes);

    const commands = this._generateBulkInsertCommands(
      tableName, allQueries, allAttributes, tuples, outputFragment, needIdentityInsertWrapper
    );

    return commands.join(';');
  },

  _processBulkInsertHashes(attrValueHashes, attributes, allQueries, allAttributes, emptyQuery) {
    // Process each hash to identify attributes and handle empty objects
    _.forEach(attrValueHashes, attrValueHash => {
      const fields = Object.keys(attrValueHash);
      const firstAttr = attributes[fields[0]];
      if (fields.length === 1 && firstAttr && firstAttr.autoIncrement && attrValueHash[fields[0]] === null) {
        allQueries.push(emptyQuery);
        return;
      }

      _.forOwn(attrValueHash, (value, key) => {
        if (allAttributes.indexOf(key) === -1) {
          if (value === null && attributes[key] && attributes[key].autoIncrement)
            return;
          allAttributes.push(key);
        }
      });
    });
  },

  _buildBulkInsertTuples(attrValueHashes, allAttributes, tuples) {
    // Build tuple values for bulk insert
    _.forEach(attrValueHashes, attrValueHash => {
      tuples.push('(' +
        allAttributes.map(key =>
          this.escape(attrValueHash[key])).join(',') +
      ')');
    });
  },

  _checkNeedIdentityInsert(attrValueHashes, attributes) {
    // Check if IDENTITY_INSERT wrapper is needed
    let needIdentityInsertWrapper = false;
    _.forEach(attrValueHashes, attrValueHash => {
      _.forOwn(attrValueHash, (value, key) => {
        if (value !== null && attributes[key] && attributes[key].autoIncrement) {
          needIdentityInsertWrapper = true;
        }
      });
    });
    return needIdentityInsertWrapper;
  },

  _generateBulkInsertCommands(tableName, allQueries, allAttributes, tuples, outputFragment, needIdentityInsertWrapper) {
    // Generate bulk insert commands with batching
    const commands = [];
    let offset = 0;
    const batch = Math.floor(250 / (allAttributes.length + 1)) + 1;

    while (offset < Math.max(tuples.length, 1)) {
      const replacements = {
        table: this.quoteTable(tableName),
        attributes: allAttributes.map(attr =>
          this.quoteIdentifier(attr)).join(','),
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

  updateQuery(tableName, attrValueHash, where, options, attributes) {
    let sql = super.updateQuery(tableName, attrValueHash, where, options, attributes);
    if (options.limit) {
      const updateArgs = `UPDATE TOP(${this.escape(options.limit)})`;
      sql = sql.replace('UPDATE', updateArgs);
    }
    return sql;
  },

  upsertQuery(tableName, insertValues, updateValues, where, model) {
    const targetTableAlias = this.quoteTable(`${tableName}_target`);
    const sourceTableAlias = this.quoteTable(`${tableName}_source`);
    const tableNameQuoted = this.quoteTable(tableName);

    const primaryKeysAttrs = this._extractPrimaryKeys(model);
    const identityAttrs = this._extractIdentityAttrs(model);
    const uniqueAttrs = this._extractUniqueAttrs(model);

    let needIdentityInsertWrapper = this._checkUpsertIdentityInsert(identityAttrs, updateValues);

    const clauses = this._filterUpsertClauses(where);

    if (clauses.length === 0) {
      throw new Error('Primary Key or Unique key should be passed to upsert query');
    }

    const joinCondition = this._buildUpsertJoinCondition(
      clauses, primaryKeysAttrs, uniqueAttrs, targetTableAlias, sourceTableAlias
    );

    const insertKeysQuoted = Object.keys(insertValues).map(key => this.quoteIdentifier(key)).join(', ');
    const insertValuesEscaped = Object.keys(insertValues).map(key => this.escape(insertValues[key])).join(', ');
    const sourceTableQuery = `VALUES(${insertValuesEscaped})`;

    const updateSnippet = this._buildUpsertUpdateSnippet(
      updateValues, identityAttrs, targetTableAlias
    );

    const insertSnippet = `(${insertKeysQuoted}) VALUES(${insertValuesEscaped})`;
    let query = `MERGE INTO ${tableNameQuoted} WITH(HOLDLOCK) AS ${targetTableAlias} USING (${sourceTableQuery}) AS ${sourceTableAlias}(${insertKeysQuoted}) ON ${joinCondition}`;
    query += ` WHEN MATCHED THEN UPDATE SET ${updateSnippet} WHEN NOT MATCHED THEN INSERT ${insertSnippet} OUTPUT $action, INSERTED.*;`;

    if (needIdentityInsertWrapper) {
      query = `SET IDENTITY_INSERT ${tableNameQuoted} ON; ${query} SET IDENTITY_INSERT ${tableNameQuoted} OFF;`;
    }

    return query;
  },

  _extractPrimaryKeys(model) {
    // Extract primary key attributes from model
    const primaryKeysAttrs = [];
    for (const key in model.rawAttributes) {
      if (model.rawAttributes[key].primaryKey) {
        primaryKeysAttrs.push(model.rawAttributes[key].field || key);
      }
    }
    return primaryKeysAttrs;
  },

  _extractIdentityAttrs(model) {
    // Extract identity/autoIncrement attributes from model
    const identityAttrs = [];
    for (const key in model.rawAttributes) {
      if (model.rawAttributes[key].autoIncrement) {
        identityAttrs.push(model.rawAttributes[key].field || key);
      }
    }
    return identityAttrs;
  },

  _extractUniqueAttrs(model) {
    // Extract unique attributes from model including index definitions
    const uniqueAttrs = [];
    for (const key in model.rawAttributes) {
      if (model.rawAttributes[key].unique) {
        uniqueAttrs.push(model.rawAttributes[key].field || key);
      }
    }

    for (const index of model.options.indexes) {
      if (index.unique && index.fields) {
        for (const field of index.fields) {
          const fieldName = typeof field === 'string' ? field : field.name || field.attribute;
          if (uniqueAttrs.indexOf(fieldName) === -1 && model.rawAttributes[fieldName]) {
            uniqueAttrs.push(fieldName);
          }
        }
      }
    }

    return uniqueAttrs;
  },

  _checkUpsertIdentityInsert(identityAttrs, updateValues) {
    // Check if IDENTITY_INSERT is needed for upsert
    let needIdentityInsertWrapper = false;
    identityAttrs.forEach(key => {
      if (updateValues[key] && updateValues[key] !== null) {
        needIdentityInsertWrapper = true;
      }
    });
    return needIdentityInsertWrapper;
  },

  _filterUpsertClauses(where) {
    // Filter NULL clauses from where conditions
    return where[Op.or].filter(clause => {
      let valid = true;
      for (const key in clause) {
        if (!clause[key]) {
          valid = false;
          break;
        }
      }
      return valid;
    });
  },

  _buildUpsertJoinCondition(clauses, primaryKeysAttrs, uniqueAttrs, targetTableAlias, sourceTableAlias) {
    // Build JOIN condition for MERGE statement
    const getJoinSnippet = array => {
      return array.map(key => {
        key = this.quoteIdentifier(key);
        return `${targetTableAlias}.${key} = ${sourceTableAlias}.${key}`;
      });
    };

    let joinCondition;
    for (const key in clauses) {
      const keys = Object.keys(clauses[key]);
      if (primaryKeysAttrs.indexOf(keys[0]) !== -1) {
        joinCondition = getJoinSnippet(primaryKeysAttrs).join(' AND ');
        break;
      }
    }

    if (!joinCondition) {
      joinCondition = getJoinSnippet(uniqueAttrs).join(' AND ');
    }

    return joinCondition;
  },

  _buildUpsertUpdateSnippet(updateValues, identityAttrs, targetTableAlias) {
    // Build UPDATE snippet for MERGE statement
    return Object.keys(updateValues).filter(key => {
      return identityAttrs.indexOf(key) === -1;
    })
      .map(key => {
        const value = this.escape(updateValues[key]);
        const quotedKey = this.quoteIdentifier(key);
        return `${targetTableAlias}.${quotedKey} = ${value}`;
      }).join(', ');
  },

  deleteQuery(tableName, where, options) {
    options = options || {};

    const table = this.quoteTable(tableName);
    if (options.truncate === true) {
      // Truncate does not allow LIMIT and WHERE
      return 'TRUNCATE TABLE ' + table;
    }

    where = this.getWhereConditions(where);
    let limit = '';
    const query = 'DELETE<%= limit %> FROM <%= table %><%= where %>; ' +
                'SELECT @@ROWCOUNT AS AFFECTEDROWS;';

    if (_.isUndefined(options.limit)) {
      options.limit = 1;
    }

    if (options.limit) {
      limit = ' TOP(' + this.escape(options.limit) + ')';
    }

    const replacements = {
      limit,
      table,
      where
    };

    if (replacements.where) {
      replacements.where = ' WHERE ' + replacements.where;
    }

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
    if (!_.isPlainObject(attribute)) {
      attribute = {
        type: attribute
      };
    }

    // handle self referential constraints
    if (attribute.references) {
      if (attribute.Model && attribute.Model.tableName === attribute.references.model) {
        this.sequelize.log('MSSQL does not support self referencial constraints, '
          + 'we will remove it but we recommend restructuring your query');
        attribute.onDelete = '';
        attribute.onUpdate = '';
      }
    }

    let template = this._buildAttributeTemplate(attribute);

    if (attribute.allowNull === false) {
      template += ' NOT NULL';
    } else if (!attribute.primaryKey && !Utils.defaultValueSchemable(attribute.defaultValue)) {
      template += ' NULL';
    }

    if (attribute.autoIncrement) {
      template += ' IDENTITY(1,1)';
    }

    // Blobs/texts cannot have a defaultValue
    if (attribute.type !== 'TEXT' && attribute.type._binary !== true &&
        Utils.defaultValueSchemable(attribute.defaultValue)) {
      template += ' DEFAULT ' + this.escape(attribute.defaultValue);
    }

    if (attribute.unique === true) {
      template += ' UNIQUE';
    }

    if (attribute.primaryKey) {
      template += ' PRIMARY KEY';
    }

    if (attribute.references) {
      template += this._buildReferenceClause(attribute);
    }

    return template;
  },

  _buildAttributeTemplate(attribute) {
    // Build base template for attribute type
    if (attribute.type instanceof DataTypes.ENUM) {
      if (attribute.type.values && !attribute.values) attribute.values = attribute.type.values;

      let template = attribute.type.toSql();
      template += ' CHECK (' + this.quoteIdentifier(attribute.field) + ' IN(' + _.map(attribute.values, value => {
        return this.escape(value);
      }).join(', ') + '))';
      return template;
    } else {
      return attribute.type.toString();
    }
  },

  _buildReferenceClause(attribute) {
    // Build REFERENCES clause for attribute
    let clause = ' REFERENCES ' + this.quoteTable(attribute.references.model);

    if (attribute.references.key) {
      clause += ' (' + this.quoteIdentifier(attribute.references.key) + ')';
    } else {
      clause += ' (' + this.quoteIdentifier('id') + ')';
    }

    if (attribute.onDelete) {
      clause += ' ON DELETE ' + attribute.onDelete.toUpperCase();
    }

    if (attribute.onUpdate) {
      clause += ' ON UPDATE ' + attribute.onUpdate.toUpperCase();
    }

    return clause;
  },

  attributesToSQL(attributes, options) {
    const result = {},
      existingConstraints = [];
    let key,
      attribute;

    for (key in attributes) {
      attribute = attributes[key];

      if (attribute.references) {
        if (existingConstraints.indexOf(attribute.references.model.toString()) !== -1) {
          // no cascading constraints to a table more than once
          attribute.onDelete = '';
          attribute.onUpdate = '';
        } else {
          existingConstraints.push(attribute.references.model.toString());

          // NOTE: this really just disables cascading updates for all
          //       definitions. Can be made more robust to support the
          //       few cases where MSSQL actually supports them
          attribute.onUpdate = '';
        }
      }

      if (key && !attribute.field) attribute.field = key;
      result[attribute.field || key] = this.attributeToSQL(attribute, options);
    }

    return result;
  },

  createTrigger() {
    throwMethodUndefined('createTrigger');
  },

  dropTrigger() {
    throwMethodUndefined('dropTrigger');
  },

  renameTrigger() {
    throwMethodUndefined('renameTrigger');
  },

  createFunction() {
    throwMethodUndefined('createFunction');
  },

  dropFunction() {
    throwMethodUndefined('dropFunction');
  },

  renameFunction() {
    throwMethodUndefined('renameFunction');
  },

  quoteIdentifier(identifier) {
    if (identifier === '*') return identifier;
    return '[' + identifier.replace(/[\[\]']+/g, '') + ']';
  },

  /**
   * Generate common SQL prefix for ForeignKeysQuery.
   * @returns {String}
   */
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

  /**
   * Generates an SQL query that returns all foreign keys details of a table.
   * @param {Stirng|Object} table
   * @param {String} catalogName database name
   * @returns {String}
   */
  getForeignKeysQuery(table, catalogName) {
    const tableName = table.tableName || table;
    let sql = this._getForeignKeysQueryPrefix(catalogName) +
      ' WHERE TB.NAME =' + wrapSingleQuote(tableName);

    if (table.schema) {
      sql += ' AND SCHEMA_NAME(TB.SCHEMA_ID) =' + wrapSingleQuote(table.schema);
    }
    return sql;
  },

  getForeignKeyQuery(table, attributeName) {
    const tableName = table.tableName || table;
    let sql = this._getForeignKeysQueryPrefix() +
      ' WHERE TB.NAME =' + wrapSingleQuote(tableName) +
      ' AND COL.NAME =' + wrapSingleQuote(attributeName);

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

  setAutocommitQuery() {
    return '';
  },

  setIsolationLevelQuery() {

  },

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
    if (transaction.parent) {
      return;
    }

    return 'COMMIT TRANSACTION;';
  },

  rollbackTransactionQuery(transaction) {
    if (transaction.parent) {
      return 'ROLLBACK TRANSACTION ' + this.quoteIdentifier(transaction.name) + ';';
    }

    return 'ROLLBACK TRANSACTION;';
  },

  selectFromTableFragment(options, model, attributes, tables, mainTableAs, where) {
    let topFragment = '';
    let mainFragment = 'SELECT ' + attributes.join(', ') + ' FROM ' + tables;

    // Handle SQL Server 2008 with TOP instead of LIMIT
    if (semver.valid(this.sequelize.options.databaseVersion) && semver.lt(this.sequelize.options.databaseVersion, '11.0.0')) {
      if (options.limit) {
        topFragment = 'TOP ' + options.limit + ' ';
      }
      if (options.offset) {
        mainFragment = this._buildLegacyOffsetQuery(options, model, attributes, tables, mainTableAs, where);
        return mainFragment;
      } else {
        mainFragment = 'SELECT ' + topFragment + attributes.join(', ') + ' FROM ' + tables;
      }
    }

    if (mainTableAs) {
      mainFragment += ' AS ' + mainTableAs;
    }

    if (options.tableHint && TableHints[options.tableHint]) {
      mainFragment += ` WITH (${TableHints[options.tableHint]})`;
    }

    return mainFragment;
  },

  _buildLegacyOffsetQuery(options, model, attributes, tables, mainTableAs, where) {
    // Build offset query for SQL Server 2008 and earlier
    const offset = options.offset || 0;
    const isSubQuery = options.hasIncludeWhere || options.hasIncludeRequired || options.hasMultiAssociation;
    let orders = { mainQueryOrder: [] };

    if (options.order) {
      orders = this.getQueryOrders(options, model, isSubQuery);
    }

    if (!orders.mainQueryOrder.length) {
      orders.mainQueryOrder.push(this.quoteIdentifier(model.primaryKeyField));
    }

    const tmpTable = mainTableAs ? mainTableAs : 'OffsetTable';
    const whereFragment = where ? ' WHERE ' + where : '';

    /*
     * For earlier versions of SQL server, we need to nest several queries
     * in order to emulate the OFFSET behavior.
     *
     * 1. The outermost query selects all items from the inner query block.
     *    This is due to a limitation in SQL server with the use of computed
     *    columns (e.g. SELECT ROW_NUMBER()...AS x) in WHERE clauses.
     * 2. The next query handles the LIMIT and OFFSET behavior by getting
     *    the TOP N rows of the query where the row number is > OFFSET
     * 3. The innermost query is the actual set we want information from
     */
    return 'SELECT TOP 100 PERCENT ' + attributes.join(', ') + ' FROM ' +
                    '(SELECT TOP ' + (offset + options.limit) + ' *' +
                      ' FROM (SELECT ROW_NUMBER() OVER (ORDER BY ' + orders.mainQueryOrder.join(', ') + ') as row_num, * ' +
                        ' FROM ' + tables + ' AS ' + tmpTable + whereFragment + ')' +
                      ' AS ' + tmpTable + ' WHERE row_num > ' + offset + ')' +
                    ' AS ' + tmpTable;
  },

  addLimitAndOffset(options, model) {
    // Skip handling of limit and offset as postfixes for older SQL Server versions
    if (semver.valid(this.sequelize.options.databaseVersion) && semver.lt(this.sequelize.options.databaseVersion, '11.0.0')) {
      return '';
    }

    const offset = options.offset || 0;
    const isSubQuery = options.subQuery === undefined
      ? options.hasIncludeWhere || options.hasIncludeRequired || options.hasMultiAssociation
      : options.subQuery;

    let fragment = '';
    let orders = {};
    
    if (options.order) {
      orders = this.getQueryOrders(options, model, isSubQuery);
    }

    if (options.limit || options.offset) {
      if (!options.order || options.include && !orders.subQueryOrder.length) {
        fragment += options.order && !isSubQuery ? ', ' : ' ORDER BY ';
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

// private methods
function wrapSingleQuote(identifier) {
  return Utils.addTicks(Utils.removeTicks(identifier, "'"), "'");
}

module.exports = QueryGenerator;