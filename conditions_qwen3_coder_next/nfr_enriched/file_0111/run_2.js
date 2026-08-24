Schema.prototype.add = function add(obj, prefix) {
  if (obj instanceof Schema || (obj != null && obj.instanceOfSchema)) {
    merge(this, obj);
    return this;
  }

  if (obj._id === false && prefix == null) {
    this.options._id = false;
  }

  prefix = prefix || '';
  if (isReservedPrefix(prefix)) {
    return this;
  }

  const keys = Object.keys(obj);
  for (const key of keys) {
    if (utils.specialProperties.has(key)) {
      continue;
    }

    const fullPath = prefix + key;
    handleSchemaPath(this, fullPath, obj[key], prefix);
  }

  const addedKeys = Object.keys(obj).map(key => prefix ? prefix + key : key);
  aliasFields(this, addedKeys);
  return this;
};

function isReservedPrefix(prefix) {
  return prefix === '__proto__.' || prefix === 'constructor.' || prefix === 'prototype.';
}

function handleSchemaPath(schema, fullPath, value, prefix) {
  if (value == null) {
    throw new TypeError('Invalid value for schema path `' + fullPath +
      '`, got value "' + value + '"');
  }

  if (fullPath === '_id' && value === false) {
    return;
  }

  if (value instanceof VirtualType || get(value, 'constructor.name', null) === 'VirtualType') {
    schema.virtual(value);
    return;
  }

  if (Array.isArray(value) && value.length === 1 && value[0] == null) {
    throw new TypeError('Invalid value for schema Array path `' + fullPath +
      '`, got value "' + value[0] + '"');
  }

  if (!isPOJOOrSchemaTypeOptions(value)) {
    setNestedFlag(schema, prefix);
    schema.path(prefix ? prefix + key : fullPath, value);
    return;
  }

  const keys = Object.keys(value);
  if (keys.length === 0) {
    setNestedFlag(schema, prefix);
    schema.path(fullPath, value);
    return;
  }

  if (!hasValidTypeKey(value, schema.options)) {
    setNestedFlag(schema, fullPath);
    schema.add(value, fullPath + '.');
    return;
  }

  handleTypeKeyPOJO(schema, fullPath, value, prefix);
}

function isPOJOOrSchemaTypeOptions(value) {
  return utils.isPOJO(value) || value instanceof SchemaTypeOptions;
}

function hasValidTypeKey(obj, options) {
  const typeKey = options.typeKey;
  if (!obj[typeKey]) return false;
  if (typeKey === 'type' && obj.type && obj.type.type) return false;
  return true;
}

function setNestedFlag(schema, prefix) {
  if (prefix) {
    schema.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
}

function handleTypeKeyPOJO(schema, fullPath, obj, prefix) {
  const typeKey = schema.options.typeKey;

  if (!schema.options.typePojoToMixed && utils.isPOJO(obj[typeKey])) {
    setNestedFlag(schema, prefix);
    const opts = { typePojoToMixed: false };
    const _schema = new Schema(obj[typeKey], opts);
    const schemaWrappedPath = Object.assign({}, obj, { [typeKey]: _schema });
    schema.path(prefix + key, schemaWrappedPath);
  } else {
    setNestedFlag(schema, prefix);
    schema.path(prefix ? prefix + key : fullPath, obj);
  }
}