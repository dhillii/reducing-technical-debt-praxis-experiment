Schema.prototype.add = function add(obj, prefix) {
  if (obj instanceof Schema || (obj != null && obj.instanceOfSchema)) {
    merge(this, obj);
    return this;
  }

  if (obj._id === false && prefix == null) {
    this.options._id = false;
  }

  prefix = prefix || '';
  if (['__proto__.', 'constructor.', 'prototype.'].includes(prefix)) {
    return this;
  }

  const keys = Object.keys(obj);
  const addedKeys = [];
  const opts = this.options;

  const markNested = p => {
    if (p) this.nested[p.slice(0, -1)] = true;
  };

  const isVirtual = v => v instanceof VirtualType || get(v, 'constructor.name', null) === 'VirtualType';
  const isArrayWithNull = v => Array.isArray(v) && v.length === 1 && v[0] == null;
  const isLeafPath = v => !(utils.isPOJO(v) || v instanceof SchemaTypeOptions);
  const isEmptyPOJO = v => utils.isPOJO(v) && Object.keys(v).length === 0;
  const hasNoTypeKey = v => !v[opts.typeKey] || (opts.typeKey === 'type' && v.type && v.type.type);
  const isTypeKeyPOJO = v => utils.isPOJO(v[opts.typeKey]);

  for (const key of keys) {
    if (utils.specialProperties.has(key)) continue;

    const fullPath = prefix + key;
    const val = obj[key];

    if (val == null) {
      throw new TypeError(`Invalid value for schema path \`${fullPath}\`, got value "${val}"`);
    }

    if (key === '_id' && val === false) continue;

    if (isVirtual(val)) {
      this.virtual(val);
      continue;
    }

    if (isArrayWithNull(val)) {
      throw new TypeError(`Invalid value for schema Array path \`${fullPath}\`, got value "${val[0]}"`);
    }

    if (isLeafPath(val)) {
      markNested(prefix);
      this.path(fullPath, val);
      addedKeys.push(fullPath);
      continue;
    }

    if (isEmptyPOJO(val)) {
      markNested(prefix);
      this.path(fullPath, val);
      addedKeys.push(fullPath);
      continue;
    }

    if (hasNoTypeKey(val)) {
      this.nested[fullPath] = true;
      this.add(val, fullPath + '.');
      continue;
    }

    // has a type key
    if (!opts.typePojoToMixed && isTypeKeyPOJO(val)) {
      markNested(prefix);
      const subOpts = { typePojoToMixed: false };
      const subSchema = new Schema(val[opts.typeKey], subOpts);
      const wrapped = Object.assign({}, val, { [opts.typeKey]: subSchema });
      this.path(fullPath, wrapped);
      addedKeys.push(fullPath);
    } else {
      markNested(prefix);
      this.path(fullPath, val);
      addedKeys.push(fullPath);
    }
  }

  aliasFields(this, addedKeys);
  return this;
};