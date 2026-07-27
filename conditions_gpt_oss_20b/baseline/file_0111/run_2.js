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

  const nestedPrefix = prefix ? prefix.slice(0, -1) : null;
  const markNested = () => { if (nestedPrefix) this.nested[nestedPrefix] = true; };

  const keys = Object.keys(obj);
  for (const key of keys) {
    if (utils.specialProperties.has(key)) continue;

    const fullPath = prefix + key;
    const value = obj[key];

    if (value == null) {
      throw new TypeError(`Invalid value for schema path \`${fullPath}\`, got value "${value}"`);
    }

    if (key === '_id' && value === false) continue;

    if (value instanceof VirtualType || get(value, 'constructor.name', null) === 'VirtualType') {
      this.virtual(value);
      continue;
    }

    if (Array.isArray(value) && value.length === 1 && value[0] == null) {
      throw new TypeError(`Invalid value for schema Array path \`${fullPath}\`, got value "${value[0]}"`);
    }

    const isOptions = utils.isPOJO(value) || value instanceof SchemaTypeOptions;
    if (!isOptions) {
      markNested();
      this.path(prefix + key, value);
      continue;
    }

    if (Object.keys(value).length < 1) {
      markNested();
      this.path(fullPath, value);
      continue;
    }

    const hasTypeKey = !value[this.options.typeKey] || (this.options.typeKey === 'type' && value.type && value.type.type);
    if (!hasTypeKey) {
      this.nested[fullPath] = true;
      this.add(value, fullPath + '.');
      continue;
    }

    const isTypePojoToMixed = !this.options.typePojoToMixed && utils.isPOJO(value[this.options.typeKey]);
    if (isTypePojoToMixed) {
      markNested();
      const opts = { typePojoToMixed: false };
      const _schema = new Schema(value[this.options.typeKey], opts);
      const schemaWrappedPath = Object.assign({}, value, { [this.options.typeKey]: _schema });
      this.path(prefix + key, schemaWrappedPath);
    } else {
      markNested();
      this.path(prefix + key, value);
    }
  }

  const addedKeys = keys.map(k => prefix ? prefix + k : k);
  aliasFields(this, addedKeys);
  return this;
};