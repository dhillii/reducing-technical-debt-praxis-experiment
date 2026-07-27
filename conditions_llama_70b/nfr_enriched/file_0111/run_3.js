Schema.prototype.add = function add(obj, prefix) {
  // Check if obj is a schema or has instanceOfSchema property
  if (obj instanceof Schema || (obj != null && obj.instanceOfSchema)) {
    merge(this, obj);
    return this;
  }

  // Handle special case for top-level _id
  if (obj._id === false && prefix == null) {
    this.options._id = false;
  }

  // Initialize prefix and keys
  prefix = prefix || '';
  const keys = Object.keys(obj);

  // Process each key
  for (const key of keys) {
    // Skip special properties
    if (utils.specialProperties.has(key)) {
      continue;
    }

    // Get full path
    const fullPath = prefix + key;

    // Check for invalid values
    if (obj[key] == null) {
      throw new TypeError('Invalid value for schema path `' + fullPath +
        '`, got value "' + obj[key] + '"');
    }

    // Handle _id: false
    if (key === '_id' && obj[key] === false) {
      continue;
    }

    // Handle virtual types
    if (obj[key] instanceof VirtualType || get(obj[key], 'constructor.name', null) === 'VirtualType') {
      this.virtual(obj[key]);
      continue;
    }

    // Handle invalid array values
    if (Array.isArray(obj[key]) && obj[key].length === 1 && obj[key][0] == null) {
      throw new TypeError('Invalid value for schema Array path `' + fullPath +
        '`, got value "' + obj[key][0] + '"');
    }

    // Determine if obj[key] is a path or a nested object
    if (!(utils.isPOJO(obj[key]) || obj[key] instanceof SchemaTypeOptions)) {
      // Non-options, non-POJO values are paths
      this.path(prefix + key, obj[key]);
    } else if (Object.keys(obj[key]).length < 1) {
      // Empty objects are mixed paths
      this.path(fullPath, obj[key]); // mixed type
    } else if (!obj[key][this.options.typeKey] || (this.options.typeKey === 'type' && obj[key].type.type)) {
      // Objects without a type key are nested objects
      this.nested[fullPath] = true;
      this.add(obj[key], fullPath + '.');
    } else {
      // Objects with a type key are paths
      this.path(prefix + key, obj[key]);
    }
  }

  // Add aliases for new paths
  const addedKeys = Object.keys(obj).
    map(key => prefix ? prefix + key : key);
  aliasFields(this, addedKeys);
  return this;
};