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

const noPasswordAuthMechanisms = [
  'MONGODB-X509'
];

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
  get: function() {
    return this._readyState;
  },
  set: function(val) {
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

Connection.prototype.get = function(key) {
  if (this.config.hasOwnProperty(key)) {
    return this.config[key];
  }

  return get(this.options, key);
};

Connection.prototype.set = function(key, val) {
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
    return session.withTransaction(() => fn(session), options).
      then(res => {
        delete session[sessionNewDocuments];
        return res;
      }).
      catch(err => {
        _resetSessionDocuments(session);
        delete session[sessionNewDocuments];
        throw err;
      });
  });
};

/**
 * Resets document state for aborted transactions
 * @param {ClientSession} session
 * @api private
 */
function _resetSessionDocuments(session) {
  for (const doc of session[sessionNewDocuments].keys()) {
    const state = session[sessionNewDocuments].get(doc);
    _restoreDocumentIsNew(doc, state);
    _restoreDocumentVersionKey(doc, state);
    _restoreDocumentActivePaths(doc, state);
    _restoreDocumentArrayAtomics(doc, state);
  }
}

/**
 * Restores isNew property if present in state
 * @param {Document} doc
 * @param {Object} state
 * @api private
 */
function _restoreDocumentIsNew(doc, state) {
  if (state.hasOwnProperty('isNew')) {
    doc.isNew = state.isNew;
  }
}

/**
 * Restores version key if present in state
 * @param {Document} doc
 * @param {Object} state
 * @api private
 */
function _restoreDocumentVersionKey(doc, state) {
  if (state.hasOwnProperty('versionKey')) {
    doc.set(doc.schema.options.versionKey, state.versionKey);
  }
}

/**
 * Restores active paths if present in state
 * @param {Document} doc
 * @param {Object} state
 * @api private
 */
function _restoreDocumentActivePaths(doc, state) {
  for (const path of state.modifiedPaths) {
    doc.$__.activePaths.paths[path] = 'modify';
    doc.$__.activePaths.states.modify[path] = true;
  }
}

/**
 * Restores array atomics if present in state
 * @param {Document} doc
 * @param {Object} state
 * @api private
 */
function _restoreDocumentArrayAtomics(doc, state) {
  for (const path of state.atomics.keys()) {
    const val = doc.$__getValue(path);
    if (val == null) {
      continue;
    }
    val[arrayAtomicsSymbol] = state.atomics.get(path);
  }
}

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
  return function() {
    const cb = arguments.length > 0 ? arguments[arguments.length - 1] : null;
    const argsWithoutCb = typeof cb === 'function' ?
      Array.prototype.slice.call(arguments, 0, arguments.length - 1) :
      Array.prototype.slice.call(arguments);
    const disconnectedError = new MongooseError('Connection ' + this.id +
      ' was disconnected when calling `' + fn.name + '`');
    return promiseOrCallback(cb, cb => {
      immediate(() => {
        _executeConnHelper(this, fn, argsWithoutCb, cb, disconnectedError);
      });
    });
  };
}

/**
 * Executes connection helper with appropriate state handling
 * @param {Connection} conn
 * @param {Function} fn
 * @param {Array} args
 * @param {Function} cb
 * @param {Error} disconnectedError
 * @api private
 */
function _executeConnHelper(conn, fn, args, cb, disconnectedError) {
  if (_shouldQueueCommand(conn)) {
    conn._queue.push({ fn: fn, ctx: conn, args: args.concat([cb]) });
    return;
  }

  if (_isDisconnectedWithoutDb(conn)) {
    cb(disconnectedError);
    return;
  }

  try {
    fn.apply(conn, args.concat([cb]));
  } catch (err) {
    cb(err);
  }
}

/**
 * Determines if command should be queued
 * @param {Connection} conn
 * @return {Boolean}
 * @api private
 */
function _shouldQueueCommand(conn) {
  return conn.readyState === STATES.connecting && conn._shouldBufferCommands();
}

/**
 * Determines if connection is disconnected without db
 * @param {Connection} conn
 * @return {Boolean}
 * @api private
 */
