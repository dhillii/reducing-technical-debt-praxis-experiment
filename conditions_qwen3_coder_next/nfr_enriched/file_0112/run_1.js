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
  this._applyDefaultOptions(options);
  this._processSelectOption(options);
  this._initializeOptions(options);
  this._handleImmutable(options);

  this._processOptionsKeys(options);
  Object.defineProperty(this, '$$context', {
    enumerable: false,
    configurable: false,
    writable: true,
    value: null
  });
}

SchemaType.prototype._applyDefaultOptions = function(options) {
  const defaultOptions = this.constructor.defaultOptions || {};
  const defaultOptionsKeys = Object.keys(defaultOptions);

  for (const option of defaultOptionsKeys) {
    if (defaultOptions.hasOwnProperty(option) && !options.hasOwnProperty(option)) {
      options[option] = defaultOptions[option];
    }
  }
};

SchemaType.prototype._processSelectOption = function(options) {
  if (options.select == null) {
    delete options.select;
  }
};

SchemaType.prototype._initializeOptions = function(options) {
  const Options = this.OptionsConstructor || SchemaTypeOptions;
  this.options = new Options(options);
  this._index = null;
};

SchemaType.prototype._handleImmutable = function(options) {
  if (utils.hasUserDefinedProperty(this.options, 'immutable')) {
    this.$immutable = this.options.immutable;
    handleImmutable(this);
  }
};

SchemaType.prototype._processOptionsKeys = function(options) {
  const keys = Object.keys(this.options);
  for (const prop of keys) {
    if (prop === 'cast') {
      this.castFunction(this.options[prop]);
      continue;
    }
    if (utils.hasUserDefinedProperty(this.options, prop) && typeof this[prop] === 'function') {
      this._processOptionProperty(prop, options);
    }
  }
};

SchemaType.prototype._processOptionProperty = function(prop, options) {
  if (prop === 'index' && this._index) {
    this._handleIndexProperty(options);
    return;
  }

  const val = options[prop];
  if (prop === 'default') {
    this.default(val);
    return;
  }

  const opts = Array.isArray(val) ? val : [val];
  this[prop].apply(this, opts);
};

SchemaType.prototype._handleIndexProperty = function(options) {
  if (options.index === false) {
    const index = this._index;
    if (typeof index === 'object' && index != null) {
      this._validateIndexOptions(index);
    }
    this._index = false;
  }
};

SchemaType.prototype._validateIndexOptions = function(index) {
  if (index.unique) {
    throw new Error('Path "' + this.path + '" may not have `index` ' +
      'set to false and `unique` set to true');
  }
  if (index.sparse) {
    throw new Error('Path "' + this.path + '" may not have `index` ' +
      'set to false and `sparse` set to true');
  }
};