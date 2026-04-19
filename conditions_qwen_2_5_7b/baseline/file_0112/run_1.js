```javascript
'use strict';

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

class SchemaType {
  constructor(path, options, instance) {
    this[schemaTypeSymbol] = true;
    this.path = path;
    this.instance = instance;
    this.validators = [];
    this.getters = [];
    this.setters = [];
    this.splitPath();
    this.options = new SchemaTypeOptions(options);
    this._index = null;

    if (utils.hasUserDefinedProperty(this.options, 'immutable')) {
      this.$immutable = this.options.immutable;
      handleImmutable(this);
    }

    const keys = Object.keys(this.options);
    for (const key of keys) {
      if (key === 'cast') {
        this.castFunction(this.options[key]);
        continue;
      }
      if (utils.hasUserDefinedProperty(this.options, key) && typeof this[key] === 'function') {
        const val = options[key];
        if (Array.isArray(val)) {
          this[key].apply(this, val);
        } else {
          this[key](val);
        }
      }
    }

    Object.defineProperty(this, '$$context', {
      enumerable: false,
      configurable: false,
      writable: true,
      value: null
    });
  }

  static cast(caster) {
    if (arguments.length === 0) {
      return this._cast;
    }
    if (caster === false) {
      caster = v => v;
    }
    this._cast = caster;
    return this._cast;
  }

  castFunction(caster) {
    if (arguments.length === 0) {
      return this._castFunction;
    }
    if (caster === false) {
      caster = this.constructor._defaultCaster || (v => v);
    }
    this._castFunction = caster;
    return this._castFunction;
  }

  cast() {
    throw new Error('Base SchemaType class does not implement a `cast()` function');
  }

  static set(option, value) {
    if (!this.defaultOptions) {
      this.defaultOptions = {};
    }
    this.defaultOptions[option] = value;
  }

  static get(getter) {
    this.getters = this.getters || [];
    this.getters.push(getter);
  }

  default(val) {
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
  }

  index(options) {
    this._index = options;
    utils.expires(this._index);
  }

  unique(bool) {
    if (this._index === false) {
      if (!bool) {
        return;
      }
      throw new Error('Path "' + this.path + '" may not have `index` set to ' +
        'false and `unique` set to true');
    }
    if (this._index == null || this._index === true) {
      this._index = {};
    } else if (typeof this._index === 'string') {
      this._index = { type: this._index };
    }
    this._index.unique = bool;
  }

  text(bool) {
    if (this._index === false) {
      if (!bool) {
        return;
      }
      throw new Error('Path "' + this.path + '" may not have `index` set to ' +
        'false and `text` set to true');
    }
    if (this._index == null || this._index === undefined || typeof this._index === 'boolean') {
      this._index = {};
    } else if (typeof this._index === 'string') {
      this._index = { type: this._index };
    }
    this._index.text = bool;
  }

  sparse(bool) {
    if (this._index === false) {
      if (!bool) {
        return;
      }
      throw new Error('Path "' + this.path + '" may not have `index` set to ' +
        'false and `sparse` set to true');
    }
    if (this._index == null || typeof this._index === 'boolean') {
      this._index = {};
    } else if (typeof this._index === 'string') {
      this._index = { type: this._index };
    }
    this._index.sparse = bool;
  }

  immutable(bool) {
    this.$immutable = bool;
    handleImmutable(this);
  }

  transform(fn) {
    this.options.transform = fn;
    return this;
  }

  set(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('A setter must be a function.');
    }
    this.setters.push(fn);
    return this;
  }

  get(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('A getter must be a function.');
    }
    this.getters.push(fn);
    return this;
  }

  validate(obj, message, type) {
    if (typeof obj === 'function' || obj && utils.getFunctionName(obj.constructor) === 'RegExp') {
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

      if (properties.isAsync) {
        handleIsAsync();
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
        const msg = 'Invalid validator. Received (' + typeof arg + ') ' + arg + '. See http://mongoosejs.com/docs/api.html#schematype_SchemaType-validate';
        throw new Error(msg);
      }
      this.validate(arg.validator, arg);
    }

    return this;
  }

  required(required, message) {
    let customOptions = {};

    if (arguments.length > 0 && required == null) {
      this.validators = this.validators.filter(v => v.validator !== this.requiredValidator);
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
      this.validators = this.validators.filter(v => v.validator !== this.requiredValidator);
      this.isRequired = false;
      delete this.originalRequiredValue;
      return this;
    }

    this.isRequired = true;
    this.requiredValidator = function(v) {
      const cachedRequired = get(this, '$__.cachedRequired');

      if (cachedRequired != null && !this.$__isSelected(this.path) && !this[documentIsModified](this.path)) {
        return true;
      }

      if (cachedRequired != null && this.path in cachedRequired) {
        const res = cachedRequired[this.path] ? this.checkRequired(v, this) : true;
        delete cachedRequired[this.path];
        return res;
      } else if (typeof required === 'function') {
        return required.apply(this) ? this.checkRequired(v, this) : true;
      }

      return this.checkRequired(v, this);
    };
    this.originalRequiredValue = required;

    if (typeof required === 'string') {
      message = required;
      required = undefined;
    }

    const msg = message || MongooseError.messages.general.required;
    this.validators.unshift(Object.assign({}, customOptions, { validator: this.requiredValidator, message: msg, type: 'required' }));
    return this;
  }

  ref(ref) {
    this.options.ref = ref;
    return this;
  }

  getDefault(scope, init) {
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
  }

  _applySetters(value, scope, init, priorVal, options) {
    let v = value;
    if (init) {
      return v;
    }
    const setters = this.setters;

    for (let i = setters.length - 1; i >= 0; i--) {
      v = setters[i].call(scope, v, this);
    }

    return v;
  }

  _castNullish(v) {
    return v;
  }

  applySetters(value, scope, init, priorVal, options) {
    let v = this._applySetters(value, scope, init, priorVal, options);
    if (v == null) {
      return this._castNullish(v);
    }

    v = this.cast(v, scope, init, priorVal, options);

    return v;
  }

  applyGetters(value, scope) {
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
  }

  select(val) {
    this.selected = !!val;
    return this;
  }

  doValidate(value, fn, scope, options) {
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
  }

  doValidateSync(value, scope, options) {
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
  }

  _isRef(self, value, doc, init) {
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
  }

  _castRef(value, doc, init) {
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
    if (!doc.$__.populated || !doc.$__.populated[path] || !doc.$__.populated[path].options || !doc.$__.populated[path].options.options || !doc.$__.populated[path].options.options.lean) {
      ret = new pop.options[populateModelSymbol](value);
      ret.$__.wasPopulated = true;
    }

    return ret;
  }

  $conditionalHandlers = {
    $all: handleArray,
    $eq: handleSingle,
    $in: handle$in,
    $ne: handleSingle,
    $nin: handle$in,
    $exists: $exists,
    $type: $type
  };

  castForQueryWrapper(params) {
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
  }

  castForQuery($conditional, val) {
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
  }

  _castForQuery(val) {
    return this.applySetters(val, this.$$context);
  }

  static checkRequired(fn) {
    if (arguments.length > 0) {
      this._checkRequired = fn;
    }

    return this._checkRequired;
  }

  checkRequired(val) {
    return val != null;
  }

  clone() {
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
  }
}

exports.CastError = CastError;
exports.ValidatorError = ValidatorError;
```