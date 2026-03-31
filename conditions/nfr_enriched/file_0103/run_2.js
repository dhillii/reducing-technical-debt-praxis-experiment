```javascript
/**
 * indexed db adapter
 * === 
 * - originally authored by Vivian Li
 */

Lawnchair.adapter('indexed-db', (function(){

  const STORE_VERSION = 3;
  const READ_WRITE = 'readwrite';

  // ============================================================================
  // Vendor Prefixing Utilities
  // ============================================================================

  const VendorAPI = {
    getIDB() {
      return window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || 
             window.oIndexedDB || window.msIndexedDB;
    },

    getIDBKeyRange() {
      return window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || 
             window.oIDBKeyRange || window.msIDBKeyRange;
    },

    useAutoIncrement() {
      return !!window.indexedDB;
    }
  };

  // ============================================================================
  // Error Handling
  // ============================================================================

  const ErrorHandler = {
    fail(error, context) {
      console.error('error in indexed-db adapter!', error, context);
    },

    validateCallback(callback) {
      if (callback && typeof callback !== 'function') {
        throw new Error('callback not valid');
      }
      return callback;
    }
  };

  // ============================================================================
  // Database Operations
  // ============================================================================

  const DBOperations = {
    createTransaction(db, storeName, mode = 'readonly') {
      return db.transaction(storeName, mode);
    },

    getObjectStore(db, storeName, mode = 'readonly') {
      const transaction = this.createTransaction(db, storeName, mode);
      return transaction.objectStore(storeName);
    },

    executeWithTransaction(db, storeName, mode, operation) {
      const transaction = this.createTransaction(db, storeName, mode);
      const objectStore = transaction.objectStore(storeName);
      operation(objectStore, transaction);
      return transaction;
    }
  };

  // ============================================================================
  // Cursor Operations
  // ============================================================================

  const CursorOperations = {
    iterateCursor(objectStore, callback, onComplete) {
      const results = [];
      objectStore.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          callback(cursor, results);
          cursor.continue();
        } else {
          onComplete(results);
        }
      };
    },

    iterateKeys(objectStore, onComplete) {
      this.iterateCursor(
        objectStore,
        (cursor, results) => results.push(cursor.key),
        onComplete
      );
    },

    iterateValues(objectStore, onComplete) {
      this.iterateCursor(
        objectStore,
        (cursor, results) => results.push(cursor.value),
        onComplete
      );
    }
  };

  // ============================================================================
  // Request Handlers
  // ============================================================================

  const RequestHandler = {
    attachHandlers(request, onSuccess, onError = ErrorHandler.fail) {
      request.onsuccess = (event) => {
        request.onsuccess = request.onerror = null;
        onSuccess(event);
      };
      request.onerror = (event) => {
        request.onsuccess = request.onerror = null;
        onError(event);
      };
    },

    attachTransactionHandlers(transaction, onComplete, onAbort = ErrorHandler.fail) {
      transaction.oncomplete = onComplete;
      transaction.onabort = onAbort;
    }
  };

  // ============================================================================
  // Main Adapter
  // ============================================================================

  return {
    valid() {
      return !!VendorAPI.getIDB();
    },

    init(options, callback) {
      const self = this;
      const cb = ErrorHandler.validateCallback(
        self.fn(self.name, callback)
      );

      self.waiting = [];
      self.idb = VendorAPI.getIDB();

      const request = self.idb.open(self.name, STORE_VERSION);

      request.onerror = () => ErrorHandler.fail(request.error);
      request.onupgradeneeded = () => this._onUpgradeNeeded(request);
      request.onsuccess = () => this._onInitSuccess(request, cb);
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
        autoIncrement: VendorAPI.useAutoIncrement()
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
      const objs = (this.isArray(obj) ? obj : [obj]).map((o) => {
        if (!o.key) {
          o.key = self.uuid();
        }
        return o;
      });

      const transaction = DBOperations.executeWithTransaction(
        this.db,
        this.record,
        READ_WRITE,
        (objectStore) => {
          objs.forEach((o) => objectStore.put(o, o.key));
        }
      );

      RequestHandler.attachTransactionHandlers(
        transaction,
        () => {
          if (callback) {
            self.lambda(callback).call(self, self.isArray(obj) ? objs : objs[0]);
          }
        }
      );

      return this;
    },

    batch(objs, callback) {
      return this.save(objs, callback);
    },

    get(key, callback) {
      if (this._queueIfNotReady(function() { this.get(key, callback); })) {
        return this;
      }

      if (!this.isArray(key)) {
        return this._getSingle(key, callback);
      }

      return this._getMultiple(key, callback);
    },

    _getSingle(key, callback) {
      const self = this;
      const objectStore = DBOperations.getObjectStore(this.db, this.record);
      const request = objectStore.get(key);

      RequestHandler.attachHandlers(request, (event) => {
        const result = event.target.result;
        if (result) {
          result.key = key;
        }
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
      const objectStore = DBOperations.getObjectStore(this.db, this.record);
      const request = objectStore.openCursor(
        VendorAPI.getIDBKeyRange().only(key)
      );

      RequestHandler.attachHandlers(request, (event) => {
        const exists = event.target.result !== null && event.target.result !== undefined;
        if (callback) {
          self.lambda(callback).call(self, exists);
        }
      });

      return this;
    },

    all(callback) {
      if (this._queueIfNotReady(function() { this.all(callback); })) {
        return this;
      }

      const self = this;
      const cb = this.fn(this.name, callback);
      const objectStore = DBOperations.getObjectStore(this.db, this.record);

      CursorOperations.iterateValues(objectStore, (results) => {
        if (cb) {
          cb.call(self, results);
        }
      });

      return this;
    },

    keys(callback) {
      if (this._queueIfNotReady(function() { this.keys(callback); })) {
        return this;
      }

      const self = this;
      const cb = this.fn(this.name, callback);
      const objectStore = DBOperations.getObjectStore(this.db, this.record);

      CursorOperations.iterateKeys(objectStore, (results) => {
        if (cb) {
          cb.call(self, results);
        }
      });

      return this;
    },

    remove(keyOrArray, callback) {
      if (this._queueIfNotReady(function() { this.remove(keyOrArray, callback); })) {
        return this;
      }

      const keysToDelete = this.isArray(keyOrArray) ? keyOrArray : [keyOrArray];
      const normalizedKeys = keysToDelete.map((item) =>
        typeof item === 'object' ? item.key : item
      );

      const transaction = DBOperations.executeWithTransaction(
        this.db,
        this.record,
        READ_WRITE,
        (objectStore) => {
          normalizedKeys.forEach((key) => objectStore.delete(key));
        }
      );

      RequestHandler.attachTransactionHandlers(
        transaction,
        () => {
          if (callback) {
            this.lambda(callback).call(this);
          }
        }
      );

      return this;
    },

    nuke(callback) {
      if (this._queueIfNotReady(function() { this.nuke(callback); })) {
        return this;
      }

      const self = this;
      const onComplete = callback ? () => self.lambda(callback).call(self) : () => {};

      try {
        const transaction = DBOperations.executeWithTransaction(
          this.db,
          this.record,
          READ_WRITE,
          (objectStore) => objectStore.clear()
        );

        RequestHandler.attachTransactionHandlers(transaction, onComplete);
      } catch (error) {
        if (error.name === 'NotFoundError') {
          onComplete();
        } else {
          ErrorHandler.fail(error);
        }
      }

      return this;
    }
  };

})());
```