Lawnchair.adapter('indexed-db', (function(){

  var STORE_VERSION = 3;

  /**
   * Returns the appropriate indexedDB implementation for the current environment.
   */
  function getIndexedDB() {
      return window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;
  }

  /**
   * Returns the appropriate IDBTransaction implementation for the current environment.
   */
  function getIndexDBTransaction() {
      return window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.oIDBTransaction || window.msIDBTransaction;
  }

  /**
   * Returns the appropriate IDBKeyRange implementation for the current environment.
   */
  function getIndexDBKeyRange() {
      return window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.oIDBKeyRange || window.msIDBKeyRange;
  }

  /**
   * Determines the correct transaction mode for READ_WRITE operations.
   */
  var READ_WRITE = (getIndexDBTransaction() && 'READ_WRITE' in getIndexDBTransaction()) ? getIndexDBTransaction().READ_WRITE : 'readwrite';

  /**
   * Indicates whether the adapter is functional in the current environment.
   */
  function isAvailable() {
      return !!getIndexedDB();
  }

  /**
   * Executes a batch of operations against the object store using the provided callback per-item operation.
   */
  function performBatchOperation(adapter, operationFn, onComplete, onError) {
      try {
          var trans = adapter.db.transaction(adapter.record, READ_WRITE);
          var store = trans.objectStore(adapter.record);
          operationFn(store, onComplete);
      } catch (e) {
          onError(e);
      }
  }

  /**
   * Executes a single-key get operation and invokes the result handler.
   */
  function executeGetOperation(adapter, key, resultHandler) {
      var trans = adapter.db.transaction(adapter.record);
      var store = trans.objectStore(adapter.record);
      var request = store.get(key);

      request.onsuccess = function(event) {
          event.target.onsuccess = null;
          event.target.onerror = null;
          resultHandler(event);
      };

      request.onerror = function(event) {
          event.target.onsuccess = null;
          event.target.onerror = null;
          fail(event);
      };
  }

  /**
   * Executes a batch of individual get operations for an array of keys.
   */
  function executeBatchGetOperation(adapter, keys, resultHandler) {
      var results = [];
      var remaining = keys.length;

      function onCompleteIndex(index, result) {
          results[index] = result;
          remaining--;

          if (remaining === 0 && resultHandler) {
              resultHandler(results);
          }
      }

      for (var i = 0; i < keys.length; i++) {
          executeGetOperation(adapter, keys[i], function(event) {
              var value = event.target.result;
              value && (value.key = keys[i]);
              onCompleteIndex(i, value);
          });
      }
  }

  /**
   * Executes an open cursor operation and invokes the callback with each result.
   */
  function executeCursorOperation(adapter, direction, processItem, completionCallback) {
      var trans = adapter.db.transaction(adapter.record);
      var store = trans.objectStore(adapter.record);
      var request = store.openCursor();

      request.onsuccess = function(event) {
          var cursor = event.target.result;
          if (cursor) {
              processItem(cursor);
              cursor['continue']();
          } else {
              completionCallback();
          }
      };

      request.onerror = fail;
  }

  /**
   * Attempts to delete an object store, swallow errors if store doesn’t exist.
   */
  function safeDeleteStore(db, storeName) {
      try {
          if (db.objectStoreNames.contains(storeName)) {
              db.deleteObjectStore(storeName);
          }
      } catch (e) {
          // silently ignore errors
      }
  }

  /**
   * Creates the object store if it doesn’t exist.
   */
  function createObjectStoreIfMissing(db, storeName) {
      if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { autoIncrement: useAutoIncrement() });
      }
  }

  /**
   * Determines if auto-increment should be enabled based on feature detection.
   */
  function useAutoIncrement() {
      return !!window.indexedDB;
  }

  /**
   * Default error handler for database operations.
   */
  function fail(event) {
      console.error('error in indexed-db adapter!', event);
  }

  return {
    valid: function() {
        return isAvailable();
    },

    init: function(options, callback) {
        var self = this;

        var cb = self.fn(self.name, callback);
        if (cb && typeof cb !== 'function') {
            throw 'callback not valid';
        }

        self.waiting = [];
        self.idb = getIndexedDB();
        var request = self.idb.open(self.name, STORE_VERSION);

        request.onerror = fail;
        request.onupgradeneeded = function(event) {
            self.db = request.result;
            safeDeleteStore(self.db, self.record);
            createObjectStoreIfMissing(self.db, self.record);
        };
        request.onsuccess = function(event) {
            self.db = event.target.result;
            self.store = true;

            while (self.waiting.length) {
                self.waiting.shift().call(self);
            }

            if (cb) {
                cb.call(self, self);
            }
        };

        return this;
    },

    save: function(obj, callback) {
        var self = this;

        if (!this.store) {
            this.waiting.push(function() { this.save(obj, callback); });
            return;
        }

        var items = (this.isArray(obj) ? obj : [obj]).map(function(o) {
            if (!o.key) { o.key = self.uuid(); }
            return o;
        });

        performBatchOperation(this, function(store, onTransactionComplete) {
            items.forEach(function(item) {
                store.put(item, item.key);
            });
            store.transaction.oncomplete = function() {
                onTransactionComplete();
            };
            store.transaction.onabort = fail;
        }, function() {
            if (callback) {
                self.lambda(callback).call(self, self.isArray(obj) ? items : items[0]);
            }
        }, fail);

        return this;
    },

    batch: function(objs, callback) {
        return this.save(objs, callback);
    },

    get: function(key, callback) {
        var self = this;

        if (!this.store) {
            this.waiting.push(function() { this.get(key, callback); });
            return;
        }

        var resultHandler = function(event) {
            var result = event.target.result;
            if (callback) {
                if (result) { result.key = self.isArray(key) ? null : key; }
                self.lambda(callback).call(self, result);
            }
        };

        if (!this.isArray(key)) {
            executeGetOperation(this, key, resultHandler);
        } else {
            executeBatchGetOperation(this, key, resultHandler);
        }

        return this;
    },

    exists: function(key, callback) {
        var self = this;

        if (!this.store) {
            this.waiting.push(function() { this.exists(key, callback); });
            return;
        }

        var keyRange = getIndexDBKeyRange().only(key);
        var transaction = this.db.transaction(this.record);
        var store = transaction.objectStore(this.record);
        var request = store.openCursor(keyRange);

        request.onsuccess = function(event) {
            event.target.onsuccess = null;
            event.target.onerror = null;
            var result = event.target.result;
            self.lambda(callback).call(self, !!result);
        };

        request.onerror = fail;

        return this;
    },

    all: function(callback) {
        var self = this;

        if (!this.store) {
            this.waiting.push(function() { this.all(callback); });
            return;
        }

        var results = [];
        executeCursorOperation(this, 'next', function(cursor) {
            results.push(cursor.value);
        }, function() {
            if (callback) {
                self.lambda(callback).call(self, results);
            }
        });

        return this;
    },

    keys: function(callback) {
        var self = this;

        if (!this.store) {
            this.waiting.push(function() { this.keys(callback); });
            return;
        }

        var results = [];
        executeCursorOperation(this, 'next', function(cursor) {
            results.push(cursor.key);
        }, function() {
            if (callback) {
                self.lambda(callback).call(self, results);
            }
        });

        return this;
    },

    remove: function(keyOrArray, callback) {
        var self = this;

        if (!this.store) {
            this.waiting.push(function() { this.remove(keyOrArray, callback); });
            return;
        }

        var keys = this.isArray(keyOrArray) ? keyOrArray : [keyOrArray];

        performBatchOperation(this, function(store, onTransactionComplete) {
            keys.forEach(function(keyLike) {
                var key = (keyLike && keyLike.key) ? keyLike.key : keyLike;
                store['delete'](key);
            });

            store.transaction.oncomplete = onTransactionComplete;
            store.transaction.onabort = fail;
        }, function() {
            if (callback) {
                self.lambda(callback).call(self);
            }
        }, fail);

        return this;
    },

    nuke: function(callback) {
        var self = this;

        if (!this.store) {
            this.waiting.push(function() { this.nuke(callback); });
            return;
        }

        try {
            var trans = this.db.transaction(this.record, READ_WRITE);
            var store = trans.objectStore(this.record);
            store.clear();

            store.transaction.oncomplete = callback ? function() { self.lambda(callback).call(self); } : function(){};
            store.transaction.onabort = fail;
        } catch (e) {
            if (e.name === 'NotFoundError') {
                if (callback) { self.lambda(callback).call(self); }
            } else {
                fail(e);
            }
        }

        return this;
    }
  };
})());