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

    this._processSingleProperty(obj, key, prefix, fullPath);
  }

  const addedKeys = Object.keys(obj).
    map(key => prefix ? prefix + key : key);
  aliasFields(this, addedKeys);
  return this;
};

Schema.prototype._processSingleProperty = function(obj, key, prefix, fullPath) {
  const objKey = obj[key];

  if (!(utils.isPOJO(objKey) || objKey instanceof SchemaTypeOptions)) {
    if (prefix) {
      this.nested[prefix.substr(0, prefix.length - 1)] = true;
    }
    this.path(prefix + key, objKey);
    return;
  }

  if (Object.keys(objKey).length < 1) {
    if (prefix) {
      this.nested[prefix.substr(0, prefix.length - 1)] = true;
    }
    this.path(fullPath, objKey);
    return;
  }

  if (!objKey[this.options.typeKey] || (this.options.typeKey === 'type' && objKey.type.type)) {
    this.nested[fullPath] = true;
    this.add(objKey, fullPath + '.');
    return;
  }

  if (!this.options.typePojoToMixed && utils.isPOJO(objKey[this.options.typeKey])) {
    if (prefix) {
      this.nested[prefix.substr(0, prefix.length - 1)] = true;
    }
    const opts = { typePojoToMixed: false };
    const _schema = new Schema(objKey[this.options.typeKey], opts);
    const schemaWrappedPath = Object.assign({}, objKey, { [this.options.typeKey]: _schema });
    this.path(prefix + key, schemaWrappedPath);
  } else {
    if (prefix) {
      this.nested[prefix.substr(0, prefix.length - 1)] = true;
    }
    this.path(prefix + key, objKey);
  }
};