'use strict';

const MongooseError = require('./error/index');
const SchemaTypeOptions = require('./options/SchemaTypeOptions');
const $exists = require('./schema/operators/exists');
const $type = require('./schema/operators/type');
const get = require('./helpers/get');
const handleImmutable = require('./helpers/schematype/handleImmutable');
const immediate = require('./helpers/immediate');
const schemaTypeSymbol = require('./helpers/symbols').schemaTypeSymbol;
const utils = require('./utils');
const validatorErrorSymbol = require('./helpers/symbols').validatorErrorSymbol;
const documentIsModified = require('./helpers/symbols').documentIsModified;
const populateModelSymbol = require('./helpers/symbols').populateModelSymbol;

const CastError = MongooseError.CastError;
const ValidatorError = MongooseError.ValidatorError;

function SchemaType(path, options, instance) {
  this[schemaTypeSymbol] = true;
  this.path = path;
  this.instance = instance;
  this.validators = [];
  this.getters = this._getInitialGetters();
  this.setters = [];
  this.splitPath();

  options = options || {};
  this._mergeDefaultOptions(options);
  this._prepareSelectOption(options);
  
  const Options = this.OptionsConstructor || SchemaTypeOptions;
  this.options = new Options(options);
  this._index = null;

  this._setupImmutable(options);
  this._processOptions(options);
  
  Object.defineProperty(this, '$$context', {
    enumerable: false,
    configurable: false,
    writable: true,
    value: null
  });
}

SchemaType.prototype._getInitialGetters = function() {
  return this.constructor.hasOwnProperty('getters') ?
    this.constructor.getters.slice() :
    [];
};

SchemaType.prototype._mergeDefaultOptions = function(options) {
  const defaultOptions = this.constructor.defaultOptions || {};
  const defaultOptionsKeys = Object.keys(defaultOptions);

  for (const option of defaultOptionsKeys) {
    if (defaultOptions.hasOwnProperty(option) && !options.hasOwnProperty(option)) {
      options[option] = defaultOptions[option];
    }
  }
};

SchemaType.prototype._prepareSelectOption = function(options) {
  if (options.select == null) {
    delete options.select;
  }
};

SchemaType.prototype._setupImmutable = function(options) {
  if (utils.hasUserDefinedProperty(this.options, 'immutable')) {
    this.$immutable = this.options.immutable;
    handleImmutable(this);
  }
};

SchemaType.prototype._processOptions = function(options) {
  const keys = Object.keys(this.options);
  for (const prop of keys) {
    if (prop === 'cast') {
      this.castFunction(this.options[prop]);
      continue;
    }
    
    if (!utils.hasUserDefinedProperty(this.options, prop) || typeof this[prop] !== 'function') {
      continue;
    }

    // Handle index option specially
    if (prop === 'index' && this._index) {
      this._handleIndexOption(options);
      continue;
    }

    const val = options[prop];

    // Special case for default to avoid issues with array defaults
    if (prop === 'default') {
      this.default(val);
      continue;
    }

    const opts = Array.isArray(val) ? val : [val];
    this[prop].apply(this, opts);
  }
};

SchemaType.prototype._handleIndexOption = function(options) {
  if (options.index === false) {
    this._disableIndex();
  }
};

SchemaType.prototype._disableIndex = function() {
  if (typeof this._index === 'object' && this._index != null) {
    this._checkIndexConflicts();
  }
  this._index = false;
};

SchemaType.prototype._checkIndexConflicts = function() {
  if (this._index.unique) {
    throw new Error('Path "' + this.path + '" may not have `index` ' +
      'set to false and `unique` set to true');
  }
  if (this._index.sparse) {
    throw new Error('Path "' + this.path + '" may not have `index` ' +
      'set to false and `sparse` set to true');
  }
};

SchemaType.prototype.OptionsConstructor = SchemaTypeOptions;

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

SchemaType.prototype.cast = function cast() {
  throw new Error('Base SchemaType class does not implement a `cast()` function');
};

