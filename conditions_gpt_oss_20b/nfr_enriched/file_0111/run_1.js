Schema.prototype.add = function add(obj, prefix) {
  if (obj instanceof Schema || (obj != null && obj.instanceOfSchema)) {
    merge(this, obj);
    return this;
  }

  if (obj._id === false && prefix == null) {
    this.options._id = false;
  }

  prefix = prefix || '';
  if (prefix === '__proto__.' || prefix === 'constructor.' || prefix === 'prototype.') {
    return this;
  }

  const keys = Object.keys(obj);
  const addedKeys = [];

  for (const key of keys) {
    if (utils.specialProperties.has(key)) {
      continue;
    }

    const fullPath = prefix + key;
    addedKeys.push(fullPath);
    const value = obj[key];

    if (value == null) {
      throw new TypeError('Invalid value for schema path `' + fullPath + '`, got value "' + value + '"');
    }

    if (key === '_id' && value === false) {
      continue;
    }

    if (value instanceof VirtualType || get(value, 'constructor.name', null) === 'VirtualType') {
      this.virtual(value);
      continue;
    }

    if (Array.isArray(value) && value.length === 1 && value[0] == null) {
      throw new TypeError('Invalid value for schema Array path `' + fullPath + '`, got value "' + value[0] + '"');
    }

    if (!(utils.isPOJO(value) || value instanceof SchemaTypeOptions)) {
      handleNonPOJO(this, fullPath, value, prefix);
      continue;
    }

    if (Object.keys(value).length < 1) {
      handleEmptyObject(this, fullPath, value, prefix);
      continue;
    }

    if (!value[this.options.typeKey] || (this.options.typeKey === 'type' && value.type.type)) {
      handleNestedObject(this, fullPath, value);
      continue;
    }

    handleTypePojoToMixed(this, fullPath, value, prefix);
  }

  aliasFields(this, addedKeys);
  return this;
};

function handleNonPOJO(schema, fullPath, value, prefix) {
  if (prefix) schema.nested[prefix.substr(0, prefix.length - 1)] = true;
  schema.path(fullPath, value);
}

function handleEmptyObject(schema, fullPath, value, prefix) {
  if (prefix) schema.nested[prefix.substr(0, prefix.length - 1)] = true;
  schema.path(fullPath, value);
}

function handleNestedObject(schema, fullPath, value) {
  schema.nested[fullPath] = true;
  schema.add(value, fullPath + '.');
}

function handleTypePojoToMixed(schema, fullPath, value, prefix) {
  if (!schema.options.typePojoToMixed && utils.isPOJO(value[schema.options.typeKey])) {
    if (prefix) schema.nested[prefix.substr(0, prefix.length - 1)] = true;
    const opts = { typePojoToMixed: false };
    const _schema = new Schema(value[schema.options.typeKey], opts);
    const schemaWrappedPath = Object.assign({}, value, { [schema.options.typeKey]: _schema });
    schema.path(fullPath, schemaWrappedPath);
  } else {
    if (prefix) schema.nested[prefix.substr(0, prefix.length - 1)] = true;
    schema.path(fullPath, value);
  }
}