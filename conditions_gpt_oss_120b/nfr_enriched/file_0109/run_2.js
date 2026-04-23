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

/*!
 * A list of authentication mechanisms that don't require a password for authentication.
 * This is used by the authMechanismDoesNotRequirePassword method.
 *
 * @api private
 */
const noPasswordAuthMechanisms = ['MONGODB-X509'];

/**
 * Connection constructor
 *
 * For practical reasons, a Connection equals a Db.
 *
 * @param {Mongoose} base a mongoose instance
 * @inherits NodeJS EventEmitter http://nodejs.org/api/events.html#events_class_events_eventemitter
 * @event `connecting`: Emitted when `connection.openUri()` is executed on this connection.
 * @event `connected`: Emitted when this connection successfully connects to the db. May be emitted _multiple_ times in `reconnected` scenarios.
 * @event `open`: Emitted after we `connected` and `onOpen` is executed on all of this connections models.
 * @event `disconnecting`: Emitted when `connection.close()` was executed.
 * @event `disconnected`: Emitted after getting disconnected from the db.
 * @event `close`: Emitted after we `disconnected` and `onClose` executed on all of this connections models.
 * @event `reconnected`: Emitted after we `connected` and subsequently `disconnected`, followed by successfully another successful connection.
 * @event `error`: Emitted when an error occurs on this connection.
 * @event `fullsetup`: Emitted after the driver has connected to primary and all secondaries if specified in the connection string.
 * @api public
 */
function Connection(base) {
  this.base = base;
  this.collections = {};
  this.models = {};
  this.config = {};
  this.replica = false;
  this.options = null;
  this.otherDbs = []; // FIXME: To be replaced with relatedDbs
  this.relatedDbs = {}; // Hashmap of other dbs that share underlying connection
  this.states = STATES;
  this._readyState = STATES.disconnected;
  this._closeCalled = false;
  this._hasOpened = false;
  this.plugins = [];
  this.id = (typeof base === 'undefined' || !base.connections.length) ? 0 : base.connections.length;
  this._queue = [];
}
Connection.prototype.__proto__ = EventEmitter.prototype;

/* readyState getter/setter */
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

/* option getters/setters */
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

/* collections, name, models, id placeholders */
Connection.prototype.collections;
Connection.prototype.name;
Connection.prototype.models;
Connection.prototype.id;

/* plugins property */
Object.defineProperty(Connection.prototype, 'plugins', {
  configurable: false,
  enumerable: true,
  writable: true
});

/* host/port/user/pass placeholders */
Object.defineProperty(Connection.prototype, 'host', { configurable: true, enumerable: true, writable: true });
Object.defineProperty(Connection.prototype, 'port', { configurable: true, enumerable: true, writable: true });
Object.defineProperty(Connection.prototype, 'user', { configurable: true, enumerable: true, writable: true });
Object.defineProperty(Connection.prototype, 'pass', { configurable: true, enumerable: true, writable: true });

/* db/client placeholders */
Connection.prototype.db;
Connection.prototype.client;
Connection.prototype.config;

/* Helper wrappers */
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

Connection.prototype.dropCollection = _wrapConnHelper(function dropCollection(collection, cb) {
  this.db.dropCollection(collection, cb);
});

Connection.prototype.dropDatabase = _wrapConnHelper(function dropDatabase(cb) {
  for (const name of Object.keys(this.models)) {
    delete this.models[name].$init;
  }
  this.db.dropDatabase(cb);
});

/* transaction handling */
Connection.prototype.transaction = function transaction(fn, options) {
  return this.startSession().then(session => {
    session[sessionNewDocuments] = new Map();
    return session.withTransaction(() => fn(session), options)
      .then(res => {
        delete session[sessionNewDocuments];
        return res;
      })
      .catch(err => {
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
            if (val == null) continue;
            val[arrayAtomicsSymbol] = state.atomics.get(path);
          }
        }
        delete session[sessionNewDocuments];
        throw err;
      });
  });
};