SchemaType.set = function set(option, value) {
  if (!this.hasOwnProperty('defaultOptions')) {
    this.defaultOptions = Object.assign({}, this.defaultOptions);
  }
  this.defaultOptions[option] = value;
};

SchemaType.get = function(getter) {
  this.getters = this.hasOwnProperty('getters') ? this.getters : [];
  this.getters.push(getter);
};

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

SchemaType.prototype.index = function(options) {
  this._index = options;
  utils.expires(this._index);
  return this;
};

SchemaType.prototype._ensureIndexObject = function() {
  if (this._index == null || this._index === true) {
    this._index = {};
  } else if (typeof this._index === 'string') {
    this._index = { type: this._index };
  }
};

SchemaType.prototype.unique = function(bool) {
  if (this._index === false) {
    if (!bool) {
      return;
    }
    throw new Error('Path "' + this.path + '" may not have `index` set to ' +
      'false and `unique` set to true');
  }
  this._ensureIndexObject();
  this._index.unique = bool;
  return this;
};

SchemaType.prototype.text = function(bool) {
  if (this._index === false) {
    if (!bool) {
      return;
    }
    throw new Error('Path "' + this.path + '" may not have `index` set to ' +
      'false and `text` set to true');
  }
  this._ensureIndexObject();
  this._index.text = bool;
  return this;
};

SchemaType.prototype.sparse = function(bool) {
  if (this._index === false) {
    if (!bool) {
      return;
    }
    throw new Error('Path "' + this.path + '" may not have `index` set to ' +
      'false and `sparse` set to true');
  }
  this._ensureIndexObject();
  this._index.sparse = bool;
  return this;
};

SchemaType.prototype.immutable = function(bool) {
  this.$immutable = bool;
  handleImmutable(this);
  return this;
};

SchemaType.prototype.transform = function(fn) {
  this.options.transform = fn;
  return this;
};

SchemaType.prototype.set = function(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('A setter must be a function.');
  }
  this.setters.push(fn);
  return this;
};

SchemaType.prototype.get = function(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('A getter must be a function.');
  }
  this.getters.push(fn);
  return this;
};

SchemaType.prototype.validate = function(obj, message, type) {
  if (typeof obj === 'function' || obj && utils.getFunctionName(obj.constructor) === 'RegExp') {
    const properties = this._buildValidatorProperties(obj, message, type);
    if (properties.isAsync) {
      this._handleIsAsync();
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
      const msg = 'Invalid validator. Received (' + typeof arg + ') ' + arg;
      throw new Error(msg);
    }
    this.validate(arg.validator, arg);
  }

  return this;
};

SchemaType.prototype._buildValidatorProperties = function(obj, message, type) {
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
  return properties;
};

SchemaType.prototype._handleIsAsync = util.deprecate(function handleIsAsync() {},
  'Mongoose: the `isAsync` option for custom validators is deprecated. Make ' +
  'your async validators return a promise instead: ' +
  'https://mongoosejs.com/docs/validation.html#async-custom-validators');

