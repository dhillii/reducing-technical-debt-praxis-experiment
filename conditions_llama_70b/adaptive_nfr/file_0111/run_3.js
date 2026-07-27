Schema.prototype.add = function add(obj, prefix) {
  if (!obj) {
    return this;
  }

  if (obj instanceof Schema || (obj != null && obj.instanceOfSchema)) {
    merge(this, obj);
    return this;
  }

  if (obj._id === false && prefix == null) {
    this.options._id = false;
    return this;
  }

  prefix = prefix || '';
  if (prefix === '__proto__.' || prefix === 'constructor.' || prefix === 'prototype.') {
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

    if (isVirtualType(obj[key])) {
      this.virtual(obj[key]);
      continue;
    }

    if (Array.isArray(obj[key]) && obj[key].length === 1 && obj[key][0] == null) {
      throw new TypeError('Invalid value for schema Array path `' + fullPath +
        '`, got value "' + obj[key][0] + '"');
    }

    if (isPOJOOrSchemaTypeOptions(obj[key])) {
      if (hasTypeKey(obj[key], this.options)) {
        this.path(fullPath, obj[key]);
      } else {
        this.add(obj[key], fullPath + '.');
      }
    } else {
      this.path(fullPath, obj[key]);
    }
  }

  const addedKeys = Object.keys(obj).
    map(key => prefix ? prefix + key : key);
  aliasFields(this, addedKeys);
  return this;
};

function isVirtualType(obj) {
  return obj instanceof VirtualType || getConstructorName(obj) === 'VirtualType';
}

function isPOJOOrSchemaTypeOptions(obj) {
  return utils.isPOJO(obj) || obj instanceof SchemaTypeOptions;
}

function hasTypeKey(obj, options) {
  return obj[options.typeKey] || (options.typeKey === 'type' && obj.type.type);
}