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

  _applySchemaOptions(this, options);
  Object.defineProperty(this, '$$context', {
    enumerable: false,
    configurable: false,
    writable: true,
    value: null
  });
}

/*!
 * Apply schema options to a SchemaType instance.
 * @private
 */
function _applySchemaOptions(self, options) {
  const keys = Object.keys(self.options);
  for (const prop of keys) {
    if (prop === 'cast') {
      self.castFunction(self.options[prop]);
      continue;
    }
    if (!utils.hasUserDefinedProperty(self.options, prop) ||
        typeof self[prop] !== 'function') {
      continue;
    }

    if (prop === 'index' && self._index) {
      _handleIndexOption(self, options);
      continue;
    }

    const val = options[prop];
    if (prop === 'default') {
      self.default(val);
      continue;
    }

    const args = Array.isArray(val) ? val : [val];
    self[prop].apply(self, args);
  }
}

/*!
 * Handle special case for the `index` option.
 * @private
 */
function _handleIndexOption(self, options) {
  if (options.index === false) {
    const index = self._index;
    if (typeof index === 'object' && index != null) {
      if (index.unique) {
        throw new Error(
          `Path "${self.path}" may not have \`index\` set to false and \`unique\` set to true`
        );
      }
      if (index.sparse) {
        throw new Error(
          `Path "${self.path}" may not have \`index\` set to false and \`sparse\` set to true`
        );
      }
    }
    self._index = false;
  }
}

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
 * @static
 * @param {Function|false} [caster]
 * @return {Function}
 * @api public
 */