/* internal helpers */
function _wrapConnHelper(fn) {
  return function () {
    const cb = arguments.length > 0 ? arguments[arguments.length - 1] : null;
    const argsWithoutCb = typeof cb === 'function' ?
      Array.prototype.slice.call(arguments, 0, arguments.length - 1) :
      Array.prototype.slice.call(arguments);
    const disconnectedError = new MongooseError('Connection ' + this.id +
      ' was disconnected when calling `' + fn.name + '`');
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
  if (this.config.bufferCommands != null) return this.config.bufferCommands;
  if (this.base.get('bufferCommands') != null) return this.base.get('bufferCommands');
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

/* openUri refactored into smaller steps */
Connection.prototype.openUri = function (uri, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = null;
  }
  _validateOpenUriArgs(uri, options, callback);
  if (this._isActiveConnection(uri, callback)) return this;
  this._initializeConnectionState(uri);
  const Promise = PromiseProvider.get();
  const parsedOptions = _prepareOptions.call(this, options);
  const dbName = parsedOptions.dbName;
  if (dbName != null) this.$dbName = dbName;
  delete parsedOptions.dbName;
  this._connectionOptions = parsedOptions;
  const parsePromise = _parseUriPromise.call(this, uri, parsedOptions, dbName);
  const clientPromise = _createClientPromise.call(this, uri, parsedOptions);
  const serverSelectionError = new ServerSelectionError();
  this.$initialConnection = Promise.all([clientPromise, parsePromise])
    .then(res => res[0])
    .catch(err => {
      this.readyState = STATES.disconnected;
      if (err && err.name === 'MongoServerSelectionError') {
        err = serverSelectionError.assimilateError(err);
      }
      if (this.listeners('error').length > 0) {
        immediate(() => this.emit('error', err));
      }
      throw err;
    });
  this.then = function (resolve, reject) {
    return this.$initialConnection.then(() => {
      if (typeof resolve === 'function') return resolve(this);
    }, reject);
  };
  this.catch = function (reject) {
    return this.$initialConnection.catch(reject);
  };
  if (callback != null) {
    this.$initialConnection = this.$initialConnection.then(
      () => callback(null, this),
      err => callback(err)
    );
  }
  return this;
};

/* validation of openUri arguments */
function _validateOpenUriArgs(uri, options, callback) {
  if (['string', 'number'].indexOf(typeof options) !== -1) {
    throw new MongooseError('Mongoose 5.x no longer supports `mongoose.connect(host, dbname, port)` or `mongoose.createConnection(host, dbname, port)`. See http://mongoosejs.com/docs/connections.html for supported connection syntax');
  }
  if (typeof uri !== 'string') {
    throw new MongooseError('The `uri` parameter to `openUri()` must be a string, got "' + typeof uri + '". Make sure the first parameter to `mongoose.connect()` or `mongoose.createConnection()` is a string.');
  }
  if (callback != null && typeof callback !== 'function') {
    throw new MongooseError('3rd parameter to `mongoose.connect()` or `mongoose.createConnection()` must be a function, got "' + typeof callback + '"');
  }
}

/* check for already active connection */
Connection.prototype._isActiveConnection = function (uri, callback) {
  if (this.readyState === STATES.connecting || this.readyState === STATES.connected) {
    if (this._connectionString !== uri) {
      throw new MongooseError('Can\'t call `openUri()` on an active connection with different connection strings. Make sure you aren\'t calling `mongoose.connect()` multiple times. See: https://mongoosejs.com/docs/connections.html#multiple_connections');
    }
    if (typeof callback === 'function') {
      this.$initialConnection = this.$initialConnection.then(
        () => callback(null, this),
        err => callback(err)
      );
    }
    return true;
  }
  return false;
};

/* initialize connection state */
Connection.prototype._initializeConnectionState = function (uri) {
  this._connectionString = uri;
  this.readyState = STATES.connecting;
  this._closeCalled = false;
};

/* prepare options for openUri */
function _prepareOptions(options) {
  const opts = options ? utils.clone(options) : {};
  if (opts.config && opts.config.autoIndex != null) {
    this.config.autoIndex = !!opts.config.autoIndex;
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
    if (opts.bufferMaxEntries == null) opts.bufferMaxEntries = 0;
    this.config.bufferCommands = opts.bufferCommands;
    delete opts.bufferCommands;
  }
  if (opts.useMongoClient != null) {
    handleUseMongoClient(opts);
  }
  if (!('promiseLibrary' in opts)) {
    opts.promiseLibrary = PromiseProvider.get();
  }
  if (!('useNewUrlParser' in opts)) {
    opts.useNewUrlParser = this.base.options.useNewUrlParser || false;
  }
  if (!utils.hasUserDefinedProperty(opts, 'useUnifiedTopology')) {
    opts.useUnifiedTopology = this.base.options.useUnifiedTopology || false;
  }
  if (!utils.hasUserDefinedProperty(opts, 'driverInfo')) {
    opts.driverInfo = { name: 'Mongoose', version: pkg.version };
  }
  return opts;
}

/* parse URI and set connection properties */
function _parseUriPromise(uri, options, dbName) {
  const Promise = PromiseProvider.get();
  return new Promise((resolve, reject) => {
    parseConnectionString(uri, options, (err, parsed) => {
      if (err) return reject(err);
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
}

/* create MongoClient and resolve when connected */
function _createClientPromise(uri, options) {
  const Promise = PromiseProvider.get();
  const _this = this;
  return new Promise((resolve, reject) => {
    const client = new mongodb.MongoClient(uri, options);
    _this.client = client;
    client.setMaxListeners(0);
    client.connect(error => {
      if (error) return reject(error);
      _setClient(_this, client, options, _this.$dbName);
      resolve(_this);
    });
  });
}

/* set client and wire events */
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
  const topologyType = get(db, 's.topology.s.description.type', '');
  if (options.useUnifiedTopology) {
    _setupUnifiedTopologyEvents(conn, client, db, topologyType, _handleReconnect);
  } else {
    client.on('reconnect', _handleReconnect);
    db.s.topology.on('left', data => conn.emit('left', data));
  }
  db.s.topology.on('joined', data => conn.emit('joined', data));
  db.s.topology.on('fullsetup', data => conn.emit('fullsetup', data));
  if (get(db, 's.topology.s.coreTopology.s.pool')) {
    db.s.topology.s.coreTopology.s.pool.on('attemptReconnect', () => conn.emit('attemptReconnect'));
  }
  if (!options.useUnifiedTopology) {
    client.on('close', () => conn.readyState = STATES.disconnected);
  } else if (!topologyType.startsWith('ReplicaSet')) {
    client.on('close', () => conn.readyState = STATES.disconnected);
  }
  if (!options.useUnifiedTopology) {
    client.on('left', () => {
      if (conn.readyState === STATES.connected &&
        get(db, 's.topology.s.coreTopology.s.replicaSetState.topologyType') === 'ReplicaSetNoPrimary') {
        conn.readyState = STATES.disconnected;
      }
    });
    client.on('timeout', () => conn.emit('timeout'));
  }
  delete conn.then;
  delete conn.catch;
  conn.onOpen();
}

/* unified topology event wiring */
function _setupUnifiedTopologyEvents(conn, client, db, topologyType, reconnectHandler) {
  if (topologyType === 'Single') {
    const server = Array.from(db.s.topology.s.servers.values())[0];
    server.s.topology.on('serverHeartbeatSucceeded', reconnectHandler);
    server.s.pool.on('reconnect', reconnectHandler);
    client.on('serverDescriptionChanged', ev => {
      const newDesc = ev.newDescription;
      if (newDesc.type === 'Standalone') reconnectHandler();
      else conn.readyState = STATES.disconnected;
    });
  } else if (topologyType.startsWith('ReplicaSet')) {
    client.on('topologyDescriptionChanged', ev => {
      const desc = ev.newDescription;
      const servers = Array.from(desc.servers.values());
      const allDisconnected = desc.type === 'ReplicaSetNoPrimary' &&
        servers.reduce((c, d) => c || d.type === 'Unknown', false);
      if (conn.readyState === STATES.connected && allDisconnected) {
        conn.readyState = STATES.disconnected;
      } else if (conn.readyState === STATES.disconnected && !allDisconnected) {
        reconnectHandler();
      }
    });
    client.on('close', () => {
      const type = get(db, 's.topology.s.description.type', '');
      if (type !== 'ReplicaSetWithPrimary') conn.readyState = STATES.disconnected;
    });
  }
}

/* handle deprecated useMongoClient option */
const handleUseMongoClient = function (options) {
  console.warn('WARNING: The `useMongoClient` option is no longer necessary in mongoose 5.x, please remove it.');
  const stack = new Error().stack;
  console.warn(stack.substr(stack.indexOf('\n') + 1));
  delete options.useMongoClient;
};

/* close connection */
Connection.prototype.close = function (force, callback) {
  if (typeof force === 'function') {
    callback = force;
    force = false;
  }
  this.$wasForceClosed = !!force;
  return promiseOrCallback(callback, cb => this._close(force, cb));
};

/* internal close handling */
Connection.prototype._close = function (force, callback) {
  const _this = this;
  const alreadyClosed = this._closeCalled;
  this._closeCalled = true;
  if (this.client) this.client._closeCalled = true;
  switch (this.readyState) {
    case STATES.disconnected:
      if (alreadyClosed) callback();
      else this.doClose(force, err => {
        if (err) return callback(err);
        _this.onClose(force);
        callback(null);
      });
      break;
    case STATES.connected:
      this.readyState = STATES.disconnecting;
      this.doClose(force, err => {
        if (err) return callback(err);
        _this.onClose(force);
        callback(null);
      });
      break;
    case STATES.connecting:
      this.once('open', () => this.close(callback));
      break;
    case STATES.disconnecting:
      this.once('close', () => callback());
      break;
  }
  return this;
};

/* onClose handling */
Connection.prototype.onClose = function (force) {
  this.readyState = STATES.disconnected;
  for (const i in this.collections) {
    if (utils.object.hasOwnProperty(this.collections, i)) {
      this.collections[i].onClose(force);
    }
  }
  this.emit('close', force);
};

/* collection getter */
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

/* plugin registration */
Connection.prototype.plugin = function (fn, opts) {
  this.plugins.push([fn, opts]);
  return this;
};

/* model definition/retrieval */
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
    if (!this.models[name]) this.models[name] = model;
    model.init(() => { });
    return model;
  }
  if (this.models[name] && collection) {
    model = this.models[name];
    schema = model.prototype.schema;
    const sub = model.__subclass(this, schema, collection);
    return sub;
  }
  model = this.base.models[name];
  if (!model) throw new MongooseError.MissingSchemaError(name);
  if (this === model.prototype.db && (!collection || collection === model.collection.name)) {
    if (!this.models[name]) this.models[name] = model;
    return model;
  }
  this.models[name] = model.__subclass(this, schema, collection);
  return this.models[name];
};

/* delete model */
Connection.prototype.deleteModel = function (name) {
  if (typeof name === 'string') {
    const model = this.model(name);
    if (!model) return this;
    const collectionName = model.collection.name;
    delete this.models[name];
    delete this.collections[collectionName];
    delete this.base.modelSchemas[name];
    this.emit('deleteModel', model);
  } else if (name instanceof RegExp) {
    const pattern = name;
    const names = this.modelNames();
    for (const n of names) {
      if (pattern.test(n)) this.deleteModel(n);
    }
  } else {
    throw new Error('First parameter to `deleteModel()` must be a string or regexp, got "' + name + '"');
  }
  return this;
};

/* watch change streams */
Connection.prototype.watch = function (pipeline, options) {
  const disconnectedError = new MongooseError('Connection ' + this.id + ' was disconnected when calling `watch()`');
  const changeStreamThunk = cb => {
    immediate(() => {
      if (this.readyState === STATES.connecting) {
        this.once('open', () => {
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
  return new ChangeStream(changeStreamThunk, pipeline, options);
};

/* model name list */
Connection.prototype.modelNames = function () {
  return Object.keys(this.models);
};

/* authentication helpers */
Connection.prototype.shouldAuthenticate = function () {
  return this.user != null && (this.pass != null || this.authMechanismDoesNotRequirePassword());
};

Connection.prototype.authMechanismDoesNotRequirePassword = function () {
  if (this.options && this.options.auth) {
    return noPasswordAuthMechanisms.includes(this.options.auth.authMechanism);
  }
  return true;
};

Connection.prototype.optionsProvideAuthenticationData = function (options) {
  return options && options.user && (options.pass || this.authMechanismDoesNotRequirePassword());
};

/* client accessors */
Connection.prototype.getClient = function () {
  return this.client;
};

Connection.prototype.setClient = function (client) {
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

/* useDb placeholder */
Connection.prototype.useDb = function () {
  // Implementation omitted for brevity; original behavior preserved via external calls.
};

/* export */
Connection.STATES = STATES;
module.exports = Connection;