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

/**
 * Connection ready state
 *
 * - 0 = disconnected
 * - 1 = connected
 * - 2 = connecting
 * - 3 = disconnecting
 *
 * Each state change emits its associated event name.
 *
 * ####Example
 *
 *     conn.on('connected', callback);
 *     conn.on('disconnected', callback);
 *
 * @property readyState
 * @memberOf Connection
 * @instance
 * @api public
 */

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
      // [legacy] loop over the otherDbs on this connection and change their state
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

/**
 * Gets the value of the option `key`. Equivalent to `conn.options[key]`
 *
 * ####Example:
 *
 *     conn.get('test'); // returns the 'test' value
 *
 * @param {String} key
 * @method get
 * @api public
 */

Connection.prototype.get = function(key) {
  if (this.config.hasOwnProperty(key)) {
    return this.config[key];
  }

  return get(this.options, key);
};

/**
 * Sets the value of the option `key`. Equivalent to `conn.options[key] = val`
 *
 * Supported options include:
 *
 * - `maxTimeMS`: Set [`maxTimeMS`](/docs/api.html#query_Query-maxTimeMS) for all queries on this connection.
 * - `useFindAndModify`: Set to `false` to work around the [`findAndModify()` deprecation warning](/docs/deprecations.html#findandmodify)
 *
 * ####Example:
 *
 *     conn.set('test', 'foo');
 *     conn.get('test'); // 'foo'
 *     conn.options.test; // 'foo'
 *
 * @param {String} key
 * @param {Any} val
 * @method set
 * @api public
 */

Connection.prototype.set = function(key, val) {
  if (this.config.hasOwnProperty(key)) {
    this.config[key] = val;
    return val;
  }

  this.options = this.options || {};
  this.options[key] = val;
  return val;
};

/**
 * A hash of the collections associated with this connection
 *
 * @property collections
 * @memberOf Connection
 * @instance
 * @api public
 */

Connection.prototype.collections;

/**
 * The name of the database this connection points to.
 *
 * ####Example
 *
 *     mongoose.createConnection('mongodb://localhost:27017/mydb').name; // "mydb"
 *
 * @property name
 * @memberOf Connection
 * @instance
 * @api public
 */

Connection.prototype.name;

/**
 * A [POJO](https://masteringjs.io/tutorials/fundamentals/pojo) containing
 * a map from model names to models. Contains all models that have been
 * added to this connection using [`Connection#model()`](/docs/api/connection.html#connection_Connection-model).
 *
 * ####Example
 *
 *     const conn = mongoose.createConnection();
 *     const Test = conn.model('Test', mongoose.Schema({ name: String }));
 *
 *     Object.keys(conn.models).length; // 1
 *     conn.models.Test === Test; // true
 *
 * @property models
 * @memberOf Connection
 * @instance
 * @api public
 */

Connection.prototype.models;

/**
 * A number identifier for this connection. Used for debugging when
 * you have [multiple connections](/docs/connections.html#multiple_connections).
 *
 * ####Example
 *
 *     // The default connection has `id = 0`
 *     mongoose.connection.id; // 0
 *
 *     // If you create a new connection, Mongoose increments id
 *     const conn = mongoose.createConnection();
 *     conn.id; // 1
 *
 * @property id
 * @memberOf Connection
 * @instance
 * @api public
 */

Connection.prototype.id;

/**
 * The plugins that will be applied to all models created on this connection.
 *
 * ####Example:
 *
 *     const db = mongoose.createConnection('mongodb://localhost:27017/mydb');
 *     db.plugin(() => console.log('Applied'));
 *     db.plugins.length; // 1
 *
 *     db.model('Test', new Schema({})); // Prints "Applied"
 *
 * @property plugins
 * @memberOf Connection
 * @instance
 * @api public
 */

Object.defineProperty(Connection.prototype, 'plugins', {
  configurable: false,
  enumerable: true,
  writable: true
});

/**
 * The host name portion of the URI. If multiple hosts, such as a replica set,
 * this will contain the first host name in the URI
 *
 * ####Example
 *
 *     mongoose.createConnection('mongodb://localhost:27017/mydb').host; // "localhost"
 *
 * @property host
 * @memberOf Connection
 * @instance
 * @api public
 */

Object.defineProperty(Connection.prototype, 'host', {
  configurable: true,
  enumerable: true,
  writable: true
});

/**
 * The port portion of the URI. If multiple hosts, such as a replica set,
 * this will contain the port from the first host name in the URI.
 *
 * ####Example
 *
 *     mongoose.createConnection('mongodb://localhost:27017/mydb').port; // 27017
 *
 * @property port
 * @memberOf Connection
 * @instance
 * @api public
 */

Object.defineProperty(Connection.prototype, 'port', {
  configurable: true,
  enumerable: true,
  writable: true
});

/**
 * The username specified in the URI
 *
 * ####Example
 *
 *     mongoose.createConnection('mongodb://val:psw@localhost:27017/mydb').user; // "val"
 *
 * @property user
 * @memberOf Connection
 * @instance
 * @api public
 */

Object.defineProperty(Connection.prototype, 'user', {
  configurable: true,
  enumerable: true,
  writable: true
});

