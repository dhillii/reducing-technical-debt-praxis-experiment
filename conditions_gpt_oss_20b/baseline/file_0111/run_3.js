/**
 * Adds key path / schema type pairs to this schema.
 *
 * @param {Object|Schema} obj plain object with paths to add, or another schema
 * @param {String} [prefix] path to prefix the newly added paths with
 * @return {Schema} the Schema instance
 * @api public
 */
Schema.prototype.add = function add(obj, prefix) {
  // Merge another schema
  if (obj instanceof Schema || (obj != null && obj.instanceOfSchema)) {
    merge(this, obj);
    return this;
  }

  // Special case: setting top-level `_id` to false should convert to disabling
  // the `_id` option. This behavior never worked before 5.4.11 but numerous
  // codebases use it (see gh-7516, gh-7512).
  if (obj._id === false && prefix == null) {
    this.options._id = false;
  }

  prefix = prefix || '';

  // avoid prototype pollution
  if (prefix === '__proto__.' || prefix === 'constructor.' || prefix === 'prototype.') {
    return this;
  }

  const keys = Object.keys(obj);
  const addedKeys = keys.map(key => prefix ? prefix + key : key);

  for (const key of keys) {
    const fullPath = prefix + key;
    const value = obj[key];

    if (value == null) {
      throw new TypeError(`Invalid value for schema path \`${fullPath}\`, got value "${value}"`);
    }

    // Retain `_id: false` but don't set it as a path, re: gh-8274.
    if (key === '_id' && value === false) {
      continue;
    }

    // Handle virtuals
    if (value instanceof VirtualType || get(value, 'constructor.name', null) === 'VirtualType') {
      this.virtual(value);
      continue;
    }

    // Handle array with single null
    if (Array.isArray(value) && value.length === 1 && value[0] == null) {
      throw new TypeError(`Invalid value for schema Array path \`${fullPath}\`, got value "${value[0]}"`);
    }

    // If not a POJO or SchemaTypeOptions, treat as a path
    if (!(utils.isPOJO(value) || value instanceof SchemaTypeOptions)) {
      this.path(fullPath, value);
      continue;
    }

    // Empty POJO => Mixed
    if (Object.keys(value).length < 1) {
      this.path(fullPath, value);
      continue;
    }

    // No type key or special type key handling => nested object
    if (!value[this.options.typeKey] || (this.options.typeKey === 'type' && value.type.type)) {
      this.nested[fullPath] = true;
      this.add(value, fullPath + '.');
      continue;
    }

    // Has a bona-fide type key
    this.path(fullPath, value);
  }

  aliasFields(this, addedKeys);
  return this;
};