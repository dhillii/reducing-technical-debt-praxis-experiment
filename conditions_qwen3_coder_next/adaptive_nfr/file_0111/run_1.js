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

    if (obj[key] == null) {
      throw new TypeError('Invalid value for schema path `' + fullPath +
        '`, got value "' + obj[key] + '"');
    }

    if (key === '_id' && obj[key] === false) {
      continue;
    }

    if (obj[key] instanceof VirtualType || isVirtualType(obj[key])) {
      this.virtual(obj[key]);
      continue;
    }

    if (isInvalidArrayValue(obj[key])) {
      throw new TypeError('Invalid value for schema Array path `' + fullPath +
        '`, got value "' + obj[key][0] + '"');
    }

    if (isLeafValue(obj[key])) {
      handleLeafPath(this, obj[key], prefix, key, fullPath);
    } else if (isEmptyObject(obj[key])) {
      handleEmptyObjectPath(this, obj[key], prefix, fullPath);
    } else if (hasBonaFideTypeKey(obj[key], this.options)) {
      handleBonaFideTypeKeyPath(this, obj[key], prefix, key, fullPath);
    } else {
      handleTreePath(this, obj[key], prefix, key, fullPath);
    }
  }

  const addedKeys = Object.keys(obj).
    map(key => prefix ? prefix + key : key);
  aliasFields(this, addedKeys);
  return this;
};

function isReservedPrefix(prefix) {
  return prefix === '__proto__.' || prefix === 'constructor.' || prefix === 'prototype.';
}

function isVirtualType(value) {
  return get(value, 'constructor.name', null) === 'VirtualType';
}

function isInvalidArrayValue(value) {
  return Array.isArray(value) && value.length === 1 && value[0] == null;
}

function isLeafValue(value) {
  return !(utils.isPOJO(value) || value instanceof SchemaTypeOptions);
}

function isEmptyObject(value) {
  return Object.keys(value).length < 1;
}

function hasBonaFideTypeKey(obj, options) {
  const typeKey = options.typeKey;
  if (!obj[typeKey]) {
    return false;
  }
  if (typeKey === 'type' && obj.type.type) {
    return false;
  }
  return true;
}

function handleLeafPath(schema, value, prefix, key, fullPath) {
  if (prefix) {
    schema.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
  schema.path(prefix + key, value);
}

function handleEmptyObjectPath(schema, value, prefix, fullPath) {
  if (prefix) {
    schema.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
  schema.path(fullPath, value);
}

function handleBonaFideTypeKeyPath(schema, obj, prefix, key, fullPath) {
  if (!schema.options.typePojoToMixed && utils.isPOJO(obj[schema.options.typeKey])) {
    if (prefix) {
      schema.nested[prefix.substr(0, prefix.length - 1)] = true;
    }
    const opts = { typePojoToMixed: false };
    const _schema = new Schema(obj[schema.options.typeKey], opts);
    const schemaWrappedPath = Object.assign({}, obj, { [schema.options.typeKey]: _schema });
    schema.path(prefix + key, schemaWrappedPath);
  } else {
    if (prefix) {
      schema.nested[prefix.substr(0, prefix.length - 1)] = true;
    }
    schema.path(prefix + key, obj);
  }
}

function handleTreePath(schema, obj, prefix, key, fullPath) {
  schema.nested[fullPath] = true;
  schema.add(obj, fullPath + '.');
}