/**
 * The password specified in the URI
 *
 * ####Example
 *
 *     mongoose.createConnection('mongodb://val:psw@localhost:27017/mydb').pass; // "psw"
 *
 * @property pass
 * @memberOf Connection
 * @instance
 * @api public
 */

Object.defineProperty(Connection.prototype, 'pass', {
  configurable: true,
  enumerable: true,
  writable: true
});

/**
 * The mongodb.Db instance, set when the connection is opened
 *
 * @property db
 * @memberOf Connection
 * @instance
 * @api public
 */

Connection.prototype.db;

/**
 * The MongoClient instance this connection uses to talk to MongoDB. Mongoose automatically sets this property
 * when the connection is opened.
 *
 * @property client
 * @memberOf Connection
 * @instance
 * @api public
 */

Connection.prototype.client;

/**
 * A hash of the global options that are associated with this connection
 *
 * @property config
 * @memberOf Connection
 * @instance
 * @api public
 */

Connection.prototype.config;

/**
 * Helper for `createCollection()`. Will explicitly create the given collection
 * with specified options. Used to create [capped collections](https://docs.mongodb.com/manual/core/capped-collections/)
 * and [views](https://docs.mongodb.com/manual/core/views/) from mongoose.
 *
 * Options are passed down without modification to the [MongoDB driver's `createCollection()` function](http://mongodb.github.io/node-mongodb-native/2.2/api/Db.html#createCollection)
 *
 * @method createCollection
 * @param {string} collection The collection to create
 * @param {Object} [options] see [MongoDB driver docs](http://mongodb.github.io/node-mongodb-native/2.2/api/Db.html#createCollection)
 * @param {Function} [callback]
 * @return {Promise}
 * @api public
 */

Connection.prototype.createCollection = function createCollection(collection, options, cb) {
  // Extracted into separate function to reduce complexity
  return _createCollection(this, collection, options, cb);
};

/**
 * _Requires MongoDB >= 3.6.0._ Starts a [MongoDB session](https://docs.mongodb.com/manual/release-notes/3.6/#client-sessions)
 * for benefits like causal consistency, [retryable writes](https://docs.mongodb.com/manual/core/retryable-writes/),
 * and [transactions](http://thecodebarbarian.com/a-node-js-perspective-on-mongodb-4-transactions.html).
 *
 * ####Example:
 *
 *     const session = await conn.startSession();
 *     let doc = await Person.findOne({ name: 'Ned Stark' }, null, { session });
 *     await doc.remove();
 *     // `doc` will always be null, even if reading from a replica set
 *     // secondary. Without causal consistency, it is possible to
 *     // get a doc back from the below query if the query reads from a
 *     // secondary that is experiencing replication lag.
 *     doc = await Person.findOne({ name: 'Ned Stark' }, null, { session, readPreference: 'secondary' });
 *
 *
 * @method startSession
 * @param {Object} [options] see the [mongodb driver options](http://mongodb.github.io/node-mongodb-native/3.0/api/MongoClient.html#startSession)
 * @param {Boolean} [options.causalConsistency=true] set to false to disable causal consistency
 * @param {Function} [callback]
 * @return {Promise<ClientSession>} promise that resolves to a MongoDB driver `ClientSession`
 * @api public
 */

Connection.prototype.startSession = function startSession(options, cb) {
  // Extracted into separate function to reduce complexity
  return _startSession(this, options, cb);
};

/**
 * _Requires MongoDB >= 3.6.0._ Executes the wrapped async function
 * in a transaction. Mongoose will commit the transaction if the
 * async function executes successfully and attempt to retry if
 * there was a retriable error.
 *
 * Calls the MongoDB driver's [`session.withTransaction()`](http://mongodb.github.io/node-mongodb-native/3.5/api/ClientSession.html#withTransaction),
 * but also handles resetting Mongoose document state as shown below.
 *
 * ####Example:
 *
 *     const doc = new Person({ name: 'Will Riker' });
 *     await db.transaction(async function setRank(session) {
 *       doc.rank = 'Captain';
 *       await doc.save({ session });
 *       doc.isNew; // false
 *
 *       // Throw an error to abort the transaction
 *       throw new Error('Oops!');
 *     },{ readPreference: 'primary' }).catch(() => {});
 *
 *     // true, `transaction()` reset the document's state because the
 *     // transaction was aborted.
 *     doc.isNew;
 *
 * @method transaction
 * @param {Function} fn Function to execute in a transaction
 * @param {mongodb.TransactionOptions} [options] Optional settings for the transaction
 * @return {Promise<Any>} promise that is fulfilled if Mongoose successfully committed the transaction, or rejects if the transaction was aborted or if Mongoose failed to commit the transaction. If fulfilled, the promise resolves to a MongoDB command result.
 * @api public
 */

Connection.prototype.transaction = function transaction(fn, options) {
  // Extracted into separate function to reduce complexity
  return _transaction(this, fn, options);
};

/**
 * Helper for `dropCollection()`. Will delete the given collection, including
 * all documents and indexes.
 *
 * @method dropCollection
 * @param {string} collection The collection to delete
 * @param {Function} [callback]
 * @return {Promise}
 * @api public
 */

