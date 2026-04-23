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
    if (!utils.hasUserDefinedProperty(this.options, prop) ||
        typeof this[prop] !== 'function') {
      continue;
    }

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
 * @param {Function|false} [caster]
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
 * @param {Function|false} [caster]
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
 * Base cast method – must be overridden by subclasses.
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
 * Declares the index options for this schematype.
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
 * Declares an unique index.
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
 * Declares a full text index.
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
 * Declares a sparse index.
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
 * Defines this path as immutable.
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
 * Defines a custom transform for JSON output.
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
 * Adds a setter.
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
 * Adds a getter.
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

/**
 * Adds validator(s) for this document path.
 *
 * @param {RegExp|Function|Object} obj
 * @param {Function|Object} [message]
 * @param {String} [type]
 * @return {SchemaType}
 * @api public
 */
SchemaType.prototype.validate = function (obj, message, type) {
  if (typeof obj === 'function' || (obj && utils.getFunctionName(obj.constructor) === 'RegExp')) {
    this._addValidator(obj, message, type);
    return this;
  }
  // Assume array of validator objects
  for (const arg of arguments) {
    if (!utils.isPOJO(arg)) {
      throw new Error('Invalid validator. Received (' + typeof arg + ') ' + arg +
        '. See http://mongoosejs.com/docs/api.html#schematype_SchemaType-validate');
    }
    this.validate(arg.validator, arg);
  }
  return this;
};

/**
 * Internal helper to add a single validator.
 *
 * @param {RegExp|Function} validator
 * @param {Function|Object} [msgOrOpts]
 * @param {String} [type]
 * @private
 */
