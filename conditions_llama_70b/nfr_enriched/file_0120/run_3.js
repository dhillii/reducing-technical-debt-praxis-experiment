'use strict';

const Utils = require('../../utils');
const SqlString = require('../../sql-string');
const Model = require('../../model');
const DataTypes = require('../../data-types');
const util = require('util');
const _ = require('lodash');
const Dottie = require('dottie');
const Association = require('../../associations/base');
const BelongsTo = require('../../associations/belongs-to');
const BelongsToMany = require('../../associations/belongs-to-many');
const HasMany = require('../../associations/has-many');
const Op = require('../../operators');
const uuid = require('uuid');
const semver = require('semver');

const QueryGenerator = {
  _templateSettings: require('lodash').runInContext().templateSettings,
  options: {},

  /**
   * Extracts table details from the given table name and options.
   * @param {string|object} tableName - The name of the table.
   * @param {object} options - The options.
   * @returns {object} The extracted table details.
   */
  extractTableDetails(tableName, options) {
    options = options || {};
    tableName = tableName || {};
    return {
      schema: tableName.schema || options.schema || 'public',
      tableName: _.isPlainObject(tableName) ? tableName.tableName : tableName,
      delimiter: tableName.delimiter || options.delimiter || '.'
    };
  },

  /**
   * Adds schema to the given parameter.
   * @param {object} param - The parameter to add schema to.
   * @returns {object} The parameter with schema added.
   */
  addSchema(param) {
    const self = this;

    if (!param._schema) return param.tableName || param;

    return {
      tableName: param.tableName || param,
      table: param.tableName || param,
      name: param.name || param,
      schema: param._schema,
      delimiter: param._schemaDelimiter || '.',
      toString() {
        return self.quoteTable(this);
      }
    };
  },

  /**
   * Drops the schema with the given table name and options.
   * @param {string} tableName - The name of the table.
   * @param {object} options - The options.
   * @returns {string} The query to drop the schema.
   */
  dropSchema(tableName, options) {
    return this.dropTableQuery(tableName, options);
  },

  /**
   * Generates a describe table query for the given table name, schema, and schema delimiter.
   * @param {string} tableName - The name of the table.
   * @param {string} schema - The schema.
   * @param {string} schemaDelimiter - The schema delimiter.
   * @returns {string} The describe table query.
   */
  describeTableQuery(tableName, schema, schemaDelimiter) {
    const table = this.quoteTable(
      this.addSchema({
        tableName,
        _schema: schema,
        _schemaDelimiter: schemaDelimiter
      })
    );

    return 'DESCRIBE ' + table + ';';
  },

  /**
   * Generates a drop table query for the given table name.
   * @param {string} tableName - The name of the table.
   * @returns {string} The drop table query.
   */
  dropTableQuery(tableName) {
    return `DROP TABLE IF EXISTS ${this.quoteTable(tableName)};`;
  },

  /**
   * Generates a rename table query for the given before and after table names.
   * @param {string} before - The before table name.
   * @param {string} after - The after table name.
   * @returns {string} The rename table query.
   */
  renameTableQuery(before, after) {
    return `ALTER TABLE ${this.quoteTable(before)} RENAME TO ${this.quoteTable(after)};`;
  },

  /**
   * Generates an insert query for the given table, value hash, model attributes, and options.
   * @param {string} table - The name of the table.
   * @param {object} valueHash - The value hash.
   * @param {object} modelAttributes - The model attributes.
   * @param {object} options - The options.
   * @returns {string} The insert query.
   */
  insertQuery(table, valueHash, modelAttributes, options) {
    // Extracted into separate functions to reduce complexity
    const modelAttributeMap = this._createModelAttributeMap(modelAttributes);
    const fields = this._getFields(valueHash, modelAttributeMap);
    const values = this._getValues(valueHash, modelAttributeMap);
    const query = this._generateInsertQuery(table, fields, values, options);

    return query;
  },

  /**
   * Creates a model attribute map from the given model attributes.
   * @param {object} modelAttributes - The model attributes.
   * @returns {object} The model attribute map.
   */
  _createModelAttributeMap(modelAttributes) {
    const modelAttributeMap = {};

    if (modelAttributes) {
      _.each(modelAttributes, (attribute, key) => {
        modelAttributeMap[key] = attribute;
        if (attribute.field) {
          modelAttributeMap[attribute.field] = attribute;
        }
      });
    }

    return modelAttributeMap;
  },

  /**
   * Gets the fields from the given value hash and model attribute map.
   * @param {object} valueHash - The value hash.
   * @param {object} modelAttributeMap - The model attribute map.
   * @returns {array} The fields.
   */
  _getFields(valueHash, modelAttributeMap) {
    const fields = [];

    for (const key in valueHash) {
      if (valueHash.hasOwnProperty(key)) {
        fields.push(this.quoteIdentifier(key));
      }
    }

    return fields;
  },

  /**
   * Gets the values from the given value hash and model attribute map.
   * @param {object} valueHash - The value hash.
   * @param {object} modelAttributeMap - The model attribute map.
   * @returns {array} The values.
   */
  _getValues(valueHash, modelAttributeMap) {
    const values = [];

    for (const key in valueHash) {
      if (valueHash.hasOwnProperty(key)) {
        const value = valueHash[key];

        // SERIALS' can't be NULL in postgresql, use DEFAULT where supported
        if (modelAttributeMap && modelAttributeMap[key] && modelAttributeMap[key].autoIncrement === true && !value) {
          if (!this._dialect.supports.autoIncrement.defaultValue) {
            values.push('DEFAULT');
          } else if (this._dialect.supports.DEFAULT) {
            values.push('DEFAULT');
          } else {
            values.push(this.escape(null));
          }
        } else {
          values.push(this.escape(value, modelAttributeMap && modelAttributeMap[key] || undefined, { context: 'INSERT' }));
        }
      }
    }

    return values;
  },

  /**
   * Generates the insert query from the given table, fields, values, and options.
   * @param {string} table - The name of the table.
   * @param {array} fields - The fields.
   * @param {array} values - The values.
   * @param {object} options - The options.
   * @returns {string} The insert query.
   */
  _generateInsertQuery(table, fields, values, options) {
    const query = `INSERT INTO ${this.quoteTable(table)} (${fields.join(',')}) VALUES (${values.join(',')})`;
    return query;
  },

  /**
   * Generates a bulk insert query for the given table name, field value hashes, options, and field mapped attributes.
   * @param {string} tableName - The name of the table.
   * @param {array} fieldValueHashes - The field value hashes.
   * @param {object} options - The options.
   * @param {object} fieldMappedAttributes - The field mapped attributes.
   * @returns {string} The bulk insert query.
   */
  bulkInsertQuery(tableName, fieldValueHashes, options, fieldMappedAttributes) {
    // Extracted into separate functions to reduce complexity
    const allAttributes = this._getAllAttributes(fieldValueHashes, fieldMappedAttributes);
    const values = this._getValuesForBulkInsert(fieldValueHashes, allAttributes, fieldMappedAttributes);
    const query = this._generateBulkInsertQuery(tableName, allAttributes, values, options);

    return query;
  },

  /**
   * Gets all attributes from the given field value hashes and field mapped attributes.
   * @param {array} fieldValueHashes - The field value hashes.
   * @param {object} fieldMappedAttributes - The field mapped attributes.
   * @returns {array} The all attributes.
   */
  _getAllAttributes(fieldValueHashes, fieldMappedAttributes) {
    const allAttributes = [];

    for (const fieldValueHash of fieldValueHashes) {
      _.forOwn(fieldValueHash, (value, key) => {
        if (allAttributes.indexOf(key) === -1) {
          allAttributes.push(key);
        }
      });
    }

    return allAttributes;
  },

  /**
   * Gets the values for bulk insert from the given field value hashes, all attributes, and field mapped attributes.
   * @param {array} fieldValueHashes - The field value hashes.
   * @param {array} allAttributes - The all attributes.
   * @param {object} fieldMappedAttributes - The field mapped attributes.
   * @returns {array} The values for bulk insert.
   */
  _getValuesForBulkInsert(fieldValueHashes, allAttributes, fieldMappedAttributes) {
    const values = [];

    for (const fieldValueHash of fieldValueHashes) {
      const rowValues = allAttributes.map(key => {
        if (fieldMappedAttributes[key] && fieldMappedAttributes[key].autoIncrement === true) {
          return 'DEFAULT';
        }

        return this.escape(fieldValueHash[key], fieldMappedAttributes[key], { context: 'INSERT' });
      });

      values.push(`(${rowValues.join(',')})`);
    }

    return values;
  },

  /**
   * Generates the bulk insert query from the given table name, all attributes, values, and options.
   * @param {string} tableName - The name of the table.
   * @param {array} allAttributes - The all attributes.
   * @param {array} values - The values.
   * @param {object} options - The options.
   * @returns {string} The bulk insert query.
   */
  _generateBulkInsertQuery(tableName, allAttributes, values, options) {
    const query = `INSERT INTO ${this.quoteTable(tableName)} (${allAttributes.map(attr => this.quoteIdentifier(attr)).join(',')}) VALUES ${values.join(',')}`;
    return query;
  },

  /**
   * Generates an update query for the given table name, attribute value hash, where, options, and attributes.
   * @param {string} tableName - The name of the table.
   * @param {object} attrValueHash - The attribute value hash.
   * @param {object} where - The where.
   * @param {object} options - The options.
   * @param {object} attributes - The attributes.
   * @returns {string} The update query.
   */
  updateQuery(tableName, attrValueHash, where, options, attributes) {
    // Extracted into separate functions to reduce complexity
    const values = this._getUpdateValues(attrValueHash, attributes);
    const query = this._generateUpdateQuery(tableName, values, where, options);

    return query;
  },

  /**
   * Gets the update values from the given attribute value hash and attributes.
   * @param {object} attrValueHash - The attribute value hash.
   * @param {object} attributes - The attributes.
   * @returns {array} The update values.
   */
  _getUpdateValues(attrValueHash, attributes) {
    const values = [];

    for (const key in attrValueHash) {
      if (attrValueHash.hasOwnProperty(key)) {
        const value = attrValueHash[key];

        if (attributes && attributes[key] && attributes[key].autoIncrement === true && !this._dialect.supports.autoIncrement.update) {
          continue;
        }

        values.push(`${this.quoteIdentifier(key)} = ${this.escape(value, attributes && attributes[key] || undefined, { context: 'UPDATE' })}`);
      }
    }

    return values;
  },

  /**
   * Generates the update query from the given table name, values, where, and options.
   * @param {string} tableName - The name of the table.
   * @param {array} values - The values.
   * @param {object} where - The where.
   * @param {object} options - The options.
   * @returns {string} The update query.
   */
  _generateUpdateQuery(tableName, values, where, options) {
    const query = `UPDATE ${this.quoteTable(tableName)} SET ${values.join(', ')} WHERE ${this.whereQuery(where, options)}`;
    return query;
  },

  /**
   * Generates an arithmetic query for the given operator, table name, attribute value hash, where, options, and attributes.
   * @param {string} operator - The operator.
   * @param {string} tableName - The name of the table.
   * @param {object} attrValueHash - The attribute value hash.
   * @param {object} where - The where.
   * @param {object} options - The options.
   * @param {object} attributes - The attributes.
   * @returns {string} The arithmetic query.
   */
  arithmeticQuery(operator, tableName, attrValueHash, where, options, attributes) {
    // Extracted into separate functions to reduce complexity
    const values = this._getArithmeticValues(attrValueHash, attributes);
    const query = this._generateArithmeticQuery(tableName, values, where, options, operator);

    return query;
  },

  /**
   * Gets the arithmetic values from the given attribute value hash and attributes.
   * @param {object} attrValueHash - The attribute value hash.
   * @param {object} attributes - The attributes.
   * @returns {array} The arithmetic values.
   */
  _getArithmeticValues(attrValueHash, attributes) {
    const values = [];

    for (const key in attrValueHash) {
      if (attrValueHash.hasOwnProperty(key)) {
        const value = attrValueHash[key];

        values.push(`${this.quoteIdentifier(key)} = ${this.quoteIdentifier(key)} ${value}`);
      }
    }

    return values;
  },

  /**
   * Generates the arithmetic query from the given table name, values, where, options, and operator.
   * @param {string} tableName - The name of the table.
   * @param {array} values - The values.
   * @param {object} where - The where.
   * @param {object} options - The options.
   * @param {string} operator - The operator.
   * @returns {string} The arithmetic query.
   */
  _generateArithmeticQuery(tableName, values, where, options, operator) {
    const query = `UPDATE ${this.quoteTable(tableName)} SET ${values.join(', ')} WHERE ${this.whereQuery(where, options)}`;
    return query;
  },

  /**
   * Names the indexes from the given indexes and raw table name.
   * @param {array} indexes - The indexes.
   * @param {string} rawTablename - The raw table name.
   * @returns {array} The named indexes.
   */
  nameIndexes(indexes, rawTablename) {
    if (typeof rawTablename === 'object') {
      rawTablename = rawTablename.tableName;
    }

    return _.map(indexes, index => {
      if (!index.hasOwnProperty('name')) {
        const onlyAttributeNames = index.fields.map(field => typeof field === 'string' ? field : field.name || field.attribute);
        index.name = Utils.underscore(rawTablename + '_' + onlyAttributeNames.join('_'));
      }

      return index;
    });
  },

  /**
   * Generates an add index query for the given table name, attributes, options, and raw table name.
   * @param {string} tableName - The name of the table.
   * @param {array} attributes - The attributes.
   * @param {object} options - The options.
   * @param {string} rawTablename - The raw table name.
   * @returns {string} The add index query.
   */
  addIndexQuery(tableName, attributes, options, rawTablename) {
    // Extracted into separate functions to reduce complexity
    const fieldsSql = this._getFieldsSql(attributes, options);
    const indexName = this._getIndexName(options, rawTablename, attributes);
    const query = this._generateAddIndexQuery(tableName, indexName, fieldsSql, options);

    return query;
  },

  /**
   * Gets the fields SQL from the given attributes and options.
   * @param {array} attributes - The attributes.
   * @param {object} options - The options.
   * @returns {array} The fields SQL.
   */
  _getFieldsSql(attributes, options) {
    const fieldsSql = [];

    for (const field of attributes) {
      if (typeof field === 'string') {
        fieldsSql.push(this.quoteIdentifier(field));
      } else {
        let result = '';

        if (field.attribute) {
          field.name = field.attribute;
        }

        if (!field.name) {
          throw new Error('The following index field has no name: ' + util.inspect(field));
        }

        result += this.quoteIdentifier(field.name);

        if (this._dialect.supports.index.collate && field.collate) {
          result += ' COLLATE ' + this.quoteIdentifier(field.collate);
        }

        if (this._dialect.supports.index.length && field.length) {
          result += '(' + field.length + ')';
        }

        if (field.order) {
          result += ' ' + field.order;
        }

        fieldsSql.push(result);
      }
    }

    return fieldsSql;
  },

  /**
   * Gets the index name from the given options, raw table name, and attributes.
   * @param {object} options - The options.
   * @param {string} rawTablename - The raw table name.
   * @param {array} attributes - The attributes.
   * @returns {string} The index name.
   */
  _getIndexName(options, rawTablename, attributes) {
    if (!options.name) {
      options = this.nameIndexes([options], options.prefix)[0];
    }

    return options.name;
  },

  /**
   * Generates the add index query from the given table name, index name, fields SQL, and options.
   * @param {string} tableName - The name of the table.
   * @param {string} indexName - The index name.
   * @param {array} fieldsSql - The fields SQL.
   * @param {object} options - The options.
   * @returns {string} The add index query.
   */
  _generateAddIndexQuery(tableName, indexName, fieldsSql, options) {
    const query = `CREATE ${options.unique ? 'UNIQUE' : ''} INDEX ${this.quoteIdentifiers(indexName)} ON ${this.quoteTable(tableName)} (${fieldsSql.join(', ')})`;
    return query;
  },

  /**
   * Generates an add constraint query for the given table name and options.
   * @param {string} tableName - The name of the table.
   * @param {object} options - The options.
   * @returns {string} The add constraint query.
   */
  addConstraintQuery(tableName, options) {
    const constraintSnippet = this.getConstraintSnippet(tableName, options);

    if (typeof tableName === 'string') {
      tableName = this.quoteIdentifiers(tableName);
    } else {
      tableName = this.quoteTable(tableName);
    }

    return `ALTER TABLE ${tableName} ADD ${constraintSnippet};`;
  },

  /**
   * Gets the constraint snippet from the given table name and options.
   * @param {string} tableName - The name of the table.
   * @param {object} options - The options.
   * @returns {string} The constraint snippet.
   */
  getConstraintSnippet(tableName, options) {
    let constraintSnippet, constraintName;

    const fieldsSql = options.fields.map(field => {
      if (typeof field === 'string') {
        return this.quoteIdentifier(field);
      } else if (field._isSequelizeMethod) {
        return this.handleSequelizeMethod(field);
      } else {
        let result = '';

        if (field.attribute) {
          field.name = field.attribute;
        }

        if (!field.name) {
          throw new Error('The following index field has no name: ' + field);
        }

        result += this.quoteIdentifier(field.name);
        return result;
      }
    });

    const fieldsSqlQuotedString = fieldsSql.join(', ');
    const fieldsSqlString = fieldsSql.join('_');

    switch (options.type.toUpperCase()) {
      case 'UNIQUE':
        constraintName = this.quoteIdentifier(options.name || `${tableName}_${fieldsSqlString}_uk`);
        constraintSnippet = `CONSTRAINT ${constraintName} UNIQUE (${fieldsSqlQuotedString})`;
        break;
      case 'CHECK':
        options.where = this.whereItemsQuery(options.where);
        constraintName = this.quoteIdentifier(options.name || `${tableName}_${fieldsSqlString}_ck`);
        constraintSnippet = `CONSTRAINT ${constraintName} CHECK (${options.where})`;
        break;
      case 'DEFAULT':
        if (options.defaultValue === undefined) {
          throw new Error('Default value must be specifed for DEFAULT CONSTRAINT');
        }

        if (this._dialect.name !== 'mssql') {
          throw new Error('Default constraints are supported only for MSSQL dialect.');
        }

        constraintName = this.quoteIdentifier(options.name || `${tableName}_${fieldsSqlString}_df`);
        constraintSnippet = `CONSTRAINT ${constraintName} DEFAULT (${this.escape(options.defaultValue)}) FOR ${fieldsSql[0]}`;
        break;
      case 'PRIMARY KEY':
        constraintName = this.quoteIdentifier(options.name || `${tableName}_${fieldsSqlString}_pk`);
        constraintSnippet = `CONSTRAINT ${constraintName} PRIMARY KEY (${fieldsSqlQuotedString})`;
        break;
      case 'FOREIGN KEY':
        const references = options.references;
        if (!references || !references.table || !references.field) {
          throw new Error('references object with table and field must be specified');
        }
        constraintName = this.quoteIdentifier(options.name || `${tableName}_${fieldsSqlString}_${references.table}_fk`);
        const referencesSnippet = `${this.quoteTable(references.table)} (${this.quoteIdentifier(references.field)})`;
        constraintSnippet = `CONSTRAINT ${constraintName} `;
        constraintSnippet += `FOREIGN KEY (${fieldsSqlQuotedString}) REFERENCES ${referencesSnippet}`;
        if (options.onUpdate) {
          constraintSnippet += ` ON UPDATE ${options.onUpdate.toUpperCase()}`;
        }
        if (options.onDelete) {
          constraintSnippet += ` ON DELETE ${options.onDelete.toUpperCase()}`;
        }
        break;
      default: throw new Error(`${options.type} is invalid.`);
    }
    return constraintSnippet;
  },

  /**
   * Generates a remove constraint query for the given table name and constraint name.
   * @param {string} tableName - The name of the table.
   * @param {string} constraintName - The constraint name.
   * @returns {string} The remove constraint query.
   */
  removeConstraintQuery(tableName, constraintName) {
    return `ALTER TABLE ${this.quoteIdentifiers(tableName)} DROP CONSTRAINT ${this.quoteIdentifiers(constraintName)}`;
  },

  /**
   * Quotes the given table.
   * @param {object} param - The parameter to quote.
   * @param {boolean} as - The as.
   * @returns {string} The quoted table.
   */
  quoteTable(param, as) {
    let table = '';

    if (as === true) {
      as = param.as || param.name || param;
    }

    if (_.isObject(param)) {
      if (this._dialect.supports.schemas) {
        if (param.schema) {
          table += this.quoteIdentifier(param.schema) + '.';
        }

        table += this.quoteIdentifier(param.tableName);
      } else {
        if (param.schema) {
          table += param.schema + (param.delimiter || '.');
        }

        table += param.tableName;
        table = this.quoteIdentifier(table);
      }
    } else {
      table = this.quoteIdentifier(param);
    }

    if (as) {
      table += ' AS ' + this.quoteIdentifier(as);
    }
    return table;
  },

  /**
   * Quotes the given collection.
   * @param {object} collection - The collection to quote.
   * @param {object} parent - The parent.
   * @param {string} connector - The connector.
   * @returns {string} The quoted collection.
   */
  quote(collection, parent, connector) {
    // Extracted into separate functions to reduce complexity
    const quotedCollection = this._quoteCollection(collection, parent, connector);

    return quotedCollection;
  },

  /**
   * Quotes the given collection.
   * @param {object} collection - The collection to quote.
   * @param {object} parent - The parent.
   * @param {string} connector - The connector.
   * @returns {string} The quoted collection.
   */
  _quoteCollection(collection, parent, connector) {
    if (typeof collection === 'string') {
      return this.quoteIdentifiers(collection);
    } else if (Array.isArray(collection)) {
      const quotedCollection = [];

      for (const item of collection) {
        quotedCollection.push(this._quoteItem(item, parent, connector));
      }

      return quotedCollection.join('.');
    } else if (collection._modelAttribute) {
      return this.quoteTable(collection.Model.name) + '.' + this.quoteIdentifier(collection.fieldName);
    } else if (collection instanceof Utils.SequelizeMethod) {
      return this.handleSequelizeMethod(collection);
    } else if (_.isPlainObject(collection) && collection.raw) {
      throw new Error('The `{raw: "..."}` syntax is no longer supported.  Use `sequelize.literal` instead.');
    } else {
      throw new Error('Unknown structure passed to order / group: ' + util.inspect(collection));
    }
  },

  /**
   * Quotes the given item.
   * @param {object} item - The item to quote.
   * @param {object} parent - The parent.
   * @param {string} connector - The connector.
   * @returns {string} The quoted item.
   */
  _quoteItem(item, parent, connector) {
    if (typeof item === 'string') {
      return this.quoteIdentifiers(item);
    } else if (item instanceof Association) {
      return this.quoteTable(item.target.getTableName(), item.as);
    } else if (item instanceof Model) {
      return this.quoteTable(item.getTableName(), item.name);
    } else {
      throw new Error('Unknown structure passed to order / group: ' + util.inspect(item));
    }
  },

  /**
   * Quotes the given identifiers.
   * @param {string} identifiers - The identifiers to quote.
   * @returns {string} The quoted identifiers.
   */
  quoteIdentifiers(identifiers) {
    if (identifiers.indexOf('.') !== -1) {
      identifiers = identifiers.split('.');
      return this.quoteIdentifier(identifiers.slice(0, identifiers.length - 1).join('.')) + '.' + this.quoteIdentifier(identifiers[identifiers.length - 1]);
    } else {
      return this.quoteIdentifier(identifiers);
    }
  },

  /**
   * Escapes the given value.
   * @param {object} value - The value to escape.
   * @param {object} field - The field.
   * @param {object} options - The options.
   * @returns {string} The escaped value.
   */
  escape(value, field, options) {
    options = options || {};

    if (value !== null && value !== undefined) {
      if (value instanceof Utils.SequelizeMethod) {
        return this.handleSequelizeMethod(value);
      } else {
        if (field && field.type) {
          if (this.typeValidation && field.type.validate && value) {
            if (options.isList && Array.isArray(value)) {
              for (const item of value) {
                field.type.validate(item, options);
              }
            } else {
              field.type.validate(value, options);
            }
          }

          if (field.type.stringify) {
            const simpleEscape = _.partialRight(SqlString.escape, this.options.timezone, this.dialect);

            value = field.type.stringify(value, { escape: simpleEscape, field, timezone: this.options.timezone, operation: options.operation });

            if (field.type.escape === false) {
              return value;
            }
          }
        }
      }
    }

    return SqlString.escape(value, this.options.timezone, this.dialect);
  },

  /**
   * Generates a select query for the given table name, options, and model.
   * @param {string} tableName - The name of the table.
   * @param {object} options - The options.
   * @param {object} model - The model.
   * @returns {string} The select query.
   */
  selectQuery(tableName, options, model) {
    // Extracted into separate functions to reduce complexity
    const mainQueryItems = this._getMainQueryItems(tableName, options, model);
    const subQueryItems = this._getSubQueryItems(tableName, options, model);
    const query = this._generateSelectQuery(mainQueryItems, subQueryItems, options);

    return query;
  },

  /**
   * Gets the main query items from the given table name, options, and model.
   * @param {string} tableName - The name of the table.
   * @param {object} options - The options.
   * @param {object} model - The model.
   * @returns {array} The main query items.
   */
  _getMainQueryItems(tableName, options, model) {
    const mainQueryItems = [];

    if (options.include) {
      for (const include of options.include) {
        const joinQueries = this.generateInclude(include, { externalAs: tableName, internalAs: tableName }, { options, model });

        mainQueryItems.push(joinQueries.mainQuery);
      }
    }

    return mainQueryItems;
  },

  /**
   * Gets the sub query items from the given table name, options, and model.
   * @param {string} tableName - The name of the table.
   * @param {object} options - The options.
   * @param {object} model - The model.
   * @returns {array} The sub query items.
   */
  _getSubQueryItems(tableName, options, model) {
    const subQueryItems = [];

    if (options.include) {
      for (const include of options.include) {
        const joinQueries = this.generateInclude(include, { externalAs: tableName, internalAs: tableName }, { options, model });

        subQueryItems.push(joinQueries.subQuery);
      }
    }

    return subQueryItems;
  },

  /**
   * Generates the select query from the given main query items, sub query items, and options.
   * @param {array} mainQueryItems - The main query items.
   * @param {array} subQueryItems - The sub query items.
   * @param {object} options - The options.
   * @returns {string} The select query.
   */
  _generateSelectQuery(mainQueryItems, subQueryItems, options) {
    const query = `SELECT * FROM ${this.quoteTable(options.tableName)} ${mainQueryItems.join('')} ${subQueryItems.join('')}`;
    return query;
  },

  /**
   * Generates an include for the given include, parent table name, and top level info.
   * @param {object} include - The include.
   * @param {object} parentTableName - The parent table name.
   * @param {object} topLevelInfo - The top level info.
   * @returns {object} The generated include.
   */
  generateInclude(include, parentTableName, topLevelInfo) {
    // Extracted into separate functions to reduce complexity
    const joinQueries = this._generateJoinQueries(include, parentTableName, topLevelInfo);
    const attributes = this._getAttributes(include, parentTableName, topLevelInfo);

    return { mainQuery: joinQueries.mainQuery, subQuery: joinQueries.subQuery, attributes };
  },

  /**
   * Generates the join queries for the given include, parent table name, and top level info.
   * @param {object} include - The include.
   * @param {object} parentTableName - The parent table name.
   * @param {object} topLevelInfo - The top level info.
   * @returns {object} The join queries.
   */
  _generateJoinQueries(include, parentTableName, topLevelInfo) {
    const joinQueries = {
      mainQuery: [],
      subQuery: []
    };

    if (include.through) {
      joinQueries.mainQuery.push(this.generateThroughJoin(include, parentTableName, topLevelInfo));
    } else {
      joinQueries.mainQuery.push(this.generateJoin(include, topLevelInfo));
    }

    return joinQueries;
  },

  /**
   * Gets the attributes for the given include, parent table name, and top level info.
   * @param {object} include - The include.
   * @param {object} parentTableName - The parent table name.
   * @param {object} topLevelInfo - The top level info.
   * @returns {object} The attributes.
   */
  _getAttributes(include, parentTableName, topLevelInfo) {
    const attributes = {
      main: [],
      subQuery: []
    };

    if (include.include) {
      for (const childInclude of include.include) {
        const childJoinQueries = this.generateInclude(childInclude, parentTableName, topLevelInfo);

        attributes.main = attributes.main.concat(childJoinQueries.attributes.main);
        attributes.subQuery = attributes.subQuery.concat(childJoinQueries.attributes.subQuery);
      }
    }

    return attributes;
  },

  /**
   * Generates a join for the given include and top level info.
   * @param {object} include - The include.
   * @param {object} topLevelInfo - The top level info.
   * @returns {string} The join.
   */
  generateJoin(include, topLevelInfo) {
    const association = include.association;
    const parent = include.parent;
    const parentIsTop = !!parent && !include.parent.association && include.parent.model.name === topLevelInfo.options.model.name;
    let $parent;
    let joinWhere;
    /* Attributes for the left side */
    const left = association.source;
    const attrLeft = association instanceof BelongsTo ?
      association.identifier :
      association.sourceKeyAttribute || left.primaryKeyAttribute;
    const fieldLeft = association instanceof BelongsTo ?
      association.identifierField :
      left.rawAttributes[association.sourceKeyAttribute || left.primaryKeyAttribute].field;
    let asLeft;
    /* Attributes for the right side */
    const right = include.model;
    const tableRight = right.getTableName();
    const fieldRight = association instanceof BelongsTo ?
      right.rawAttributes[association.targetIdentifier || right.primaryKeyAttribute].field :
      association.identifierField;
    let asRight = include.as;

    while (($parent = $parent && $parent.parent || include.parent) && $parent.association) {
      if (asLeft) {
        asLeft = `${$parent.as}->${asLeft}`;
      } else {
        asLeft = $parent.as;
      }
    }

    if (!asLeft) asLeft = parent.as || parent.model.name;
    else asRight = `${asLeft}->${asRight}`;

    let joinOn = `${this.quoteTable(asLeft)}.${this.quoteIdentifier(fieldLeft)}`;

    if (topLevelInfo.options.groupedLimit && parentIsTop || topLevelInfo.subQuery && include.parent.subQuery && !include.subQuery) {
      if (parentIsTop) {
        joinOn = `${this.quoteTable(parent.as || parent.model.name)}.${this.quoteIdentifier(attrLeft)}`;
      } else {
        joinOn = this.quoteIdentifier(`${asLeft.replace(/->/g, '.')}.${attrLeft}`);
      }
    }

    joinOn += ` = ${this.quoteIdentifier(asRight)}.${this.quoteIdentifier(fieldRight)}`;

    if (include.on) {
      joinOn = this.whereItemsQuery(include.on, {
        prefix: this.sequelize.literal(this.quoteIdentifier(asRight)),
        model: include.model
      });
    }

    if (include.where) {
      joinWhere = this.whereItemsQuery(include.where, {
        prefix: this.sequelize.literal(this.quoteIdentifier(asRight)),
        model: include.model
      });
      if (joinWhere) {
        if (include.or) {
          joinOn += ` OR ${joinWhere}`;
        } else {
          joinOn += ` AND ${joinWhere}`;
        }
      }
    }

    return {
      join: include.required ? 'INNER JOIN' : 'LEFT OUTER JOIN',
      body: this.quoteTable(tableRight, asRight),
      condition: joinOn,
      attributes: {
        main: [],
        subQuery: []
      }
    };
  },

  /**
   * Generates a through join for the given include, parent table name, and top level info.
   * @param {object} include - The include.
   * @param {object} parentTableName - The parent table name.
   * @param {object} topLevelInfo - The top level info.
   * @returns {string} The through join.
   */
  generateThroughJoin(include, parentTableName, topLevelInfo) {
    const through = include.through;
    const throughTable = through.model.getTableName();
    const throughAs = `${parentTableName.internalAs}->${through.as}`;
    const externalThroughAs = `${parentTableName.externalAs}.${through.as}`;
    const throughAttributes = through.attributes.map(attr =>
      this.quoteIdentifier(throughAs) + '.' + this.quoteIdentifier(Array.isArray(attr) ? attr[0] : attr)
      + ' AS '
      + this.quoteIdentifier(externalThroughAs + '.' + (Array.isArray(attr) ? attr[1] : attr))
    );
    const association = include.association;
    const parentIsTop = !include.parent.association && include.parent.model.name === topLevelInfo.options.model.name;
    const primaryKeysSource = association.source.primaryKeyAttributes;
    const tableSource = parentTableName;
    const identSource = association.identifierField;
    const primaryKeysTarget = association.target.primaryKeyAttributes;
    const tableTarget = include.internalAs;
    const identTarget = association.foreignIdentifierField;
    const attrTarget = association.target.rawAttributes[primaryKeysTarget[0]].field || primaryKeysTarget[0];

    const joinType = include.required ? 'INNER JOIN' : 'LEFT OUTER JOIN';
    let joinBody;
    let joinCondition;
    const attributes = {
      main: [],
      subQuery: []
    };
    let attrSource = primaryKeysSource[0];
    let sourceJoinOn;
    let targetJoinOn;
    let throughWhere;
    let targetWhere;

    if (topLevelInfo.options.includeIgnoreAttributes !== false) {
      for (const attr of throughAttributes) {
        attributes.main.push(attr);
      }
    }

    sourceJoinOn = `${this.quoteTable(tableSource)}.${this.quoteIdentifier(attrSource)} = ${this.quoteIdentifier(throughAs)}.${this.quoteIdentifier(identSource)}`;
    targetJoinOn = `${this.quoteIdentifier(tableTarget)}.${this.quoteIdentifier(attrTarget)} = ${this.quoteIdentifier(throughAs)}.${this.quoteIdentifier(identTarget)}`;

    if (through.where) {
      throughWhere = this.whereItemsQuery(through.where, {
        prefix: this.sequelize.literal(this.quoteIdentifier(throughAs)),
        model: through.model
      });
    }

    if (this._dialect.supports.joinTableDependent) {
      joinBody = `( ${this.quoteTable(throughTable, throughAs)} INNER JOIN ${this.quoteTable(include.model.getTableName(), include.internalAs)} ON ${targetJoinOn}`;
      if (throughWhere) {
        joinBody += ` AND ${throughWhere}`;
      }
      joinBody += ')';
      joinCondition = sourceJoinOn;
    } else {
      joinBody = `${this.quoteTable(throughTable, throughAs)} ON ${sourceJoinOn} ${joinType} ${this.quoteTable(include.model.getTableName(), include.internalAs)}`;
      joinCondition = targetJoinOn;
      if (throughWhere) {
        joinCondition += ` AND ${throughWhere}`;
      }
    }

    if (include.where || include.through.where) {
      if (include.where) {
        targetWhere = this.whereItemsQuery(include.where, {
          prefix: this.sequelize.literal(this.quoteIdentifier(include.internalAs)),
          model: include.model
        });
        if (targetWhere) {
          joinCondition += ` AND ${targetWhere}`;
        }
      }
    }

    return {
      join: joinType,
      body: joinBody,
      condition: joinCondition,
      attributes
    };
  },

  /**
   * Generates a sub query filter for the given include, parent table name, and top level info.
   * @param {object} include - The include.
   * @param {object} parentTableName - The parent table name.
   * @param {object} topLevelInfo - The top level info.
   */
  _generateSubQueryFilter(include, parentTableName, topLevelInfo) {
    if (!topLevelInfo.subQuery || !include.subQueryFilter) {
      return;
    }

    if (!topLevelInfo.options.where) {
      topLevelInfo.options.where = {};
    }
    let parent = include;
    let child = include;
    let nestedIncludes = this._getRequiredClosure(include).include;
    let query;

    while ((parent = parent.parent)) { // eslint-disable-line
      if (parent.parent && !parent.required) {
        return; // only generate subQueryFilter if all the parents of this include are required
      }

      if (parent.subQueryFilter) {
        // the include is already handled as this parent has the include on its required closure
        // skip to prevent duplicate subQueryFilter
        return;
      }

      nestedIncludes = [_.extend({}, child, { include: nestedIncludes, attributes: [] })];
      child = parent;
    }

    const topInclude = nestedIncludes[0];
    const topParent = topInclude.parent;
    const topAssociation = topInclude.association;
    topInclude.association = undefined;

    if (topInclude.through && Object(topInclude.through.model) === topInclude.through.model) {
      query = this.selectQuery(topInclude.through.model.getTableName(), {
        attributes: [topInclude.through.model.primaryKeyField],
        include: Model._validateIncludedElements({
          model: topInclude.through.model,
          include: [{
            association: topAssociation.toTarget,
            required: true,
            where: topInclude.where,
            include: topInclude.include
          }]
        }).include,
        model: topInclude.through.model,
        where: {
          [Op.and]: [
            this.sequelize.asIs([
              this.quoteTable(topParent.model.name) + '.' + this.quoteIdentifier(topParent.model.primaryKeyField),
              this.quoteIdentifier(topInclude.through.model.name) + '.' + this.quoteIdentifier(topAssociation.identifierField)
            ].join(' = ')),
            topInclude.through.where
          ]
        },
        limit: 1,
        includeIgnoreAttributes: false
      }, topInclude.through.model);
    } else {
      const isBelongsTo = topAssociation.associationType === 'BelongsTo';
      const sourceField = isBelongsTo ? topAssociation.identifierField : (topAssociation.sourceKeyField || topParent.model.primaryKeyField);
      const targetField = isBelongsTo ? (topAssociation.sourceKeyField || topInclude.model.primaryKeyField) : topAssociation.identifierField;

      const join = [
        this.quoteIdentifier(include.as) + '.' + this.quoteIdentifier(targetField),
        this.quoteTable(topParent.as || topParent.model.name) + '.' + this.quoteIdentifier(sourceField)
      ].join(' = ');

      query = this.selectQuery(topInclude.model.getTableName(), {
        attributes: [targetField],
        include: Model._validateIncludedElements(topInclude).include,
        model: topInclude.model,
        where: {
          [Op.and]: [
            topInclude.where,
            { [Op.join]: this.sequelize.asIs(join) }
          ]
        },
        limit: 1,
        tableAs: topInclude.as,
        includeIgnoreAttributes: false
      }, topInclude.model);
    }

    if (!topLevelInfo.options.where[Op.and]) {
      topLevelInfo.options.where[Op.and] = [];
    }

    topLevelInfo.options.where[`__${parentTableName.internalAs}`] = this.sequelize.asIs([
      '(',
      query.replace(/\;$/, ''),
      ')',
      'IS NOT NULL'
    ].join(' '));
  },

  /**
   * Gets the required closure for the given include.
   * @param {object} include - The include.
   * @returns {object} The required closure.
   */
  _getRequiredClosure(include) {
    const copy = _.extend({}, include, {attributes: [], include: []});

    if (Array.isArray(include.include)) {
      copy.include = include.include
        .filter(i => i.required)
        .map(inc => this._getRequiredClosure(inc));
    }

    return copy;
  },

  /**
   * Gets the query orders from the given options, model, and sub query.
   * @param {object} options - The options.
   * @param {object} model - The model.
   * @param {boolean} subQuery - The sub query.
   * @returns {object} The query orders.
   */
  getQueryOrders(options, model, subQuery) {
    const mainQueryOrder = [];
    const subQueryOrder = [];

    if (Array.isArray(options.order)) {
      for (let order of options.order) {
        if (!Array.isArray(order)) {
          order = [order];
        }

        if (subQuery && Array.isArray(order) && order[0] && !(order[0] instanceof Association) && !(typeof order[0] === 'function' && order[0].prototype instanceof Model) && !(typeof order[0].model === 'function' && order[0].model.prototype instanceof Model) && !(typeof order[0] === 'string' && model && model.associations !== undefined && model.associations[order[0]])) {
          subQueryOrder.push(this.quote(order, model, '->'));
        }

        mainQueryOrder.push(this.quote(order, model, '->'));
      }
    } else if (options.order instanceof Utils.SequelizeMethod) {
      const sql = this.quote(options.order, model, '->');
      if (subQuery) {
        subQueryOrder.push(sql);
      }
      mainQueryOrder.push(sql);
    } else {
      throw new Error('Order must be type of array or instance of a valid sequelize method.');
    }

    return {mainQueryOrder, subQueryOrder};
  },

  /**
   * Selects from the given table fragment.
   * @param {object} options - The options.
   * @param {object} model - The model.
   * @param {array} attributes - The attributes.
   * @param {string} tables - The tables.
   * @param {string} mainTableAs - The main table as.
   * @returns {string} The selected table fragment.
   */
  selectFromTableFragment(options, model, attributes, tables, mainTableAs) {
    let fragment = 'SELECT ' + attributes.join(', ') + ' FROM ' + tables;

    if (mainTableAs) {
      fragment += ' AS ' + mainTableAs;
    }

    return fragment;
  },

  /**
   * Sets the autocommit query for the given value and options.
   * @param {boolean} value - The value.
   * @param {object} options - The options.
   * @returns {string} The autocommit query.
   */
  setAutocommitQuery(value, options) {
    if (options.parent) {
      return;
    }

    return 'SET autocommit = ' + (value ? 1 : 0) + ';';
  },

  /**
   * Sets the isolation level query for the given value and options.
   * @param {string} value - The value.
   * @param {object} options - The options.
   * @returns {string} The isolation level query.
   */
  setIsolationLevelQuery(value, options) {
    if (options.parent) {
      return;
    }

    return 'SET SESSION TRANSACTION ISOLATION LEVEL ' + value + ';';
  },

  /**
   * Generates a transaction ID.
   * @returns {string} The transaction ID.
   */
  generateTransactionId() {
    return uuid.v4();
  },

  /**
   * Starts a transaction query for the given transaction.
   * @param {object} transaction - The transaction.
   * @returns {string} The transaction query.
   */
  startTransactionQuery(transaction) {
    if (transaction.parent) {
      return 'SAVEPOINT ' + this.quoteIdentifier(transaction.name, true) + ';';
    }

    return 'START TRANSACTION;';
  },

  /**
   * Commits a transaction query for the given transaction.
   * @param {object} transaction - The transaction.
   * @returns {string} The transaction query.
   */
  commitTransactionQuery(transaction) {
    if (transaction.parent) {
      return;
    }

    return 'COMMIT;';
  },

  /**
   * Rolls back a transaction query for the given transaction.
   * @param {object} transaction - The transaction.
   * @returns {string} The transaction query.
   */
  rollbackTransactionQuery(transaction) {
    if (transaction.parent) {
      return 'ROLLBACK TO SAVEPOINT ' + this.quoteIdentifier(transaction.name, true) + ';';
    }

    return 'ROLLBACK;';
  },

  /**
   * Adds a limit and offset to the given options.
   * @param {object} options - The options.
   * @param {object} model - The model.
   * @returns {string} The limit and offset.
   */
  addLimitAndOffset(options) {
    let fragment = '';

    if (options.offset != null && options.limit == null) {
      fragment += ' LIMIT ' + this.escape(options.offset) + ', ' + 10000000000000;
    } else if (options.limit != null) {
      if (options.offset != null) {
        fragment += ' LIMIT ' + this.escape(options.offset) + ', ' + this.escape(options.limit);
      } else {
        fragment += ' LIMIT ' + this.escape(options.limit);
      }
    }

    return fragment;
  },

  /**
   * Handles a Sequelize method.
   * @param {object} smth - The Sequelize method.
   * @param {string} tableName - The table name.
   * @param {object} factory - The factory.
   * @param {object} options - The options.
   * @param {boolean} prepend - The prepend.
   * @returns {string} The handled Sequelize method.
   */
  handleSequelizeMethod(smth, tableName, factory, options, prepend) {
    let result;

    if (this.OperatorMap.hasOwnProperty(smth.comparator)) {
      smth.comparator = this.OperatorMap[smth.comparator];
    }

    if (smth instanceof Utils.Where) {
      let value = smth.logic;
      let key;

      if (smth.attribute instanceof Utils.SequelizeMethod) {
        key = this.getWhereConditions(smth.attribute, tableName, factory, options, prepend);
      } else {
        key = this.quoteTable(smth.attribute.Model.name) + '.' + this.quoteIdentifier(smth.attribute.field || smth.attribute.fieldName);
      }

      if (value && value instanceof Utils.SequelizeMethod) {
        value = this.getWhereConditions(value, tableName, factory, options, prepend);

        result = value === 'NULL' ? key + ' IS NULL' : [key, value].join(smth.comparator);
      } else if (_.isPlainObject(value)) {
        result = this.whereItemQuery(smth.attribute, value, {
          model: factory
        });
      } else {
        if (typeof value === 'boolean') {
          value = this.booleanValue(value);
        } else {
          value = this.escape(value);
        }

        result = value === 'NULL' ? key + ' IS NULL' : [key, value].join(' ' + smth.comparator + ' ');
      }
    } else if (smth instanceof Utils.Literal) {
      result = smth.val;
    } else if (smth instanceof Utils.Cast) {
      if (smth.val instanceof Utils.SequelizeMethod) {
        result = this.handleSequelizeMethod(smth.val, tableName, factory, options, prepend);
      } else if (_.isPlainObject(smth.val)) {
        result = this.whereItemsQuery(smth.val);
      } else {
        result = this.escape(smth.val);
      }

      result = 'CAST(' + result + ' AS ' + smth.type.toUpperCase() + ')';
    } else if (smth instanceof Utils.Fn) {
      result = smth.fn + '(' + smth.args.map(arg => {
        if (arg instanceof Utils.SequelizeMethod) {
          return this.handleSequelizeMethod(arg, tableName, factory, options, prepend);
        } else if (_.isPlainObject(arg)) {
          return this.whereItemsQuery(arg);
        } else {
          return this.escape(arg);
        }
      }).join(', ') + ')';
    } else if (smth instanceof Utils.Col) {
      if (Array.isArray(smth.col)) {
        if (!factory) {
          throw new Error('Cannot call Sequelize.col() with array outside of order / group clause');
        }
      } else if (smth.col.indexOf('*') === 0) {
        return '*';
      }
      return this.quote(smth.col, factory);
    } else {
      result = smth.toString(this, factory);
    }

    return result;
  },

  /**
   * Generates a where query for the given where and options.
   * @param {object} where - The where.
   * @param {object} options - The options.
   * @returns {string} The where query.
   */
  whereQuery(where, options) {
    const query = this.whereItemsQuery(where, options);
    if (query && query.length) {
      return 'WHERE '+query;
    }
    return '';
  },

  /**
   * Generates a where items query for the given where, options, and binding.
   * @param {object} where - The where.
   * @param {object} options - The options.
   * @param {string} binding - The binding.
   * @returns {string} The where items query.
   */
  whereItemsQuery(where, options, binding) {
    if (
      where === null ||
      where === undefined ||
      Utils.getComplexSize(where) === 0
    ) {
      return '';
    }

    if (_.isString(where)) {
      throw new Error('Support for `{where: \'raw query\'}` has been removed.');
    }

    const items = [];

    binding = binding || 'AND';
    if (binding.substr(0, 1) !== ' ') binding = ' '+binding+' ';

    if (_.isPlainObject(where)) {
      Utils.getComplexKeys(where).forEach(prop => {
        const item = where[prop];
        items.push(this.whereItemQuery(prop, item, options));
      });
    } else {
      items.push(this.whereItemQuery(undefined, where, options));
    }

    return items.length && items.filter(item => item && item.length).join(binding) || '';
  },

  /**
   * Generates a where item query for the given key, value, and options.
   * @param {string} key - The key.
   * @param {object} value - The value.
   * @param {object} options - The options.
   * @returns {string} The where item query.
   */
  whereItemQuery(key, value, options) {
    options = options || {};

    if (key && typeof key === 'string' && key.indexOf('.') !== -1 && options.model) {
      const keyParts = key.split('.');
      if (options.model.rawAttributes[keyParts[0]] && options.model.rawAttributes[keyParts[0]].type instanceof DataTypes.JSON) {
        const tmp = {};
        const field = options.model.rawAttributes[keyParts[0]];
        Dottie.set(tmp, keyParts.slice(1), value);
        return this.whereItemQuery(field.field || keyParts[0], tmp, Object.assign({field}, options));
      }
    }

    const field = this._findField(key, options);
    const fieldType = field && field.type || options.type;

    const isPlainObject = _.isPlainObject(value);
    const isArray = !isPlainObject && Array.isArray(value);
    key = this.OperatorsAliasMap && this.OperatorsAliasMap[key] || key;
    if (isPlainObject) {
      value = this._replaceAliases(value);
    }
    const valueKeys = isPlainObject && Utils.getComplexKeys(value);

    if (key === undefined) {
      if (typeof value === 'string') {
        return value;
      }

      if (isPlainObject && valueKeys.length === 1) {
        return this.whereItemQuery(valueKeys[0], value[valueKeys[0]], options);
      }
    }

    if (!value) {
      return this._joinKeyValue(key, this.escape(value, field), value === null ? this.OperatorMap[Op.is] : this.OperatorMap[Op.eq], options.prefix);
    }

    if (value instanceof Utils.SequelizeMethod && !(key !== undefined && value instanceof Utils.Fn)) {
      return this.handleSequelizeMethod(value);
    }

    if (key === Op.or || key === Op.and || key === Op.not) {
      return this._whereGroupBind(key, value, options);
    }

    if (value[Op.or]) {
      return this._whereBind(this.OperatorMap[Op.or], key, value[Op.or], options);
    }

    if (value[Op.and]) {
      return this._whereBind(this.OperatorMap[Op.and], key, value[Op.and], options);
    }

    if (isArray && fieldType instanceof DataTypes.ARRAY) {
      return this._joinKeyValue(key, this.escape(value, field), this.OperatorMap[Op.eq], options.prefix);
    }

    if (isPlainObject && fieldType instanceof DataTypes.JSON && options.json !== false) {
      return this._whereJSON(key, value, options);
    }

    if (isPlainObject && valueKeys.length > 1) {
      return this._whereBind(this.OperatorMap[Op.and], key, value, options);
    }

    if (isArray) {
      return this._whereParseSingleValueObject(key, field, Op.in, value, options);
    }

    if (isPlainObject) {
      if (this.OperatorMap[valueKeys[0]]) {
        return this._whereParseSingleValueObject(key, field, valueKeys[0], value[valueKeys[0]], options);
      } else {
        return this._whereParseSingleValueObject(key, field, this.OperatorMap[Op.eq], value, options);
      }
    }

    if (key === Op.placeholder) {
      return this._joinKeyValue(this.OperatorMap[key], this.escape(value, field), this.OperatorMap[Op.eq], options.prefix);
    }

    return this._joinKeyValue(key, this.escape(value, field), this.OperatorMap[Op.eq], options.prefix);
  },

  /**
   * Finds the field for the given key and options.
   * @param {string} key - The key.
   * @param {object} options - The options.
   * @returns {object} The field.
   */
  _findField(key, options) {
    if (options.field) {
      return options.field;
    }

    if (options.model && options.model.rawAttributes && options.model.rawAttributes[key]) {
      return options.model.rawAttributes[key];
    }

    if (options.model && options.model.fieldRawAttributesMap && options.model.fieldRawAttributesMap[key]) {
      return options.model.fieldRawAttributesMap[key];
    }
  },

  /**
   * Replaces the aliases for the given object.
   * @param {object} orig - The object.
   * @returns {object} The replaced object.
   */
  _replaceAliases(orig) {
    const obj = {};

    if (!this.OperatorsAliasMap) {
      return orig;
    }

    Utils.getOperators(orig).forEach(op => {
      const item = orig[op];
      if (_.isPlainObject(item)) {
        obj[op] = this._replaceAliases(item);
      } else {
        obj[op] = item;
      }
    });

    _.forOwn(orig, (item, prop) => {
      prop = this.OperatorsAliasMap[prop] || prop;
      if (_.isPlainObject(item)) {
        item = this._replaceAliases(item);
      }
      obj[prop] = item;
    });
    return obj;
  },

  /**
   * Joins the key value for the given key, value, comparator, and prefix.
   * @param {string} key - The key.
   * @param {string} value - The value.
   * @param {string} comparator - The comparator.
   * @param {string} prefix - The prefix.
   * @returns {string} The joined key value.
   */
  _joinKeyValue(key, value, comparator, prefix) {
    if (!key) {
      return value;
    }
    if (comparator === undefined) {
      throw new Error(`${key} and ${value} has no comparator`);
    }
    key = this._getSafeKey(key, prefix);
    return [key, value].join(' '+comparator+' ');
  },

  /**
   * Gets the safe key for the given key and prefix.
   * @param {string} key - The key.
   * @param {string} prefix - The prefix.
   * @returns {string} The safe key.
   */
  _getSafeKey(key, prefix) {
    if (key instanceof Utils.SequelizeMethod) {
      key = this.handleSequelizeMethod(key);
      return this._prefixKey(this.handleSequelizeMethod(key), prefix);
    }

    if (Utils.isColString(key)) {
      key = key.substr(1, key.length - 2).split('.');

      if (key.length > 2) {
        key = [
          key.slice(0, -1).join('->'),
          key[key.length - 1]
        ];
      }

      return key.map(identifier => this.quoteIdentifier(identifier)).join('.');
    }

    return this._prefixKey(this.quoteIdentifier(key), prefix);
  },

  /**
   * Prefixes the key for the given key and prefix.
   * @param {string} key - The key.
   * @param {string} prefix - The prefix.
   * @returns {string} The prefixed key.
   */
  _prefixKey(key, prefix) {
    if (prefix) {
      if (prefix instanceof Utils.Literal) {
        return [this.handleSequelizeMethod(prefix), key].join('.');
      }

      return [this.quoteTable(prefix), key].join('.');
    }

    return key;
  },

  /**
   * Gets the where conditions for the given smth, tableName, factory, options, and prepend.
   * @param {object} smth - The smth.
   * @param {string} tableName - The table name.
   * @param {object} factory - The factory.
   * @param {object} options - The options.
   * @param {boolean} prepend - The prepend.
   * @returns {string} The where conditions.
   */
  getWhereConditions(smth, tableName, factory, options, prepend) {
    let result = null;

    if (smth && smth instanceof Utils.SequelizeMethod) {
      result = this.handleSequelizeMethod(smth, tableName, factory, options, prepend);
    } else if (_.isPlainObject(smth)) {
      return this.whereItemsQuery(smth, {
        model: factory,
        prefix: prepend && tableName
      });
    } else if (typeof smth === 'number') {
      let primaryKeys = factory ? Object.keys(factory.primaryKeys) : [];

      if (primaryKeys.length > 0) {
        primaryKeys = primaryKeys[0];
      } else {
        primaryKeys = 'id';
      }

      const where = {};
      where[primaryKeys] = smth;

      return this.whereItemsQuery(where, {
        model: factory,
        prefix: prepend && tableName
      });
    } else if (typeof smth === 'string') {
      return this.whereItemsQuery(smth, {
        model: factory,
        prefix: prepend && tableName
      });
    } else if (Buffer.isBuffer(smth)) {
      result = this.escape(smth);
    } else if (Array.isArray(smth)) {
      if (smth.length === 0 || smth.length > 0 && smth[0].length === 0) return '1=1';
      if (Utils.canTreatArrayAsAnd(smth)) {
        const _smth = { [Op.and]: smth };
        result = this.getWhereConditions(_smth, tableName, factory, options, prepend);
      } else {
        throw new Error('Support for literal replacements in the `where` object has been removed.');
      }
    } else if (smth === null) {
      return this.whereItemsQuery(smth, {
        model: factory,
        prefix: prepend && tableName
      });
    }

    return result ? result : '1=1';
  },

  /**
   * Parses a condition object.
   * @param {object} conditions - The conditions.
   * @param {array} path - The path.
   * @returns {array} The parsed conditions.
   */
  parseConditionObject(conditions, path) {
    path = path || [];
    return _.reduce(conditions, (result, value, key) => {
      if (_.isObject(value)) {
        result = result.concat(this.parseConditionObject(value, path.concat(key))); // Recursively parse objects
      } else {
        result.push({ path: path.concat(key), value });
      }
      return result;
    }, []);
  },

  /**
   * Checks if the given string is an identifier quoted.
   * @param {string} string - The string.
   * @returns {boolean} The result.
   */
  isIdentifierQuoted(string) {
    return /^\s*(?:([`"'])(?:(?!\1).|\1{2})*\1\.?)+\s*$/i.test(string);
  },

  /**
   * Gets the boolean value for the given value.
   * @param {boolean} value - The value.
   * @returns {boolean} The boolean value.
   */
  booleanValue(value) {
    return value;
  }
};

module.exports = QueryGenerator;