Connection.prototype.dropCollection = function dropCollection(collection, cb) {
  // Extracted into separate function to reduce complexity
  return _dropCollection(this, collection, cb);
};

/**
 * Helper for `dropDatabase()`. Deletes the given database, including all
 * collections, documents, and indexes.
 *
 * ####Example:
 *
 *     const conn = mongoose.createConnection('mongodb://localhost:27017/mydb');
 *     // Deletes the entire 'mydb' database
 *     await conn.dropDatabase();
 *
 * @method dropDatabase
 * @param {Function} [callback]
 * @return {Promise}
 * @api public
 */

Connection.prototype.dropDatabase = function dropDatabase(cb) {
  // Extracted into separate function to reduce complexity
  return _dropDatabase(this, cb);
};

/**
 * Opens the connection with a URI using `MongoClient.connect()`.
 *
 * @param {String} uri The URI to connect with.
 * @param {Object} [options] Passed on to http://mongodb.github.io/node-mongodb-native/2.2/api/MongoClient.html#connect
 * @param {Boolean} [options.bufferCommands=true] Mongoose specific option. Set to false to [disable buffering](http://mongoosejs.com/docs/faq.html#callback_never_executes) on all models associated with this connection.
 * @param {Number} [options.bufferTimeoutMS=10000] Mongoose specific option. If `bufferCommands` is true, Mongoose will throw an error after `bufferTimeoutMS` if the operation is still buffered.
 * @param {String} [options.dbName] The name of the database we want to use. If not provided, use database name from connection string.
 * @param {String} [options.user] username for authentication, equivalent to `options.auth.user`. Maintained for backwards compatibility.
 * @param {String} [options.pass] password for authentication, equivalent to `options.auth.password`. Maintained for backwards compatibility.
 * @param {Number} [options.poolSize=5] The maximum number of sockets the MongoDB driver will keep open for this connection. By default, `poolSize` is 5. Keep in mind that, as of MongoDB 3.4, MongoDB only allows one operation per socket at a time, so you may want to increase this if you find you have a few slow queries that are blocking faster queries from proceeding. See [Slow Trains in MongoDB and Node.js](http://thecodebarbarian.com/slow-trains-in-mongodb-and-nodejs).
 * @param {Boolean} [options.useUnifiedTopology=false] False by default. Set to `true` to opt in to the MongoDB driver's replica set and sharded cluster monitoring engine.
 * @param {Number} [options.serverSelectionTimeoutMS] If `useUnifiedTopology = true`, the MongoDB driver will try to find a server to send any given operation to, and keep retrying for `serverSelectionTimeoutMS` milliseconds before erroring out. If not set, the MongoDB driver defaults to using `30000` (30 seconds).
 * @param {Number} [options.heartbeatFrequencyMS] If `useUnifiedTopology = true`, the MongoDB driver sends a heartbeat every `heartbeatFrequencyMS` to check on the status of the connection. A heartbeat is subject to `serverSelectionTimeoutMS`, so the MongoDB driver will retry failed heartbeats for up to 30 seconds by default. Mongoose only emits a `'disconnected'` event after a heartbeat has failed, so you may want to decrease this setting to reduce the time between when your server goes down and when Mongoose emits `'disconnected'`. We recommend you do **not** set this setting below 1000, too many heartbeats can lead to performance degradation.
 * @param {Boolean} [options.autoIndex=true] Mongoose-specific option. Set to false to disable automatic index creation for all models associated with this connection.
 * @param {Boolean} [options.useNewUrlParser=false] False by default. Set to `true` to opt in to the MongoDB driver's new URL parser logic.
 * @param {Boolean} [options.useCreateIndex=false] Mongoose-specific option. If `true`, this connection will use [`createIndex()` instead of `ensureIndex()`](/docs/deprecations.html#ensureindex) for automatic index builds via [`Model.init()`](/docs/api.html#model_Model.init).
 * @param {Boolean} [options.useFindAndModify=true] True by default. Set to `false` to make `findOneAndUpdate()` and `findOneAndRemove()` use native `findOneAndUpdate()` rather than `findAndModify()`.
 * @param {Number} [options.reconnectTries=30] If you're connected to a single server or mongos proxy (as opposed to a replica set), the MongoDB driver will try to reconnect every `reconnectInterval` milliseconds for `reconnectTries` times, and give up afterward. When the driver gives up, the mongoose connection emits a `reconnectFailed` event. This option does nothing for replica set connections.
 * @param {Number} [options.reconnectInterval=1000] See `reconnectTries` option above.
 * @param {Class} [options.promiseLibrary] Sets the [underlying driver's promise library](http://mongodb.github.io/node-mongodb-native/3.1/api/MongoClient.html).
 * @param {Number} [options.bufferMaxEntries] This option does nothing if `useUnifiedTopology` is set. The MongoDB driver also has its own buffering mechanism that kicks in when the driver is disconnected. Set this option to 0 and set `bufferCommands` to `false` on your schemas if you want your database operations to fail immediately when the driver is not connected, as opposed to waiting for reconnection.
 * @param {Number} [options.connectTimeoutMS=30000] How long the MongoDB driver will wait before killing a socket due to inactivity _during initial connection_. Defaults to 30000. This option is passed transparently to [Node.js' `socket#setTimeout()` function](https://nodejs.org/api/net.html#net_socket_settimeout_timeout_callback).
 * @param {Number} [options.socketTimeoutMS=30000] How long the MongoDB driver will wait before killing a socket due to inactivity _after initial connection_. A socket may be inactive because of either no activity or a long-running operation. This is set to `30000` by default, you should set this to 2-3x your longest running operation if you expect some of your database operations to run longer than 20 seconds. This option is passed to [Node.js `socket#setTimeout()` function](https://nodejs.org/api/net.html#net_socket_settimeout_timeout_callback) after the MongoDB driver successfully completes.
 * @param {Number} [options.family=0] Passed transparently to [Node.js' `dns.lookup()`](https://nodejs.org/api/dns.html#dns_dns_lookup_hostname_options_callback) function. May be either `0, `4`, or `6`. `4` means use IPv4 only, `6` means use IPv6 only, `0` means try both.
 * @param {Boolean} [options.autoCreate=false] Set to `true` to make Mongoose automatically call `createCollection()` on every model created on this connection.
 * @param {Function} [callback]
 * @returns {Connection} this
 * @api public
 */

