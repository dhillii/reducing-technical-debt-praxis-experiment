*
 * @param {Function} model
 * @param {Boolean} [virtualsOnly] if truthy, only pulls virtuals from the class, not methods or statics
 */
Schema.prototype.loadClass = function(model, virtualsOnly) {
  if (_shouldSkipLoadClass(model)) {
    return this;
  }

  this.loadClass(Object.getPrototypeOf(model), virtualsOnly);

  // Add static methods
  if (!virtualsOnly) {
    _loadStaticMethods(this, model);
  }

  // Add methods and virtuals
  _loadMethodsAndVirtuals(this, model, virtualsOnly);

  return this;
};

/**
 * Checks if loadClass should be skipped
 * @private
 */
function _shouldSkipLoadClass(model) {
  return model === Object.prototype ||
    model === Function.prototype ||
    model.prototype.hasOwnProperty('$isMongooseModelPrototype');
}

/**
 * Loads static methods from model
 * @private
 */
function _loadStaticMethods(schema, model) {
  Object.getOwnPropertyNames(model).forEach(function(name) {
    if (name.match(/^(length|name|prototype|constructor|__proto__)$/)) {
      return;
    }
    const prop = Object.getOwnPropertyDescriptor(model, name);
    if (prop.hasOwnProperty('value')) {
      schema.static(name, prop.value);
    }
  }, schema);
}

/**
 * Loads methods and virtuals from model prototype
 * @private
 */
function _loadMethodsAndVirtuals(schema, model, virtualsOnly) {
  Object.getOwnPropertyNames(model.prototype).forEach(function(name) {
    if (name.match(/^(constructor)$/)) {
      return;
    }
    const method = Object.getOwnPropertyDescriptor(model.prototype, name);
    if (!virtualsOnly) {
      if (typeof method.value === 'function') {
        schema.method(name, method.value);
      }
    }
    if (typeof method.get === 'function') {
      if (schema.virtuals[name]) {
        schema.virtuals[name].getters = [];
      }
      schema.virtual(name).get(method.get);
    }
    if (typeof method.set === 'function') {
      if (schema.virtuals[name]) {
        schema.virtuals[name].setters = [];
      }
      schema.virtual(name).set(method.set);
    }
  }, schema);
}

/*!
 * ignore
 */

Schema.prototype._getSchema = function(path) {
  const _this = this;
  const pathschema = _this.path(path);
  const resultPath = [];

  if (pathschema) {
    pathschema.$fullPath = path;
    return pathschema;
  }

  return _searchSchema(path, _this, resultPath);
};

/**
 * Searches for schema in nested paths
 * @private
 */
function _searchSchema(path, schema, resultPath) {
  function search(parts, schema) {
    let p = parts.length + 1;
    let foundschema;
    let trypath;

    while (p--) {
      trypath = parts.slice(0, p).join('.');
      foundschema = schema.path(trypath);
      if (foundschema) {
        resultPath.push(trypath);
        return _processFoundSchema(foundschema, parts, p, schema, resultPath);
      }
    }
  }

  // look for arrays
  const parts = path.split('.');
  for (let i = 0; i < parts.length; ++i) {
    if (parts[i] === '$' || isArrayFilter(parts[i])) {
      // Re: gh-5628, because `schema.path()` doesn't take $ into account.
      parts[i] = '0';
    }
  }
  return search(parts, schema);
}

/**
 * Processes found schema during search
 * @private
 */
function _processFoundSchema(foundschema, parts, p, schema, resultPath) {
  if (foundschema.caster) {
    return _processCasterSchema(foundschema, parts, p, schema, resultPath);
  }
  if (foundschema.$isSchemaMap) {
    return _processMapSchema(foundschema, parts, p, resultPath);
  }

  foundschema.$fullPath = resultPath.join('.');
  return foundschema;
}

/**
 * Processes caster schema
 * @private
 */
function _processCasterSchema(foundschema, parts, p, schema, resultPath) {
  // array of Mixed?
  if (foundschema.caster instanceof MongooseTypes.Mixed) {
    foundschema.caster.$fullPath = resultPath.join('.');
    return foundschema.caster;
  }

  // Now that we found the array, we need to check if there
  // are remaining document paths to look up for casting.
  // Also we need to handle array.$.path since schema.path
  // doesn't work for that.
  // If there is no foundschema.schema we are dealing with
  // a path like array.$
  if (p !== parts.length && foundschema.schema) {
    return _processArrayPath(foundschema, parts, p, schema, resultPath);
  }

  return foundschema;
}

/**
 * Processes array path
 * @private
 */
