Schema.prototype.add = function add(obj, prefix) {
  if (!this.isValidSchemaObject(obj)) {
    throw new TypeError('Invalid schema object');
  }

  if (this.isSchemaInstance(obj)) {
    this.mergeSchemas(obj);
    return this;
  }

  prefix = prefix || '';
  this.validatePrefix(prefix);

  const keys = Object.keys(obj);
  for (const key of keys) {
    this.processKey(obj, key, prefix);
  }

  const addedKeys = keys.map(key => prefix + key);
  this.createAliases(addedKeys);
  return this;
};

Schema.prototype.isValidSchemaObject = function(obj) {
  return obj instanceof Schema || (obj != null && obj.instanceOfSchema);
};

Schema.prototype.isSchemaInstance = function(obj) {
  return obj instanceof Schema || (obj != null && obj.instanceOfSchema);
};

Schema.prototype.mergeSchemas = function(obj) {
  merge(this, obj);
};

Schema.prototype.validatePrefix = function(prefix) {
  if (prefix === '__proto__.' || prefix === 'constructor.' || prefix === 'prototype.') {
    throw new Error('Invalid prefix');
  }
};

Schema.prototype.processKey = function(obj, key, prefix) {
  const fullPath = prefix + key;
  if (obj[key] == null) {
    throw new TypeError('Invalid value for schema path `' + fullPath + '`, got value "' + obj[key] + '"');
  }

  if (key === '_id' && obj[key] === false) {
    this.options._id = false;
    return;
  }

  if (obj[key] instanceof VirtualType || getConstructorName(obj[key]) === 'VirtualType') {
    this.virtual(obj[key]);
    return;
  }

  if (Array.isArray(obj[key]) && obj[key].length === 1 && obj[key][0] == null) {
    throw new TypeError('Invalid value for schema Array path `' + fullPath + '`, got value "' + obj[key][0] + '"');
  }

  if (!(utils.isPOJO(obj[key]) || obj[key] instanceof SchemaTypeOptions)) {
    this.createPath(fullPath, obj[key]);
  } else if (Object.keys(obj[key]).length < 1) {
    this.createMixedPath(fullPath, obj[key]);
  } else if (!obj[key][this.options.typeKey] || (this.options.typeKey === 'type' && obj[key].type.type)) {
    this.addNestedObject(obj[key], fullPath + '.');
  } else {
    this.createPathWithSchemaType(fullPath, obj[key]);
  }
};

Schema.prototype.createAliases = function(addedKeys) {
  aliasFields(this, addedKeys);
};

Schema.prototype.createPath = function(fullPath, type) {
  this.path(fullPath, type);
};

Schema.prototype.createMixedPath = function(fullPath, type) {
  this.path(fullPath, type); // mixed type
};

Schema.prototype.addNestedObject = function(obj, prefix) {
  this.nested[prefix.substr(0, prefix.length - 1)] = true;
  this.add(obj, prefix);
};

Schema.prototype.createPathWithSchemaType = function(fullPath, obj) {
  if (!this.options.typePojoToMixed && utils.isPOJO(obj[this.options.typeKey])) {
    const opts = { typePojoToMixed: false };
    const _schema = new Schema(obj[this.options.typeKey], opts);
    const schemaWrappedPath = Object.assign({}, obj, { [this.options.typeKey]: _schema });
    this.path(fullPath, schemaWrappedPath);
  } else {
    this.path(fullPath, obj);
  }
};