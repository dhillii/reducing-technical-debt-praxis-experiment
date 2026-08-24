return fragment;
  },

  /**
   * Converts an attribute definition to SQL column definition.
   * Handles types, constraints, defaults, and references.
   * @param {Object|String} attribute - Attribute definition or type string
   * @returns {String} SQL column definition
   */
  attributeToSQL(attribute) {
    if (!_.isPlainObject(attribute)) {
      attribute = {
        type: attribute
      };
    }

    return AttributeToSQLConverter.convert(attribute, this);
  },

  /**
   * Applies SET CONSTRAINTS command for transaction control.
   * @param {Array<String>} columns - Array of column names or 'ALL'
   * @param {String} type - Constraint type: 'DEFERRED' or 'IMMEDIATE'
   * @returns {String} SQL SET CONSTRAINTS statement
   */
  setConstraintQuery(columns, type) {
    let columnFragment = 'ALL';

    if (columns) {
      columnFragment = columns.map(column => this.quoteIdentifier(column)).join(', ');
    }

    return 'SET CONSTRAINTS ' + columnFragment + ' ' + type;
  },

  /**
   * Creates a complete addColumn query including ENUM handling.
   * @param {String} table - Table name
   * @param {String} key - Column name
   * @param {Object} dataType - Column type definition
   * @returns {String} Full ADD COLUMN SQL statement
   */
  addColumnQuery(table, key, dataType) {
    const converter = new AddColumnQueryConverter(this, table, key, dataType);
    return converter.generate();
  },

  /**
   * Generates changeColumn query for altering multiple columns.
   * @param {String} tableName - Target table name
   * @param {Object} attributes - Map of column names to new definitions
   * @returns {String} Complete ALTER TABLE statement
   */
  changeColumnQuery(tableName, attributes) {
    const changer = new ChangeColumnQueryConverter(this, tableName, attributes);
    return changer.generate();
  },

  /**
   * Generates dropTable query with cascade support.
   * @param {String} tableName - Table to drop
   * @param {Object} options - Drop options including cascade flag
   * @returns {String} DROP TABLE statement
   */
  dropTableQuery(tableName, options) {
    options = options || {};
    return `DROP TABLE IF EXISTS ${this.quoteTable(tableName)}${options.cascade ? ' CASCADE' : ''};`;
  },

  /**
   * Generates showTables query restricted to public schema.
   * @returns {String} SELECT statement listing tables
   */
  showTablesQuery() {
    return "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type LIKE '%TABLE' AND table_name != 'spatial_ref_sys';";
  },

  /**
   * Generates describeTable query with constraints and special types.
   * @param {String} tableName - Table to describe
   * @param {String} [schema='public'] - Schema name
   * @returns {String} SHOW COLUMNS equivalent query
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
   * Generates attributeToSQL mapping for multiple attributes.
   * @param {Object} attributes - Map of attribute names to definitions
   * @param {Object} [options] - Additional options
   * @returns {Object} Mapped SQL definitions
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
   * Generates upsert query using EXCEPTION handling.
   * @param {String} tableName - Target table name
   * @param {Object} insertValues - Insert data map
   * @param {Object} updateValues - Update data map
   * @param {Object} where - WHERE clause conditions
   * @param {Object} model - Model instance
   * @param {Object} options - Query options
   * @returns {String} Upsert function and call
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
   * Generates delete query with optional LIMIT support.
   * @param {String} tableName - Table to delete from
   * @param {Object} where - DELETE conditions
   * @param {Object} options - Query options including limit
   * @param {Object} model - Model instance
   * @returns {String} DELETE statement
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
   * Generates rollback query for deferred constraints.
   * @param {String} columns - Space-separated list of columns
   * @returns {String} SET CONSTRAINTS statement
   */
  setDeferredQuery(columns) {
    return this.setConstraintQuery(columns, 'DEFERRED');
  },

  /**
   * Generates immediate constraint validation query.
   * @param {String} columns - Space-separated list of columns
   * @returns {String} SET CONSTRAINTS statement
   */
  setImmediateQuery(columns) {
    return this.setConstraintQuery(columns, 'IMMEDIATE');
  },

  /**
   * Generates unique constraint drop query.
   * @param {String} tableName - Source table
   * @param {String} indexNameOrAttributes - Index name or column list
   * @returns {String} DROP INDEX statement
   */
  removeIndexQuery(tableName, indexNameOrAttributes) {
    let indexName = indexNameOrAttributes;

    if (typeof indexName !== 'string') {
      indexName = Utils.underscore(tableName + '_' + indexNameOrAttributes.join('_'));
    }

    return `DROP INDEX IF EXISTS ${this.quoteIdentifiers(indexName)}`;
  },

  /**
   * Generates renameColumn query for multiple renames.
   * @param {String} tableName - Target table
   * @param {String} attrBefore - Old column name
   * @param {Object} attributes - Map of old names to new names
   * @returns {String} RENAME COLUMN statement
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
   * Generates ENUM drop statement for type cleanup.
   * @param {String} tableName - Table containing ENUM
   * @param {String} attr - Column name
   * @param {String} [enumName] - Override enum name
   * @returns {String} DROP TYPE statement
   */
  pgEnumDrop(tableName, attr, enumName) {
    enumName = enumName || this.pgEnumName(tableName, attr);
    return 'DROP TYPE IF EXISTS ' + enumName + '; ';
  },

  /**
   * Generates ADD VALUE statement for PostgreSQL ENUM types.
   * @param {String} tableName - Table containing ENUM column
   * @param {String} attr - Column name
   * @param {String} value - New ENUM value
   * @param {Object} [options] - Additional options (before/after)
   * @returns {String} ALTER TYPE ... ADD VALUE statement
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
   * Generates CREATE TYPE ENUM statement.
   * @param {String} tableName - Table where ENUM is used
   * @param {String} attr - Column name
   * @param {Object} dataType - ENUM definition
   * @param {Object} [options] - Control options (force)
   * @returns {String} CREATE TYPE ... AS ENUM statement
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
   * Generates DROP FUNCTION statement.
   * @param {String} functionName - Function to drop
   * @param {Array} params - Parameter definitions
   * @returns {String} DROP FUNCTION statement
   */
  dropFunction(functionName, params) {
    if (!functionName) throw new Error('requires functionName');
    const paramList = this.expandFunctionParamList(params);
    return `DROP FUNCTION ${functionName}(${paramList}) RESTRICT;`;
  },

  /**
   * Generates CREATE TRIGGER statement.
   * @param {String} tableName - Target table
   * @param {String} triggerName - Trigger name
   * @param {String} eventType - BEFORE/AFTER state
   * @param {Object} fireOnSpec - Event conditions
   * @param {String} functionName - Function to execute
   * @param {Array} functionParams - Function parameters
   * @param {Array} optionsArray - Trigger options
   * @returns {String} CREATE TRIGGER statement
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
   * Generates DROP TRIGGER statement.
   * @param {String} tableName - Source table
   * @param {String} triggerName - Trigger to remove
   * @returns {String} DROP TRIGGER statement
   */
  dropTrigger(tableName, triggerName) {
    return `DROP TRIGGER ${triggerName} ON ${tableName} RESTRICT;`;
  },

  /**
   * Generates RENAME TRIGGER statement.
   * @param {String} tableName - Source table
   * @param {String} oldTriggerName - Current trigger name
   * @param {String} newTriggerName - New trigger name
   * @returns {String} ALTER TRIGGER RENAME statement
   */
  renameTrigger(tableName, oldTriggerName, newTriggerName) {
    return `ALTER TRIGGER ${oldTriggerName} ON ${tableName} RENAME TO ${newTriggerName};`;
  },

  /**
   * Generates CREATE FUNCTION statement.
   * @param {String} functionName - Function name
   * @param {Array} params - Function parameters
   * @param {String} returnType - Return type
   * @param {String} language - Procedural language (e.g., plpgsql)
   * @param {String} body - Function body
   * @param {Array} options - Function options
   * @returns {String} CREATE FUNCTION statement
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
   * Generates RENAME FUNCTION statement.
   * @param {String} oldFunctionName - Current function name
   * @param {Array} params - Function parameters for signature
   * @param {String} newFunctionName - New function name
   * @returns {String} ALTER FUNCTION RENAME statement
   */
  renameFunction(oldFunctionName, params, newFunctionName) {
    const paramList = this.expandFunctionParamList(params);
    return `ALTER FUNCTION ${oldFunctionName}(${paramList}) RENAME TO ${newFunctionName};`;
  },

  /**
   * Generates database connection URI from config object.
   * @param {Object} config - Configuration object with connection details
   * @returns {String} SQLAlchemy-style URI
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
   * Escapes and quotes value appropriately.
   * @param {String} val - Value to escape and quote
   * @returns {String} Properly escaped PostgreSQL literal
   */
  pgEscapeAndQuote(val) {
    return this.quoteIdentifier(Utils.removeTicks(this.escape(val), "'"));
  },

  /**
   * Expands function parameter list array into SQL.
   * @param {Array} params - Function parameter definitions
   * @returns {String} Comma-separated parameter list
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
   * Expands option array into formatted SQL snippet.
   * @param {Array} options - Array of SQL option strings
   * @returns {String} Formatted options block
   */
  expandOptions(options) {
    return _.isUndefined(options) || _.isEmpty(options) ?
      '' : '\n\t' + options.join('\n\t');
  },

  /**
   * Decodes trigger event specifier to upper-case SQL event.
   * @param {String} eventSpecifier - Event type key
   * @returns {String} SQL event type
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
   * Determines if trigger event is constraint-type.
   * @param {String} eventSpecifier - Trigger event type
   * @returns {Boolean} True if constraint event
   */
  triggerEventTypeIsConstraint(eventSpecifier) {
    return eventSpecifier === 'after_constraint' ? 'CONSTRAINT ' : '';
  },

  /**
   * Expands trigger event specifications into SQL.
   * @param {Object} fireOnSpec - Event specification map
   * @returns {String} Combined event spec
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
   * Generates ENUM type name for a table/column combination.
   * @param {String} tableName - Table name
   * @param {String} attr - Column name
   * @param {Object} [options] - Naming options including schema
   * @returns {String} Quoted enum name
   */
  pgEnumName(tableName, attr, options) {
    options = options || {};

    const tableDetails = this.extractTableDetails(tableName, options);
    let enumName = Utils.addTicks(Utils.generateEnumName(tableDetails.tableName, attr), '"');

    // pgListEnums requires the enum name only, without the schema
    if (options.schema !== false && tableDetails.schema) {
      enumName = this.quoteIdentifier(tableDetails.schema) + tableDetails.delimiter + enumName;
    }

    return enumName;
  },

  /**
   * Lists ENUM types in PostgreSQL schema.
   * @param {String} tableName - Target table
   * @param {String} [attrName] - Specific column name
   * @param {Object} [options] - Schema options
   * @returns {String} Query to list enums
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
   * Applies dataType mapping adjustments for SERIAL/ENUM/PRIMARY KEY.
   * @param {String} tableName - Table name
   * @param {String} attr - Column name
   * @param {String} dataType - Raw column type
   * @returns {String} Mapped data type
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
   * Generates quoted identifier with optional case-sensitivity handling.
   * @param {String} identifier - Identifier to quote
   * @param {Boolean} [force] - Force quoting regardless of case
   * @returns {String} Quoted identifier
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
   * Generates query to retrieve foreign keys from a table.
   * @param {String} tableName - Target table
   * @returns {String} Query to fetch foreign key constraints
   */
  getForeignKeysQuery(tableName) {
    return 'SELECT conname as constraint_name, pg_catalog.pg_get_constraintdef(r.oid, true) as condef FROM pg_catalog.pg_constraint r ' +
      `WHERE r.conrelid = (SELECT oid FROM pg_class WHERE relname = '${tableName}' LIMIT 1) AND r.contype = 'f' ORDER BY 1;`;
  },

  /**
   * Generates common prefix for foreign key reference queries.
   * @returns {String} SQL SELECT片段
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
   * Generates full foreign key references query.
   * @param {String} tableName - Target table
   * @param {String} [catalogName] - Catalog name
   * @param {String} [schemaName] - Schema name
   * @returns {String} Complete foreign key info query
   */
  getForeignKeyReferencesQuery(tableName, catalogName, schemaName) {
    return this._getForeignKeyReferencesQueryPrefix() +
      `WHERE constraint_type = 'FOREIGN KEY' AND tc.table_name = '${tableName}'` +
      (catalogName ? ` AND tc.table_catalog = '${catalogName}'` : '') +
      (schemaName ? ` AND tc.table_schema = '${schemaName}'` : '');
  },

  /**
   * Generates narrow foreign key reference query.
   * @param {Object|String} table - Table or table descriptor
   * @param {String} columnName - Column to search
   * @returns {String} Foreign key query for specific column
   */
  getForeignKeyReferenceQuery(table, columnName) {
    const tableName = table.tableName || table;
    const schema = table.schema;
    return this._getForeignKeyReferencesQueryPrefix() +
      `WHERE constraint_type = 'FOREIGN KEY' AND tc.table_name='${tableName}' AND  kcu.column_name = '${columnName}'` +
      (schema ? ` AND tc.table_schema = '${schema}'` : '');
  },

  /**
   * Generates DROP CONSTRAINT query for a foreign key.
   * @param {String} tableName - Source table
   * @param {String} foreignKey - Constraint name
   * @returns {String} ALTER TABLE DROP CONSTRAINT statement
   */
  dropForeignKeyQuery(tableName, foreignKey) {
    return 'ALTER TABLE ' + this.quoteTable(tableName) + ' DROP CONSTRAINT ' + this.quoteIdentifier(foreignKey) + ';';
  },

  /**
   * Sets autocommit mode with version compatibility handling.
   * @param {Boolean} value - Enable/disable autocommit
   * @param {Object} options - Query options including parent transaction
   * @returns {String|Undefined} Autocommit command or undefined
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

// Internal classes...

class AttributeToSQLConverter {
  static convert(attribute, generator) {
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
        type = 'ENUM(' + _.map(values, value => generator.escape(value)).join(', ') + ')';

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
      sql += ' DEFAULT ' + generator.escape(attribute.defaultValue, attribute);
    }

    if (attribute.unique === true) {
      sql += ' UNIQUE';
    }

    if (attribute.primaryKey) {
      sql += ' PRIMARY KEY';
    }

    if (attribute.references) {
      const referencesTable = generator.quoteTable(attribute.references.model);
      let referencesKey;

      if (attribute.references.key) {
        referencesKey = generator.quoteIdentifiers(attribute.references.key);
      } else {
        referencesKey = generator.quoteIdentifier('id');
      }

      sql += ` REFERENCES ${referencesTable} (${referencesKey})`;

      if (attribute.onDelete) {
        sql += ' ON DELETE ' + attribute.onDelete.toUpperCase();
      }

      if (attribute.onUpdate) {
        sql += ' ON UPDATE ' + attribute.onUpdate.toUpperCase();
      }

      if (attribute.references.deferrable) {
        sql += ' ' + attribute.references.deferrable.toString(generator);
      }
    }

    return sql;
  }
}

class AddColumnQueryConverter {
  constructor(generator, table, key, dataType) {
    this.generator = generator;
    this.table = table;
    this.key = key;
    this.dataType = dataType;
  }

  generate() {
    const dbDataType = this.generator.attributeToSQL(this.dataType, { context: 'addColumn' });
    const definition = this.generator.dataTypeMapping(this.table, this.key, dbDataType);
    const quotedKey = this.generator.quoteIdentifier(this.key);
    const quotedTable = this.generator.quoteTable(this.generator.extractTableDetails(this.table));

    let query = `ALTER TABLE ${quotedTable} ADD COLUMN ${quotedKey} ${definition};`;

    if (this.dataType.type && (this.dataType.type instanceof DataTypes.ENUM || this.dataType instanceof DataTypes.ENUM)) {
      query = this.generator.pgEnum(this.table, this.key, this.dataType) + query;
    }

    return query;
  }
}

class ChangeColumnQueryConverter {
  constructor(generator, tableName, attributes) {
    this.generator = generator;
    this.tableName = tableName;
    this.attributes = attributes;
  }

  generate() {
    const query = 'ALTER TABLE <%= tableName %> ALTER COLUMN <%= query %>;';
    const sql = [];

    for (const attributeName in this.attributes) {
      let definition = this.generator.dataTypeMapping(this.tableName, attributeName, this.attributes[attributeName]);
      let attrSql = '';

      if (definition.indexOf('NOT NULL') > 0) {
        attrSql += _.template(query, this.generator._templateSettings)({
          tableName: this.generator.quoteTable(this.tableName),
          query: this.generator.quoteIdentifier(attributeName) + ' SET NOT NULL'
        });

        definition = definition.replace('NOT NULL', '').trim();
      } else if (!definition.match(/REFERENCES/)) {
        attrSql += _.template(query, this.generator._templateSettings)({
          tableName: this.generator.quoteTable(this.tableName),
          query: this.generator.quoteIdentifier(attributeName) + ' DROP NOT NULL'
        });
      }

      if (definition.indexOf('DEFAULT') > 0) {
        attrSql += _.template(query, this.generator._templateSettings)({
          tableName: this.generator.quoteTable(this.tableName),
          query: this.generator.quoteIdentifier(attributeName) + ' SET DEFAULT ' + definition.match(/DEFAULT ([^;]+)/)[1]
        });

        definition = definition.replace(/(DEFAULT[^;]+)/, '').trim();
      } else if (!definition.match(/REFERENCES/)) {
        attrSql += _.template(query, this.generator._templateSettings)({
          tableName: this.generator.quoteTable(this.tableName),
          query: this.generator.quoteIdentifier(attributeName) + ' DROP DEFAULT'
        });
      }

      if (this.attributes[attributeName].match(/^ENUM\(/)) {
        attrSql += this.generator.pgEnum(this.tableName, attributeName, this.attributes[attributeName]);
        definition = definition.replace(/^ENUM\(.+\)/, this.generator.pgEnumName(this.tableName, attributeName, { schema: false }));
        definition += ' USING (' + this.generator.quoteIdentifier(attributeName) + '::' + this.generator.pgEnumName(this.tableName, attributeName) + ')';
      }

      if (definition.match(/UNIQUE;*$/)) {
        definition = definition.replace(/UNIQUE;*$/, '');

        attrSql += _.template(query.replace('ALTER COLUMN', ''), this.generator._templateSettings)({
          tableName: this.generator.quoteTable(this.tableName),
          query: 'ADD CONSTRAINT ' + this.generator.quoteIdentifier(attributeName + '_unique_idx') + ' UNIQUE (' + this.generator.quoteIdentifier(attributeName) + ')'
        });
      }

      if (definition.match(/REFERENCES/)) {
        definition = definition.replace(/.+?(?=REFERENCES)/, '');
        attrSql += _.template(query.replace('ALTER COLUMN', ''), this.generator._templateSettings)({
          tableName: this.generator.quoteTable(this.tableName),
          query: 'ADD CONSTRAINT ' + this.generator.quoteIdentifier(attributeName + '_foreign_idx') + ' FOREIGN KEY (' + this.generator.quoteIdentifier(attributeName) + ') ' + definition
        });
      } else {
        attrSql += _.template(query, this.generator._templateSettings)({
          tableName: this.generator.quoteTable(this.tableName),
          query: this.generator.quoteIdentifier(attributeName) + ' TYPE ' + definition
        });
      }

      sql.push(attrSql);
    }

    return sql.join('');
  }
}