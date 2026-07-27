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

  /** Helper: schedule operation until DB is ready */
  function scheduleIfNotReady(self, fn, args) {
    if (!self.store) {
      self.waiting.push(() => fn.apply(self, args));
    }
  }

  /** Helper: open object store with proper mode */
  function getObjectStore(self, mode = READ_WRITE) {
    return self.db.transaction(self.record, mode).objectStore(self.record);
  }

  /** Helper: create or upgrade database schema */
  function handleUpgrade(request, self) {
    self.db = request.result;
    self.transaction = request.transaction;
    try {
      self.db.deleteObjectStore(self.record);
    } catch (e) { /* ignore */ }
    self.db.createObjectStore(self.record, { autoIncrement: useAutoIncrement() });
  }

  /** Helper: finalize init after successful open */
  function handleSuccess(event, self, callback) {
    self.db = event.target.result;
    self.store = true;
    while (self.waiting.length) {
      self.waiting.shift().call(self);
    }
    if (callback) {
      callback.call(self, self);
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
      const request = self.idb.open(self.name, STORE_VERSION);
      request.onerror = fail;
      request.onupgradeneeded = () => handleUpgrade(request, self);
      request.onsuccess = (e) => handleSuccess(e, self, cb);
    },

    save: function(obj, callback) {
      const self = this;
      scheduleIfNotReady(self, this.save, [obj, callback]);
      if (!self.store) return this;

      const items = (self.isArray(obj) ? obj : [obj]).map(o => {
        if (!o.key) o.key = self.uuid();
        return o;
      });

      const transaction = self.db.transaction(self.record, READ_WRITE);
      const store = transaction.objectStore(self.record);
      items.forEach(item => store.put(item, item.key));

      transaction.oncomplete = () => {
        if (callback) self.lambda(callback).call(self, self.isArray(obj) ? items : items[0]);
      };
      transaction.onabort = fail;
      return this;
    },

    batch: function(objs, callback) {
      return this.save(objs, callback);
    },

    get: function(key, callback) {
      const self = this;
      scheduleIfNotReady(self, this.get, [key, callback]);
      if (!self.store) return this;

      if (self.isArray(key)) {
        return getMultiple(self, key, callback);
      }
      return getSingle(self, key, callback);
    },

    exists: function(key, callback) {
      const self = this;
      scheduleIfNotReady(self, this.exists, [key, callback]);
      if (!self.store) return this;

      const req = self.db.transaction(self.record).objectStore(self.record)
        .openCursor(getIDBKeyRange().only(key));

      req.onsuccess = (e) => {
        req.onsuccess = req.onerror = null;
        const result = e.target.result;
        const exists = result !== null && result !== undefined;
        self.lambda(callback).call(self, exists);
      };
      req.onerror = (e) => {
        req.onsuccess = req.onerror = null;
        fail(e);
      };
      return this;
    },

    all: function(callback) {
      const self = this;
      scheduleIfNotReady(self, this.all, [callback]);
      if (!self.store) return this;

      const cb = self.fn(this.name, callback) || undefined;
      const store = self.db.transaction(self.record).objectStore(self.record);
      const results = [];

      store.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
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
      scheduleIfNotReady(self, this.keys, [callback]);
      if (!self.store) return this;

      const cb = self.fn(this.name, callback) || undefined;
      const store = self.db.transaction(self.record).objectStore(self.record);
      const keys = [];

      store.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
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
      scheduleIfNotReady(self, this.remove, [keyOrArray, callback]);
      if (!self.store) return this;

      const toDelete = self.isArray(keyOrArray) ? keyOrArray : [keyOrArray];
      const store = getObjectStore(self, READ_WRITE);
      toDelete.forEach(item => {
        const k = item && item.key ? item.key : item;
        store['delete'](k);
      });

      store.transaction.oncomplete = () => {
        if (callback) self.lambda(callback).call(self);
      };
      store.transaction.onabort = fail;
      return this;
    },

    nuke: function(callback) {
      const self = this;
      scheduleIfNotReady(self, this.nuke, [callback]);
      if (!self.store) return this;

      const win = callback ? () => self.lambda(callback).call(self) : () => {};

      try {
        const store = getObjectStore(self, READ_WRITE);
        store.clear();
        store.transaction.oncomplete = win;
        store.transaction.onabort = fail;
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

  /** Log errors from IndexedDB operations */
  function fail(e) {
    console.error('error in indexed-db adapter!', e);
  }

  /** Determine if auto‑increment should be used */
  function useAutoIncrement() {
    // using preliminary mozilla implementation which doesn't support
    // auto‑generated keys. Neither do some webkit implementations.
    return !!window.indexedDB;
  }

  /** Retrieve a single record */
  function getSingle(self, key, callback) {
    const req = self.db.transaction(self.record).objectStore(self.record).get(key);
    req.onsuccess = (e) => {
      req.onsuccess = req.onerror = null;
      const result = e.target.result;
      if (callback) {
        if (result) result.key = key;
        self.lambda(callback).call(self, result);
      }
    };
    req.onerror = (e) => {
      req.onsuccess = req.onerror = null;
      fail(e);
    };
    return self;
  }

  /** Retrieve multiple records */
  function getMultiple(self, keys, callback) {
    const results = new Array(keys.length);
    let remaining = keys.length;

    const collect = (index, obj) => {
      results[index] = obj;
      if (--remaining === 0 && callback) {
        self.lambda(callback).call(self, results);
      }
    };

    keys.forEach((k, i) => {
      self.get(k, (obj) => collect(i, obj));
    });
    return self;
  }

})());