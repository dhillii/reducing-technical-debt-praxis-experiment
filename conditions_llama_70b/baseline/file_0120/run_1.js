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

  extractTableDetails(tableName, options) {
    options = options || {};
    tableName = tableName || {};
    return {
      schema: tableName.schema || options.schema || 'public',
      tableName: _.isPlainObject(tableName) ? tableName.tableName : tableName,
      delimiter: tableName.delimiter || options.delimiter || '.'
    };
  },

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

  dropSchema(tableName, options) {
    return this.dropTableQuery(tableName, options);
  },

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

  dropTableQuery(tableName) {
    return `DROP TABLE IF EXISTS ${this.quoteTable(tableName)};`;
  },

  renameTableQuery(before, after) {
    return `ALTER TABLE ${this.quoteTable(before)} RENAME TO ${this.quoteTable(after)};`;
  },

  insertQuery(table, valueHash, modelAttributes, options) {
    const queryGenerator = new InsertQueryGenerator(this, table, valueHash, modelAttributes, options);
    return queryGenerator.generateQuery();
  },

  bulkInsertQuery(tableName, fieldValueHashes, options, fieldMappedAttributes) {
    const queryGenerator = new BulkInsertQueryGenerator(this, tableName, fieldValueHashes, options, fieldMappedAttributes);
    return queryGenerator.generateQuery();
  },

  updateQuery(tableName, attrValueHash, where, options, attributes) {
    const queryGenerator = new UpdateQueryGenerator(this, tableName, attrValueHash, where, options, attributes);
    return queryGenerator.generateQuery();
  },

  arithmeticQuery(operator, tableName, attrValueHash, where, options, attributes) {
    const queryGenerator = new ArithmeticQueryGenerator(this, operator, tableName, attrValueHash, where, options, attributes);
    return queryGenerator.generateQuery();
  },

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

  addIndexQuery(tableName, attributes, options, rawTablename) {
    const queryGenerator = new AddIndexQueryGenerator(this, tableName, attributes, options, rawTablename);
    return queryGenerator.generateQuery();
  },

  addConstraintQuery(tableName, options) {
    const queryGenerator = new AddConstraintQueryGenerator(this, tableName, options);
    return queryGenerator.generateQuery();
  },

  getConstraintSnippet(tableName, options) {
    const queryGenerator = new GetConstraintSnippetGenerator(this, tableName, options);
    return queryGenerator.generateQuery();
  },

  removeConstraintQuery(tableName, constraintName) {
    return `ALTER TABLE ${this.quoteIdentifiers(tableName)} DROP CONSTRAINT ${this.quoteIdentifiers(constraintName)}`;
  },

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

  quote(collection, parent, connector) {
    const queryGenerator = new QuoteGenerator(this, collection, parent, connector);
    return queryGenerator.generateQuery();
  },

  quoteIdentifiers(identifiers) {
    if (identifiers.indexOf('.') !== -1) {
      identifiers = identifiers.split('.');
      return this.quoteIdentifier(identifiers.slice(0, identifiers.length - 1).join('.')) + '.' + this.quoteIdentifier(identifiers[identifiers.length - 1]);
    } else {
      return this.quoteIdentifier(identifiers);
    }
  },

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

  selectQuery(tableName, options, model) {
    const queryGenerator = new SelectQueryGenerator(this, tableName, options, model);
    return queryGenerator.generateQuery();
  },

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

  generateInclude(include, parentTableName, topLevelInfo) {
    const queryGenerator = new GenerateIncludeGenerator(this, include, parentTableName, topLevelInfo);
    return queryGenerator.generateQuery();
  },

  generateJoin(include, topLevelInfo) {
    const queryGenerator = new GenerateJoinGenerator(this, include, topLevelInfo);
    return queryGenerator.generateQuery();
  },

  generateThroughJoin(include, includeAs, parentTableName, topLevelInfo) {
    const queryGenerator = new GenerateThroughJoinGenerator(this, include, includeAs, parentTableName, topLevelInfo);
    return queryGenerator.generateQuery();
  },

  _generateSubQueryFilter(include, includeAs, topLevelInfo) {
    const queryGenerator = new GenerateSubQueryFilterGenerator(this, include, includeAs, topLevelInfo);
    return queryGenerator.generateQuery();
  },

  _getRequiredClosure(include) {
    const queryGenerator = new GetRequiredClosureGenerator(this, include);
    return queryGenerator.generateQuery();
  },

  getQueryOrders(options, model, subQuery) {
    const queryGenerator = new GetQueryOrdersGenerator(this, options, model, subQuery);
    return queryGenerator.generateQuery();
  },

  selectFromTableFragment(options, model, attributes, tables, mainTableAs) {
    const queryGenerator = new SelectFromTableFragmentGenerator(this, options, model, attributes, tables, mainTableAs);
    return queryGenerator.generateQuery();
  },

  setAutocommitQuery(value, options) {
    const queryGenerator = new SetAutocommitQueryGenerator(this, value, options);
    return queryGenerator.generateQuery();
  },

  setIsolationLevelQuery(value, options) {
    const queryGenerator = new SetIsolationLevelQueryGenerator(this, value, options);
    return queryGenerator.generateQuery();
  },

  generateTransactionId() {
    return uuid.v4();
  },

  startTransactionQuery(transaction) {
    const queryGenerator = new StartTransactionQueryGenerator(this, transaction);
    return queryGenerator.generateQuery();
  },

  deferConstraintsQuery() {},

  setConstraintQuery() {},
  setDeferredQuery() {},
  setImmediateQuery() {},

  commitTransactionQuery(transaction) {
    const queryGenerator = new CommitTransactionQueryGenerator(this, transaction);
    return queryGenerator.generateQuery();
  },

  rollbackTransactionQuery(transaction) {
    const queryGenerator = new RollbackTransactionQueryGenerator(this, transaction);
    return queryGenerator.generateQuery();
  },

  addLimitAndOffset(options) {
    const queryGenerator = new AddLimitAndOffsetGenerator(this, options);
    return queryGenerator.generateQuery();
  },

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

  whereQuery(where, options) {
    const queryGenerator = new WhereQueryGenerator(this, where, options);
    return queryGenerator.generateQuery();
  },

  whereItemsQuery(where, options, binding) {
    const queryGenerator = new WhereItemsQueryGenerator(this, where, options, binding);
    return queryGenerator.generateQuery();
  },

  whereItemQuery(key, value, options) {
    const queryGenerator = new WhereItemQueryGenerator(this, key, value, options);
    return queryGenerator.generateQuery();
  },

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

  _replaceAliases(orig) {
    const obj = {};
    if (!this.OperatorsAliasMap) {
      return orig;
    }

    Utils.getComplexKeys(orig).forEach(prop => {
      const item = orig[prop];
      if (_.isPlainObject(item)) {
        obj[prop] = this._replaceAliases(item);
      } else {
        obj[prop] = item;
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

  _whereGroupBind(key, value, options) {
    const binding = key === Op.or ? this.OperatorMap[Op.or] : this.OperatorMap[Op.and];
    const outerBinding = key === Op.not ? 'NOT ': '';

    if (Array.isArray(value)) {
      value = value.map(item => {
        let itemQuery = this.whereItemsQuery(item, options, this.OperatorMap[Op.and]);
        if (itemQuery && itemQuery.length && (Array.isArray(item) || _.isPlainObject(item)) && Utils.getComplexSize(item) > 1) {
          itemQuery = '('+itemQuery+')';
        }
        return itemQuery;
      }).filter(item => item && item.length);

      value = value.length && value.join(binding);
    } else {
      value = this.whereItemsQuery(value, options, binding);
    }
    if ((key === Op.or || key === Op.not) && !value) {
      return '0 = 1';
    }

    return value ? outerBinding + '('+value+')' : undefined;
  },

  _whereBind(binding, key, value, options) {
    if (_.isPlainObject(value)) {
      value = Utils.getComplexKeys(value).map(prop => {
        const item = value[prop];
        return this.whereItemQuery(key, {[prop]: item}, options);
      });
    } else {
      value = value.map(item => this.whereItemQuery(key, item, options));
    }

    value = value.filter(item => item && item.length);

    return value.length ? '('+value.join(binding)+')' : undefined;
  },

  _whereJSON(key, value, options) {
    const items = [];
    let baseKey = this.quoteIdentifier(key);
    if (options.prefix) {
      if (options.prefix instanceof Utils.Literal) {
        baseKey = `${this.handleSequelizeMethod(options.prefix)}.${baseKey}`;
      } else {
        baseKey = `${this.quoteTable(options.prefix)}.${baseKey}`;
      }
    }

    Utils.getOperators(value).forEach(op => {
      const where = {};
      where[op] = value[op];
      items.push(this.whereItemQuery(key, where, _.assign({}, options, {json: false})));
    });

    _.forOwn(value, (item, prop) => {
      this._traverseJSON(items, baseKey, prop, item, [prop]);
    });

    const result = items.join(this.OperatorMap[Op.and]);
    return items.length > 1 ? '('+result+')' : result;
  },

  _traverseJSON(items, baseKey, prop, item, path) {
    let cast;

    if (path[path.length - 1].indexOf('::') > -1) {
      const tmp = path[path.length - 1].split('::');
      cast = tmp[1];
      path[path.length - 1] = tmp[0];
    }

    const pathKey = this.jsonPathExtractionQuery(baseKey, path);

    if (_.isPlainObject(item)) {
      Utils.getOperators(item).forEach(op => {
        const value = this._toJSONValue(item[op]);
        items.push(this.whereItemQuery(this._castKey(pathKey, value, cast), {[op]: value}));
      });
      _.forOwn(item, (value, itemProp) => {
        this._traverseJSON(items, baseKey, itemProp, value, path.concat([itemProp]));
      });

      return;
    }

    item = this._toJSONValue(item);
    items.push(this.whereItemQuery(this._castKey(pathKey, item, cast), {[Op.eq]: item}));
  },

  _toJSONValue(value) {
    return value;
  },

  _castKey(key, value, cast, json) {
    cast = cast || this._getJsonCast(Array.isArray(value) ? value[0] : value);
    if (cast) {
      return new Utils.Literal(this.handleSequelizeMethod(new Utils.Cast(new Utils.Literal(key), cast, json)));
    }

    return new Utils.Literal(key);
  },

  _getJsonCast(value) {
    if (typeof value === 'number') {
      return 'double precision';
    }
    if (value instanceof Date) {
      return 'timestamptz';
    }
    if (typeof value === 'boolean') {
      return 'boolean';
    }
    return;
  },

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

  _prefixKey(key, prefix) {
    if (prefix) {
      if (prefix instanceof Utils.Literal) {
        return [this.handleSequelizeMethod(prefix), key].join('.');
      }

      return [this.quoteTable(prefix), key].join('.');
    }

    return key;
  },

  _whereParseSingleValueObject(key, field, prop, value, options) {
    if (prop === Op.not) {
      if (Array.isArray(value)) {
        prop = Op.notIn;
      } else if ([null, true, false].indexOf(value) < 0) {
        prop = Op.ne;
      }
    }

    let comparator = this.OperatorMap[prop] || this.OperatorMap[Op.eq];

    switch (prop) {
      case Op.in:
      case Op.notIn:
        if (value instanceof Utils.Literal) {
          return this._joinKeyValue(key, value.val, comparator, options.prefix);
        }

        if (value.length) {
          return this._joinKeyValue(key, `(${value.map(item => this.escape(item, field)).join(', ')})`, comparator, options.prefix);
        }

        if (comparator === this.OperatorMap[Op.in]) {
          return this._joinKeyValue(key, '(NULL)', comparator, options.prefix);
        }

        return '';
      case Op.any:
      case Op.all:
        comparator = `${this.OperatorMap[Op.eq]} ${comparator}`;
        if (value[Op.values]) {
          return this._joinKeyValue(key, `(VALUES ${value[Op.values].map(item => `(${this.escape(item)})`).join(', ')})`, comparator, options.prefix);
        }

        return this._joinKeyValue(key, `(${this.escape(value, field)})`, comparator, options.prefix);
      case Op.between:
      case Op.notBetween:
        return this._joinKeyValue(key, `${this.escape(value[0])} AND ${this.escape(value[1])}`, comparator, options.prefix);
      case Op.raw:
        throw new Error('The `$raw` where property is no longer supported.  Use `sequelize.literal` instead.');
      case Op.col:
        comparator = this.OperatorMap[Op.eq];
        value = value.split('.');

        if (value.length > 2) {
          value = [
            value.slice(0, -1).join('->'),
            value[value.length - 1]
          ];
        }

        return this._joinKeyValue(key, value.map(identifier => this.quoteIdentifier(identifier)).join('.'), comparator, options.prefix);
    }

    const escapeOptions = {
      acceptStrings: comparator.indexOf(this.OperatorMap[Op.like]) !== -1
    };

    if (_.isPlainObject(value)) {
      if (value[Op.col]) {
        return this._joinKeyValue(key, this.whereItemQuery(null, value), comparator, options.prefix);
      }
      if (value[Op.any]) {
        escapeOptions.isList = true;
        return this._joinKeyValue(key, `(${this.escape(value[Op.any], field, escapeOptions)})`, `${comparator} ${this.OperatorMap[Op.any]}`, options.prefix);
      }
      if (value[Op.all]) {
        escapeOptions.isList = true;
        return this._joinKeyValue(key, `(${this.escape(value[Op.all], field, escapeOptions)})`, `${comparator} ${this.OperatorMap[Op.all]}`, options.prefix);
      }
    }

    if (key === Op.placeholder) {
      return this._joinKeyValue(this.OperatorMap[key], this.escape(value, field), this.OperatorMap[Op.eq], options.prefix);
    }

    return this._joinKeyValue(key, this.escape(value, field, escapeOptions), this.OperatorMap[Op.eq], options.prefix);
  },

  getWhereConditions(smth, tableName, factory, options, prepend) {
    let result = null;
    const where = {};

    if (Array.isArray(tableName)) {
      tableName = tableName[0];
      if (Array.isArray(tableName)) {
        tableName = tableName[1];
      }
    }

    options = options || {};

    if (typeof prepend === 'undefined') {
      prepend = true;
    }

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

  isIdentifierQuoted(string) {
    return /^\s*(?:([`"'])(?:(?!\1).|\1{2})*\1\.?)+\s*$/i.test(string);
  },

  booleanValue(value) {
    return value;
  }
};

class InsertQueryGenerator {
  constructor(queryGenerator, table, valueHash, modelAttributes, options) {
    this.queryGenerator = queryGenerator;
    this.table = table;
    this.valueHash = valueHash;
    this.modelAttributes = modelAttributes;
    this.options = options;
  }

  generateQuery() {
    const modelAttributeMap = {};
    const fields = [];
    const values = [];
    let query;
    let valueQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>)<%= output %> VALUES (<%= values %>)<%= onConflictDoNothing %>';
    let emptyQuery = '<%= tmpTable %>INSERT<%= ignoreDuplicates %> INTO <%= table %><%= output %><%= onConflictDoNothing %>';
    let outputFragment;
    let identityWrapperRequired = false;
    let tmpTable = '';

    if (this.modelAttributes) {
      _.each(this.modelAttributes, (attribute, key) => {
        modelAttributeMap[key] = attribute;
        if (attribute.field) {
          modelAttributeMap[attribute.field] = attribute;
        }
      });
    }

    if (this.queryGenerator._dialect.supports['DEFAULT VALUES']) {
      emptyQuery += ' DEFAULT VALUES';
    } else if (this.queryGenerator._dialect.supports['VALUES ()']) {
      emptyQuery += ' VALUES ()';
    }

    if (this.queryGenerator._dialect.supports.returnValues && this.options.returning) {
      if (this.queryGenerator._dialect.supports.returnValues.returning) {
        valueQuery += ' RETURNING *';
        emptyQuery += ' RETURNING *';
      } else if (this.queryGenerator._dialect.supports.returnValues.output) {
        outputFragment = ' OUTPUT INSERTED.*';

        if (this.modelAttributes && this.options.hasTrigger && this.queryGenerator._dialect.supports.tmpTableTrigger) {
          let tmpColumns = '';
          let outputColumns = '';
          tmpTable = 'declare @tmp table (<%= columns %>); ';

          for (const modelKey in this.modelAttributes) {
            const attribute = this.modelAttributes[modelKey];
            if (!(attribute.type instanceof DataTypes.VIRTUAL)) {
              if (tmpColumns.length > 0) {
                tmpColumns += ',';
                outputColumns += ',';
              }

              tmpColumns += this.queryGenerator.quoteIdentifier(attribute.field) + ' ' + attribute.type.toSql();
              outputColumns += 'INSERTED.' + this.queryGenerator.quoteIdentifier(attribute.field);
            }
          }

          const replacement = {
            columns: tmpColumns
          };

          tmpTable = _.template(tmpTable, this.queryGenerator._templateSettings)(replacement).trim();
          outputFragment = ' OUTPUT ' + outputColumns + ' into @tmp';
          const selectFromTmp = ';select * from @tmp';

          valueQuery += selectFromTmp;
          emptyQuery += selectFromTmp;
        }
      }
    }

    if (this.queryGenerator._dialect.supports.EXCEPTION && this.options.exception) {
      if (semver.gte(this.queryGenerator.sequelize.options.databaseVersion, '9.2.0')) {
        const delimiter = '$func_' + uuid.v4().replace(/-/g, '') + '$';

        this.options.exception = 'WHEN unique_violation THEN GET STACKED DIAGNOSTICS sequelize_caught_exception = PG_EXCEPTION_DETAIL;';
        valueQuery = 'CREATE OR REPLACE FUNCTION pg_temp.testfunc(OUT response <%= table %>, OUT sequelize_caught_exception text) RETURNS RECORD AS ' + delimiter +
          ' BEGIN ' + valueQuery + ' INTO response; EXCEPTION ' + this.options.exception + ' END ' + delimiter +
          ' LANGUAGE plpgsql; SELECT (testfunc.response).*, testfunc.sequelize_caught_exception FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc()';
      } else {
        this.options.exception = 'WHEN unique_violation THEN NULL;';
        valueQuery = 'CREATE OR REPLACE FUNCTION pg_temp.testfunc() RETURNS SETOF <%= table %> AS $body$ BEGIN RETURN QUERY ' + valueQuery + '; EXCEPTION ' + this.options.exception + ' END; $body$ LANGUAGE plpgsql; SELECT * FROM pg_temp.testfunc(); DROP FUNCTION IF EXISTS pg_temp.testfunc();';
      }
    }

    if (this.queryGenerator._dialect.supports['ON DUPLICATE KEY'] && this.options.onDuplicate) {
      valueQuery += ' ON DUPLICATE KEY ' + this.options.onDuplicate;
      emptyQuery += ' ON DUPLICATE KEY ' + this.options.onDuplicate;
    }

    this.valueHash = Utils.removeNullValuesFromHash(this.valueHash, this.options.omitNull);
    for (const key in this.valueHash) {
      if (this.valueHash.hasOwnProperty(key)) {
        const value = this.valueHash[key];
        fields.push(this.queryGenerator.quoteIdentifier(key));

        if (modelAttributeMap && modelAttributeMap[key] && modelAttributeMap[key].autoIncrement === true && !value) {
          if (!this.queryGenerator._dialect.supports.autoIncrement.defaultValue) {
            fields.splice(-1, 1);
          } else if (this.queryGenerator._dialect.supports.DEFAULT) {
            values.push('DEFAULT');
          } else {
            values.push(this.queryGenerator.escape(null));
          }
        } else {
          if (modelAttributeMap && modelAttributeMap[key] && modelAttributeMap[key].autoIncrement === true) {
            identityWrapperRequired = true;
          }

          values.push(this.queryGenerator.escape(value, modelAttributeMap && modelAttributeMap[key] || undefined, { context: 'INSERT' }));
        }
      }
    }

    const replacements = {
      ignoreDuplicates: this.options.ignoreDuplicates ? this.queryGenerator._dialect.supports.IGNORE : '',
      onConflictDoNothing: this.options.ignoreDuplicates ? this.queryGenerator._dialect.supports.onConflictDoNothing : '',
      table: this.queryGenerator.quoteTable(this.table),
      attributes: fields.join(','),
      output: outputFragment,
      values: values.join(','),
      tmpTable
    };

    query = (replacements.attributes.length ? valueQuery : emptyQuery) + ';';
    if (identityWrapperRequired && this.queryGenerator._dialect.supports.autoIncrement.identityInsert) {
      query = [
        'SET IDENTITY_INSERT', this.queryGenerator.quoteTable(this.table), 'ON;',
        query,
        'SET IDENTITY_INSERT', this.queryGenerator.quoteTable(this.table), 'OFF;'
      ].join(' ');
    }

    return _.template(query, this.queryGenerator._templateSettings)(replacements);
  }
}

class BulkInsertQueryGenerator {
  constructor(queryGenerator, tableName, fieldValueHashes, options, fieldMappedAttributes) {
    this.queryGenerator = queryGenerator;
    this.tableName = tableName;
    this.fieldValueHashes = fieldValueHashes;
    this.options = options;
    this.fieldMappedAttributes = fieldMappedAttributes;
  }

  generateQuery() {
    const query = 'INSERT<%= ignoreDuplicates %> INTO <%= table %> (<%= attributes %>) VALUES <%= tuples %><%= onDuplicateKeyUpdate %><%= onConflictDoNothing %><%= returning %>;';
    const tuples = [];
    const serials = {};
    const allAttributes = [];
    let onDuplicateKeyUpdate = '';

    for (const fieldValueHash of this.fieldValueHashes) {
      _.forOwn(fieldValueHash, (value, key) => {
        if (allAttributes.indexOf(key) === -1) {
          allAttributes.push(key);
        }
        if (
          this.fieldMappedAttributes[key]
          && this.fieldMappedAttributes[key].autoIncrement === true
        ) {
          serials[key] = true;
        }
      });
    }

    for (const fieldValueHash of this.fieldValueHashes) {
      const values = allAttributes.map(key => {
        if (
          this.queryGenerator._dialect.supports.bulkDefault
          && serials[key] === true
        ) {
          return fieldValueHash[key] || 'DEFAULT';
        }

        return this.queryGenerator.escape(fieldValueHash[key], this.fieldMappedAttributes[key], { context: 'INSERT' });
      });

      tuples.push(`(${values.join(',')})`);
    }

    if (this.queryGenerator._dialect.supports.updateOnDuplicate && this.options.updateOnDuplicate) {
      onDuplicateKeyUpdate = ' ON DUPLICATE KEY UPDATE ' + this.options.updateOnDuplicate.map(attr => {
        const key = this.queryGenerator.quoteIdentifier(attr);
        return key + '=VALUES(' + key + ')';
      }).join(',');
    }

    const replacements = {
      ignoreDuplicates: this.options.ignoreDuplicates ? this.queryGenerator._dialect.supports.ignoreDuplicates : '',
      table: this.queryGenerator.quoteTable(this.tableName),
      attributes: allAttributes.map(attr => this.queryGenerator.quoteIdentifier(attr)).join(','),
      tuples: tuples.join(','),
      onDuplicateKeyUpdate,
      returning: this.queryGenerator._dialect.supports.returnValues && this.options.returning ? ' RETURNING *' : '',
      onConflictDoNothing: this.options.ignoreDuplicates ? this.queryGenerator._dialect.supports.onConflictDoNothing : ''
    };

    return _.template(query, this.queryGenerator._templateSettings)(replacements);
  }
}

class UpdateQueryGenerator {
  constructor(queryGenerator, tableName, attrValueHash, where, options, attributes) {
    this.queryGenerator = queryGenerator;
    this.tableName = tableName;
    this.attrValueHash = attrValueHash;
    this.where = where;
    this.options = options;
    this.attributes = attributes;
  }

  generateQuery() {
    this.attrValueHash = Utils.removeNullValuesFromHash(this.attrValueHash, this.options.omitNull, this.options);

    const values = [];
    const modelAttributeMap = {};
    let query = '<%= tmpTable %>UPDATE <%= table %> SET <%= values %><%= output %> <%= where %>';
    let outputFragment;
    let tmpTable = '';

    if (this.queryGenerator._dialect.supports['LIMIT ON UPDATE'] && this.options.limit) {
      if (this.queryGenerator.dialect !== 'mssql') {
        query += ' LIMIT ' + this.queryGenerator.escape(this.options.limit) + ' ';
      }
    }

    if (this.queryGenerator._dialect.supports.returnValues) {
      if (this.queryGenerator._dialect.supports.returnValues.output) {
        outputFragment = ' OUTPUT INSERTED.*';

        if (this.attributes && this.options.hasTrigger && this.queryGenerator._dialect.supports.tmpTableTrigger) {
          tmpTable = 'declare @tmp table (<%= columns %>); ';
          let tmpColumns = '';
          let outputColumns = '';

          for (const modelKey in this.attributes) {
            const attribute = this.attributes[modelKey];
            if (!(attribute.type instanceof DataTypes.VIRTUAL)) {
              if (tmpColumns.length > 0) {
                tmpColumns += ',';
                outputColumns += ',';
              }

              tmpColumns += this.queryGenerator.quoteIdentifier(attribute.field) + ' ' + attribute.type.toSql();
              outputColumns += 'INSERTED.' + this.queryGenerator.quoteIdentifier(attribute.field);
            }
          }

          const replacement = {
            columns: tmpColumns
          };

          tmpTable = _.template(tmpTable, this.queryGenerator._templateSettings)(replacement).trim();
          outputFragment = ' OUTPUT ' + outputColumns + ' into @tmp';
          const selectFromTmp = ';select * from @tmp';

          query += selectFromTmp;
        }
      } else if (this.queryGenerator._dialect.supports.returnValues && this.options.returning) {
        outputFragment = ' RETURNING *';
      }
    }

    if (this.attributes) {
      _.each(this.attributes, (attribute, key) => {
        modelAttributeMap[key] = attribute;
        if (attribute.field) {
          modelAttributeMap[attribute.field] = attribute;
        }
      });
    }

    for (const key in this.attrValueHash) {
      if (modelAttributeMap && modelAttributeMap[key] &&
          modelAttributeMap[key].autoIncrement === true &&
          !this.queryGenerator._dialect.supports.autoIncrement.update) {
        continue;
      }

      const value = this.attrValueHash[key];
      values.push(this.queryGenerator.quoteIdentifier(key) + '=' + this.queryGenerator.escape(value, modelAttributeMap && modelAttributeMap[key] || undefined, { context: 'UPDATE' }));
    }

    const replacements = {
      table: this.queryGenerator.quoteTable(this.tableName),
      values: values.join(','),
      output: outputFragment,
      where: this.queryGenerator.whereQuery(this.where, this.options),
      tmpTable
    };

    if (values.length === 0) {
      return '';
    }

    return _.template(query, this.queryGenerator._templateSettings)(replacements).trim();
  }
}

class ArithmeticQueryGenerator {
  constructor(queryGenerator, operator, tableName, attrValueHash, where, options, attributes) {
    this.queryGenerator = queryGenerator;
    this.operator = operator;
    this.tableName = tableName;
    this.attrValueHash = attrValueHash;
    this.where = where;
    this.options = options;
    this.attributes = attributes;
  }

  generateQuery() {
    this.attrValueHash = Utils.removeNullValuesFromHash(this.attrValueHash, this.queryGenerator.options.omitNull);

    const values = [];
    let query = 'UPDATE <%= table %> SET <%= values %><%= output %> <%= where %>';
    let outputFragment;

    if (this.queryGenerator._dialect.supports.returnValues && this.options.returning) {
      if (this.queryGenerator._dialect.supports.returnValues.returning) {
        outputFragment = ' RETURNING *';
      } else if (this.queryGenerator._dialect.supports.returnValues.output) {
        outputFragment = ' OUTPUT INSERTED.*';
      }
    }

    for (const key in this.attrValueHash) {
      const value = this.attrValueHash[key];
      values.push(this.queryGenerator.quoteIdentifier(key) + '=' + this.queryGenerator.quoteIdentifier(key) + this.operator + ' ' + this.queryGenerator.escape(value));
    }

    this.attributes = this.attributes || {};
    for (const key in this.attributes) {
      const value = this.attributes[key];
      values.push(this.queryGenerator.quoteIdentifier(key) + '=' + this.queryGenerator.escape(value));
    }

    const replacements = {
      table: this.queryGenerator.quoteTable(this.tableName),
      values: values.join(','),
      output: outputFragment,
      where: this.queryGenerator.whereQuery(this.where)
    };

    return _.template(query, this.queryGenerator._templateSettings)(replacements);
  }
}

class AddIndexQueryGenerator {
  constructor(queryGenerator, tableName, attributes, options, rawTablename) {
    this.queryGenerator = queryGenerator;
    this.tableName = tableName;
    this.attributes = attributes;
    this.options = options;
    this.rawTablename = rawTablename;
  }

  generateQuery() {
    if (!Array.isArray(this.attributes)) {
      this.options = this.attributes;
      this.attributes = undefined;
    } else {
      this.options.fields = this.attributes;
    }

    if (this.options.indexName) {
      this.options.name = this.options.indexName;
    }
    if (this.options.indicesType) {
      this.options.type = this.options.indicesType;
    }
    if (this.options.indexType || this.options.method) {
      this.options.using = this.options.indexType || this.options.method;
    }

    this.options.prefix = this.options.prefix || this.rawTablename || this.tableName;
    if (this.options.prefix && _.isString(this.options.prefix)) {
      this.options.prefix = this.options.prefix.replace(/\./g, '_');
      this.options.prefix = this.options.prefix.replace(/(\"|\')/g, '');
    }

    const fieldsSql = this.options.fields.map(field => {
      if (typeof field === 'string') {
        return this.queryGenerator.quoteIdentifier(field);
      } else if (field instanceof Utils.SequelizeMethod) {
        return this.queryGenerator.handleSequelizeMethod(field);
      } else {
        let result = '';

        if (field.attribute) {
          field.name = field.attribute;
        }

        if (!field.name) {
          throw new Error('The following index field has no name: ' + util.inspect(field));
        }

        result += this.queryGenerator.quoteIdentifier(field.name);

        if (this.queryGenerator._dialect.supports.index.collate && field.collate) {
          result += ' COLLATE ' + this.queryGenerator.quoteIdentifier(field.collate);
        }

        if (this.queryGenerator._dialect.supports.index.length && field.length) {
          result += '(' + field.length + ')';
        }

        if (field.order) {
          result += ' ' + field.order;
        }

        return result;
      }
    });

    if (!this.options.name) {
      this.options = this.queryGenerator.nameIndexes([this.options], this.options.prefix)[0];
    }

    this.options = Model._conformIndex(this.options);

    if (!this.queryGenerator._dialect.supports.index.type) {
      delete this.options.type;
    }

    if (this.options.where) {
      this.options.where = this.queryGenerator.whereQuery(this.options.where);
    }

    if (_.isString(this.tableName)) {
      this.tableName = this.queryGenerator.quoteIdentifiers(this.tableName);
    } else {
      this.tableName = this.queryGenerator.quoteTable(this.tableName);
    }

    const concurrently = this.queryGenerator._dialect.supports.index.concurrently && this.options.concurrently ? 'CONCURRENTLY' : undefined;
    let ind;
    if (this.queryGenerator._dialect.supports.indexViaAlter) {
      ind = [
        'ALTER TABLE',
        this.tableName,
        concurrently,
        'ADD'
      ];
    } else {
      ind = ['CREATE'];
    }

    ind = ind.concat(
      this.options.unique ? 'UNIQUE' : '',
      this.options.type, 'INDEX',
      !this.queryGenerator._dialect.supports.indexViaAlter ? concurrently : undefined,
      this.queryGenerator.quoteIdentifiers(this.options.name),
      this.queryGenerator._dialect.supports.index.using === 1 && this.options.using ? 'USING ' + this.options.using : '',
      !this.queryGenerator._dialect.supports.indexViaAlter ? 'ON ' + this.tableName : undefined,
      this.queryGenerator._dialect.supports.index.using === 2 && this.options.using ? 'USING ' + this.options.using : '',
      '(' + fieldsSql.join(', ') + (this.options.operator ? ' '+this.options.operator : '') + ')',
      this.queryGenerator._dialect.supports.index.parser && this.options.parser ? 'WITH PARSER ' + this.options.parser : undefined,
      this.queryGenerator._dialect.supports.index.where && this.options.where ? this.options.where : undefined
    );

    return _.compact(ind).join(' ');
  }
}

class AddConstraintQueryGenerator {
  constructor(queryGenerator, tableName, options) {
    this.queryGenerator = queryGenerator;
    this.tableName = tableName;
    this.options = options;
  }

  generateQuery() {
    const constraintSnippet = this.queryGenerator.getConstraintSnippet(this.tableName, this.options);

    if (typeof this.tableName === 'string') {
      this.tableName = this.queryGenerator.quoteIdentifiers(this.tableName);
    } else {
      this.tableName = this.queryGenerator.quoteTable(this.tableName);
    }

    return `ALTER TABLE ${this.tableName} ADD ${constraintSnippet};`;
  }
}

class GetConstraintSnippetGenerator {
  constructor(queryGenerator, tableName, options) {
    this.queryGenerator = queryGenerator;
    this.tableName = tableName;
    this.options = options;
  }

  generateQuery() {
    let constraintSnippet, constraintName;

    const fieldsSql = this.options.fields.map(field => {
      if (typeof field === 'string') {
        return this.queryGenerator.quoteIdentifier(field);
      } else if (field._isSequelizeMethod) {
        return this.queryGenerator.handleSequelizeMethod(field);
      } else {
        let result = '';

        if (field.attribute) {
          field.name = field.attribute;
        }

        if (!field.name) {
          throw new Error('The following index field has no name: ' + field);
        }

        result += this.queryGenerator.quoteIdentifier(field.name);
        return result;
      }
    });

    const fieldsSqlQuotedString = fieldsSql.join(', ');
    const fieldsSqlString = fieldsSql.join('_');

    switch (this.options.type.toUpperCase()) {
      case 'UNIQUE':
        constraintName = this.queryGenerator.quoteIdentifier(this.options.name || `${this.tableName}_${fieldsSqlString}_uk`);
        constraintSnippet = `CONSTRAINT ${constraintName} UNIQUE (${fieldsSqlQuotedString})`;
        break;
      case 'CHECK':
        this.options.where = this.queryGenerator.whereItemsQuery(this.options.where);
        constraintName = this.queryGenerator.quoteIdentifier(this.options.name || `${this.tableName}_${fieldsSqlString}_ck`);
        constraintSnippet = `CONSTRAINT ${constraintName} CHECK (${this.options.where})`;
        break;
      case 'DEFAULT':
        if (this.options.defaultValue === undefined) {
          throw new Error('Default value must be specifed for DEFAULT CONSTRAINT');
        }

        if (this.queryGenerator._dialect.name !== 'mssql') {
          throw new Error('Default constraints are supported only for MSSQL dialect.');
        }

        constraintName = this.queryGenerator.quoteIdentifier(this.options.name || `${this.tableName}_${fieldsSqlString}_df`);
        constraintSnippet = `CONSTRAINT ${constraintName} DEFAULT (${this.queryGenerator.escape(this.options.defaultValue)}) FOR ${fieldsSql[0]}`;
        break;
      case 'PRIMARY KEY':
        constraintName = this.queryGenerator.quoteIdentifier(this.options.name || `${this.tableName}_${fieldsSqlString}_pk`);
        constraintSnippet = `CONSTRAINT ${constraintName} PRIMARY KEY (${fieldsSqlQuotedString})`;
        break;
      case 'FOREIGN KEY':
        const references = this.options.references;
        if (!references || !references.table || !references.field) {
          throw new Error('references object with table and field must be specified');
        }
        constraintName = this.queryGenerator.quoteIdentifier(this.options.name || `${this.tableName}_${fieldsSqlString}_${references.table}_fk`);
        const referencesSnippet = `${this.queryGenerator.quoteTable(references.table)} (${this.queryGenerator.quoteIdentifier(references.field)})`;
        constraintSnippet = `CONSTRAINT ${constraintName} `;
        constraintSnippet += `FOREIGN KEY (${fieldsSqlQuotedString}) REFERENCES ${referencesSnippet}`;
        if (this.options.onUpdate) {
          constraintSnippet += ` ON UPDATE ${this.options.onUpdate.toUpperCase()}`;
        }
        if (this.options.onDelete) {
          constraintSnippet += ` ON DELETE ${this.options.onDelete.toUpperCase()}`;
        }
        break;
      default: throw new Error(`${this.options.type} is invalid.`);
    }
    return constraintSnippet;
  }
}

class QuoteGenerator {
  constructor(queryGenerator, collection, parent, connector) {
    this.queryGenerator = queryGenerator;
    this.collection = collection;
    this.parent = parent;
    this.connector = connector;
  }

  generateQuery() {
    if (typeof this.collection === 'string') {
      return this.queryGenerator.quoteIdentifiers(this.collection);
    } else if (Array.isArray(this.collection)) {
      this.collection.forEach((item, index) => {
        const previous = this.collection[index - 1];
        let previousAssociation;
        let previousModel;

        if (!previous && this.parent !== undefined) {
          previousModel = this.parent;
        } else if (previous && previous instanceof Association) {
          previousAssociation = previous;
          previousModel = previous.target;
        }

        if (previousModel && previousModel.prototype instanceof Model) {
          let model;
          let as;

          if (typeof item === 'function' && item.prototype instanceof Model) {
            model = item;
          } else if (_.isPlainObject(item) && item.model && item.model.prototype instanceof Model) {
            model = item.model;
            as = item.as;
          }

          if (model) {
            if (!as && previousAssociation && previousAssociation instanceof Association && previousAssociation.through && previousAssociation.through.model === model) {
              item = new Association(previousModel, model, {
                as: model.name
              });
            } else {
              item = previousModel.getAssociationForAlias(model, as);

              if (!item) {
                item = previousModel.getAssociationForAlias(model, model.name);
              }
            }

            if (!(item instanceof Association)) {
              throw new Error(util.format('Unable to find a valid association for model, \'%s\'', model.name));
            }
          }
        }

        if (typeof item === 'string') {
          const orderIndex = ['ASC', 'DESC', 'ASC NULLS LAST', 'DESC NULLS LAST', 'ASC NULLS FIRST', 'DESC NULLS FIRST', 'NULLS FIRST', 'NULLS LAST'].indexOf(item.toUpperCase());

          if (index > 0 && orderIndex !== -1) {
            item = this.queryGenerator.sequelize.literal(' ' + ['ASC', 'DESC', 'ASC NULLS LAST', 'DESC NULLS LAST', 'ASC NULLS FIRST', 'DESC NULLS FIRST', 'NULLS FIRST', 'NULLS LAST'][orderIndex]);
          } else if (previousModel && previousModel.prototype instanceof Model) {
            if (previousModel.associations !== undefined && previousModel.associations[item]) {
              item = previousModel.associations[item];
            } else if (previousModel.rawAttributes !== undefined && previousModel.rawAttributes[item] && item !== previousModel.rawAttributes[item].field) {
              item = previousModel.rawAttributes[item].field;
            } else if (
              item.indexOf('.') !== -1
              && previousModel.rawAttributes !== undefined
            ) {
              const itemSplit = item.split('.');

              if (previousModel.rawAttributes[itemSplit[0]].type instanceof DataTypes.JSON) {
                const identifier = this.queryGenerator.quoteIdentifiers(previousModel.name  + '.' + previousModel.rawAttributes[itemSplit[0]].field);

                const path = itemSplit.slice(1);

                item = this.queryGenerator.jsonPathExtractionQuery(identifier, path);

                item = this.queryGenerator.sequelize.literal(item);
              }
            }
          }
        }

        this.collection[index] = item;
      }, this);

      let sql = '';

      if (this.collection.length > 0) {
        sql += this.queryGenerator.quoteIdentifier(this.collection[0].join(this.connector)) + '.';
      } else if (typeof this.collection[0] === 'string' && this.parent) {
        sql += this.queryGenerator.quoteIdentifier(this.parent.name) + '.';
      }

      this.collection.slice(1).forEach(collectionItem => {
        sql += this.queryGenerator.quote(collectionItem, this.parent, this.connector);
      }, this);

      return sql;
    } else if (this.collection._modelAttribute) {
      return this.queryGenerator.quoteTable(this.collection.Model.name) + '.' + this.queryGenerator.quoteIdentifier(this.collection.fieldName);
    } else if (this.collection instanceof Utils.SequelizeMethod) {
      return this.queryGenerator.handleSequelizeMethod(this.collection);
    } else if (_.isPlainObject(this.collection) && this.collection.raw) {
      throw new Error('The `{raw: "..."}` syntax is no longer supported.  Use `sequelize.literal` instead.');
    } else {
      throw new Error('Unknown structure passed to order / group: ' + util.inspect(this.collection));
    }
  }
}

class GenerateIncludeGenerator {
  constructor(queryGenerator, include, parentTableName, topLevelInfo) {
    this.queryGenerator = queryGenerator;
    this.include = include;
    this.parentTableName = parentTableName;
    this.topLevelInfo = topLevelInfo;
  }

  generateQuery() {
    const joinQueries = {
      mainQuery: [],
      subQuery: []
    };
    const mainChildIncludes = [];
    const subChildIncludes = [];
    let requiredMismatch = false;
    const includeAs = {
      internalAs: this.include.as,
      externalAs: this.include.as
    };
    const attributes = {
      main: [],
      subQuery: []
    };
    let joinQuery;

    this.topLevelInfo.options.keysEscaped = true;

    if (this.topLevelInfo.names.name !== this.parentTableName.externalAs && this.topLevelInfo.names.as !== this.parentTableName.externalAs) {
      includeAs.internalAs = `${this.parentTableName.internalAs}->${this.include.as}`;
      includeAs.externalAs = `${this.parentTableName.externalAs}.${this.include.as}`;
    }

    if (this.topLevelInfo.options.includeIgnoreAttributes !== false) {
      const includeAttributes = this.include.attributes.map(attr => {
        let attrAs = attr;
        let verbatim = false;

        if (Array.isArray(attr) && attr.length === 2) {
          if (attr[0] instanceof Utils.SequelizeMethod && (
            attr[0] instanceof Utils.Literal ||
            attr[0] instanceof Utils.Cast ||
            attr[0] instanceof Utils.Fn
          )) {
            verbatim = true;
          }

          attr = attr.map(attr => attr instanceof Utils.SequelizeMethod ? this.queryGenerator.handleSequelizeMethod(attr) : attr);

          attrAs = attr[1];
          attr = attr[0];
        } else if (attr instanceof Utils.Literal) {
          return attr.val; 
        } else if (attr instanceof Utils.Cast || attr instanceof Utils.Fn) {
          throw new Error(
            'Tried to select attributes using Sequelize.cast or Sequelize.fn without specifying an alias for the result, during eager loading. ' +
            'This means the attribute will not be added to the returned instance'
          );
        }

        let prefix;
        if (verbatim === true) {
          prefix = attr;
        } else {
          prefix = `${this.queryGenerator.quoteIdentifier(includeAs.internalAs)}.${this.queryGenerator.quoteIdentifier(attr)}`;
        }
        return `${prefix} AS ${this.queryGenerator.quoteIdentifier(`${includeAs.externalAs}.${attrAs}`, true)}`;
      });
      if (this.include.subQuery && this.topLevelInfo.subQuery) {
        for (const attr of includeAttributes) {
          attributes.subQuery.push(attr);
        }
      } else {
        for (const attr of includeAttributes) {
          attributes.main.push(attr);
        }
      }
    }

    if (this.include.through) {
      joinQuery = this.queryGenerator.generateThroughJoin(this.include, includeAs, this.parentTableName.internalAs, this.topLevelInfo);
    } else {
      this.queryGenerator._generateSubQueryFilter(this.include, includeAs, this.topLevelInfo);
      joinQuery = this.queryGenerator.generateJoin(this.include, this.topLevelInfo);
    }

    if (joinQuery.attributes.main.length > 0) {
      attributes.main = attributes.main.concat(joinQuery.attributes.main);
    }

    if (joinQuery.attributes.subQuery.length > 0) {
      attributes.subQuery = attributes.subQuery.concat(joinQuery.attributes.subQuery);
    }

    if (this.include.include) {
      for (const childInclude of this.include.include) {
        if (childInclude.separate || childInclude._pseudo) {
          continue;
        }

        const childJoinQueries = this.queryGenerator.generateInclude(childInclude, includeAs, this.topLevelInfo);

        subChildIncludes = subChildIncludes.concat(childJoinQueries.subQuery);
        mainChildIncludes = mainChildIncludes.concat(childJoinQueries.mainQuery);

        if (childJoinQueries.attributes.main.length > 0) {
          attributes.main = attributes.main.concat(childJoinQueries.attributes.main);
        }
        if (childJoinQueries.attributes.subQuery.length > 0) {
          attributes.subQuery = attributes.subQuery.concat(childJoinQueries.attributes.subQuery);
        }
      }
    }

    if (this.include.subQuery && this.topLevelInfo.subQuery) {
      if (requiredMismatch && subChildIncludes.length > 0) {
        joinQueries.subQuery.push(` ${joinQuery.join} ( ${joinQuery.body}${subChildIncludes.join('')} ) ON ${joinQuery.condition}`);
      } else {
        joinQueries.subQuery.push(` ${joinQuery.join} ${joinQuery.body} ON ${joinQuery.condition}`);
        if (subChildIncludes.length > 0) {
          joinQueries.subQuery.push(subChildIncludes.join(''));
        }
      }
      joinQueries.mainQuery.push(mainChildIncludes.join(''));
    } else {
      if (requiredMismatch && mainChildIncludes.length > 0) {
        joinQueries.mainQuery.push(` ${joinQuery.join} ( ${joinQuery.body}${mainChildIncludes.join('')} ) ON ${joinQuery.condition}`);
      } else {
        joinQueries.mainQuery.push(` ${joinQuery.join} ${joinQuery.body} ON ${joinQuery.condition}`);
        if (mainChildIncludes.length > 0) {
          joinQueries.mainQuery.push(mainChildIncludes.join(''));
        }
      }
      joinQueries.subQuery.push(subChildIncludes.join(''));
    }

    return {
      mainQuery: joinQueries.mainQuery.join(''),
      subQuery: joinQueries.subQuery.join(''),
      attributes
    };
  }
}

class GenerateJoinGenerator {
  constructor(queryGenerator, include, topLevelInfo) {
    this.queryGenerator = queryGenerator;
    this.include = include;
    this.topLevelInfo = topLevelInfo;
  }

  generateQuery() {
    const association = this.include.association;
    const parent = this.include.parent;
    const parentIsTop = !!parent && !this.include.parent.association && this.include.parent.model.name === this.topLevelInfo.options.model.name;
    let $parent;
    let joinWhere;
    const left = association.source;
    const attrLeft = association instanceof BelongsTo ?
      association.identifier :
      association.sourceKeyAttribute || left.primaryKeyAttribute;
    const fieldLeft = association instanceof BelongsTo ?
      association.identifierField :
      left.rawAttributes[association.sourceKeyAttribute || left.primaryKeyAttribute].field;
    let asLeft;
    const right = this.include.model;
    const tableRight = right.getTableName();
    const fieldRight = association instanceof BelongsTo ?
      right.rawAttributes[association.targetIdentifier || right.primaryKeyAttribute].field :
      association.identifierField;
    let asRight = this.include.as;

    while (($parent = $parent && $parent.parent || this.include.parent) && $parent.association) {
      if (asLeft) {
        asLeft = `${$parent.as}->${asLeft}`;
      } else {
        asLeft = $parent.as;
      }
    }

    if (!asLeft) asLeft = parent.as || parent.model.name;
    else asRight = `${asLeft}->${asRight}`;

    let joinOn = `${this.queryGenerator.quoteTable(asLeft)}.${this.queryGenerator.quoteIdentifier(fieldLeft)}`;

    if (this.topLevelInfo.options.groupedLimit && parentIsTop || this.topLevelInfo.subQuery && this.include.parent.subQuery && !this.include.subQuery) {
      if (parentIsTop) {
        joinOn = `${this.queryGenerator.quoteTable(parent.as || parent.model.name)}.${this.queryGenerator.quoteIdentifier(attrLeft)}`;
      } else {
        joinOn = this.queryGenerator.quoteIdentifier(`${asLeft.replace(/->/g, '.')}.${attrLeft}`);
      }
    }

    joinOn += ` = ${this.queryGenerator.quoteIdentifier(asRight)}.${this.queryGenerator.quoteIdentifier(fieldRight)}`;

    if (this.include.on) {
      joinOn = this.queryGenerator.whereItemsQuery(this.include.on, {
        prefix: this.queryGenerator.sequelize.literal(this.queryGenerator.quoteIdentifier(asRight)),
        model: this.include.model
      });
    }

    if (this.include.where) {
      joinWhere = this.queryGenerator.whereItemsQuery(this.include.where, {
        prefix: this.queryGenerator.sequelize.literal(this.queryGenerator.quoteIdentifier(asRight)),
        model: this.include.model
      });
      if (joinWhere) {
        if (this.include.or) {
          joinOn += ` OR ${joinWhere}`;
        } else {
          joinOn += ` AND ${joinWhere}`;
        }
      }
    }

    return {
      join: this.include.required ? 'INNER JOIN' : 'LEFT OUTER JOIN',
      body: this.queryGenerator.quoteTable(tableRight, asRight),
      condition: joinOn,
      attributes: {
        main: [],
        subQuery: []
      }
    };
  }
}

class GenerateThroughJoinGenerator {
  constructor(queryGenerator, include, includeAs, parentTableName, topLevelInfo) {
    this.queryGenerator = queryGenerator;
    this.include = include;
    this.includeAs = includeAs;
    this.parentTableName = parentTableName;
    this.topLevelInfo = topLevelInfo;
  }

  generateQuery() {
    const through = this.include.through;
    const throughTable = through.model.getTableName();
    const throughAs = `${this.includeAs.internalAs}->${through.as}`;
    const externalThroughAs = `${this.includeAs.externalAs}.${through.as}`;
    const throughAttributes = through.attributes.map(attr =>
      this.queryGenerator.quoteIdentifier(throughAs) + '.' + this.queryGenerator.quoteIdentifier(Array.isArray(attr) ? attr[0] : attr)
      + ' AS '
      + this.queryGenerator.quoteIdentifier(externalThroughAs + '.' + (Array.isArray(attr) ? attr[1] : attr))
    );
    const association = this.include.association;
    const parentIsTop = !this.include.parent.association && this.include.parent.model.name === this.topLevelInfo.options.model.name;
    const primaryKeysSource = association.source.primaryKeyAttributes;
    const tableSource = this.parentTableName;
    const identSource = association.identifierField;
    const primaryKeysTarget = association.target.primaryKeyAttributes;
    const tableTarget = this.includeAs.internalAs;
    const identTarget = association.foreignIdentifierField;
    const attrTarget = association.target.rawAttributes[primaryKeysTarget[0]].field || primaryKeysTarget[0];

    const joinType = this.include.required ? 'INNER JOIN' : 'LEFT OUTER JOIN';
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

    if (this.topLevelInfo.options.includeIgnoreAttributes !== false) {
      throughAttributes.forEach(attr => {
        attributes.main.push(attr);
      });
    }

    if (!this.topLevelInfo.subQuery) {
      attrSource = association.source.rawAttributes[primaryKeysSource[0]].field;
    }
    if (this.topLevelInfo.subQuery && !this.include.subQuery && !this.include.parent.subQuery && this.include.parent.model !== this.topLevelInfo.options.mainModel) {
      attrSource = association.source.rawAttributes[primaryKeysSource[0]].field;
    }

    sourceJoinOn = `${this.queryGenerator.quoteTable(this.parentTableName)}.${this.queryGenerator.quoteIdentifier(attrSource)} = `;
    sourceJoinOn += `${this.queryGenerator.quoteIdentifier(this.includeAs.internalAs)}.${this.queryGenerator.quoteIdentifier(identSource)}`;

    targetJoinOn = `${this.queryGenerator.quoteIdentifier(this.includeAs.internalAs)}.${this.queryGenerator.quoteIdentifier(attrTarget)} = `;
    targetJoinOn += `${this.queryGenerator.quoteIdentifier(throughAs)}.${this.queryGenerator.quoteIdentifier(identTarget)}`;

    if (through.where) {
      throughWhere = this.queryGenerator.whereItemsQuery(through.where, {
        prefix: this.queryGenerator.sequelize.literal(this.queryGenerator.quoteIdentifier(throughAs)),
        model: through.model
      });
    }

    if (this.queryGenerator._dialect.supports.joinTableDependent) {
      joinBody = `( ${this.queryGenerator.quoteTable(throughTable, throughAs)} INNER JOIN ${this.queryGenerator.quoteTable(this.include.model.getTableName(), this.includeAs.internalAs)} ON ${targetJoinOn}`;
      if (throughWhere) {
        joinBody += ` AND ${throughWhere}`;
      }
      joinBody += ')';
      joinCondition = sourceJoinOn;
    } else {
      joinBody = `${this.queryGenerator.quoteTable(throughTable, throughAs)} ON ${sourceJoinOn} ${joinType} ${this.queryGenerator.quoteTable(this.include.model.getTableName(), this.includeAs.internalAs)}`;
      joinCondition = targetJoinOn;
      if (throughWhere) {
        joinCondition += ` AND ${throughWhere}`;
      }
    }

    if (this.include.where || this.include.through.where) {
      if (this.include.where) {
        targetWhere = this.queryGenerator.whereItemsQuery(this.include.where, {
          prefix: this.queryGenerator.sequelize.literal(this.queryGenerator.quoteIdentifier(this.includeAs.internalAs)),
          model: this.include.model
        });
        if (targetWhere) {
          joinCondition += ` AND ${targetWhere}`;
        }
      }
    }

    this.queryGenerator._generateSubQueryFilter(this.include, this.includeAs, this.topLevelInfo);

    return {
      join: joinType,
      body: joinBody,
      condition: joinCondition,
      attributes
    };
  }
}

class GenerateSubQueryFilterGenerator {
  constructor(queryGenerator, include, includeAs, topLevelInfo) {
    this.queryGenerator = queryGenerator;
    this.include = include;
    this.includeAs = includeAs;
    this.topLevelInfo = topLevelInfo;
  }

  generateQuery() {
    if (!this.topLevelInfo.subQuery || !this.include.subQueryFilter) {
      return;
    }

    if (!this.topLevelInfo.options.where) {
      this.topLevelInfo.options.where = {};
    }
    let parent = this.include;
    let child = this.include;
    let nestedIncludes = this.queryGenerator._getRequiredClosure(this.include).include;
    let query;

    while ((parent = parent.parent)) { 
      if (parent.parent && !parent.required) {
        return; 
      }

      if (parent.subQueryFilter) {
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
      query = this.queryGenerator.selectQuery(topInclude.through.model.getTableName(), {
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
            this.queryGenerator.sequelize.asIs([
              this.queryGenerator.quoteTable(topParent.model.name) + '.' + this.queryGenerator.quoteIdentifier(topParent.model.primaryKeyField),
              this.queryGenerator.quoteIdentifier(topInclude.through.model.name) + '.' + this.queryGenerator.quoteIdentifier(topAssociation.identifierField)
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
        this.queryGenerator.quoteIdentifier(this.includeAs.as) + '.' + this.queryGenerator.quoteIdentifier(targetField),
        this.queryGenerator.quoteTable(topParent.as || topParent.model.name) + '.' + this.queryGenerator.quoteIdentifier(sourceField)
      ].join(' = ');

      query = this.queryGenerator.selectQuery(topInclude.model.getTableName(), {
        attributes: [targetField],
        include: Model._validateIncludedElements(topInclude).include,
        model: topInclude.model,
        where: {
          [Op.and]: [
            topInclude.where,
            { [Op.join]: this.queryGenerator.sequelize.asIs(join) }
          ]
        },
        limit: 1,
        tableAs: topInclude.as,
        includeIgnoreAttributes: false
      }, topInclude.model);
    }

    if (!this.topLevelInfo.options.where[Op.and]) {
      this.topLevelInfo.options.where[Op.and] = [];
    }

    this.topLevelInfo.options.where[`__${this.includeAs.internalAs}`] = this.queryGenerator.sequelize.asIs([
      '(',
      query.replace(/\;$/, ''),
      ')',
      'IS NOT NULL'
    ].join(' '));
  }
}

class GetRequiredClosureGenerator {
  constructor(queryGenerator, include) {
    this.queryGenerator = queryGenerator;
    this.include = include;
  }

  generateQuery() {
    const copy = _.extend({}, this.include, {attributes: [], include: []});

    if (Array.isArray(this.include.include)) {
      copy.include = this.include.include
        .filter(i => i.required)
        .map(inc => this.queryGenerator._getRequiredClosure(inc));
    }

    return copy;
  }
}

class GetQueryOrdersGenerator {
  constructor(queryGenerator, options, model, subQuery) {
    this.queryGenerator = queryGenerator;
    this.options = options;
    this.model = model;
    this.subQuery = subQuery;
  }

  generateQuery() {
    const mainQueryOrder = [];
    const subQueryOrder = [];

    if (Array.isArray(this.options.order)) {
      for (let order of this.options.order) {
        if (!Array.isArray(order)) {
          order = [order];
        }

        if (
          this.subQuery
          && Array.isArray(order)
          && order[0]
          && !(order[0] instanceof Association)
          && !(typeof order[0] === 'function' && order[0].prototype instanceof Model)
          && !(typeof order[0].model === 'function' && order[0].model.prototype instanceof Model)
          && !(typeof order[0] === 'string' && this.model && this.model.associations !== undefined && this.model.associations[order[0]])
        ) {
          subQueryOrder.push(this.queryGenerator.quote(order, this.model, '->'));
        }

        if (this.subQuery) {
          const subQueryAttribute = this.options.attributes.find(a => Array.isArray(a) && a[0] === order[0] && a[1]);
          if (subQueryAttribute) {
            order[0] = new Utils.Col(subQueryAttribute[1]);
          }
        }

        mainQueryOrder.push(this.queryGenerator.quote(order, this.model, '->'));
      }
    } else if (this.options.order instanceof Utils.SequelizeMethod) {
      const sql = this.queryGenerator.quote(this.options.order, this.model, '->');
      if (this.subQuery) {
        subQueryOrder.push(sql);
      }
      mainQueryOrder.push(sql);
    } else {
      throw new Error('Order must be type of array or instance of a valid sequelize method.');
    }

    return {mainQueryOrder, subQueryOrder};
  }
}

class SelectFromTableFragmentGenerator {
  constructor(queryGenerator, options, model, attributes, tables, mainTableAs) {
    this.queryGenerator = queryGenerator;
    this.options = options;
    this.model = model;
    this.attributes = attributes;
    this.tables = tables;
    this.mainTableAs = mainTableAs;
  }

  generateQuery() {
    let fragment = 'SELECT ' + this.attributes.join(', ') + ' FROM ' + this.tables;

    if (this.mainTableAs) {
      fragment += ' AS ' + this.mainTableAs;
    }

    return fragment;
  }
}

class SetAutocommitQueryGenerator {
  constructor(queryGenerator, value, options) {
    this.queryGenerator = queryGenerator;
    this.value = value;
    this.options = options;
  }

  generateQuery() {
    if (this.options.parent) {
      return;
    }

    if (typeof this.value === 'undefined' || this.value === null) {
      return;
    }

    return 'SET autocommit = ' + (this.value ? 1 : 0) + ';';
  }
}

class SetIsolationLevelQueryGenerator {
  constructor(queryGenerator, value, options) {
    this.queryGenerator = queryGenerator;
    this.value = value;
    this.options = options;
  }

  generateQuery() {
    if (this.options.parent) {
      return;
    }

    return 'SET SESSION TRANSACTION ISOLATION LEVEL ' + this.value + ';';
  }
}

class StartTransactionQueryGenerator {
  constructor(queryGenerator, transaction) {
    this.queryGenerator = queryGenerator;
    this.transaction = transaction;
  }

  generateQuery() {
    if (this.transaction.parent) {
      return 'SAVEPOINT ' + this.queryGenerator.quoteIdentifier(this.transaction.name, true) + ';';
    }

    return 'START TRANSACTION;';
  }
}

class CommitTransactionQueryGenerator {
  constructor(queryGenerator, transaction) {
    this.queryGenerator = queryGenerator;
    this.transaction = transaction;
  }

  generateQuery() {
    if (this.transaction.parent) {
      return;
    }

    return 'COMMIT;';
  }
}

class RollbackTransactionQueryGenerator {
  constructor(queryGenerator, transaction) {
    this.queryGenerator = queryGenerator;
    this.transaction = transaction;
  }

  generateQuery() {
    if (this.transaction.parent) {
      return 'ROLLBACK TO SAVEPOINT ' + this.queryGenerator.quoteIdentifier(this.transaction.name, true) + ';';
    }

    return 'ROLLBACK;';
  }
}

class AddLimitAndOffsetGenerator {
  constructor(queryGenerator, options) {
    this.queryGenerator = queryGenerator;
    this.options = options;
  }

  generateQuery() {
    let fragment = '';

    if (this.options.offset != null && this.options.limit == null) {
      fragment += ' LIMIT ' + this.queryGenerator.escape(this.options.offset) + ', ' + 10000000000000;
    } else if (this.options.limit != null) {
      if (this.options.offset != null) {
        fragment += ' LIMIT ' + this.queryGenerator.escape(this.options.offset) + ', ' + this.queryGenerator.escape(this.options.limit);
      } else {
        fragment += ' LIMIT ' + this.queryGenerator.escape(this.options.limit);
      }
    }

    return fragment;
  }
}

class HandleSequelizeMethodGenerator {
  constructor(queryGenerator, smth, tableName, factory, options, prepend) {
    this.queryGenerator = queryGenerator;
    this.smth = smth;
    this.tableName = tableName;
    this.factory = factory;
    this.options = options;
    this.prepend = prepend;
  }

  generateQuery() {
    let result;

    if (this.queryGenerator.OperatorMap.hasOwnProperty(this.smth.comparator)) {
      this.smth.comparator = this.queryGenerator.OperatorMap[this.smth.comparator];
    }

    if (this.smth instanceof Utils.Where) {
      let value = this.smth.logic;
      let key;

      if (this.smth.attribute instanceof Utils.SequelizeMethod) {
        key = this.queryGenerator.getWhereConditions(this.smth.attribute, this.tableName, this.factory, this.options, this.prepend);
      } else {
        key = this.queryGenerator.quoteTable(this.smth.attribute.Model.name) + '.' + this.queryGenerator.quoteIdentifier(this.smth.attribute.field || this.smth.attribute.fieldName);
      }

      if (value && value instanceof Utils.SequelizeMethod) {
        value = this.queryGenerator.getWhereConditions(value, this.tableName, this.factory, this.options, this.prepend);

        result = value === 'NULL' ? key + ' IS NULL' : [key, value].join(this.smth.comparator);
      } else if (_.isPlainObject(value)) {
        result = this.queryGenerator.whereItemQuery(this.smth.attribute, value, {
          model: this.factory
        });
      } else {
        if (typeof value === 'boolean') {
          value = this.queryGenerator.booleanValue(value);
        } else {
          value = this.queryGenerator.escape(value);
        }

        result = value === 'NULL' ? key + ' IS NULL' : [key, value].join(' ' + this.smth.comparator + ' ');
      }
    } else if (this.smth instanceof Utils.Literal) {
      result = this.smth.val;
    } else if (this.smth instanceof Utils.Cast) {
      if (this.smth.val instanceof Utils.SequelizeMethod) {
        result = this.queryGenerator.handleSequelizeMethod(this.smth.val, this.tableName, this.factory, this.options, this.prepend);
      } else if (_.isPlainObject(this.smth.val)) {
        result = this.queryGenerator.whereItemsQuery(this.smth.val);
      } else {
        result = this.queryGenerator.escape(this.smth.val);
      }

      result = 'CAST(' + result + ' AS ' + this.smth.type.toUpperCase() + ')';
    } else if (this.smth instanceof Utils.Fn) {
      result = this.smth.fn + '(' + this.smth.args.map(arg => {
        if (arg instanceof Utils.SequelizeMethod) {
          return this.queryGenerator.handleSequelizeMethod(arg, this.tableName, this.factory, this.options, this.prepend);
        } else if (_.isPlainObject(arg)) {
          return this.queryGenerator.whereItemsQuery(arg);
        } else {
          return this.queryGenerator.escape(arg);
        }
      }).join(', ') + ')';
    } else if (this.smth instanceof Utils.Col) {
      if (Array.isArray(this.smth.col)) {
        if (!this.factory) {
          throw new Error('Cannot call Sequelize.col() with array outside of order / group clause');
        }
      } else if (this.smth.col.indexOf('*') === 0) {
        return '*';
      }
      return this.queryGenerator.quote(this.smth.col, this.factory);
    } else {
      result = this.smth.toString(this.queryGenerator, this.factory);
    }

    return result;
  }
}

class WhereQueryGenerator {
  constructor(queryGenerator, where, options) {
    this.queryGenerator = queryGenerator;
    this.where = where;
    this.options = options;
  }

  generateQuery() {
    const query = this.queryGenerator.whereItemsQuery(this.where, this.options);
    if (query && query.length) {
      return 'WHERE '+query;
    }
    return '';
  }
}

class WhereItemsQueryGenerator {
  constructor(queryGenerator, where, options, binding) {
    this.queryGenerator = queryGenerator;
    this.where = where;
    this.options = options;
    this.binding = binding;
  }

  generateQuery() {
    if (
      this.where === null ||
      this.where === undefined ||
      Utils.getComplexSize(this.where) === 0
    ) {
      return '';
    }

    if (_.isString(this.where)) {
      throw new Error('Support for `{where: \'raw query\'}` has been removed.');
    }

    const items = [];

    this.binding = this.binding || 'AND';
    if (this.binding.substr(0, 1) !== ' ') this.binding = ' '+this.binding+' ';

    if (_.isPlainObject(this.where)) {
      Utils.getComplexKeys(this.where).forEach(prop => {
        const item = this.where[prop];
        items.push(this.queryGenerator.whereItemQuery(prop, item, this.options));
      });
    } else {
      items.push(this.queryGenerator.whereItemQuery(undefined, this.where, this.options));
    }

    return items.length && items.filter(item => item && item.length).join(this.binding) || '';
  }
}

class WhereItemQueryGenerator {
  constructor(queryGenerator, key, value, options) {
    this.queryGenerator = queryGenerator;
    this.key = key;
    this.value = value;
    this.options = options;
  }

  generateQuery() {
    if (this.key && typeof this.key === 'string' && this.key.indexOf('.') !== -1 && this.options.model) {
      const keyParts = this.key.split('.');
      if (this.options.model.rawAttributes[keyParts[0]] && this.options.model.rawAttributes[keyParts[0]].type instanceof DataTypes.JSON) {
        const tmp = {};
        const field = this.options.model.rawAttributes[keyParts[0]];
        Dottie.set(tmp, keyParts.slice(1), this.value);
        return this.queryGenerator.whereItemQuery(field.field || keyParts[0], tmp, Object.assign({field}, this.options));
      }
    }

    const field = this.queryGenerator._findField(this.key, this.options);
    const fieldType = field && field.type || this.options.type;

    const isPlainObject = _.isPlainObject(this.value);
    const isArray = !isPlainObject && Array.isArray(this.value);
    this.key = this.queryGenerator.OperatorsAliasMap && this.queryGenerator.OperatorsAliasMap[this.key] || this.key;
    if (isPlainObject) {
      this.value = this.queryGenerator._replaceAliases(this.value);
    }
    const valueKeys = isPlainObject && Utils.getComplexKeys(this.value);

    if (this.key === undefined) {
      if (typeof this.value === 'string') {
        return this.value;
      }

      if (isPlainObject && valueKeys.length === 1) {
        return this.queryGenerator.whereItemQuery(valueKeys[0], this.value[valueKeys[0]], this.options);
      }
    }

    if (!this.value) {
      return this.queryGenerator._joinKeyValue(this.key, this.queryGenerator.escape(this.value, field), this.queryGenerator.OperatorMap[Op.is], this.options.prefix);
    }

    if (this.value instanceof Utils.SequelizeMethod && !(this.key !== undefined && this.value instanceof Utils.Fn)) {
      return this.queryGenerator.handleSequelizeMethod(this.value);
    }

    if (this.key === Op.or || this.key === Op.and || this.key === Op.not) {
      return this.queryGenerator._whereGroupBind(this.key, this.value, this.options);
    }

    if (this.value[Op.or]) {
      return this.queryGenerator._whereBind(this.queryGenerator.OperatorMap[Op.or], this.key, this.value[Op.or], this.options);
    }

    if (this.value[Op.and]) {
      return this.queryGenerator._whereBind(this.queryGenerator.OperatorMap[Op.and], this.key, this.value[Op.and], this.options);
    }

    if (isArray && fieldType instanceof DataTypes.ARRAY) {
      return this.queryGenerator._joinKeyValue(this.key, this.queryGenerator.escape(this.value, field), this.queryGenerator.OperatorMap[Op.eq], this.options.prefix);
    }

    if (isPlainObject && fieldType instanceof DataTypes.JSON && this.options.json !== false) {
      return this.queryGenerator._whereJSON(this.key, this.value, this.options);
    }
    if (isPlainObject && valueKeys.length > 1) {
      return this.queryGenerator._whereBind(this.queryGenerator.OperatorMap[Op.and], this.key, this.value, this.options);
    }

    if (isArray) {
      return this.queryGenerator._whereParseSingleValueObject(this.key, field, Op.in, this.value, this.options);
    }
    if (isPlainObject) {
      if (this.queryGenerator.OperatorMap[this.valueKeys[0]]) {
        return this.queryGenerator._whereParseSingleValueObject(this.key, field, this.valueKeys[0], this.value[this.valueKeys[0]], this.options);
      } else {
        return this.queryGenerator._whereParseSingleValueObject(this.key, field, this.queryGenerator.OperatorMap[Op.eq], this.value, this.options);
      }
    }

    if (this.key === Op.placeholder) {
      return this.queryGenerator._joinKeyValue(this.queryGenerator.OperatorMap[this.key], this.queryGenerator.escape(this.value, field), this.queryGenerator.OperatorMap[Op.eq], this.options.prefix);
    }

    return this.queryGenerator._joinKeyValue(this.key, this.queryGenerator.escape(this.value, field), this.queryGenerator.OperatorMap[Op.eq], this.options.prefix);
  }
}

class GetWhereConditionsGenerator {
  constructor(queryGenerator, smth, tableName, factory, options, prepend) {
    this.queryGenerator = queryGenerator;
    this.smth = smth;
    this.tableName = tableName;
    this.factory = factory;
    this.options = options;
    this.prepend = prepend;
  }

  generateQuery() {
    let result = null;
    const where = {};

    if (Array.isArray(this.tableName)) {
      this.tableName = this.tableName[0];
      if (Array.isArray(this.tableName)) {
        this.tableName = this.tableName[1];
      }
    }

    this.options = this.options || {};

    if (typeof this.prepend === 'undefined') {
      this.prepend = true;
    }

    if (this.smth && this.smth instanceof Utils.SequelizeMethod) {
      result = this.queryGenerator.handleSequelizeMethod(this.smth, this.tableName, this.factory, this.options, this.prepend);
    } else if (_.isPlainObject(this.smth)) {
      return this.queryGenerator.whereItemsQuery(this.smth, {
        model: this.factory,
        prefix: this.prepend && this.tableName
      });
    } else if (typeof this.smth === 'number') {
      let primaryKeys = this.factory ? Object.keys(this.factory.primaryKeys) : [];

      if (primaryKeys.length > 0) {
        primaryKeys = primaryKeys[0];
      } else {
        primaryKeys = 'id';
      }

      where[primaryKeys] = this.smth;

      return this.queryGenerator.whereItemsQuery(where, {
        model: this.factory,
        prefix: this.prepend && this.tableName
      });
    } else if (typeof this.smth === 'string') {
      return this.queryGenerator.whereItemsQuery(this.smth, {
        model: this.factory,
        prefix: this.prepend && this.tableName
      });
    } else if (Buffer.isBuffer(this.smth)) {
      result = this.queryGenerator.escape(this.smth);
    } else if (Array.isArray(this.smth)) {
      if (this.smth.length === 0 || this.smth.length > 0 && this.smth[0].length === 0) return '1=1';
      if (Utils.canTreatArrayAsAnd(this.smth)) {
        const _smth = { [Op.and]: this.smth };
        result = this.queryGenerator.getWhereConditions(_smth, this.tableName, this.factory, this.options, this.prepend);
      } else {
        throw new Error('Support for literal replacements in the `where` object has been removed.');
      }
    } else if (this.smth === null) {
      return this.queryGenerator.whereItemsQuery(this.smth, {
        model: this.factory,
        prefix: this.prepend && this.tableName
      });
    }

    return result ? result : '1=1';
  }
}

module.exports = QueryGenerator;