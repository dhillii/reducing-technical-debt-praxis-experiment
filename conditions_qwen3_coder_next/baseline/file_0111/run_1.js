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
  const addedKeys = keys.map(key => prefix ? prefix + key : key);

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
      this._setNestedPath(prefix, fullPath);
      this.add(obj[key], fullPath + '.');
    } else {
      this._setNestedPath(prefix, fullPath);
      this._handleTypeKey(fullPath, prefix, key, obj);
    }
  }

  aliasFields(this, addedKeys);
  return this;
};

Schema.prototype._setNestedPath = function(prefix, fullPath) {
  if (prefix) {
    this.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
  this.nested[fullPath] = true;
};

Schema.prototype._handleTypeKey = function(fullPath, prefix, key, obj) {
  if (!this.options.typePojoToMixed && utils.isPOJO(obj[key][this.options.typeKey])) {
    const opts = { typePojoToMixed: false };
    const _schema = new Schema(obj[key][this.options.typeKey], opts);
    const schemaWrappedPath = Object.assign({}, obj[key], { [this.options.typeKey]: _schema });
    this.path(prefix + key, schemaWrappedPath);
  } else {
    this.path(prefix + key, obj[key]);
  }
};