SchemaType.cast = function (caster) {
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
 * @param {Function|false} [caster]
 * @return {Function}
 * @api public
 */
SchemaType.prototype.castFunction = function (caster) {
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
 * Base cast implementation – must be overridden by subclasses.
 */
SchemaType.prototype.cast = function () {
  throw new Error('Base SchemaType class does not implement a `cast()` function');
};

/**
 * Set a default option for this schema type.
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
 * @static
 */
SchemaType.get = function (getter) {
  this.getters = this.hasOwnProperty('getters') ? this.getters : [];
  this.getters.push(getter);
};

/**
 * Set a default value for this SchemaType.
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
      throw new MongooseError(
        `Cannot set default value of path \`${this.path}\` to a mongoose Schema instance.`
      );
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
 * @param {Boolean} bool
 * @return {SchemaType}
 * @api public
 */
SchemaType.prototype.unique = function (bool) {
  if (this._index === false) {
    if (!bool) return;
    throw new Error(
      `Path "${this.path}" may not have \`index\` set to false and \`unique\` set to true`
    );
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
 * @param {Boolean} bool
 * @return {SchemaType}
 * @api public
 */
SchemaType.prototype.text = function (bool) {
  if (this._index === false) {
    if (!bool) return;
    throw new Error(
      `Path "${this.path}" may not have \`index\` set to false and \`text\` set to true`
    );
  }
  if (this._index == null || typeof this._index === 'boolean') {
    this._index = {};
  } else if (typeof this._index === 'string') {
    this._index = { type: this._index };
  }
  this._index.text = bool;
  return this;
};

/**
 * Declare a sparse index.
 * @param {Boolean} bool
 * @return {SchemaType}
 * @api public
 */
SchemaType.prototype.sparse = function (bool) {
  if (this._index === false) {
    if (!bool) return;
    throw new Error(
      `Path "${this.path}" may not have \`index\` set to false and \`sparse\` set to true`
    );
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
 * Add validator(s).
 * @param {RegExp|Function|Object} obj
 * @param {Function|String|Object} [message]
 * @param {String} [type]
 * @return {SchemaType}
 * @api public
 */
SchemaType.prototype.validate = function (obj, message, type) {
  if (typeof obj === 'function' || (obj && utils.getFunctionName(obj.constructor) === 'RegExp')) {
    const props = _buildValidatorProperties(this, obj, message, type);
    if (props.isAsync) {
      handleIsAsync();
    }
    this.validators.push(props);
    return this;
  }

  for (let i = 0; i < arguments.length; ++i) {
    const arg = arguments[i];
    if (!utils.isPOJO(arg)) {
      throw new Error(
        `Invalid validator. Received (${typeof arg}) ${arg}. See http://mongoosejs.com/docs/api.html#schematype_SchemaType-validate`
      );
    }
    this.validate(arg.validator, arg);
  }
  return this;
};

/*!
 * Build validator property object.
 * @private
 */
function _buildValidatorProperties(self, obj, message, type) {
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
    properties = { message, type, validator: obj };
  }
  return properties;
}

/*!
 * ignore
 */
const handleIsAsync = util.deprecate(
  function () {},
  'Mongoose: the `isAsync` option for custom validators is deprecated. Make ' +
    'your async validators return a promise instead: ' +
    'https://mongoosejs.com/docs/validation.html#async-custom-validators'
);

/**
 * Add a required validator.
 * @param {Boolean|Function|Object} required
 * @param {String|Function} [message]
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
    const customOptions = required;
    message = customOptions.message || message;
    required = customOptions.isRequired;
  }

  if (required === false) {
    _removeRequiredValidator(this);
    this.isRequired = false;
    delete this.originalRequiredValue;
    return this;
  }

  this.isRequired = true;
  this.requiredValidator = _createRequiredValidator(this, required);
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

/*!
 * Remove existing required validator.
 * @private
 */
function _removeRequiredValidator(self) {
  self.validators = self.validators.filter(v => v.validator !== self.requiredValidator);
}

/*!
 * Create the required validator function.
 * @private
 */
function _createRequiredValidator(self, required) {
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
 * Set the model that this path refers to.
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
 * Apply setters without casting.
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
 * Apply setters and then cast.
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
 * Apply getters.
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
 * @param {Boolean} val
 * @return {SchemaType}
 * @api public
 */
SchemaType.prototype.select = function (val) {
  this.selected = !!val;
  return this;
};

/**
 * Perform async validation.
 * @api private
 */
SchemaType.prototype.doValidate = function (value, fn, scope, options) {
  const validators = this.validators.filter(v => v && typeof v === 'object');
  if (!validators.length) return fn(null);
  let pending = validators.length;
  let err = false;
  const path = this.path;
  const self = this;

  validators.forEach(v => {
    if (err) return;
    _runValidator(v, value, scope, path, options, self, (ok, props) => {
      if (err) return;
      if (ok === undefined || ok) {
        if (--pending === 0) {
          immediate(() => fn(null));
        }
      } else {
        err = new (props.ErrorConstructor || ValidatorError)(props);
        err[validatorErrorSymbol] = true;
        immediate(() => fn(err));
      }
    });
  });
};

/*!
 * Run a single validator and invoke callback with result.
 * @private
 */
function _runValidator(v, value, scope, path, options, self, cb) {
  const validator = v.validator;
  const props = utils.clone(v);
  props.path = options && options.path ? options.path : path;
  props.value = value;

  if (validator instanceof RegExp) {
    return cb(validator.test(value), props);
  }
  if (typeof validator !== 'function') {
    return cb(true, props);
  }
  if (value === undefined && validator !== self.requiredValidator) {
    return cb(true, props);
  }
  if (props.isAsync) {
    return asyncValidate(validator, scope, value, props, cb);
  }

  try {
    const ok = props.propsParameter
      ? validator.call(scope, value, props)
      : validator.call(scope, value);
    if (ok != null && typeof ok.then === 'function') {
      ok.then(res => cb(res, props), err => {
        props.reason = err;
        props.message = err.message;
        cb(false, props);
      });
    } else {
      cb(ok, props);
    }
  } catch (error) {
    props.reason = error;
    if (error.message) props.message = error.message;
    cb(false, props);
  }
}

/**
 * Perform synchronous validation (ignores async validators).
 * @api private
 */
SchemaType.prototype.doValidateSync = function (value, scope, options) {
  const path = this.path;
  const count = this.validators.length;
  if (!count) return null;

  let validators = this.validators;
  if (value === void 0) {
    if (this.validators[0] && this.validators[0].type === 'required') {
      validators = [this.validators[0]];
    } else {
      return null;
    }
  }

  let err = null;
  validators.forEach(v => {
    if (err) return;
    if (!v || typeof v !== 'object') return;
    const validator = v.validator;
    const props = utils.clone(v);
    props.path = options && options.path ? options.path : path;
    props.value = value;

    if (validator.isAsync) return;
    if (validator instanceof RegExp) {
      _syncValidate(validator.test(value), props);
      return;
    }
    if (typeof validator !== 'function') return;

    try {
      const ok = props.propsParameter
        ? validator.call(scope, value, props)
        : validator.call(scope, value);
      if (ok != null && typeof ok.then === 'function') return;
      _syncValidate(ok, props);
    } catch (error) {
      _syncValidate(false, Object.assign(props, { reason: error }));
    }
  });

  return err;

  function _syncValidate(ok, props) {
    if (err) return;
    if (ok !== undefined && !ok) {
      const ErrCtor = props.ErrorConstructor || ValidatorError;
      err = new ErrCtor(props);
      err[validatorErrorSymbol] = true;
    }
  }
};

/**
 * Determines if value is a valid Reference.
 * @private
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
function _handleSingle(val) {
  return this.castForQuery(val);
}

/*!
 * ignore
 */
function _handleArray(val) {
  if (!Array.isArray(val)) return [this.castForQuery(val)];
  return val.map(m => this.castForQuery(m));
}

/*!
 * ignore
 */
function _handleIn(val) {
  if (!Array.isArray(val)) return [this.castForQuery(val)];
  return val.map(m => (Array.isArray(m) && m.length === 0) ? m : this.castForQuery(m));
}

/*!
 * Conditional handlers map.
 */
SchemaType.prototype.$conditionalHandlers = {
  $all: _handleArray,
  $eq: _handleSingle,
  $in: _handleIn,
  $ne: _handleSingle,
  $nin: _handleIn,
  $exists,
  $type
};

/*!
 * Wrap `castForQuery` to handle context.
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
 * Cast for query.
 * @api private
 */
SchemaType.prototype.castForQuery = function ($conditional, val) {
  if (arguments.length === 2) {
    const handler = this.$conditionalHandlers[$conditional];
    if (!handler) throw new Error(`Can't use ${$conditional}`);
    return handler.call(this, val);
  }
  return this._castForQuery($conditional);
};

/*!
 * Internal switch for runSetters.
 */
SchemaType.prototype._castForQuery = function (val) {
  return this.applySetters(val, this.$$context);
};

/**
 * Override required check.
 * @static
 */
SchemaType.checkRequired = function (fn) {
  if (arguments.length > 0) this._checkRequired = fn;
  return this._checkRequired;
};

/**
 * Default required check.
 */
SchemaType.prototype.checkRequired = function (val) {
  return val != null;
};

/*!
 * Clone a SchemaType.
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