SchemaType.prototype.required = function(required, message) {
  let customOptions = {};

  if (arguments.length > 0 && required == null) {
    return this._removeRequiredValidator();
  }

  if (typeof required === 'object') {
    customOptions = required;
    message = customOptions.message || message;
    required = required.isRequired;
  }

  if (required === false) {
    return this._removeRequiredValidator();
  }

  const _this = this;
  this.isRequired = true;

  this.requiredValidator = function(v) {
    const cachedRequired = get(this, '$__.cachedRequired');

    if (cachedRequired != null && !this.$__isSelected(_this.path) && !this[documentIsModified](_this.path)) {
      return true;
    }

    if (cachedRequired != null && _this.path in cachedRequired) {
      const res = cachedRequired[_this.path] ?
        _this.checkRequired(v, this) :
        true;
      delete cachedRequired[_this.path];
      return res;
    } else if (typeof required === 'function') {
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

SchemaType.prototype._removeRequiredValidator = function() {
  this.validators = this.validators.filter(function(v) {
    return v.validator !== this.requiredValidator;
  }, this);

  this.isRequired = false;
  delete this.originalRequiredValue;
  return this;
};

SchemaType.prototype.ref = function(ref) {
  this.options.ref = ref;
  return this;
};

SchemaType.prototype.getDefault = function(scope, init) {
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

SchemaType.prototype._applySetters = function(value, scope, init) {
  let v = value;
  if (init) {
    return v;
  }
  const setters = this.setters;

  for (let i = setters.length - 1; i >= 0; i--) {
    v = setters[i].call(scope, v, this);
  }

  return v;
};

SchemaType.prototype._castNullish = function _castNullish(v) {
  return v;
};

SchemaType.prototype.applySetters = function(value, scope, init, priorVal, options) {
  let v = this._applySetters(value, scope, init, priorVal, options);
  if (v == null) {
    return this._castNullish(v);
  }

  v = this.cast(v, scope, init, priorVal, options);

  return v;
};

SchemaType.prototype.applyGetters = function(value, scope) {
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

SchemaType.prototype.select = function select(val) {
  this.selected = !!val;
  return this;
};

SchemaType.prototype.doValidate = function(value, fn, scope, options) {
  let err = false;
  const path = this.path;
  const validators = this.validators.filter(v => v != null && typeof v === 'object');
  let count = validators.length;

  if (!count) {
    return fn(null);
  }

  const _this = this;
  validators.forEach(function(v) {
    if (err) {
      return;
    }

    const validator = v.validator;
    let ok;

    const validatorProperties = utils.clone(v);
    validatorProperties.path = options && options.path ? options.path : path;
    validatorProperties.value = value;

    if (validator instanceof RegExp) {
      validate(validator.test(value), validatorProperties);
      return;
    }

    if (typeof validator !== 'function') {
      return;
    }

    if (value === undefined && validator !== _this.requiredValidator) {
      validate(true, validatorProperties);
      return;
    }

    if (validatorProperties.isAsync) {
      asyncValidate(validator, scope, value, validatorProperties, validate);
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
      if (error.message) {
        validatorProperties.message = error.message;
      }
    }

    if (ok != null && typeof ok.then === 'function') {
      ok.then(
        function(ok) { validate(ok, validatorProperties); },
        function(error) {
          validatorProperties.reason = error;
          validatorProperties.message = error.message;
          ok = false;
          validate(ok, validatorProperties);
        });
    } else {
      validate(ok, validatorProperties);
    }
  });

  function validate(ok, validatorProperties) {
    if (err) {
      return;
    }
    if (ok === undefined || ok) {
      if (--count <= 0) {
        immediate(function() {
          fn(null);
        });
      }
    } else {
      const ErrorConstructor = validatorProperties.ErrorConstructor || ValidatorError;
      err = new ErrorConstructor(validatorProperties);
      err[validatorErrorSymbol] = true;
      immediate(function() {
        fn(err);
      });
    }
  }
};

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

SchemaType._isRef = function(self, value, doc, init) {
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
    if (!Buffer.isBuffer(value) && value._bsontype !== 'Binary' && utils.isObject(value)) {
      return true;
    }
    return init;
  }
  return false;
};

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

function handleSingle(val) {
  return this.castForQuery(val);
}

function handleArray(val) {
  const _this = this;
  if (!Array.isArray(val)) {
    return [this.castForQuery(val)];
  }
  return val.map(function(m) {
    return _this.castForQuery(m);
  });
}

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

SchemaType.prototype.$conditionalHandlers = {
  $all: handleArray,
  $eq: handleSingle,
  $in: handle$in,
  $ne: handleSingle,
  $nin: handle$in,
  $exists: $exists,
  $type: $type
};

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

SchemaType.prototype._castForQuery = function(val) {
  return this.applySetters(val, this.$$context);
};

SchemaType.checkRequired = function(fn) {
  if (arguments.length > 0) {
    this._checkRequired = fn;
  }
  return this._checkRequired;
};

SchemaType.prototype.checkRequired = function(val) {
  return val != null;
};

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

module.exports = exports = SchemaType;
exports.CastError = CastError;
exports.ValidatorError = ValidatorError;