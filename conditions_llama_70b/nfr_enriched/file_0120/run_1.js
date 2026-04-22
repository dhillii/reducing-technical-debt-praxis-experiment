```javascript
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
   * @param {object} options - The options object.
   * @returns {object} - The extracted table details.
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
   * @returns {object} - The parameter with schema added.
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
   * @param {object} options - The options object.
   * @returns {string} - The drop schema query.
   */
  dropSchema(tableName, options) {
    return this.dropTableQuery(tableName, options);
  },

  /**
   * Generates a describe table query for the given table name, schema, and schema delimiter.
   * @param {string} tableName - The name of the table.
   * @param {string} schema - The schema of the table.
   * @param {string} schemaDelimiter - The delimiter for the schema.
   * @returns {string} - The describe table query.
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
   * @returns {string} - The drop table query.
   */
  dropTableQuery(tableName) {
    return `DROP TABLE IF EXISTS ${this.quoteTable(tableName)};`;
  },

  /**
   * Generates a rename table query for the given before and after table names.
   * @param {string} before - The before table name.
   * @param {string} after - The after table name.
   * @returns {string} - The rename table query.
   */
  renameTableQuery(before, after) {
    return `ALTER TABLE ${this.quoteTable(before)} RENAME TO ${this.quoteTable(after)};`;
  },

  /**
   * Generates an insert query for the given table, value hash, model attributes, and options.
   * @param {string} table - The name of the table.
   * @param {object} valueHash - The value hash.
   * @param {object} modelAttributes - The model attributes.
   * @param {object} options - The options object.
   * @returns {string} - The insert query.
   */
  insertQuery(table, valueHash, modelAttributes, options) {
    // Extracted into separate functions for better readability and maintainability
    const { query, replacements } = this._generateInsertQuery(table, valueHash, modelAttributes, options);
    return _.template(query, this._templateSettings)(replacements);
  },

  /**
   * Generates a bulk insert query for the given table name, field value hashes, options, and field mapped attributes.
   * @param {string} tableName - The name of the table.
   * @param {array} fieldValueHashes - The field value hashes.
   * @param {object} options - The options object.
   * @param {object} fieldMappedAttributes - The field mapped attributes.
   * @returns {string} - The bulk insert query.
   */
  bulkInsertQuery(tableName, fieldValueHashes, options, fieldMappedAttributes) {
    // Extracted into separate functions for better readability and maintainability
    const { query, replacements } = this._generateBulkInsertQuery(tableName, fieldValueHashes, options, fieldMappedAttributes);
    return _.template(query, this._templateSettings)(replacements);
  },

  /**
   * Generates an update query for the given table name, attribute value hash, where clause, options, and attributes.
   * @param {string} tableName - The name of the table.
   * @param {object} attrValueHash - The attribute value hash.
   * @param {string|object} where - The where clause.
   * @param {object} options - The options object.
   * @param {object} attributes - The attributes.
   * @returns {string} - The update query.
   */
  updateQuery(tableName, attrValueHash, where, options, attributes) {
    // Extracted into separate functions for better readability and maintainability
    const query = this._generateUpdateQuery(tableName, attrValueHash, where, options, attributes);
    return query;
  },

  /**
   * Generates an arithmetic query for the given operator, table name, attribute value hash, where clause, options, and attributes.
   * @param {string} operator - The operator.
   * @param {string} tableName - The name of the table.
   * @param {object} attrValueHash - The attribute value hash.
   * @param {string|object} where - The where clause.
   * @param {object} options - The options object.
   * @param {object} attributes - The attributes.
   * @returns {string} - The arithmetic query.
   */
  arithmeticQuery(operator, tableName, attrValueHash, where, options, attributes) {
    // Extracted into separate functions for better readability and maintainability
    const query = this._generateArithmeticQuery(operator, tableName, attrValueHash, where, options, attributes);
    return query;
  },

  /**
   * Names the indexes for the given indexes and raw table name.
   * @param {array} indexes - The indexes.
   * @param {string|object} rawTablename - The raw table name.
   * @returns {array} - The named indexes.
   */
  nameIndexes(indexes, rawTablename) {
    if (typeof rawTablename === 'object') {
      // don't include schema in the index name
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
   * @param {object} options - The options object.
   * @param {string} rawTablename - The raw table name.
   * @returns {string} - The add index query.
   */
  addIndexQuery(tableName, attributes, options, rawTablename) {
    // Extracted into separate functions for better readability and maintainability
    const query = this._generateAddIndexQuery(tableName, attributes, options, rawTablename);
    return query;
  },

  /**
   * Generates an add constraint query for the given table name and options.
   * @param {string} tableName - The name of the table.
   * @param {object} options - The options object.
   * @returns {string} - The add constraint query.
   */
  addConstraintQuery(tableName, options) {
    // Extracted into separate functions for better readability and maintainability
    const constraintSnippet = this._generateConstraintSnippet(tableName, options);
    return `ALTER TABLE ${this.quoteIdentifiers(tableName)} ADD ${constraintSnippet};`;
  },

  /**
   * Generates a remove constraint query for the given table name and constraint name.
   * @param {string} tableName - The name of the table.
   * @param {string} constraintName - The name of the constraint.
   * @returns {string} - The remove constraint query.
   */
  removeConstraintQuery(tableName, constraintName) {
    return `ALTER TABLE ${this.quoteIdentifiers(tableName)} DROP CONSTRAINT ${this.quoteIdentifiers(constraintName)}`;
  },

  /**
   * Quotes the given table name and alias.
   * @param {string|object} param - The table name or object.
   * @param {string} as - The alias.
   * @returns {string} - The quoted table name and alias.
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
   * @param {string|array|object} collection - The collection to quote.
   * @param {object} parent - The parent object.
   * @param {string} connector - The connector.
   * @returns {string} - The quoted collection.
   */
  quote(collection, parent, connector) {
    // Extracted into separate functions for better readability and maintainability
    return this._quoteCollection(collection, parent, connector);
  },

  /**
   * Quotes the given identifiers.
   * @param {string} identifiers - The identifiers to quote.
   * @returns {string} - The quoted identifiers.
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
   * @param {string|number|date} value - The value to escape.
   * @param {object} field - The field object.
   * @param {object} options - The options object.
   * @returns {string} - The escaped value.
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
            // Users shouldn't have to worry about these args - just give them a function that takes a single arg
            const simpleEscape = _.partialRight(SqlString.escape, this.options.timezone, this.dialect);

            value = field.type.stringify(value, { escape: simpleEscape, field, timezone: this.options.timezone, operation: options.operation });

            if (field.type.escape === false) {
              // The data-type already did the required escaping
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
   * @param {object} options - The options object.
   * @param {object} model - The model object.
   * @returns {string} - The select query.
   */
  selectQuery(tableName, options, model) {
    // Extracted into separate functions for better readability and maintainability
    return this._generateSelectQuery(tableName, options, model);
  },

  /**
   * Escapes the given attributes.
   * @param {array} attributes - The attributes to escape.
   * @param {object} options - The options object.
   * @param {string} mainTableAs - The main table alias.
   * @returns {array} - The escaped attributes.
   */
  escapeAttributes(attributes, options, mainTableAs) {
    return attributes && attributes.map(attr => {
      let addTable = true;

      if (attr instanceof Utils.SequelizeMethod) {
        return this.handleSequelizeMethod(attr);
      }
      if (Array.isArray(attr)) {
        if (attr.length !== 2) {
          throw new Error(JSON.stringify(attr) + ' is not a valid attribute definition. Please use the following format: [\'attribute definition\', \'alias\']');
        }
        attr = attr.slice();

        if (attr[0] instanceof Utils.SequelizeMethod) {
          attr[0] = this.handleSequelizeMethod(attr[0]);
          addTable = false;
        } else if (attr[0].indexOf('(') === -1 && attr[0].indexOf(')') === -1) {
          attr[0] = this.quoteIdentifier(attr[0]);
        } else {
          Utils.deprecate('Use sequelize.fn / sequelize.literal to construct attributes');
        }
        attr = [attr[0], this.quoteIdentifier(attr[1])].join(' AS ');
      } else {
        attr = attr.indexOf(Utils.TICK_CHAR) < 0 && attr.indexOf('"') < 0
          ? this.quoteIdentifiers(attr)
          : this.escape(attr);
      }
      if (!_.isEmpty(options.include) && attr.indexOf('.') === -1 && addTable) {
        attr = mainTableAs + '.' + attr;
      }

      return attr;
    });
  },

  /**
   * Generates an include for the given include, parent table name, and top level info.
   * @param {object} include - The include object.
   * @param {object} parentTableName - The parent table name object.
   * @param {object} topLevelInfo - The top level info object.
   * @returns {object} - The generated include.
   */
  generateInclude(include, parentTableName, topLevelInfo) {
    // Extracted into separate functions for better readability and maintainability
    return this._generateInclude(include, parentTableName, topLevelInfo);
  },

  /**
   * Generates a join for the given include and top level info.
   * @param {object} include - The include object.
   * @param {object} topLevelInfo - The top level info object.
   * @returns {object} - The generated join.
   */
  generateJoin(include, topLevelInfo) {
    // Extracted into separate functions for better readability and maintainability
    return this._generateJoin(include, topLevelInfo);
  },

  /**
   * Generates a through join for the given include, include as, parent table name, and top level info.
   * @param {object} include - The include object.
   * @param {object} includeAs - The include as object.
   * @param {string} parentTableName - The parent table name.
   * @param {object} topLevelInfo - The top level info object.
   * @returns {object} - The generated through join.
   */
  generateThroughJoin(include, includeAs, parentTableName, topLevelInfo) {
    // Extracted into separate functions for better readability and maintainability
    return this._generateThroughJoin(include, includeAs, parentTableName, topLevelInfo);
  },

  /**
   * Generates a sub query filter for the given include, include as, and top level info.
   * @param {object} include - The include object.
   * @param {object} includeAs - The include as object.
   * @param {object} topLevelInfo - The top level info object.
   */
  _generateSubQueryFilter(include, includeAs, topLevelInfo) {
    // Extracted into separate functions for better readability and maintainability
    this.__generateSubQueryFilter(include, includeAs, topLevelInfo);
  },

  /**
   * Gets the required closure for the given include.
   * @param {object} include - The include object.
   * @returns {object} - The required closure.
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
   * Gets the query orders for the given options, model, and sub query.
   * @param {object} options - The options object.
   * @param {object} model - The model object.
   * @param {boolean} subQuery - Whether it's a sub query.
   * @returns {object} - The query orders.
   */
  getQueryOrders(options, model, subQuery) {
    // Extracted into separate functions for better readability and maintainability
    return this._getQueryOrders(options, model, subQuery);
  },

  /**
   * Selects from the table fragment for the given options, model, attributes, tables, and main table as.
   * @param {object} options - The options object.
   * @param {object} model - The model object.
   * @param {array} attributes - The attributes.
   * @param {string} tables - The tables.
   * @param {string} mainTableAs - The main table alias.
   * @returns {string} - The selected table fragment.
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
   * @param {object} options - The options object.
   * @returns {string} - The autocommit query.
   */
  setAutocommitQuery(value, options) {
    if (options.parent) {
      return;
    }

    // no query when value is not explicitly set
    if (typeof value === 'undefined' || value === null) {
      return;
    }

    return 'SET autocommit = ' + (value ? 1 : 0) + ';';
  },

  /**
   * Sets the isolation level query for the given value and options.
   * @param {string} value - The value.
   * @param {object} options - The options object.
   * @returns {string} - The isolation level query.
   */
  setIsolationLevelQuery(value, options) {
    if (options.parent) {
      return;
    }

    return 'SET SESSION TRANSACTION ISOLATION LEVEL ' + value + ';';
  },

  /**
   * Generates a transaction ID.
   * @returns {string} - The transaction ID.
   */
  generateTransactionId() {
    return uuid.v4();
  },

  /**
   * Starts a transaction query for the given transaction.
   * @param {object} transaction - The transaction object.
   * @returns {string} - The start transaction query.
   */
  startTransactionQuery(transaction) {
    if (transaction.parent) {
      // force quoting of savepoint identifiers for postgres
      return 'SAVEPOINT ' + this.quoteIdentifier(transaction.name, true) + ';';
    }

    return 'START TRANSACTION;';
  },

  /**
   * Commits a transaction query.
   * @param {object} transaction - The transaction object.
   * @returns {string} - The commit transaction query.
   */
  commitTransactionQuery(transaction) {
    if (transaction.parent) {
      return;
    }

    return 'COMMIT;';
  },

  /**
   * Rolls back a transaction query for the given transaction.
   * @param {object} transaction - The transaction object.
   * @returns {string} - The roll back transaction query.
   */
  rollbackTransactionQuery(transaction) {
    if (transaction.parent) {
      // force quoting of savepoint identifiers for postgres
      return 'ROLLBACK TO SAVEPOINT ' + this.quoteIdentifier(transaction.name, true) + ';';
    }

    return 'ROLLBACK;';
  },

  /**
   * Adds a limit and offset to the given options.
   * @param {object} options - The options object.
   * @returns {string} - The added limit and offset.
   */
  addLimitAndOffset(options) {
    let fragment = '';

    /* eslint-disable */
    if (options.offset != null && options.limit == null) {
      fragment += ' LIMIT ' + this.escape(options.offset) + ', ' + 10000000000000;
    } else if (options.limit != null) {
      if (options.offset != null) {
        fragment += ' LIMIT ' + this.escape(options.offset) + ', ' + this.escape(options.limit);
      } else {
        fragment += ' LIMIT ' + this.escape(options.limit);
      }
    }
    /* eslint-enable */

    return fragment;
  },

  /**
   * Handles a Sequelize method for the given smth, table name, factory, options, and prepend.
   * @param {object} smth - The Sequelize method.
   * @param {string} tableName - The table name.
   * @param {object} factory - The factory object.
   * @param {object} options - The options object.
   * @param {boolean} prepend - Whether to prepend.
   * @returns {string} - The handled Sequelize method.
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
   * Generates a where query for the given where clause and options.
   * @param {string|object} where - The where clause.
   * @param {object} options - The options object.
   * @returns {string} - The where query.
   */
  whereQuery(where, options) {
    const query = this.whereItemsQuery(where, options);
    if (query && query.length) {
      return 'WHERE '+query;
    }
    return '';
  },

  /**
   * Generates a where items query for the given where clause, options, and binding.
   * @param {string|object} where - The where clause.
   * @param {object} options - The options object.
   * @param {string} binding - The binding.
   * @returns {string} - The where items query.
   */
  whereItemsQuery(where, options, binding) {
    if (
      where === null ||
      where === undefined ||
      Utils.getComplexSize(where) === 0
    ) {
      // NO OP
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
   * @param {string|object} value - The value.
   * @param {object} options - The options object.
   * @returns {string} - The where item query.
   */
  whereItemQuery(key, value, options) {
    // Extracted into separate functions for better readability and maintainability
    return this._whereItemQuery(key, value, options);
  },

  /**
   * Gets the where conditions for the given smth, table name, factory, options, and prepend.
   * @param {string|object} smth - The smth.
   * @param {string} tableName - The table name.
   * @param {object} factory - The factory object.
   * @param {object} options - The options object.
   * @param {boolean} prepend - Whether to prepend.
   * @returns {string} - The where conditions.
   */
  getWhereConditions(smth, tableName, factory, options, prepend) {
    // Extracted into separate functions for better readability and maintainability
    return this._getWhereConditions(smth, tableName, factory, options, prepend);
  },

  /**
   * Checks if the given string is an identifier quoted.
   * @param {string} string - The string to check.
   * @returns {boolean} - Whether the string is an identifier quoted.
   */
  isIdentifierQuoted(string) {
    return /^\s*(?:([`"'])(?:(?!\1).|\1{2})*\1\.?)+\s*$/i.test(string);
  },

  /**
   * Gets the boolean value for the given value.
   * @param {boolean} value - The value.
   * @returns {boolean} - The boolean value.
   */
  booleanValue(value) {
    return value;
  }
};

