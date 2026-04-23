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

const queryHooks = require('./helpers/query/applyQueryMiddleware').
  middlewareFunctions;
const documentHooks = require('./helpers/model/applyHooks').middlewareFunctions;
const hookNames = queryHooks.concat(documentHooks).
  reduce((s, hook) => s.add(hook), new Set());

let id = 0;

/**
 * Schema constructor.
 *
 * ####Example:
 *
 *     const child = new Schema({ name: String });
 *     const schema = new Schema({ name: String, age: Number, children: [child] });
 *     const Tree = mongoose.model('Tree', schema);
 *
 *     // setting schema options
 *     new Schema({ name: String }, { _id: false, autoIndex: false })
 *
 * ####Options:
 *
 * - [autoIndex](/docs/guide.html#autoIndex): bool - defaults to null (which means use the connection's autoIndex option)
 * - [autoCreate](/docs/guide.html#autoCreate): bool - defaults to null (which means use the connection's autoCreate option)
 * - [bufferCommands](/docs/guide.html#bufferCommands): bool - defaults to true
 * - [bufferTimeoutMS](/docs/guide.html#bufferTimeoutMS): number - defaults to 10000 (10 seconds). If `bufferCommands` is enabled, the amount of time Mongoose will wait for connectivity to be restablished before erroring out.
 * - [capped](/docs/guide.html#capped): bool - defaults to false
 * - [collection](/docs/guide.html#collection): string - no default
 * - [discriminatorKey](/docs/guide.html#discriminatorKey): string - defaults to `__t`
 * - [id](/docs/guide.html#id): bool - defaults to true
 * - [_id](/docs/guide.html#_id): bool - defaults to true
 * - [minimize](/docs/guide.html#minimize): bool - controls [document#toObject](#document_Document-toObject) behavior when called manually - defaults to true
 * - [read](/docs/guide.html#read): string
 * - [writeConcern](/docs/guide.html#writeConcern): object - defaults to null, use to override [the MongoDB server's default write concern settings](https://docs.mongodb.com/manual/reference/write-concern/)
 * - [shardKey](/docs/guide.html#shardKey): object - defaults to `null`
 * - [strict](/docs/guide.html#strict): bool - defaults to true
 * - [strictQuery](/docs/guide.html#strictQuery): bool - defaults to false
 * - [toJSON](/docs/guide.html#toJSON) - object - no default
 * - [toObject](/docs/guide.html#toObject) - object - no default
 * - [typeKey](/docs/guide.html#typeKey) - string - defaults to 'type'
 * - [typePojoToMixed](/docs/guide.html#typePojoToMixed) - boolean - defaults to true. Determines whether a type set to a POJO becomes a Mixed path or a Subdocument
 * - [useNestedStrict](/docs/guide.html#useNestedStrict) - boolean - defaults to false
 * - [validateBeforeSave](/docs/guide.html#validateBeforeSave) - bool - defaults to `true`
 * - [versionKey](/docs/guide.html#versionKey): string or object - defaults to "__v"
 * - [optimisticConcurrency](/docs/guide.html#optimisticConcurrency): bool - defaults to false. Set to true to enable [optimistic concurrency](https://thecodebarbarian.com/whats-new-in-mongoose-5-10-optimistic-concurrency.html).
 * - [collation](/docs/guide.html#collation): object - defaults to null (which means use no collation)
 * - [selectPopulatedPaths](/docs/guide.html#selectPopulatedPaths): boolean - defaults to `true`
 * - [skipVersioning](/docs/guide.html#skipVersioning): object - paths to exclude from versioning
 * - [timestamps](/docs/guide.html#timestamps): object or boolean - defaults to `false`. If true, Mongoose adds `createdAt` and `updatedAt` properties to your schema and manages those properties for you.
 * - [storeSubdocValidationError](/docs/guide.html#storeSubdocValidationError): boolean - Defaults to true. If false, Mongoose will wrap validation errors in single nested document subpaths into a single validation error on the single nested subdoc's path.
 *
 * ####Options for Nested Schemas:
 * - `excludeIndexes`: bool - defaults to `false`. If `true`, skip building indexes on this schema's paths.
 *
 * ####Note:
 *
 * _When nesting schemas, (`children` in the example above), always declare the child schema first before passing it into its parent._
 *
 * @param {Object|Schema|Array} [definition] Can be one of: object describing schema paths, or schema to copy, or array of objects and schemas
 * @param {Object} [options]
 * @inherits NodeJS EventEmitter http://nodejs.org/api/events.html#events_class_events_eventemitter
 * @event `init`: Emitted after the schema is compiled into a `Model`.
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
  // For internal debugging. Do not use this to try to save a schema in MDB.
  this.$id = ++id;
  this.mapPaths = [];

  this.s = {
    hooks: new Kareem()
  };

  this.options = this.defaultOptions(options);

  // build paths
  if (Array.isArray(obj)) {
    for (const definition of obj) {
      this.add(definition);
    }
  } else if (obj) {
    this.add(obj);
  }

  // check if _id's value is a subdocument (gh-2276)
  const _idSubDoc = obj && obj._id && utils.isObject(obj._id);

  // ensure the documents get an auto _id unless disabled
  const auto_id = !this.paths['_id'] &&
      (!this.options.noId && this.options._id) && !_idSubDoc;

  if (auto_id) {
    addAutoId(this);
  }

  this.setupTimestamp(this.options.timestamps);
}

// Extracted functions to reduce complexity
function createVirtualProperties(schema, paths) {
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

function inheritFromEventEmitter() {
  Schema.prototype = Object.create(EventEmitter.prototype);
  Schema.prototype.constructor = Schema;
  Schema.prototype.instanceOfSchema = true;
}

function defineReservedProperties() {
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
}

function defineSchemaProperties() {
  Schema.reserved = Object.create(null);
  Schema.prototype.reserved = Schema.reserved;
  const reserved = Schema.reserved;
  reserved['prototype'] =
  reserved.emit =
  reserved.listeners =
  reserved.on =
  reserved.removeListener =
  reserved.collection =
  reserved.errors =
  reserved.get =
  reserved.init =
  reserved.isModified =
  reserved.isNew =
  reserved.populated =
  reserved.remove =
  reserved.save =
  reserved.toObject =
  reserved.validate = 1;
}

function defineSchemaMethods() {
  Schema.prototype.clone = function() {
    const Constructor = this.base == null ? Schema : this.base.Schema;

    const s = new Constructor({}, this._userProvidedOptions);
    s.base = this.base;
    s.obj = this.obj;
    s.options = utils.clone(this.options);
    s.callQueue = this.callQueue.map(function(f) { return f; });
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

    // Bubble up `init` for backwards compat
    s.on('init', v => this.emit('init', v));

    return s;
  };

  Schema.prototype.pick = function(paths, options) {
    const newSchema = new Schema({}, options || this.options);
    if (!Array.isArray(paths)) {
      throw new MongooseError('Schema#pick() only accepts an array argument, ' +
        'got "' + typeof paths + '"');
    }

    for (const path of paths) {
      if (this.nested[path]) {
        newSchema.add({ [path]: get(this.tree, path) });
      } else {
        const schematype = this.path(path);
        if (schematype == null) {
          throw new MongooseError('Path `' + path + '` is not in the schema');
        }
        newSchema.add({ [path]: schematype });
      }
    }

    return newSchema;
  };

  Schema.prototype.defaultOptions = function(options) {
    if (options && options.safe === false) {
      options.safe = { w: 0 };
    }

    if (options && options.safe && options.safe.w === 0) {
      // if you turn off safe writes, then versioning goes off as well
      options.versionKey = false;
    }

    this._userProvidedOptions = options == null ? {} : utils.clone(options);

    const baseOptions = get(this, 'base.options', {});
    options = utils.options({
      strict: 'strict' in baseOptions ? baseOptions.strict : true,
      strictQuery: 'strictQuery' in baseOptions ? baseOptions.strictQuery : false,
      bufferCommands: true,
      capped: false, // { size, max, autoIndexId }
      versionKey: '__v',
      optimisticConcurrency: false,
      discriminatorKey: '__t',
      minimize: true,
      autoIndex: null,
      shardKey: null,
      read: null,
      validateBeforeSave: true,
      // the following are only applied at construction time
      noId: false, // deprecated, use { _id: false }
      _id: true,
      noVirtualId: false, // deprecated, use { id: false }
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

  Schema.prototype.add = function add(obj, prefix) {
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

    for (const key of keys) {
      if (utils.specialProperties.has(key)) {
        continue;
      }

      const fullPath = prefix + key;

      if (obj[key] == null) {
        throw new TypeError('Invalid value for schema path `' + fullPath +
          '`, got value "' + obj[key] + '"');
      }
      // Retain `_id: false` but don't set it as a path, re: gh-8274.
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
        // Special-case: Non-options definitely a path so leaf at this node
        // Examples: Schema instances, SchemaType instances
        if (prefix) {
          this.nested[prefix.substr(0, prefix.length - 1)] = true;
        }
        this.path(prefix + key, obj[key]);
      } else if (Object.keys(obj[key]).length < 1) {
        // Special-case: {} always interpreted as Mixed path so leaf at this node
        if (prefix) {
          this.nested[prefix.substr(0, prefix.length - 1)] = true;
        }
        this.path(fullPath, obj[key]); // mixed type
      } else if (!obj[key][this.options.typeKey] || (this.options.typeKey === 'type' && obj[key].type.type)) {
        // Special-case: POJO with no bona-fide type key - interpret as tree of deep paths so recurse
        // nested object { last: { name: String }}
        this.nested[fullPath] = true;
        this.add(obj[key], fullPath + '.');
      } else {
        // There IS a bona-fide type key that may also be a POJO
        if (!this.options.typePojoToMixed && utils.isPOJO(obj[key][this.options.typeKey])) {
          // If a POJO is the value of a type key, make it a subdocument
          if (prefix) {
            this.nested[prefix.substr(0, prefix.length - 1)] = true;
          }
          // Propage `typePojoToMixed` to implicitly created schemas
          const opts = { typePojoToMixed: false };
          const _schema = new Schema(obj[key][this.options.typeKey], opts);
          const schemaWrappedPath = Object.assign({}, obj[key], { [this.options.typeKey]: _schema });
          this.path(prefix + key, schemaWrappedPath);
        } else {
          // Either the type is non-POJO or we interpret it as Mixed anyway
          if (prefix) {
            this.nested[prefix.substr(0, prefix.length - 1)] = true;
          }
          this.path(prefix + key, obj[key]);
        }
      }
    }

    const addedKeys = Object.keys(obj).
      map(key => prefix ? prefix + key : key);
    createVirtualProperties(this, addedKeys);
    return this;
  };

  Schema.prototype.path = function(path, obj) {
    // Convert to '.$' to check subpaths re: gh-6405
    const cleanPath = _pathToPositionalSyntax(path);
    if (obj === undefined) {
      let schematype = _getPath(this, path, cleanPath);
      if (schematype != null) {
        return schematype;
      }

      // Look for maps
      const mapPath = getMapPath(this, path);
      if (mapPath != null) {
        return mapPath;
      }

      // Look if a parent of this path is mixed
      schematype = this.hasMixedParent(cleanPath);
      if (schematype != null) {
        return schematype;
      }

      // subpaths?
      return hasNumericSubpathRegex.test(path)
        ? getPositionalPath(this, path)
        : undefined;
    }

    // some path names conflict with document methods
    const firstPieceOfPath = path.split('.')[0];
    if (reserved[firstPieceOfPath]) {
      throw new Error('`' + firstPieceOfPath + '` may not be used as a schema pathname');
    }

    if (typeof obj === 'object' && utils.hasUserDefinedProperty(obj, 'ref')) {
      validateRef(obj.ref, path);
    }

    // update the tree
    const subpaths = path.split(/\./);
    const last = subpaths.pop();
    let branch = this.tree;
    let fullPath = '';

    for (const sub of subpaths) {
      if (utils.specialProperties.has(sub)) {
        throw new Error('Cannot set special property `' + sub + '` on a schema');
      }
      fullPath = fullPath += (fullPath.length > 0 ? '.' : '') + sub;
      if (!branch[sub]) {
        this.nested[fullPath] = true;
        branch[sub] = {};
      }
      if (typeof branch[sub] !== 'object') {
        const msg = 'Cannot set nested path `' + path + '`. '
            + 'Parent path `'
            + fullPath
            + '` already set to type ' + branch[sub].name
            + '.';
        throw new Error(msg);
      }
      branch = branch[sub];
    }

    branch[last] = utils.clone(obj);

    this.paths[path] = this.interpretAsType(path, obj, this.options);
    const schemaType = this.paths[path];

    if (schemaType.$isSchemaMap) {
      // Maps can have arbitrary keys, so `$*` is internal shorthand for "any key"
      // The '$' is to imply this path should never be stored in MongoDB so we
      // can easily build a regexp out of this path, and '*' to imply "any key."
      const mapPath = path + '.$*';
      let _mapType = { type: {} };
      if (utils.hasUserDefinedProperty(obj, 'of')) {
        const isInlineSchema = utils.isPOJO(obj.of) &&
          Object.keys(obj.of).length > 0 &&
          !utils.hasUserDefinedProperty(obj.of, this.options.typeKey);
        _mapType = isInlineSchema ? new Schema(obj.of) : obj.of;
      }
      if (utils.hasUserDefinedProperty(obj, 'ref')) {
        _mapType = { type: _mapType, ref: obj.ref };
      }

      this.paths[mapPath] = this.interpretAsType(mapPath,
        _mapType, this.options);
      this.mapPaths.push(this.paths[mapPath]);
      schemaType.$__schemaType = this.paths[mapPath];
    }

    if (schemaType.$isSingleNested) {
      for (const key of Object.keys(schemaType.schema.paths)) {
        this.singleNestedPaths[path + '.' + key] = schemaType.schema.paths[key];
      }
      for (const key of Object.keys(schemaType.schema.singleNestedPaths)) {
        this.singleNestedPaths[path + '.' + key] =
          schemaType.schema.singleNestedPaths[key];
      }
      for (const key of Object.keys(schemaType.schema.subpaths)) {
        this.singleNestedPaths[path + '.' + key] =
          schemaType.schema.subpaths[key];
      }
      for (const key of Object.keys(schemaType.schema.nested)) {
        this.singleNestedPaths[path + '.' + key] = 'nested';
      }

      Object.defineProperty(schemaType.schema, 'base', {
        configurable: true,
        enumerable: false,
        writable: false,
        value: this.base
      });

      schemaType.caster.base = this.base;
      this.childSchemas.push({
        schema: schemaType.schema,
        model: schemaType.caster
      });
    } else if (schemaType.$isMongooseDocumentArray) {
      Object.defineProperty(schemaType.schema, 'base', {
        configurable: true,
        enumerable: false,
        writable: false,
        value: this.base
      });

      schemaType.casterConstructor.base = this.base;
      this.childSchemas.push({
        schema: schemaType.schema,
        model: schemaType.casterConstructor
      });
    }

    if (schemaType.$isMongooseArray && schemaType.caster instanceof SchemaType) {
      let arrayPath = path;
      let _schemaType = schemaType;

      const toAdd = [];
      while (_schemaType.$isMongooseArray) {
        arrayPath = arrayPath + '.$';

        // Skip arrays of document arrays
        if (_schemaType.$isMongooseDocumentArray) {
          _schemaType.$embeddedSchemaType._arrayPath = arrayPath;
          _schemaType.$embeddedSchemaType._arrayParentPath = path;
          _schemaType = _schemaType.$embeddedSchemaType.clone();
        } else {
          _schemaType.caster._arrayPath = arrayPath;
          _schemaType.caster._arrayParentPath = path;
          _schemaType = _schemaType.caster.clone();
        }

        _schemaType.path = arrayPath;
        toAdd.push(_schemaType);
      }

      for (const _schemaType of toAdd) {
        this.subpaths[_schemaType.path] = _schemaType;
      }
    }

    if (schemaType.$isMongooseDocumentArray) {
      for (const key of Object.keys(schemaType.schema.paths)) {
        const _schemaType = schemaType.schema.paths[key];
        this.subpaths[path + '.' + key] = _schemaType;
        if (typeof _schemaType === 'object' && _schemaType != null) {
          _schemaType.$isUnderneathDocArray = true;
        }
      }
      for (const key of Object.keys(schemaType.schema.subpaths)) {
        const _schemaType = schemaType.schema.subpaths[key];
        this.subpaths[path + '.' + key] = _schemaType;
        if (typeof _schemaType === 'object' && _schemaType != null) {
          _schemaType.$isUnderneathDocArray = true;
        }
      }
      for (const key of Object.keys(schemaType.schema.singleNestedPaths)) {
        const _schemaType = schemaType.schema.singleNestedPaths[key];
        this.subpaths[path + '.' + key] = _schemaType;
        if (typeof _schemaType === 'object' && _schemaType != null) {
          _schemaType.$isUnderneathDocArray = true;
        }
      }
    }

    return this;
  };

  // Other methods...

  inheritFromEventEmitter();
  defineReservedProperties();
  defineSchemaProperties();
  defineSchemaMethods();
}

// Other functions...

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

function _getPath(schema, path, cleanPath) {
  if (schema.paths.hasOwnProperty(path)) {
    return schema.paths[path];
  }
  if (schema.subpaths.hasOwnProperty(cleanPath)) {
    return schema.subpaths[cleanPath];
  }
  if (schema.singleNestedPaths.hasOwnProperty(cleanPath) && typeof schema.singleNestedPaths[cleanPath] === 'object') {
    return schema.singleNestedPaths[cleanPath];
  }

  return null;
}

function _pathToPositionalSyntax(path) {
  if (!/\.\d+/.test(path)) {
    return path;
  }
  return path.replace(/\.\d+\./g, '.$.').replace(/\.\d+$/, '.$');
}

function getMapPath(schema, path) {
  if (schema.mapPaths.length === 0) {
    return null;
  }
  for (const val of schema.mapPaths) {
    const _path = val.path;
    const re = new RegExp('^' + _path.replace(/\.\$\*/g, '\\.[^.]+') + '$');
    if (re.test(path)) {
      return schema.paths[_path];
    }
  }

  return null;
}

// Other functions...

module.exports = exports = Schema;