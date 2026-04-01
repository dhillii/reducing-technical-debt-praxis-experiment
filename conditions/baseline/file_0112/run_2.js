```javascript
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
  this._applyDefaultOptions(options);
  this._initializeOptions(options);
  this._processOptions(options);

  Object.defineProperty(this, '$$context', {
    enumerable: false,
    configurable: false,
    writable: true,
    value: null
  });
}

/**
 * Apply default options from constructor
 * @private
 */
SchemaType.prototype._applyDefaultOptions = function(options) {
  const defaultOptions = this.constructor.defaultOptions || {};
  const defaultOptionsKeys = Object.keys(defaultOptions);

  for (const option of defaultOptionsKeys) {
    if (defaultOptions.hasOwnProperty(option) && !options.hasOwnProperty(option)) {
      options[option] = defaultOptions[option];
    }
  }

  if (options.select == null) {
    delete options.select;
  }
};

/**
 * Initialize options object
 * @private
 */
SchemaType.prototype._initializeOptions = function(options) {
  const Options = this.OptionsConstructor || SchemaTypeOptions;
  this.options = new Options(options);
  this._index = null;

  if (utils.hasUserDefinedProperty(this.options, 'immutable')) {
    this.$immutable = this.options.immutable;
    handleImmutable(this);
  }
};

/**
 * Process options and apply them
 * @private
 */
SchemaType.prototype._processOptions = function(options) {
  const keys = Object.keys(this.options);
  for (const prop of keys) {
    if (prop === 'cast') {
      this.castFunction(this.options[prop]);
      continue;
    }
    if (!utils.hasUserDefinedProperty(this.options, prop) || typeof this[prop] !== 'function') {
      continue;
    }

    this._applyOption(prop, options);
  }
};

/**
 * Apply a single option
 * @private
 */
SchemaType.prototype._applyOption = function(prop, options) {
  if (prop === 'index') {
    this._handleIndexOption(options);
    return;
  }

  if (prop === 'default') {
    this.default(options[prop]);
    return;
  }

  const val = options[prop];
  const opts = Array.isArray(val) ? val : [val];
  this[prop].apply(this, opts);
};

/**
 * Handle index option with validation
 * @private
 */
SchemaType.prototype._handleIndexOption = function(options) {
  if (!this._index) {
    return;
  }

  if (options.index === false) {
    this._validateIndexConflict();
    this._index = false;
  }
};

/**
 * Validate index conflicts with unique/sparse
 * @private
 */
SchemaType.prototype._validateIndexConflict = function() {
  const index = this._index;
  if (typeof index !== 'object' || index == null) {
    return;
  }

  if (index.unique) {
    throw new Error('Path "' + this.path + '" may not have `index` ' +
      'set to false and `unique` set to true');
  }
  if (index.sparse) {
    throw new Error('Path "' + this.path + '" may not have `index` ' +
      'set to false and `sparse` set to true');
  }
};

/*!
 * The class that Mongoose uses internally to instantiate this SchemaType's `options` property.
 */

SchemaType.prototype.OptionsConstructor = SchemaTypeOptions;

/*!
 * ignore
 */

SchemaType.prototype.splitPath = function() {
  if (this._presplitPath != null) {
    return this._presplitPath;
  }
  if (this.path == null) {
    return undefined;
  }

  this._presplitPath = this.path.indexOf('.') === -1 ? [this.path] : this.path.split('.');
  return this._presplitPath;
};

/**
 * Get/set the function used to cast arbitrary values to this type.
 *
 * ####Example:
 *
 *     // Disallow `null` for numbers, and don't try to cast any values to
 *     // numbers, so even strings like '123' will cause a CastError.
 *     mongoose.Number.cast(function(v) {
 *       assert.ok(v === undefined || typeof v === 'number');
 *       return v;
 *     });
 *
 * @param {Function|false} caster Function that casts arbitrary values to this type, or throws an error if casting failed
 * @return {Function}
 * @static
 * @receiver SchemaType
 * @function cast
 * @api public
 */

SchemaType.cast = function cast(caster) {
  if (arguments.length === 0) {
    return this._cast;
  }
  if (caster === false) {
    caster = v => v;
  }
  this._cast = caster;

  return this._cast;
};

/**
 * Get/set the function used to cast arbitrary values to this particular schematype instance.
 * Overrides `SchemaType.cast()`.
 *
 * ####Example:
 *
 *     // Disallow `null` for numbers, and don't try to cast any values to
 *     // numbers, so even strings like '123' will cause a CastError.
 *     const number = new mongoose.Number('mypath', {});
 *     number.cast(function(v) {
 *       assert.ok(v === undefined || typeof v === 'number');
 *       return v;
 *     });
 *
 * @param {Function|false} caster Function that casts arbitrary values to this type, or throws an error if casting failed
 * @return {Function}
 * @static
 * @receiver SchemaType
 * @function cast
 * @api public
 */

SchemaType.prototype.castFunction = function castFunction(caster) {
  if (arguments.length === 0) {
    return this._castFunction;
  }
  if (caster === false) {
    caster = this.constructor._defaultCaster || (v => v);
  }
  this._castFunction = caster;

  return this._castFunction;
};

/**
 * The function that Mongoose calls to cast arbitrary values to this SchemaType.
 *
 * @param {Object} value value to cast
 * @param {Document} doc document that triggers the casting
 * @param {Boolean} init
 * @api public
 */

SchemaType.prototype.cast = function cast() {
  throw new Error('Base SchemaType class does not implement a `cast()` function');
};

/**
 * Sets a default option for this schema type.
 *
 * ####Example:
 *
 *     // Make all strings be trimmed by default
 *     mongoose.SchemaTypes.String.set('trim', true);
 *
 * @param {String} option The name of the option you'd like to set (e.g. trim, lowercase, etc...)
 * @param {*} value The value of the option you'd like to set.
 * @return {void}
 * @static
 * @receiver SchemaType
 * @function set
 * @api public
 */

SchemaType.set = function set(option, value) {
  if (!this.hasOwnProperty('defaultOptions')) {
    this.defaultOptions = Object.assign({}, this.defaultOptions);
  }
  this.defaultOptions[option] = value;
};

/**
 * Attaches a getter for all instances of this schema type.
 *
 * ####Example:
 *
 *     // Make all numbers round down
 *     mongoose.Number.get(function(v) { return Math.floor(v); });
 *
 * @param {Function} getter
 * @return {this}
 * @static
 * @receiver SchemaType
 * @function get
 * @api public
 */

SchemaType.get = function(getter) {
  this.getters = this.hasOwnProperty('getters') ? this.getters : [];
  this.getters.push(getter);
};

/**
 * Sets a default value for this SchemaType.
 *
 * ####Example:
 *
 *     const schema = new Schema({ n: { type: Number, default: 10 })
 *     const M = db.model('M', schema)
 *     const m = new M;
 *     console.log(m.n) // 10
 *
 * Defaults can be either `functions` which return the value to use as the default or the literal value itself. Either way, the value will be cast based on its schema type before being set during document creation.
 *
 * ####Example:
 *
 *     // values are cast:
 *     const schema = new Schema({ aNumber: { type: Number, default: 4.815162342 }})
 *     const M = db.model('M', schema)
 *     const m = new M;
 *     console.log(m.aNumber) // 4.815162342
 *
 *     // default unique objects for Mixed types:
 *     const schema = new Schema({ mixed: Schema.Types.Mixed });
 *     schema.path('mixed').default(function () {
 *       return {};
 *     });
 *
 *     // if we don't use a function to return object literals for Mixed defaults,
 *     // each document will receive a reference to the same object literal creating
 *     // a "shared" object instance:
 *     const schema = new Schema({ mixed: Schema.Types.Mixed });
 *     schema.path('mixed').default({});
 *     const M = db.model('M', schema);
 *     const m1 = new M;
 *     m1.mixed.added = 1;
 *     console.log(m1.mixed); // { added: 1 }
 *     const m2 = new M;
 *     console.log(m2.mixed); // { added: 1 }
 *
 * @param {Function|any} val the default value
 * @return {defaultValue}
 * @api public
 */

SchemaType.prototype.default = function(val) {
  if (arguments.length === 1) {
    if (val === void 0) {
      this.defaultValue = void 0;
      return void 0;
    }

    if (val != null && val.instanceOfSchema) {
      throw new MongooseError('Cannot set default value of path `' + this.path +
        '` to a mongoose Schema instance.');
    }

    this.defaultValue = val;
    return this.defaultValue;
  } else if (arguments.length > 1) {
    this.defaultValue = utils.args(arguments);
  }
  return this.defaultValue;
};

