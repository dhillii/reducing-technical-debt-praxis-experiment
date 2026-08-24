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

    if (obj[key] instanceof VirtualType || get(obj[key], 'constructor.name', null) === 'VirtualType') {
      this.virtual(obj[key]);
      continue;
    }

    if (Array.isArray(obj[key]) && obj[key].length === 1 && obj[key][0] == null) {
      throw new TypeError('Invalid value for schema Array path `' + fullPath +
        '`, got value "' + obj[key][0] + '"');
    }

    if (!(utils.isPOJO(obj[key]) || obj[key] instanceof SchemaTypeOptions)) {
      this._setNestedPath(prefix, fullPath);
      this.path(fullPath, obj[key]);
    } else if (Object.keys(obj[key]).length < 1) {
      this._setNestedPath(prefix, fullPath);
      this.path(fullPath, obj[key]);
    } else if (!obj[key][this.options.typeKey] || (this.options.typeKey === 'type' && obj[key].type.type)) {
      this.nested[fullPath] = true;
      this.add(obj[key], fullPath + '.');
    } else {
      this._handleTypeKey(fullPath, prefix, obj[key]);
    }
  }

  const addedKeys = Object.keys(obj).map(key => prefix ? prefix + key : key);
  aliasFields(this, addedKeys);
  return this;
};

Schema.prototype._setNestedPath = function(prefix, fullPath) {
  if (prefix) {
    this.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
};

Schema.prototype._handleTypeKey = function(fullPath, prefix, value) {
  if (!this.options.typePojoToMixed && utils.isPOJO(value[this.options.typeKey])) {
    if (prefix) {
      this.nested[prefix.substr(0, prefix.length - 1)] = true;
    }
    const opts = { typePojoToMixed: false };
    const _schema = new Schema(value[this.options.typeKey], opts);
    const schemaWrappedPath = Object.assign({}, value, { [this.options.typeKey]: _schema });
    this.path(prefix + fullPath.substr(prefix.length), schemaWrappedPath);
  } else {
    if (prefix) {
      this.nested[prefix.substr(0, prefix.length - 1)] = true;
    }
    this.path(prefix + fullPath.substr(prefix.length), value);
  }
};