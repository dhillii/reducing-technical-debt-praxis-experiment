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

  const vendorPrefixes = {
    idb: ['indexedDB', 'webkitIndexedDB', 'mozIndexedDB', 'oIndexedDB', 'msIndexedDB'],
    transaction: ['IDBTransaction', 'webkitIDBTransaction', 'mozIDBTransaction', 'oIDBTransaction', 'msIDBTransaction'],
    keyRange: ['IDBKeyRange', 'webkitIDBKeyRange', 'mozIDBKeyRange', 'oIDBKeyRange', 'msIDBKeyRange']
  };

  const getVendorAPI = (prefixes) => {
    for (const prefix of prefixes) {
      if (prefix in window) return window[prefix];
    }
    return null;
  };

  const getIDB = () => getVendorAPI(vendorPrefixes.idb);
  const getIDBKeyRange = () => getVendorAPI(vendorPrefixes.keyRange);

  // ============================================================================
  // Request Handler Utilities
  // ============================================================================

  const createRequestHandlers = (onSuccess, onError) => ({
    onsuccess: (event) => {
      onSuccess(event);
      clearHandlers();
    },
    onerror: (event) => {
      onError(event);
      clearHandlers();
    },
    clearHandlers() {
      this.onsuccess = this.onerror = null;
    }
  });

  const attachRequestHandlers = (request, onSuccess, onError) => {
    const handlers = createRequestHandlers(onSuccess, onError);
    request.onsuccess = handlers.onsuccess;
    request.onerror = handlers.onerror;
  };

  // ============================================================================
  // Database Operation Utilities
  // ============================================================================

  const ensureKeyExists = (obj, self) => {
    if (!obj.key) {
      obj.key = self.uuid();
    }
    return obj;
  };

  const normalizeToArray = (value) => Array.isArray(value) ? value : [value];

  const extractKey = (item) => item.key || item;

  const fail = (e) => {
    console.error('error in indexed-db adapter!', e);
  };

  const useAutoIncrement = () => !!window.indexedDB;

  // ============================================================================
  // Cursor Operations
  // ============================================================================

  const cursorOperation = (objectStore, callback, extractor = (cursor) => cursor.value) => {
    const results = [];
    objectStore.openCursor().onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        results.push(extractor(cursor));
        cursor.continue();
      } else {
        callback(results);
      }
    };
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
      request.onupgradeneeded = () => this._onUpgradeNeeded(request, self);
      request.onsuccess = () => this._onInitSuccess(request, self, cb);
    },

    _onUpgradeNeeded(request, self) {
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
    },

    _onInitSuccess(request, self, cb) {
      self.db = request.result;
      self.store = true;

      while (self.waiting.length) {
        self.waiting.shift().call(self);
      }

      if (cb) {
        cb.call(self, self);
      }
    },

    _queueIfNotReady(operation) {
      if (!this.store) {
        this.waiting.push(operation);
        return true;
      }
      return false;
    },

    save(obj, callback) {
      if (this._queueIfNotReady(function() { this.save(obj, callback); })) {
        return this;
      }

      const self = this;
      const objs = normalizeToArray(obj).map((o) => ensureKeyExists(o, self));

      const transaction = this.db.transaction(this.record, READ_WRITE);
      const store = transaction.objectStore(this.record);

      objs.forEach((o) => store.put(o, o.key));

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
      if (this._queueIfNotReady(function() { this.get(key, callback); })) {
        return this;
      }

      if (!Array.isArray(key)) {
        return this._getSingle(key, callback);
      }

      return this._getMultiple(key, callback);
    },

    _getSingle(key, callback) {
      const self = this;
      const request = this.db.transaction(this.record).objectStore(this.record).get(key);

      attachRequestHandlers(
        request,
        (event) => {
          const result = event.target.result;
          if (result) result.key = key;
          if (callback) self.lambda(callback).call(self, result);
        },
        fail
      );

      return this;
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

      return this;
    },

    exists(key, callback) {
      if (this._queueIfNotReady(function() { this.exists(key, callback); })) {
        return this;
      }

      const self = this;
      const request = this.db.transaction(this.record).objectStore(this.record)
        .openCursor(getIDBKeyRange().only(key));

      attachRequestHandlers(
        request,
        (event) => {
          const exists = event.target.result !== null && event.target.result !== undefined;
          if (callback) self.lambda(callback).call(self, exists);
        },
        fail
      );

      return this;
    },

    all(callback) {
      if (this._queueIfNotReady(function() { this.all(callback); })) {
        return this;
      }

      const cb = this.fn(this.name, callback);
      const self = this;
      const objectStore = this.db.transaction(this.record).objectStore(this.record);

      cursorOperation(objectStore, (results) => {
        if (cb) cb.call(self, results);
      });

      return this;
    },

    keys(callback) {
      if (this._queueIfNotReady(function() { this.keys(callback); })) {
        return this;
      }

      const cb = this.fn(this.name, callback);
      const self = this;
      const objectStore = this.db.transaction(this.record).objectStore(this.record);

      cursorOperation(objectStore, (results) => {
        if (cb) cb.call(self, results);
      }, (cursor) => cursor.key);

      return this;
    },

    remove(keyOrArray, callback) {
      if (this._queueIfNotReady(function() { this.remove(keyOrArray, callback); })) {
        return this;
      }

      const self = this;
      const keysToDelete = normalizeToArray(keyOrArray).map(extractKey);
      const transaction = this.db.transaction(this.record, READ_WRITE);
      const store = transaction.objectStore(this.record);

      keysToDelete.forEach((key) => store.delete(key));

      transaction.oncomplete = () => {
        if (callback) self.lambda(callback).call(self);
      };
      transaction.onabort = fail;

      return this;
    },

    nuke(callback) {
      if (this._queueIfNotReady(function() { this.nuke(callback); })) {
        return this;
      }

      const self = this;
      const onComplete = callback ? () => self.lambda(callback).call(self) : () => {};

      try {
        const transaction = this.db.transaction(this.record, READ_WRITE);
        const store = transaction.objectStore(this.record);
        store.clear();
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