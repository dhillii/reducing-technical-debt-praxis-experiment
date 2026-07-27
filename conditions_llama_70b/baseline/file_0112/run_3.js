function SchemaType(path, options, instance) {
  this[schemaTypeSymbol] = true;
  this.path = path;
  this.instance = instance;
  this.validators = [];
  this.getters = this.constructor.hasOwnProperty('getters') ? this.constructor.getters.slice() : [];
  this.setters = [];

  this.splitPath();

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

  const Options = this.OptionsConstructor || SchemaTypeOptions;
  this.options = new Options(options);
  this._index = null;

  if (utils.hasUserDefinedProperty(this.options, 'immutable')) {
    this.$immutable = this.options.immutable;
    handleImmutable(this);
  }

  const keys = Object.keys(this.options);
  for (const prop of keys) {
    if (prop === 'cast') {
      this.castFunction(this.options[prop]);
      continue;
    }
    if (utils.hasUserDefinedProperty(this.options, prop) && typeof this[prop] === 'function') {
      this.applyOption(prop, this.options[prop]);
    }
  }

  Object.defineProperty(this, '$$context', {
    enumerable: false,
    configurable: false,
    writable: true,
    value: null
  });
}

SchemaType.prototype.applyOption = function(prop, val) {
  if (prop === 'index' && this._index) {
    if (val === false) {
      const index = this._index;
      if (typeof index === 'object' && index != null) {
        if (index.unique) {
          throw new Error('Path "' + this.path + '" may not have `index` ' +
            'set to false and `unique` set to true');
        }
        if (index.sparse) {
          throw new Error('Path "' + this.path + '" may not have `index` ' +
            'set to false and `sparse` set to true');
        }
      }

      this._index = false;
    }
    return;
  }

  const opts = Array.isArray(val) ? val : [val];

  if (prop === 'default') {
    this.default(val);
    return;
  }

  this[prop].apply(this, opts);
};

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