SchemaType.prototype._addValidator = function (validator, msgOrOpts, type) {
  let properties = {};

  if (typeof msgOrOpts === 'function') {
    properties = { validator, message: msgOrOpts };
    properties.type = type || 'user defined';
  } else if (msgOrOpts instanceof Object && !type) {
    properties = utils.clone(msgOrOpts);
    properties.message = properties.message || properties.msg;
    properties.validator = validator;
    properties.type = properties.type || 'user defined';
  } else {
    if (msgOrOpts == null) {
      msgOrOpts = MongooseError.messages.general.default;
    }
    if (!type) type = 'user defined';
    properties = { validator, message: msgOrOpts, type };
  }

  if (properties.isAsync) {
    handleIsAsync();
  }

  this.validators.push(properties);
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
 * Adds a required validator.
 *
 * @param {Boolean|Function|Object} required
 * @param {String} [message]
 * @return {SchemaType}
 * @api public
 */
SchemaType.prototype.required = function (required, message) {
  if (arguments.length > 0 && required == null) {
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

  const _this = this;
  this.isRequired = true;
  this.requiredValidator = function (v) {
    const cached = get(this, '$__.cachedRequired');

    if (cached != null && !_this._isPathSelected(this) && !this[documentIsModified](_this.path)) {
      return true;
    }

    if (cached != null && _this.path in cached) {
      const res = cached[_this.path] ? _this.checkRequired(v, this) : true;
      delete cached[_this.path];
      return res;
    }

    if (typeof required === 'function') {
      return required.apply(this) ? _this.checkRequired(v, this) : true;
    }

    return _this.checkRequired(v, this);
  };
  this.originalRequiredValue = required;

  if (typeof required === 'string') {
    message = required;
    required = undefined;
  }

  const msg = message || MongooseError.messages.general.required;
  this.validators.unshift(Object.assign({}, { validator: this.requiredValidator, message: msg, type: 'required' }));
  return this;
};

/**
 * Helper to determine if the path is selected in the query.
 *
 * @private
 */
SchemaType.prototype._isPathSelected = function (doc) {
  return doc.$__isSelected(this.path);
};

/**
 * Helper to remove required validator.
 *
 * @private
 */
SchemaType.prototype._removeRequiredValidator = function () {
  this.validators = this.validators.filter(v => v.validator !== this.requiredValidator);
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
 * Gets the default value.
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

SchemaType.prototype._castNullish = function (v) {
  return v;
};

/**
 * Applies setters and then casts.
 *
 * @param {Object} value
 * @param {Object} scope
 * @param {Boolean} init
 * @api private
 */
SchemaType.prototype.applySetters = function (value, scope, init, priorVal, options) {
  const v = this._applySetters(value, scope, init, priorVal, options);
  if (v == null) return this._castNullish(v);
  return this.cast(v, scope, init, priorVal, options);
};

/**
 * Applies getters to a value.
 *
 * @param {Object} value
 * @param {Object} scope
 * @api private
 */
SchemaType.prototype.applyGetters = function (value, scope) {
  let v = value;
  const getters = this.getters;
  const len = getters.length;
  if (!len) return v;
  for (let i = 0; i < len; ++i) {
    v = getters[i].call(scope, v, this);
  }
  return v;
};

/**
 * Sets default `select()` behavior for this path.
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
 * Performs validation of `value` using the validators declared for this SchemaType.
 *
 * @param {any} value
 * @param {Function} fn
 * @param {Object} scope
 * @api private
 */
SchemaType.prototype.doValidate = function (value, fn, scope, options) {
  const path = this.path;
  const validators = this.validators.filter(v => v && typeof v === 'object');
  if (!validators.length) return fn(null);

  let pending = validators.length;
  let finished = false;

  const done = err => {
    if (finished) return;
    finished = true;
    fn(err);
  };

  for (const v of validators) {
    if (finished) break;
    this._runValidator(v, value, scope, options, (err, ok) => {
      if (err) return done(err);
      if (!ok) {
        const ErrorConstructor = v.ErrorConstructor || ValidatorError;
        const err = new ErrorConstructor(v);
        err[validatorErrorSymbol] = true;
        return done(err);
      }
      if (--pending === 0) done(null);
    });
  }
};

/**
 * Internal validator runner.
 *
 * @private
 */
SchemaType.prototype._runValidator = function (v, value, scope, options, cb) {
  const validator = v.validator;
  const props = utils.clone(v);
  props.path = (options && options.path) ? options.path : this.path;
  props.value = value;

  if (validator instanceof RegExp) {
    return cb(null, validator.test(value));
  }

  if (typeof validator !== 'function') {
    return cb(null, true);
  }

  if (value === undefined && validator !== this.requiredValidator) {
    return cb(null, true);
  }

  if (props.isAsync) {
    return asyncValidate(validator, scope, value, props, cb);
  }

  try {
    const result = props.propsParameter
      ? validator.call(scope, value, props)
      : validator.call(scope, value);
    if (result && typeof result.then === 'function') {
      result.then(
        ok => cb(null, ok),
        err => {
          props.reason = err;
          props.message = err.message;
          cb(null, false);
        }
      );
    } else {
      cb(null, result);
    }
  } catch (error) {
    props.reason = error;
    if (error.message) props.message = error.message;
    cb(null, false);
  }
};

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

  const filtered = (value === void 0 && validators[0] && validators[0].type === 'required')
    ? [validators[0]]
    : validators;

  for (const v of filtered) {
    if (!v || typeof v !== 'object') continue;
    if (v.validator && v.validator.isAsync) continue;

    const props = utils.clone(v);
    props.path = (options && options.path) ? options.path : path;
    props.value = value;

    if (v.validator instanceof RegExp) {
      if (!v.validator.test(value)) return new (v.ErrorConstructor || ValidatorError)(props);
      continue;
    }

    if (typeof v.validator !== 'function') continue;

    try {
      const ok = props.propsParameter
        ? v.validator.call(scope, value, props)
        : v.validator.call(scope, value);
      if (ok && typeof ok.then === 'function') continue;
      if (ok !== undefined && !ok) {
        return new (v.ErrorConstructor || ValidatorError)(props);
      }
    } catch (error) {
      return new (v.ErrorConstructor || ValidatorError)({ ...props, reason: error });
    }
  }
  return null;
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
  if (!ref && doc && doc.$__) {
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
  if (value.$__) {
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
 * Cast the given value with the given optional query operator.
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
 * @static
 * @api public
 */
SchemaType.checkRequired = function (fn) {
  if (arguments.length > 0) this._checkRequired = fn;
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