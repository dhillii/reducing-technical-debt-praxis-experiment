Schema.prototype.add = function add(obj, prefix) {
  // Merge another schema
  if (obj instanceof Schema || (obj != null && obj.instanceOfSchema)) {
    merge(this, obj);
    return this;
  }

  // Special case: disable _id
  if (obj._id === false && prefix == null) {
    this.options._id = false;
  }

  prefix = prefix || '';
  // Avoid prototype pollution
  if (['__proto__.', 'constructor.', 'prototype.'].includes(prefix)) {
    return this;
  }

  const keys = Object.keys(obj);

  // Helper functions
  const isVirtual = (v) =>
    v instanceof VirtualType || get(v, 'constructor.name', null) === 'VirtualType';

  const isArrayWithSingleNull = (v) =>
    Array.isArray(v) && v.length === 1 && v[0] == null;

  const isPOJOOrSchemaTypeOptions = (v) =>
    utils.isPOJO(v) || v instanceof SchemaTypeOptions;

  const hasTypeKey = (v) =>
    v[this.options.typeKey] ||
    (this.options.typeKey === 'type' && v.type && v.type.type);

  const setNested = (path) => {
    if (prefix) this.nested[prefix.substr(0, prefix.length - 1)] = true;
  };

  const handleNonPOJOOrSchemaTypeOptions = (fullPath, value) => {
    setNested(fullPath);
    this.path(fullPath, value);
  };

  const handleEmptyObject = (fullPath, value) => {
    setNested(fullPath);
    this.path(fullPath, value);
  };

  const handleNoTypeKey = (fullPath, value) => {
    this.nested[fullPath] = true;
    this.add(value, fullPath + '.');
  };

  const handleWithTypeKey = (fullPath, value) => {
    if (!this.options.typePojoToMixed && utils.isPOJO(value[this.options.typeKey])) {
      setNested(fullPath);
      const opts = { typePojoToMixed: false };
      const _schema = new Schema(value[this.options.typeKey], opts);
      const schemaWrappedPath = Object.assign({}, value, {
        [this.options.typeKey]: _schema,
      });
      this.path(fullPath, schemaWrappedPath);
    } else {
      setNested(fullPath);
      this.path(fullPath, value);
    }
  };

  // Iterate over keys
  for (const key of keys) {
    if (utils.specialProperties.has(key)) continue;

    const fullPath = prefix + key;
    const value = obj[key];

    if (value == null) {
      throw new TypeError(
        `Invalid value for schema path \`${fullPath}\`, got value "${value}"`
      );
    }

    if (key === '_id' && value === false) continue;

    if (isVirtual(value)) {
      this.virtual(value);
      continue;
    }

    if (isArrayWithSingleNull(value)) {
      throw new TypeError(
        `Invalid value for schema Array path \`${fullPath}\`, got value "${value[0]}"`
      );
    }

    if (!isPOJOOrSchemaTypeOptions(value)) {
      handleNonPOJOOrSchemaTypeOptions(fullPath, value);
      continue;
    }

    if (Object.keys(value).length < 1) {
      handleEmptyObject(fullPath, value);
      continue;
    }

    if (!hasTypeKey(value)) {
      handleNoTypeKey(fullPath, value);
      continue;
    }

    handleWithTypeKey(fullPath, value);
  }

  const addedKeys = keys.map((k) => (prefix ? prefix + k : k));
  aliasFields(this, addedKeys);
  return this;
};