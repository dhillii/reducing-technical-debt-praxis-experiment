Schema.prototype.add = function add(obj, prefix) {
  if (obj instanceof Schema || (obj != null && obj.instanceOfSchema)) {
    merge(this, obj);
    return this;
  }

  if (isTopLevelIdDisabled(obj)) {
    this.options._id = false;
    return this;
  }

  prefix = prefix || '';
  if (isPrefixInvalid(prefix)) {
    return this;
  }

  const keys = Object.keys(obj);
  for (const key of keys) {
    if (isKeyIgnored(key)) {
      continue;
    }

    const fullPath = prefix + key;
    if (obj[key] == null) {
      throw new TypeError(`Invalid value for schema path '${fullPath}', got value "${obj[key]}"`);
    }

    if (isIdDisabled(key, obj[key])) {
      continue;
    }

    if (isVirtualType(obj[key])) {
      this.virtual(obj[key]);
      continue;
    }

    if (isArrayWithInvalidValue(obj[key])) {
      throw new TypeError(`Invalid value for schema Array path '${fullPath}', got value "${obj[key][0]}"`);
    }

    if (isNonOptionsObject(obj[key])) {
      this.path(prefix + key, obj[key]);
    } else if (isObjectWithNoTypeKey(obj[key], this.options)) {
      this.add(obj[key], fullPath + '.');
    } else {
      this.path(prefix + key, obj[key]);
    }
  }

  const addedKeys = keys.map(key => prefix ? prefix + key : key);
  aliasFields(this, addedKeys);
  return this;
};

function isTopLevelIdDisabled(obj) {
  return obj._id === false && prefix == null;
}

function isPrefixInvalid(prefix) {
  return prefix === '__proto__.' || prefix === 'constructor.' || prefix === 'prototype.';
}

function isKeyIgnored(key) {
  return utils.specialProperties.has(key);
}

function isIdDisabled(key, value) {
  return key === '_id' && value === false;
}

function isVirtualType(obj) {
  return obj instanceof VirtualType || getConstructorName(obj) === 'VirtualType';
}

function isArrayWithInvalidValue(arr) {
  return Array.isArray(arr) && arr.length === 1 && arr[0] == null;
}

function isNonOptionsObject(obj) {
  return !(utils.isPOJO(obj) || obj instanceof SchemaTypeOptions);
}

function isObjectWithNoTypeKey(obj, options) {
  return Object.keys(obj).length > 0 && !obj[options.typeKey] && (options.typeKey === 'type' || !obj.type.type);
}