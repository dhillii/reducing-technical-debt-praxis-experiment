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

  /**
   * Checks if dataType contains PRIMARY KEY
   * @param {String} dataType
   * @returns {Boolean}
   */
  _hasPrimaryKey(dataType) {
    return _.includes(dataType, 'PRIMARY KEY');
  },

  /**
   * Checks if dataType contains REFERENCES
   * @param {String} dataType
   * @returns {Boolean}
   */
  _hasReferences(dataType) {
    return _.includes(dataType, 'REFERENCES');
  },

  /**
   * Processes attribute with PRIMARY KEY and REFERENCES
   * @param {String} attr
   * @param {String} dataType
   * @param {Array} primaryKeys
   * @param {Object} foreignKeys
   * @param {Array} attrStr
   */
  _processAttributeWithPrimaryKeyAndReferences(attr, dataType, primaryKeys, foreignKeys, attrStr) {
    primaryKeys.push(attr);
    const match = dataType.match(/^(.+) (REFERENCES.*)$/);
    attrStr.push(this.quoteIdentifier(attr) + ' ' + match[1].replace(/PRIMARY KEY/, ''));
    foreignKeys[attr] = match[2];
  },

  /**
   * Processes attribute with PRIMARY KEY only
   * @param {String} attr
   * @param {String} dataType
   * @param {Array} primaryKeys
   * @param {Array} attrStr
   */
  _processAttributeWithPrimaryKey(attr, dataType, primaryKeys, attrStr) {
    primaryKeys.push(attr);
    attrStr.push(this.quoteIdentifier(attr) + ' ' + dataType.replace(/PRIMARY KEY/, ''));
  },

  /**
   * Processes attribute with REFERENCES only
   * @param {String} attr
   * @param {String} dataType
   * @param {Object} foreignKeys
   * @param {Array} attrStr
   */
  _processAttributeWithReferences(attr, dataType, foreignKeys, attrStr) {
    const match = dataType.match(/^(.+) (REFERENCES.*)$/);
    attrStr.push(this.quoteIdentifier(attr) + ' ' + match[1]);
    foreignKeys[attr] = match[2];
  },

  /**
   * Processes regular attribute without PRIMARY KEY or REFERENCES
   * @param {String} attr
   * @param {String} dataType
   * @param {Array} attrStr
   */
  _processRegularAttribute(attr, dataType, attrStr) {
    attrStr.push(this.quoteIdentifier(attr) + ' ' + dataType);
  },

  /**
   * Processes single attribute and adds to appropriate collections
   * @param {String} attr
   * @param {String} dataType
   * @param {Array} primaryKeys
   * @param {Object} foreignKeys
   * @param {Array} attrStr
   */
  _processAttribute(attr, dataType, primaryKeys, foreignKeys, attrStr) {
    const hasPrimaryKey = this._hasPrimaryKey(dataType);
    const hasReferences = this._hasReferences(dataType);

    if (hasPrimaryKey && hasReferences) {
      this._processAttributeWithPrimaryKeyAndReferences(attr, dataType, primaryKeys, foreignKeys, attrStr);
      return;
    }

    if (hasPrimaryKey) {
      this._processAttributeWithPrimaryKey(attr, dataType, primaryKeys, attrStr);
      return;
    }

    if (hasReferences) {
      this._processAttributeWithReferences(attr, dataType, foreignKeys, attrStr);
      return;
    }

    this._processRegularAttribute(attr, dataType, attrStr);
  },

  createTableQuery(tableName, attributes, options) {
    const query = "IF OBJECT_ID('<%= table %>', 'U') IS NULL CREATE TABLE <%= table %> (<%= attributes %>)",
      primaryKeys = [],
      foreignKeys = {},
      attrStr = [];

    for (const attr in attributes) {
      if (attributes.hasOwnProperty(attr)) {
        const dataType = attributes[attr];
        this._processAttribute(attr, dataType, primaryKeys, foreignKeys, attrStr);
      }
    }

    const values = {
        table: this.quoteTable(tableName),
        attributes: attrStr.join(', ')
      },
      pkString = primaryKeys.map(pk => { return this.quoteIdentifier(pk); }).join(', ');

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

    if (pkString.length > 0) {
      values.attributes += `, PRIMARY KEY (${pkString})`;
    }

    for (const fkey in foreignKeys) {
      if (foreignKeys.hasOwnProperty(fkey)) {
        values.attributes += ', FOREIGN KEY (' + this.quoteIdentifier(fkey) + ') ' + foreignKeys[fkey];
      }
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

  /**
   * Checks if attribute is empty with autoIncrement primary key
   * @param {Object} attrValueHash
   * @param {Object} attributes
   * @returns {Boolean}
   */
  _isEmptyAutoIncrementPrimaryKey(attrValueHash, attributes) {
    const fields = Object.keys(attrValueHash);
    if (fields.length !== 1) {
      return false;
    }
    const firstAttr = attributes[fields[0]];
    return firstAttr && firstAttr.autoIncrement && attrValueHash[fields[0]] === null;
  },

  /**
   * Checks if attribute value requires identity insert wrapper
   * @param {*} value
   * @param {Object} attributes
   * @param {String} key
   * @returns {Boolean}
   */
  _requiresIdentityInsert(value, attributes, key) {
    return value !== null && attributes[key] && attributes[key].autoIncrement;
  },

  /**
   * Checks if attribute should be skipped in allAttributes
   * @param {*} value
   * @param {Object} attributes
   * @param {String} key
   * @returns {Boolean}
   */
  _shouldSkipAttribute(value, attributes, key) {
    return value === null && attributes[key] && attributes[key].autoIncrement;
  },

  /**
   * Filters out identity attributes from update keys
   * @param {String} key
   * @param {Array} identityAttrs
   * @returns {Boolean}
   */
  _isNotIdentityAttribute(key, identityAttrs) {
    return identityAttrs.indexOf(key) === -1;
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

    _.forEach(attrValueHashes, attrValueHash => {
      if (this._isEmptyAutoIncrementPrimaryKey(attrValueHash, attributes)) {
        allQueries.push(emptyQuery);
        return;
      }

      _.forOwn(attrValueHash, (value, key) => {
        if (this._requiresIdentityInsert(value, attributes, key)) {
          needIdentityInsertWrapper = true;
        }

        if (allAttributes.indexOf(key) === -1) {
          if (this._shouldSkipAttribute(value, attributes, key)) {
            return;
          }
          allAttributes.push(key);
        }
      });
    });

    if (allAttributes.length > 0) {
      _.forEach(attrValueHashes, attrValueHash => {
        tuples.push('(' +
          allAttributes.map(key =>
            this.escape(attrValueHash[key])).join(',') +
        ')');
      });

      allQueries.push(query);
    }

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

  /**
   * Collects primary key attributes from model
   * @param {Object} model
   * @param {Array} primaryKeysAttrs
   */
  _collectPrimaryKeyAttributes(model, primaryKeysAttrs) {
    for (const key in model.rawAttributes) {
      if (model.rawAttributes[key].primaryKey) {
        primaryKeysAttrs.push(model.rawAttributes[key].field || key);
      }
    }
  },

  /**
   * Collects unique attributes from model
   * @param {Object} model
   * @param {Array} uniqueAttrs
   */
  _collectUniqueAttributes(model, uniqueAttrs) {
    for (const key in model.rawAttributes) {
      if (model.rawAttributes[key].unique) {
        uniqueAttrs.push(model.rawAttributes[key].field || key);
      }
    }
  },

  /**
   * Collects identity attributes from model
   * @param {Object} model
   * @param {Array} identityAttrs
   */
  _collectIdentityAttributes(model, identityAttrs) {
    for (const key in model.rawAttributes) {
      if (model.rawAttributes[key].autoIncrement) {
        identityAttrs.push(model.rawAttributes[key].field || key);
      }
    }
  },

  /**
   * Adds unique indexes from model options to uniqueAttrs
   * @param {Object} model
   * @param {Array} uniqueAttrs
   */
  _addUniqueIndexes(model, uniqueAttrs) {
    for (const index of model.options.indexes) {
      if (!index.unique || !index.fields) {
        continue;
      }
      for (const field of index.fields) {
        const fieldName = typeof field === 'string' ? field : field.name || field.attribute;
        if (uniqueAttrs.indexOf(fieldName) === -1 && model.rawAttributes[fieldName]) {
          uniqueAttrs.push(fieldName);
        }
      }
    }
  },

  /**
   * Checks if clause is valid (no null values in keys)
   * @param {Object} clause
   * @returns {Boolean}
   */
  _isValidClause(clause) {
    for (const key in clause) {
      if (!clause[key]) {
        return false;
      }
    }
    return true;
  },

  /**
   * Generates join snippet for given array of keys
   * @param {Array} array
   * @param {String} targetTableAlias
   * @param {String} sourceTableAlias
   * @returns {Array}
   */
  _getJoinSnippet(array, targetTableAlias, sourceTableAlias) {
    return array.map(key => {
      key = this.quoteIdentifier(key);
      return `${targetTableAlias}.${key} = ${sourceTableAlias}.${key}`;
    });
  },

  /**
   * Determines join condition from clauses and attributes
   * @param {Array} clauses
   * @param {Array} primaryKeysAttrs
   * @param {Array} uniqueAttrs
   * @param {String} targetTableAlias
   * @param {String} sourceTableAlias
   * @returns {String}
   */
  _determineJoinCondition(clauses, primaryKeysAttrs, uniqueAttrs, targetTableAlias, sourceTableAlias) {
    if (clauses.length === 0) {
      throw new Error('Primary Key or Unique key should be passed to upsert query');
    }

    for (const key in clauses) {
      const keys = Object.keys(clauses[key]);
      if (primaryKeysAttrs.indexOf(keys[0]) !== -1) {
        return this._getJoinSnippet(primaryKeysAttrs, targetTableAlias, sourceTableAlias).join(' AND ');
      }
    }

    return this._getJoinSnippet(uniqueAttrs, targetTableAlias, sourceTableAlias).join(' AND ');
  },

  /**
   * Checks if identity attribute needs insert wrapper
   * @param {Array} identityAttrs
   * @param {Object} updateValues
   * @returns {Boolean}
   */
  _needsIdentityInsertWrapper(identityAttrs, updateValues) {
    for (const key of identityAttrs) {
      if (updateValues[key] && updateValues[key] !== null) {
        return true;
      }
    }
    return false;
  },

  /**
   * Generates update snippet for upsert query
   * @param {Array} updateKeys
   * @param {Object} updateValues
   * @param {Array} identityAttrs
   * @param {String} targetTableAlias
   * @returns {String}
   */
  _generateUpdateSnippet(updateKeys, updateValues, identityAttrs, targetTableAlias) {
    return updateKeys.filter(key => this._isNotIdentityAttribute(key, identityAttrs))
      .map(key => {
        const value = this.escape(updateValues[key]);
        const quotedKey = this.quoteIdentifier(key);
        return `${targetTableAlias}.${quotedKey} = ${value}`;
      }).join(', ');
  },

  upsertQuery(tableName, insertValues, updateValues, where, model) {
    const targetTableAlias = this.quoteTable(`${tableName}_target`);
    const sourceTableAlias = this.quoteTable(`${tableName}_source`);
    const primaryKeysAttrs = [];
    const identityAttrs = [];
    const uniqueAttrs = [];
    const tableNameQuoted = this.quoteTable(tableName);

    this._collectPrimaryKeyAttributes(model, primaryKeysAttrs);
    this._collectUniqueAttributes(model, uniqueAttrs);
    this._collectIdentityAttributes(model, identityAttrs);
    this._addUniqueIndexes(model, uniqueAttrs);

    const needIdentityInsertWrapper = this._needsIdentityInsertWrapper(identityAttrs, updateValues);

    const updateKeys = Object.keys(updateValues);
    const insertKeys = Object.keys(insertValues);
    const insertKeysQuoted = insertKeys.map(key => this.quoteIdentifier(key)).join(', ');
    const insertValuesEscaped = insertKeys.map(key => this.escape(insertValues[key])).join(', ');
    const sourceTableQuery = `VALUES(${insertValuesEscaped})`; //Virtual Table

    const clauses = where[Op.or].filter(clause => this._isValidClause(clause));

    const joinCondition = this._determineJoinCondition(clauses, primaryKeysAttrs, uniqueAttrs, targetTableAlias, sourceTableAlias);

    const updateSnippet = this._generateUpdateSnippet(updateKeys, updateValues, identityAttrs, targetTableAlias);

    const insertSnippet = `(${insertKeysQuoted}) VALUES(${insertValuesEscaped})`;
    let query = `MERGE INTO ${tableNameQuoted} WITH(HOLDLOCK) AS ${targetTableAlias} USING (${sourceTableQuery}) AS ${sourceTableAlias}(${insertKeysQuoted}) ON ${joinCondition}`;
    query += ` WHEN MATCHED THEN UPDATE SET ${updateSnippet} WHEN NOT MATCHED THEN INSERT ${insertSnippet} OUTPUT $action, INSERTED.*;`;
    if (needIdentityInsertWrapper) {
      query = `SET IDENTITY_INSERT ${tableNameQuoted} ON; ${query} SET IDENTITY_INSERT ${tableNameQuoted} OFF;`;
    }
    return query;
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

  /**
   * Checks if attribute has self-referential constraint
   * @param {Object} attribute
   * @returns {Boolean}
   */
  _hasSelfReferencialConstraint(attribute) {
    return attribute.references && attribute.Model && attribute.Model.tableName === attribute.references.model;
  },

  /**
   * Checks if attribute type is ENUM
   * @param {Object} attribute
   * @returns {Boolean}
   */
  _isEnumType(attribute) {
    return attribute.type instanceof DataTypes.ENUM;
  },

  /**
   * Checks if attribute allows null
   * @param {Object} attribute
   * @returns {Boolean}
   */
  _allowsNull(attribute) {
    return attribute.allowNull !== false;
  },

  /**
   * Checks if attribute has default value
   * @param {Object} attribute
   * @returns {Boolean}
   */
  _hasDefaultValue(attribute) {
    return attribute.type !== 'TEXT' && attribute.type._binary !== true &&
        Utils.defaultValueSchemable(attribute.defaultValue);
  },

  /**
   * Generates ENUM template for attribute
   * @param {Object} attribute
   * @returns {String}
   */
  _generateEnumTemplate(attribute) {
    let template = attribute.type.toSql();
    template += ' CHECK (' + this.quoteIdentifier(attribute.field) + ' IN(' + _.map(attribute.values, value => {
      return this.escape(value);
    }).join(', ') + '))';
    return template;
  },

  /**
   * Appends NOT NULL or NULL to template
   * @param {Object} attribute
   * @param {String} template
   * @returns {String}
   */
  _appendNullability(attribute, template) {
    if (attribute.allowNull === false) {
      return template + ' NOT NULL';
    }
    if (!attribute.primaryKey && !Utils.defaultValueSchemable(attribute.defaultValue)) {
      return template + ' NULL';
    }
    return template;
  },

  /**
   * Appends constraints to template
   * @param {Object} attribute
   * @param {String} template
   * @returns {String}
   */
  _appendConstraints(attribute, template) {
    let result = template;

    if (attribute.autoIncrement) {
      result += ' IDENTITY(1,1)';
    }

    if (this._hasDefaultValue(attribute)) {
      result += ' DEFAULT ' + this.escape(attribute.defaultValue);
    }

    if (attribute.unique === true) {
      result += ' UNIQUE';
    }

    if (attribute.primaryKey) {
      result += ' PRIMARY KEY';
    }

    return result;
  },

  /**
   * Appends references to template
   * @param {Object} attribute
   * @param {String} template
   * @returns {String}
   */
  _appendReferences(attribute, template) {
    if (!attribute.references) {
      return template;
    }

    let result = template + ' REFERENCES ' + this.quoteTable(attribute.references.model);

    if (attribute.references.key) {
      result += ' (' + this.quoteIdentifier(attribute.references.key) + ')';
    } else {
      result += ' (' + this.quoteIdentifier('id') + ')';
    }

    if (attribute.onDelete) {
      result += ' ON DELETE ' + attribute.onDelete.toUpperCase();
    }

    if (attribute.onUpdate) {
      result += ' ON UPDATE ' + attribute.onUpdate.toUpperCase();
    }

    return result;
  },

  attributeToSQL(attribute) {
    if (!_.isPlainObject(attribute)) {
      attribute = {
        type: attribute
      };
    }

    if (this._hasSelfReferencialConstraint(attribute)) {
      this.sequelize.log('MSSQL does not support self referencial constraints, '
        + 'we will remove it but we recommend restructuring your query');
      attribute.onDelete = '';
      attribute.onUpdate = '';
    }

    let template;

    if (this._isEnumType(attribute)) {
      if (attribute.type.values && !attribute.values) {
        attribute.values = attribute.type.values;
      }
      template = this._generateEnumTemplate(attribute);
      return template;
    }

    template = attribute.type.toString();
    template = this._appendNullability(attribute, template);
    template = this._appendConstraints(attribute, template);
    template = this._appendReferences(attribute, template);

    return template;
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

  /**
   * Checks if database version is older than SQL Server 2012
   * @returns {Boolean}
   */
  _isOldSqlServer() {
    return semver.valid(this.sequelize.options.databaseVersion) && 
           semver.lt(this.sequelize.options.databaseVersion, '11.0.0');
  },

  /**
   * Builds offset query fragment for old SQL Server versions
   * @param {Object} options
   * @param {Object} model
   * @param {String} tables
   * @param {String} tmpTable
   * @param {String} whereFragment
   * @param {Array} attributes
   * @returns {String}
   */
  _buildOffsetFragment(options, model, tables, tmpTable, whereFragment, attributes) {
    const offset = options.offset || 0;
    const isSubQuery = options.hasIncludeWhere || options.hasIncludeRequired || options.hasMultiAssociation;
    let orders = { mainQueryOrder: [] };
    
    if (options.order) {
      orders = this.getQueryOrders(options, model, isSubQuery);
    }

    if (!orders.mainQueryOrder.length) {
      orders.mainQueryOrder.push(this.quoteIdentifier(model.primaryKeyField));
    }

    return 'SELECT TOP 100 PERCENT ' + attributes.join(', ') + ' FROM ' +
                        '(SELECT ' + 'TOP ' + options.limit + ' ' + '*' +
                          ' FROM (SELECT ROW_NUMBER() OVER (ORDER BY ' + orders.mainQueryOrder.join(', ') + ') as row_num, * ' +
                            ' FROM ' + tables + ' AS ' + tmpTable + whereFragment + ')' +
                          ' AS ' + tmpTable + ' WHERE row_num > ' + offset + ')' +
                        ' AS ' + tmpTable;
  },

  selectFromTableFragment(options, model, attributes, tables, mainTableAs, where) {
    let topFragment = '';
    let mainFragment = 'SELECT ' + attributes.join(', ') + ' FROM ' + tables;

    if (!this._isOldSqlServer()) {
      if (mainTableAs) {
        mainFragment += ' AS ' + mainTableAs;
      }

      if (options.tableHint && TableHints[options.tableHint]) {
        mainFragment += ` WITH (${TableHints[options.tableHint]})`;
      }

      return mainFragment;
    }

    if (options.limit) {
      topFragment = 'TOP ' + options.limit + ' ';
    }

    if (options.offset) {
      const tmpTable = mainTableAs ? mainTableAs : 'OffsetTable';
      const whereFragment = where ? ' WHERE ' + where : '';
      return this._buildOffsetFragment(options, model, tables, tmpTable, whereFragment, attributes);
    }

    mainFragment = 'SELECT ' + topFragment + attributes.join(', ') + ' FROM ' + tables;

    if (mainTableAs) {
      mainFragment += ' AS ' + mainTableAs;
    }

    if (options.tableHint && TableHints[options.tableHint]) {
      mainFragment += ` WITH (${TableHints[options.tableHint]})`;
    }

    return mainFragment;
  },

  /**
   * Checks if should add limit and offset
   * @param {Object} options
   * @returns {Boolean}
   */
  _shouldAddLimitOffset(options) {
    return options.limit || options.offset;
  },

  /**
   * Checks if needs order by clause
   * @param {Object} options
   * @param {Object} orders
   * @param {Boolean} isSubQuery
   * @returns {Boolean}
   */
  _needsOrderBy(options, orders, isSubQuery) {
    return !options.order || (options.include && !orders.subQueryOrder.length);
  },

  /**
   * Builds order by fragment
   * @param {Object} options
   * @param {Object} model
   * @param {Object} orders
   * @param {Boolean} isSubQuery
   * @returns {String}
   */
  _buildOrderByFragment(options, model, orders, isSubQuery) {
    let fragment = '';
    
    if (this._needsOrderBy(options, orders, isSubQuery)) {
      fragment += options.order && !isSubQuery ? ', ' : ' ORDER BY ';
      fragment += this.quoteTable(options.tableAs || model.name) + '.' + this.quoteIdentifier(model.primaryKeyField);
    }

    return fragment;
  },

  addLimitAndOffset(options, model) {
    if (this._isOldSqlServer()) {
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

    if (!this._shouldAddLimitOffset(options)) {
      return fragment;
    }

    fragment += this._buildOrderByFragment(options, model, orders, isSubQuery);

    if (options.offset || options.limit) {
      fragment += ' OFFSET ' + this.escape(offset) + ' ROWS';
    }

    if (options.limit) {
      fragment += ' FETCH NEXT ' + this.escape(options.limit) + ' ROWS ONLY';
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