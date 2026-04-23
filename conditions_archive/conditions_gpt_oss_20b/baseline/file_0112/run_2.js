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

  for (const option of defaultOptionsKeys) {
    if (defaultOptions.hasOwnProperty(option) && !options.hasOwnProperty(option)) {
      options[option] = defaultOptions[option];
    }
  }

  if (options.select == null) {
    delete options.select;
  }

  const Options = this.OptionsConstructor || SchemaTypeOptions;
  this.options = new Options(options);
  this._index = null;


  if (utils.hasUserDefinedProperty(this.options, 'immutable')) {
    this.$immutable = this.options.immutable;

    handleImmutable(this);
  }

  const keys = Object.keys(this.options);
  for (const prop of keys) {
    if (prop === 'cast') {
      this.castFunction(this.options[prop]);
      continue;
    }
    if (utils.hasUserDefinedProperty(this.options, prop) && typeof this[prop] === 'function') {
      // { unique: true, index: true }
      if (prop === 'index' && this._index) {
        if (options.index === false) {
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

      const val = options[prop];
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
}

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
  return this;
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
 * _Indexes are created [in the background](https://mongoosejs.com/docs/guide.html#background) by default. If `background` is set to `false`, MongoDB will not execute any read/write operations until the index build.
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

  if (this._index === null || this._index === undefined ||
    typeof this._index === 'boolean') {
    this._index = {};
  } else if (typeof this._index === 'string') {
    this._index = { type: this._index };
  }

  this._index.text = bool;
  return this;
};

/**
 * Declares a sparse index.
 *
 * @param {Boolean} bool
 * @return {SchemaType} this
 * @api public
 */

SchemaType.prototype.sparse = function(bool) {
  if (this._index === false) {
    if (!bool) {
      return;
    }
    throw new Error('Path "' + this.path + '" may not have `index` set to ' +
      'false and `sparse` set to true');
  }

  if (this._index == null || typeof this._index === 'boolean') {
    this._index = {};
  } else if (typeof this._index === 'string') {
    this._index = { type: this._index };
  }

  this._index.sparse = bool;
  return this;
};

/**
 * Defines this path as immutable. Mongoose prevents you from changing
 * immutable paths unless the parent document has [`isNew: true`](/docs/api.html#document_Document-isNew).
 *
 * @param {Boolean} bool
 * @return {SchemaType} this
 * @see isNew /docs/api.html#document_Document-isNew
 * @api public
 */

SchemaType.prototype.immutable = function(bool) {
  this.$immutable = bool;
  handleImmutable(this);

  return this;
};

/**
 * Defines a custom function for transforming this path when converting a document to JSON.
 *
 * @param {Function} fn
 * @return {SchemaType} this
 * @api public
 */

SchemaType.prototype.transform = function(fn) {
  this.options.transform = fn;

  return this;
};

/**
 * Adds a setter to this schematype.
 *
 * @param {Function} fn
 * @return {SchemaType} this
 * @api public
 */

SchemaType.prototype.set = function(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('A setter must be a function.');
  }
  this.setters.push(fn);
  return this;
};

/**
 * Adds a getter to this schematype.
 *
 * @param {Function} fn
 * @return {SchemaType} this
 * @api public
 */

SchemaType.prototype.get = function(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('A getter must be a function.');
  }
  this.getters.push(fn);
  return this;
};

/**
 * Adds validator(s) for this document path.
 *
 * @param {RegExp|Function|Object} obj validator function, or hash describing options
 * @param {Function} [obj.validator] validator function. If the validator function returns `undefined` or a truthy value, validation succeeds. If it returns [falsy](https://masteringjs.io/tutorials/fundamentals/falsy) (except `undefined`) or throws an error, validation fails.
 * @param {String|Function} [obj.message] optional error message. If function, should return the error message as a string
 * @param {Boolean} [obj.propsParameter=false] If true, Mongoose will pass the validator properties object (with the `validator` function, `message`, etc.) as the 2nd arg to the validator function. This is disabled by default because many validators [rely on positional args](https://github.com/chriso/validator.js#validators), so turning this on may cause unpredictable behavior.
 * @param {String|Function} [errorMsg] optional error message. If function, should return the error message as a string
 * @param {String} [type] optional validator type
 * @return {SchemaType} this
 * @api public
 */

SchemaType.prototype.validate = function(obj, message, type) {
  if (typeof obj === 'function' || obj && utils.getFunctionName(obj.constructor) === 'RegExp') {
    let properties;
    if (typeof message === 'function') {
      properties = { validator: obj, message: message };
      properties.type = type || 'user defined';
    } else if (message instanceof Object && !type) {
      properties = utils.clone(message);
      if (!properties.message) {
        properties.message = properties.msg;
      }
      properties.validator = obj;
      properties.type = properties.type || 'user defined';
    } else {
      if (message == null) {
        message = MongooseError.messages.general.default;
      }
      if (!type) {
        type = 'user defined';
      }
      properties = { message: message, type: type, validator: obj };
    }

    if (properties.isAsync) {
      handleIsAsync();
    }

    this.validators.push(properties);
    return this;
  }

  let i;
  let length;
  let arg;

  for (i = 0, length = arguments.length; i < length; i++) {
    arg = arguments[i];
    if (!utils.isPOJO(arg)) {
      const msg = 'Invalid validator. Received (' + typeof arg + ') '
          + arg
          + '. See http://mongoosejs.com/docs/api.html#schematype_SchemaType-validate';

      throw new Error(msg);
    }
    this.validate(arg.validator, arg);
  }

  return this;
};

/*!
 * Handle async validators
 */

function asyncValidate(validator, scope, value, props, cb) {
  let called = false;
  const returnVal = validator.call(scope, value, function(ok, customMsg) {
    if (called) {
      return;
    }
    called = true;
    if (customMsg) {
      props.message = customMsg;
    }
    cb(ok, props);
  });
  if (typeof returnVal === 'boolean') {
    called = true;
    cb(returnVal, props);
  } else if (returnVal && typeof returnVal.then === 'function') {
    // Promise
    returnVal.then(
      function(ok) {
        if (called) {
          return;
        }
        called = true;
        cb(ok, props);
      },
      function(error) {
        if (called) {
          return;
        }
        called = true;

        props.reason = error;
        props.message = error.message;
        cb(false, props);
      });
  }
}

/**
 * Performs a validation of `value` using the validators declared for this SchemaType.
 *
 * @param {any} value
 * @param {Object} scope
 * @return {MongooseError|undefined}
 * @api private
 */

SchemaType.prototype.doValidateSync = function(value, scope, options) {
  const path = this.path;
  const count = this.validators.length;

  if (!count) {
    return null;
  }

  let validators = this.validators;
  if (value === void 0) {
    if (this.validators.length > 0 && this.validators[0].type === 'required') {
      validators = [this.validators[0]];
    } else {
      return null;
    }
  }

  let err = null;
  validators.forEach(function(v) {
    if (err) {
      return;
    }

    if (v == null || typeof v !== 'object') {
      return;
    }

    const validator = v.validator;
    const validatorProperties = utils.clone(v);
    validatorProperties.path = options && options.path ? options.path : path;
    validatorProperties.value = value;
    let ok;

    // Skip any explicit async validators. Validators that return a promise
    // will still run, but won't trigger any errors.
    if (validator.isAsync) {
      return;
    }

    if (validator instanceof RegExp) {
      validate(validator.test(value), validatorProperties);
      return;
    }

    if (typeof validator !== 'function') {
      return;
    }

    try {
      if (validatorProperties.propsParameter) {
        ok = validator.call(scope, value, validatorProperties);
      } else {
        ok = validator.call(scope, value);
      }
    } catch (error) {
      ok = false;
      validatorProperties.reason = error;
    }

    // Skip any validators that return a promise, we can't handle those
    // synchronously
    if (ok != null && typeof ok.then === 'function') {
      return;
    }
    validate(ok, validatorProperties);
  });

  return err;

  function validate(ok, validatorProperties) {
    if (err) {
      return;
    }
    if (ok !== undefined && !ok) {
      const ErrorConstructor = validatorProperties.ErrorConstructor || ValidatorError;
      err = new ErrorConstructor(validatorProperties);
      err[validatorErrorSymbol] = true;
    }
  }
};

/**
 * Determines if value is a valid Reference.
 *
 * @param {SchemaType} self
 * @param {Object} value
 * @param {Document} doc
 * @param {Boolean} init
 * @return {Boolean}
 * @api private
 */

SchemaType._isRef = function(self, value, doc, init) {
  // fast path
  let ref = init && self.options && (self.options.ref || self.options.refPath);

  if (!ref && doc && doc.$__ != null) {
    // checks for
    // - this populated with adhoc model and no ref was set in schema OR
    // - setting / pushing values after population
    const path = doc.$__fullPath(self.path);
    const owner = doc.ownerDocument ? doc.ownerDocument() : doc;
    ref = owner.populated(path) || doc.populated(self.path);
  }

  if (ref) {
    if (value == null) {
      return true;
    }
    if (!Buffer.isBuffer(value) && // buffers are objects too
        value._bsontype !== 'Binary' // raw binary value from the db
        && utils.isObject(value) // might have deselected _id in population query
    ) {
      return true;
    }

    return init;
  }

  return false;
};

/*!
 * ignore
 */

SchemaType.prototype._castRef = function _castRef(value, doc, init) {
  if (value == null) {
    return value;
  }

  if (value.$__ != null) {
    value.$__.wasPopulated = true;
    return value;
  }

  // setting a populated path
  if (Buffer.isBuffer(value) || !utils.isObject(value)) {
    if (init) {
      return value;
    }
    throw new CastError(this.instance, value, this.path, null, this);
  }

  // Handle the case where user directly sets a populated
  // path to a plain object; cast to the Model used in
  // the population query.
  const path = doc.$__fullPath(this.path);
  const owner = doc.ownerDocument ? doc.ownerDocument() : doc;
  const pop = owner.populated(path, true);
  let ret = value;
  if (!doc.$__.populated ||
      !doc.$__.populated[path] ||
      !doc.$__.populated[path].options ||
      !doc.$__.populated[path].options.options ||
      !doc.$__.populated[path].options.options.lean) {
    ret = new pop.options[populateModelSymbol](value);
    ret.$__.wasPopulated = true;
  }

  return ret;
};

/*!
 * ignore
 */

function handleSingle(val) {
  return this.castForQuery(val);
}

/*!
 * ignore
 */

function handleArray(val) {
  const _this = this;
  if (!Array.isArray(val)) {
    return [this.castForQuery(val)];
  }
  return val.map(function(m) {
    return _this.castForQuery(m);
  });
}

/*!
 * Just like handleArray, except also allows `[]` because surprisingly
 * `$in: [1, []]` works fine
 */

function handle$in(val) {
  const _this = this;
  if (!Array.isArray(val)) {
    return [this.castForQuery(val)];
  }
  return val.map(function(m) {
    if (Array.isArray(m) && m.length === 0) {
      return m;
    }
    return _this.castForQuery(m);
  });
}

/*!
 * ignore
 */

SchemaType.prototype.$conditionalHandlers = {
  $all: handleArray,
  $eq: handleSingle,
  $in: handle$in,
  $ne: handleSingle,
  $nin: handle$in,
  $exists: $exists,
  $type: $type
};

/*!
 * Wraps `castForQuery` to handle context
 */

SchemaType.prototype.castForQueryWrapper = function(params) {
  this.$$context = params.context;
  if ('$conditional' in params) {
    const ret = this.castForQuery(params.$conditional, params.val);
    this.$$context = null;
    return ret;
  }
  if (params.$skipQueryCastForUpdate || params.$applySetters) {
    const ret = this._castForQuery(params.val);
    this.$$context = null;
    return ret;
  }

  const ret = this.castForQuery(params.val);
  this.$$context = null;
  return ret;
};

/**
 * Cast the given value with the given optional query operator.
 *
 * @param {String} [$conditional] query operator, like `$eq` or `$in`
 * @param {any} val
 * @api private
 */

SchemaType.prototype.castForQuery = function($conditional, val) {
  let handler;
  if (arguments.length === 2) {
    handler = this.$conditionalHandlers[$conditional];
    if (!handler) {
      throw new Error('Can\'t use ' + $conditional);
    }
    return handler.call(this, val);
  }
  val = $conditional;
  return this._castForQuery(val);
};

/*!
 * Internal switch for runSetters
 *
 * @api private
 */

SchemaType.prototype._castForQuery = function(val) {
  return this.applySetters(val, this.$$context);
};

/**
 * Override the function the required validator uses to check whether a value
 * passes the `required` check. Override this on the individual SchemaType.
 *
 * @param {Function} fn
 * @return {Function}
 * @static
 * @receiver SchemaType
 * @function checkRequired
 * @api public
 */

SchemaType.checkRequired = function(fn) {
  if (arguments.length > 0) {
    this._checkRequired = fn;
  }

  return this._checkRequired;
};

/**
 * Default check for if this path satisfies the `required` validator.
 *
 * @param {any} val
 * @api private
 */

SchemaType.prototype.checkRequired = function(val) {
  return val != null;
};

/*!
 * ignore
 */

SchemaType.prototype.clone = function() {
  const options = Object.assign({}, this.options);
  const schematype = new this.constructor(this.path, options, this.instance);
  schematype.validators = this.validators.slice();
  if (this.requiredValidator !== undefined) schematype.requiredValidator = this.requiredValidator;
  if (this.defaultValue !== undefined) schematype.defaultValue = this.defaultValue;
  if (this.$immutable !== undefined && this.options.immutable === undefined) {
    schematype.$immutable = this.$immutable;

    handleImmutable(schematype);
  }
  if (this._index !== undefined) schematype._index = this._index;
  if (this.selected !== undefined) schematype.selected = this.selected;
  if (this.isRequired !== undefined) schematype.isRequired = this.isRequired;
  if (this.originalRequiredValue !== undefined) schematype.originalRequiredValue = this.originalRequiredValue;
  schematype.getters = this.getters.slice();
  schematype.setters = this.setters.slice();
  return schematype;
};

/**
 * Helper to remove the required validator.
 */
SchemaType.prototype._removeRequiredValidator = function() {
  this.validators = this.validators.filter(v => v.validator !== this.requiredValidator);
  this.isRequired = false;
  delete this.originalRequiredValue;
};

/**
 * Refactored required method with reduced cognitive complexity.
 */
SchemaType.prototype.required = function(required, message) {
  const self = this;

  // Disable required
  if (required == null || required === false) {
    self._removeRequiredValidator();
    return self;
  }

  // Extract options object
  let customOptions = {};
  if (typeof required === 'object' && !Array.isArray(required)) {
    customOptions = required;
    message = customOptions.message || message;
    required = required.isRequired;
  }

  // Treat string as message
  if (typeof required === 'string') {
    message = required;
    required = undefined;
  }

  self.isRequired = true;
  self.originalRequiredValue = required;

  const validatorFn = function(v) {
    const cached = get(this, '$__.cachedRequired');

    if (cached != null && !this.$__isSelected(self.path) && !this[documentIsModified](self.path)) {
      return true;
    }

    if (cached != null && self.path in cached) {
      const res = cached[self.path] ? self.checkRequired(v, this) : true;
      delete cached[self.path];
      return res;
    }

    if (typeof required === 'function') {
      return required.apply(this) ? self.checkRequired(v, this) : true;
    }

    return self.checkRequired(v, this);
  };

  self.requiredValidator = validatorFn;

  const msg = message || MongooseError.messages.general.required;
  self.validators.unshift(Object.assign({}, customOptions, {
    validator: validatorFn,
    message: msg,
    type: 'required'
  }));

  return self;
};

/*!
 * Module exports.
 */

module.exports = exports = SchemaType;

exports.CastError = CastError;

exports.ValidatorError = ValidatorError;