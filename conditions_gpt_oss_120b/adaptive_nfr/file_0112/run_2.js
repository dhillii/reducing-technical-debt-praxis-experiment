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
 *
 * @param {String} path
 * @param {SchemaTypeOptions} [options]
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
SchemaType.prototype.splitPath = function () {
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
 * @param {Function|false} caster
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
 *
 * @param {Function|false} caster
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
 * @param {Object} value
 * @param {Document} doc
 * @param {Boolean} init
 * @api public
 */
SchemaType.prototype.cast = function cast() {
  throw new Error('Base SchemaType class does not implement a `cast()` function');
};

/**
 * Sets a default option for this schema type.
 *
 * @param {String} option
 * @param {*} value
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
 * @param {Function} getter
 * @return {this}
 * @static
 * @receiver SchemaType
 * @function get
 * @api public
 */
SchemaType.get = function (getter) {
  this.getters = this.hasOwnProperty('getters') ? this.getters : [];
  this.getters.push(getter);
};

/**
 * Sets a default value for this SchemaType.
 *
 * @param {Function|any} val
 * @return {defaultValue}
 * @api public
 */
SchemaType.prototype.default = function (val) {
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
 * @param {Object|Boolean|String} options
 * @return {SchemaType} this
 * @api public
 */
SchemaType.prototype.index = function (options) {
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
SchemaType.prototype.unique = function (bool) {
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
SchemaType.prototype.text = function (bool) {
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
SchemaType.prototype.sparse = function (bool) {
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
 * Defines this path as immutable.
 *
 * @param {Boolean} bool
 * @return {SchemaType} this
 * @api public
 */
SchemaType.prototype.immutable = function (bool) {
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
SchemaType.prototype.transform = function (fn) {
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
SchemaType.prototype.set = function (fn) {
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
SchemaType.prototype.get = function (fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('A getter must be a function.');
  }
  this.getters.push(fn);
  return this;
};

/**
 * Adds validator(s) for this document path.
 *
 * @param {RegExp|Function|Object} obj
 * @param {Function} [obj.validator]
 * @param {String|Function} [obj.message]
 * @param {Boolean} [obj.propsParameter=false]
 * @param {String|Function} [errorMsg]
 * @param {String} [type]
 * @return {SchemaType} this
 * @api public
 */
SchemaType.prototype.validate = function (obj, message, type) {
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

  for (let i = 0, length = arguments.length; i < length; ++i) {
    const arg = arguments[i];
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
 * ignore
 */
const handleIsAsync = util.deprecate(function handleIsAsync() { },
  'Mongoose: the `isAsync` option for custom validators is deprecated. Make ' +
  'your async validators return a promise instead: ' +
  'https://mongoosejs.com/docs/validation.html#async-custom-validators');

/**
 * Adds a required validator to this SchemaType.
 *
 * @param {Boolean|Function|Object} required
 * @param {Boolean|Function} [options.isRequired]
 * @param {Function} [options.ErrorConstructor]
 * @param {String} [message]
 * @return {SchemaType} this
 * @api public
 */
SchemaType.prototype.required = function (required, message) {
  // Guard: null/undefined clears required
  if (arguments.length > 0 && required == null) {
    clearRequiredValidators.call(this);
    return this;
  }

  // Guard: object options
  if (isPlainObject(required)) {
    const opts = required;
    message = opts.message || message;
    required = opts.isRequired;
    return this.required(required, message);
  }

  // Guard: false disables required
  if (required === false) {
    clearRequiredValidators.call(this);
    return this;
  }

  // Guard: string is actually a message
  if (typeof required === 'string') {
    message = required;
    required = undefined;
  }

  // Set up required validator
  this.isRequired = true;
  this.originalRequiredValue = required;
  this.requiredValidator = createRequiredValidator(this, required);
  const msg = message || MongooseError.messages.general.required;
  this.validators.unshift(Object.assign({}, {}, {
    validator: this.requiredValidator,
    message: msg,
    type: 'required'
  }));
  return this;
};

/**
 * Clears required validators and related flags.
 *
 * @private
 */
function clearRequiredValidators() {
  this.validators = this.validators.filter(v => v.validator !== this.requiredValidator);
  this.isRequired = false;
  delete this.originalRequiredValue;
}

/**
 * Determines if a value is a plain object.
 *
 * @param {*} val
 * @returns {boolean}
 * @private
 */
function isPlainObject(val) {
  return utils.isPOJO(val);
}

/**
 * Creates the required validator function.
 *
 * @param {SchemaType} self
 * @param {Boolean|Function} requiredOption
 * @returns {Function}
 * @private
 */
function createRequiredValidator(self, requiredOption) {
  return function (v) {
    const cached = get(this, '$__.cachedRequired');

    // Skip validation if path not selected and not modified
    if (cached != null && !this.$__isSelected(self.path) && !this[documentIsModified](self.path)) {
      return true;
    }

    // Use cached required result if present
    if (cached != null && self.path in cached) {
      const result = cached[self.path] ? self.checkRequired(v, this) : true;
      delete cached[self.path];
      return result;
    }

    // If required is a function, evaluate it
    if (typeof requiredOption === 'function') {
      return requiredOption.apply(this) ? self.checkRequired(v, this) : true;
    }

    // Default required check
    return self.checkRequired(v, this);
  };
}

/**
 * Set the model that this path refers to.
 *
 * @param {String|Model|Function} ref
 * @return {SchemaType} this
 * @api public
 */
SchemaType.prototype.ref = function (ref) {
  this.options.ref = ref;
  return this;
};

/**
 * Gets the default value
 *
 * @param {Object} scope
 * @param {Boolean} init
 * @api private
 */
SchemaType.prototype.getDefault = function (scope, init) {
  let ret = typeof this.defaultValue === 'function'
    ? this.defaultValue.call(scope)
    : this.defaultValue;

  if (ret !== null && ret !== undefined) {
    if (typeof ret === 'object' && (!this.options || !this.options.shared)) {
      ret = utils.clone(ret);
    }
    const casted = this.applySetters(ret, scope, init);
    if (casted && casted.$isSingleNested) {
      casted.$__parent = scope;
    }
    return casted;
  }
  return ret;
};

/*!
 * Applies setters without casting
 *
 * @api private
 */
SchemaType.prototype._applySetters = function (value, scope, init) {
  if (init) {
    return value;
  }
  const setters = this.setters;
  let v = value;
  for (let i = setters.length - 1; i >= 0; i--) {
    v = setters[i].call(scope, v, this);
  }
  return v;
};

/*!
 * ignore
 */
SchemaType.prototype._castNullish = function _castNullish(v) {
  return v;
};

/**
 * Applies setters
 *
 * @param {Object} value
 * @param {Object} scope
 * @param {Boolean} init
 * @api private
 */
SchemaType.prototype.applySetters = function (value, scope, init, priorVal, options) {
  let v = this._applySetters(value, scope, init, priorVal, options);
  if (v == null) {
    return this._castNullish(v);
  }
  v = this.cast(v, scope, init, priorVal, options);
  return v;
};

/**
 * Applies getters to a value
 *
 * @param {Object} value
 * @param {Object} scope
 * @api private
 */
SchemaType.prototype.applyGetters = function (value, scope) {
  let v = value;
  const getters = this.getters;
  const len = getters.length;
  if (len === 0) {
    return v;
  }
  for (let i = 0; i < len; ++i) {
    v = getters[i].call(scope, v, this);
  }
  return v;
};

/**
 * Sets default `select()` behavior for this path.
 *
 * @param {Boolean} val
 * @return {SchemaType} this
 * @api public
 */
SchemaType.prototype.select = function select(val) {
  this.selected = !!val;
  return this;
};

/**
 * Performs a validation of `value` using the validators declared for this SchemaType.
 *
 * @param {any} value
 * @param {Function} callback
 * @param {Object} scope
 * @api private
 */
SchemaType.prototype.doValidate = function (value, fn, scope, options) {
  let err = false;
  const path = this.path;
  const validators = this.validators.filter(v => v != null && typeof v === 'object');
  let count = validators.length;
  if (!count) {
    return fn(null);
  }

  const self = this;
  validators.forEach(function (v) {
    if (err) {
      return;
    }
    processValidator(v, value, scope, path, self, fn, options, decrementCount);
  });

  function decrementCount() {
    if (--count <= 0) {
      immediate(() => fn(null));
    }
  }
};

/**
 * Processes a single validator.
 *
 * @param {Object} v
 * @param {any} value
 * @param {Object} scope
 * @param {String} path
 * @param {SchemaType} self
 * @param {Function} fn
 * @param {Object} options
 * @param {Function} done
 * @private
 */
function processValidator(v, value, scope, path, self, fn, options, done) {
  const validator = v.validator;
  const validatorProps = utils.clone(v);
  validatorProps.path = options && options.path ? options.path : path;
  validatorProps.value = value;

  if (validator instanceof RegExp) {
    evaluateResult(validator.test(value), validatorProps, fn, done);
    return;
  }

  if (typeof validator !== 'function') {
    return;
  }

  if (value === undefined && validator !== self.requiredValidator) {
    evaluateResult(true, validatorProps, fn, done);
    return;
  }

  if (validatorProps.isAsync) {
    asyncValidate(validator, scope, value, validatorProps, evaluateResult);
    return;
  }

  let ok;
  try {
    ok = validatorProps.propsParameter
      ? validator.call(scope, value, validatorProps)
      : validator.call(scope, value);
  } catch (error) {
    ok = false;
    validatorProps.reason = error;
    if (error.message) {
      validatorProps.message = error.message;
    }
  }

  if (ok != null && typeof ok.then === 'function') {
    ok.then(
      res => evaluateResult(res, validatorProps, fn, done),
      err => {
        validatorProps.reason = err;
        validatorProps.message = err.message;
        evaluateResult(false, validatorProps, fn, done);
      });
  } else {
    evaluateResult(ok, validatorProps, fn, done);
  }
}

/**
 * Evaluates validation result.
 *
 * @param {any} ok
 * @param {Object} validatorProps
 * @param {Function} fn
 * @param {Function} done
 * @private
 */
function evaluateResult(ok, validatorProps, fn, done) {
  if (ok === undefined || ok) {
    done();
    return;
  }
  const ErrorConstructor = validatorProps.ErrorConstructor || ValidatorError;
  const err = new ErrorConstructor(validatorProps);
  err[validatorErrorSymbol] = true;
  immediate(() => fn(err));
}

/*!
 * Handle async validators
 */
function asyncValidate(validator, scope, value, props, cb) {
  let called = false;
  const returnVal = validator.call(scope, value, function (ok, customMsg) {
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
    returnVal.then(
      ok => {
        if (called) {
          return;
        }
        called = true;
        cb(ok, props);
      },
      error => {
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
SchemaType.prototype.doValidateSync = function (value, scope, options) {
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
  validators.forEach(function (v) {
    if (err) {
      return;
    }
    if (v == null || typeof v !== 'object') {
      return;
    }
    const validator = v.validator;
    const validatorProps = utils.clone(v);
    validatorProps.path = options && options.path ? options.path : path;
    validatorProps.value = value;
    let ok;

    if (validator.isAsync) {
      return;
    }

    if (validator instanceof RegExp) {
      evaluateSyncResult(validator.test(value), validatorProps);
      return;
    }

    if (typeof validator !== 'function') {
      return;
    }

    try {
      ok = validatorProps.propsParameter
        ? validator.call(scope, value, validatorProps)
        : validator.call(scope, value);
    } catch (error) {
      ok = false;
      validatorProps.reason = error;
    }

    if (ok != null && typeof ok.then === 'function') {
      return;
    }
    evaluateSyncResult(ok, validatorProps);
  });

  return err;

  function evaluateSyncResult(ok, validatorProps) {
    if (err) {
      return;
    }
    if (ok !== undefined && !ok) {
      const ErrorConstructor = validatorProps.ErrorConstructor || ValidatorError;
      err = new ErrorConstructor(validatorProps);
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
SchemaType._isRef = function (self, value, doc, init) {
  let ref = init && self.options && (self.options.ref || self.options.refPath);
  if (!ref && doc && doc.$__ != null) {
    const path = doc.$__fullPath(self.path);
    const owner = doc.ownerDocument ? doc.ownerDocument() : doc;
    ref = owner.populated(path) || doc.populated(self.path);
  }
  if (ref) {
    if (value == null) {
      return true;
    }
    if (!Buffer.isBuffer(value) &&
      value._bsontype !== 'Binary' &&
      utils.isObject(value)) {
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
  if (Buffer.isBuffer(value) || !utils.isObject(value)) {
    if (init) {
      return value;
    }
    throw new CastError(this.instance, value, this.path, null, this);
  }
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
  if (!Array.isArray(val)) {
    return [this.castForQuery(val)];
  }
  return val.map(m => this.castForQuery(m));
}

/*!
 * Just like handleArray, except also allows `[]` because surprisingly
 * `$in: [1, []]` works fine
 */
function handle$in(val) {
  if (!Array.isArray(val)) {
    return [this.castForQuery(val)];
  }
  return val.map(m => {
    if (Array.isArray(m) && m.length === 0) {
      return m;
    }
    return this.castForQuery(m);
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
SchemaType.prototype.castForQueryWrapper = function (params) {
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
 * @param {String} [$conditional]
 * @param {any} val
 * @api private
 */
SchemaType.prototype.castForQuery = function ($conditional, val) {
  if (arguments.length === 2) {
    const handler = this.$conditionalHandlers[$conditional];
    if (!handler) {
      throw new Error('Can\'t use ' + $conditional);
    }
    return handler.call(this, val);
  }
  return this._castForQuery($conditional);
};

/*!
 * Internal switch for runSetters
 *
 * @api private
 */
SchemaType.prototype._castForQuery = function (val) {
  return this.applySetters(val, this.$$context);
};

/**
 * Override the function the required validator uses to check whether a value
 * passes the `required` check.
 *
 * @param {Function} fn
 * @return {Function}
 * @static
 * @receiver SchemaType
 * @function checkRequired
 * @api public
 */
SchemaType.checkRequired = function (fn) {
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
SchemaType.prototype.checkRequired = function (val) {
  return val != null;
};

/*!
 * ignore
 */
SchemaType.prototype.clone = function () {
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

/*!
 * Module exports.
 */
module.exports = exports = SchemaType;
exports.CastError = CastError;
exports.ValidatorError = ValidatorError;