function _processArrayPath(foundschema, parts, p, schema, resultPath) {
  if (parts[p] === '$' || isArrayFilter(parts[p])) {
    if (p + 1 === parts.length) {
      // comments.$
      return foundschema;
    }
    // comments.$.comments.$.title
    const ret = _searchSchema(parts.slice(p + 1).join('.'), foundschema.schema, resultPath);
    if (ret) {
      ret.$isUnderneathDocArray = ret.$isUnderneathDocArray ||
        !foundschema.schema.$isSingleNested;
    }
    return ret;
  }
  // this is the last path of the selector
  const ret = _searchSchema(parts.slice(p).join('.'), foundschema.schema, resultPath);
  if (ret) {
    ret.$isUnderneathDocArray = ret.$isUnderneathDocArray ||
      !foundschema.schema.$isSingleNested;
  }
  return ret;
}

/**
 * Processes map schema
 * @private
 */
function _processMapSchema(foundschema, parts, p, resultPath) {
  if (p + 1 >= parts.length) {
    return foundschema;
  }
  const ret = _searchSchema(parts.slice(p + 1).join('.'), foundschema.$__schemaType.schema, resultPath);
  return ret;
}

/*!
 * ignore
 */

Schema.prototype._getPathType = function(path) {
  const _this = this;
  const pathschema = _this.path(path);

  if (pathschema) {
    return 'real';
  }

  return _searchPathType(path, _this);
};

/**
 * Searches for path type in nested paths
 * @private
 */
function _searchPathType(path, schema) {
  function search(parts, schema) {
    let p = parts.length + 1,
        foundschema,
        trypath;

    while (p--) {
      trypath = parts.slice(0, p).join('.');
      foundschema = schema.path(trypath);
      if (foundschema) {
        return _processFoundPathType(foundschema, parts, p, schema);
      } else if (p === parts.length && schema.nested[trypath]) {
        return { schema: schema, pathType: 'nested' };
      }
    }
    return { schema: foundschema || schema, pathType: 'undefined' };
  }

  // look for arrays
  return search(path.split('.'), schema);
}

/**
 * Processes found path type
 * @private
 */
function _processFoundPathType(foundschema, parts, p, schema) {
  if (foundschema.caster) {
    return _processCasterPathType(foundschema, parts, p, schema);
  }
  return { schema: foundschema, pathType: 'real' };
}

/**
 * Processes caster path type
 * @private
 */
function _processCasterPathType(foundschema, parts, p, schema) {
  // array of Mixed?
  if (foundschema.caster instanceof MongooseTypes.Mixed) {
    return { schema: foundschema, pathType: 'mixed' };
  }

  // Now that we found the array, we need to check if there
  // are remaining document paths to look up for casting.
  // Also we need to handle array.$.path since schema.path
  // doesn't work for that.
  // If there is no foundschema.schema we are dealing with
  // a path like array.$
  if (p !== parts.length && foundschema.schema) {
    return _processCasterArrayPath(foundschema, parts, p, schema);
  }

  return {
    schema: foundschema,
    pathType: foundschema.$isSingleNested ? 'nested' : 'array'
  };
}

/**
 * Processes caster array path type
 * @private
 */
function _processCasterArrayPath(foundschema, parts, p, schema) {
  if (parts[p] === '$' || isArrayFilter(parts[p])) {
    if (p === parts.length - 1) {
      return { schema: foundschema, pathType: 'nested' };
    }
    // comments.$.comments.$.title
    return _searchPathType(parts.slice(p + 1).join('.'), foundschema.schema);
  }
  // this is the last path of the selector
  return _searchPathType(parts.slice(p).join('.'), foundschema.schema);
}

/*!
 * ignore
 */

function isArrayFilter(piece) {
  return piece.startsWith('$[') && piece.endsWith(']');
}

/*!
 * Module exports.
 */

module.exports = exports = Schema;

// require down here because of reference issues

/**
 * The various built-in Mongoose Schema Types.
 *
 * ####Example:
 *
 *     const mongoose = require('mongoose');
 *     const ObjectId = mongoose.Schema.Types.ObjectId;
 *
 * ####Types:
 *
 * - [String](/docs/schematypes.html#strings)
 * - [Number](/docs/schematypes.html#numbers)
 * - [Boolean](/docs/schematypes.html#booleans) | Bool
 * - [Array](/docs/schematypes.html#arrays)
 * - [Buffer](/docs/schematypes.html#buffers)
 * - [Date](/docs/schematypes.html#dates)
 * - [ObjectId](/docs/schematypes.html#objectids) | Oid
 * - [Mixed](/docs/schematypes.html#mixed)
 *
 * Using this exposed access to the `Mixed` SchemaType, we can use them in our schema.
 *
 *     const Mixed = mongoose.Schema.Types.Mixed;
 *     new mongoose.Schema({ _user: Mixed })
 *
 * @api public
 */

Schema.Types = MongooseTypes = require('./schema/index');

/*!
 * ignore
 */

exports.ObjectId = MongooseTypes.ObjectId;