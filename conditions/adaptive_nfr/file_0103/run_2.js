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

  const queueIfNotReady = function(operation) {
    if (!this.store) {
      this.waiting.push(operation);
      return true;
    }
    return false;
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
      if (queueIfNotReady.call(this, function() { this.save(obj, callback); })) {
        return this;
      }

      const objs = ensureArray(obj).map((o) => {
        if (!o.key) o.key = this.uuid();
        return o;
      });

      const transaction = this.db.transaction(this.record, READ_WRITE);
      const store = transaction.objectStore(this.record);

      objs.forEach((o) => store.put(o, o.key));

      transaction.oncomplete = () => {
        if (callback) {
          this.lambda(callback).call(this, Array.isArray(obj) ? objs : objs[0]);
        }
      };
      transaction.onabort = fail;

      return this;
    },

    batch(objs, callback) {
      return this.save(objs, callback);
    },

    get(key, callback) {
      if (queueIfNotReady.call(this, function() { this.get(key, callback); })) {
        return this;
      }

      if (!Array.isArray(key)) {
        return this._getSingle(key, callback);
      }

      return this._getMultiple(key, callback);
    },

    _getSingle(key, callback) {
      const self = this;
      const request = this.db.transaction(this.record)
        .objectStore(this.record)
        .get(key);

      setupRequestHandlers(request, (event) => {
        const result = event.target.result;
        if (result) result.key = key;
        if (callback) {
          self.lambda(callback).call(self, result);
        }
      });

      return this;
    },

    _getMultiple(keys, callback) {
      const self = this;
      const results = new Array(keys.length);
      let completed = 0;

      const onItemRetrieved = (index, obj) => {
        results[index] = obj;
        if (++completed === keys.length && callback) {
          self.lambda(callback).call(self, results);
        }
      };

      keys.forEach((key, index) => {
        self._getSingle(key, (obj) => onItemRetrieved(index, obj));
      });

      return this;
    },

    exists(key, callback) {
      if (queueIfNotReady.call(this, function() { this.exists(key, callback); })) {
        return this;
      }

      const self = this;
      const request = this.db.transaction(this.record)
        .objectStore(this.record)
        .openCursor(getIDBKeyRange().only(key));

      setupRequestHandlers(request, (event) => {
        const result = event.target.result;
        if (callback) {
          self.lambda(callback).call(self, result !== null && result !== undefined);
        }
      });

      return this;
    },

    all(callback) {
      if (queueIfNotReady.call(this, function() { this.all(callback); })) {
        return this;
      }

      const cb = this.fn(this.name, callback);
      const self = this;
      const results = [];
      const objectStore = this.db.transaction(this.record)
        .objectStore(this.record);

      objectStore.openCursor().onsuccess = (event) => {
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
      if (queueIfNotReady.call(this, function() { this.keys(callback); })) {
        return this;
      }

      const cb = this.fn(this.name, callback);
      const self = this;
      const results = [];
      const objectStore = this.db.transaction(this.record)
        .objectStore(this.record);

      objectStore.openCursor().onsuccess = (event) => {
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
      if (queueIfNotReady.call(this, function() { this.remove(keyOrArray, callback); })) {
        return this;
      }

      const toDelete = ensureArray(keyOrArray);
      const transaction = this.db.transaction(this.record, READ_WRITE);
      const store = transaction.objectStore(this.record);

      toDelete.forEach((item) => {
        store.delete(extractKey(item));
      });

      transaction.oncomplete = () => {
        if (callback) this.lambda(callback).call(this);
      };
      transaction.onabort = fail;

      return this;
    },

    nuke(callback) {
      if (queueIfNotReady.call(this, function() { this.nuke(callback); })) {
        return this;
      }

      const win = callback ? () => this.lambda(callback).call(this) : () => {};

      try {
        const transaction = this.db.transaction(this.record, READ_WRITE);
        const store = transaction.objectStore(this.record);
        store.clear();
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