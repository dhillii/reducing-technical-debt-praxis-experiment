```javascript
'use strict';

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
const { arrayAtomicsSymbol, sessionNewDocuments } = require('./helpers/symbols');

const NO_PASSWORD_AUTH_MECHANISMS = ['MONGODB-X509'];

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
  this.id = base && base.connections.length ? base.connections.length : 0;
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

['host', 'port', 'user', 'pass'].forEach(prop => {
  Object.defineProperty(Connection.prototype, prop, {
    configurable: true,
    enumerable: true,
    writable: true
  });
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
        _restoreSessionDocuments(session);
        delete session[sessionNewDocuments];
        throw err;
      });
  });
};

function _restoreSessionDocuments(session) {
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

  if (this.readyState === STATES.connecting || this.readyState === STATES.connected) {
    if (this._connectionString !== uri) {
      throw new MongooseError('Can\'t call `openUri()` on an active connection with ' +
        'different connection strings. Make sure you aren\'t calling `mongoose.connect()` ' +
        'multiple times. See: https://mongoosejs.com/docs/connections.html#multiple_connections');
    }

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

  _applyDefaultOptions(options, this.base);

  const parsePromise = new Promise((resolve, reject) => {
    parseConnectionString(uri, options, (err, parsed) => {
      if (err) {
        return reject(err);
      }
      _setConnectionMetadata(_this, parsed, dbName);
      resolve();
    });
  });

  const promise = new Promise((resolve, reject) => {
    const client = new mongodb.MongoClient(uri, options);
    _this.client = client;
    client.setMaxListeners(0);
    client.connect((error) => {
      if (error) {
        return reject(error);
      }

      _setClient(_this, client, options, dbName);
      resolve(_this);
    });
  });

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

function _processOpenUriOptions(conn, options) {
  if (!options) {
    return {};
  }

  options = utils.clone(options);

  const autoIndex = options.config && options.config.autoIndex != null ?
    options.config.autoIndex :
    options.autoIndex;
  if (autoIndex != null) {
    conn.config.autoIndex = autoIndex !== false;
    delete options.config;
    delete options.autoIndex;
  }

  if ('autoCreate' in options) {
    conn.config.autoCreate = !!options.autoCreate;
    delete options.autoCreate;
  }
  if ('useCreateIndex' in options) {
    conn.config.useCreateIndex = !!options.useCreateIndex;
    delete options.useCreateIndex;
  }
  if ('useFindAndModify' in options) {
    conn.config.useFindAndModify = !!options.useFindAndModify;
    delete options.useFindAndModify;
  }

  if (options.user || options.pass) {
    options.auth = options.auth || {};
    options.auth.user = options.user;
    options.auth.password = options.pass;
    conn.user = options.user;
    conn.pass = options.pass;
  }
  delete options.user;
  delete options.pass;

  if (options.bufferCommands != null) {
    if (options.bufferMaxEntries == null) {
      options.bufferMaxEntries = 0;
    }
    conn.config.bufferCommands = options.bufferCommands;
    delete options.bufferCommands;
  }

  if (options.useMongoClient != null) {
    _handleUseMongoClient(options);
  }

  return options;
}

function _applyDefaultOptions(options, base) {
  if (!('promiseLibrary' in options)) {
    options.promiseLibrary = PromiseProvider.get();
  }
  if (!('useNewUrlParser' in options)) {
    options.useNewUrlParser = base.options.useNewUrlParser || false;
  }
  if (!utils.hasUserDefinedProperty(options, 'useUnifiedTopology')) {
    options.useUnifiedTopology = utils.hasUserDefinedProperty(base.options, 'useUnifiedTopology') ?
      base.options.useUnifiedTopology : false;
  }
  if (!utils.hasUserDefinedProperty(options, 'driverInfo')) {
    options.driverInfo = {
      name: 'Mongoose',
      version: pkg.version
    };
  }
}

function _setConnectionMetadata(conn, parsed, dbName) {
  if (dbName) {
    conn.name = dbName;
  } else if (parsed.defaultDatabase) {
    conn.name = parsed.defaultDatabase;
  } else {
    conn.name = get(parsed, 'auth.db', null);
  }
  conn.host = get(parsed, 'hosts.0.host', 'localhost');
  conn.port = get(parsed, 'hosts.0.port', 27017);
  conn.user = conn.user || get(parsed, 'auth.username');
  conn.pass = conn.pass || get(parsed, 'auth.password');
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

  const type = get(db, 's.topology.s.description.type', '