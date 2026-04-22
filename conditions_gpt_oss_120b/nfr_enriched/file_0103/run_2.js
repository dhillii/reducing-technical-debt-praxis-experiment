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

  /**
   * Logs errors from IndexedDB operations.
   */
  function fail(e) {
    console.error('error in indexed-db adapter!', e);
  }

  /**
   * Determines whether the environment supports auto‑increment keys.
   */
  function useAutoIncrement() {
    // using preliminary mozilla implementation which doesn't support
    // auto‑generated keys. Neither do some webkit implementations.
    return !!window.indexedDB;
  }

  /**
   * Queues an operation until the database is ready.
   */
  function enqueueIfNotReady(self, fn) {
    if (!self.store) {
      self.waiting.push(fn);
      return true;
    }
    return false;
  }

  /**
   * Executes all queued operations after the database becomes ready.
   */
  function flushWaitingQueue(self) {
    while (self.waiting.length) {
      self.waiting.shift().call(self);
    }
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

      request.onerror = fail;
      request.onupgradeneeded = () => handleUpgrade(self, request);
      request.onsuccess = (event) => handleSuccess(self, event, cb);
    },

    save: function (obj, callback) {
      const self = this;
      if (enqueueIfNotReady(self, () => self.save(obj, callback))) return this;

      const items = (self.isArray(obj) ? obj : [obj]).map((o) => {
        if (!o.key) o.key = self.uuid();
        return o;
      });

      const transaction = self.db.transaction(self.record, READ_WRITE);
      const store = transaction.objectStore(self.record);

      items.forEach((item) => store.put(item, item.key));

      transaction.oncomplete = () => {
        if (callback) self.lambda(callback).call(self, self.isArray(obj) ? items : items[0]);
      };
      transaction.onabort = fail;

      return this;
    },

    batch: function (objs, callback) {
      return this.save(objs, callback);
    },

    get: function (key, callback) {
      const self = this;
      if (enqueueIfNotReady(self, () => self.get(key, callback))) return this;

      if (self.isArray(key)) {
        return getMultiple(self, key, callback);
      }

      const request = self.db.transaction(self.record).objectStore(self.record).get(key);
      request.onsuccess = (event) => {
        request.onsuccess = request.onerror = null;
        const result = event.target.result;
        if (callback) {
          if (result) result.key = key;
          self.lambda(callback).call(self, result);
        }
      };
      request.onerror = (event) => {
        request.onsuccess = request.onerror = null;
        fail(event);
      };
      return this;
    },

    exists: function (key, callback) {
      const self = this;
      if (enqueueIfNotReady(self, () => self.exists(key, callback))) return this;

      const range = getIDBKeyRange().only(key);
      const request = self.db.transaction(self.record).objectStore(self.record).openCursor(range);

      request.onsuccess = (event) => {
        request.onsuccess = request.onerror = null;
        const exists = !!event.target.result;
        self.lambda(callback).call(self, exists);
      };
      request.onerror = (event) => {
        request.onsuccess = request.onerror = null;
        fail(event);
      };
      return this;
    },

    all: function (callback) {
      const self = this;
      if (enqueueIfNotReady(self, () => self.all(callback))) return this;

      const cb = self.fn(self.name, callback) || undefined;
      const store = self.db.transaction(self.record).objectStore(self.record);
      const results = [];

      store.openCursor().onsuccess = (event) => {
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
      const self = this;
      if (enqueueIfNotReady(self, () => self.keys(callback))) return this;

      const cb = self.fn(self.name, callback) || undefined;
      const store = self.db.transaction(self.record).objectStore(self.record);
      const keys = [];

      store.openCursor().onsuccess = (event) => {
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
      if (enqueueIfNotReady(self, () => self.remove(keyOrArray, callback))) return this;

      const toDelete = self.isArray(keyOrArray) ? keyOrArray : [keyOrArray];
      const transaction = self.db.transaction(self.record, READ_WRITE);
      const store = transaction.objectStore(self.record);

      toDelete.forEach((item) => {
        const key = item && item.key ? item.key : item;
        store['delete'](key);
      });

      transaction.oncomplete = () => {
        if (callback) self.lambda(callback).call(self);
      };
      transaction.onabort = fail;
      return this;
    },

    nuke: function (callback) {
      const self = this;
      if (enqueueIfNotReady(self, () => self.nuke(callback))) return this;

      const win = callback ? () => self.lambda(callback).call(self) : () => {};

      try {
        const store = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);
        store.clear();
        store.transaction.oncomplete = win;
        store.transaction.onabort = fail;
      } catch (e) {
        if (e.name === 'NotFoundError') win();
        else fail(e);
      }
      return this;
    }
  };

  /**
   * Handles the IndexedDB upgrade event.
   */
  function handleUpgrade(self, request) {
    self.db = request.result;
    self.transaction = request.transaction;
    try {
      self.db.deleteObjectStore(self.record);
    } catch (_) { /* ignore */ }
    self.db.createObjectStore(self.record, { autoIncrement: useAutoIncrement() });
  }

  /**
   * Handles the IndexedDB open success event.
   */
  function handleSuccess(self, event, initCallback) {
    self.db = event.target.result;
    self.store = true;
    flushWaitingQueue(self);
    if (initCallback) initCallback.call(self, self);
  }

  /**
   * Retrieves multiple keys in parallel.
   */
  function getMultiple(self, keys, callback) {
    const results = new Array(keys.length);
    let remaining = keys.length;

    const collect = (index, value) => {
      results[index] = value;
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