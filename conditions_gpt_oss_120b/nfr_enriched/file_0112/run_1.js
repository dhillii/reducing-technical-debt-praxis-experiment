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
  _applyDefaultOptions(options, defaultOptions);

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

  _processSchemaOptions(this, options);
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

/* -------------------------------------------------------------------------- */
/* Helper: apply default options                                               */
/* -------------------------------------------------------------------------- */
function _applyDefaultOptions(options, defaults) {
  const keys = Object.keys(defaults);
  for (const key of keys) {
    if (defaults.hasOwnProperty(key) && !options.hasOwnProperty(key)) {
      options[key] = defaults[key];
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Helper: process schema options (cast, index, default, etc.)                */
/* -------------------------------------------------------------------------- */
function _processSchemaOptions(schema, options) {
  const keys = Object.keys(options);
  for (const prop of keys) {
    if (prop === 'cast') {
      schema.castFunction(options[prop]);
      continue;
    }
    if (utils.hasUserDefinedProperty(schema.options, prop) && typeof schema[prop] === 'function') {
      if (prop === 'index' && schema._index) {
        _handleIndexOption(schema, options);
        continue;
      }
      const val = options[prop];
      if (prop === 'default') {
        schema.default(val);
        continue;
      }
      const args = Array.isArray(val) ? val : [val];
      schema[prop].apply(schema, args);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Helper: handle index option conflicts                                       */
/* -------------------------------------------------------------------------- */
function _handleIndexOption(schema, options) {
  if (options.index === false) {
    const index = schema._index;
    if (typeof index === 'object' && index != null) {
      if (index.unique) {
        throw new Error('Path "' + schema.path + '" may not have `index` set to false and `unique` set to true');
      }
      if (index.sparse) {
        throw new Error('Path "' + schema.path + '" may not have `index` set to false and `sparse` set to true');
      }
    }
    schema._index = false;
  }
}

/* -------------------------------------------------------------------------- */
/* Static cast getter/setter                                                  */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/* Instance castFunction getter/setter                                         */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/* Base cast (must be overridden)                                            */
/* -------------------------------------------------------------------------- */
SchemaType.prototype.cast = function () {
  throw new Error('Base SchemaType class does not implement a `cast()` function');
};

/* -------------------------------------------------------------------------- */
/* Static set for default options                                            */
/* -------------------------------------------------------------------------- */
SchemaType.set = function set(option, value) {
  if (!this.hasOwnProperty('defaultOptions')) {
    this.defaultOptions = Object.assign({}, this.defaultOptions);
  }
  this.defaultOptions[option] = value;
};

/* -------------------------------------------------------------------------- */
/* Static getter registration                                                 */
/* -------------------------------------------------------------------------- */
SchemaType.get = function (getter) {
  this.getters = this.hasOwnProperty('getters') ? this.getters : [];
  this.getters.push(getter);
};

/* -------------------------------------------------------------------------- */
/* Instance default value handling                                            */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/* Index helpers                                                              */
/* -------------------------------------------------------------------------- */
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
  if (this._index == null || typeof this._index === 'boolean') {
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

/* -------------------------------------------------------------------------- */
/* Immutable handling                                                         */
/* -------------------------------------------------------------------------- */
SchemaType.prototype.immutable = function (bool) {
  this.$immutable = bool;
  handleImmutable(this);
  return this;
};

/* -------------------------------------------------------------------------- */
/* Transform option                                                            */
/* -------------------------------------------------------------------------- */
SchemaType.prototype.transform = function (fn) {
  this.options.transform = fn;
  return this;
};

/* -------------------------------------------------------------------------- */
/* Setter registration                                                         */
/* -------------------------------------------------------------------------- */
SchemaType.prototype.set = function (fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('A setter must be a function.');
  }
  this.setters.push(fn);
  return this;
};

/* -------------------------------------------------------------------------- */
/* Getter registration                                                         */
/* -------------------------------------------------------------------------- */
SchemaType.prototype.get = function (fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('A getter must be a function.');
  }
  this.getters.push(fn);
  return this;
};

/* -------------------------------------------------------------------------- */
/* Validator registration                                                     */
/* -------------------------------------------------------------------------- */
SchemaType.prototype.validate = function (obj, message, type) {
  if (typeof obj === 'function' || (obj && utils.getFunctionName(obj.constructor) === 'RegExp')) {
    const properties = _buildValidatorProperties(this, obj, message, type);
    if (properties.isAsync) {
      handleIsAsync();
    }
    this.validators.push(properties);
    return this;
  }

  for (let i = 0, len = arguments.length; i < len; ++i) {
    const arg = arguments[i];
    if (!utils.isPOJO(arg)) {
      throw new Error('Invalid validator. Received (' + typeof arg + ') ' + arg + '. See http://mongoosejs.com/docs/api.html#schematype_SchemaType-validate');
    }
    this.validate(arg.validator, arg);
  }
  return this;
};

/* -------------------------------------------------------------------------- */
/* Helper: build validator property object                                    */
/* -------------------------------------------------------------------------- */
function _buildValidatorProperties(schema, obj, message, type) {
  let props;
  if (typeof message === 'function') {
    props = { validator: obj, message: message };
    props.type = type || 'user defined';
  } else if (message instanceof Object && !type) {
    props = utils.clone(message);
    if (!props.message) {
      props.message = props.msg;
    }
    props.validator = obj;
    props.type = props.type || 'user defined';
  } else {
    if (message == null) {
      message = MongooseError.messages.general.default;
    }
    if (!type) {
      type = 'user defined';
    }
    props = { message: message, type: type, validator: obj };
  }
  return props;
}

/* -------------------------------------------------------------------------- */
/* Deprecation warning for isAsync                                            */
/* -------------------------------------------------------------------------- */
const handleIsAsync = util.deprecate(
  function () { },
  'Mongoose: the `isAsync` option for custom validators is deprecated. Make your async validators return a promise instead: https://mongoosejs.com/docs/validation.html#async-custom-validators'
);

/* -------------------------------------------------------------------------- */
/* Required validator handling                                                */
/* -------------------------------------------------------------------------- */
SchemaType.prototype.required = function (required, message) {
  if (arguments.length > 0 && required == null) {
    return _removeRequiredValidator(this);
  }

  if (typeof required === 'object') {
    const customOptions = required;
    message = customOptions.message || message;
    required = customOptions.isRequired;
    this._customRequiredOptions = customOptions;
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
  this.validators.unshift(Object.assign({}, this._customRequiredOptions || {}, {
    validator: this.requiredValidator,
    message: msg,
    type: 'required'
  }));
  return this;
};

/* -------------------------------------------------------------------------- */
/* Helper: remove required validator                                          */
/* -------------------------------------------------------------------------- */
function _removeRequiredValidator(schema) {
  schema.validators = schema.validators.filter(v => v.validator !== schema.requiredValidator);
  schema.isRequired = false;
  delete schema.originalRequiredValue;
  return schema;
}

/* -------------------------------------------------------------------------- */
/* Helper: create required validator function                                 */
/* -------------------------------------------------------------------------- */
function _createRequiredValidator(schema, required) {
  return function (v) {
    const cached = get(this, '$__.cachedRequired');
    if (cached != null && !this.$__isSelected(schema.path) && !this[documentIsModified](schema.path)) {
      return true;
    }
    if (cached != null && schema.path in cached) {
      const res = cached[schema.path] ? schema.checkRequired(v, this) : true;
      delete cached[schema.path];
      return res;
    }
    if (typeof required === 'function') {
      return required.apply(this) ? schema.checkRequired(v, this) : true;
    }
    return schema.checkRequired(v, this);
  };
}

/* -------------------------------------------------------------------------- */
/* Ref handling                                                               */
/* -------------------------------------------------------------------------- */
SchemaType.prototype.ref = function (ref) {
  this.options.ref = ref;
  return this;
};

/* -------------------------------------------------------------------------- */
/* Default value retrieval                                                    */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/* Apply setters without casting                                               */
/* -------------------------------------------------------------------------- */
SchemaType.prototype._applySetters = function (value, scope, init) {
  if (init) return value;
  let v = value;
  const setters = this.setters;
  for (let i = setters.length - 1; i >= 0; --i) {
    v = setters[i].call(scope, v, this);
  }
  return v;
};

SchemaType.prototype._castNullish = function _castNullish(v) {
  return v;
};

/* -------------------------------------------------------------------------- */
/* Apply setters (including casting)                                          */
/* -------------------------------------------------------------------------- */
SchemaType.prototype.applySetters = function (value, scope, init, priorVal, options) {
  const v = this._applySetters(value, scope, init, priorVal, options);
  if (v == null) return this._castNullish(v);
  return this.cast(v, scope, init, priorVal, options);
};

/* -------------------------------------------------------------------------- */
/* Apply getters                                                               */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/* Select helper                                                              */
/* -------------------------------------------------------------------------- */
SchemaType.prototype.select = function (val) {
  this.selected = !!val;
  return this;
};

/* -------------------------------------------------------------------------- */
/* Validation orchestration (async)                                            */
/* -------------------------------------------------------------------------- */
SchemaType.prototype.doValidate = function (value, fn, scope, options) {
  const validators = this.validators.filter(v => v != null && typeof v === 'object');
  if (validators.length === 0) return fn(null);
  _runAsyncValidators(this, value, fn, scope, options, validators);
};

/* -------------------------------------------------------------------------- */
/* Helper: run async validators                                               */
/* -------------------------------------------------------------------------- */
function _runAsyncValidators(schema, value, callback, scope, options, validators) {
  let remaining = validators.length;
  let finished = false;
  const path = schema.path;

  validators.forEach(v => {
    if (finished) return;
    const validatorProps = utils.clone(v);
    validatorProps.path = (options && options.path) ? options.path : path;
    validatorProps.value = value;

    if (validatorProps.validator instanceof RegExp) {
      _handleValidatorResult(schema, validatorProps.test(value), validatorProps, callback, () => --remaining, () => finished);
      return;
    }

    if (typeof validatorProps.validator !== 'function') {
      _decrementAndMaybeFinish();
      return;
    }

    if (value === undefined && validatorProps.validator !== schema.requiredValidator) {
      _handleValidatorResult(schema, true, validatorProps, callback, () => --remaining, () => finished);
      return;
    }

    if (validatorProps.isAsync) {
      asyncValidate(validatorProps.validator, scope, value, validatorProps, (ok, props) => {
        _handleValidatorResult(schema, ok, props, callback, () => --remaining, () => finished);
      });
      return;
    }

    let ok;
    try {
      ok = validatorProps.propsParameter
        ? validatorProps.validator.call(scope, value, validatorProps)
        : validatorProps.validator.call(scope, value);
    } catch (error) {
      ok = false;
      validatorProps.reason = error;
      if (error.message) validatorProps.message = error.message;
    }

    if (ok != null && typeof ok.then === 'function') {
      ok.then(
        res => _handleValidatorResult(schema, res, validatorProps, callback, () => --remaining, () => finished),
        err => {
          validatorProps.reason = err;
          validatorProps.message = err.message;
          _handleValidatorResult(schema, false, validatorProps, callback, () => --remaining, () => finished);
        });
    } else {
      _handleValidatorResult(schema, ok, validatorProps, callback, () => --remaining, () => finished);
    }
  });

  function _decrementAndMaybeFinish() {
    if (--remaining <= 0 && !finished) {
      finished = true;
      immediate(() => callback(null));
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Helper: process validator result                                           */
/* -------------------------------------------------------------------------- */
function _handleValidatorResult(schema, ok, props, callback, decrement, finishCheck) {
  if (ok === undefined || ok) {
    decrement();
    if (decrement() <= 0 && !finishCheck()) {
      finishCheck();
      immediate(() => callback(null));
    }
    return;
  }
  const ErrorConstructor = props.ErrorConstructor || ValidatorError;
  const err = new ErrorConstructor(props);
  err[validatorErrorSymbol] = true;
  finishCheck();
  immediate(() => callback(err));
}

/* -------------------------------------------------------------------------- */
/* Validation orchestration (sync)                                             */
/* -------------------------------------------------------------------------- */
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
    props.path = (options && options.path) ? options.path : path;
    props.value = value;

    if (validator.isAsync) return;
    if (validator instanceof RegExp) {
      _syncValidateResult(validator.test(value), props);
      return;
    }
    if (typeof validator !== 'function') return;

    let ok;
    try {
      ok = props.propsParameter
        ? validator.call(scope, value, props)
        : validator.call(scope, value);
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
      const ErrorConstructor = props.ErrorConstructor || ValidatorError;
      err = new ErrorConstructor(props);
      err[validatorErrorSymbol] = true;
    }
  }
};

/* -------------------------------------------------------------------------- */
/* Reference detection                                                        */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/* Cast reference helper                                                       */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/* Query casting helpers                                                       */
/* -------------------------------------------------------------------------- */
function _handleSingle(val) {
  return this.castForQuery(val);
}
function _handleArray(val) {
  if (!Array.isArray(val)) return [this.castForQuery(val)];
  return val.map(m => this.castForQuery(m));
}
function _handle$in(val) {
  if (!Array.isArray(val)) return [this.castForQuery(val)];
  return val.map(m => (Array.isArray(m) && m.length === 0) ? m : this.castForQuery(m));
}
SchemaType.prototype.$conditionalHandlers = {
  $all: _handleArray,
  $eq: _handleSingle,
  $in: _handle$in,
  $ne: _handleSingle,
  $nin: _handle$in,
  $exists: $exists,
  $type: $type
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

/* -------------------------------------------------------------------------- */
/* Required check override                                                    */
/* -------------------------------------------------------------------------- */
SchemaType.checkRequired = function (fn) {
  if (arguments.length > 0) this._checkRequired = fn;
  return this._checkRequired;
};

SchemaType.prototype.checkRequired = function (val) {
  return val != null;
};

/* -------------------------------------------------------------------------- */
/* Clone method                                                               */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/* Module exports                                                              */
/* -------------------------------------------------------------------------- */
module.exports = exports = SchemaType;
exports.CastError = CastError;
exports.ValidatorError = ValidatorError;