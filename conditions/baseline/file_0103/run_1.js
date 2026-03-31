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
  // Vendor-specific API accessors
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
  // Helper functions
  // ============================================================================

  const fail = (e) => {
    console.error('error in indexed-db adapter!', e);
  };

  const useAutoIncrement = () => !!window.indexedDB;

  const ensureArray = (value) => Array.isArray(value) ? value : [value];

  const extractKey = (item) => (typeof item === 'object' && item.key) ? item.key : item;

  const queueIfNotReady = function(method, args) {
    if (!this.store) {
      this.waiting.push(() => this[method](...args));
      return true;
    }
    return false;
  };

  const setupRequestHandlers = (request, onSuccess, onError = fail) => {
    request.onsuccess = (event) => {
      request.onsuccess = request.onerror = null;
      onSuccess(event);
    };
    request.onerror = (event) => {
      request.onsuccess = request.onerror = null;
      onError(event);
    };
  };

  const getObjectStore = function(mode = 'readonly') {
    const transaction = this.db.transaction(this.record, mode);
    return transaction.objectStore(this.record);
  };

  const executeOnTransaction = function(mode, operation) {
    const objectStore = getObjectStore.call(this, mode);
    operation(objectStore);
    return objectStore.transaction;
  };

  // ============================================================================
  // Cursor operations
  // ============================================================================

  const cursorOperation = function(callback, processor) {
    const self = this;
    const results = [];
    const objectStore = getObjectStore.call(this);

    objectStore.openCursor().onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        results.push(processor(cursor));
        cursor.continue();
      } else {
        const cb = this.fn(this.name, callback) || undefined;
        if (cb) cb.call(self, results);
      }
    };
  };

  // ============================================================================
  // Main adapter
  // ============================================================================

  return {
    valid() {
      return !!getIDB();
    },

    init(options, callback) {
      const self = this;
      const cb = this.fn(this.name, callback);

      if (cb && typeof cb !== 'function') {
        throw new Error('callback not valid');
      }

      this.waiting = [];
      this.idb = getIDB();
      const request = this.idb.open(this.name, STORE_VERSION);

      request.onerror = fail;

      request.onupgradeneeded = () => {
        self.db = request.result;
        self.transaction = request.transaction;

        try {
          self.db.deleteObjectStore(self.record);
        } catch (e) {
          // ignore - store doesn't exist yet
        }

        self.db.createObjectStore(self.record, {
          autoIncrement: useAutoIncrement()
        });
      };

      request.onsuccess = (event) => {
        self.db = event.target.result;
        self.store = true;

        while (self.waiting.length) {
          self.waiting.shift().call(self);
        }

        if (cb) {
          cb.call(self, self);
        }
      };
    },

    save(obj, callback) {
      if (queueIfNotReady.call(this, 'save', [obj, callback])) {
        return this;
      }

      const self = this;
      const objs = ensureArray(obj).map((o) => {
        if (!o.key) o.key = self.uuid();
        return o;
      });

      const transaction = executeOnTransaction.call(this, READ_WRITE, (store) => {
        objs.forEach((o) => store.put(o, o.key));
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
      if (queueIfNotReady.call(this, 'get', [key, callback])) {
        return this;
      }

      const self = this;

      if (!Array.isArray(key)) {
        const objectStore = getObjectStore.call(this);
        const request = objectStore.get(key);

        setupRequestHandlers(request, (event) => {
          const result = event.target.result;
          if (result) result.key = key;
          if (callback) {
            self.lambda(callback).call(self, result);
          }
        });
      } else {
        const results = new Array(key.length);
        let done = key.length;

        const getOne = (i) => {
          self.get(key[i], (obj) => {
            results[i] = obj;
            if (--done === 0 && callback) {
              self.lambda(callback).call(self, results);
            }
          });
        };

        for (let i = 0; i < key.length; i++) {
          getOne(i);
        }
      }

      return this;
    },

    exists(key, callback) {
      if (queueIfNotReady.call(this, 'exists', [key, callback])) {
        return this;
      }

      const self = this;
      const objectStore = getObjectStore.call(this);
      const request = objectStore.openCursor(getIDBKeyRange().only(key));

      setupRequestHandlers(request, (event) => {
        const result = event.target.result;
        if (callback) {
          self.lambda(callback).call(self, result !== null && result !== undefined);
        }
      });

      return this;
    },

    all(callback) {
      if (queueIfNotReady.call(this, 'all', [callback])) {
        return this;
      }

      cursorOperation.call(this, callback, (cursor) => cursor.value);
      return this;
    },

    keys(callback) {
      if (queueIfNotReady.call(this, 'keys', [callback])) {
        return this;
      }

      cursorOperation.call(this, callback, (cursor) => cursor.key);
      return this;
    },

    remove(keyOrArray, callback) {
      if (queueIfNotReady.call(this, 'remove', [keyOrArray, callback])) {
        return this;
      }

      const toDelete = ensureArray(keyOrArray);

      const transaction = executeOnTransaction.call(this, READ_WRITE, (store) => {
        toDelete.forEach((item) => {
          store.delete(extractKey(item));
        });
      });

      transaction.oncomplete = () => {
        if (callback) this.lambda(callback).call(this);
      };
      transaction.onabort = fail;

      return this;
    },

    nuke(callback) {
      if (queueIfNotReady.call(this, 'nuke', [callback])) {
        return this;
      }

      const win = callback ? () => this.lambda(callback).call(this) : () => {};

      try {
        const transaction = executeOnTransaction.call(this, READ_WRITE, (store) => {
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

      return this;
    }
  };

})());
```