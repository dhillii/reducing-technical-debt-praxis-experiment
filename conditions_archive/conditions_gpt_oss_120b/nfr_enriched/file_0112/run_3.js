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

  if (options.select == null) delete options.select;

  const Options = this.OptionsConstructor || SchemaTypeOptions;
  this.options = new Options(options);
  this._index = null;

  if (utils.hasUserDefinedProperty(this.options, 'immutable')) {
    this.$immutable = this.options.immutable;
    handleImmutable(this);
  }

  _applyOptionProperties(this, options);
  Object.defineProperty(this, '$$context', {
    enumerable: false,
    configurable: false,
    writable: true,
    value: null
  });
}

/**
 * Apply option properties (cast, index, default, etc.) to the schema type.
 * @private
 */
function _applyOptionProperties(self, options) {
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

/**
 * Handles the special case where both `index` and `unique`/`sparse` are set.
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
 * @static
 */
SchemaType.cast = function (caster) {
  if (arguments.length === 0) return this._cast;
  if (caster === false) caster = v => v;
  this._cast = caster;
  return this._cast;
};

/**
 * Get/set the function used to cast arbitrary values to this particular schematype instance.
 * @instance
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
 * @instance
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
  }
  if (arguments.length > 1) {
    this.defaultValue = utils.args(arguments);
  }
  return this.defaultValue;
};

/**
 * Declares the index options for this schematype.
 * @instance
 */
SchemaType.prototype.index = function (options) {
  this._index = options;
  utils.expires(this._index);
  return this;
};

/**
 * Declares an unique index.
 * @instance
 */
SchemaType.prototype.unique = function (bool) {
  if (this._index === false) {
    if (!bool) return;
    throw new Error(
      `Path "${this.path}" may not have \`index\` set to false and \`unique\` set to true`
    );
  }
  if (this._index == null || this._index === true) this._index = {};
  else if (typeof this._index === 'string') this._index = { type: this._index };
  this._index.unique = bool;
  return this;
};

/**
 * Declares a full text index.
 * @instance
 */
SchemaType.prototype.text = function (bool) {
  if (this._index === false) {
    if (!bool) return;
    throw new Error(
      `Path "${this.path}" may not have \`index\` set to false and \`text\` set to true`
    );
  }
  if (this._index == null || typeof this._index === 'boolean') this._index = {};
  else if (typeof this._index === 'string') this._index = { type: this._index };
  this._index.text = bool;
  return this;
};

/**
 * Declares a sparse index.
 * @instance
 */
SchemaType.prototype.sparse = function (bool) {
  if (this._index === false) {
    if (!bool) return;
    throw new Error(
      `Path "${this.path}" may not have \`index\` set to false and \`sparse\` set to true`
    );
  }
  if (this._index == null || typeof this._index === 'boolean') this._index = {};
  else if (typeof this._index === 'string') this._index = { type: this._index };
  this._index.sparse = bool;
  return this;
};

/**
 * Defines this path as immutable.
 * @instance
 */
SchemaType.prototype.immutable = function (bool) {
  this.$immutable = bool;
  handleImmutable(this);
  return this;
};

/**
 * Defines a custom function for transforming this path when converting a document to JSON.
 * @instance
 */
SchemaType.prototype.transform = function (fn) {
  this.options.transform = fn;
  return this;
};

/**
 * Adds a setter to this schematype.
 * @instance
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
 * @instance
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
 * @instance
 */
SchemaType.prototype.validate = function (obj, message, type) {
  if (typeof obj === 'function' || (obj && utils.getFunctionName(obj.constructor) === 'RegExp')) {
    const properties = _buildValidatorProperties(this, obj, message, type);
    if (properties.isAsync) handleIsAsync();
    this.validators.push(properties);
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

/**
 * Build validator property object from arguments.
 * @private
 */
function _buildValidatorProperties(self, obj, message, type) {
  let props;
  if (typeof message === 'function') {
    props = { validator: obj, message };
    props.type = type || 'user defined';
  } else if (message instanceof Object && !type) {
    props = utils.clone(message);
    if (!props.message) props.message = props.msg;
    props.validator = obj;
    props.type = props.type || 'user defined';
  } else {
    if (message == null) message = MongooseError.messages.general.default;
    if (!type) type = 'user defined';
    props = { message, type, validator: obj };
  }
  return props;
}

/**
 * Adds a required validator to this SchemaType.
 * @instance
 */
SchemaType.prototype.required = function (required, message) {
  if (arguments.length > 0 && required == null) {
    return _removeRequiredValidator(this);
  }

  if (typeof required === 'object') {
    const custom = required;
    message = custom.message || message;
    required = custom.isRequired;
  }

  if (required === false) {
    return _removeRequiredValidator(this);
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

/**
 * Remove any existing required validator.
 * @private
 */
function _removeRequiredValidator(self) {
  self.validators = self.validators.filter(v => v.validator !== self.requiredValidator);
  self.isRequired = false;
  delete self.originalRequiredValue;
  return self;
}

/**
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
};

/**
 * Performs a validation of `value` using the validators declared for this SchemaType.
 * @instance
 */
SchemaType.prototype.doValidate = function (value, fn, scope, options) {
  const validators = this.validators.filter(v => v != null && typeof v === 'object');
  if (!validators.length) return fn(null);

  const context = { err: false, remaining: validators.length, path: this.path };
  validators.forEach(v => _processValidator(this, v, value, fn, scope, options, context));
};

/**
 * Process a single validator.
 * @private
 */
function _processValidator(self, validatorObj, value, callback, scope, options, ctx) {
  if (ctx.err) return;
  const validator = validatorObj.validator;
  const props = utils.clone(validatorObj);
  props.path = options && options.path ? options.path : ctx.path;
  props.value = value;

  if (validator instanceof RegExp) {
    _finalizeValidate(self, validator.test(value), props, callback, ctx);
    return;
  }
  if (typeof validator !== 'function') {
    _finalizeValidate(self, true, props, callback, ctx);
    return;
  }
  if (value === undefined && validator !== self.requiredValidator) {
    _finalizeValidate(self, true, props, callback, ctx);
    return;
  }
  if (props.isAsync) {
    asyncValidate(validator, scope, value, props, (ok, p) => _finalizeValidate(self, ok, p, callback, ctx));
    return;
  }

  let ok;
  try {
    ok = props.propsParameter ? validator.call(scope, value, props) : validator.call(scope, value);
  } catch (error) {
    ok = false;
    props.reason = error;
    if (error.message) props.message = error.message;
  }

  if (ok != null && typeof ok.then === 'function') {
    ok.then(
      res => _finalizeValidate(self, res, props, callback, ctx),
      err => {
        props.reason = err;
        props.message = err.message;
        _finalizeValidate(self, false, props, callback, ctx);
      }
    );
  } else {
    _finalizeValidate(self, ok, props, callback, ctx);
  }
}

/**
 * Finalize validation result for a validator.
 * @private
 */
function _finalizeValidate(self, ok, props, callback, ctx) {
  if (ctx.err) return;
  if (ok === undefined || ok) {
    if (--ctx.remaining === 0) {
      immediate(() => callback(null));
    }
    return;
  }
  const ErrCtor = props.ErrorConstructor || ValidatorError;
  ctx.err = new ErrCtor(props);
  ctx.err[validatorErrorSymbol] = true;
  immediate(() => callback(ctx.err));
}

/**
 * Handles async validators.
 * @private
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
 * @instance
 */
SchemaType.prototype.doValidateSync = function (value, scope, options) {
  const path = this.path;
  const count = this.validators.length;
  if (!count) return null;

  let validators = this.validators;
  if (value === void 0) {
    if (validators[0] && validators[0].type === 'required') {
      validators = [validators[0]];
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
      _syncValidateResult(validator.test(value), props);
      return;
    }
    if (typeof validator !== 'function') return;

    let ok;
    try {
      ok = props.propsParameter ? validator.call(scope, value, props) : validator.call(scope, value);
    } catch (error) {
      ok = false;
      props.reason = error;
    }

    if (ok != null && typeof ok.then === 'function') return;
    _syncValidateResult(ok, props);
  });

  return err;

  function _syncValidateResult(ok, props) {
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
 * @static
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
  return val.map(m => (Array.isArray(m) && m.length === 0 ? m : this.castForQuery(m)));
}

/*!
 * ignore
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
 * @instance
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
 * Internal switch for runSetters
 */
SchemaType.prototype._castForQuery = function (val) {
  return this.applySetters(val, this.$$context);
};

/**
 * Override the function the required validator uses to check whether a value passes the `required` check.
 * @static
 */
SchemaType.checkRequired = function (fn) {
  if (arguments.length > 0) this._checkRequired = fn;
  return this._checkRequired;
};

/**
 * Default check for if this path satisfies the `required` validator.
 * @instance
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
 * ignore
 */
const handleIsAsync = util.deprecate(
  function () { },
  'Mongoose: the `isAsync` option for custom validators is deprecated. Make ' +
  'your async validators return a promise instead: ' +
  'https://mongoosejs.com/docs/validation.html#async-custom-validators'
);

/*!
 * Module exports.
 */
module.exports = exports = SchemaType;
exports.CastError = CastError;
exports.ValidatorError = ValidatorError;