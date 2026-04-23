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

  const getIDB = () =>
    window.indexedDB ||
    window.webkitIndexedDB ||
    window.mozIndexedDB ||
    window.oIndexedDB ||
    window.msIndexedDB;

  const getIDBTransaction = () =>
    window.IDBTransaction ||
    window.webkitIDBTransaction ||
    window.mozIDBTransaction ||
    window.oIDBTransaction ||
    window.msIDBTransaction;

  const getIDBKeyRange = () =>
    window.IDBKeyRange ||
    window.webkitIDBKeyRange ||
    window.mozIDBKeyRange ||
    window.oIDBKeyRange ||
    window.msIDBKeyRange;

  // see https://groups.google.com/a/chromium.org/forum/?fromgroups#!topic/chromium-html5/OhsoAQLj7kc
  const READ_WRITE = (getIDBTransaction() && 'READ_WRITE' in getIDBTransaction())
    ? getIDBTransaction().READ_WRITE
    : 'readwrite';

  /** Guard: ensure callback is a function if defined */
  function isValidCallback(cb) {
    return typeof cb === 'function';
  }

  /** Guard: check if value is an array */
  function isArray(value) {
    return Array.isArray(value);
  }

  /** Guard: check if a key is provided */
  function hasKey(key) {
    return key !== undefined && key !== null;
  }

  /** Guard: check if a callback exists */
  function hasCallback(callback) {
    return typeof callback === 'function';
  }

  /** Guard: check if store is ready */
  function isStoreReady(adapter) {
    return !!adapter.store;
  }

  /** Guard: check if result is defined */
  function isResultDefined(result) {
    return result !== undefined && result !== null;
  }

  /** Helper: generate a UUID */
  function generateUuid(adapter) {
    return adapter.uuid();
  }

  /** Helper: determine auto‑increment usage */
  function useAutoIncrement() {
    // using preliminary mozilla implementation which doesn't support
    // auto‑generated keys. Neither do some webkit implementations.
    return !!window.indexedDB;
  }

  /** Helper: fail fast on errors */
  function fail(e) {
    console.error('error in indexed-db adapter!', e);
  }

  /** Guard: early‑return if store not ready and queue operation */
  function ensureStoreReady(adapter, operation) {
    if (!isStoreReady(adapter)) {
      adapter.waiting.push(operation);
      return false;
    }
    return true;
  }

  /** Guard: early‑return if callback is invalid */
  function ensureValidCallback(callback) {
    if (callback && !isValidCallback(callback)) {
      throw 'callback not valid';
    }
  }

  /** Guard: early‑return if key array is empty */
  function isEmptyArray(arr) {
    return isArray(arr) && arr.length === 0;
  }

  /** Predicate: determine if a request result exists */
  function requestResultExists(event) {
    const result = event.target.result;
    return result !== null && result !== undefined;
  }

  return {
    valid: function () {
      return !!getIDB();
    },

    init: function (options, callback) {
      const self = this;
      const cb = self.fn(self.name, callback);
      ensureValidCallback(cb);

      // queues pending operations
      self.waiting = [];

      // open idb
      self.idb = getIDB();
      const request = self.idb.open(self.name, STORE_VERSION);

      request.onerror = fail;
      request.onupgradeneeded = () => handleUpgrade(self, request);
      request.onsuccess = (event) => handleSuccess(self, event, cb);
    },

    save: function (obj, callback) {
      const self = this;
      if (!ensureStoreReady(self, () => self.save(obj, callback))) {
        return this;
      }

      const items = isArray(obj) ? obj : [obj];
      const prepared = items.map((o) => {
        if (!o.key) {
          o.key = generateUuid(self);
        }
        return o;
      });

      const trans = self.db.transaction(self.record, READ_WRITE);
      const store = trans.objectStore(self.record);

      for (const item of prepared) {
        store.put(item, item.key);
      }

      store.transaction.oncomplete = () => {
        if (hasCallback(callback)) {
          self.lambda(callback).call(self, isArray(obj) ? prepared : prepared[0]);
        }
      };
      store.transaction.onabort = fail;

      return this;
    },

    batch: function (objs, callback) {
      return this.save(objs, callback);
    },

    get: function (key, callback) {
      const self = this;
      if (!ensureStoreReady(self, () => self.get(key, callback))) {
        return this;
      }

      const win = (event) => {
        const result = event.target.result;
        if (hasCallback(callback)) {
          if (isResultDefined(result)) {
            result.key = key;
          }
          self.lambda(callback).call(self, result);
        }
      };

      if (!isArray(key)) {
        const req = self.db.transaction(self.record).objectStore(self.record).get(key);
        req.onsuccess = (event) => {
          req.onsuccess = req.onerror = null;
          win(event);
        };
        req.onerror = (event) => {
          req.onsuccess = req.onerror = null;
          fail(event);
        };
        return this;
      }

      // Multiple keys
      const results = new Array(key.length);
      let remaining = key.length;

      const handleOne = (index) => {
        self.get(key[index], (obj) => {
          results[index] = obj;
          remaining -= 1;
          if (remaining === 0 && hasCallback(callback)) {
            self.lambda(callback).call(self, results);
          }
        });
      };

      key.forEach((_, i) => handleOne(i));
      return this;
    },

    exists: function (key, callback) {
      const self = this;
      if (!ensureStoreReady(self, () => self.exists(key, callback))) {
        return this;
      }

      const req = self.db
        .transaction(self.record)
        .objectStore(self.record)
        .openCursor(getIDBKeyRange().only(key));

      req.onsuccess = (event) => {
        req.onsuccess = req.onerror = null;
        const exists = requestResultExists(event);
        self.lambda(callback).call(self, exists);
      };
      req.onerror = (event) => {
        req.onsuccess = req.onerror = null;
        fail(event);
      };
      return this;
    },

    all: function (callback) {
      const self = this;
      if (!ensureStoreReady(self, () => self.all(callback))) {
        return this;
      }

      const cb = self.fn(self.name, callback) || undefined;
      const objectStore = self.db.transaction(self.record).objectStore(self.record);
      const items = [];

      objectStore.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          items.push(cursor.value);
          cursor['continue']();
        } else if (cb) {
          cb.call(self, items);
        }
      };
      return this;
    },

    keys: function (callback) {
      const self = this;
      if (!ensureStoreReady(self, () => self.keys(callback))) {
        return this;
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

    remove: function (keyOrArray, callback) {
      const self = this;
      if (!ensureStoreReady(self, () => self.remove(keyOrArray, callback))) {
        return this;
      }

      const toDelete = isArray(keyOrArray) ? keyOrArray : [keyOrArray];
      const os = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);

      for (const item of toDelete) {
        const delKey = item && item.key ? item.key : item;
        os['delete'](delKey);
      }

      os.transaction.oncomplete = () => {
        if (hasCallback(callback)) {
          self.lambda(callback).call(self);
        }
      };
      os.transaction.onabort = fail;
      return this;
    },

    nuke: function (callback) {
      const self = this;
      if (!ensureStoreReady(self, () => self.nuke(callback))) {
        return this;
      }

      const win = hasCallback(callback)
        ? () => self.lambda(callback).call(self)
        : () => {};

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

  /** Handle database upgrade */
  function handleUpgrade(adapter, request) {
    adapter.db = request.result;
    adapter.transaction = request.transaction;

    // NB! in case of a version conflict, we don't try to migrate,
    // instead just throw away the old store and create a new one.
    try {
      adapter.db.deleteObjectStore(adapter.record);
    } catch (_) {
      /* ignore */
    }

    adapter.db.createObjectStore(adapter.record, {
      autoIncrement: useAutoIncrement()
    });
  }

  /** Handle successful database open */
  function handleSuccess(adapter, event, cb) {
    adapter.db = event.target.result;
    adapter.store = true;

    while (adapter.waiting.length) {
      adapter.waiting.shift().call(adapter);
    }

    if (cb) {
      cb.call(adapter, adapter);
    }
  }
})());