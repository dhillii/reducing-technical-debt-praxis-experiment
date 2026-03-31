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
const arrayAtomicsSymbol = require('./helpers/symbols').arrayAtomicsSymbol;
const sessionNewDocuments = require('./helpers/symbols').sessionNewDocuments;

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
      this.otherDbs.forEach(db => { db.readyState = val; });

      if (STATES.connected === val) {
        this._hasOpened = true;
      }

      this.emit(STATES[val]);
    }
  }
});

Connection.prototype.get = function(key) {
  return this.config.hasOwnProperty(key) ? this.config[key] : get(this.options, key);
};

Connection.prototype.set = function(key, val) {
  if (this.config.hasOwnProperty(key)) {
    this.config[key] = val;
  } else {
    this.options = this.options || {};
    this.options[key] = val;
  }
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
    return session.withTransaction(() => fn(session), options)
      .then(res => {
        delete session[sessionNewDocuments];
        return res;
      })
      .catch(err => {
        _resetTransactionDocuments(session);
        delete session[sessionNewDocuments];
        throw err;
      });
  });
};

function _resetTransactionDocuments(session) {
  for (const doc of session[sessionNewDocuments].keys()) {
    const state = session[sessionNewDocuments].get(doc);
    if (state.hasOwnProperty('isNew')) {
      doc.isNew = state.isNew;
    }
    if (state.hasOwnProperty('versionKey')) {
      doc.set(doc.schema.options.versionKey, state.versionKey);
    }

    state.modifiedPaths.forEach(path => {
      doc.$__.activePaths.paths[path] = 'modify';
      doc.$__.activePaths.states.modify[path] = true;
    });

    state.atomics.forEach((val, path) => {
      const docVal = doc.$__getValue(path);
      if (docVal != null) {
        docVal[arrayAtomicsSymbol] = val;
      }
    });
  }
}

Connection.prototype.dropCollection = _wrapConnHelper(function dropCollection(collection, cb) {
  this.db.dropCollection(collection, cb);
});

Connection.prototype.dropDatabase = _wrapConnHelper(function dropDatabase(cb) {
  Object.keys(this.models).forEach(name => {
    delete this.models[name].$init;
  });
  this.db.dropDatabase(cb);
});

function _wrapConnHelper(fn) {
  return function() {
    const cb = arguments.length > 0 ? arguments[arguments.length - 1] : null;
    const argsWithoutCb = typeof cb === 'function' ?
      Array.prototype.slice.call(arguments, 0, arguments.length - 1) :
      Array.prototype.slice.call(arguments);
    const disconnectedError = new MongooseError(`Connection ${this.id} was disconnected when calling \`${fn.name}\``);
    
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

  this._queue.forEach(d => {
    d.fn.apply(d.ctx, d.args);
  });
  this._queue = [];

  Object.keys(this.collections).forEach(i => {
    if (utils.object.hasOwnProperty(this.collections, i)) {
      this.collections[i].onOpen();
    }
  });

  this.emit('open');
};

Connection.prototype.openUri = function(uri, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = null;
  }

  _validateOpenUriParams(uri, options, callback);

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
    return this;
  }

  this._connectionString = uri;
  this.readyState = STATES.connecting;
  this._closeCalled = false;

  const Promise = PromiseProvider.get();
  const _this = this;

  _processOpenUriOptions(this, options);

  const dbName = this._connectionOptions.dbName;
  delete this._connectionOptions.dbName;

  _setDefaultOpenUriOptions(this._connectionOptions);

  const parsePromise = _parseConnectionString(uri, this._connectionOptions, dbName);
  const connectPromise = _connectToMongoDB(uri, this._connectionOptions, _this);

  const serverSelectionError = new ServerSelectionError();
  this.$initialConnection = Promise.all([connectPromise, parsePromise])
    .then(res => res[0])
    .catch(err => {
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

function _validateOpenUriParams(uri, options, callback) {
  if (['string', 'number'].indexOf(typeof options) !== -1) {
    throw new MongooseError('Mongoose 5.x no longer supports `mongoose.connect(host, dbname, port)` or `mongoose.createConnection(host, dbname, port)`. See http://mongoosejs.com/docs/connections.html for supported connection syntax');
  }

  if (typeof uri !== 'string') {
    throw new MongooseError(`The \`uri\` parameter to \`openUri()\` must be a string, got "${typeof uri}". Make sure the first parameter to \`mongoose.connect()\` or \`mongoose.createConnection()\` is a string.`);
  }

  if (callback != null && typeof callback !== 'function') {
    throw new MongooseError(`3rd parameter to \`mongoose.connect()\` or \`mongoose.createConnection()\` must be a function, got "${typeof callback}"`);
  }
}

function _processOpenUriOptions(conn, options) {
  if (!options) {
    conn._connectionOptions = {};
    return;
  }

  options = utils.clone(options);
  const configOptions = ['autoIndex', 'autoCreate', 'useCreateIndex', 'useFindAndModify'];
  
  configOptions.forEach(opt => {
    const configKey = opt === 'autoIndex' && options.config ? options.config.autoIndex : options[opt];
    if (configKey != null) {
      conn.config[opt] = opt === 'autoIndex' ? configKey !== false : !!configKey;
      delete options[opt];
    }
  });

  if (options.config) {
    delete options.config;
  }

  if (options.user || options.pass) {
    options.auth = options.auth || {};
    options.auth.user = options.user;
    options.auth.password = options.pass;
    conn.user = options.user;
    conn.pass = options.pass;
    delete options.user;
    delete options.pass;
  }

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

  conn._connectionOptions = options;
  if (options.dbName != null) {
    conn.$dbName = options.dbName;
  }
}

function _setDefaultOpenUriOptions(options) {
  if (!('promiseLibrary' in options)) {
    options.promiseLibrary = PromiseProvider.get();
  }
  if (!('useNewUrlParser' in options)) {
    options.useNewUrlParser = false;
  }
  if (!utils.hasUserDefinedProperty(options, 'useUnifiedTopology')) {
    options.useUnifiedTopology = false;
  }
  if (!utils.hasUserDefinedProperty(options, 'driverInfo')) {
    options.driverInfo = {
      name: 'Mongoose',
      version: pkg.version
    };
  }
}

function _parseConnectionString(uri, options, dbName) {
  const Promise = PromiseProvider.get();
  return new Promise((resolve, reject) => {
    parseConnectionString(uri, options, (err, parsed) => {
      if (err) {
        return reject(err);
      }
      resolve({ parsed, dbName });
    });
  });
}

function _connectToMongoDB(uri, options, conn) {
  const Promise = PromiseProvider.get();
  return new Promise((resolve, reject) => {
    const client = new mongodb.MongoClient(uri, options);
    conn.client = client;
    client.setMaxListeners(0);
    client.connect((error) => {
      if (error) {
        return reject(error);
      }
      resolve(conn);
    });
  });
}

function _setClient(conn, client, options, dbName) {
  const db = dbName != null ? client.db(dbName) : client.db();
  conn.db = db;
  conn.client = client;
  conn._closeCalled = client._closeCalled;

  _setupConnectionEventHandlers(conn, client, db, options);

  delete conn.then;
  delete conn.catch;

  conn.onOpen();
}

function _setupConnectionEventHandlers(conn, client, db, options) {
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

  _setupLegacyTopologyHandlers(conn, client, db, options, _handleReconnect);
}

function _setupUnifiedTopologyHandlers(conn, client, db, type, handleReconnect) {
  if (type === 'Single') {
    const server = Array.from(db.s.topology.s.servers.values())[0];
    server.s.