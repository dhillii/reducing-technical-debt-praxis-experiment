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
  // Browser Compatibility Helpers
  // ============================================================================

  function getIDB() {
    return window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || 
           window.oIndexedDB || window.msIndexedDB;
  }

  function getIDBTransaction() {
    return window.IDBTransaction || window.webkitIDBTransaction || 
           window.mozIDBTransaction || window.oIDBTransaction || window.msIDBTransaction;
  }

  function getIDBKeyRange() {
    return window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || 
           window.oIDBKeyRange || window.msIDBKeyRange;
  }

  function getTransactionMode() {
    const transaction = getIDBTransaction();
    return (transaction && 'READ_WRITE' in transaction) ? transaction.READ_WRITE : 'readwrite';
  }

  function useAutoIncrement() {
    return !!window.indexedDB;
  }

  // ============================================================================
  // Error Handling
  // ============================================================================

  function fail(e) {
    console.error('error in indexed-db adapter!', e);
  }

  // ============================================================================
  // Database Operations
  // ============================================================================

  function executeWhenReady(self, operation) {
    if (!self.store) {
      self.waiting.push(operation);
      return;
    }
    operation.call(self);
  }

  function getObjectStore(db, storeName, mode = 'readonly') {
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function normalizeKeys(key) {
    return Array.isArray(key) ? key : [key];
  }

  function ensureKeyProperty(obj, self) {
    if (!obj.key) {
      obj.key = self.uuid();
    }
    return obj;
  }

  function attachTransactionHandlers(transaction, onComplete, onAbort = fail) {
    transaction.oncomplete = onComplete;
    transaction.onabort = onAbort;
  }

  function attachRequestHandlers(request, onSuccess, onError = fail) {
    request.onsuccess = function(event) {
      request.onsuccess = request.onerror = null;
      onSuccess(event);
    };
    request.onerror = function(event) {
      request.onsuccess = request.onerror = null;
      onError(event);
    };
  }

  // ============================================================================
  // Adapter Implementation
  // ============================================================================

  return {
    valid: function() {
      return !!getIDB();
    },

    init: function(options, callback) {
      const self = this;
      const cb = self.fn(self.name, callback);

      if (cb && typeof cb !== 'function') {
        throw new Error('callback not valid');
      }

      self.waiting = [];
      self.idb = getIDB();

      const request = self.idb.open(self.name, STORE_VERSION);

      request.onerror = fail;
      request.onupgradeneeded = () => this._onUpgradeNeeded(request);
      request.onsuccess = () => this._onInitSuccess(request, cb);
    },

    _onUpgradeNeeded: function(request) {
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

    _onInitSuccess: function(request, callback) {
      this.db = request.result;
      this.store = true;

      while (this.waiting.length) {
        this.waiting.shift().call(this);
      }

      if (callback) {
        callback.call(this, this);
      }
    },

    save: function(obj, callback) {
      const self = this;

      executeWhenReady(this, function() {
        const objs = (Array.isArray(obj) ? obj : [obj])
          .map(o => ensureKeyProperty(o, self));

        const onSuccess = () => {
          if (callback) {
            self.lambda(callback).call(self, Array.isArray(obj) ? objs : objs[0]);
          }
        };

        const store = getObjectStore(this.db, this.record, READ_WRITE);
        objs.forEach(o => store.put(o, o.key));
        attachTransactionHandlers(store.transaction, onSuccess);
      });

      return this;
    },

    batch: function(objs, callback) {
      return this.save(objs, callback);
    },

    get: function(key, callback) {
      const self = this;

      executeWhenReady(this, function() {
        if (!Array.isArray(key)) {
          self._getSingle(key, callback);
        } else {
          self._getMultiple(key, callback);
        }
      });

      return this;
    },

    _getSingle: function(key, callback) {
      const self = this;
      const req = getObjectStore(this.db, this.record).get(key);

      attachRequestHandlers(req, (event) => {
        const result = event.target.result;
        if (result) {
          result.key = key;
        }
        if (callback) {
          self.lambda(callback).call(self, result);
        }
      });
    },

    _getMultiple: function(keys, callback) {
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

    exists: function(key, callback) {
      const self = this;

      executeWhenReady(this, function() {
        const req = getObjectStore(self.db, self.record)
          .openCursor(getIDBKeyRange().only(key));

        attachRequestHandlers(req, (event) => {
          const exists = event.target.result !== null && event.target.result !== undefined;
          if (callback) {
            self.lambda(callback).call(self, exists);
          }
        });
      });

      return this;
    },

    all: function(callback) {
      const self = this;
      const cb = this.fn(this.name, callback);

      executeWhenReady(this, function() {
        const objectStore = getObjectStore(self.db, self.record);
        const results = [];

        objectStore.openCursor().onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            results.push(cursor.value);
            cursor.continue();
          } else if (cb) {
            cb.call(self, results);
          }
        };
      });

      return this;
    },

    keys: function(callback) {
      const self = this;
      const cb = this.fn(this.name, callback);

      executeWhenReady(this, function() {
        const objectStore = getObjectStore(self.db, self.record);
        const results = [];

        objectStore.openCursor().onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            results.push(cursor.key);
            cursor.continue();
          } else if (cb) {
            cb.call(self, results);
          }
        };
      });

      return this;
    },

    remove: function(keyOrArray, callback) {
      const self = this;
      const keys = normalizeKeys(keyOrArray);

      executeWhenReady(this, function() {
        const store = getObjectStore(self.db, self.record, READ_WRITE);
        
        keys.forEach(item => {
          const key = item.key || item;
          store.delete(key);
        });

        const onSuccess = () => {
          if (callback) {
            self.lambda(callback).call(self);
          }
        };

        attachTransactionHandlers(store.transaction, onSuccess);
      });

      return this;
    },

    nuke: function(callback) {
      const self = this;
      const onSuccess = callback ? () => self.lambda(callback).call(self) : () => {};

      executeWhenReady(this, function() {
        try {
          const store = getObjectStore(self.db, self.record, READ_WRITE);
          store.clear();
          attachTransactionHandlers(store.transaction, onSuccess);
        } catch (e) {
          if (e.name === 'NotFoundError') {
            onSuccess();
          } else {
            fail(e);
          }
        }
      });

      return this;
    }
  };

})());
```