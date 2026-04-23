'use strict';
/*!
 * Module dependencies.
 */
const ChangeStream = require('./cursor/ChangeStream');
const EventEmitter = require('events').EventEmitter;
const Schema = require('./schema');
const Collection = require('./driver').get().Collection;
const STATES = require('./connectionstate');
const MongooseError = require('./error/index');
const PromiseProvider = require('./promise_provider');
const ServerSelectionError = require('./error/serverSelection');
const applyPlugins = require('./helpers/schema/applyPlugins');
const promiseOrCallback = require('./helpers/promiseOrCallback');
const get = require('./helpers/get');
const immediate = require('./helpers/immediate');
const mongodb = require('mongodb');
const pkg = require('../package.json');
const utils = require('./utils');
const parseConnectionString = require('mongodb/lib/core').parseConnectionString;
const arrayAtomicsSymbol = require('./helpers/symbols').arrayAtomicsSymbol;
const sessionNewDocuments = require('./helpers/symbols').sessionNewDocuments;
const noPasswordAuthMechanisms = ['MONGODB-X509'];
function Connection(base) {
  this.base = base;
  this.collections = {};
  this.models = {};
  this.config = {};
  this.replica = false;
  this.options = null;
  this.otherDbs = [];
  this.relatedDbs = {};
  this.states = STATES;
  this._readyState = STATES.disconnected;
  this._closeCalled = false;
  this._hasOpened = false;
  this.plugins = [];
  if (typeof base === 'undefined' || !base.connections.length) {
    this.id = 0;
  } else {
    this.id = base.connections.length;
  }
  this._queue = [];
}
Connection.prototype.__proto__ = EventEmitter.prototype;
Object.defineProperty(Connection.prototype, 'readyState', {
  get: function () {
    return this._readyState;
  },
  set: function (val) {
    if (!(val in STATES)) {
      throw new Error('Invalid connection state: ' + val);
    }
    if (this._readyState !== val) {
      this._readyState = val;
      for (const db of this.otherDbs) {
        db.readyState = val;
      }
      if (STATES.connected === val) {
        this._hasOpened = true;
      }
      this.emit(STATES[val]);
    }
  }
});
Connection.prototype.get = function (key) {
  if (this.config.hasOwnProperty(key)) {
    return this.config[key];
  }
  return get(this.options, key);
};
Connection.prototype.set = function (key, val) {
  if (this.config.hasOwnProperty(key)) {
    this.config[key] = val;
    return val;
  }
  this.options = this.options || {};
  this.options[key] = val;
  return val;
};
Connection.prototype.collections;
Connection.prototype.name;
Connection.prototype.models;
Connection.prototype.id;
Object.defineProperty(Connection.prototype, 'plugins', {
  configurable: false,
  enumerable: true,
  writable: true
});
Object.defineProperty(Connection.prototype, 'host', {
  configurable: true,
  enumerable: true,
  writable: true
});
Object.defineProperty(Connection.prototype, 'port', {
  configurable: true,
  enumerable: true,
  writable: true
});
Object.defineProperty(Connection.prototype, 'user', {
  configurable: true,
  enumerable: true,
  writable: true
});
Object.defineProperty(Connection.prototype, 'pass', {
  configurable: true,
  enumerable: true,
  writable: true
});
Connection.prototype.db;
Connection.prototype.client;
Connection.prototype.config;
Connection.prototype.createCollection = _wrapConnHelper(function createCollection(collection, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }
  this.db.createCollection(collection, options, cb);
});
Connection.prototype.startSession = _wrapConnHelper(function startSession(options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = null;
  }
  const session = this.client.startSession(options);
  cb(null, session);
});
Connection.prototype.transaction = function transaction(fn, options) {
  return this.startSession().then(session => {
    session[sessionNewDocuments] = new Map();
    return session.withTransaction(() => fn(session), options).then(res => {
      delete session[sessionNewDocuments];
      return res;
    }).catch(err => {
      for (const doc of session[sessionNewDocuments].keys()) {
        const state = session[sessionNewDocuments].get(doc);
        if (state.hasOwnProperty('isNew')) {
          doc.isNew = state.isNew;
        }
        if (state.hasOwnProperty('versionKey')) {
          doc.set(doc.schema.options.versionKey, state.versionKey);
        }
        for (const path of state.modifiedPaths) {
          doc.$__.activePaths.paths[path] = 'modify';
          doc.$__.activePaths.states.modify[path] = true;
        }
        for (const path of state.atomics.keys()) {
          const val = doc.$__getValue(path);
          if (val == null) {
            continue;
          }
          val[arrayAtomicsSymbol] = state.atomics.get(path);
        }
      }
      delete session[sessionNewDocuments];
      throw err;
    });
  });
};
Connection.prototype.dropCollection = _wrapConnHelper(function dropCollection(collection, cb) {
  this.db.dropCollection(collection, cb);
});
Connection.prototype.dropDatabase = _wrapConnHelper(function dropDatabase(cb) {
  for (const name of Object.keys(this.models)) {
    delete this.models[name].$init;
  }
  this.db.dropDatabase(cb);
});
function _wrapConnHelper(fn) {
  return function () {
    const cb = arguments.length > 0 ? arguments[arguments.length - 1] : null;
    const argsWithoutCb = typeof cb === 'function' ? Array.prototype.slice.call(arguments, 0, arguments.length - 1) : Array.prototype.slice.call(arguments);
    const disconnectedError = new MongooseError('Connection ' + this.id + ' was disconnected when calling `' + fn.name + '`');
    return promiseOrCallback(cb, cb => {
      immediate(() => {
        if (this.readyState === STATES.connecting && this._shouldBufferCommands()) {
          this._queue.push({ fn: fn, ctx: this, args: argsWithoutCb.concat([cb]) });
        } else if (this.readyState === STATES.disconnected && this.db == null) {
          cb(disconnectedError);
        } else {
          try {
            fn.apply(this, argsWithoutCb.concat([cb]));
          } catch (err) {
            return cb(err);
          }
        }
      });
    });
  };
}
Connection.prototype._shouldBufferCommands = function _shouldBufferCommands() {
  if (this.config.bufferCommands != null) {
    return this.config.bufferCommands;
  }
  if (this.base.get('bufferCommands') != null) {
    return this.base.get('bufferCommands');
  }
  return true;
};
Connection.prototype.error = function (err, callback) {
  if (callback) {
    callback(err);
    return null;
  }
  if (this.listeners('error').length > 0) {
    this.emit('error', err);
  }
  return Promise.reject(err);
};
Connection.prototype.onOpen = function () {
  this.readyState = STATES.connected;
  for (const d of this._queue) {
    d.fn.apply(d.ctx, d.args);
  }
  this._queue = [];
  for (const i in this.collections) {
    if (utils.object.hasOwnProperty(this.collections, i)) {
      this.collections[i].onOpen();
    }
  }
  this.emit('open');
};
/**
 * Open a connection using a MongoDB URI.
 *
 * @param {String} uri
 * @param {Object} [options]
 * @param {Function} [callback]
 * @returns {Connection}
 */
