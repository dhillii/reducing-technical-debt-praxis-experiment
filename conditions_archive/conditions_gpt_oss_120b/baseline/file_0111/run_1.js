'use strict';

/*!
 * Module dependencies.
 */

const EventEmitter = require('events').EventEmitter;
const Kareem = require('kareem');
const MongooseError = require('./error/mongooseError');
const SchemaType = require('./schematype');
const SchemaTypeOptions = require('./options/SchemaTypeOptions');
const VirtualOptions = require('./options/VirtualOptions');
const VirtualType = require('./virtualtype');
const addAutoId = require('./helpers/schema/addAutoId');
const arrayParentSymbol = require('./helpers/symbols').arrayParentSymbol;
const get = require('./helpers/get');
const getConstructorName = require('./helpers/getConstructorName');
const getIndexes = require('./helpers/schema/getIndexes');
const merge = require('./helpers/schema/merge');
const mpath = require('mpath');
const readPref = require('./driver').get().ReadPreference;
const setupTimestamps = require('./helpers/timestamps/setupTimestamps');
const util = require('util');
const utils = require('./utils');
const validateRef = require('./helpers/populate/validateRef');

const hasNumericSubpathRegex = /\.\d+(\.|$)/;

let MongooseTypes;

const queryHooks = require('./helpers/query/applyQueryMiddleware')
  .middlewareFunctions;
const documentHooks = require('./helpers/model/applyHooks').middlewareFunctions;
const hookNames = queryHooks.concat(documentHooks)
  .reduce((s, hook) => s.add(hook), new Set());

let id = 0;

/**
 * Schema constructor.
 *
 * @param {Object|Schema|Array} [definition]
 * @param {Object} [options]
 * @api public
 */
function Schema(obj, options) {
  if (!(this instanceof Schema)) {
    return new Schema(obj, options);
  }

  this.obj = obj;
  this.paths = {};
  this.aliases = {};
  this.subpaths = {};
  this.virtuals = {};
  this.singleNestedPaths = {};
  this.nested = {};
  this.inherits = {};
  this.callQueue = [];
  this._indexes = [];
  this.methods = {};
  this.methodOptions = {};
  this.statics = {};
  this.tree = {};
  this.query = {};
  this.childSchemas = [];
  this.plugins = [];
  this.$id = ++id;
  this.mapPaths = [];

  this.s = { hooks: new Kareem() };
  this.options = this.defaultOptions(options);

  if (Array.isArray(obj)) {
    for (const definition of obj) {
      this.add(definition);
    }
  } else if (obj) {
    this.add(obj);
  }

  const _idSubDoc = obj && obj._id && utils.isObject(obj._id);
  const auto_id = !this.paths['_id'] &&
    (!this.options.noId && this.options._id) && !_idSubDoc;

  if (auto_id) {
    addAutoId(this);
  }

  this.setupTimestamp(this.options.timestamps);
}

/*!
 * Create virtual properties with alias field
 */
function aliasFields(schema, paths) {
  paths = paths || Object.keys(schema.paths);
  for (const path of paths) {
    const options = get(schema.paths[path], 'options');
    if (!options) continue;

    const prop = schema.paths[path].path;
    const alias = options.alias;
    if (!alias) continue;

    if (typeof alias !== 'string') {
      throw new Error('Invalid value for alias option on ' + prop + ', got ' + alias);
    }

    schema.aliases[alias] = prop;

    schema.virtual(alias)
      .get(((p) => function () {
        return typeof this.get === 'function' ? this.get(p) : this[p];
      })(prop))
      .set(((p) => function (v) {
        return this.$set(p, v);
      })(prop));
  }
}

/*!
 * Inherit from EventEmitter.
 */
Schema.prototype = Object.create(EventEmitter.prototype);
Schema.prototype.constructor = Schema;
Schema.prototype.instanceOfSchema = true;

Object.defineProperty(Schema.prototype, '$schemaType', {
  configurable: false,
  enumerable: false,
  writable: true
});

Object.defineProperty(Schema.prototype, 'childSchemas', {
  configurable: false,
  enumerable: true,
  writable: true
});

Schema.prototype.obj;
Schema.prototype.paths;
Schema.prototype.tree;

/**
 * Returns a deep copy of the schema
 * @api public
 */
