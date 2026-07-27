Schema.prototype.add = function add(obj, prefix) {
  if (isSchemaOrInstanceOfSchema(obj)) {
    merge(this, obj);
    return this;
  }

  if (isTopLevelIdFalse(obj, prefix)) {
    this.options._id = false;
  }

  prefix = prefix || '';

  if (isPrototypePollution(prefix)) {
    return this;
  }

  const keys = Object.keys(obj);

  for (const key of keys) {
    if (isSpecialProperty(key)) {
      continue;
    }

    const fullPath = prefix + key;

    if (isNullish(obj[key])) {
      throw new TypeError('Invalid value for schema path `' + fullPath +
        '`, got value "' + obj[key] + '"');
    }

    if (isIdFalse(key, obj[key])) {
      continue;
    }

    if (isVirtual(obj[key])) {
      this.virtual(obj[key]);
      continue;
    }

    if (isArrayWithNull(obj[key])) {
      throw new TypeError('Invalid value for schema Array path `' + fullPath +
        '`, got value "' + obj[key][0] + '"');
    }

    if (isNonOptions(obj[key])) {
      setNestedPrefix(prefix);
      this.path(prefix + key, obj[key]);
      continue;
    }

    if (isEmptyObject(obj[key])) {
      setNestedPrefix(prefix);
      this.path(fullPath, obj[key]); // mixed type
      continue;
    }

    if (hasNoTypeKey(obj[key], this.options)) {
      this.nested[fullPath] = true;
      this.add(obj[key], fullPath + '.');
      continue;
    }

    if (isTypePojoToMixedFalseAndPojo(obj[key], this.options)) {
      setNestedPrefix(prefix);
      const opts = { typePojoToMixed: false };
      const _schema = new Schema(obj[key][this.options.typeKey], opts);
      const schemaWrappedPath = Object.assign({}, obj[key], { [this.options.typeKey]: _schema });
      this.path(prefix + key, schemaWrappedPath);
      continue;
    }

    setNestedPrefix(prefix);
    this.path(prefix + key, obj[key]);
  }

  const addedKeys = Object.keys(obj).map(key => prefix ? prefix + key : key);
  aliasFields(this, addedKeys);
  return this;
};

/** @private */
function isSchemaOrInstanceOfSchema(obj) {
  return obj instanceof Schema || (obj != null && obj.instanceOfSchema);
}

/** @private */
function isTopLevelIdFalse(obj, prefix) {
  return obj._id === false && prefix == null;
}

/** @private */
function isPrototypePollution(prefix) {
  return prefix === '__proto__.' || prefix === 'constructor.' || prefix === 'prototype.';
}

/** @private */
function isSpecialProperty(key) {
  return utils.specialProperties.has(key);
}

/** @private */
function isNullish(value) {
  return value == null;
}

/** @private */
function isIdFalse(key, value) {
  return key === '_id' && value === false;
}

/** @private */
function isVirtual(value) {
  return value instanceof VirtualType || get(value, 'constructor.name', null) === 'VirtualType';
}

/** @private */
function isArrayWithNull(value) {
  return Array.isArray(value) && value.length === 1 && value[0] == null;
}

/** @private */
function isNonOptions(value) {
  return !(utils.isPOJO(value) || value instanceof SchemaTypeOptions);
}

/** @private */
function isEmptyObject(value) {
  return Object.keys(value).length < 1;
}

/** @private */
function hasNoTypeKey(value, options) {
  return !value[options.typeKey] || (options.typeKey === 'type' && value.type.type);
}

/** @private */
function isTypePojoToMixedFalseAndPojo(value, options) {
  return !options.typePojoToMixed && utils.isPOJO(value[options.typeKey]);
}

/** @private */
function setNestedPrefix(prefix) {
  if (prefix) {
    this.nested[prefix.substr(0, prefix.length - 1)] = true;
  }
}