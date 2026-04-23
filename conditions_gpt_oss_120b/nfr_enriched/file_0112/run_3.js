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
 *
 * @param {Function|false} caster
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
 * The function that Mongoose calls to cast arbitrary values to this SchemaType.
 *
 * @param {Object} value
 * @param {Document} doc
 * @param {Boolean} init
 * @api public
 */
SchemaType.prototype.cast = function () {
  throw new Error('Base SchemaType class does not implement a `cast()` function');
};

/**
 * Sets a default option for this schema type.
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
 * Attaches a getter for all instances of this schema type.
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
    if (!bool) {
      return;
    }
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
 * Declares a full text index.
 *
 * @param {Boolean} bool
 * @return {SchemaType}
 * @api public
 */
SchemaType.prototype.text = function (bool) {
  if (this._index === false) {
    if (!bool) {
      return;
    }
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
 * Declares a sparse index.
 *
 * @param {Boolean} bool
 * @return {SchemaType}
 * @api public
 */
SchemaType.prototype.sparse = function (bool) {
  if (this._index === false) {
    if (!bool) {
      return;
    }
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
 * Defines a custom function for transforming this path when converting a document to JSON.
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
 * Adds a setter to this schematype.
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
 * Adds a getter to this schematype.
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
 * Helper: determine if argument is a validator function or RegExp.
 */
function isValidatorFunction(arg) {
  return typeof arg === 'function' || (arg && utils.getFunctionName(arg.constructor) === 'RegExp');
}

/**
 * Helper: build validator properties object.
 */
function buildValidatorProperties(self, validator, message, type) {
  let props;
  if (typeof message === 'function') {
    props = { validator, message };
    props.type = type || 'user defined';
  } else if (message instanceof Object && !type) {
    props = utils.clone(message);
    if (!props.message) {
      props.message = props.msg;
    }
    props.validator = validator;
    props.type = props.type || 'user defined';
  } else {
    if (message == null) {
      message = MongooseError.messages.general.default;
    }
    if (!type) {
      type = 'user defined';
    }
    props = { message, type, validator };
  }
  return props;
}

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
  if (isValidatorFunction(obj)) {
    const props = buildValidatorProperties(this, obj, message, type);
    if (props.isAsync) {
      handleIsAsync();
    }
    this.validators.push(props);
    return this;
  }

  // Treat arguments as validator definition objects
  for (let i = 0; i < arguments.length; ++i) {
    const arg = arguments[i];
    if (!utils.isPOJO(arg)) {
      throw new Error('Invalid validator. Received (' + typeof arg + ') ' + arg + '. See http://mongoosejs.com/docs/api.html#schematype_SchemaType-validate');
    }
    this.validate(arg.validator, arg);
  }
  return this;
};

/*!
 * ignore
 */
const handleIsAsync = util.deprecate(function () { }, 'Mongoose: the `isAsync` option for custom validators is deprecated. Make your async validators return a promise instead: https://mongoosejs.com/docs/validation.html#async-custom-validators');

/**
 * Helper: filter out non-object validators.
 */
function getValidValidators(validators) {
  return validators.filter(v => v != null && typeof v === 'object');
}

/**
 * Helper: run a single validator synchronously.
 */
function runSyncValidator(v, value, scope, path, options) {
  const validator = v.validator;
  const props = utils.clone(v);
  props.path = options && options.path ? options.path : path;
  props.value = value;

  if (validator instanceof RegExp) {
    return { ok: validator.test(value), props };
  }
  if (typeof validator !== 'function') {
    return { ok: true, props };
  }
  if (value === undefined && validator !== scope.requiredValidator) {
    return { ok: true, props };
  }

  let ok;
  try {
    if (props.propsParameter) {
      ok = validator.call(scope, value, props);
    } else {
      ok = validator.call(scope, value);
    }
  } catch (error) {
    ok = false;
    props.reason = error;
    if (error.message) {
      props.message = error.message;
    }
  }
  return { ok, props };
}

/**
 * Helper: handle async validator.
 */
function runAsyncValidator(validator, scope, value, props, cb) {
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
      function (ok) {
        if (called) return;
        called = true;
        cb(ok, props);
      },
      function (error) {
        if (called) return;
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
 * @param {Function} fn
 * @param {Object} scope
 * @api private
 */
SchemaType.prototype.doValidate = function (value, fn, scope, options) {
  const path = this.path;
  const validators = getValidValidators(this.validators);
  let remaining = validators.length;
  if (!remaining) {
    return fn(null);
  }

  let errorOccurred = false;

  validators.forEach(v => {
    if (errorOccurred) return;

    const { validator } = v;
    if (validator instanceof RegExp) {
      processResult(validator.test(value), v);
      return;
    }

    if (typeof validator !== 'function') {
      processResult(true, v);
      return;
    }

    if (value === undefined && validator !== this.requiredValidator) {
      processResult(true, v);
      return;
    }

    if (v.isAsync) {
      runAsyncValidator(validator, scope, value, utils.clone(v), processResult);
      return;
    }

    const { ok, props } = runSyncValidator(v, value, scope, path, options);
    if (ok != null && typeof ok.then === 'function') {
      ok.then(
        res => processResult(res, props),
        err => {
          props.reason = err;
          props.message = err.message;
          processResult(false, props);
        });
    } else {
      processResult(ok, props);
    }
  });

  function processResult(ok, validatorProps) {
    if (errorOccurred) return;
    if (ok === undefined || ok) {
      if (--remaining <= 0) {
        immediate(() => fn(null));
      }
    } else {
      const ErrorConstructor = validatorProps.ErrorConstructor || ValidatorError;
      errorOccurred = new ErrorConstructor(validatorProps);
      errorOccurred[validatorErrorSymbol] = true;
      immediate(() => fn(errorOccurred));
    }
  }
};

/**
 * Performs a validation of `value` using the validators declared for this SchemaType.
 * This method ignores asynchronous validators.
 *
 * @param {any} value
 * @param {Object} scope
 * @return {MongooseError|undefined}
 * @api private
 */
SchemaType.prototype.doValidateSync = function (value, scope, options) {
  const path = this.path;
  const count = this.validators.length;
  if (!count) return null;

  let validators = this.validators;
  if (value === void 0) {
    if (this.validators.length > 0 && this.validators[0].type === 'required') {
      validators = [this.validators[0]];
    } else {
      return null;
    }
  }

  let err = null;
  validators.forEach(v => {
    if (err) return;
    if (v == null || typeof v !== 'object') return;

    const validator = v.validator;
    const props = utils.clone(v);
    props.path = options && options.path ? options.path : path;
    props.value = value;
    let ok;

    if (validator.isAsync) return;
    if (validator instanceof RegExp) {
      ok = validator.test(value);
    } else if (typeof validator !== 'function') {
      ok = true;
    } else {
      try {
        if (props.propsParameter) {
          ok = validator.call(scope, value, props);
        } else {
          ok = validator.call(scope, value);
        }
      } catch (error) {
        ok = false;
        props.reason = error;
      }
    }

    if (ok != null && typeof ok.then === 'function') return;
    if (ok !== undefined && !ok) {
      const ErrorConstructor = props.ErrorConstructor || ValidatorError;
      err = new ErrorConstructor(props);
      err[validatorErrorSymbol] = true;
    }
  });
  return err;
};

/**
 * Helper: set required validator.
 */
function configureRequiredValidator(self, required, message, customOptions) {
  const validator = function (v) {
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
  self.requiredValidator = validator;
  self.originalRequiredValue = required;
  const msg = message || MongooseError.messages.general.required;
  self.validators.unshift(Object.assign({}, customOptions, {
    validator,
    message: msg,
    type: 'required'
  }));
}

/**
 * Adds a required validator to this SchemaType.
 *
 * @param {Boolean|Function|Object} required
 * @param {String} [message]
 * @return {SchemaType}
 * @api public
 */
SchemaType.prototype.required = function (required, message) {
  if (arguments.length > 0 && required == null) {
    this.validators = this.validators.filter(v => v.validator !== this.requiredValidator);
    this.isRequired = false;
    delete this.originalRequiredValue;
    return this;
  }

  let customOptions = {};
  if (typeof required === 'object') {
    customOptions = required;
    message = customOptions.message || message;
    required = required.isRequired;
  }

  if (required === false) {
    this.validators = this.validators.filter(v => v.validator !== this.requiredValidator);
    this.isRequired = false;
    delete this.originalRequiredValue;
    return this;
  }

  this.isRequired = true;
  if (typeof required === 'string') {
    message = required;
    required = undefined;
  }

  configureRequiredValidator(this, required, message, customOptions);
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
 * Gets the default value.
 *
 * @param {Object} scope
 * @param {Boolean} init
 * @api private
 */
SchemaType.prototype.getDefault = function (scope, init) {
  let ret = typeof this.defaultValue === 'function' ? this.defaultValue.call(scope) : this.defaultValue;
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
  for (let i = setters.length - 1; i >= 0; --i) {
    v = setters[i].call(scope, v, this);
  }
  return v;
};

SchemaType.prototype._castNullish = function (v) {
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
  if (len === 0) return v;
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
 * Performs a validation of `value` using the validators declared for this SchemaType.
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

/**
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
 * Internal switch for runSetters
 *
 * @api private
 */
SchemaType.prototype._castForQuery = function (val) {
  return this.applySetters(val, this.$$context);
};

/**
 * Override the function the required validator uses to check whether a value passes the `required` check.
 *
 * @param {Function} fn
 * @static
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

/**
 * Clone this schematype.
 *
 * @return {SchemaType}
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