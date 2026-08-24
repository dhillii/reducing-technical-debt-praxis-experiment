createTableQuery(tableName, attributes, options) {
    const query = "IF OBJECT_ID('<%= table %>', 'U') IS NULL CREATE TABLE <%= table %> (<%= attributes %>)";
    const primaryKeys = [];
    const foreignKeys = {};
    const attrStr = [];

    for (const attr in attributes) {
      if (!attributes.hasOwnProperty(attr)) continue;

      const dataType = attributes[attr];
      if (isPrimaryKey(dataType)) {
        primaryKeys.push(attr);
        if (hasReferences(dataType)) {
          const match = dataType.match(/^(.+) (REFERENCES.*)$/);
          attrStr.push(this.quoteIdentifier(attr) + ' ' + match[1].replace(/PRIMARY KEY/, ''));
          foreignKeys[attr] = match[2];
        } else {
          attrStr.push(this.quoteIdentifier(attr) + ' ' + dataType.replace(/PRIMARY KEY/, ''));
        }
      } else if (hasReferences(dataType)) {
        const match = dataType.match(/^(.+) (REFERENCES.*)$/);
        attrStr.push(this.quoteIdentifier(attr) + ' ' + match[1]);
        foreignKeys[attr] = match[2];
      } else {
        attrStr.push(this.quoteIdentifier(attr) + ' ' + dataType);
      }
    }

    const values = {
      table: this.quoteTable(tableName),
      attributes: attrStr.join(', ')
    };

    addUniqueConstraints(options, values);
    addPrimaryKeyConstraint(primaryKeys, values);
    addForeignKeyConstraints(foreignKeys, values);

    return _.template(query, this._templateSettings)(values).trim() + ';'
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

  changeColumnQuery(tableName, attributes) {
    const query = 'ALTER TABLE <%= tableName %> <%= query %>;';
    const attrString = [];
    const constraintString = [];

    for (const attributeName in attributes) {
      const definition = attributes[attributeName];
      if (hasReferencesInChangeColumn(definition)) {
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
      if (constraintString.length) {
        finalQuery += ' ';
      }
    }
    if (constraintString.length) {
      finalQuery += 'ADD CONSTRAINT ' + constraintString.join(', ');
    }

    return _.template(query, this._templateSettings)({
      tableName: this.quoteTable(tableName),
      query: finalQuery
    });
  },

  upsertQuery(tableName, insertValues, updateValues, where, model) {
    const targetTableAlias = this.quoteTable(`${tableName}_target`);
    const sourceTableAlias = this.quoteTable(`${tableName}_source`);
    const primaryKeysAttrs = [];
    const identityAttrs = [];
    const uniqueAttrs = [];
    const tableNameQuoted = this.quoteTable(tableName);
    let needIdentityInsertWrapper = false;

    for (const key in model.rawAttributes) {
      if (model.rawAttributes[key].primaryKey) {
        primaryKeysAttrs.push(model.rawAttributes[key].field || key);
      }
      if (model.rawAttributes[key].unique) {
        uniqueAttrs.push(model.rawAttributes[key].field || key);
      }
      if (model.rawAttributes[key].autoIncrement) {
        identityAttrs.push(model.rawAttributes[key].field || key);
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

    const updateKeys = Object.keys(updateValues);
    const insertKeys = Object.keys(insertValues);
    const insertKeysQuoted = insertKeys.map(key => this.quoteIdentifier(key)).join(', ');
    const insertValuesEscaped = insertKeys.map(key => this.escape(insertValues[key])).join(', ');
    const sourceTableQuery = `VALUES(${insertValuesEscaped})`;
    let joinCondition;

    identityAttrs.forEach(key => {
      if (updateValues[key] && updateValues[key] !== null) {
        needIdentityInsertWrapper = true;
      }
    });

    const clauses = where[Op.or].filter(isValidClause);

    if (clauses.length === 0) {
      throw new Error('Primary Key or Unique key should be passed to upsert query');
    }

    for (const key in clauses) {
      const keys = Object.keys(clauses[key]);
      if (primaryKeysAttrs.indexOf(keys[0]) !== -1) {
        joinCondition = getJoinSnippet(primaryKeysAttrs, this);
        break;
      }
    }

    if (!joinCondition) {
      joinCondition = getJoinSnippet(uniqueAttrs, this);
    }

    const updateSnippet = updateKeys
      .filter(key => identityAttrs.indexOf(key) === -1)
      .map(key => {
        const value = this.escape(updateValues[key]);
        key = this.quoteIdentifier(key);
        return `${targetTableAlias}.${key} = ${value}`;
      }).join(', ');

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

  selectFromTableFragment(options, model, attributes, tables, mainTableAs, where) {
    let topFragment = '';
    let mainFragment = 'SELECT ' + attributes.join(', ') + ' FROM ' + tables;

    if (shouldUseTopFragment(this.sequelize.options.databaseVersion)) {
      if (options.limit) {
        topFragment = 'TOP ' + options.limit + ' ';
      }
      if (options.offset) {
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

        const fragment = 'SELECT TOP 100 PERCENT ' + attributes.join(', ') + ' FROM ' +
                        '(SELECT ' + topFragment + '*' +
                          ' FROM (SELECT ROW_NUMBER() OVER (ORDER BY ' + orders.mainQueryOrder.join(', ') + ') as row_num, * ' +
                            ' FROM ' + tables + ' AS ' + tmpTable + whereFragment + ')' +
                          ' AS ' + tmpTable + ' WHERE row_num > ' + offset + ')' +
                        ' AS ' + tmpTable;
        return fragment;
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

  addLimitAndOffset(options, model) {
    if (shouldSkipOffsetHandling(this.sequelize.options.databaseVersion)) {
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
  }
};

// Private helper functions
function isPrimaryKey(dataType) {
  return _.includes(dataType, 'PRIMARY KEY');
}

function hasReferences(dataType) {
  return _.includes(dataType, 'REFERENCES');
}

function isValidClause(clause) {
  for (const key in clause) {
    if (!clause[key]) {
      return false;
    }
  }
  return true;
}

function hasReferencesInChangeColumn(definition) {
  return definition.match(/REFERENCES/);
}

function shouldUseTopFragment(databaseVersion) {
  return semver.valid(databaseVersion) && semver.lt(databaseVersion, '11.0.0');
}

function shouldSkipOffsetHandling(databaseVersion) {
  return semver.valid(databaseVersion) && semver.lt(databaseVersion, '11.0.0');
}

function getJoinSnippet(array, self) {
  return array.map(key => {
    key = self.quoteIdentifier(key);
    return `${targetTableAlias}.${key} = ${sourceTableAlias}.${key}`;
  });
}

function addUniqueConstraints(options, values) {
  if (!options || !options.uniqueKeys) return;
  _.each(options.uniqueKeys, (columns, indexName) => {
    if (columns.customIndex) {
      if (!_.isString(indexName)) {
        indexName = 'uniq_' + tableName + '_' + columns.fields.join('_');
      }
      values.attributes += `, CONSTRAINT ${self.quoteIdentifier(indexName)} UNIQUE (${columns.fields.map(field => self.quoteIdentifier(field)).join(', ')})`;
    }
  });
}

function addPrimaryKeyConstraint(primaryKeys, values) {
  if (primaryKeys.length === 0) return;
  const pkString = primaryKeys.map(pk => self.quoteIdentifier(pk)).join(', ');
  values.attributes += `, PRIMARY KEY (${pkString})`;
}

function addForeignKeyConstraints(foreignKeys, values) {
  for (const fkey in foreignKeys) {
    if (foreignKeys.hasOwnProperty(fkey)) {
      values.attributes += ', FOREIGN KEY (' + self.quoteIdentifier(fkey) + ') ' + foreignKeys[fkey];
    }
  }
}