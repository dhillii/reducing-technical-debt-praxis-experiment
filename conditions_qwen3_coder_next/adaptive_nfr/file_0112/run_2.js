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
  applyDefaultOptions(this, options);
  normalizeSelectOption(this, options);
  assignOptions(this, options);

  if (utils.hasUserDefinedProperty(this.options, 'immutable')) {
    this.$immutable = this.options.immutable;
    handleImmutable(this);
  }

  processOptions(this, options);
  Object.defineProperty(this, '$$context', {
    enumerable: false,
    configurable: false,
    writable: true,
    value: null
  });
}

function applyDefaultOptions(schemaType, options) {
  const defaultOptions = schemaType.constructor.defaultOptions || {};
  const defaultOptionsKeys = Object.keys(defaultOptions);

  for (const option of defaultOptionsKeys) {
    if (defaultOptions.hasOwnProperty(option) && !options.hasOwnProperty(option)) {
      options[option] = defaultOptions[option];
    }
  }
}

function normalizeSelectOption(schemaType, options) {
  if (options.select == null) {
    delete options.select;
  }
}

function assignOptions(schemaType, options) {
  const Options = schemaType.OptionsConstructor || SchemaTypeOptions;
  schemaType.options = new Options(options);
  schemaType._index = null;
}

function processOptions(schemaType, options) {
  const keys = Object.keys(schemaType.options);
  for (const prop of keys) {
    if (prop === 'cast') {
      schemaType.castFunction(schemaType.options[prop]);
      continue;
    }

    if (!utils.hasUserDefinedProperty(schemaType.options, prop) || typeof schemaType[prop] !== 'function') {
      continue;
    }

    if (prop === 'index' && schemaType._index) {
      handleIndexOption(schemaType, options);
      continue;
    }

    const val = options[prop];
    if (prop === 'default') {
      schemaType.default(val);
      continue;
    }

    const opts = Array.isArray(val) ? val : [val];
    schemaType[prop].apply(schemaType, opts);
  }
}

function handleIndexOption(schemaType, options) {
  if (options.index === false) {
    const index = schemaType._index;
    if (typeof index === 'object' && index != null) {
      if (index.unique) {
        throw new Error('Path "' + schemaType.path + '" may not have `index` ' +
          'set to false and `unique` set to true');
      }
      if (index.sparse) {
        throw new Error('Path "' + schemaType.path + '" may not have `index` ' +
          'set to false and `sparse` set to true');
      }
    }
    schemaType._index = false;
  }
}