Connection.prototype.openUri = function (uri, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = null;
  }
  if (isInvalidOptionType(options)) {
    throw new MongooseError('Mongoose 5.x no longer supports ' + '`mongoose.connect(host, dbname, port)` or '`mongoose.createConnection(host, dbname, port)`. See http://mongoosejs.com/docs/connections.html for supported connection syntax');
  }
  if (typeof uri !== 'string') {
    throw new MongooseError('The `uri` parameter to `openUri()` must be a string, got "' + typeof uri + '". Make sure the first parameter to `mongoose.connect()` or `mongoose.createConnection()` is a string.');
  }
  if (callback != null && typeof callback !== 'function') {
    throw new MongooseError('3rd parameter to `mongoose.connect()` or `mongoose.createConnection()` must be a function, got "' + typeof callback + '"');
  }
  if (isActiveConnection.call(this)) {
    return handleActiveConnection.call(this, uri, callback);
  }
  this._connectionString = uri;
  this.readyState = STATES.connecting;
  this._closeCalled = false;
  const Promise = PromiseProvider.get();
  const _this = this;
  const normalizedOptions = normalizeOptions.call(this, options);
  this._connectionOptions = normalizedOptions;
  const dbName = normalizedOptions.dbName;
  if (dbName != null) {
    this.$dbName = dbName;
  }
  delete normalizedOptions.dbName;
  ensurePromiseLibrary(normalizedOptions);
  ensureUseNewUrlParser(normalizedOptions, this.base);
  ensureUseUnifiedTopology(normalizedOptions, this.base);
  ensureDriverInfo(normalizedOptions);
  const parsePromise = new Promise((resolve, reject) => {
    parseConnectionString(uri, normalizedOptions, (err, parsed) => {
      if (err) {
        return reject(err);
      }
      if (dbName) {
        this.name = dbName;
      } else if (parsed.defaultDatabase) {
        this.name = parsed.defaultDatabase;
      } else {
        this.name = get(parsed, 'auth.db', null);
      }
      this.host = get(parsed, 'hosts.0.host', 'localhost');
      this.port = get(parsed, 'hosts.0.port', 27017);
      this.user = this.user || get(parsed, 'auth.username');
      this.pass = this.pass || get(parsed, 'auth.password');
      resolve();
    });
  });
  const connectPromise = new Promise((resolve, reject) => {
    const client = new mongodb.MongoClient(uri, normalizedOptions);
    _this.client = client;
    client.setMaxListeners(0);
    client.connect(error => {
      if (error) {
        return reject(error);
      }
      _setClient(_this, client, normalizedOptions, dbName);
      resolve(_this);
    });
  });
  const serverSelectionError = new ServerSelectionError();
  this.$initialConnection = Promise.all([connectPromise, parsePromise]).then(res => res[0]).catch(err => {
    this.readyState = STATES.disconnected;
    if (err != null && err.name === 'MongoServerSelectionError') {
      err = serverSelectionError.assimilateError(err);
    }
    if (this.listeners('error').length > 0) {
      immediate(() => this.emit('error', err));
    }
    throw err;
  });
  this.then = function (resolve, reject) {
    return this.$initialConnection.then(() => {
      if (typeof resolve === 'function') {
        return resolve(_this);
      }
    }, reject);
  };
  this.catch = function (reject) {
    return this.$initialConnection.catch(reject);
  };
  if (callback != null) {
    this.$initialConnection = this.$initialConnection.then(() => callback(null, this), err => callback(err));
  }
  return this;
};
/**
 * Determine if the provided options argument is of an invalid type.
 *
 * @param {*} options
 * @returns {boolean}
 */
