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

  // Iterate over keys and add paths to schema
  for (const key of keys) {
    if (utils.specialProperties.has(key)) {
      continue;
    }

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

    // Handle array paths
    if (Array.isArray(obj[key]) && obj[key].length === 1 && obj[key][0] == null) {
      throw new TypeError('Invalid value for schema Array path `' + fullPath +
        '`, got value "' + obj[key][0] + '"');
    }

    // Determine path type and add to schema
    if (!(utils.isPOJO(obj[key]) || obj[key] instanceof SchemaTypeOptions)) {
      this.path(prefix + key, obj[key]);
    } else if (Object.keys(obj[key]).length < 1) {
      this.path(fullPath, obj[key]); // mixed type
    } else if (!obj[key][this.options.typeKey] || (this.options.typeKey === 'type' && obj[key].type.type)) {
      this.add(obj[key], fullPath + '.');
    } else {
      this.path(prefix + key, obj[key]);
    }
  }

  // Add aliases for new paths
  const addedKeys = Object.keys(obj).
    map(key => prefix ? prefix + key : key);
  aliasFields(this, addedKeys);
  return this;
};

// Extracted function to handle adding aliases
function aliasFields(schema, paths) {
  // Iterate over paths and add aliases
  for (const path of paths) {
    const options = get(schema.paths[path], 'options');
    if (options == null) {
      continue;
    }

    const prop = schema.paths[path].path;
    const alias = options.alias;

    if (!alias) {
      continue;
    }

    if (typeof alias !== 'string') {
      throw new Error('Invalid value for alias option on ' + prop + ', got ' + alias);
    }

    schema.aliases[alias] = prop;

    schema.
      virtual(alias).
      get((function(p) {
        return function() {
          if (typeof this.get === 'function') {
            return this.get(p);
          }
          return this[p];
        };
      })(prop)).
      set((function(p) {
        return function(v) {
          return this.$set(p, v);
        };
      })(prop));
  }
}