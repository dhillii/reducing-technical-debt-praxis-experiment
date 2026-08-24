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
  this._initializeOptions(options);
  this._applyOptionProperties();
  this._setupImmutable();
  this._applyCustomSettersAndOptions();

  Object.defineProperty(this, '$$context', {
    enumerable: false,
    configurable: false,
    writable: true,
    value: null
  });
}

SchemaType.prototype._initializeOptions = function(options) {
  options = options || {};
  const defaultOptions = this.constructor.defaultOptions || {};
  const defaultOptionsKeys = Object.keys(defaultOptions);

  for (const option of defaultOptionsKeys) {
    if (defaultOptions.hasOwnProperty(option) && !options.hasOwnProperty(option)) {
      options[option] = defaultOptions[option];
    }
  }

  if (options.select == null) {
    delete options.select;
  }

  const Options = this.constructor.OptionsConstructor || SchemaTypeOptions;
  this.options = new Options(options);
  this._index = null;
};

SchemaType.prototype._applyOptionProperties = function() {
  const keys = Object.keys(this.options);
  const propsToSkip = ['cast', 'default', 'index'];

  for (const prop of keys) {
    if (prop === 'index') {
      this._handleIndexOption();
      continue;
    }

    if (propsToSkip.indexOf(prop) !== -1) {
      continue;
    }

    if (utils.hasUserDefinedProperty(this.options, prop) && typeof this[prop] === 'function') {
      const val = this.options[prop];
      const opts = Array.isArray(val) ? val : [val];
      this[prop].apply(this, opts);
    }
  }
};

SchemaType.prototype._handleIndexOption = function() {
  const options = this.options;
  if (options.index === false && this._index) {
    this._validateIndexConflict();
    this._index = false;
  }
};

SchemaType.prototype._validateIndexConflict = function() {
  const index = this._index;
  if (typeof index !== 'object' || index == null) {
    return;
  }

  if (index.unique) {
    throw new Error('Path "' + this.path + '" may not have `index` ' +
      'set to false and `unique` set to true');
  }

  if (index.sparse) {
    throw new Error('Path "' + this.path + '" may not have `index` ' +
      'set to false and `sparse` set to true');
  }
};

SchemaType.prototype._setupImmutable = function() {
  if (!utils.hasUserDefinedProperty(this.options, 'immutable')) {
    return;
  }

  this.$immutable = this.options.immutable;
  handleImmutable(this);
};

SchemaType.prototype._applyCustomSettersAndOptions = function() {
  if (utils.hasUserDefinedProperty(this.options, 'cast')) {
    this.castFunction(this.options.cast);
    return;
  }

  const options = this.options;
  if (utils.hasUserDefinedProperty(options, 'default')) {
    this.default(options.default);
  }
};