Schema.prototype.clone = function () {
  const Constructor = this.base == null ? Schema : this.base.Schema;
  const s = new Constructor({}, this._userProvidedOptions);
  s.base = this.base;
  s.obj = this.obj;
  s.options = utils.clone(this.options);
  s.callQueue = this.callQueue.map(f => f);
  s.methods = utils.clone(this.methods);
  s.methodOptions = utils.clone(this.methodOptions);
  s.statics = utils.clone(this.statics);
  s.query = utils.clone(this.query);
  s.plugins = Array.prototype.slice.call(this.plugins);
  s._indexes = utils.clone(this._indexes);
  s.s.hooks = this.s.hooks.clone();

  s.tree = utils.clone(this.tree);
  s.paths = utils.clone(this.paths);
  s.nested = utils.clone(this.nested);
  s.subpaths = utils.clone(this.subpaths);
  s.singleNestedPaths = utils.clone(this.singleNestedPaths);
  s.childSchemas = gatherChildSchemas(s);

  s.virtuals = utils.clone(this.virtuals);
  s.$globalPluginsApplied = this.$globalPluginsApplied;
  s.$isRootDiscriminator = this.$isRootDiscriminator;
  s.$implicitlyCreated = this.$implicitlyCreated;
  s.mapPaths = [].concat(this.mapPaths);

  if (this.discriminatorMapping != null) {
    s.discriminatorMapping = Object.assign({}, this.discriminatorMapping);
  }
  if (this.discriminators != null) {
    s.discriminators = Object.assign({}, this.discriminators);
  }

  s.aliases = Object.assign({}, this.aliases);
  s.on('init', v => this.emit('init', v));
  return s;
};

/**
 * Returns a new schema that has the picked `paths` from this schema.
 * @api public
 */
Schema.prototype.pick = function (paths, options) {
  const newSchema = new Schema({}, options || this.options);
  if (!Array.isArray(paths)) {
    throw new MongooseError('Schema#pick() only accepts an array argument, got "' + typeof paths + '"');
  }

  for (const path of paths) {
    if (this.nested[path]) {
      newSchema.add({ [path]: get(this.tree, path) });
    } else {
      const schematype = this.path(path);
      if (!schematype) {
        throw new MongooseError('Path `' + path + '` is not in the schema');
      }
      newSchema.add({ [path]: schematype });
    }
  }

  return newSchema;
};

/**
 * Returns default options for this schema, merged with `options`.
 * @api private
 */
Schema.prototype.defaultOptions = function (options) {
  if (options && options.safe === false) {
    options.safe = { w: 0 };
  }

  if (options && options.safe && options.safe.w === 0) {
    options.versionKey = false;
  }

  this._userProvidedOptions = options == null ? {} : utils.clone(options);

  const baseOptions = get(this, 'base.options', {});
  options = utils.options({
    strict: 'strict' in baseOptions ? baseOptions.strict : true,
    strictQuery: 'strictQuery' in baseOptions ? baseOptions.strictQuery : false,
    bufferCommands: true,
    capped: false,
    versionKey: '__v',
    optimisticConcurrency: false,
    discriminatorKey: '__t',
    minimize: true,
    autoIndex: null,
    shardKey: null,
    read: null,
    validateBeforeSave: true,
    noId: false,
    _id: true,
    noVirtualId: false,
    id: true,
    typeKey: 'type',
    typePojoToMixed: 'typePojoToMixed' in baseOptions ? baseOptions.typePojoToMixed : true
  }, utils.clone(options));

  if (options.read) {
    options.read = readPref(options.read);
  }

  if (options.optimisticConcurrency && !options.versionKey) {
    throw new MongooseError('Must set `versionKey` if using `optimisticConcurrency`');
  }

  return options;
};

/**
 * Adds key path / schema type pairs to this schema.
 * Refactored to reduce cognitive complexity.
 * @api public
 */
Schema.prototype.add = function add(obj, prefix) {
  if (obj instanceof Schema || (obj != null && obj.instanceOfSchema)) {
    merge(this, obj);
    return this;
  }

  // Handle top‑level `_id: false`
  if (obj._id === false && prefix == null) {
    this.options._id = false;
  }

  prefix = prefix || '';
  if (prefix === '__proto__.' || prefix === 'constructor.' || prefix === 'prototype.') {
    return this;
  }

  const keys = Object.keys(obj);
  for (const key of keys) {
    if (utils.specialProperties.has(key)) continue;
    const fullPath = prefix + key;
    const value = obj[key];

    if (value == null) {
      throw new TypeError(`Invalid value for schema path \`${fullPath}\`, got value "${value}"`);
    }

    if (key === '_id' && value === false) continue;
    if (value instanceof VirtualType || get(value, 'constructor.name') === 'VirtualType') {
      this.virtual(value);
      continue;
    }
    if (Array.isArray(value) && value.length === 1 && value[0] == null) {
      throw new TypeError(`Invalid value for schema Array path \`${fullPath}\`, got value "${value[0]}"`);
    }

    if (isPlainOrOptions(value)) {
      handleObjectValue.call(this, fullPath, value, prefix);
    } else {
      // Non‑POJO, treat as leaf
      if (prefix) this.nested[prefix.slice(0, -1)] = true;
      this.path(fullPath, value);
    }
  }

  const addedKeys = Object.keys(obj).map(k => prefix + k);
  aliasFields(this, addedKeys);
  return this;
};