function isInvalidOptionType(options) {
  return ['string', 'number'].indexOf(typeof options) !== -1;
}
/**
 * Check whether the connection is already active.
 *
 * @returns {boolean}
 */
function isActiveConnection() {
  return this.readyState === STATES.connecting || this.readyState === STATES.connected;
}
/**
 * Handle calls to openUri on an already active connection.
 *
 * @param {String} uri
 * @param {Function} [callback]
 * @returns {Connection}
 */
function handleActiveConnection(uri, callback) {
  if (this._connectionString !== uri) {
    throw new MongooseError('Can\'t call `openUri()` on an active connection with different connection strings. Make sure you aren\'t calling `mongoose.connect()` multiple times. See: https://mongoosejs.com/docs/connections.html#multiple_connections');
  }
  if (typeof callback === 'function') {
    this.$initialConnection = this.$initialConnection.then(() => callback(null, this), err => callback(err));
  }
  return this;
}
/**
 * Normalize and extract configuration options.
 *
 * @param {Object} options
 * @returns {Object}
 */
function normalizeOptions(options) {
  const opts = options ? utils.clone(options) : {};
  const autoIndex = opts.config && opts.config.autoIndex != null ? opts.config.autoIndex : opts.autoIndex;
  if (autoIndex != null) {
    this.config.autoIndex = autoIndex !== false;
    delete opts.config;
    delete opts.autoIndex;
  }
  if ('autoCreate' in opts) {
    this.config.autoCreate = !!opts.autoCreate;
    delete opts.autoCreate;
  }
  if ('useCreateIndex' in opts) {
    this.config.useCreateIndex = !!opts.useCreateIndex;
    delete opts.useCreateIndex;
  }
  if ('useFindAndModify' in opts) {
    this.config.useFindAndModify = !!opts.useFindAndModify;
    delete opts.useFindAndModify;
  }
  if (opts.user || opts.pass) {
    opts.auth = opts.auth || {};
    opts.auth.user = opts.user;
    opts.auth.password = opts.pass;
    this.user = opts.user;
    this.pass = opts.pass;
  }
  delete opts.user;
  delete opts.pass;
  if (opts.bufferCommands != null) {
    if (opts.bufferMaxEntries == null) {
      opts.bufferMaxEntries = 0;
    }
    this.config.bufferCommands = opts.bufferCommands;
    delete opts.bufferCommands;
  }
  if (opts.useMongoClient != null) {
    handleUseMongoClient(opts);
  }
  return opts;
}
/**
 * Ensure a promise library is set.
 *
 * @param {Object} opts
 */
