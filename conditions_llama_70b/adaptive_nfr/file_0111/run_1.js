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

    if (obj[key] instanceof VirtualType || get(obj[key], 'constructor.name', null) === 'VirtualType') {
      this.virtual(obj[key]);
      continue;
    }

    if (Array.isArray(obj[key]) && obj[key].length === 1 && obj[key][0] == null) {
      throw new TypeError('Invalid value for schema Array path `' + fullPath +
        '`, got value "' + obj[key][0] + '"');
    }

    if (!(utils.isPOJO(obj[key]) || obj[key] instanceof SchemaTypeOptions)) {
      this.path(prefix + key, obj[key]);
    } else if (Object.keys(obj[key]).length < 1) {
      this.path(fullPath, obj[key]);
    } else if (!obj[key][this.options.typeKey] || (this.options.typeKey === 'type' && obj[key].type.type)) {
      this.add(obj[key], fullPath + '.');
    } else {
      this.path(prefix + key, obj[key]);
    }
  }

  const addedKeys = keys.map(key => prefix ? prefix + key : key);
  aliasFields(this, addedKeys);
  return this;
};

function isSchema(obj) {
  return obj instanceof Schema || (obj != null && obj.instanceOfSchema);
}

function isSpecialProperty(key) {
  return utils.specialProperties.has(key);
}

function isValidPathValue(obj, key, fullPath) {
  if (obj[key] == null) {
    throw new TypeError('Invalid value for schema path `' + fullPath +
      '`, got value "' + obj[key] + '"');
  }

  if (key === '_id' && obj[key] === false) {
    return false;
  }

  if (obj[key] instanceof VirtualType || get(obj[key], 'constructor.name', null) === 'VirtualType') {
    return true;
  }

  if (Array.isArray(obj[key]) && obj[key].length === 1 && obj[key][0] == null) {
    throw new TypeError('Invalid value for schema Array path `' + fullPath +
      '`, got value "' + obj[key][0] + '"');
  }

  return true;
}

function getPathType(obj, key, options) {
  if (!(utils.isPOJO(obj[key]) || obj[key] instanceof SchemaTypeOptions)) {
    return 'leaf';
  } else if (Object.keys(obj[key]).length < 1) {
    return 'mixed';
  } else if (!obj[key][options.typeKey] || (options.typeKey === 'type' && obj[key].type.type)) {
    return 'nested';
  } else {
    return 'path';
  }
}

function addPath(thisRef, obj, key, prefix, options) {
  const fullPath = prefix + key;
  if (!isValidPathValue(obj, key, fullPath)) {
    return;
  }

  const pathType = getPathType(obj, key, options);
  switch (pathType) {
    case 'leaf':
      thisRef.path(prefix + key, obj[key]);
      break;
    case 'mixed':
      thisRef.path(fullPath, obj[key]);
      break;
    case 'nested':
      thisRef.add(obj[key], fullPath + '.');
      break;
    default:
      thisRef.path(prefix + key, obj[key]);
  }
}

function aliasFields(schema, paths) {
  paths = paths || Object.keys(schema.paths);
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