function _isDisconnectedWithoutDb(conn) {
  return conn.readyState === STATES.disconnected && conn.db == null;
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

Connection.prototype.error = function(err, callback) {
  if (callback) {
    callback(err);
    return null;
  }
  if (this.listeners('error').length > 0) {
    this.emit('error', err);
  }
  return Promise.reject(err);
};

Connection.prototype.onOpen = function() {
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

Connection.prototype.openUri = function(uri, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = null;
  }

  _validateOpenUriArguments(uri, options, callback);

  if (_isAlreadyConnecting(this, uri)) {
    if (typeof callback === 'function') {
      this.$initialConnection = this.$initialConnection.then(
        () => callback(null, this),
        err => callback(err)
      );
    }
    return this;
  }

  this._connectionString = uri;
  this.readyState = STATES.connecting;
  this._closeCalled = false;

  const Promise = PromiseProvider.get();
  const _this = this;

  options = _processOpenUriOptions(this, options);

  this._connectionOptions = options;
  const dbName = options.dbName;
  if (dbName != null) {
    this.$dbName = dbName;
  }
  delete options.dbName;

  _setDefaultOpenUriOptions(options, this.base);

  const parsePromise = _createParsePromise(uri, options, this);
  const promise = _createMongoClientPromise(uri, options, _this);

  const serverSelectionError = new ServerSelectionError();
  this.$initialConnection = Promise.all([promise, parsePromise]).
    then(res => res[0]).
    catch(err => {
      this.readyState = STATES.disconnected;
      if (err != null && err.name === 'MongoServerSelectionError') {
        err = serverSelectionError.assimilateError(err);
      }

      if (this.listeners('error').length > 0) {
        immediate(() => this.emit('error', err));
      }
      throw err;
    });
  this.then = function(resolve, reject) {
    return this.$initialConnection.then(() => {
      if (typeof resolve === 'function') {
        return resolve(_this);
      }
    }, reject);
  };
  this.catch = function(reject) {
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

/**
 * Validates openUri arguments
 * @param {String} uri
 * @param {Object} options
 * @param {Function} callback
 * @api private
 */
function _validateOpenUriArguments(uri, options, callback) {
  if (['string', 'number'].indexOf(typeof options) !== -1) {
    throw new MongooseError('Mongoose 5.x no longer supports ' +
      '`mongoose.connect(host, dbname, port)` or ' +
      '`mongoose.createConnection(host, dbname, port)`. See ' +
      'http://mongoosejs.com/docs/connections.html for supported connection syntax');
  }

  if (typeof uri !== 'string') {
    throw new MongooseError('The `uri` parameter to `openUri()` must be a ' +
      `string, got "${typeof uri}". Make sure the first parameter to ` +
      '`mongoose.connect()` or `mongoose.createConnection()` is a string.');
  }

  if (callback != null && typeof callback !== 'function') {
    throw new MongooseError('3rd parameter to `mongoose.connect()` or ' +
      '`mongoose.createConnection()` must be a function, got "' +
      typeof callback + '"');
  }
}

/**
 * Checks if connection is already connecting with same URI
 * @param {Connection} conn
 * @param {String} uri
 * @return {Boolean}
 * @api private
 */
function _isAlreadyConnecting(conn, uri) {
  return (conn.readyState === STATES.connecting || conn.readyState === STATES.connected) &&
    conn._connectionString === uri;
}

/**
 * Processes openUri options
 * @param {Connection} conn
 * @param {Object} options
 * @return {Object}
 * @api private
 */
function _processOpenUriOptions(conn, options) {
  if (!options) {
    return {};
  }

  options = utils.clone(options);

  _processAutoIndexOption(conn, options);
  _processAutoCreateOption(conn, options);
  _processUseCreateIndexOption(conn, options);
  _processUseFindAndModifyOption(conn, options);
  _processAuthOptions(conn, options);
  _processBufferCommandsOption(conn, options);
  _processUseMongoClientOption(options);

  return options;
}

/**
 * Processes autoIndex option
 * @param {Connection} conn
 * @param {Object} options
 * @api private
 */
function _processAutoIndexOption(conn, options) {
  const autoIndex = options.config && options.config.autoIndex != null ?
    options.config.autoIndex :
    options.autoIndex;
  if (autoIndex != null) {
    conn.config.autoIndex = autoIndex !== false;
    delete options.config;
    delete options.autoIndex;
  }
}

/**
 * Processes autoCreate option
 * @param {Connection} conn
 * @param {Object} options
 * @api private
 */
function _processAutoCreateOption(conn, options) {
  if ('autoCreate' in options) {
    conn.config.autoCreate = !!options.autoCreate;
    delete options.autoCreate;
  }
}

/**
 * Processes useCreateIndex option
 * @param {Connection} conn
 * @param {Object} options
 * @api private
 */
function _processUseCreateIndexOption(conn, options) {
  if ('useCreateIndex' in options) {
    conn.config.useCreateIndex = !!options.useCreateIndex;
    delete options.useCreateIndex;
  }
}

/**
 * Processes useFindAndModify option
 * @param {Connection} conn
 * @param {Object} options
 * @api private
 */
function _processUseFindAndModifyOption(conn, options) {
  if ('useFindAndModify' in options) {
    conn.config.useFindAndModify = !!options.useFindAndModify;
    delete options.useFindAndModify;
  }
}

/**
 * Processes auth options
 * @param {Connection} conn
 * @param {Object} options
 * @api private
 */
function _processAuthOptions(conn, options) {
  if (options.user || options.pass) {
    options.auth = options.auth || {};
    options.auth.user = options.user;
    options.auth.password = options.pass;

    conn.user = options.user;
    conn.pass = options.pass;
  }
  delete options.user;
  delete options.pass;
}

/**
 * Processes bufferCommands option
 * @param {Connection} conn
 * @param {Object} options
 * @api private
 */
function _processBufferCommandsOption(conn, options) {
  if (options.bufferCommands != null) {
    if (options.bufferMaxEntries == null) {
      options.bufferMaxEntries = 0;
    }
    conn.config.bufferCommands = options.bufferCommands;
    delete options.bufferCommands;
  }
}

/**
 * Processes useMongoClient option
 * @param {Object} options
 * @api private
 */
function _processUseMongoClientOption(options) {
  if (options.useMongoClient != null) {
    handleUseMongoClient(options);
  }
}

/**
 * Sets default openUri options
 * @param {Object} options
 * @param {Mongoose} base
 * @api private
 */
function _setDefaultOpenUriOptions(options, base) {
  if (!('promiseLibrary' in options)) {
    options.promiseLibrary = PromiseProvider.get();
  }
  _setDefaultUrlParserOption(options, base);
  _setDefaultUnifiedTopologyOption(options, base);
  _setDefaultDriverInfoOption(options);
}

/**
 * Sets default useNewUrlParser option
 * @param {Object} options
 * @param {Mongoose} base
 * @api private
 */
function _setDefaultUrlParserOption(options, base) {
  if (!('useNewUrlParser' in options)) {
    if ('useNewUrlParser' in base.options) {
      options.useNewUrlParser = base.options.useNewUrlParser;
    } else {
      options.useNewUrlParser = false;
    }
  }
}

/**
 * Sets default useUnifiedTopology option
 * @param {Object} options
 * @param {Mongoose} base
 * @api private
 */
function _setDefaultUnifiedTopologyOption(options, base) {
  if (!utils.hasUserDefinedProperty(options, 'useUnifiedTopology')) {
    if (utils.hasUserDefinedProperty(base.options, 'useUnifiedTopology')) {
      options.useUnifiedTopology = base.options.useUnifiedTopology;
    } else {
      options.useUnifiedTopology = false;
    }
  }
}

/**
 * Sets default driverInfo option
 * @param {Object} options
 * @api private
 */
function _setDefaultDriverInfoOption(options) {
  if (!utils.hasUserDefinedProperty(options, 'driverInfo')) {
    options.driverInfo = {
      name: 'Mongoose',
      version: pkg.version
    };
  }
}

/**
 * Creates parse promise for connection string
 * @param {String} uri
 * @param {Object} options
 * @param {Connection} conn
 * @return {Promise}
 * @api private
 */
function _createParsePromise(uri, options, conn) {
  const Promise = PromiseProvider.get();
  return new Promise((resolve, reject) => {
    parseConnectionString(uri, options, (err, parsed) => {
      if (err) {
        return reject(err);
      }
      _setConnectionNameFromParsed(conn, parsed, options.dbName);
      _setConnectionHostPortFromParsed(conn, parsed);
      _setConnectionAuthFromParsed(conn, parsed);
      resolve();
    });
  });
}

/**
 * Sets connection name from parsed connection string
 * @param {Connection} conn
 * @param {Object} parsed
 * @param {String} dbName
 * @api private
 */
function _setConnectionNameFromParsed(conn, parsed, dbName) {
  if (dbName) {
    conn.name = dbName;
  } else if (parsed.defaultDatabase) {
    conn.name = parsed.defaultDatabase;
  } else {
    conn.name = get(parsed, 'auth.db', null);
  }
}

/**
 * Sets connection host and port from parsed connection string
 * @param {Connection} conn
 * @param {Object} parsed
 * @api private
 */
function _setConnectionHostPortFromParsed(conn, parsed) {
  conn.host = get(parsed, 'hosts.0.host', 'localhost');
  conn.port = get(parsed, 'hosts.0.port', 27017);
}

/**
 * Sets connection auth from parsed connection string
 * @param {Connection} conn
 * @param {Object} parsed
 * @api private
 */
function _setConnectionAuthFromParsed(conn, parsed) {
  conn.user = conn.user || get(parsed, 'auth.username');
  conn.pass = conn.pass || get(parsed, 'auth.password');
}

/**
 * Creates MongoClient promise
 * @param {String} uri
 * @param {Object} options
 * @param {Connection} conn
 * @return {Promise}
 * @api private
 */
function _createMongoClientPromise(uri, options, conn) {
  const Promise = PromiseProvider.get();
  return new Promise((resolve, reject) => {
    const client = new mongodb.MongoClient(uri, options);
    conn.client = client;
    client.setMaxListeners(0);
    client.connect((error) => {
      if (error) {
        return reject(error);
      }

      _setClient(conn, client, options, options.dbName);

      resolve(conn);
    });
  });
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
    _setupUnifiedTopologyHandlers(conn, client, db, type, _handleReconnect);
  }

  _setupBackwardsCompatHandlers(conn, db, options, type, _handleReconnect);

  delete conn.then;
  delete conn.catch;

  conn.onOpen();
}

/**
 * Sets up unified topology event handlers
 * @param {Connection} conn
 * @param {MongoClient} client
 * @param {Db} db
 * @param {String} type
 * @param {Function} handleReconnect
 * @api private
 */
function _setupUnifiedTopologyHandlers(conn, client, db, type, handleReconnect) {
  if (type === 'Single') {
    _setupSingleTopologyHandlers(conn, db, handleReconnect);
  } else if (type.startsWith('ReplicaSet')) {
    _setupReplicaSetTopologyHandlers(conn, client, db, handleReconnect);
  }
}

/**
 * Sets up single topology handlers
 * @param {Connection} conn
 * @param {Db} db
 * @param {Function} handleReconnect
 * @api private
 */
function _setupSingleTopologyHandlers(conn, db, handleReconnect) {
  const server = Array.from(db.s.topology.s.servers.values())[0];
  server.s.topology.on('serverHeartbeatSucceeded', () => {
    handleReconnect();
  });
  server.s.pool.on('reconnect', () => {
    handleReconnect();
  });
  const client = db.s.topology.s.client;
  client.on('serverDescriptionChanged', ev => {
    const newDescription = ev.newDescription;
    if (newDescription.type === 'Standalone') {
      handleReconnect();
    } else {
      conn.readyState = STATES.disconnected;
    }
  });
}

/**
 * Sets up replica set topology handlers
 * @param {Connection} conn
 * @param {MongoClient} client
 * @param {Db} db
 * @param {Function} handleReconnect
 * @api private
 */
function _setupReplicaSetTopologyHandlers(conn, client, db, handleReconnect) {
  client.on('topologyDescriptionChanged', ev => {
    _handleTopologyDescriptionChanged(conn, ev, handleReconnect);
  });

  client.on('close', function() {
    const type = get(db, 's.topology.s.description.type', '');
    if (type !== 'ReplicaSetWithPrimary') {
      conn.readyState = STATES.disconnected;
    }
  });
}

/**
 * Handles topology description changed event
 * @param {Connection} conn
 * @param {Object} ev
 * @param {Function} handleReconnect
 * @api private
 */
function _handleTopologyDescriptionChanged(conn, ev, handleReconnect) {
  const description = ev.newDescription;
  const servers = Array.from(ev.newDescription.servers.values());
  const allServersDisconnected = description.type === 'ReplicaSetNoPrimary' &&
    servers.reduce((cur, d) => cur || d.type === 'Unknown', false);
  
  if (conn.readyState === STATES.connected && allServersDisconnected) {
    conn.readyState = STATES.disconnected;
  } else if (conn.readyState === STATES.disconnected && !allServersDisconnected) {
    handleReconnect();
  }
}

/**
 * Sets up backwards compatibility event handlers
 * @param {Connection} conn
 * @param {Db} db
 * @param {Object} options
 * @param {String} type
 * @param {Function} handleReconnect
 * @api private
 */
function _setupBackwardsCompatHandlers(conn, db, options, type, handleReconnect) {
  db.s.topology.on('reconnectFailed', function() {
    conn.emit('reconnectFailed');
  });

  if (!options.useUnifiedTopology) {
    client.on('reconnect', function() {
      handleReconnect();
    });

    db.s.topology.on('left', function(data) {
      conn.emit('left', data);
    });
  }
  
  db.s.topology.on('joined', function(data) {
    conn.emit('joined', data);
  });
  db.s.topology.on('fullsetup', function(data) {
    conn.emit('fullsetup', data);
  });
  
  if (get(db, 's.topology.s.coreTopology.s.pool') != null) {
    db.s.topology.s.coreTopology.s.pool.on('attemptReconnect', function() {
      conn.emit('attemptReconnect');
    });
  }
  
  _setupCloseHandlers(conn, db, options, type);
  _setupLeftHandlers(conn, db, options);
}

/**
 * Sets up close event handlers
 * @param {Connection} conn
 * @param {Db} db
 * @param {Object} options
 * @param {String} type
 * @api private
 */
function _setupCloseHandlers(conn, db, options, type) {
  const client = db.s.topology.s.client;
  
  if (!options.useUnifiedTopology) {
    client.on('close', function() {
      conn.readyState = STATES.disconnected;
    });
  } else if (!type.startsWith('ReplicaSet')) {
    client.on('close', function() {
      conn.readyState = STATES.disconnected;
    });
  }
}

/**
 * Sets up left event handlers
 * @param {Connection} conn
 * @param {Db} db
 * @param {Object} options
 * @api private
 */
function _setupLeftHandlers(conn, db, options) {
  if (!options.useUnifiedTopology) {
    const client = db.s.topology.s.client;
    client.on('left', function() {
      if (conn.readyState === STATES.connected &&
          get(db, 's.topology.s.coreTopology.s.replicaSetState.topologyType') === 'ReplicaSetNoPrimary') {
        conn.readyState = STATES.disconnected;
      }
    });

    client.on('timeout', function() {
      conn.emit('timeout');
    });
  }
}

const handleUseMongoClient = function handleUseMongoClient(options) {
  console.warn('WARNING: The `useMongoClient` option is no longer ' +
    'necessary in mongoose 5.x, please remove it.');
  const stack = new Error().stack;
  console.warn(stack.substr(stack.indexOf('\n') + 1));
  delete options.useMongoClient;
};

Connection.prototype.close = function(force, callback) {
  if (typeof force === 'function') {
    callback = force;
    force = false;
  }

  this.$wasForceClosed = !!force;

  return promiseOrCallback(callback, cb => {
    this._close(force, cb);
  });
};

Connection.prototype._close = function(force, callback) {
  const _this = this;
  const closeCalled = this._closeCalled;
  this._closeCalled = true;
  if (this.client != null) {
    this.client._closeCalled = true;
  }

  switch (this.readyState) {
    case STATES.disconnected:
      _handleCloseDisconnected(this, closeCalled, force, callback);
      break;

    case STATES.connected:
      this.readyState = STATES.disconnecting;
      this.doClose(force, function(err) {
        if (err) {
          return callback(err);
        }
        _this.onClose(force);
        callback(null);
      });
      break;

    case STATES.connecting:
      this.once('open', function() {
        _this.close(callback);
      });
      break;

    case STATES.disconnecting:
      this.once('close', function() {
        callback();
      });
      break;
  }

  return this;
};

/**
 * Handles close when disconnected
 * @param {Connection} conn
 * @param {Boolean} closeCalled
 * @param {Boolean} force
 * @param {Function} callback
 * @api private
 */
function _handleCloseDisconnected(conn, closeCalled, force, callback) {
  if (closeCalled) {
    callback();
  } else {
    conn.doClose(force, function(err) {
      if (err) {
        return callback(err);
      }
      conn.onClose(force);
      callback(null);
    });
  }
}

Connection.prototype.onClose = function(force) {
  this.readyState = STATES.disconnected;

  for (const i in this.collections) {
    if (utils.object.hasOwnProperty(this.collections, i)) {
      this.collections[i].onClose(force);
    }
  }

  this.emit('close', force);
};

Connection.prototype.collection = function(name, options) {
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

Connection.prototype.plugin = function(fn, opts) {
  this.plugins.push([fn, opts]);
  return this;
};

Connection.prototype.model = function(name, schema, collection, options) {
  if (!(this instanceof Connection)) {
    throw new MongooseError('`connection.model()` should not be run with ' +
      '`new`. If you are doing `new db.model(foo)(bar)`, use ' +
      '`db.model(foo)(bar)` instead');
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
    throw new Error('The 2nd parameter to `mongoose.model()` should be a ' +
      'schema or a POJO');
  }

  const defaultOptions = { cache: false, overwriteModels: this.base.options.overwriteModels };
  const opts = Object.assign(defaultOptions, options, { connection: this });
  
  if (_modelExistsWithoutOverwrite(this, name, collection, opts, schema)) {
    return this.models[name];
  }

  if (schema && schema.instanceOfSchema) {
    return _createNewModel(this, fn, name, schema, collection, opts);
  }

  if (this.models[name] && collection) {
    return _createSubclassModel(this, name, collection);
  }

  return _lookupAndCacheModel(this, name, schema, collection);
};

/**
 * Checks if model exists without overwrite
 * @param {Connection} conn
 * @param {String} name
 * @param {String} collection
 * @param {Object} opts
 * @param {Schema} schema
 * @return {Boolean}
 * @api private
 */
function _modelExistsWithoutOverwrite(conn, name, collection, opts, schema) {
  if (!conn.models[name] || collection || opts.overwriteModels === true) {
    return false;
  }

  if (schema && schema.instanceOfSchema && schema !== conn.models[name].schema) {
    throw new MongooseError.OverwriteModelError(name);
  }

  return true;
}

/**
 * Creates a new model
 * @param {Connection} conn
 * @param {Function} fn
 * @param {String} name
 * @param {Schema} schema
 * @param {String} collection
 * @param {Object} opts
 * @return {Model}
 * @api private
 */
function _createNewModel(conn, fn, name, schema, collection, opts) {
  applyPlugins(schema, conn.plugins, null, '$connectionPluginsApplied');

  const model = conn.base.model(fn || name, schema, collection, opts);

  if (!conn.models[name]) {
    conn.models[name] = model;
  }

  model.init(function $modelInitNoop() {});

  return model;
}

/**
 * Creates a subclass model
 * @param {Connection} conn
 * @param {String} name
 * @param {String} collection
 * @return {Model}
 * @api private
 */
function _createSubclassModel(conn, name, collection) {
  const model = conn.models[name];
  const schema = model.prototype.schema;
  const sub = model.__subclass(conn, schema, collection);
  return sub;
}

/**
 * Looks up and caches model
 * @param {Connection} conn
 * @param {String} name
 * @param {Schema} schema
 * @param {String} collection
 * @return {Model}
 * @api private
 */
function _lookupAndCacheModel(conn, name, schema, collection) {
  const model = conn.base.models[name];

  if (!model) {
    throw new MongooseError.MissingSchemaError(name);
  }

  if (_modelUsesThisConnection(conn, model, collection)) {
    if (!conn.models[name]) {
      conn.models[name] = model;
    }
    return model;
  }

  conn.models[name] = model.__subclass(conn, schema, collection);
  return conn.models[name];
}

/**
 * Checks if model uses this connection
 * @param {Connection} conn
 * @param {Model} model
 * @param {String} collection
 * @return {Boolean}
 * @api private
 */
function _modelUsesThisConnection(conn, model, collection) {
  return conn === model.prototype.db &&
    (!collection || collection === model.collection.name);
}

Connection.prototype.deleteModel = function(name) {
  if (typeof name === 'string') {
    _deleteModelByName(this, name);
  } else if (name instanceof RegExp) {
    _deleteModelsByPattern(this, name);
  } else {
    throw new Error('First parameter to `deleteModel()` must be a string ' +
      'or regexp, got "' + name + '"');
  }

  return this;
};

/**
 * Deletes model by name
 * @param {Connection} conn
 * @param {String} name
 * @api private
 */
function _deleteModelByName(conn, name) {
  const model = conn.model(name);
  if (model == null) {
    return;
  }
  const collectionName = model.collection.name;
  delete conn.models[name];
  delete conn.collections[collectionName];
  delete conn.base.modelSchemas[name];

  conn.emit('deleteModel', model);
}

/**
 * Deletes models matching pattern
 * @param {Connection} conn
 * @param {RegExp} pattern
 * @api private
 */
function _deleteModelsByPattern(conn, pattern) {
  const names = conn.modelNames();
  for (const name of names) {
    if (pattern.test(name)) {
      conn.deleteModel(name);
    }
  }
}

Connection.prototype.watch = function(pipeline, options) {
  const disconnectedError = new MongooseError('Connection ' + this.id +
    ' was disconnected when calling `watch()`');

  const changeStreamThunk = cb => {
    immediate(() => {
      _handleWatchState(this, pipeline, options, cb, disconnectedError);
    });
  };

  const changeStream = new ChangeStream(changeStreamThunk, pipeline, options);
  return changeStream;
};

/**
 * Handles watch state and creates driver change stream
 * @param {Connection} conn
 * @param {Array} pipeline
 * @param {Object} options
 * @param {Function} cb
 * @param {Error} disconnectedError
 * @api private
 */
function _handleWatchState(conn, pipeline, options, cb, disconnectedError) {
  if (conn.readyState === STATES.connecting) {
    conn.once('open', function() {
      const driverChangeStream = this.db.watch(pipeline, options);
      cb(null, driverChangeStream);
    });
  } else if (conn.readyState === STATES.disconnected && conn.db == null) {
    cb(disconnectedError);
  } else {
    const driverChangeStream = conn.db.watch(pipeline, options);
    cb(null, driverChangeStream);
  }
}

Connection.prototype.modelNames = function() {
  return Object.keys(this.models);
};

Connection.prototype.shouldAuthenticate = function() {
  return this.user != null &&
    (this.pass != null || this.authMechanismDoesNotRequirePassword());
};

Connection.prototype.authMechanismDoesNotRequirePassword = function() {
  if (this.options && this.options.auth) {
    return noPasswordAuthMechanisms.indexOf(this.options.auth.authMechanism) >= 0;
  }
  return true;
};

Connection.prototype.optionsProvideAuthenticationData = function(options) {
  return (options) &&
      (options.user) &&
      ((options.pass) || this.authMechanismDoesNotRequirePassword());
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