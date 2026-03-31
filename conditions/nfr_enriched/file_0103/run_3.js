```javascript
/**
 * indexed db adapter
 * === 
 * - originally authored by Vivian Li
 */

Lawnchair.adapter('indexed-db', (function(){

  // Configuration
  const STORE_VERSION = 3;
  const READ_WRITE = 'readwrite';

  // ============================================================================
  // Vendor Prefixing Utilities
  // ============================================================================

  const vendorPrefixes = ['', 'webkit', 'moz', 'o', 'ms'];

  function getVendorAPI(apiName) {
    for (const prefix of vendorPrefixes) {
      const name = prefix ? prefix + apiName.charAt(0).toUpperCase() + apiName.slice(1) : apiName;
      if (name in window) {
        return window[name];
      }
    }
    return null;
  }

  const getIDB = () => getVendorAPI('indexedDB');
  const getIDBKeyRange = () => getVendorAPI('IDBKeyRange');

  // ============================================================================
  // Request Handler Utilities
  // ============================================================================

  function attachRequestHandlers(request, handlers) {
    Object.entries(handlers).forEach(([event, handler]) => {
      request[event] = handler;
    });
  }

  function createTransactionHandler(callback, context, isArray, data) {
    return function() {
      if (callback) {
        context.lambda(callback).call(context, isArray ? data : data[0]);
      }
    };
  }

  function attachTransactionHandlers(transaction, onComplete, onAbort = fail) {
    transaction.oncomplete = onComplete;
    transaction.onabort = onAbort;
  }

  // ============================================================================
  // Cursor Utilities
  // ============================================================================

  function processCursorResults(objectStore, processor) {
    return new Promise((resolve) => {
      const results = [];
      objectStore.openCursor().onsuccess = function(event) {
        const cursor = event.target.result;
        if (cursor) {
          results.push(processor(cursor));
          cursor['continue']();
        } else {
          resolve(results);
        }
      };
    });
  }

  // ============================================================================
  // Store Ready Check
  // ============================================================================

  function queueIfNotReady(self, method, args) {
    if (!self.store) {
      self.waiting.push(function() {
        self[method].apply(self, args);
      });
      return true;
    }
    return false;
  }

  // ============================================================================
  // Main Adapter
  // ============================================================================

  return {
    valid() {
      return !!getIDB();
    },

    init(options, callback) {
      const self = this;
      const cb = self.fn(self.name, callback);

      if (cb && typeof cb !== 'function') {
        throw new Error('callback not valid');
      }

      self.waiting = [];
      self.idb = getIDB();

      const request = self.idb.open(self.name, STORE_VERSION);

      attachRequestHandlers(request, {
        onerror: fail,
        onupgradeneeded: () => this._handleUpgrade(request),
        onsuccess: () => this._handleSuccess(request, cb)
      });
    },

    _handleUpgrade(request) {
      this.db = request.result;
      this.transaction = request.transaction;

      try {
        this.db.deleteObjectStore(this.record);
      } catch (e) {
        // ignore
      }

      this.db.createObjectStore(this.record, {
        autoIncrement: !!getIDB()
      });
    },

    _handleSuccess(request, callback) {
      this.db = request.result;
      this.store = true;

      while (this.waiting.length) {
        this.waiting.shift().call(this);
      }

      if (callback) {
        callback.call(this, this);
      }
    },

    save(obj, callback) {
      if (queueIfNotReady(this, 'save', arguments)) {
        return this;
      }

      const self = this;
      const objs = (this.isArray(obj) ? obj : [obj]).map(o => {
        if (!o.key) {
          o.key = self.uuid();
        }
        return o;
      });

      const transaction = this.db.transaction(this.record, READ_WRITE);
      const store = transaction.objectStore(this.record);

      objs.forEach(o => store.put(o, o.key));

      attachTransactionHandlers(
        transaction,
        createTransactionHandler(callback, this, this.isArray(obj), objs)
      );

      return this;
    },

    batch(objs, callback) {
      return this.save(objs, callback);
    },

    get(key, callback) {
      if (queueIfNotReady(this, 'get', arguments)) {
        return this;
      }

      if (!this.isArray(key)) {
        this._getSingle(key, callback);
      } else {
        this._getMultiple(key, callback);
      }

      return this;
    },

    _getSingle(key, callback) {
      const self = this;
      const req = this.db.transaction(this.record).objectStore(this.record).get(key);

      attachRequestHandlers(req, {
        onsuccess: (event) => {
          req.onsuccess = req.onerror = null;
          const result = event.target.result;
          if (result) {
            result.key = key;
          }
          if (callback) {
            self.lambda(callback).call(self, result);
          }
        },
        onerror: (event) => {
          req.onsuccess = req.onerror = null;
          fail(event);
        }
      });
    },

    _getMultiple(keys, callback) {
      const self = this;
      const results = [];
      let done = keys.length;

      keys.forEach((key, i) => {
        self.get(key, (obj) => {
          results[i] = obj;
          if (--done === 0 && callback) {
            self.lambda(callback).call(self, results);
          }
        });
      });
    },

    exists(key, callback) {
      if (queueIfNotReady(this, 'exists', arguments)) {
        return this;
      }

      const self = this;
      const req = this.db.transaction(this.record).objectStore(this.record)
        .openCursor(getIDBKeyRange().only(key));

      attachRequestHandlers(req, {
        onsuccess: (event) => {
          req.onsuccess = req.onerror = null;
          const result = event.target.result;
          self.lambda(callback).call(self, result !== null && result !== undefined);
        },
        onerror: (event) => {
          req.onsuccess = req.onerror = null;
          fail(event);
        }
      });

      return this;
    },

    all(callback) {
      if (queueIfNotReady(this, 'all', arguments)) {
        return this;
      }

      const cb = this.fn(this.name, callback) || undefined;
      const self = this;
      const objectStore = this.db.transaction(this.record).objectStore(this.record);
      const results = [];

      objectStore.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor['continue']();
        } else if (cb) {
          cb.call(self, results);
        }
      };

      return this;
    },

    keys(callback) {
      if (queueIfNotReady(this, 'keys', arguments)) {
        return this;
      }

      const cb = this.fn(this.name, callback) || undefined;
      const self = this;
      const objectStore = this.db.transaction(this.record).objectStore(this.record);
      const results = [];

      objectStore.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          results.push(cursor.key);
          cursor['continue']();
        } else if (cb) {
          cb.call(self, results);
        }
      };

      return this;
    },

    remove(keyOrArray, callback) {
      if (queueIfNotReady(this, 'remove', arguments)) {
        return this;
      }

      const toDelete = this.isArray(keyOrArray) ? keyOrArray : [keyOrArray];
      const transaction = this.db.transaction(this.record, READ_WRITE);
      const store = transaction.objectStore(this.record);

      toDelete.forEach(item => {
        const key = item.key || item;
        store['delete'](key);
      });

      attachTransactionHandlers(
        transaction,
        callback ? () => this.lambda(callback).call(this) : () => {}
      );

      return this;
    },

    nuke(callback) {
      if (queueIfNotReady(this, 'nuke', arguments)) {
        return this;
      }

      const onComplete = callback ? () => this.lambda(callback).call(this) : () => {};

      try {
        const transaction = this.db.transaction(this.record, READ_WRITE);
        const store = transaction.objectStore(this.record);
        store.clear();
        attachTransactionHandlers(transaction, onComplete);
      } catch (e) {
        if (e.name === 'NotFoundError') {
          onComplete();
        } else {
          fail(e);
        }
      }

      return this;
    }
  };

  // ============================================================================
  // Helper Functions
  // ============================================================================

  function fail(e) {
    console.error('error in indexed-db adapter!', e);
  }

})());
```