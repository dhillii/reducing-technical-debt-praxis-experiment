function SchemaType(path, options, instance) {
  this[schemaTypeSymbol] = true;
  this.path = path;
  this.instance = instance;
  this.validators = [];
  this.getters = this.constructor.hasOwnProperty('getters') ?
    this.constructor.getters.slice() : [];
  this.setters = [];

  this.splitPath();

  options = options || {};
  const defaultOptions = this.constructor.defaultOptions || {};
  const defaultOptionsKeys = Object.keys(defaultOptions);

  applyDefaultOptions(this, defaultOptions, defaultOptionsKeys, options);
  applyImmutableOption(this, options);
  applySchemaTypeOptions(this, options);
  setupContext(this);
}

function applyDefaultOptions(schemaType, defaultOptions, defaultOptionsKeys, options) {
  for (const option of defaultOptionsKeys) {
    if (defaultOptions.hasOwnProperty(option) && !options.hasOwnProperty(option)) {
      options[option] = defaultOptions[option];
    }
  }

  if (options.select == null) {
    delete options.select;
  }
}

function applyImmutableOption(schemaType, options) {
  if (!utils.hasUserDefinedProperty(options, 'immutable')) {
    return;
  }

  schemaType.$immutable = options.immutable;
  handleImmutable(schemaType);
}

function applySchemaTypeOptions(schemaType, options) {
  const Options = schemaType.OptionsConstructor || SchemaTypeOptions;
  schemaType.options = new Options(options);
  schemaType._index = null;

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

    if (prop === 'default') {
      schemaType.default(options[prop]);
      continue;
    }

    const val = Array.isArray(options[prop]) ? options[prop] : [options[prop]];
    schemaType[prop].apply(schemaType, val);
  }
}

function handleIndexOption(schemaType, options) {
  const index = schemaType._index;
  if (!utils.isObject(index) || index == null) {
    return;
  }

  if (index.unique && options.index === false) {
    throw new Error('Path "' + schemaType.path + '" may not have `index` ' +
      'set to false and `unique` set to true');
  }

  if (index.sparse && options.index === false) {
    throw new Error('Path "' + schemaType.path + '" may not have `index` ' +
      'set to false and `sparse` set to true');
  }

  schemaType._index = false;
}

function setupContext(schemaType) {
  Object.defineProperty(schemaType, '$$context', {
    enumerable: false,
    configurable: false,
    writable: true,
    value: null
  });
}