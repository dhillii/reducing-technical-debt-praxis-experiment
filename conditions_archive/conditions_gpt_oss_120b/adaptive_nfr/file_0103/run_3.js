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
  const READ_WRITE = (getIDBTransaction() && 'READ_WRITE' in getIDBTransaction())
    ? getIDBTransaction().READ_WRITE
    : 'readwrite';

  /**
   * Guard: ensure the adapter store is ready; otherwise queue the operation.
   * @param {object} self - adapter instance
   * @param {Function} fn - operation to queue
   * @returns {boolean} true if store is ready, false otherwise
   */
  function guardStoreReady(self, fn) {
    if (!self.store) {
      self.waiting.push(fn);
      return false;
    }
    return true;
  }

  /**
   * Predicate: checks whether a value is an array.
   * @param {*} val
   * @returns {boolean}
   */
  function isArray(val) {
    return Array.isArray(val);
  }

  /**
   * Predicate: determines if a callback is a function.
   * @param {*} cb
   * @returns {boolean}
   */
  function isFunction(cb) {
    return typeof cb === 'function';
  }

  return {
    valid: function () {
      return !!getIDB();
    },

    init: function (options, callback) {
      const self = this;
      const cb = self.fn(self.name, callback);
      if (cb && !isFunction(cb)) {
        throw 'callback not valid';
      }

      // queues pending operations
      self.waiting = [];

      // open idb
      self.idb = getIDB();
      const request = self.idb.open(self.name, STORE_VERSION);

      // attach callback handlers
      request.onerror = fail;
      request.onupgradeneeded = onupgradeneeded;
      request.onsuccess = onsuccess;

      function onupgradeneeded() {
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

      function onsuccess(event) {
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

    save: function (obj, callback) {
      const self = this;
      if (!guardStoreReady(self, () => self.save(obj, callback))) {
        return;
      }

      const objects = (isArray(obj) ? obj : [obj]).map(o => {
        if (!o.key) {
          o.key = self.uuid();
        }
        return o;
      });

      const win = () => {
        if (callback) {
          self.lambda(callback).call(self, isArray(obj) ? objects : objects[0]);
        }
      };

      const trans = this.db.transaction(this.record, READ_WRITE);
      const store = trans.objectStore(this.record);
      objects.forEach(o => store.put(o, o.key));

      store.transaction.oncomplete = win;
      store.transaction.onabort = fail;

      return this;
    },

    batch: function (objs, callback) {
      return this.save(objs, callback);
    },

    get: function (key, callback) {
      const self = this;
      if (!guardStoreReady(self, () => self.get(key, callback))) {
        return;
      }

      const win = event => {
        const result = event.target.result;
        if (callback) {
          if (result) {
            result.key = key;
          }
          self.lambda(callback).call(self, result);
        }
      };

      if (!isArray(key)) {
        const req = this.db.transaction(this.record).objectStore(this.record).get(key);
        req.onsuccess = e => {
          req.onsuccess = req.onerror = null;
          win(e);
        };
        req.onerror = e => {
          req.onsuccess = req.onerror = null;
          fail(e);
        };
      } else {
        const results = [];
        let remaining = key.length;
        const keys = key;

        const getOne = i => {
          self.get(keys[i], obj => {
            results[i] = obj;
            if (--remaining > 0) {
              return;
            }
            if (callback) {
              self.lambda(callback).call(self, results);
            }
          });
        };

        keys.forEach((_, i) => getOne(i));
      }

      return this;
    },

    exists: function (key, callback) {
      const self = this;
      if (!guardStoreReady(self, () => self.exists(key, callback))) {
        return;
      }

      const req = this.db.transaction(self.record).objectStore(this.record).openCursor(getIDBKeyRange().only(key));

      req.onsuccess = event => {
        req.onsuccess = req.onerror = null;
        const undef = undefined;
        const exists = event.target.result !== null && event.target.result !== undef;
        self.lambda(callback).call(self, exists);
      };
      req.onerror = event => {
        req.onsuccess = req.onerror = null;
        fail(event);
      };

      return this;
    },

    all: function (callback) {
      const self = this;
      if (!guardStoreReady(self, () => self.all(callback))) {
        return;
      }

      const cb = this.fn(this.name, callback) || undefined;
      const objectStore = this.db.transaction(this.record).objectStore(this.record);
      const toReturn = [];

      objectStore.openCursor().onsuccess = event => {
        const cursor = event.target.result;
        if (cursor) {
          toReturn.push(cursor.value);
          cursor['continue']();
        } else if (cb) {
          cb.call(self, toReturn);
        }
      };

      return this;
    },

    keys: function (callback) {
      const self = this;
      if (!guardStoreReady(self, () => self.keys(callback))) {
        return;
      }

      const cb = this.fn(this.name, callback) || undefined;
      const objectStore = this.db.transaction(this.record).objectStore(this.record);
      const toReturn = [];

      objectStore.openCursor().onsuccess = event => {
        const cursor = event.target.result;
        if (cursor) {
          toReturn.push(cursor.key);
          cursor['continue']();
        } else if (cb) {
          cb.call(self, toReturn);
        }
      };

      return this;
    },

    remove: function (keyOrArray, callback) {
      const self = this;
      if (!guardStoreReady(self, () => self.remove(keyOrArray, callback))) {
        return;
      }

      const toDelete = isArray(keyOrArray) ? keyOrArray : [keyOrArray];
      const win = () => {
        if (callback) {
          self.lambda(callback).call(self);
        }
      };

      const os = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);
      toDelete.forEach(item => {
        const delKey = item && item.key ? item.key : item;
        os['delete'](delKey);
      });

      os.transaction.oncomplete = win;
      os.transaction.onabort = fail;

      return this;
    },

    nuke: function (callback) {
      const self = this;
      if (!guardStoreReady(self, () => self.nuke(callback))) {
        return;
      }

      const win = callback ? () => self.lambda(callback).call(self) : () => { };

      try {
        const os = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);
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

  //
  // Helper functions
  //

  function fail(e, i) {
    console.error('error in indexed-db adapter!', e, i);
  }

  function useAutoIncrement() {
    // using preliminary mozilla implementation which doesn't support
    // auto-generated keys.  Neither do some webkit implementations.
    return !!window.indexedDB;
  }

})());