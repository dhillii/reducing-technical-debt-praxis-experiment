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
  this.getters = this.constructor.hasOwnProperty('getters')
    ? this.constructor.getters.slice()
    : [];
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

  for (const prop of Object.keys(this.options)) {
    if (prop === 'cast') {
      this.castFunction(this.options[prop]);
      continue;
    }
    if (utils.hasUserDefinedProperty(this.options, prop) && typeof this[prop] === 'function') {
      if (prop === 'index' && this._index) {
        this._handleIndexOption(options);
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
  this._cast = caster === false ? v => v : caster;
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
  this._castFunction = caster === false
    ? this.constructor._defaultCaster || (v => v)
    : caster;
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
 * @static
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
 * @static
 */
SchemaType.get = function (getter) {
  this.getters = this.hasOwnProperty('getters') ? this.getters : [];
  this.getters.push(getter);
};

/**
 * Set a default value for this SchemaType.
 *
 * @param {Function|any} val
 * @return {any}
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
  }
  if (arguments.length > 1) {
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
  if (this._index == null || this._index === true) this._index = {};
  else if (typeof this._index === 'string') this._index = { type: this._index };
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
  if (this._index == null || typeof this._index === 'boolean') this._index = {};
  else if (typeof this._index === 'string') this._index = { type: this._index };
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
  if (this._index == null || typeof this._index === 'boolean') this._index = {};
  else if (typeof this._index === 'string') this._index = { type: this._index };
  this._index.sparse = bool;
  return this;
};

/**
 * Define immutable path.
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
 * Define custom JSON transform.
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
  if (typeof fn !== 'function') throw new TypeError('A setter must be a function.');
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
  if (typeof fn !== 'function') throw new TypeError('A getter must be a function.');
  this.getters.push(fn);
  return this;
};

/**
 * Add validator(s) for this document path.
 *
 * @param {RegExp|Function|Object} obj
 * @param {Function|Object} [message]
 * @param {String} [type]
 * @return {SchemaType}
 * @api public
 */
SchemaType.prototype.validate = function (obj, message, type) {
  if (this._isValidatorSignature(obj, message, type)) {
    const props = this._buildValidatorProps(obj, message, type);
    if (props.isAsync) handleIsAsync();
    this.validators.push(props);
    return this;
  }

  // Treat arguments as an array of validator objects
  for (const arg of arguments) {
    if (!utils.isPOJO(arg)) {
      throw new Error(
        'Invalid validator. Received (' + typeof arg + ') ' + arg +
        '. See http://mongoosejs.com/docs/api.html#schematype_SchemaType-validate'
      );
    }
    this.validate(arg.validator, arg);
  }
  return this;
};

/**
 * Determine if arguments match the single‑validator signature.
 *
 * @private
 */
SchemaType.prototype._isValidatorSignature = function (obj, message, type) {
  return typeof obj === 'function' || (obj && utils.getFunctionName(obj.constructor) === 'RegExp');
};

/**
 * Build the validator property object from the supplied arguments.
 *
 * @private
 */
SchemaType.prototype._buildValidatorProps = function (validator, message, type) {
  let props;
  if (typeof message === 'function') {
    props = { validator, message };
    props.type = type || 'user defined';
  } else if (message instanceof Object && !type) {
    props = utils.clone(message);
    if (!props.message) props.message = props.msg;
    props.validator = validator;
    props.type = props.type || 'user defined';
  } else {
    if (message == null) message = MongooseError.messages.general.default;
    if (!type) type = 'user defined';
    props = { message, type, validator };
  }
  return props;
};

/**
 * Handle special logic for the `index` option.
 *
 * @private
 */
SchemaType.prototype._handleIndexOption = function (options) {
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
};

/*!
 * ignore
 */
const handleIsAsync = util.deprecate(
  function () { },
  'Mongoose: the `isAsync` option for custom validators is deprecated. Make ' +
  'your async validators return a promise instead: ' +
  'https://mongoosejs.com/docs/validation.html#async-custom-validators'
);

/**
 * Add a required validator.
 *
 * @param {Boolean|Function|Object} required
 * @param {String} [message]
 * @return {SchemaType}
 * @api public
 */
SchemaType.prototype.required = function (required, message) {
  if (required == null) {
    this._removeRequiredValidator();
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
    this._removeRequiredValidator();
    this.isRequired = false;
    delete this.originalRequiredValue;
    return this;
  }

  this.isRequired = true;
  this.requiredValidator = this._createRequiredValidator(required);
  this.originalRequiredValue = required;

  if (typeof required === 'string') {
    message = required;
    required = undefined;
  }

  const msg = message || MongooseError.messages.general.required;
  this.validators.unshift(Object.assign({}, {}, {
    validator: this.requiredValidator,
    message: msg,
    type: 'required'
  }));
  return this;
};

/**
 * Remove any existing required validator.
 *
 * @private
 */
SchemaType.prototype._removeRequiredValidator = function () {
  this.validators = this.validators.filter(v => v.validator !== this.requiredValidator);
};

/**
 * Create the required validator function.
 *
 * @private
 */
SchemaType.prototype._createRequiredValidator = function (required) {
  const self = this;
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
 * @api private
 */
SchemaType.prototype.getDefault = function (scope, init) {
  let ret = typeof this.defaultValue === 'function'
    ? this.defaultValue.call(scope)
    : this.defaultValue;

  if (ret != null) {
    if (typeof ret === 'object' && (!this.options || !this.options.shared)) {
      ret = utils.clone(ret);
    }
    const casted = this.applySetters(ret, scope, init);
    if (casted && casted.$isSingleNested) casted.$__parent = scope;
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
  if (init) return value;
  let v = value;
  for (let i = this.setters.length - 1; i >= 0; i--) {
    v = this.setters[i].call(scope, v, this);
  }
  return v;
};

/*!
 * ignore
 */
SchemaType.prototype._castNullish = function (v) {
  return v;
};

/**
 * Apply setters and then cast.
 *
 * @api private
 */
SchemaType.prototype.applySetters = function (value, scope, init) {
  const v = this._applySetters(value, scope, init);
  if (v == null) return this._castNullish(v);
  return this.cast(v, scope, init);
};

/**
 * Apply getters.
 *
 * @api private
 */
SchemaType.prototype.applyGetters = function (value, scope) {
  let v = value;
  for (const getter of this.getters) {
    v = getter.call(scope, v, this);
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

/**
 * Perform validation (async aware).
 *
 * @api private
 */
SchemaType.prototype.doValidate = function (value, fn, scope, options) {
  const path = this.path;
  const validators = this.validators.filter(v => v && typeof v === 'object');
  let remaining = validators.length;
  if (!remaining) return fn(null);

  const self = this;
  let errorOccurred = false;

  validators.forEach(v => {
    if (errorOccurred) return;

    const props = utils.clone(v);
    props.path = (options && options.path) || path;
    props.value = value;

    if (v.validator instanceof RegExp) {
      return _handleResult(v.validator.test(value), props);
    }

    if (typeof v.validator !== 'function') return;

    if (value === undefined && v.validator !== self.requiredValidator) {
      return _handleResult(true, props);
    }

    if (props.isAsync) {
      return asyncValidate(v.validator, scope, value, props, _handleResult);
    }

    let ok;
    try {
      ok = props.propsParameter
        ? v.validator.call(scope, value, props)
        : v.validator.call(scope, value);
    } catch (err) {
      ok = false;
      props.reason = err;
      if (err.message) props.message = err.message;
    }

    if (ok && typeof ok.then === 'function') {
      ok.then(
        res => _handleResult(res, props),
        err => {
          props.reason = err;
          props.message = err.message;
          _handleResult(false, props);
        }
      );
    } else {
      _handleResult(ok, props);
    }
  });

  function _handleResult(ok, props) {
    if (errorOccurred) return;
    if (ok === undefined || ok) {
      if (--remaining === 0) {
        immediate(() => fn(null));
      }
    } else {
      const ErrCtor = props.ErrorConstructor || ValidatorError;
      errorOccurred = new ErrCtor(props);
      errorOccurred[validatorErrorSymbol] = true;
      immediate(() => fn(errorOccurred));
    }
  }
};

/*!
 * Handle async validators
 */
function asyncValidate(validator, scope, value, props, cb) {
  let called = false;
  const ret = validator.call(scope, value, (ok, customMsg) => {
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
      }
    );
  }
}

/**
 * Synchronous validation (ignores async validators).
 *
 * @api private
 */
SchemaType.prototype.doValidateSync = function (value, scope, options) {
  const path = this.path;
  const count = this.validators.length;
  if (!count) return null;

  let validators = this.validators;
  if (value === void 0 && validators[0] && validators[0].type === 'required') {
    validators = [validators[0]];
  } else if (value === void 0) {
    return null;
  }

  let err = null;
  validators.forEach(v => {
    if (err) return;
    if (!v || typeof v !== 'object') return;

    const props = utils.clone(v);
    props.path = (options && options.path) || path;
    props.value = value;

    if (v.isAsync) return;

    if (v.validator instanceof RegExp) {
      return _checkResult(v.validator.test(value), props);
    }
    if (typeof v.validator !== 'function') return;

    let ok;
    try {
      ok = props.propsParameter
        ? v.validator.call(scope, value, props)
        : v.validator.call(scope, value);
    } catch (e) {
      ok = false;
      props.reason = e;
    }

    if (ok && typeof ok.then === 'function') return;
    _checkResult(ok, props);
  });

  return err;

  function _checkResult(ok, props) {
    if (err) return;
    if (ok !== undefined && !ok) {
      const ErrCtor = props.ErrorConstructor || ValidatorError;
      err = new ErrCtor(props);
      err[validatorErrorSymbol] = true;
    }
  }
};

/**
 * Determine if value is a valid Reference.
 *
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
    if (!Buffer.isBuffer(value) && value._bsontype !== 'Binary' && utils.isObject(value)) return true;
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
  if (!doc.$__.populated ||
    !doc.$__.populated[path] ||
    !doc.$__.populated[path].options ||
    !doc.$__.populated[path].options.options ||
    !doc.$__.populated[path].options.options.lean) {
    const ret = new pop.options[populateModelSymbol](value);
    ret.$__.wasPopulated = true;
    return ret;
  }
  return value;
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
  return val.map(m => (Array.isArray(m) && m.length === 0 ? m : this.castForQuery(m)));
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
  $exists,
  $type
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
 *
 * @api private
 */
SchemaType.prototype._castForQuery = function (val) {
  return this.applySetters(val, this.$$context);
};

/**
 * Override the function the required validator uses.
 *
 * @static
 */
SchemaType.checkRequired = function (fn) {
  if (arguments.length > 0) this._checkRequired = fn;
  return this._checkRequired;
};

/**
 * Default required check.
 *
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
  const clone = new this.constructor(this.path, options, this.instance);
  clone.validators = this.validators.slice();
  if (this.requiredValidator !== undefined) clone.requiredValidator = this.requiredValidator;
  if (this.defaultValue !== undefined) clone.defaultValue = this.defaultValue;
  if (this.$immutable !== undefined && this.options.immutable === undefined) {
    clone.$immutable = this.$immutable;
    handleImmutable(clone);
  }
  if (this._index !== undefined) clone._index = this._index;
  if (this.selected !== undefined) clone.selected = this.selected;
  if (this.isRequired !== undefined) clone.isRequired = this.isRequired;
  if (this.originalRequiredValue !== undefined) clone.originalRequiredValue = this.originalRequiredValue;
  clone.getters = this.getters.slice();
  clone.setters = this.setters.slice();
  return clone;
};

/*!
 * Module exports.
 */
module.exports = exports = SchemaType;
exports.CastError = CastError;
exports.ValidatorError = ValidatorError;