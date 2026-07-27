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
  const READ_WRITE = (getIDBTransaction() && 'READ_WRITE' in getIDBTransaction()) ? getIDBTransaction().READ_WRITE : 'readwrite';

  /**
   * Defer a method call until the database is ready.
   */
  function deferIfNotReady(context, methodName, args) {
    if (!context.store) {
      context.waiting.push(() => context[methodName](...args));
      return true;
    }
    return false;
  }

  /**
   * Open the IndexedDB database and set up event handlers.
   */
  function openDatabase(context, callback) {
    const request = context.idb.open(context.name, STORE_VERSION);
    request.onerror = fail;
    request.onupgradeneeded = () => handleUpgrade(context, request);
    request.onsuccess = event => handleSuccess(context, event, callback);
  }

  /**
   * Handle the onupgradeneeded event: recreate the object store.
   */
  function handleUpgrade(context, request) {
    context.db = request.result;
    context.transaction = request.transaction;
    try {
      context.db.deleteObjectStore(context.record);
    } catch (e) { /* ignore */ }
    context.db.createObjectStore(context.record, { autoIncrement: useAutoIncrement() });
  }

  /**
   * Handle the onsuccess event: finalize initialization and run pending ops.
   */
  function handleSuccess(context, event, callback) {
    context.db = event.target.result;
    context.store = true;
    while (context.waiting.length) {
      context.waiting.shift().call(context);
    }
    if (callback) {
      const cb = context.fn(context.name, callback);
      if (cb) cb.call(context, context);
    }
  }

  /**
   * Perform a put operation for one or many objects.
   */
  function performPut(context, objects, callback) {
    const transaction = context.db.transaction(context.record, READ_WRITE);
    const store = transaction.objectStore(context.record);
    objects.forEach(o => store.put(o, o.key));
    transaction.oncomplete = () => {
      if (callback) {
        const cb = context.lambda(callback);
        cb.call(context, context.isArray(objects) ? objects : objects[0]);
      }
    };
    transaction.onabort = fail;
  }

  /**
   * Retrieve a single record by key.
   */
  function retrieveSingle(context, key, callback) {
    const request = context.db.transaction(context.record).objectStore(context.record).get(key);
    request.onsuccess = event => {
      request.onsuccess = request.onerror = null;
      const result = event.target.result;
      if (callback) {
        const cb = context.lambda(callback);
        if (result) result.key = key;
        cb.call(context, result);
      }
    };
    request.onerror = event => {
      request.onsuccess = request.onerror = null;
      fail(event);
    };
  }

  /**
   * Retrieve multiple records by an array of keys.
   */
  function retrieveMultiple(context, keys, callback) {
    const results = new Array(keys.length);
    let remaining = keys.length;
    const onItem = (index, obj) => {
      results[index] = obj;
      if (--remaining === 0 && callback) {
        const cb = context.lambda(callback);
        cb.call(context, results);
      }
    };
    keys.forEach((k, i) => context.get(k, obj => onItem(i, obj)));
  }

  /**
   * Check existence of a key.
   */
  function checkExists(context, key, callback) {
    const req = context.db.transaction(context.record).objectStore(context.record).openCursor(getIDBKeyRange().only(key));
    req.onsuccess = event => {
      req.onsuccess = req.onerror = null;
      const exists = event.target.result !== null && event.target.result !== undefined;
      if (callback) {
        const cb = context.lambda(callback);
        cb.call(context, exists);
      }
    };
    req.onerror = event => {
      req.onsuccess = req.onerror = null;
      fail(event);
    };
  }

  /**
   * Iterate over all records and collect them.
   */
  function collectAll(context, callback) {
    const store = context.db.transaction(context.record).objectStore(context.record);
    const results = [];
    store.openCursor().onsuccess = event => {
      const cursor = event.target.result;
      if (cursor) {
        results.push(cursor.value);
        cursor['continue']();
      } else if (callback) {
        const cb = context.fn(context.name, callback);
        if (cb) cb.call(context, results);
      }
    };
  }

  /**
   * Iterate over all keys and collect them.
   */
  function collectKeys(context, callback) {
    const store = context.db.transaction(context.record).objectStore(context.record);
    const keys = [];
    store.openCursor().onsuccess = event => {
      const cursor = event.target.result;
      if (cursor) {
        keys.push(cursor.key);
        cursor['continue']();
      } else if (callback) {
        const cb = context.fn(context.name, callback);
        if (cb) cb.call(context, keys);
      }
    };
  }

  /**
   * Delete one or many records.
   */
  function deleteRecords(context, keysOrArray, callback) {
    const keys = context.isArray(keysOrArray) ? keysOrArray : [keysOrArray];
    const transaction = context.db.transaction(context.record, READ_WRITE);
    const store = transaction.objectStore(context.record);
    keys.forEach(k => {
      const key = k && typeof k === 'object' && 'key' in k ? k.key : k;
      store['delete'](key);
    });
    transaction.oncomplete = () => {
      if (callback) {
        const cb = context.lambda(callback);
        cb.call(context);
      }
    };
    transaction.onabort = fail;
  }

  /**
   * Clear the entire object store.
   */
  function clearStore(context, callback) {
    const onComplete = callback ? () => context.lambda(callback).call(context) : () => {};
    try {
      const store = context.db.transaction(context.record, READ_WRITE).objectStore(context.record);
      store.clear();
      store.transaction.oncomplete = onComplete;
      store.transaction.onabort = fail;
    } catch (e) {
      if (e.name === 'NotFoundError') {
        onComplete();
      } else {
        fail(e);
      }
    }
  }

  return {
    valid: function() {
      return !!getIDB();
    },

    init: function(options, callback) {
      const self = this;
      const cb = self.fn(self.name, callback);
      if (cb && typeof cb !== 'function') {
        throw 'callback not valid';
      }
      self.waiting = [];
      self.idb = getIDB();
      openDatabase(self, cb);
    },

    save: function(obj, callback) {
      const self = this;
      if (deferIfNotReady(self, 'save', [obj, callback])) return this;
      const objects = (self.isArray(obj) ? obj : [obj]).map(o => {
        if (!o.key) o.key = self.uuid();
        return o;
      });
      performPut(self, objects, callback);
      return this;
    },

    batch: function(objs, callback) {
      return this.save(objs, callback);
    },

    get: function(key, callback) {
      const self = this;
      if (deferIfNotReady(self, 'get', [key, callback])) return this;
      if (self.isArray(key)) {
        retrieveMultiple(self, key, callback);
      } else {
        retrieveSingle(self, key, callback);
      }
      return this;
    },

    exists: function(key, callback) {
      const self = this;
      if (deferIfNotReady(self, 'exists', [key, callback])) return this;
      checkExists(self, key, callback);
      return this;
    },

    all: function(callback) {
      const self = this;
      if (deferIfNotReady(self, 'all', [callback])) return this;
      collectAll(self, callback);
      return this;
    },

    keys: function(callback) {
      const self = this;
      if (deferIfNotReady(self, 'keys', [callback])) return this;
      collectKeys(self, callback);
      return this;
    },

    remove: function(keyOrArray, callback) {
      const self = this;
      if (deferIfNotReady(self, 'remove', [keyOrArray, callback])) return this;
      deleteRecords(self, keyOrArray, callback);
      return this;
    },

    nuke: function(callback) {
      const self = this;
      if (deferIfNotReady(self, 'nuke', [callback])) return this;
      clearStore(self, callback);
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