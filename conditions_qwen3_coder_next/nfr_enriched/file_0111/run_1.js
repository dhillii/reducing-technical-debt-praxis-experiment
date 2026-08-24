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
    handleSchemaPath(this, obj, key, fullPath, prefix);
  }

  const addedKeys = Object.keys(obj).map(key => prefix ? prefix + key : key);
  aliasFields(this, addedKeys);
  return this;
};

function isReservedPrefix(prefix) {
  return prefix === '__proto__.' || prefix === 'constructor.' || prefix === 'prototype.';
}

function handleSchemaPath(schema, obj, key, fullPath, prefix) {
  if (obj[key] == null) {
    throw new TypeError('Invalid value for schema path `' + fullPath +
      '`, got value "' + obj[key] + '"');
  }

  if (key === '_id' && obj[key] === false) {
    return;
  }

  if (obj[key] instanceof VirtualType || get(obj[key], 'constructor.name', null) === 'VirtualType') {
    schema.virtual(obj[key]);
    return;
  }

  if (Array.isArray(obj[key]) && obj[key].length === 1 && obj[key][0] == null) {
    throw new TypeError('Invalid value for schema Array path `' + fullPath +
      '`, got value "' + obj[key][0] + '"');
  }

  if (!isPlainObjectOrSchemaTypeOptions(obj[key])) {
    handleNonPOJOPath(schema, obj, key, fullPath, prefix);
  } else if (Object.keys(obj[key]).length === 0) {
    handleEmptyObjectPath(schema, obj, key, fullPath, prefix);
  } else if (hasValidTypeKey(obj, key, schema.options)) {
    handleTypeKeyPath(schema, obj, key, fullPath, prefix);
  } else {
    handleNestedPOJOPath(schema, obj, key, fullPath, prefix);
  }
}

function isPlainObjectOrSchemaTypeOptions(value) {
  return utils.isPOJO(value) || value instanceof SchemaTypeOptions;
}

function handleNonPOJOPath(schema, obj, key, fullPath, prefix) {
  if (prefix) {
    schema.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
  schema.path(prefix + key, obj[key]);
}

function handleEmptyObjectPath(schema, obj, key, fullPath, prefix) {
  if (prefix) {
    schema.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
  schema.path(fullPath, obj[key]);
}

function hasValidTypeKey(obj, key, options) {
  const typeKey = obj[key][options.typeKey];
  if (!typeKey) {
    return false;
  }
  if (options.typeKey === 'type' && typeKey.type) {
    return false;
  }
  return true;
}

function handleTypeKeyPath(schema, obj, key, fullPath, prefix) {
  if (!schema.options.typePojoToMixed && utils.isPOJO(obj[key][schema.options.typeKey])) {
    handleTypeKeyAsPOJO(schema, obj, key, prefix);
  } else {
    handleTypeKeyAsNonPOJO(schema, obj, key, prefix);
  }
}

function handleTypeKeyAsPOJO(schema, obj, key, prefix) {
  if (prefix) {
    schema.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
  const opts = { typePojoToMixed: false };
  const _schema = new Schema(obj[key][schema.options.typeKey], opts);
  const schemaWrappedPath = Object.assign({}, obj[key], { [schema.options.typeKey]: _schema });
  schema.path(prefix + key, schemaWrappedPath);
}

function handleTypeKeyAsNonPOJO(schema, obj, key, prefix) {
  if (prefix) {
    schema.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
  schema.path(prefix + key, obj[key]);
}

function handleNestedPOJOPath(schema, obj, key, fullPath, prefix) {
  schema.nested[fullPath] = true;
  schema.add(obj[key], fullPath + '.');
}