/**
 * Declares the index options for this schematype.
 *
 * ####Example:
 *
 *     const s = new Schema({ name: { type: String, index: true })
 *     const s = new Schema({ loc: { type: [Number], index: 'hashed' })
 *     const s = new Schema({ loc: { type: [Number], index: '2d', sparse: true })
 *     const s = new Schema({ loc: { type: [Number], index: { type: '2dsphere', sparse: true }})
 *     const s = new Schema({ date: { type: Date, index: { unique: true, expires: '1d' }})
 *     s.path('my.path').index(true);
 *     s.path('my.date').index({ expires: 60 });
 *     s.path('my.path').index({ unique: true, sparse: true });
 *
 * ####NOTE:
 *
 * _Indexes are created [in the background](https://docs.mongodb.com/manual/core/index-creation/#index-creation-background)
 * by default. If `background` is set to `false`, MongoDB will not execute any
 * read/write operations you send until the index build.
 * Specify `background: false` to override Mongoose's default._
 *
 * @param {Object|Boolean|String} options
 * @return {SchemaType} this
 * @api public
 */

SchemaType.prototype.index = function(options) {
  this._index = options;
  utils.expires(this._index);
  return this;
};

/**
 * Declares an unique index.
 *
 * ####Example:
 *
 *     const s = new Schema({ name: { type: String, unique: true }});
 *     s.path('name').index({ unique: true });
 *
 * _NOTE: violating the constraint returns an `E11000` error from MongoDB when saving, not a Mongoose validation error._
 *
 * @param {Boolean} bool
 * @return {SchemaType} this
 * @api public
 */

SchemaType.prototype.unique = function(bool) {
  if (this._index === false) {
    if (!bool) {
      return;
    }
    throw new Error('Path "' + this.path + '" may not have `index` set to ' +
      'false and `unique` set to true');
  }
  if (this._index == null || this._index === true) {
    this._index = {};
  } else if (typeof this._index === 'string') {
    this._index = { type: this._index };
  }

  this._index.unique = bool;
  return this;
};

/**
 * Declares a full text index.
 *
 * ###Example:
 *
 *      const s = new Schema({name : {type: String, text : true })
 *      s.path('name').index({text : true});
 * @param {Boolean} bool
 * @return {SchemaType} this
 * @api public
 */

SchemaType.prototype.text = function(bool) {
  if (this._index === false) {
    if (!bool) {
      return;
    }
    throw new Error('Path "' + this.path + '" may not have `index` set to ' +
      'false and `text` set to true');
  }