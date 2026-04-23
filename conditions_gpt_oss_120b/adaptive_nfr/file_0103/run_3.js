/**
 * indexed db adapter
 * === 
 * - originally authored by Vivian Li
 *
 */ 

Lawnchair.adapter('indexed-db', (function(){

  // update the STORE_VERSION when the schema used by this adapter changes
  // (for example, if you change the STORE_NAME above)
  // NB: Causes onupgradeneeded to be fired, which erases the old database!
  const STORE_VERSION = 3;

  const getIDB = () => window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;
  const getIDBTransaction = () => window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.oIDBTransaction || window.msIDBTransaction;
  const getIDBKeyRange = () => window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.oIDBKeyRange || window.msIDBKeyRange;

  // see https://groups.google.com/a/chromium.org/forum/?fromgroups#!topic/chromium-html5/OhsoAQLj7kc
  const READ_WRITE = (getIDBTransaction() && 'READ_WRITE' in getIDBTransaction())
    ? getIDBTransaction().READ_WRITE
    : 'readwrite';

  /** Predicate: callback is defined but not a function */
  const isInvalidCallback = (cb) => cb && typeof cb !== 'function';

  /** Predicate: key is an array */
  const isArrayKey = (key, ctx) => ctx.isArray(key);

  /** Guard: ensure store is ready, otherwise queue the operation */
  function ensureStoreReady(ctx, methodName, args) {
    if (!ctx.store) {
      ctx.waiting.push(() => ctx[methodName](...args));
      return false;
    }
    return true;
  }

  /** Guard: validate callback */
  function validateCallback(cb) {
    if (isInvalidCallback(cb)) {
      throw 'callback not valid';
    }
  }

  /** Predicate: result exists */
  const resultExists = (result) => result !== null && result !== undefined;

  return {
    valid: function() {
      return !!getIDB();
    },

    init: function(options, callback) {
      const self = this;
      const cb = self.fn(self.name, callback);
      validateCallback(cb);

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
        self.db = event.target.result;
        self.store = true;

        // execute all pending operations
        while (self.waiting.length) {
          self.waiting.shift().call(self);
        }

        if (cb) {
          cb.call(self, self);
        }
      }
    },

    save: function(obj, callback) {
      const self = this;
      if (!ensureStoreReady(self, 'save', [obj, callback])) {
        return;
      }

      const objects = (self.isArray(obj) ? obj : [obj]).map(o => {
        if (!o.key) {
          o.key = self.uuid();
        }
        return o;
      });

      const transaction = self.db.transaction(self.record, READ_WRITE);
      const store = transaction.objectStore(self.record);

      objects.forEach(o => store.put(o, o.key));

      const onComplete = (e) => {
        if (callback) {
          self.lambda(callback).call(self, self.isArray(obj) ? objects : objects[0]);
        }
      };

      store.transaction.oncomplete = onComplete;
      store.transaction.onabort = fail;

      return this;
    },

    batch: function(objs, callback) {
      return this.save(objs, callback);
    },

    get: function(key, callback) {
      const self = this;
      if (!ensureStoreReady(self, 'get', [key, callback])) {
        return;
      }

      if (isArrayKey(key, self)) {
        return handleMultipleGet(self, key, callback);
      }
      return handleSingleGet(self, key, callback);
    },

    exists: function(key, callback) {
      const self = this;
      if (!ensureStoreReady(self, 'exists', [key, callback])) {
        return;
      }

      const req = self.db.transaction(self.record).objectStore(self.record)
        .openCursor(getIDBKeyRange().only(key));

      req.onsuccess = (event) => {
        req.onsuccess = req.onerror = null;
        const exists = resultExists(event.target.result);
        self.lambda(callback).call(self, exists);
      };
      req.onerror = (event) => {
        req.onsuccess = req.onerror = null;
        fail(event);
      };

      return this;
    },

    all: function(callback) {
      const self = this;
      if (!ensureStoreReady(self, 'all', [callback])) {
        return;
      }

      const cb = self.fn(self.name, callback) || undefined;
      const objectStore = self.db.transaction(self.record).objectStore(self.record);
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

    keys: function(callback) {
      const self = this;
      if (!ensureStoreReady(self, 'keys', [callback])) {
        return;
      }

      const cb = self.fn(self.name, callback) || undefined;
      const objectStore = self.db.transaction(self.record).objectStore(self.record);
      const keys = [];

      objectStore.openCursor().onsuccess = (event) => {
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

    remove: function(keyOrArray, callback) {
      const self = this;
      if (!ensureStoreReady(self, 'remove', [keyOrArray, callback])) {
        return;
      }

      const toDelete = self.isArray(keyOrArray) ? keyOrArray : [keyOrArray];
      const os = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);

      toDelete.forEach(item => {
        const delKey = item && item.key ? item.key : item;
        os['delete'](delKey);
      });

      const onComplete = () => {
        if (callback) {
          self.lambda(callback).call(self);
        }
      };

      os.transaction.oncomplete = onComplete;
      os.transaction.onabort = fail;

      return this;
    },

    nuke: function(callback) {
      const self = this;
      if (!ensureStoreReady(self, 'nuke', [callback])) {
        return;
      }

      const win = callback ? () => self.lambda(callback).call(self) : () => {};

      try {
        const os = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);
        os.clear();
        os.transaction.oncomplete = win;
        os.transaction.onabort = fail;
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

  // -------------------------------------------------------------------------
  // Helper functions
  // -------------------------------------------------------------------------

  /** Logs errors from IndexedDB operations */
  function fail(e) {
    console.error('error in indexed-db adapter!', e);
  }

  /** Determines whether auto‑increment should be used */
  function useAutoIncrement() {
    // using preliminary mozilla implementation which doesn't support
    // auto‑generated keys. Neither do some webkit implementations.
    return !!window.indexedDB;
  }

  /** Handles retrieval of a single key */
  function handleSingleGet(ctx, key, callback) {
    const win = (event) => {
      const result = event.target.result;
      if (callback) {
        if (result) {
          result.key = key;
        }
        ctx.lambda(callback).call(ctx, result);
      }
    };

    const req = ctx.db.transaction(ctx.record).objectStore(ctx.record).get(key);
    req.onsuccess = (event) => {
      req.onsuccess = req.onerror = null;
      win(event);
    };
    req.onerror = (event) => {
      req.onsuccess = req.onerror = null;
      fail(event);
    };
    return ctx;
  }

  /** Handles retrieval of multiple keys */
  function handleMultipleGet(ctx, keys, callback) {
    const results = new Array(keys.length);
    let remaining = keys.length;

    const collect = (index, obj) => {
      results[index] = obj;
      if (--remaining === 0 && callback) {
        ctx.lambda(callback).call(ctx, results);
      }
    };

    keys.forEach((k, i) => {
      ctx.get(k, (obj) => collect(i, obj));
    });

    return ctx;
  }

})());