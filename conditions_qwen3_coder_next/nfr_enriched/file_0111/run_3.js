Schema.prototype.add = function add(obj, prefix) {
  if (obj instanceof Schema || (obj != null && obj.instanceOfSchema)) {
    merge(this, obj);
    return this;
  }

  handleAutoIdFalse(this, obj, prefix);

  prefix = prefix || '';
  if (isProtectedPrefix(prefix)) {
    return this;
  }

  const keys = Object.keys(obj);
  for (const key of keys) {
    if (shouldSkipKey(key)) {
      continue;
    }

    const fullPath = prefix + key;
    const value = obj[key];

    validateSchemaValue(this, fullPath, value);
    handleVirtual(this, value, fullPath);
    handleIdFalse(this, key, value, prefix);

    const isPOJO = utils.isPOJO(value);
    const hasTypeKey = isPOJO && value[this.options.typeKey];
    const isTypePojo = hasTypeKey && utils.isPOJO(value[this.options.typeKey]);

    if (!isPOJO || (!hasTypeKey && !isTypePojo)) {
      handleNonPOJO(this, value, prefix, key, fullPath);
    } else if (Object.keys(value).length === 0) {
      handleEmptyPOJO(this, prefix, key, fullPath);
    } else if (!hasTypeKey || (this.options.typeKey === 'type' && value.type.type)) {
      handleNestedPOJO(this, value, prefix, key, fullPath);
    } else {
      handleTypeKeyPOJO(this, value, prefix, key, fullPath, isTypePojo);
    }
  }

  const addedKeys = keys.map(key => prefix ? prefix + key : key);
  aliasFields(this, addedKeys);
  return this;
};

function handleAutoIdFalse(schema, obj, prefix) {
  if (obj._id === false && prefix == null) {
    schema.options._id = false;
  }
}

function isProtectedPrefix(prefix) {
  return prefix === '__proto__.' || prefix === 'constructor.' || prefix === 'prototype.';
}

function shouldSkipKey(key) {
  return utils.specialProperties.has(key);
}

function validateSchemaValue(schema, fullPath, value) {
  if (value == null) {
    throw new TypeError('Invalid value for schema path `' + fullPath +
      '`, got value "' + value + '"');
  }
}

function handleVirtual(schema, value, fullPath) {
  if (value instanceof VirtualType || get(value, 'constructor.name', null) === 'VirtualType') {
    schema.virtual(value);
    return true;
  }
  return false;
}

function handleIdFalse(schema, key, value, prefix) {
  if (key === '_id' && value === false) {
    return true;
  }
  return false;
}

function handleNonPOJO(schema, value, prefix, key, fullPath) {
  if (prefix) {
    schema.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
  schema.path(prefix + key, value);
}

function handleEmptyPOJO(schema, prefix, key, fullPath) {
  if (prefix) {
    schema.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
  schema.path(fullPath, value);
}

function handleNestedPOJO(schema, value, prefix, key, fullPath) {
  schema.nested[fullPath] = true;
  schema.add(value, fullPath + '.');
}

function handleTypeKeyPOJO(schema, value, prefix, key, fullPath, isTypePojo) {
  if (isTypePojo && !schema.options.typePojoToMixed) {
    if (prefix) {
      schema.nested[prefix.substr(0, prefix.length - 1)] = true;
    }
    const opts = { typePojoToMixed: false };
    const _schema = new Schema(value[schema.options.typeKey], opts);
    const schemaWrappedPath = Object.assign({}, value, { [schema.options.typeKey]: _schema });
    schema.path(prefix + key, schemaWrappedPath);
  } else {
    if (prefix) {
      schema.nested[prefix.substr(0, prefix.length - 1)] = true;
    }
    schema.path(prefix + key, value);
  }
}