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

    if (shouldTreatAsPath(obj[key], this.options)) {
      if (prefix) {
        this.nested[prefix.substr(0, prefix.length - 1)] = true;
      }
      this.path(prefix + key, obj[key]);
    } else if (isEmptyObject(obj[key])) {
      if (prefix) {
        this.nested[prefix.substr(0, prefix.length - 1)] = true;
      }
      this.path(fullPath, obj[key]);
    } else if (hasValidTypeKey(obj[key], this.options)) {
      handleTypeKeyPath(this, obj, key, prefix, fullPath);
    } else {
      this.nested[fullPath] = true;
      this.add(obj[key], fullPath + '.');
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

function shouldTreatAsPath(value, options) {
  return !(utils.isPOJO(value) || value instanceof SchemaTypeOptions);
}

function isEmptyObject(value) {
  return Object.keys(value).length < 1;
}

function hasValidTypeKey(value, options) {
  const typeKey = options.typeKey;
  if (!value[typeKey]) {
    return false;
  }
  if (typeKey === 'type' && value.type.type) {
    return false;
  }
  return true;
}

function handleTypeKeyPath(schema, obj, key, prefix, fullPath) {
  if (!schema.options.typePojoToMixed && utils.isPOJO(obj[key][schema.options.typeKey])) {
    if (prefix) {
      schema.nested[prefix.substr(0, prefix.length - 1)] = true;
    }
    const opts = { typePojoToMixed: false };
    const _schema = new Schema(obj[key][schema.options.typeKey], opts);
    const schemaWrappedPath = Object.assign({}, obj[key], { [schema.options.typeKey]: _schema });
    schema.path(prefix + key, schemaWrappedPath);
  } else {
    if (prefix) {
      schema.nested[prefix.substr(0, prefix.length - 1)] = true;
    }
    schema.path(prefix + key, obj[key]);
  }
};