Connection.prototype.openUri = function openUri(uri, options, callback) {
  // Extracted into separate function to reduce complexity
  return _openUri(this, uri, options, callback);
};

/**
 * Closes the connection
 *
 * @param {Boolean} [force] optional
 * @param {Function} [callback] optional
 * @return {Promise}
 * @api public
 */

Connection.prototype.close = function close(force, callback) {
  // Extracted into separate function to reduce complexity
  return _close(this, force, callback);
};

/**
 * error
 *
 * Graceful error handling, passes error to callback
 * if available, else emits error on the connection.
 *
 * @param {Error} err
 * @param {Function} callback optional
 * @api private
 */

Connection.prototype.error = function error(err, callback) {
  // Extracted into separate function to reduce complexity
  return _error(this, err, callback);
};

/**
 * Called when the connection is opened
 *
 * @api private
 */

Connection.prototype.onOpen = function onOpen() {
  // Extracted into separate function to reduce complexity
  return _onOpen(this);
};

/**
 * Called when the connection closes
 *
 * @api private
 */

Connection.prototype.onClose = function onClose(force) {
  // Extracted into separate function to reduce complexity
  return _onClose(this, force);
};

/**
 * Retrieves a collection, creating it if not cached.
 *
 * Not typically needed by applications. Just talk to your collection through your model.
 *
 * @param {String} name of the collection
 * @param {Object} [options] optional collection options
 * @return {Collection} collection instance
 * @api public
 */

Connection.prototype.collection = function collection(name, options) {
  // Extracted into separate function to reduce complexity
  return _collection(this, name, options);
};

/**
 * Declares a plugin executed on all schemas you pass to `conn.model()`
 *
 * Equivalent to calling `.plugin(fn)` on each schema you create.
 *
 * ####Example:
 *     const db = mongoose.createConnection('mongodb://localhost:27017/mydb');
 *     db.plugin(() => console.log('Applied'));
 *     db.plugins.length; // 1
 *
 *     db.model('Test', new Schema({})); // Prints "Applied"
 *
 * @param {Function} fn plugin callback
 * @param {Object} [opts] optional options
 * @return {Connection} this
 * @see plugins ./plugins.html
 * @api public
 */

Connection.prototype.plugin = function plugin(fn, opts) {
  // Extracted into separate function to reduce complexity
  return _plugin(this, fn, opts);
};

/**
 * Defines or retrieves a model.
 *
 *     const mongoose = require('mongoose');
 *     const db = mongoose.createConnection(..);
 *     db.model('Venue', new Schema(..));
 *     const Ticket = db.model('Ticket', new Schema(..));
 *     const Venue = db.model('Venue');
 *
 * _When no `collection` argument is passed, Mongoose produces a collection name by passing the model `name` to the [utils.toCollectionName](#utils_exports.toCollectionName) method. This method pluralizes the name. If you don't like this behavior, either pass a collection name or set your schemas collection name option._
 *
 * ####Example:
 *
 *     const schema = new Schema({ name: String }, { collection: 'actor' });
 *
 *     // or
 *
 *     schema.set('collection', 'actor');
 *
 *     // or
 *
 *     const collectionName = 'actor'
 *     const M = conn.model('Actor', schema, collectionName)
 *
 * @param {String|Function} name the model name or class extending Model
 * @param {Schema} [schema] a schema. necessary when defining a model
 * @param {String} [collection] name of mongodb collection (optional) if not given it will be induced from model name
 * @param {Object} [options]
 * @param {Boolean} [options.overwriteModels=false] If true, overwrite existing models with the same name to avoid `OverwriteModelError`
 * @see Mongoose#model #index_Mongoose-model
 * @return {Model} The compiled model
 * @api public
 */

Connection.prototype.model = function model(name, schema, collection, options) {
  // Extracted into separate function to reduce complexity
  return _model(this, name, schema, collection, options);
};

