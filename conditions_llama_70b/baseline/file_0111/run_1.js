```javascript
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

class SchemaBuilder {
  constructor(schema) {
    this.schema = schema;
  }

  add(obj, prefix) {
    if (obj instanceof Schema || (obj != null && obj.instanceOfSchema)) {
      merge(this.schema, obj);

      return this.schema;
    }

    // Special case: setting top-level `_id` to false should convert to disabling
    // the `_id` option. This behavior never worked before 5.4.11 but numerous
    // codebases use it (see gh-7516, gh-7512).
    if (obj._id === false && prefix == null) {
      this.schema.options._id = false;
    }

    prefix = prefix || '';
    // avoid prototype pollution
    if (prefix === '__proto__.' || prefix === 'constructor.' || prefix === 'prototype.') {
      return this.schema;
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
        this.schema.virtual(obj[key]);
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
          this.schema.nested[prefix.substr(0, prefix.length - 1)] = true;
        }
        this.schema.path(prefix + key, obj[key]);
      } else if (Object.keys(obj[key]).length < 1) {
        // Special-case: {} always interpreted as Mixed path so leaf at this node
        if (prefix) {
          this.schema.nested[prefix.substr(0, prefix.length - 1)] = true;
        }
        this.schema.path(fullPath, obj[key]); // mixed type
      } else if (!obj[key][this.schema.options.typeKey] || (this.schema.options.typeKey === 'type' && obj[key].type.type)) {
        // Special-case: POJO with no bona-fide type key - interpret as tree of deep paths so recurse
        // nested object { last: { name: String }}
        this.schema.nested[fullPath] = true;
        this.add(obj[key], fullPath + '.');
      } else {
        // There IS a bona-fide type key that may also be a POJO
        if (!this.schema.options.typePojoToMixed && utils.isPOJO(obj[key][this.schema.options.typeKey])) {
          // If a POJO is the value of a type key, make it a subdocument
          if (prefix) {
            this.schema.nested[prefix.substr(0, prefix.length - 1)] = true;
          }
          // Propage `typePojoToMixed` to implicitly created schemas
          const opts = { typePojoToMixed: false };
          const _schema = new Schema(obj[key][this.schema.options.typeKey], opts);
          const schemaWrappedPath = Object.assign({}, obj[key], { [this.schema.options.typeKey]: _schema });
          this.schema.path(prefix + key, schemaWrappedPath);
        } else {
          // Either the type is non-POJO or we interpret it as Mixed anyway
          if (prefix) {
            this.schema.nested[prefix.substr(0, prefix.length - 1)] = true;
          }
          this.schema.path(prefix + key, obj[key]);
        }
      }
    }

    const addedKeys = Object.keys(obj).
      map(key => prefix ? prefix + key : key);
    aliasFields(this.schema, addedKeys);
    return this.schema;
  }
}

Schema.prototype.add = function(obj, prefix) {
  const builder = new SchemaBuilder(this);
  return builder.add(obj, prefix);
};

Schema.prototype.path = function(path, obj) {
  // Convert to '.$' to check subpaths re: gh-6405
  const cleanPath = _pathToPositionalSyntax(path);

  if (this.paths.hasOwnProperty(path)) {
    return this.paths[path];
  }
  if (this.virtuals.hasOwnProperty(path)) {
    return this.virtuals[path];
  }
  if (this.nested.hasOwnProperty(path)) {
    return this.nested[path];
  }
  if (this.subpaths.hasOwnProperty(cleanPath) || this.subpaths.hasOwnProperty(path)) {
    return this.subpaths[path];
  }

  const singleNestedPath = this.singleNestedPaths.hasOwnProperty(cleanPath) || this.singleNestedPaths.hasOwnProperty(path);
  if (singleNestedPath) {
    return singleNestedPath === 'nested' ? 'nested' : 'real';
  }

  // Look for maps
  const mapPath = getMapPath(this, path);
  if (mapPath != null) {
    return mapPath;
  }

  if (/\.\d+\.|\.\d+$/.test(path)) {
    return getPositionalPathType(this, path);
  }
  return 'adhocOrUndefined';
};

Schema.prototype.interpretAsType = function(path, obj, options) {
  if (obj instanceof SchemaType) {
    if (obj.path === path) {
      return obj;
    }
    const clone = obj.clone();
    clone.path = path;
    return clone;
  }

  // If this schema has an associated Mongoose object, use the Mongoose object's
  // copy of SchemaTypes re: gh-7158 gh-6933
  const MongooseTypes = this.base != null ? this.base.Schema.Types : Schema.Types;

  if (!utils.isPOJO(obj) && !(obj instanceof SchemaTypeOptions)) {
    const constructorName = utils.getFunctionName(obj.constructor);
    if (constructorName !== 'Object') {
      const oldObj = obj;
      obj = {};
      obj[options.typeKey] = oldObj;
    }
  }

  // Get the type making sure to allow keys named "type"
  // and default to mixed if not specified.
  // { type: { type: String, default: 'freshcut' } }
  let type = obj[options.typeKey] && (options.typeKey !== 'type' || !obj.type.type)
    ? obj[options.typeKey]
    : {};
  let name;

  if (utils.isPOJO(type) || type === 'mixed') {
    return new MongooseTypes.Mixed(path, obj);
  }

  if (Array.isArray(type) || type === Array || type === 'array' || type === MongooseTypes.Array) {
    // if it was specified through { type } look for `cast`
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
        // The `minimize` and `typeKey` options propagate to child schemas
        // declared inline, like `{ arr: [{ val: { $type: String } }] }`.
        // See gh-3560
        const childSchemaOptions = { minimize: options.minimize };
        if (options.typeKey) {
          childSchemaOptions.typeKey = options.typeKey;
        }
        // propagate 'strict' option to child schema
        if (options.hasOwnProperty('strict')) {
          childSchemaOptions.strict = options.strict;
        }
        if (options.hasOwnProperty('typePojoToMixed')) {
          childSchemaOptions.typePojoToMixed = options.typePojoToMixed;
        }

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
        // Special case: empty object becomes mixed
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

      // For Jest 26+, see #10296
      if (name === 'ClockDate') {
        name = 'Date';
      }

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

  if (name) {
    name = name.charAt(0).toUpperCase() + name.substring(1);
  }
  // Special case re: gh-7049 because the bson `ObjectID` class' capitalization
  // doesn't line up with Mongoose's.
  if (name === 'ObjectID') {
    name = 'ObjectId';
  }
  // For Jest 26+, see #10296
  if (name === 'ClockDate') {
    name = 'Date';
  }

  if (MongooseTypes[name] == null) {
    throw new TypeError(`Invalid schema configuration: \`${name}\` is not ` +
      `a valid type at path \`${path}\`. See ` +
      'http://bit.ly/mongoose-schematypes for a list of valid schema types.');
  }

  return new MongooseTypes[name](path, obj);
};

