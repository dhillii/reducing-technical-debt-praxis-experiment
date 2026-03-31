```javascript
/**
 * indexed db adapter
 * === 
 * - originally authored by Vivian Li
 */

Lawnchair.adapter('indexed-db', (function(){

  const STORE_VERSION = 3;
  const VENDOR_PREFIXES = ['webkit', 'moz', 'o', 'ms'];

  // ============================================================================
  // Vendor API Detection
  // ============================================================================

  const getVendorAPI = (apiName) => {
    const unprefixed = window[apiName];
    if (unprefixed) return unprefixed;
    
    for (const prefix of VENDOR_PREFIXES) {
      const prefixed = window[prefix + apiName.charAt(0).toUpperCase() + apiName.slice(1)];
      if (prefixed) return prefixed;
    }
    return null;
  };

  const getIDB = () => getVendorAPI('indexedDB');
  const getIDBTransaction = () => getVendorAPI('IDBTransaction');
  const getIDBKeyRange = () => getVendorAPI('IDBKeyRange');

  const READ_WRITE = (() => {
    const transaction = getIDBTransaction();
    return (transaction && 'READ_WRITE' in transaction) ? transaction.READ_WRITE : 'readwrite';
  })();

  // ============================================================================
  // Utility Functions
  // ============================================================================

  const fail = (e) => {
    console.error('error in indexed-db adapter!', e);
  };

  const useAutoIncrement = () => !!window.indexedDB;

  const ensureArray = (value) => Array.isArray(value) ? value : [value];

  const extractKey = (item) => item && item.key ? item.key : item;

  const attachRequestHandlers = (request, onSuccess, onError = fail) => {
    request.onsuccess = (event) => {
      request.onsuccess = request.onerror = null;
      onSuccess(event);
    };
    request.onerror = (event) => {
      request.onsuccess = request.onerror = null;
      onError(event);
    };
  };

  const executeWhenReady = function(operation) {
    if (this.store) {
      operation.call(this);
    } else {
      this.waiting.push(operation);
    }
  };

  // ============================================================================
  // Transaction Helpers
  // ============================================================================

  const getObjectStore = function(mode = 'readonly') {
    const transaction = this.db.transaction(this.record, mode);
    return transaction.objectStore(this.record);
  };

  const executeTransaction = function(mode, operation) {
    const objectStore = getObjectStore.call(this, mode);
    operation(objectStore);
    return objectStore.transaction;
  };

  // ============================================================================
  // Adapter Implementation
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

      request.onerror = fail;
      request.onupgradeneeded = () => self._onUpgradeNeeded(request);
      request.onsuccess = () => self._onInitSuccess(request, cb);
    },

    _onUpgradeNeeded(request) {
      this.db = request.result;
      this.transaction = request.transaction;

      try {
        this.db.deleteObjectStore(this.record);
      } catch (e) {
        // ignore - store doesn't exist yet
      }

      this.db.createObjectStore(this.record, {
        autoIncrement: useAutoIncrement()
      });
    },

    _onInitSuccess(request, callback) {
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
      executeWhenReady.call(this, function() {
        this._executeSave(obj, callback);
      });
      return this;
    },

    _executeSave(obj, callback) {
      const self = this;
      const objs = ensureArray(obj).map((o) => {
        if (!o.key) o.key = self.uuid();
        return o;
      });

      const transaction = executeTransaction.call(this, READ_WRITE, (store) => {
        objs.forEach((o) => store.put(o, o.key));
      });

      transaction.oncomplete = () => {
        if (callback) {
          self.lambda(callback).call(self, Array.isArray(obj) ? objs : objs[0]);
        }
      };
      transaction.onabort = fail;
    },

    batch(objs, callback) {
      return this.save(objs, callback);
    },

    get(key, callback) {
      executeWhenReady.call(this, function() {
        this._executeGet(key, callback);
      });
      return this;
    },

    _executeGet(key, callback) {
      if (!Array.isArray(key)) {
        this._getOne(key, callback);
      } else {
        this._getMany(key, callback);
      }
    },

    _getOne(key, callback) {
      const self = this;
      const request = getObjectStore.call(this).get(key);

      attachRequestHandlers(request, (event) => {
        const result = event.target.result;
        if (result) result.key = key;
        if (callback) {
          self.lambda(callback).call(self, result);
        }
      });
    },

    _getMany(keys, callback) {
      const self = this;
      const results = new Array(keys.length);
      let remaining = keys.length;

      const getOne = (index) => {
        self._getOne(keys[index], (obj) => {
          results[index] = obj;
          if (--remaining === 0 && callback) {
            self.lambda(callback).call(self, results);
          }
        });
      };

      for (let i = 0; i < keys.length; i++) {
        getOne(i);
      }
    },

    exists(key, callback) {
      executeWhenReady.call(this, function() {
        this._executeExists(key, callback);
      });
      return this;
    },

    _executeExists(key, callback) {
      const self = this;
      const request = getObjectStore.call(this).openCursor(
        getIDBKeyRange().only(key)
      );

      attachRequestHandlers(request, (event) => {
        const exists = event.target.result !== null && event.target.result !== undefined;
        if (callback) {
          self.lambda(callback).call(self, exists);
        }
      });
    },

    all(callback) {
      executeWhenReady.call(this, function() {
        this._executeAll(callback);
      });
      return this;
    },

    _executeAll(callback) {
      const self = this;
      const cb = this.fn(this.name, callback);
      const results = [];
      const objectStore = getObjectStore.call(this);

      objectStore.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else if (cb) {
          cb.call(self, results);
        }
      };
    },

    keys(callback) {
      executeWhenReady.call(this, function() {
        this._executeKeys(callback);
      });
      return this;
    },

    _executeKeys(callback) {
      const self = this;
      const cb = this.fn(this.name, callback);
      const results = [];
      const objectStore = getObjectStore.call(this);

      objectStore.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          results.push(cursor.key);
          cursor.continue();
        } else if (cb) {
          cb.call(self, results);
        }
      };
    },

    remove(keyOrArray, callback) {
      executeWhenReady.call(this, function() {
        this._executeRemove(keyOrArray, callback);
      });
      return this;
    },

    _executeRemove(keyOrArray, callback) {
      const self = this;
      const keys = ensureArray(keyOrArray).map(extractKey);

      const transaction = executeTransaction.call(this, READ_WRITE, (store) => {
        keys.forEach((key) => store.delete(key));
      });

      transaction.oncomplete = () => {
        if (callback) self.lambda(callback).call(self);
      };
      transaction.onabort = fail;
    },

    nuke(callback) {
      executeWhenReady.call(this, function() {
        this._executeNuke(callback);
      });
      return this;
    },

    _executeNuke(callback) {
      const self = this;
      const win = callback ? () => self.lambda(callback).call(self) : () => {};

      try {
        const transaction = executeTransaction.call(this, READ_WRITE, (store) => {
          store.clear();
        });
        transaction.oncomplete = win;
        transaction.onabort = fail;
      } catch (e) {
        if (e.name === 'NotFoundError') {
          win();
        } else {
          fail(e);
        }
      }
    }
  };

})());
```