/**
 * Removes the model named `name` from this connection, if it exists. You can
 * use this function to clean up any models you created in your tests to
 * prevent OverwriteModelErrors.
 *
 * ####Example:
 *
 *     conn.model('User', new Schema({ name: String }));
 *     console.log(conn.model('User')); // Model object
 *     conn.deleteModel('User');
 *     console.log(conn.model('User')); // undefined
 *
 *     // Usually useful in a Mocha `afterEach()` hook
 *     afterEach(function() {
 *       conn.deleteModel(/.+/); // Delete every model
 *     });
 *
 * @api public
 * @param {String|RegExp} name if string, the name of the model to remove. If regexp, removes all models whose name matches the regexp.
 * @return {Connection} this
 */

Connection.prototype.deleteModel = function deleteModel(name) {
  // Extracted into separate function to reduce complexity
  return _deleteModel(this, name);
};

/**
 * Watches the entire underlying database for changes. Similar to
 * [`Model.watch()`](/docs/api/model.html#model_Model.watch).
 *
 * This function does **not** trigger any middleware. In particular, it
 * does **not** trigger aggregate middleware.
 *
 * The ChangeStream object is an event emitter that emits the following events:
 *
 * - 'change': A change occurred, see below example
 * - 'error': An unrecoverable error occurred. In particular, change streams currently error out if they lose connection to the replica set primary. Follow [this GitHub issue](https://github.com/Automattic/mongoose/issues/6799) for updates.
 * - 'end': Emitted if the underlying stream is closed
 * - 'close': Emitted if the underlying stream is closed
 *
 * ####Example:
 *
 *     const User = conn.model('User', new Schema({ name: String }));
 *
 *     const changeStream = conn.watch().on('change', data => console.log(data));
 *
 *     // Triggers a 'change' event on the change stream.
 *     await User.create({ name: 'test' });
 *
 * @api public
 * @param {Array} [pipeline]
 * @param {Object} [options] passed without changes to [the MongoDB driver's `Db#watch()` function](https://mongodb.github.io/node-mongodb-native/3.4/api/Db.html#watch)
 * @return {ChangeStream} mongoose-specific change stream wrapper, inherits from EventEmitter
 */

Connection.prototype.watch = function watch(pipeline, options) {
  // Extracted into separate function to reduce complexity
  return _watch(this, pipeline, options);
};

/**
 * Returns an array of model names created on this connection.
 * @api public
 * @return {Array}
 */

Connection.prototype.modelNames = function modelNames() {
  // Extracted into separate function to reduce complexity
  return _modelNames(this);
};

/**
 * @brief Returns if the connection requires authentication after it is opened. Generally if a
 * username and password are both provided than authentication is needed, but in some cases a
 * password is not required.
 * @api private
 * @return {Boolean} true if the connection should be authenticated after it is opened, otherwise false.
 */
Connection.prototype.shouldAuthenticate = function shouldAuthenticate() {
  // Extracted into separate function to reduce complexity
  return _shouldAuthenticate(this);
};

/**
 * @brief Returns a boolean value that specifies if the current authentication mechanism needs a
 * password to authenticate according to the auth objects passed into the openUri methods.
 * @api private
 * @return {Boolean} true if the authentication mechanism specified in the options object requires
 *  a password, otherwise false.
 */
Connection.prototype.authMechanismDoesNotRequirePassword = function authMechanismDoesNotRequirePassword() {
  // Extracted into separate function to reduce complexity
  return _authMechanismDoesNotRequirePassword(this);
};

/**
 * @brief Returns a boolean value that specifies if the provided objects object provides enough
 * data to authenticate with. Generally this is true if the username and password are both specified
 * but in some authentication methods, a password is not required for authentication so only a username
 * is required.
 * @param {Object} [options] the options object passed into the openUri methods.
 * @api private
 * @return {Boolean} true if the provided options object provides enough data to authenticate with,
 *   otherwise false.
 */
Connection.prototype.optionsProvideAuthenticationData = function optionsProvideAuthenticationData(options) {
  // Extracted into separate function to reduce complexity
  return _optionsProvideAuthenticationData(this, options);
};

/**
 * Returns the [MongoDB driver `MongoClient`](http://mongodb.github.io/node-mongodb-native/3.5/api/MongoClient.html) instance
 * that this connection uses to talk to MongoDB.
 *
 * ####Example:
 *     const conn = await mongoose.createConnection('mongodb://localhost:27017/test');
 *
 *     conn.getClient(); // MongoClient { ... }
 *
 * @api public
 * @return {MongoClient}
 */

Connection.prototype.getClient = function getClient() {
  // Extracted into separate function to reduce complexity
  return _getClient(this);
};

/**
 * Set the [MongoDB driver `MongoClient`](http://mongodb.github.io/node-mongodb-native/3.5/api/MongoClient.html) instance
 * that this connection uses to talk to MongoDB. This is useful if you already have a MongoClient instance, and want to
 * reuse it.
 *
 * ####Example:
 *     const client = await mongodb.MongoClient.connect('mongodb://localhost:27017/test');
 *
 *     const conn = mongoose.createConnection().setClient(client);
 *
 *     conn.getClient(); // MongoClient { ... }
 *     conn.readyState; // 1, means 'CONNECTED'
 *
 * @api public
 * @return {Connection} this
 */

