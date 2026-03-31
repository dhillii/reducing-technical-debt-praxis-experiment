```javascript
/**
 * indexed db adapter
 * === 
 * - originally authored by Vivian Li
 */

Lawnchair.adapter('indexed-db', (function(){

  const STORE_VERSION = 3;
  const READ_WRITE = getTransactionMode();

  // ============================================================================
  // Vendor Prefixing Utilities
  // ============================================================================

  function getVendorAPI(apiName) {
    const prefixes = ['', 'webkit', 'moz', 'o', 'ms'];
    for (const prefix of prefixes) {
      const name = prefix ? prefix + apiName.charAt(0).toUpperCase() + apiName.slice(1) : apiName;
      if (window[name]) return window[name];
    }
    return null;
  }

  function getIDB() {
    return getVendorAPI('indexedDB');
  }

  function getIDBTransaction() {
    return getVendorAPI('IDBTransaction');
  }

  function getIDBKeyRange() {
    return getVendorAPI('IDBKeyRange');
  }

  function getTransactionMode() {
    const transaction = getIDBTransaction();
    return (transaction && 'READ_WRITE' in transaction) ? transaction.READ_WRITE : 'readwrite';
  }

  // ============================================================================
  // Database Initialization
  // ============================================================================

  function initializeDatabase(self, callback) {
    const idb = getIDB();
    const request = idb.open(self.name, STORE_VERSION);

    request.onerror = () => fail(request.error);
    request.onupgradeneeded = () => handleUpgrade(self, request);
    request.onsuccess = () => handleSuccess(self, request, callback);
  }

  function handleUpgrade(self, request) {
    self.db = request.result;
    self.transaction = request.transaction;

    try {
      self.db.deleteObjectStore(self.record);
    } catch (e) {
      // Ignore - store doesn't exist yet
    }

    self.db.createObjectStore(self.record, {
      autoIncrement: useAutoIncrement()
    });
  }

  function handleSuccess(self, request, callback) {
    self.db = request.result;
    self.store = true;

    // Execute all pending operations
    while (self.waiting.length) {
      self.waiting.shift().call(self);
    }

    if (callback) {
      callback.call(self, self);
    }
  }

  // ============================================================================
  // Transaction Utilities
  // ============================================================================

  function getObjectStore(db, storeName, mode = 'readonly') {
    const transaction = db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  function executeTransaction(db, storeName, mode, operation) {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    operation(store);
    return transaction;
  }

  // ============================================================================
  // Queue Management
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
  // Helper Functions
  // ============================================================================

  function fail(error) {
    console.error('error in indexed-db adapter!', error);
  }

  function useAutoIncrement() {
    return !!window.indexedDB;
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [value];
  }

  function extractKey(item) {
    return typeof item === 'object' && item.key ? item.key : item;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  return {
    valid() {
      return !!getIDB();
    },

    init(options, callback) {
      const cb = this.fn(this.name, callback);
      if (cb && typeof cb !== 'function') {
        throw new Error('callback not valid');
      }

      this.waiting = [];
      this.idb = getIDB();

      initializeDatabase(this, cb);
    },

    save(obj, callback) {
      if (queueIfNotReady(this, 'save', arguments)) return this;

      const self = this;
      const objs = ensureArray(obj).map(o => {
        if (!o.key) o.key = self.uuid();
        return o;
      });

      const transaction = executeTransaction(this.db, this.record, READ_WRITE, (store) => {
        objs.forEach(o => store.put(o, o.key));
      });

      transaction.oncomplete = () => {
        if (callback) {
          self.lambda(callback).call(self, Array.isArray(obj) ? objs : objs[0]);
        }
      };
      transaction.onabort = fail;

      return this;
    },

    batch(objs, callback) {
      return this.save(objs, callback);
    },

    get(key, callback) {
      if (queueIfNotReady(this, 'get', arguments)) return this;

      const self = this;

      if (!Array.isArray(key)) {
        this._getSingle(key, callback);
      } else {
        this._getMultiple(key, callback);
      }

      return this;
    },

    _getSingle(key, callback) {
      const self = this;
      const store = getObjectStore(this.db, this.record);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        if (result) result.key = key;
        if (callback) self.lambda(callback).call(self, result);
      };

      request.onerror = () => fail(request.error);
    },

    _getMultiple(keys, callback) {
      const self = this;
      const results = new Array(keys.length);
      let completed = 0;

      keys.forEach((key, index) => {
        self._getSingle(key, (obj) => {
          results[index] = obj;
          if (++completed === keys.length && callback) {
            self.lambda(callback).call(self, results);
          }
        });
      });
    },

    exists(key, callback) {
      if (queueIfNotReady(this, 'exists', arguments)) return this;

      const self = this;
      const store = getObjectStore(this.db, this.record);
      const request = store.openCursor(getIDBKeyRange().only(key));

      request.onsuccess = () => {
        const exists = request.result !== null && request.result !== undefined;
        if (callback) self.lambda(callback).call(self, exists);
      };

      request.onerror = () => fail(request.error);

      return this;
    },

    all(callback) {
      if (queueIfNotReady(this, 'all', arguments)) return this;

      const self = this;
      const cb = this.fn(this.name, callback);
      const store = getObjectStore(this.db, this.record);
      const results = [];

      store.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else if (cb) {
          cb.call(self, results);
        }
      };

      return this;
    },

    keys(callback) {
      if (queueIfNotReady(this, 'keys', arguments)) return this;

      const self = this;
      const cb = this.fn(this.name, callback);
      const store = getObjectStore(this.db, this.record);
      const results = [];

      store.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          results.push(cursor.key);
          cursor.continue();
        } else if (cb) {
          cb.call(self, results);
        }
      };

      return this;
    },

    remove(keyOrArray, callback) {
      if (queueIfNotReady(this, 'remove', arguments)) return this;

      const self = this;
      const keys = ensureArray(keyOrArray).map(extractKey);

      const transaction = executeTransaction(this.db, this.record, READ_WRITE, (store) => {
        keys.forEach(key => store.delete(key));
      });

      transaction.oncomplete = () => {
        if (callback) self.lambda(callback).call(self);
      };
      transaction.onabort = fail;

      return this;
    },

    nuke(callback) {
      if (queueIfNotReady(this, 'nuke', arguments)) return this;

      const self = this;
      const onComplete = callback ? () => self.lambda(callback).call(self) : () => {};

      try {
        const transaction = executeTransaction(this.db, this.record, READ_WRITE, (store) => {
          store.clear();
        });

        transaction.oncomplete = onComplete;
        transaction.onabort = fail;
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

})());
```