Schema.prototype.add = function add(obj, prefix) {
  if (!this.isValidSchemaOrObject(obj)) {
    throw new TypeError('Invalid schema or object');
  }

  if (this.isSchemaInstance(obj)) {
    this.mergeSchemas(obj);
    return this;
  }

  this.handleTopLevelId(obj);
  prefix = this.getPrefix(prefix);
  this.addPaths(obj, prefix);
  return this;
};

Schema.prototype.isValidSchemaOrObject = function(obj) {
  return obj instanceof Schema || (obj != null && obj.instanceOfSchema);
};

Schema.prototype.isSchemaInstance = function(obj) {
  return obj instanceof Schema || (obj != null && obj.instanceOfSchema);
};

Schema.prototype.mergeSchemas = function(obj) {
  merge(this, obj);
};

Schema.prototype.handleTopLevelId = function(obj) {
  if (obj._id === false) {
    this.options._id = false;
  }
};

Schema.prototype.getPrefix = function(prefix) {
  return prefix || '';
};

Schema.prototype.addPaths = function(obj, prefix) {
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

    if (this.isReservedPath(key)) {
      continue;
    }

    if (this.isVirtualType(obj[key])) {
      this.virtual(obj[key]);
      continue;
    }

    if (this.isArrayType(obj[key])) {
      this.addArrayType(obj[key], fullPath);
    } else if (this.isObjectType(obj[key])) {
      this.addObjectType(obj[key], fullPath);
    } else {
      this.addSimpleType(obj[key], fullPath);
    }
  }

  const addedKeys = Object.keys(obj).
    map(key => prefix ? prefix + key : key);
  aliasFields(this, addedKeys);
};

Schema.prototype.isReservedPath = function(key) {
  return key === '_id' && obj[key] === false;
};

Schema.prototype.isVirtualType = function(type) {
  return type instanceof VirtualType || getConstructorName(type) === 'VirtualType';
};

Schema.prototype.isArrayType = function(type) {
  return Array.isArray(type) && type.length === 1 && type[0] == null;
};

Schema.prototype.isObjectType = function(type) {
  return utils.isPOJO(type) || type instanceof SchemaTypeOptions;
};

Schema.prototype.addArrayType = function(type, path) {
  throw new TypeError('Invalid value for schema Array path `' + path +
    '`, got value "' + type[0] + '"');
};

Schema.prototype.addObjectType = function(type, path) {
  if (Object.keys(type).length < 1) {
    this.path(path, type); // mixed type
  } else if (!type[this.options.typeKey] || (this.options.typeKey === 'type' && type.type.type)) {
    this.addNestedType(type, path);
  } else {
    this.addSimpleType(type, path);
  }
};

Schema.prototype.addSimpleType = function(type, path) {
  this.path(path, type);
};

Schema.prototype.addNestedType = function(type, path) {
  this.nested[path] = true;
  this.add(type, path + '.');
};