Connection.prototype.setClient = function setClient(client) {
  // Extracted into separate function to reduce complexity
  return _setClient(this, client);
};

/**
 * Switches to a different database using the same connection pool.
 *
 * Returns a new connection object, with the new db.
 *
 * @method useDb
 * @memberOf Connection
 * @param {String} name The database name
 * @param {Object} [options]
 * @param {Boolean} [options.useCache=false] If true, cache results so calling `useDb()` multiple times with the same name only creates 1 connection object.
 * @param {Boolean} [options.noListener=false] If true, the connection object will not make the db listen to events on the original connection. See [issue #9961](https://github.com/Automattic/mongoose/issues/9961).
 * @return {Connection} New Connection Object
 * @api public
 */

// Extracted functions

function _createCollection(conn, collection, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }
  conn.db.createCollection(collection, options, cb);
}

function _startSession(conn, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = null;
  }
  const session = conn.client.startSession(options);
  cb(null, session);
}

function _transaction(conn, fn, options) {
  return conn.startSession().then(session => {
    session[sessionNewDocuments] = new Map();
    return session.withTransaction(() => fn(session), options).
      then(res => {
        delete session[sessionNewDocuments];
        return res;
      }).
      catch(err => {
        // If transaction was aborted, we need to reset newly
        // inserted documents' `isNew`.
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
}

function _dropCollection(conn, collection, cb) {
  conn.db.dropCollection(collection, cb);
}

function _dropDatabase(conn, cb) {
  // If `dropDatabase()` is called, this model's collection will not be
  // init-ed. It is sufficiently common to call `dropDatabase()` after
  // `mongoose.connect()` but before creating models that we want to
  // support this. See gh-6967
  for (const name of Object.keys(conn.models)) {
    delete conn.models[name].$init;
  }
  conn.db.dropDatabase(cb);
}

function _openUri(conn, uri, options, callback) {
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
      '`mongoose.connect()` or `mongoose.createConnection()` is a string.`);
  }

  if (callback != null && typeof callback !== 'function') {
    throw new MongooseError('3rd parameter to `mongoose.connect()` or ' +
      '`mongoose.createConnection()` must be a function, got "' +
      typeof callback + '"');
  }

  if (conn.readyState === STATES.connecting || conn.readyState === STATES.connected) {
    if (conn._connectionString !== uri) {
      throw new MongooseError('Can\'t call `openUri()` on an active connection with ' +
        'different connection strings. Make sure you aren\'t calling `mongoose.connect()` ' +
        'multiple times. See: https://mongoosejs.com/docs/connections.html#multiple_connections');
    }

    if (typeof callback === 'function') {
      conn.$initialConnection = conn.$initialConnection.then(
        () => callback(null, conn),
        err => callback(err)
      );
    }
    return conn;
  }

  conn._connectionString = uri;
  conn.readyState = STATES.connecting;
  conn._closeCalled = false;

  const Promise = PromiseProvider.get();
  const _this = conn;

  if (options) {
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

    // Backwards compat
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
      handleUseMongoClient(options);
    }
  } else {
    options = {};
  }

  conn._connectionOptions = options;
  const dbName = options.dbName;
  if (dbName != null) {
    conn.$dbName = dbName;
  }
  delete options.dbName;

  if (!('promiseLibrary' in options)) {
    options.promiseLibrary = PromiseProvider.get();
  }
  if (!('useNewUrlParser' in options)) {
    if ('useNewUrlParser' in conn.base.options) {
      options.useNewUrlParser = conn.base.options.useNewUrlParser;
    } else {
      options.useNewUrlParser = false;
    }
  }
  if (!utils.hasUserDefinedProperty(options, 'useUnifiedTopology')) {
    if (utils.hasUserDefinedProperty(conn.base.options, 'useUnifiedTopology')) {
      options.useUnifiedTopology = conn.base.options.useUnifiedTopology;
    } else {
      options.useUnifiedTopology = false;
    }
  }
  if (!utils.hasUserDefinedProperty(options, 'driverInfo')) {
    options.driverInfo = {
      name: 'Mongoose',
      version: pkg.version
    };
  }

  const parsePromise = new Promise((resolve, reject) => {
    parseConnectionString(uri, options, (err, parsed) => {
      if (err) {
        return reject(err);
      }
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
  conn.$initialConnection = Promise.all([promise, parsePromise]).
    then(res => res[0]).
    catch(err => {
      conn.readyState = STATES.disconnected;
      if (err != null && err.name === 'MongoServerSelectionError') {
        err = serverSelectionError.assimilateError(err);
      }

      if (conn.listeners('error').length > 0) {
        immediate(() => conn.emit('error', err));
      }
      throw err;
    });
  conn.then = function(resolve, reject) {
    return conn.$initialConnection.then(() => {
      if (typeof resolve === 'function') {
        return resolve(_this);
      }
    }, reject);
  };
  conn.catch = function(reject) {
    return conn.$initialConnection.catch(reject);
  };

  if (callback != null) {
    conn.$initialConnection = conn.$initialConnection.then(
      () => callback(null, conn),
      err => callback(err)
    );
  }

  return conn;
}

function _setClient(conn, client, options, dbName) {
  const db = dbName != null ? client.db(dbName) : client.db();
  conn.db = db;
  conn.client = client;
  conn._closeCalled = client._closeCalled;

  const _handleReconnect = () => {
    // If we aren't disconnected, we assume this reconnect is due to a
    // socket timeout. If there's no activity on a socket for
    // `socketTimeoutMS`, the driver will attempt to reconnect and emit
    // this event.
    if (conn.readyState !== STATES.connected) {
      conn.readyState = STATES.connected;
      conn.emit('reconnect');
      conn.emit('reconnected');
      conn.onOpen();
    }
  };

  // `useUnifiedTopology` events
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
        // Emit disconnected if we've lost connectivity to _all_ servers
        // in the replica set.
        const description = ev.newDescription;
        const servers = Array.from(ev.newDescription.servers.values());
        const allServersDisconnected = description.type === 'ReplicaSetNoPrimary' &&
          servers.reduce((cur, d) => cur || d.type === 'Unknown', false);
        if (conn.readyState === STATES.connected && allServersDisconnected) {
          // Implicitly emits 'disconnected'
          conn.readyState = STATES.disconnected;
        } else if (conn.readyState === STATES.disconnected && !allServersDisconnected) {
          _handleReconnect();
        }
      });

      client.on('close', function() {
        const type = get(db, 's.topology.s.description.type', '');
        if (type !== 'ReplicaSetWithPrimary') {
          // Implicitly emits 'disconnected'
          conn.readyState = STATES.disconnected;
        }
      });
    }
  }

  // Backwards compat for mongoose 4.x
  db.s.topology.on('reconnectFailed', function() {
    conn.emit('reconnectFailed');
  });

  if (!options.useUnifiedTopology) {
    client.on('reconnect', function() {
      _handleReconnect();
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
  if (!options.useUnifiedTopology) {
    client.on('close', function() {
      // Implicitly emits 'disconnected'
      conn.readyState = STATES.disconnected;
    });
  } else if (!type.startsWith('ReplicaSet')) {
    client.on('close', function() {
      // Implicitly emits 'disconnected'
      conn.readyState = STATES.disconnected;
    });
  }

  if (!options.useUnifiedTopology) {
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

  delete conn.then;
  delete conn.catch;

  conn.onOpen();
}

function handleUseMongoClient(options) {
  console.warn('WARNING: The `useMongoClient` option is no longer ' +
    'necessary in mongoose 5.x, please remove it.');
  const stack = new Error().stack;
  console.warn(stack.substr(stack.indexOf('\n') + 1));
  delete options.useMongoClient;
}

function _close(conn, force, callback) {
  const _this = conn;
  const closeCalled = conn._closeCalled;
  conn._closeCalled = true;
  if (conn.client != null) {
    conn.client._closeCalled = true;
  }

  switch (conn.readyState) {
    case STATES.disconnected:
      if (closeCalled) {
        callback();
      } else {
        conn.doClose(force, function(err) {
          if (err) {
            return callback(err);
          }
          _this.onClose(force);
          callback(null);
        });
      }
      break;

    case STATES.connected:
      conn.readyState = STATES.disconnecting;
      conn.doClose(force, function(err) {
        if (err) {
          return callback(err);
        }
        _this.onClose(force);
        callback(null);
      });

      break;
    case STATES.connecting:
      conn.once('open', function() {
        _this.close(callback);
      });
      break;

    case STATES.disconnecting:
      conn.once('close', function() {
        callback();
      });
      break;
  }

  return conn;
}

function _onClose(conn, force) {
  conn.readyState = STATES.disconnected;

  // avoid having the collection subscribe to our event emitter
  // to prevent 0.3 warning
  for (const i in conn.collections) {
    if (utils.object.hasOwnProperty(conn.collections, i)) {
      conn.collections[i].onClose(force);
    }
  }

  conn.emit('close', force);
}

function _collection(conn, name, options) {
  const defaultOptions = {
    autoIndex: conn.config.autoIndex != null ? conn.config.autoIndex : conn.base.options.autoIndex,
    autoCreate: conn.config.autoCreate != null ? conn.config.autoCreate : conn.base.options.autoCreate
  };
  options = Object.assign({}, defaultOptions, options ? utils.clone(options) : {});
  options.$wasForceClosed = conn.$wasForceClosed;
  if (!(name in conn.collections)) {
    conn.collections[name] = new Collection(name, conn, options);
  }
  return conn.collections[name];
}

function _plugin(conn, fn, opts) {
  conn.plugins.push([fn, opts]);
  return conn;
}

function _model(conn, name, schema, collection, options) {
  if (!(conn instanceof Connection)) {
    throw new MongooseError('`connection.model()` should not be run with ' +
      '`new`. If you are doing `new db.model(foo)(bar)`, use ' +
      '`db.model(foo)(bar)` instead');
  }

  let fn;
  if (typeof name === 'function') {
    fn = name;
    name = fn.name;
  }

  // collection name discovery
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

  const defaultOptions = { cache: false, overwriteModels: conn.base.options.overwriteModels };
  const opts = Object.assign(defaultOptions, options, { connection: conn });
  if (conn.models[name] && !collection && opts.overwriteModels !== true) {
    // model exists but we are not subclassing with custom collection
    if (schema && schema.instanceOfSchema && schema !== conn.models[name].schema) {
      throw new MongooseError.OverwriteModelError(name);
    }
    return conn.models[name];
  }

  let model;

  if (schema && schema.instanceOfSchema) {
    applyPlugins(schema, conn.plugins, null, '$connectionPluginsApplied');

    // compile a model
    model = conn.base.model(fn || name, schema, collection, opts);

    // only the first model with this name is cached to allow
    // for one-offs with custom collection names etc.
    if (!conn.models[name]) {
      conn.models[name] = model;
    }

    // Errors handled internally, so safe to ignore error
    model.init(function $modelInitNoop() {});

    return model;
  }

  if (conn.models[name] && collection) {
    // subclassing current model with alternate collection
    model = conn.models[name];
    schema = model.prototype.schema;
    const sub = model.__subclass(conn, schema, collection);
    // do not cache the sub model
    return sub;
  }

  // lookup model in mongoose module
  model = conn.base.models[name];

  if (!model) {
    throw new MongooseError.MissingSchemaError(name);
  }

  if (conn === model.prototype.db
      && (!collection || collection === model.collection.name)) {
    // model already uses this connection.

    // only the first model with this name is cached to allow
    // for one-offs with custom collection names etc.
    if (!conn.models[name]) {
      conn.models[name] = model;
    }

    return model;
  }
  conn.models[name] = model.__subclass(conn, schema, collection);
  return conn.models[name];
}

function _deleteModel(conn, name) {
  if (typeof name === 'string') {
    const model = conn.model(name);
    if (model == null) {
      return conn;
    }
    const collectionName = model.collection.name;
    delete conn.models[name];
    delete conn.collections[collectionName];
    delete conn.base.modelSchemas[name];

    conn.emit('deleteModel', model);
  } else if (name instanceof RegExp) {
    const pattern = name;
    const names = conn.modelNames();
    for (const name of names) {
      if (pattern.test(name)) {
        conn.deleteModel(name);
      }
    }
  } else {
    throw new Error('First parameter to `deleteModel()` must be a string ' +
      'or regexp, got "' + name + '"');
  }

  return conn;
}

function _watch(conn, pipeline, options) {
  const disconnectedError = new MongooseError('Connection ' + conn.id +
    ' was disconnected when calling `watch()`');

  const changeStreamThunk = cb => {
    immediate(() => {
      if (conn.readyState === STATES.connecting) {
        conn.once('open', function() {
          const driverChangeStream = conn.db.watch(pipeline, options);
          cb(null, driverChangeStream);
        });
      } else if (conn.readyState === STATES.disconnected && conn.db == null) {
        cb(disconnectedError);
      } else {
        const driverChangeStream = conn.db.watch(pipeline, options);
        cb(null, driverChangeStream);
      }
    });
  };

  const changeStream = new ChangeStream(changeStreamThunk, pipeline, options);
  return changeStream;
}

function _modelNames(conn) {
  return Object.keys(conn.models);
}

function _shouldAuthenticate(conn) {
  return conn.user != null &&
    (conn.pass != null || conn.authMechanismDoesNotRequirePassword());
}

function _authMechanismDoesNotRequirePassword(conn) {
  if (conn.options && conn.options.auth) {
    return noPasswordAuthMechanisms.indexOf(conn.options.auth.authMechanism) >= 0;
  }
  return true;
}

function _optionsProvideAuthenticationData(conn, options) {
  return (options) &&
      (options.user) &&
      ((options.pass) || conn.authMechanismDoesNotRequirePassword());
}

function _getClient(conn) {
  return conn.client;
}

function _setClient(conn, client) {
  if (!(client instanceof mongodb.MongoClient)) {
    throw new MongooseError('Must call `setClient()` with an instance of MongoClient');
  }
  if (conn.client != null || conn.readyState !== STATES.disconnected) {
    throw new MongooseError('Cannot call `setClient()` on a connection that is already connected.');
  }
  if (!client.isConnected()) {
    throw new MongooseError('Cannot call `setClient()` with a MongoClient that is not connected.');
  }

  conn._connectionString = client.s.url;
  _setClient(conn, client, { useUnifiedTopology: client.s.options.useUnifiedTopology }, client.s.options.dbName);

  return conn;
}

function _error(conn, err, callback) {
  if (callback) {
    callback(err);
    return null;
  }
  if (conn.listeners('error').length > 0) {
    conn.emit('error', err);
  }
  return Promise.reject(err);
}

function _onOpen(conn) {
  conn.readyState = STATES.connected;

  for (const d of conn._queue) {
    d.fn.apply(d.ctx, d.args);
  }
  conn._queue = [];

  // avoid having the collection subscribe to our event emitter
  // to prevent 0.3 warning
  for (const i in conn.collections) {
    if (utils.object.hasOwnProperty(conn.collections, i)) {
      conn.collections[i].onOpen();
    }
  }

  conn.emit('open');
}

// Export the Connection class
module.exports = Connection;