function ensurePromiseLibrary(opts) {
  if (!('promiseLibrary' in opts)) {
    opts.promiseLibrary = PromiseProvider.get();
  }
}
/**
 * Ensure useNewUrlParser flag is set.
 *
 * @param {Object} opts
 * @param {Object} base
 */
function ensureUseNewUrlParser(opts, base) {
  if (!('useNewUrlParser' in opts)) {
    if ('useNewUrlParser' in base.options) {
      opts.useNewUrlParser = base.options.useNewUrlParser;
    } else {
      opts.useNewUrlParser = false;
    }
  }
}
/**
 * Ensure useUnifiedTopology flag is set.
 *
 * @param {Object} opts
 * @param {Object} base
 */
function ensureUseUnifiedTopology(opts, base) {
  if (!utils.hasUserDefinedProperty(opts, 'useUnifiedTopology')) {
    if (utils.hasUserDefinedProperty(base.options, 'useUnifiedTopology')) {
      opts.useUnifiedTopology = base.options.useUnifiedTopology;
    } else {
      opts.useUnifiedTopology = false;
    }
  }
}
/**
 * Ensure driverInfo is set.
 *
 * @param {Object} opts
 */
function ensureDriverInfo(opts) {
  if (!utils.hasUserDefinedProperty(opts, 'driverInfo')) {
    opts.driverInfo = {
      name: 'Mongoose',
      version: pkg.version
    };
  }
}
function _setClient(conn, client, options, dbName) {
  const db = dbName != null ? client.db(dbName) : client.db();
  conn.db = db;
  conn.client = client;
  conn._closeCalled = client._closeCalled;
  const _handleReconnect = () => {
    if (conn.readyState !== STATES.connected) {
      conn.readyState = STATES.connected;
      conn.emit('reconnect');
      conn.emit('reconnected');
      conn.onOpen();
    }
  };
  const type = get(db, 's.topology.s.description.type', '');
  if (options.useUnifiedTopology) {
    if (type === 'Single') {
      const server = Array.from(db.s.topology.s.servers.values())[0];
      server.s.topology.on('serverHeartbeatSucceeded', () => {
        _handleReconnect();
      });
      server.s.pool.on('reconnect', () => {
        _handleReconnect();
      });
      client.on('serverDescriptionChanged', ev => {
        const newDescription = ev.newDescription;
        if (newDescription.type === 'Standalone') {
          _handleReconnect();
        } else {
          conn.readyState = STATES.disconnected;
        }
      });
    } else if (type.startsWith('ReplicaSet')) {
      client.on('topologyDescriptionChanged', ev => {
        const description = ev.newDescription;
        const servers = Array.from(ev.newDescription.servers.values());
        const allServersDisconnected = description.type === 'ReplicaSetNoPrimary' && servers.reduce((cur, d) => cur || d.type === 'Unknown', false);
        if (conn.readyState === STATES.connected && allServersDisconnected) {
          conn.readyState = STATES.disconnected;
        } else if (conn.readyState === STATES.disconnected && !allServersDisconnected) {
          _handleReconnect();
        }
      });
      client.on('close', function () {
        const type = get(db, 's.topology.s.description.type', '');
        if (type !== 'ReplicaSetWithPrimary') {
          conn.readyState = STATES.disconnected;
        }
      });
    }
  }
  db.s.topology.on('reconnectFailed', function () {
    conn.emit('reconnectFailed');
  });
  if (!options.useUnifiedTopology) {
    client.on('reconnect', function () {
      _handleReconnect();
    });
    db.s.topology.on('left', function (data) {
      conn.emit('left', data);
    });
  }
  db.s.topology.on('joined', function (data) {
    conn.emit('joined', data);
  });
  db.s.topology.on('fullsetup', function (data) {
    conn.emit('fullsetup', data);
  });
  if (get(db, 's.topology.s.coreTopology.s.pool') != null) {
    db.s.topology.s.coreTopology.s.pool.on('attemptReconnect', function () {
      conn.emit('attemptReconnect');
    });
  }
  if (!options.useUnifiedTopology) {
    client.on('close', function () {
      conn.readyState = STATES.disconnected;
    });
  } else if (!type.startsWith('ReplicaSet')) {
    client.on('close', function () {
      conn.readyState = STATES.disconnected;
    });
  }
  if (!options.useUnifiedTopology) {
    client.on('left', function () {
      if (conn.readyState === STATES.connected && get(db, 's.topology.s.coreTopology.s.replicaSetState.topologyType') === 'ReplicaSetNoPrimary') {
        conn.readyState = STATES.disconnected;
      }
    });
    client.on('timeout', function () {
      conn.emit('timeout');
    });
  }
  delete conn.then;
  delete conn.catch;
  conn.onOpen();
}
const handleUseMongoClient = function handleUseMongoClient(options) {
  console.warn('WARNING: The `useMongoClient` option is no longer necessary in mongoose 5.x, please remove it.');
  const stack = new Error().stack;
  console.warn(stack.substr(stack.indexOf('\n') + 1));
  delete options.useMongoClient;
};
Connection.prototype.close = function (force, callback) {
  if (typeof force === 'function') {
    callback = force;
    force = false;
  }
  this.$wasForceClosed = !!force;
  return promiseOrCallback(callback, cb => {
    this._close(force, cb);
  });
};
Connection.prototype._close = function (force, callback) {
  const _this = this;
  const closeCalled = this._closeCalled;
  this._closeCalled = true;
  if (this.client != null) {
    this.client._closeCalled = true;
  }
  switch (this.readyState) {
    case STATES.disconnected:
      if (closeCalled) {
        callback();
      } else {
        this.doClose(force, function (err) {
          if (err) {
            return callback(err);
          }
          _this.onClose(force);
          callback(null);
        });
      }
      break;
    case STATES.connected:
      this.readyState = STATES.disconnecting;
      this.doClose(force, function (err) {
        if (err) {
          return callback(err);
        }
        _this.onClose(force);
        callback(null);
      });
      break;
    case STATES.connecting:
      this.once('open', function () {
        _this.close(callback);
      });
      break;
    case STATES.disconnecting:
      this.once('close', function () {
        callback();
      });
      break;
  }
  return this;
};
Connection.prototype.onClose = function (force) {
  this.readyState = STATES.disconnected;
  for (const i in this.collections) {
    if (utils.object.hasOwnProperty(this.collections, i)) {
      this.collections[i].onClose(force);
    }
  }
  this.emit('close', force);
};
Connection.prototype.collection = function (name, options) {
  const defaultOptions = {
    autoIndex: this.config.autoIndex != null ? this.config.autoIndex : this.base.options.autoIndex,
    autoCreate: this.config.autoCreate != null ? this.config.autoCreate : this.base.options.autoCreate
  };
  options = Object.assign({}, defaultOptions, options ? utils.clone(options) : {});
  options.$wasForceClosed = this.$wasForceClosed;
  if (!(name in this.collections)) {
    this.collections[name] = new Collection(name, this, options);
  }
  return this.collections[name];
};
Connection.prototype.plugin = function (fn, opts) {
  this.plugins.push([fn, opts]);
  return this;
};
Connection.prototype.model = function (name, schema, collection, options) {
  if (!(this instanceof Connection)) {
    throw new MongooseError('`connection.model()` should not be run with `new`. If you are doing `new db.model(foo)(bar)`, use `db.model(foo)(bar)` instead');
  }
  let fn;
  if (typeof name === 'function') {
    fn = name;
    name = fn.name;
  }
  if (typeof schema === 'string') {
    collection = schema;
    schema = false;
  }
  if (utils.isObject(schema) && !schema.instanceOfSchema) {
    schema = new Schema(schema);
  }
  if (schema && !schema.instanceOfSchema) {
    throw new Error('The 2nd parameter to `mongoose.model()` should be a schema or a POJO');
  }
  const defaultOptions = { cache: false, overwriteModels: this.base.options.overwriteModels };
  const opts = Object.assign(defaultOptions, options, { connection: this });
  if (this.models[name] && !collection && opts.overwriteModels !== true) {
    if (schema && schema.instanceOfSchema && schema !== this.models[name].schema) {
      throw new MongooseError.OverwriteModelError(name);
    }
    return this.models[name];
  }
  let model;
  if (schema && schema.instanceOfSchema) {
    applyPlugins(schema, this.plugins, null, '$connectionPluginsApplied');
    model = this.base.model(fn || name, schema, collection, opts);
    if (!this.models[name]) {
      this.models[name] = model;
    }
    model.init(function $modelInitNoop() {});
    return model;
  }
  if (this.models[name] && collection) {
    model = this.models[name];
    schema = model.prototype.schema;
    const sub = model.__subclass(this, schema, collection);
    return sub;
  }
  model = this.base.models[name];
  if (!model) {
    throw new MongooseError.MissingSchemaError(name);
  }
  if (this === model.prototype.db && (!collection || collection === model.collection.name)) {
    if (!this.models[name]) {
      this.models[name] = model;
    }
    return model;
  }
  this.models[name] = model.__subclass(this, schema, collection);
  return this.models[name];
};
Connection.prototype.deleteModel = function (name) {
  if (typeof name === 'string') {
    const model = this.model(name);
    if (model == null) {
      return this;
    }
    const collectionName = model.collection.name;
    delete this.models[name];
    delete this.collections[collectionName];
    delete this.base.modelSchemas[name];
    this.emit('deleteModel', model);
  } else if (name instanceof RegExp) {
    const pattern = name;
    const names = this.modelNames();
    for (const name of names) {
      if (pattern.test(name)) {
        this.deleteModel(name);
      }
    }
  } else {
    throw new Error('First parameter to `deleteModel()` must be a string or regexp, got "' + name + '"');
  }
  return this;
};
Connection.prototype.watch = function (pipeline, options) {
  const disconnectedError = new MongooseError('Connection ' + this.id + ' was disconnected when calling `watch()`');
  const changeStreamThunk = cb => {
    immediate(() => {
      if (this.readyState === STATES.connecting) {
        this.once('open', function () {
          const driverChangeStream = this.db.watch(pipeline, options);
          cb(null, driverChangeStream);
        });
      } else if (this.readyState === STATES.disconnected && this.db == null) {
        cb(disconnectedError);
      } else {
        const driverChangeStream = this.db.watch(pipeline, options);
        cb(null, driverChangeStream);
      }
    });
  };
  const changeStream = new ChangeStream(changeStreamThunk, pipeline, options);
  return changeStream;
};
Connection.prototype.modelNames = function () {
  return Object.keys(this.models);
};
Connection.prototype.shouldAuthenticate = function () {
  return this.user != null && (this.pass != null || this.authMechanismDoesNotRequirePassword());
};
Connection.prototype.authMechanismDoesNotRequirePassword = function () {
  if (this.options && this.options.auth) {
    return noPasswordAuthMechanisms.indexOf(this.options.auth.authMechanism) >= 0;
  }
  return true;
};
Connection.prototype.optionsProvideAuthenticationData = function (options) {
  return options && options.user && (options.pass || this.authMechanismDoesNotRequirePassword());
};
Connection.prototype.getClient = function getClient() {
  return this.client;
};
Connection.prototype.setClient = function setClient(client) {
  if (!(client instanceof mongodb.MongoClient)) {
    throw new MongooseError('Must call `setClient()` with an instance of MongoClient');
  }
  if (this.client != null || this.readyState !== STATES.disconnected) {
    throw new MongooseError('Cannot call `setClient()` on a connection that is already connected.');
  }
  if (!client.isConnected()) {
    throw new MongooseError('Cannot call `setClient()` with a MongoClient that is not connected.');
  }
  this._connectionString = client.s.url;
  _setClient(this, client, { useUnifiedTopology: client.s.options.useUnifiedTopology }, client.s.options.dbName);
  return this;
};
Connection.STATES = STATES;
module.exports = Connection;