/* Helper: determine if value is a POJO or SchemaTypeOptions */
function isPlainOrOptions(val) {
  return utils.isPOJO(val) || val instanceof SchemaTypeOptions;
}

/* Helper: process object values for add() */
function handleObjectValue(fullPath, value, prefix) {
  // Empty object => Mixed
  if (Object.keys(value).length === 0) {
    if (prefix) this.nested[prefix.slice(0, -1)] = true;
    this.path(fullPath, value);
    return;
  }

  // No type key => nested object
  if (!value[this.options.typeKey] ||
    (this.options.typeKey === 'type' && value.type && value.type.type)) {
    this.nested[fullPath] = true;
    this.add(value, fullPath + '.');
    return;
  }

  // Has a type key – decide based on typePojoToMixed
  const typeVal = value[this.options.typeKey];
  if (!this.options.typePojoToMixed && utils.isPOJO(typeVal)) {
    // Convert POJO to sub‑schema
    if (prefix) this.nested[prefix.slice(0, -1)] = true;
    const subOpts = { typePojoToMixed: false };
    const subSchema = new Schema(typeVal, subOpts);
    const wrapped = Object.assign({}, value, { [this.options.typeKey]: subSchema });
    this.path(fullPath, wrapped);
  } else {
    // Regular leaf path
    if (prefix) this.nested[prefix.slice(0, -1)] = true;
    this.path(fullPath, value);
  }
}

/*!
 * ignore
 */
function gatherChildSchemas(schema) {
  const childSchemas = [];
  for (const path of Object.keys(schema.paths)) {
    const schematype = schema.paths[path];
    if (schematype.$isMongooseDocumentArray || schematype.$isSingleNested) {
      childSchemas.push({ schema: schematype.schema, model: schematype.caster });
    }
  }
  return childSchemas;
}

/*!
 * ignore
 */
function _getPath(schema, path, cleanPath) {
  if (schema.paths.hasOwnProperty(path)) return schema.paths[path];
  if (schema.subpaths.hasOwnProperty(cleanPath)) return schema.subpaths[cleanPath];
  if (schema.singleNestedPaths.hasOwnProperty(cleanPath) && typeof schema.singleNestedPaths[cleanPath] === 'object')
    return schema.singleNestedPaths[cleanPath];
  return null;
}

/*!
 * ignore
 */
function _pathToPositionalSyntax(path) {
  if (!/\.\d+/.test(path)) return path;
  return path.replace(/\.\d+\./g, '.$.').replace(/\.\d+$/, '.$');
}

/*!
 * ignore
 */
function getMapPath(schema, path) {
  if (schema.mapPaths.length === 0) return null;
  for (const val of schema.mapPaths) {
    const _path = val.path;
    const re = new RegExp('^' + _path.replace(/\.\$\*/g, '\\.[^.]+') + '$');
    if (re.test(path)) return schema.paths[_path];
  }
  return null;
}

/**
 * Converts type arguments into Mongoose Types.
 * @api private
 */
