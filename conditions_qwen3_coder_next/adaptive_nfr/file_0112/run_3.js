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
  prepareImmutableOption(this, options);
  processSchemaTypeOptions(this, options);
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

  if (options.select == null) {
    delete options.select;
  }

  const Options = schemaType.OptionsConstructor || SchemaTypeOptions;
  schemaType.options = new Options(options);
}

function prepareImmutableOption(schemaType, options) {
  if (!utils.hasUserDefinedProperty(options, 'immutable')) {
    return;
  }

  schemaType.$immutable = options.immutable;
  handleImmutable(schemaType);
}

function processSchemaTypeOptions(schemaType, options) {
  schemaType._index = null;
  const keys = Object.keys(options);

  for (const prop of keys) {
    if (prop === 'cast') {
      schemaType.castFunction(options[prop]);
      continue;
    }

    if (!utils.hasUserDefinedProperty(options, prop) || typeof schemaType[prop] !== 'function') {
      continue;
    }

    if (prop === 'index' && schemaType._index) {
      processIndexOption(schemaType, options);
      continue;
    }

    if (prop === 'default') {
      schemaType.default(options[prop]);
      continue;
    }

    const opts = Array.isArray(options[prop]) ? options[prop] : [options[prop]];
    schemaType[prop].apply(schemaType, opts);
  }
}

function processIndexOption(schemaType, options) {
  if (options.index === false) {
    const index = schemaType._index;
    if (isInvalidIndexOption(index)) {
      throwInvalidIndexError(schemaType);
    }
    schemaType._index = false;
  }
}

function isInvalidIndexOption(index) {
  if (index == null) {
    return false;
  }
  if (typeof index !== 'object') {
    return false;
  }
  return index.unique || index.sparse;
}

function throwInvalidIndexError(schemaType) {
  const index = schemaType._index;
  if (index.unique) {
    throw new Error('Path "' + schemaType.path + '" may not have `index` ' +
      'set to false and `unique` set to true');
  }
  if (index.sparse) {
    throw new Error('Path "' + schemaType.path + '" may not have `index` ' +
      'set to false and `sparse` set to true');
  }
}