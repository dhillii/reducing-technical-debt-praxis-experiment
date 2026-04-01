```javascript
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
const noPasswordAuthMechanisms = [
  'MONGODB-X509'
];

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
  if (typeof base === 'undefined' || !base.connections.length) {
    this.id = 0;
  } else {
    this.id = base.connections.length;
  }
  this._queue = [];
}

/*!
 * Inherit from EventEmitter
 */

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

Connection.prototype.createCollection = _wrapConnHelper(function createCollection(collection, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }
  this.db.createCollection(collection, options, cb);
});

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

Connection.prototype.startSession = _wrapConnHelper(function startSession(options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = null;
  }
  const session = this.client.startSession(options);
  cb(null, session);
});

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
 * @param {