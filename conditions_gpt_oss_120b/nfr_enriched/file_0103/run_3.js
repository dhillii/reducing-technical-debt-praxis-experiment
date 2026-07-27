/**
 * indexed db adapter
 * === 
 * - originally authored by Vivian Li
 *
 */ 

Lawnchair.adapter('indexed-db', (function () {

  // update the STORE_VERSION when the schema used by this adapter changes
  // (for example, if you change the STORE_NAME above)
  // NB: Causes onupgradeneeded to be fired, which erases the old database!
  const STORE_VERSION = 3;

  const getIDB = () => window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;

  const getIDBTransaction = () => window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.oIDBTransaction || window.msIDBTransaction;

  const getIDBKeyRange = () => window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.oIDBKeyRange || window.msIDBKeyRange;

  // see https://groups.google.com/a/chromium.org/forum/?fromgroups#!topic/chromium-html5/OhsoAQLj7kc
  const READ_WRITE = (getIDBTransaction() && 'READ_WRITE' in getIDBTransaction()) ? getIDBTransaction().READ_WRITE : 'readwrite';

  /**
   * Enqueue a method call if the store is not ready yet.
   */
  function enqueueIfNotReady(context, methodName, args) {
    if (!context.store) {
      context.waiting.push(() => context[methodName](...args));
      return true;
    }
    return false;
  }

  /**
   * Create a transaction for the given store name.
   */
  function createTransaction(context, mode = READ_WRITE) {
    return context.db.transaction(context.record, mode);
  }

  /**
   * Generic request handler that cleans up listeners and forwards success/error.
   */
  function attachHandlers(request, onSuccess, onError) {
    request.onsuccess = (event) => {
      request.onsuccess = request.onerror = null;
      onSuccess(event);
    };
    request.onerror = (event) => {
      request.onsuccess = request.onerror = null;
      onError(event);
    };
  }

  return {
    valid: function () {
      return !!getIDB();
    },

    init: function (options, callback) {
      const self = this;
      const cb = self.fn(self.name, callback);
      if (cb && typeof cb !== 'function') {
        throw 'callback not valid';
      }

      // queues pending operations
      self.waiting = [];

      // open idb
      self.idb = getIDB();
      const request = self.idb.open(self.name, STORE_VERSION);

      // attach callback handlers
      request.onerror = fail;
      request.onupgradeneeded = onUpgradeNeeded;
      request.onsuccess = onSuccess;

      function onUpgradeNeeded() {
        self.db = request.result;
        self.transaction = request.transaction;

        // NB! in case of a version conflict, we don't try to migrate,
        // instead just throw away the old store and create a new one.
        try {
          self.db.deleteObjectStore(self.record);
        } catch (e) { /* ignore */ }

        // create object store.
        self.db.createObjectStore(self.record, {
          autoIncrement: useAutoIncrement()
        });
      }

      function onSuccess(event) {
        // remember the db instance
        self.db = event.target.result;

        // storage is now possible
        self.store = true;

        // execute all pending operations
        while (self.waiting.length) {
          self.waiting.shift().call(self);
        }

        // we're done, fire the callback
        if (cb) {
          cb.call(self, self);
        }
      }
    },

    save: function (obj, callback) {
      if (enqueueIfNotReady(this, 'save', [obj, callback])) {
        return this;
      }

      const self = this;
      const objects = (self.isArray(obj) ? obj : [obj]).map((o) => {
        if (!o.key) {
          o.key = self.uuid();
        }
        return o;
      });

      const transaction = createTransaction(this);
      const store = transaction.objectStore(this.record);

      objects.forEach((o) => store.put(o, o.key));

      transaction.oncomplete = () => {
        if (callback) {
          self.lambda(callback).call(self, self.isArray(obj) ? objects : objects[0]);
        }
      };
      transaction.onabort = fail;

      return this;
    },

    batch: function (objs, callback) {
      return this.save(objs, callback);
    },

    get: function (key, callback) {
      if (enqueueIfNotReady(this, 'get', [key, callback])) {
        return this;
      }

      if (this.isArray(key)) {
        return this._getMultiple(key, callback);
      }
      return this._getSingle(key, callback);
    },

    _getSingle: function (key, callback) {
      const self = this;
      const transaction = createTransaction(this, 'readonly');
      const store = transaction.objectStore(this.record);
      const request = store.get(key);

      attachHandlers(request,
        (event) => {
          const result = event.target.result;
          if (callback) {
            if (result) {
              result.key = key;
            }
            self.lambda(callback).call(self, result);
          }
        },
        fail
      );

      return this;
    },

    _getMultiple: function (keys, callback) {
      const self = this;
      const results = new Array(keys.length);
      let remaining = keys.length;

      const collectResult = (index, obj) => {
        results[index] = obj;
        if (--remaining === 0 && callback) {
          self.lambda(callback).call(self, results);
        }
      };

      keys.forEach((k, i) => {
        self.get(k, (obj) => collectResult(i, obj));
      });

      return this;
    },

    exists: function (key, callback) {
      if (enqueueIfNotReady(this, 'exists', [key, callback])) {
        return this;
      }

      const self = this;
      const range = getIDBKeyRange().only(key);
      const request = this.db.transaction(this.record).objectStore(this.record).openCursor(range);

      attachHandlers(request,
        (event) => {
          const result = event.target.result;
          const exists = result !== null && result !== undefined;
          self.lambda(callback).call(self, exists);
        },
        fail
      );

      return this;
    },

    all: function (callback) {
      if (enqueueIfNotReady(this, 'all', [callback])) {
        return this;
      }

      const cb = this.fn(this.name, callback) || undefined;
      const self = this;
      const store = this.db.transaction(this.record).objectStore(this.record);
      const results = [];

      store.openCursor().onsuccess = function (event) {
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

    keys: function (callback) {
      if (enqueueIfNotReady(this, 'keys', [callback])) {
        return this;
      }

      const cb = this.fn(this.name, callback) || undefined;
      const self = this;
      const store = this.db.transaction(this.record).objectStore(this.record);
      const keys = [];

      store.openCursor().onsuccess = function (event) {
        const cursor = event.target.result;
        if (cursor) {
          keys.push(cursor.key);
          cursor['continue']();
        } else if (cb) {
          cb.call(self, keys);
        }
      };

      return this;
    },

    remove: function (keyOrArray, callback) {
      if (enqueueIfNotReady(this, 'remove', [keyOrArray, callback])) {
        return this;
      }

      const self = this;
      const toDelete = this.isArray(keyOrArray) ? keyOrArray : [keyOrArray];

      const transaction = createTransaction(this);
      const store = transaction.objectStore(this.record);

      toDelete.forEach((item) => {
        const delKey = item && item.key ? item.key : item;
        store['delete'](delKey);
      });

      transaction.oncomplete = () => {
        if (callback) {
          self.lambda(callback).call(self);
        }
      };
      transaction.onabort = fail;

      return this;
    },

    nuke: function (callback) {
      if (enqueueIfNotReady(this, 'nuke', [callback])) {
        return this;
      }

      const self = this;
      const win = callback ? () => self.lambda(callback).call(self) : () => {};

      try {
        const transaction = createTransaction(this);
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

  //
  // Helper functions
  //

  function fail(e) {
    console.error('error in indexed-db adapter!', e);
  }

  function useAutoIncrement() {
    // using preliminary mozilla implementation which doesn't support
    // auto-generated keys.  Neither do some webkit implementations.
    return !!window.indexedDB;
  }

})()));