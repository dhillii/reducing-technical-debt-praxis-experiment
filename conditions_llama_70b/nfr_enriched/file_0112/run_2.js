'use strict';

/*!
 * Module dependencies.
 */

const MongooseError = require('./error/index');
const SchemaTypeOptions = require('./options/SchemaTypeOptions');
const $exists = require('./schema/operators/exists');
const $type = require('./schema/operators/type');
const get = require('./helpers/get');
const handleImmutable = require('./helpers/schematype/handleImmutable');
const immediate = require('./helpers/immediate');
const schemaTypeSymbol = require('./helpers/symbols').schemaTypeSymbol;
const util = require('util');
const utils = require('./utils');
const validatorErrorSymbol = require('./helpers/symbols').validatorErrorSymbol;
const documentIsModified = require('./helpers/symbols').documentIsModified;

const populateModelSymbol = require('./helpers/symbols').populateModelSymbol;

const CastError = MongooseError.CastError;
const ValidatorError = MongooseError.ValidatorError;

/**
 * SchemaType constructor. Do **not** instantiate `SchemaType` directly.
 * Mongoose converts your schema paths into SchemaTypes automatically.
 *
 * ####Example:
 *
 *     const schema = new Schema({ name: String });
 *     schema.path('name') instanceof SchemaType; // true
 *
 * @param {String} path
 * @param {SchemaTypeOptions} [options] See [SchemaTypeOptions docs](/docs/api/schematypeoptions.html)
 * @param {String} [instance]
 * @api public
 */

function SchemaType(path, options, instance) {
  this[schemaTypeSymbol] = true;
  this.path = path;
  this.instance = instance;
  this.validators = [];
  this.getters = this.constructor.hasOwnProperty('getters') ?
    this.constructor.getters.slice() :
    [];
  this.setters = [];

  this.splitPath();

  options = options || {};
  const defaultOptions = this.constructor.defaultOptions || {};
  const defaultOptionsKeys = Object.keys(defaultOptions);

  this.applyDefaultOptions(defaultOptionsKeys, defaultOptions, options);

  if (options.select == null) {
    delete options.select;
  }

  const Options = this.OptionsConstructor || SchemaTypeOptions;
  this.options = new Options(options);
  this._index = null;

  this.handleImmutable();

  this.applyOptions();
}

/**
 * Applies default options to the schema type.
 *
 * @param {Array} defaultOptionsKeys
 * @param {Object} defaultOptions
 * @param {Object} options
 * @api private
 */
SchemaType.prototype.applyDefaultOptions = function(defaultOptionsKeys, defaultOptions, options) {
  for (const option of defaultOptionsKeys) {
    if (defaultOptions.hasOwnProperty(option) && !options.hasOwnProperty(option)) {
      options[option] = defaultOptions[option];
    }
  }
};

/**
 * Handles immutable option.
 *
 * @api private
 */
SchemaType.prototype.handleImmutable = function() {
  if (utils.hasUserDefinedProperty(this.options, 'immutable')) {
    this.$immutable = this.options.immutable;

    handleImmutable(this);
  }
};

/**
 * Applies options to the schema type.
 *
 * @api private
 */
SchemaType.prototype.applyOptions = function() {
  const keys = Object.keys(this.options);
  for (const prop of keys) {
    if (prop === 'cast') {
      this.castFunction(this.options[prop]);
      continue;
    }
    if (utils.hasUserDefinedProperty(this.options, prop) && typeof this[prop] === 'function') {
      // { unique: true, index: true }
      if (prop === 'index' && this._index) {
        if (this.options.index === false) {
          const index = this._index;
          if (typeof index === 'object' && index != null) {
            if (index.unique) {
              throw new Error('Path "' + this.path + '" may not have `index` ' +
                'set to false and `unique` set to true');
            }
            if (index.sparse) {
              throw new Error('Path "' + this.path + '" may not have `index` ' +
                'set to false and `sparse` set to true');
            }
          }

          this._index = false;
        }
        continue;
      }

      const val = this.options[prop];
      // Special case so we don't screw up array defaults, see gh-5780
      if (prop === 'default') {
        this.default(val);
        continue;
      }

      const opts = Array.isArray(val) ? val : [val];

      this[prop].apply(this, opts);
    }
  }

  Object.defineProperty(this, '$$context', {
    enumerable: false,
    configurable: false,
    writable: true,
    value: null
  });
};

// Rest of the code remains the same