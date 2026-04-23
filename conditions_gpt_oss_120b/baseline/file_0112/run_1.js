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
 * Helper to create validator property object.
 */
function buildValidatorProps(validator, message, type) {
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
    props = { validator, message, type };
  }
  return props;
}

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
  const defaultKeys = Object.keys(defaultOptions);
  for (const key of defaultKeys) {
    if (defaultOptions.hasOwnProperty(key) && !options.hasOwnProperty(key)) {
      options[key] = defaultOptions[key];
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
 * @static
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
 * @instance
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

SchemaType.prototype.cast = function () {
  throw new Error('Base SchemaType class does not implement a `cast()` function');
};

SchemaType.set = function (option, value) {
  if (!this.hasOwnProperty('defaultOptions')) {
    this.defaultOptions = Object.assign({}, this.defaultOptions);
  }
  this.defaultOptions[option] = value;
};

SchemaType.get = function (getter) {
  this.getters = this.hasOwnProperty('getters') ? this.getters : [];
  this.getters.push(getter);
};

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

SchemaType.prototype.index = function (options) {
  this._index = options;
  utils.expires(this._index);
  return this;
};

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

SchemaType.prototype.immutable = function (bool) {
  this.$immutable = bool;
  handleImmutable(this);
  return this;
};

SchemaType.prototype.transform = function (fn) {
  this.options.transform = fn;
  return this;
};

SchemaType.prototype.set = function (fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('A setter must be a function.');
  }
  this.setters.push(fn);
  return this;
};

SchemaType.prototype.get = function (fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('A getter must be a function.');
  }
  this.getters.push(fn);
  return this;
};

/**
 * Refactored validate method to reduce cognitive complexity.
 */
SchemaType.prototype.validate = function (obj, message, type) {
  // Single validator case
  if (typeof obj === 'function' || (obj && utils.getFunctionName(obj.constructor) === 'RegExp')) {
    const props = buildValidatorProps(obj, message, type);
    if (props.isAsync) {
      handleIsAsync();
    }
    this.validators.push(props);
    return this;
  }

  // Multiple validator objects passed as arguments
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

/*!
 * ignore
 */
const handleIsAsync = util.deprecate(
  function () { },
  'Mongoose: the `isAsync` option for custom validators is deprecated. Make your async validators return a promise instead: https://mongoosejs.com/docs/validation.html#async-custom-validators'
);

SchemaType.prototype.required = function (required, message) {
  let customOptions = {};

  if (arguments.length > 0 && required == null) {
    this.validators = this.validators.filter(v => v.validator !== this.requiredValidator, this);
    this.isRequired = false;
    delete this.originalRequiredValue;
    return this;
  }

  if (typeof required === 'object') {
    customOptions = required;
    message = customOptions.message || message;
    required = required.isRequired;
  }

  if (required === false) {
    this.validators = this.validators.filter(v => v.validator !== this.requiredValidator, this);
    this.isRequired = false;
    delete this.originalRequiredValue;
    return this;
  }

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

  return this;
};

SchemaType.prototype.ref = function (ref) {
  this.options.ref = ref;
  return this;
};

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

SchemaType.prototype.applySetters = function (value, scope, init) {
  let v = this._applySetters(value, scope, init);
  if (v == null) {
    return this._castNullish(v);
  }
  v = this.cast(v, scope, init);
  return v;
};

SchemaType.prototype.applyGetters = function (value, scope) {
  let v = value;
  const len = this.getters.length;
  if (len === 0) return v;
  for (let i = 0; i < len; ++i) {
    v = this.getters[i].call(scope, v, this);
  }
  return v;
};

SchemaType.prototype.select = function (val) {
  this.selected = !!val;
  return this;
};

SchemaType.prototype.doValidate = function (value, fn, scope, options) {
  let err = false;
  const path = this.path;
  const validators = this.validators.filter(v => v != null && typeof v === 'object');
  let remaining = validators.length;

  if (!remaining) return fn(null);

  const _this = this;
  validators.forEach(v => {
    if (err) return;

    const validator = v.validator;
    const props = utils.clone(v);
    props.path = (options && options.path) ? options.path : path;
    props.value = value;

    if (validator instanceof RegExp) {
      evaluate(true, props.test(value));
      return;
    }

    if (typeof validator !== 'function') return;

    if (value === undefined && validator !== _this.requiredValidator) {
      evaluate(true, props);
      return;
    }

    if (props.isAsync) {
      asyncValidate(validator, scope, value, props, evaluate);
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
        res => evaluate(res, props),
        errObj => {
          props.reason = errObj;
          props.message = errObj.message;
          evaluate(false, props);
        }
      );
    } else {
      evaluate(ok, props);
    }
  });

  function evaluate(result, props) {
    if (err) return;
    if (result === undefined || result) {
      if (--remaining <= 0) {
        immediate(() => fn(null));
      }
    } else {
      const ErrCtor = props.ErrorConstructor || ValidatorError;
      err = new ErrCtor(props);
      err[validatorErrorSymbol] = true;
      immediate(() => fn(err));
    }
  }
};

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

SchemaType.prototype.doValidateSync = function (value, scope, options) {
  const path = this.path;
  const count = this.validators.length;
  if (!count) return null;

  let validators = this.validators;
  if (value === void 0) {
    if (this.validators.length && this.validators[0].type === 'required') {
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
    props.path = (options && options.path) ? options.path : path;
    props.value = value;

    if (validator.isAsync) return;

    if (validator instanceof RegExp) {
      check(validator.test(value), props);
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

    check(ok, props);
  });

  return err;

  function check(result, props) {
    if (err) return;
    if (result !== undefined && !result) {
      const ErrCtor = props.ErrorConstructor || ValidatorError;
      err = new ErrCtor(props);
      err[validatorErrorSymbol] = true;
    }
  }
};

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

function handleSingle(val) {
  return this.castForQuery(val);
}
function handleArray(val) {
  if (!Array.isArray(val)) return [this.castForQuery(val)];
  return val.map(m => this.castForQuery(m));
}
function handle$in(val) {
  if (!Array.isArray(val)) return [this.castForQuery(val)];
  return val.map(m => (Array.isArray(m) && m.length === 0) ? m : this.castForQuery(m));
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

SchemaType.prototype.castForQuery = function ($conditional, val) {
  if (arguments.length === 2) {
    const handler = this.$conditionalHandlers[$conditional];
    if (!handler) throw new Error('Can\'t use ' + $conditional);
    return handler.call(this, val);
  }
  return this._castForQuery($conditional);
};

SchemaType.prototype._castForQuery = function (val) {
  return this.applySetters(val, this.$$context);
};

SchemaType.checkRequired = function (fn) {
  if (arguments.length > 0) this._checkRequired = fn;
  return this._checkRequired;
};

SchemaType.prototype.checkRequired = function (val) {
  return val != null;
};

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