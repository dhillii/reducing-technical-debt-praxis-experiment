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

  options = this._mergeDefaultOptions(options);

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

  this._applyOptionMethods(options);

  Object.defineProperty(this, '$$context', {
    enumerable: false,
    configurable: false,
    writable: true,
    value: null
  });
}

/**
 * Merge default options with provided options
 * @private
 */
SchemaType.prototype._mergeDefaultOptions = function(options) {
  options = options || {};
  const defaultOptions = this.constructor.defaultOptions || {};

  for (const option in defaultOptions) {
    if (defaultOptions.hasOwnProperty(option) && !options.hasOwnProperty(option)) {
      options[option] = defaultOptions[option];
    }
  }

  return options;
};

/**
 * Apply option methods to the schema type
 * @private
 */
SchemaType.prototype._applyOptionMethods = function(options) {
  const keys = Object.keys(this.options);

  for (const prop of keys) {
    if (prop === 'cast') {
      this.castFunction(this.options[prop]);
      continue;
    }

    if (!utils.hasUserDefinedProperty(this.options, prop) || typeof this[prop] !== 'function') {
      continue;
    }

    this._applyOptionMethod(prop, options);
  }
};

/**
 * Apply a single option method
 * @private
 */
SchemaType.prototype._applyOptionMethod = function(prop, options) {
  if (prop === 'index') {
    this._handleIndexOption(options);
    return;
  }

  if (prop === 'default') {
    this.default(options[prop]);
    return;
  }

  const val = options[prop];
  const opts = Array.isArray(val) ? val : [val];
  this[prop].apply(this, opts);
};

/**
 * Handle index option with validation
 * @private
 */
SchemaType.prototype._handleIndexOption = function(options) {
  if (!this._index) {
    return;
  }

  if (options.index === false) {
    this._validateIndexConflict();
    this._index = false;
  }
};

/**
 * Validate index conflicts
 * @private
 */
SchemaType.prototype._validateIndexConflict = function() {
  const index = this._index;
  if (typeof index !== 'object' || index == null) {
    return;
  }

  if (index.unique) {
    throw new Error(`Path "${this.path}" may not have \`index\` set to false and \`unique\` set to true`);
  }

  if (index.sparse) {
    throw new Error(`Path "${this.path}" may not have \`index\` set to false and \`sparse\` set to true`);
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
  this._cast = caster === false ? v => v : caster;
  return this._cast;
};

SchemaType.prototype.castFunction = function castFunction(caster) {
  if (arguments.length === 0) {
    return this._castFunction;
  }
  this._castFunction = caster === false ? (this.constructor._defaultCaster || (v => v)) : caster;
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

SchemaType.prototype.index = function(options) {
  this._index = options;
  utils.expires(this._index);
  return this;
};

SchemaType.prototype.unique = function(bool) {
  if (this._index === false) {
    if (!bool) {
      return;
    }
    throw new Error(`Path "${this.path}" may not have \`index\` set to false and \`unique\` set to true`);
  }

  this._index = this._normalizeIndexObject(this._index);
  this._index.unique = bool;
  return this;
};

SchemaType.prototype.text = function(bool) {
  if (this._index === false) {
    if (!bool) {
      return;
    }
    throw new Error(`Path "${this.path}" may not have \`index\` set to false and \`text\` set to true`);
  }

  this._index = this._normalizeIndexObject(this._index);
  this._index.text = bool;
  return this;
};

SchemaType.prototype.sparse = function(bool) {
  if (this._index === false) {
    if (!bool) {
      return;
    }
    throw new Error(`Path "${this.path}" may not have \`index\` set to false and \`sparse\` set to true`);
  }

  this._index = this._normalizeIndexObject(this._index);
  this._index.sparse = bool;
  return this;
};

/**
 * Normalize index to object format
 * @private
 */
SchemaType.prototype._normalizeIndexObject = function(index) {
  if (index == null || typeof index === 'boolean') {
    return {};
  }
  if (typeof index === 'string') {
    return { type: index };
  }
  return index;
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
  if (typeof obj === 'function' || (obj && utils.getFunctionName(obj.constructor) === 'RegExp')) {
    this._addSingleValidator(obj, message, type);
    return this;
  }

  for (let i = 0; i < arguments.length; i++) {
    const arg = arguments[i];
    if (!utils.isPOJO(arg)) {
      throw new Error(
        `Invalid validator. Received (${typeof arg}) ${arg}. ` +
        'See http://mongoosejs.com/docs/api.html#schematype_SchemaType-validate'
      );
    }
    this.validate(arg.validator, arg);
  }

  return this;
};

/**
 * Add a single validator
 * @private
 */
SchemaType.prototype._addSingleValidator = function(obj, message, type) {
  let properties;

  if (typeof message === 'function') {
    properties = { validator: obj, message: message, type: type || 'user defined' };
  } else if (message instanceof Object && !type) {
    properties = utils.clone(message);
    properties.message = properties.message || properties.msg;
    properties.validator = obj;
    properties.type = properties.type || 'user defined';
  } else {
    properties = {
      validator: obj,
      message: message || MongooseError.messages.general.default,
      type: type || 'user defined'
    };
  }

  if (properties.isAsync) {
    handleIsAsync();
  }

  this.validators.push(properties);
};

const handleIsAsync = util.deprecate(
  function handleIsAsync() {},
  'Mongoose: the `isAsync` option for custom validators is deprecated. ' +
  'Make your async validators return a promise instead: ' +
  'https://mongoosejs.com/docs/validation.html#async-custom-validators'
);

SchemaType.prototype.required = function(required, message) {
  let customOptions = {};

  if (arguments.length > 0 && required == null) {
    this._removeRequiredValidator();
    return this;
  }

  if (typeof required === 'object') {
    customOptions = required;
    message = customOptions.message || message;
    required = required.isRequired;
  }

  if (required === false) {
    this._removeRequiredValidator();
    return this;
  }

  this._setRequiredValidator(required, message, customOptions);
  return this;
};

/**
 * Remove required validator
 * @private
 */
SchemaType.prototype._removeRequiredValidator = function() {
  this.validators = this.validators.filter(v => v.validator !== this.requiredValidator);
  this.isRequired = false;
  delete this.originalRequiredValue;
};

/**
 * Set required validator
 * @private
 */
SchemaType.prototype._setRequiredValidator = function(required, message, customOptions) {
  const _this = this;
  this.isRequired = true;

  this.requiredValidator = function(v) {
    const cachedRequired = get(this, '$__.cachedRequired');

    if (cachedRequired != null && !this.$__isSelected(_this.path) && !this[documentIsModified](_this.path)) {
      return true;
    }

    if (cachedRequired != null && _this.path in cachedRequired) {
      const res = cachedRequired[_this.path] ? _this.checkRequired(v, this) : true;
      delete cachedRequired[_this.path];
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
  }

  const msg = message || MongooseError.messages.general.required;
  this.validators.unshift(Object.assign({}, customOptions, {
    validator: this.requiredValidator,
    message: msg,
    type: 'required'
  }));
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
  if (init) {
    return value;
  }

  let v = value;
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