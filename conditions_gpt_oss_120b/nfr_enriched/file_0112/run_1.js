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
  const defaultOptionKeys = Object.keys(defaultOptions);
  for (const opt of defaultOptionKeys) {
    if (defaultOptions.hasOwnProperty(opt) && !options.hasOwnProperty(opt)) {
      options[opt] = defaultOptions[opt];
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

  const optKeys = Object.keys(this.options);
  for (const prop of optKeys) {
    if (prop === 'cast') {
      this.castFunction(this.options[prop]);
      continue;
    }
    if (utils.hasUserDefinedProperty(this.options, prop) && typeof this[prop] === 'function') {
      if (prop === 'index' && this._index) {
        _handleIndexOption.call(this, options);
        continue;
      }
      const val = options[prop];
      if (prop === 'default') {
        this.default(val);
        continue;
      }
      const args = Array.isArray(val) ? val : [val];
      this[prop].apply(this, args);
    }
  }

  Object.defineProperty(this, '$$context', {
    enumerable: false,
    configurable: false,
    writable: true,
    value: null
  });
}

/* Helper to process index option conflicts */
function _handleIndexOption(options) {
  if (options.index === false) {
    const index = this._index;
    if (typeof index === 'object' && index != null) {
      if (index.unique) {
        throw new Error('Path "' + this.path + '" may not have `index` set to false and `unique` set to true');
      }
      if (index.sparse) {
        throw new Error('Path "' + this.path + '" may not have `index` set to false and `sparse` set to true');
      }
    }
    this._index = false;
  }
}

/*!
 * The class that Mongoose uses internally to instantiate this SchemaType's `options` property.
 */
SchemaType.prototype.OptionsConstructor = SchemaTypeOptions;

/*!
 * ignore
 */
SchemaType.prototype.splitPath = function () {
  if (this._presplitPath != null) return this._presplitPath;
  if (this.path == null) return undefined;
  this._presplitPath = this.path.indexOf('.') === -1 ? [this.path] : this.path.split('.');
  return this._presplitPath;
};

/**
 * Get/set the function used to cast arbitrary values to this type.
 *
 * @param {Function|false} caster
 * @return {Function}
 * @static
 * @api public
 */
SchemaType.cast = function (caster) {
  if (arguments.length === 0) return this._cast;
  if (caster === false) caster = v => v;
  this._cast = caster;
  return this._cast;
};

/**
 * Get/set the function used to cast arbitrary values to this particular schematype instance.
 *
 * @param {Function|false} caster
 * @return {Function}
 * @api public
 */
SchemaType.prototype.castFunction = function (caster) {
  if (arguments.length === 0) return this._castFunction;
  if (caster === false) {
    caster = this.constructor._defaultCaster || (v => v);
  }
  this._castFunction = caster;
  return this._castFunction;
};

/**
 * The function that Mongoose calls to cast arbitrary values to this SchemaType.
 *
 * @throws {Error}
 */
SchemaType.prototype.cast = function () {
  throw new Error('Base SchemaType class does not implement a `cast()` function');
};

/**
 * Set a default option for this schema type.
 *
 * @param {String} option
 * @param {*} value
 * @static
 * @api public
 */
SchemaType.set = function (option, value) {
  if (!this.hasOwnProperty('defaultOptions')) {
    this.defaultOptions = Object.assign({}, this.defaultOptions);
  }
  this.defaultOptions[option] = value;
};

/**
 * Attach a getter for all instances of this schema type.
 *
 * @param {Function} getter
 * @static
 * @api public
 */
SchemaType.get = function (getter) {
  this.getters = this.hasOwnProperty('getters') ? this.getters : [];
  this.getters.push(getter);
};

/**
 * Set a default value for this SchemaType.
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
      throw new MongooseError('Cannot set default value of path `' + this.path + '` to a mongoose Schema instance.');
    }
    this.defaultValue = val;
    return this.defaultValue;
  } else if (arguments.length > 1) {
    this.defaultValue = utils.args(arguments);
  }
  return this.defaultValue;
};

/**
 * Declare index options.
 *
 * @param {Object|Boolean|String} options
 * @return {SchemaType}
 * @api public
 */
SchemaType.prototype.index = function (options) {
  this._index = options;
  utils.expires(this._index);
  return this;
};

/**
 * Declare a unique index.
 *
 * @param {Boolean} bool
 * @return {SchemaType}
 * @api public
 */
SchemaType.prototype.unique = function (bool) {
  if (this._index === false) {
    if (!bool) return;
    throw new Error('Path "' + this.path + '" may not have `index` set to false and `unique` set to true');
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
 * Declare a full text index.
 *
 * @param {Boolean} bool
 * @return {SchemaType}
 * @api public
 */
SchemaType.prototype.text = function (bool) {
  if (this._index === false) {
    if (!bool) return;
    throw new Error('Path "' + this.path + '" may not have `index` set to false and `text` set to true');
  }
  if (this._index === null || this._index === undefined || typeof this._index === 'boolean') {
    this._index = {};
  } else if (typeof this._index === 'string') {
    this._index = { type: this._index };
  }
  this._index.text = bool;
  return this;
};

/**
 * Declare a sparse index.
 *
 * @param {Boolean} bool
 * @return {SchemaType}
 * @api public
 */
SchemaType.prototype.sparse = function (bool) {
  if (this._index === false) {
    if (!bool) return;
    throw new Error('Path "' + this.path + '" may not have `index` set to false and `sparse` set to true');
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
 * Define immutability.
 *
 * @param {Boolean} bool
 * @return {SchemaType}
 * @api public
 */
SchemaType.prototype.immutable = function (bool) {
  this.$immutable = bool;
  handleImmutable(this);
  return this;
};

/**
 * Define a custom JSON transform.
 *
 * @param {Function} fn
 * @return {SchemaType}
 * @api public
 */
SchemaType.prototype.transform = function (fn) {
  this.options.transform = fn;
  return this;
};

/**
 * Add a setter.
 *
 * @param {Function} fn
 * @return {SchemaType}
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
 * Add a getter.
 *
 * @param {Function} fn
 * @return {SchemaType}
 * @api public
 */
SchemaType.prototype.get = function (fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('A getter must be a function.');
  }
  this.getters.push(fn);
  return this;
};

/* ---------- Validation Helpers ---------- */

/**
 * Parse arguments for `validate` when first argument is a function or RegExp.
 *
 * @param {Function|RegExp} obj
 * @param {*} message
 * @param {String} type
 * @returns {Object} validator properties
 */
function _parseValidatorFunction(obj, message, type) {
  let props;
  if (typeof message === 'function') {
    props = { validator: obj, message: message };
    props.type = type || 'user defined';
  } else if (message instanceof Object && !type) {
    props = utils.clone(message);
    if (!props.message) props.message = props.msg;
    props.validator = obj;
    props.type = props.type || 'user defined';
  } else {
    if (message == null) message = MongooseError.messages.general.default;
    if (!type) type = 'user defined';
    props = { message: message, type: type, validator: obj };
  }
  return props;
}

/**
 * Add a validator to the schema type.
 *
 * @param {SchemaType} self
 * @param {Object} props
 */
function _addValidator(self, props) {
  if (props.isAsync) {
    handleIsAsync();
  }
  self.validators.push(props);
}

/**
 * Process an object validator definition.
 *
 * @param {SchemaType} self
 * @param {Object} obj
 */
function _processObjectValidator(self, obj) {
  if (!utils.isPOJO(obj)) {
    const msg = 'Invalid validator. Received (' + typeof obj + ') ' + obj +
      '. See http://mongoosejs.com/docs/api.html#schematype_SchemaType-validate';
    throw new Error(msg);
  }
  self.validate(obj.validator, obj);
}

/* ---------- SchemaType.validate ---------- */

/**
 * Adds validator(s) for this document path.
 *
 * @param {RegExp|Function|Object} obj
 * @param {Function|String|Object} [message]
 * @param {String} [type]
 * @return {SchemaType}
 * @api public
 */
SchemaType.prototype.validate = function (obj, message, type) {
  if (typeof obj === 'function' || (obj && utils.getFunctionName(obj.constructor) === 'RegExp')) {
    const props = _parseValidatorFunction(obj, message, type);
    _addValidator(this, props);
    return this;
  }

  for (let i = 0; i < arguments.length; ++i) {
    _processObjectValidator(this, arguments[i]);
  }
  return this;
};

/*!
 * ignore
 */
const handleIsAsync = util.deprecate(function () { }, 'Mongoose: the `isAsync` option for custom validators is deprecated. Make your async validators return a promise instead: https://mongoosejs.com/docs/validation.html#async-custom-validators');

/* ---------- Required Helper ---------- */

/**
 * Remove required validator from the list.
 *
 * @param {SchemaType} self
 */
function _removeRequiredValidator(self) {
  self.validators = self.validators.filter(v => v.validator !== self.requiredValidator);
}

/**
 * Add required validator to the list.
 *
 * @param {SchemaType} self
 * @param {Function|Boolean} required
 * @param {String} message
 */
function _addRequiredValidator(self, required, message) {
  const msg = message || MongooseError.messages.general.required;
  self.validators.unshift(Object.assign({}, {}, {
    validator: self.requiredValidator,
    message: msg,
    type: 'required'
  }));
}

/**
 * Required validator implementation.
 *
 * @param {any} v
 * @returns {Boolean}
 */
function _requiredValidatorFactory(self, required) {
  return function (v) {
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
}

/**
 * Adds a required validator.
 *
 * @param {Boolean|Function|Object} required
 * @param {String} [message]
 * @return {SchemaType}
 * @api public
 */
SchemaType.prototype.required = function (required, message) {
  if (arguments.length > 0 && required == null) {
    _removeRequiredValidator(this);
    this.isRequired = false;
    delete this.originalRequiredValue;
    return this;
  }

  if (typeof required === 'object') {
    const opts = required;
    message = opts.message || message;
    required = opts.isRequired;
  }

  if (required === false) {
    _removeRequiredValidator(this);
    this.isRequired = false;
    delete this.originalRequiredValue;
    return this;
  }

  this.isRequired = true;
  this.requiredValidator = _requiredValidatorFactory(this, required);
  this.originalRequiredValue = required;

  if (typeof required === 'string') {
    message = required;
    required = undefined;
  }

  _addRequiredValidator(this, required, message);
  return this;
};

/**
 * Set the model that this path refers to.
 *
 * @param {String|Model|Function} ref
 * @return {SchemaType}
 * @api public
 */
SchemaType.prototype.ref = function (ref) {
  this.options.ref = ref;
  return this;
};

/**
 * Get the default value.
 *
 * @param {Object} scope
 * @param {Boolean} init
 * @return {*}
 * @api private
 */
SchemaType.prototype.getDefault = function (scope, init) {
  let ret = typeof this.defaultValue === 'function' ?
    this.defaultValue.call(scope) :
    this.defaultValue;

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
 * @api private
 */
SchemaType.prototype._applySetters = function (value, scope, init) {
  if (init) return value;
  let v = value;
  const setters = this.setters;
  for (let i = setters.length - 1; i >= 0; i--) {
    v = setters[i].call(scope, v, this);
  }
  return v;
};

SchemaType.prototype._castNullish = function (v) {
  return v;
};

/**
 * Applies setters and then casts.
 *
 * @param {any} value
 * @param {Object} scope
 * @param {Boolean} init
 * @api private
 */
SchemaType.prototype.applySetters = function (value, scope, init, priorVal, options) {
  let v = this._applySetters(value, scope, init, priorVal, options);
  if (v == null) return this._castNullish(v);
  v = this.cast(v, scope, init, priorVal, options);
  return v;
};

/**
 * Applies getters.
 *
 * @param {any} value
 * @param {Object} scope
 * @api private
 */
SchemaType.prototype.applyGetters = function (value, scope) {
  let v = value;
  const getters = this.getters;
  const len = getters.length;
  if (len === 0) return v;
  for (let i = 0; i < len; ++i) {
    v = getters[i].call(scope, v, this);
  }
  return v;
};

/**
 * Set default `select()` behavior.
 *
 * @param {Boolean} val
 * @return {SchemaType}
 * @api public
 */
SchemaType.prototype.select = function (val) {
  this.selected = !!val;
  return this;
};

/* ---------- Validation Execution Helpers ---------- */

/**
 * Retrieve a clean array of validator objects.
 *
 * @param {SchemaType} self
 * @returns {Array}
 */
function _getValidatorList(self) {
  return self.validators.filter(v => v != null && typeof v === 'object');
}

/**
 * Execute a single validator synchronously.
 *
 * @param {Object} v
 * @param {any} value
 * @param {Object} scope
 * @param {String} path
 * @param {Object} options
 * @returns {Promise|undefined}
 */
function _executeValidator(v, value, scope, path, options) {
  const validator = v.validator;
  const props = utils.clone(v);
  props.path = options && options.path ? options.path : path;
  props.value = value;

  if (validator instanceof RegExp) {
    return validator.test(value) ? null : props;
  }
  if (typeof validator !== 'function') return null;
  if (value === undefined && validator !== scope.requiredValidator) {
    return null;
  }

  try {
    if (props.propsParameter) {
      return validator.call(scope, value, props);
    }
    return validator.call(scope, value);
  } catch (err) {
    props.reason = err;
    if (err.message) props.message = err.message;
    return false;
  }
}

/**
 * Convert validator result to error or continue.
 *
 * @param {any} result
 * @param {Object} vProps
 * @param {Function} done
 */
function _handleValidatorResult(result, vProps, done) {
  if (result == null) {
    done(null);
    return;
  }
  if (result && typeof result.then === 'function') {
    result.then(
      ok => _handleValidatorResult(ok, vProps, done),
      err => {
        vProps.reason = err;
        vProps.message = err.message;
        _handleValidatorResult(false, vProps, done);
      });
    return;
  }
  if (result) {
    done(null);
  } else {
    const ErrCtor = vProps.ErrorConstructor || ValidatorError;
    const err = new ErrCtor(vProps);
    err[validatorErrorSymbol] = true;
    done(err);
  }
}

/**
 * Perform async validation of a single validator.
 *
 * @param {Object} v
 * @param {any} value
 * @param {Object} scope
 * @param {String} path
 * @param {Object} options
 * @param {Function} cb
 */
function _runAsyncValidator(v, value, scope, path, options, cb) {
  const validator = v.validator;
  const props = utils.clone(v);
  props.path = options && options.path ? options.path : path;
  props.value = value;

  asyncValidate(validator, scope, value, props, (ok, p) => {
    if (!ok) {
      const ErrCtor = p.ErrorConstructor || ValidatorError;
      const err = new ErrCtor(p);
      err[validatorErrorSymbol] = true;
      return cb(err);
    }
    cb(null);
  });
}

/**
 * Core validation loop.
 *
 * @param {SchemaType} self
 * @param {any} value
 * @param {Function} fn
 * @param {Object} scope
 * @param {Object} options
 */
function _validateLoop(self, value, fn, scope, options) {
  const validators = _getValidatorList(self);
  if (validators.length === 0) return fn(null);
  let remaining = validators.length;
  let finished = false;

  function done(err) {
    if (finished) return;
    if (err) {
      finished = true;
      return fn(err);
    }
    if (--remaining === 0) {
      finished = true;
      fn(null);
    }
  }

  validators.forEach(v => {
    if (finished) return;
    if (v.isAsync) {
      _runAsyncValidator(v, value, scope, self.path, options, done);
    } else {
      const result = _executeValidator(v, value, scope, self.path, options);
      if (result && typeof result.then === 'function') {
        result.then(ok => _handleValidatorResult(ok, v, done), err => {
          v.reason = err;
          v.message = err.message;
          _handleValidatorResult(false, v, done);
        });
      } else {
        _handleValidatorResult(result, v, done);
      }
    }
  });
}

/**
 * Performs a validation of `value` using the validators declared for this SchemaType.
 *
 * @param {any} value
 * @param {Function} fn
 * @param {Object} scope
 * @api private
 */
SchemaType.prototype.doValidate = function (value, fn, scope, options) {
  _validateLoop(this, value, fn, scope, options);
};

/*!
 * Handle async validators
 */
function asyncValidate(validator, scope, value, props, cb) {
  let called = false;
  const ret = validator.call(scope, value, function (ok, customMsg) {
    if (called) return;
    called = true;
    if (customMsg) props.message = customMsg;
    cb(ok, props);
  });
  if (typeof ret === 'boolean') {
    called = true;
    cb(ret, props);
  } else if (ret && typeof ret.then === 'function') {
    ret.then(
      ok => {
        if (called) return;
        called = true;
        cb(ok, props);
      },
      err => {
        if (called) return;
        called = true;
        props.reason = err;
        props.message = err.message;
        cb(false, props);
      });
  }
}

/**
 * Synchronous validation (ignores async validators).
 *
 * @param {any} value
 * @param {Object} scope
 * @return {MongooseError|undefined}
 * @api private
 */
SchemaType.prototype.doValidateSync = function (value, scope, options) {
  const path = this.path;
  const validators = this.validators;
  if (!validators.length) return null;

  let targetValidators = validators;
  if (value === void 0) {
    if (validators[0].type === 'required') {
      targetValidators = [validators[0]];
    } else {
      return null;
    }
  }

  let err = null;
  for (const v of targetValidators) {
    if (err) break;
    if (!v || typeof v !== 'object') continue;
    if (v.isAsync) continue;
    if (v.validator instanceof RegExp) {
      if (!v.validator.test(value)) {
        err = new (v.ErrorConstructor || ValidatorError)(v);
        err[validatorErrorSymbol] = true;
      }
      continue;
    }
    if (typeof v.validator !== 'function') continue;

    let ok;
    const props = utils.clone(v);
    props.path = options && options.path ? options.path : path;
    props.value = value;
    try {
      ok = v.propsParameter ? v.validator.call(scope, value, props) : v.validator.call(scope, value);
    } catch (e) {
      ok = false;
      props.reason = e;
    }
    if (ok != null && typeof ok.then === 'function') continue;
    if (!ok) {
      err = new (v.ErrorConstructor || ValidatorError)(props);
      err[validatorErrorSymbol] = true;
    }
  }
  return err;
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
    if (value == null) return true;
    if (!Buffer.isBuffer(value) && value._bsontype !== 'Binary' && utils.isObject(value)) {
      return true;
    }
    return init;
  }
  return false;
};

/*!
 * ignore
 */
SchemaType.prototype._castRef = function (value, doc, init) {
  if (value == null) return value;
  if (value.$__ != null) {
    value.$__.wasPopulated = true;
    return value;
  }
  if (Buffer.isBuffer(value) || !utils.isObject(value)) {
    if (init) return value;
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
  if (!Array.isArray(val)) return [this.castForQuery(val)];
  return val.map(m => this.castForQuery(m));
}

/*!
 * Just like handleArray, except also allows `[]` because surprisingly
 * `$in: [1, []]` works fine
 */
function handle$in(val) {
  if (!Array.isArray(val)) return [this.castForQuery(val)];
  return val.map(m => (Array.isArray(m) && m.length === 0) ? m : this.castForQuery(m));
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
 * Cast the given value with optional query operator.
 *
 * @param {String} [$conditional]
 * @param {any} val
 * @api private
 */
SchemaType.prototype.castForQuery = function ($conditional, val) {
  if (arguments.length === 2) {
    const handler = this.$conditionalHandlers[$conditional];
    if (!handler) throw new Error('Can\'t use ' + $conditional);
    return handler.call(this, val);
  }
  return this._castForQuery($conditional);
};

/*!
 * Internal switch for runSetters
 * @api private
 */
SchemaType.prototype._castForQuery = function (val) {
  return this.applySetters(val, this.$$context);
};

/**
 * Override the function the required validator uses.
 *
 * @param {Function} fn
 * @static
 * @api public
 */
SchemaType.checkRequired = function (fn) {
  if (arguments.length > 0) this._checkRequired = fn;
  return this._checkRequired;
};

/**
 * Default required check.
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