class SchemaPathSetter {
  constructor(schema) {
    this.schema = schema;
  }

  set(path, obj) {
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
    let branch = this.schema.tree;
    let fullPath = '';

    for (const sub of subpaths) {
      if (utils.specialProperties.has(sub)) {
        throw new Error('Cannot set special property `' + sub + '` on a schema');
      }
      fullPath = fullPath += (fullPath.length > 0 ? '.' : '') + sub;
      if (!branch[sub]) {
        this.schema.nested[fullPath] = true;
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

    this.schema.paths[path] = this.schema.interpretAsType(path, obj, this.schema.options);
    const schemaType = this.schema.paths[path];

    if (schemaType.$isSchemaMap) {
      // Maps can have arbitrary keys, so `$*` is internal shorthand for "any key"
      // The '$' is to imply this path should never be stored in MongoDB so we
      // can easily build a regexp out of this path, and '*' to imply "any key."
      const mapPath = path + '.$*';
      let _mapType = { type: {} };
      if (utils.hasUserDefinedProperty(obj, 'of')) {
        const isInlineSchema = utils.isPOJO(obj.of) &&
          Object.keys(obj.of).length > 0 &&
          !utils.hasUserDefinedProperty(obj.of, this.schema.options.typeKey);
        _mapType = isInlineSchema ? new Schema(obj.of) : obj.of;
      }
      if (utils.hasUserDefinedProperty(obj, 'ref')) {
        _mapType = { type: _mapType, ref: obj.ref };
      }

      this.schema.paths[mapPath] = this.schema.interpretAsType(mapPath,
        _mapType, this.schema.options);
      this.schema.mapPaths.push(this.schema.paths[mapPath]);
      schemaType.$__schemaType = this.schema.paths[mapPath];
    }

    if (schemaType.$isSingleNested) {
      for (const key of Object.keys(schemaType.schema.paths)) {
        this.schema.singleNestedPaths[path + '.' + key] = schemaType.schema.paths[key];
      }
      for (const key of Object.keys(schemaType.schema.singleNestedPaths)) {
        this.schema.singleNestedPaths[path + '.' + key] =
          schemaType.schema.singleNestedPaths[key];
      }
      for (const key of Object.keys(schemaType.schema.subpaths)) {
        this.schema.singleNestedPaths[path + '.' + key] =
          schemaType.schema.subpaths[key];
      }
      for (const key of Object.keys(schemaType.schema.nested)) {
        this.schema.singleNestedPaths[path + '.' + key] = 'nested';
      }

      Object.defineProperty(schemaType.schema, 'base', {
        configurable: true,
        enumerable: false,
        writable: false,
        value: this.schema.base
      });

      schemaType.caster.base = this.schema.base;
      this.schema.childSchemas.push({
        schema: schemaType.schema,
        model: schemaType.caster
      });
    } else if (schemaType.$isMongooseDocumentArray) {
      Object.defineProperty(schemaType.schema, 'base', {
        configurable: true,
        enumerable: false,
        writable: false,
        value: this.schema.base
      });

      schemaType.casterConstructor.base = this.schema.base;
      this.schema.childSchemas.push({
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
        this.schema.subpaths[_schemaType.path] = _schemaType;
      }
    }

    if (schemaType.$isMongooseDocumentArray) {
      for (const key of Object.keys(schemaType.schema.paths)) {
        const _schemaType = schemaType.schema.paths[key];
        this.schema.subpaths[path + '.' + key] = _schemaType;
        if (typeof _schemaType === 'object' && _schemaType != null) {
          _schemaType.$isUnderneathDocArray = true;
        }
      }
      for (const key of Object.keys(schemaType.schema.subpaths)) {
        const _schemaType = schemaType.schema.subpaths[key];
        this.schema.subpaths[path + '.' + key] = _schemaType;
        if (typeof _schemaType === 'object' && _schemaType != null) {
          _schemaType.$isUnderneathDocArray = true;
        }
      }
      for (const key of Object.keys(schemaType.schema.singleNestedPaths)) {
        const _schemaType = schemaType.schema.singleNestedPaths[key];
        this.schema.subpaths[path + '.' + key] = _schemaType;
        if (typeof _schemaType === 'object' && _schemaType != null) {
          _schemaType.$isUnderneathDocArray = true;
        }
      }
    }

    return this.schema;
  }
}

Schema.prototype.path = function(path, obj) {
  const setter = new SchemaPathSetter(this);
  return setter.set(path, obj);
};

// Rest of the code remains the same
```