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
      this._applyOption(prop, this.options[prop]);
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
 * Apply a schema option (e.g. index, default, etc.) to the current instance.
 * @private
 */
SchemaType.prototype._applyOption = function (prop, val) {
  if (prop === 'index' && this._index) {
    this._handleIndexOption(val);
    return;
  }

  if (prop === 'default') {
    this.default(val);
    return;
  }

  const args = Array.isArray(val) ? val : [val];
  this[prop].apply(this, args);
};

/**
 * Handle special logic for the `index` option.
 * @private
 */
SchemaType.prototype._handleIndexOption = function (val) {
  if (this.options.index === false) {
    const index = this._index;
    if (typeof index === 'object' && index != null) {
      if (index.unique) {
        throw new Error(`Path "${this.path}" may not have \`index\` set to false and \`unique\` set to true`);
      }
      if (index.sparse) {
        throw new Error(`Path "${this.path}" may not have \`index\` set to false and \`sparse\` set to true`);
      }
    }
    this._index = false;
  }
};

/*!
 * Static cast getter/setter.
 */
SchemaType.cast = function (caster) {
  if (arguments.length === 0) return this._cast;
  this._cast = caster === false ? v => v : caster;
  return this._cast;
};

/*!
 * Instance cast getter/setter.
 */
SchemaType.prototype.castFunction = function (caster) {
  if (arguments.length === 0) return this._castFunction;
  this._castFunction = caster === false
    ? this.constructor._defaultCaster || (v => v)
    : caster;
  return this._castFunction;
};

/**
 * Base cast – must be overridden.
 */
SchemaType.prototype.cast = function () {
  throw new Error('Base SchemaType class does not implement a `cast()` function');
};

/**
 * Set a default option for this schema type.
 */
SchemaType.set = function (option, value) {
  if (!this.hasOwnProperty('defaultOptions')) {
    this.defaultOptions = Object.assign({}, this.defaultOptions);
  }
  this.defaultOptions[option] = value;
};

/**
 * Attach a getter for all instances of this schema type.
 */
SchemaType.get = function (getter) {
  this.getters = this.hasOwnProperty('getters') ? this.getters : [];
  this.getters.push(getter);
};

/**
 * Set a default value for this SchemaType.
 */