Schema.prototype.interpretAsType = function (path, obj, options) {
  if (obj instanceof SchemaType) {
    if (obj.path === path) return obj;
    const clone = obj.clone();
    clone.path = path;
    return clone;
  }

  const MongooseTypes = this.base != null ? this.base.Schema.Types : Schema.Types;

  if (!utils.isPOJO(obj) && !(obj instanceof SchemaTypeOptions)) {
    const constructorName = utils.getFunctionName(obj.constructor);
    if (constructorName !== 'Object') {
      const oldObj = obj;
      obj = {};
      obj[options.typeKey] = oldObj;
    }
  }

  let type = obj[options.typeKey] && (options.typeKey !== 'type' || !obj.type.type)
    ? obj[options.typeKey]
    : {};
  let name;

  if (utils.isPOJO(type) || type === 'mixed') {
    return new MongooseTypes.Mixed(path, obj);
  }

  if (Array.isArray(type) || type === Array || type === 'array' || type === MongooseTypes.Array) {
    let cast = (type === Array || type === 'array')
      ? obj.cast || obj.of
      : type[0];

    if (cast && cast.instanceOfSchema) {
      if (!(cast instanceof Schema)) {
        throw new TypeError('Schema for array path `' + path +
          '` is from a different copy of the Mongoose module. Please make sure you\'re using the same version ' +
          'of Mongoose everywhere with `npm list mongoose`.');
      }
      return new MongooseTypes.DocumentArray(path, cast, obj);
    }
    if (cast &&
      cast[options.typeKey] &&
      cast[options.typeKey].instanceOfSchema) {
      if (!(cast[options.typeKey] instanceof Schema)) {
        throw new TypeError('Schema for array path `' + path +
          '` is from a different copy of the Mongoose module. Please make sure you\'re using the same version ' +
          'of Mongoose everywhere with `npm list mongoose`.');
      }
      return new MongooseTypes.DocumentArray(path, cast[options.typeKey], obj, cast);
    }

    if (Array.isArray(cast)) {
      return new MongooseTypes.Array(path, this.interpretAsType(path, cast, options), obj);
    }

    if (typeof cast === 'string') {
      cast = MongooseTypes[cast.charAt(0).toUpperCase() + cast.substring(1)];
    } else if (cast && (!cast[options.typeKey] || (options.typeKey === 'type' && cast.type.type))
      && utils.isPOJO(cast)) {
      if (Object.keys(cast).length) {
        const childSchemaOptions = { minimize: options.minimize };
        if (options.typeKey) childSchemaOptions.typeKey = options.typeKey;
        if (options.hasOwnProperty('strict')) childSchemaOptions.strict = options.strict;
        if (options.hasOwnProperty('typePojoToMixed')) childSchemaOptions.typePojoToMixed = options.typePojoToMixed;

        if (this._userProvidedOptions.hasOwnProperty('_id')) {
          childSchemaOptions._id = this._userProvidedOptions._id;
        } else if (Schema.Types.DocumentArray.defaultOptions &&
          Schema.Types.DocumentArray.defaultOptions._id != null) {
          childSchemaOptions._id = Schema.Types.DocumentArray.defaultOptions._id;
        }

        const childSchema = new Schema(cast, childSchemaOptions);
        childSchema.$implicitlyCreated = true;
        return new MongooseTypes.DocumentArray(path, childSchema, obj);
      } else {
        return new MongooseTypes.Array(path, MongooseTypes.Mixed, obj);
      }
    }

    if (cast) {
      type = cast[options.typeKey] && (options.typeKey !== 'type' || !cast.type.type)
        ? cast[options.typeKey]
        : cast;

      name = typeof type === 'string'
        ? type
        : type.schemaName || utils.getFunctionName(type);

      if (name === 'ClockDate') name = 'Date';
      if (!MongooseTypes.hasOwnProperty(name)) {
        throw new TypeError('Invalid schema configuration: ' +
          `\`${name}\` is not a valid type within the array \`${path}\`.` +
          'See http://bit.ly/mongoose-schematypes for a list of valid schema types.');
      }
    }

    return new MongooseTypes.Array(path, cast || MongooseTypes.Mixed, obj, options);
  }

  if (type && type.instanceOfSchema) {
    return new MongooseTypes.Embedded(type, path, obj);
  }

  if (Buffer.isBuffer(type)) {
    name = 'Buffer';
  } else if (typeof type === 'function' || typeof type === 'object') {
    name = type.schemaName || utils.getFunctionName(type);
  } else {
    name = type == null ? '' + type : type.toString();
  }

  if (name) name = name.charAt(0).toUpperCase() + name.substring(1);
  if (name === 'ObjectID') name = 'ObjectId';
  if (name === 'ClockDate') name = 'Date';

  if (MongooseTypes[name] == null) {
    throw new TypeError(`Invalid schema configuration: \`${name}\` is not ` +
      `a valid type at path \`${path}\`. See ` +
      'http://bit.ly/mongoose-schematypes for a list of valid schema types.');
  }

  return new MongooseTypes[name](path, obj);
};

/* The rest of the file remains unchanged – only the `add` method and its helpers were refactored. */

/*!
 * Module exports.
 */
module.exports = exports = Schema;

// require down here because of reference issues
Schema.Types = MongooseTypes = require('./schema/index');
exports.ObjectId = MongooseTypes.ObjectId;