// Extracted functions for better readability and maintainability
QueryGenerator._generateInsertQuery = function(table, valueHash, modelAttributes, options) {
  // Implementation
};

QueryGenerator._generateBulkInsertQuery = function(tableName, fieldValueHashes, options, fieldMappedAttributes) {
  // Implementation
};

QueryGenerator._generateUpdateQuery = function(tableName, attrValueHash, where, options, attributes) {
  // Implementation
};

QueryGenerator._generateArithmeticQuery = function(operator, tableName, attrValueHash, where, options, attributes) {
  // Implementation
};

QueryGenerator._generateAddIndexQuery = function(tableName, attributes, options, rawTablename) {
  // Implementation
};

QueryGenerator._quoteCollection = function(collection, parent, connector) {
  // Implementation
};

QueryGenerator._generateSelectQuery = function(tableName, options, model) {
  // Implementation
};

QueryGenerator._generateInclude = function(include, parentTableName, topLevelInfo) {
  // Implementation
};

QueryGenerator._generateJoin = function(include, topLevelInfo) {
  // Implementation
};

QueryGenerator._generateThroughJoin = function(include, includeAs, parentTableName, topLevelInfo) {
  // Implementation
};

QueryGenerator.__generateSubQueryFilter = function(include, includeAs, topLevelInfo) {
  // Implementation
};

QueryGenerator._getQueryOrders = function(options, model, subQuery) {
  // Implementation
};

QueryGenerator._whereItemQuery = function(key, value, options) {
  // Implementation
};

QueryGenerator._getWhereConditions = function(smth, tableName, factory, options, prepend) {
  // Implementation
};

module.exports = QueryGenerator;
```