SchemaType.prototype.default = function (val) {
  if (arguments.length === 1) {
    if (val === void 0) {
      this.defaultValue = void 0;
      return void 0;
    }
    if (val != null && val.instanceOfSchema) {
      throw new MongooseError(`Cannot set default value of path \`${this.path}\` to a mongoose Schema instance.`);
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
 */
SchemaType.prototype.index = function (options) {
  this._index = options;
  utils.expires(this._index);
  return this;
};

/**
 * Declare a unique index.
 */
SchemaType.prototype.unique = function (bool) {
  if (this._index === false) {
    if (!bool) return;
    throw new Error(`Path "${this.path}" may not have \`index\` set to false and \`unique\` set to true`);
  }
  if (this._index == null || this._index === true) this._index = {};
  else if (typeof this._index === 'string') this._index = { type: this._index };
  this._index.unique = bool;
  return this;
};

/**
 * Declare a text index.
 */
SchemaType.prototype.text = function (bool) {
  if (this._index === false) {
    if (!bool) return;
    throw new Error(`Path "${this.path}" may not have \`index\` set to false and \`text\` set to true`);
  }
  if (this._index == null || typeof this._index === 'boolean') this._index = {};
  else if (typeof this._index === 'string') this._index = { type: this._index };
  this._index.text = bool;
  return this;
};

/**
 * Declare a sparse index.
 */
SchemaType.prototype.sparse = function (bool) {
  if (this._index === false) {
    if (!bool) return;
    throw new Error(`Path "${this.path}" may not have \`index\` set to false and \`sparse\` set to true`);
  }
  if (this._index == null || typeof this._index === 'boolean') this._index = {};
  else if (typeof this._index === 'string') this._index = { type: this._index };
  this._index.sparse = bool;
  return this;
};

/**
 * Define immutability.
 */
SchemaType.prototype.immutable = function (bool) {
  this.$immutable = bool;
  handleImmutable(this);
  return this;
};

/**
 * Define a transform for JSON output.
 */
SchemaType.prototype.transform = function (fn) {
  this.options.transform = fn;
  return this;
};

/**
 * Add a setter.
 */
SchemaType.prototype.set = function (fn) {
  if (typeof fn !== 'function') throw new TypeError('A setter must be a function.');
  this.setters.push(fn);
  return this;
};

/**
 * Add a getter.
 */
SchemaType.prototype.get = function (fn) {
  if (typeof fn !== 'function') throw new TypeError('A getter must be a function.');
  this.getters.push(fn);
  return this;
};

/**
 * Add validator(s) for this document path.
 */
SchemaType.prototype.validate = function (obj, message, type) {
  if (typeof obj === 'function' || (obj && utils.getFunctionName(obj.constructor) === 'RegExp')) {
    this._addSingleValidator(obj, message, type);
    return this;
  }

  // Assume array of validator objects
  for (const arg of arguments) {
    if (!utils.isPOJO(arg)) {
      throw new Error(`Invalid validator. Received (${typeof arg}) ${arg}. See http://mongoosejs.com/docs/api.html#schematype_SchemaType-validate`);
    }
    this.validate(arg.validator, arg);
  }
  return this;
};

/**
 * Internal helper to add a single validator.
 * @private
 */
SchemaType.prototype._addSingleValidator = function (obj, message, type) {
  let properties;

  if (typeof message === 'function') {
    properties = { validator: obj, message, type: type || 'user defined' };
  } else if (message instanceof Object && !type) {
    properties = utils.clone(message);
    properties.message = properties.message || properties.msg;
    properties.validator = obj;
    properties.type = properties.type || 'user defined';
  } else {
    if (message == null) message = MongooseError.messages.general.default;
    if (!type) type = 'user defined';
    properties = { validator: obj, message, type };
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
  function () {},
  'Mongoose: the `isAsync` option for custom validators is deprecated. Make your async validators return a promise instead: https://mongoosejs.com/docs/validation.html#async-custom-validators'
);

/**
 * Add a required validator.
 */
SchemaType.prototype.required = function (required, message) {
  if (arguments.length && required == null) {
    this._removeRequiredValidator();
    return this;
  }

  if (typeof required === 'object') {
    const customOptions = required;
    message = customOptions.message || message;
    required = customOptions.isRequired;
    this._addRequiredValidator(required, message, customOptions);
    return this;
  }

  if (required === false) {
    this._removeRequiredValidator();
    return this;
  }

  this._addRequiredValidator(required, message);
  return this;
};

/**
 * Internal: remove required validator.
 * @private
 */
SchemaType.prototype._removeRequiredValidator = function () {
  this.validators = this.validators.filter(v => v.validator !== this.requiredValidator);
  this.isRequired = false;
  delete this.originalRequiredValue;
};

/**
 * Internal: add required validator.
 * @private
 */
SchemaType.prototype._addRequiredValidator = function (required, message, customOptions = {}) {
  const _this = this;
  this.isRequired = true;

  this.requiredValidator = function (v) {
    const cached = get(this, '$__.cachedRequired');

    if (cached != null && !this.$__isSelected(_this.path) && !this[documentIsModified](_this.path)) {
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
  this.validators.unshift(Object.assign({}, customOptions, {
    validator: this.requiredValidator,
    message: msg,
    type: 'required'
  }));
};

/**
 * Set the model that this path refers to (populate).
 */
SchemaType.prototype.ref = function (ref) {
  this.options.ref = ref;
  return this;
};

/**
 * Get the default value.
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
 * Applies setters (including casting).
 */
SchemaType.prototype.applySetters = function (value, scope, init) {
  let v = this._applySetters(value, scope, init);
  if (v == null) return this._castNullish(v);
  v = this.cast(v, scope, init);
  return v;
};

/**
 * Applies getters.
 */
SchemaType.prototype.applyGetters = function (value, scope) {
  let v = value;
  for (const getter of this.getters) {
    v = getter.call(scope, v, this);
  }
  return v;
};

/**
 * Set default select behavior.
 */
SchemaType.prototype.select = function (val) {
  this.selected = !!val;
  return this;
};

/**
 * Perform validation (async aware).
 */
SchemaType.prototype.doValidate = function (value, fn, scope, options) {
  const validators = this.validators.filter(v => v && typeof v === 'object');
  if (!validators.length) return fn(null);

  let pending = validators.length;
  let finished = false;
  const path = this.path;

  const finish = err => {
    if (finished) return;
    finished = true;
    fn(err);
  };

  const onValidate = (ok, props) => {
    if (finished) return;
    if (ok === undefined || ok) {
      if (--pending === 0) immediate(() => finish(null));
    } else {
      const ErrCtor = props.ErrorConstructor || ValidatorError;
      const err = new ErrCtor(props);
      err[validatorErrorSymbol] = true;
      immediate(() => finish(err));
    }
  };

  for (const v of validators) {
    const validator = v.validator;
    const props = utils.clone(v);
    props.path = (options && options.path) || path;
    props.value = value;

    if (validator instanceof RegExp) {
      onValidate(validator.test(value), props);
      continue;
    }

    if (typeof validator !== 'function') {
      if (--pending === 0) immediate(() => finish(null));
      continue;
    }

    if (value === undefined && validator !== this.requiredValidator) {
      onValidate(true, props);
      continue;
    }

    if (props.isAsync) {
      asyncValidate(validator, scope, value, props, onValidate);
      continue;
    }

    let ok;
    try {
      ok = props.propsParameter
        ? validator.call(scope, value, props)
        : validator.call(scope, value);
    } catch (e) {
      ok = false;
      props.reason = e;
      if (e.message) props.message = e.message;
    }

    if (ok && typeof ok.then === 'function') {
      ok.then(
        res => onValidate(res, props),
        err => {
          props.reason = err;
          props.message = err.message;
          onValidate(false, props);
        }
      );
    } else {
      onValidate(ok, props);
    }
  }
};

/**
 * Async validator helper.
 */
function asyncValidate(validator, scope, value, props, cb) {
  let called = false;
  const result = validator.call(scope, value, (ok, customMsg) => {
    if (called) return;
    called = true;
    if (customMsg) props.message = customMsg;
    cb(ok, props);
  });

  if (typeof result === 'boolean') {
    called = true;
    cb(result, props);
  } else if (result && typeof result.then === 'function') {
    result.then(
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
 */
SchemaType.prototype.doValidateSync = function (value, scope, options) {
  const path = this.path;
  const validators = this._syncValidators(value);
  if (!validators.length) return null;

  for (const v of validators) {
    const validator = v.validator;
    const props = utils.clone(v);
    props.path = (options && options.path) || path;
    props.value = value;

    if (validator.isAsync) continue;
    if (validator instanceof RegExp) {
      if (!validator.test(value)) return this._makeSyncError(props);
      continue;
    }
    if (typeof validator !== 'function') continue;

    let ok;
    try {
      ok = props.propsParameter
        ? validator.call(scope, value, props)
        : validator.call(scope, value);
    } catch (e) {
      ok = false;
      props.reason = e;
    }

    if (ok && typeof ok.then === 'function') continue;
    if (ok !== undefined && !ok) return this._makeSyncError(props);
  }
  return null;
};

/**
 * Helper to filter validators for sync validation.
 * @private
 */
SchemaType.prototype._syncValidators = function (value) {
  if (value === void 0) {
    const first = this.validators[0];
    if (first && first.type === 'required') return [first];
    return [];
  }
  return this.validators;
};

/**
 * Helper to create a sync validation error.
 * @private
 */
SchemaType.prototype._makeSyncError = function (props) {
  const ErrCtor = props.ErrorConstructor || ValidatorError;
  const err = new ErrCtor(props);
  err[validatorErrorSymbol] = true;
  return err;
};

/**
 * Determines if value is a valid Reference.
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

/**
 * Cast a reference.
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

/**
 * Query casting helpers.
 */
function handleSingle(val) {
  return this.castForQuery(val);
}
function handleArray(val) {
  if (!Array.isArray(val)) return [this.castForQuery(val)];
  return val.map(m => this.castForQuery(m));
}
function handle$in(val) {
  if (!Array.isArray(val)) return [this.castForQuery(val)];
  return val.map(m => (Array.isArray(m) && m.length === 0 ? m : this.castForQuery(m)));
}
SchemaType.prototype.$conditionalHandlers = {
  $all: handleArray,
  $eq: handleSingle,
  $in: handle$in,
  $ne: handleSingle,
  $nin: handle$in,
  $exists,
  $type
};

/**
 * Wraps `castForQuery` to handle context.
 */
SchemaType.prototype.castForQueryWrapper = function (params) {
  this.$$context = params.context;
  let ret;
  if ('$conditional' in params) {
    ret = this.castForQuery(params.$conditional, params.val);
  } else if (params.$skipQueryCastForUpdate || params.$applySetters) {
    ret = this._castForQuery(params.val);
  } else {
    ret = this.castForQuery(params.val);
  }
  this.$$context = null;
  return ret;
};

/**
 * Cast for query.
 */
SchemaType.prototype.castForQuery = function ($conditional, val) {
  if (arguments.length === 2) {
    const handler = this.$conditionalHandlers[$conditional];
    if (!handler) throw new Error(`Can't use ${$conditional}`);
    return handler.call(this, val);
  }
  return this._castForQuery($conditional);
};

/**
 * Internal cast for query.
 */
SchemaType.prototype._castForQuery = function (val) {
  return this.applySetters(val, this.$$context);
};

/**
 * Static checkRequired setter/getter.
 */
SchemaType.checkRequired = function (fn) {
  if (arguments.length) this._checkRequired = fn;
  return this._checkRequired;
};

/**
 * Default required check.
 */
SchemaType.prototype.checkRequired = function (val) {
  return val != null;
};

/**
 * Clone the schematype.
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