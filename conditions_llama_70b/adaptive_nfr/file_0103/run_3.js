```javascript
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

  /**
   * Returns the IndexedDB instance.
   * @returns {IDBFactory} The IndexedDB instance.
   */
  const getIDB = () => {
    return window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;
  };

  /**
   * Returns the IDBTransaction instance.
   * @returns {IDBTransaction} The IDBTransaction instance.
   */
  const getIDBTransaction = () => {
    return window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.oIDBTransaction || window.msIDBTransaction;
  };

  /**
   * Returns the IDBKeyRange instance.
   * @returns {IDBKeyRange} The IDBKeyRange instance.
   */
  const getIDBKeyRange = () => {
    return window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.oIDBKeyRange || window.msIDBKeyRange;
  };

  // see https://groups.google.com/a/chromium.org/forum/?fromgroups#!topic/chromium-html5/OhsoAQLj7kc
  const READ_WRITE = (getIDBTransaction() && 'READ_WRITE' in getIDBTransaction()) ? getIDBTransaction().READ_WRITE : 'readwrite';

  return {
    /**
     * Checks if the adapter is valid.
     * @returns {boolean} True if the adapter is valid, false otherwise.
     */
    valid: () => {
      return !!getIDB();
    },

    /**
     * Initializes the adapter.
     * @param {object} options The options object.
     * @param {function} callback The callback function.
     */
    init: (options, callback) => {
      const self = this;
      const cb = self.fn(self.name, callback);

      if (cb && typeof cb !== 'function') {
        throw 'callback not valid';
      }

      self.waiting = [];

      self.idb = getIDB();
      const request = self.idb.open(self.name, STORE_VERSION);

      request.onerror = fail;
      request.onupgradeneeded = onupgradeneeded;
      request.onsuccess = onsuccess;

      /**
       * Handles the onupgradeneeded event.
       */
      function onupgradeneeded() {
        self.db = request.result;
        self.transaction = request.transaction;

        try {
          self.db.deleteObjectStore(self.record);
        } catch (e) { /* ignore */ }

        self.db.createObjectStore(self.record, {
          autoIncrement: useAutoIncrement()
        });
      }

      /**
       * Handles the onsuccess event.
       * @param {Event} event The event object.
       */
      function onsuccess(event) {
        self.db = event.target.result;
        self.store = true;

        while (self.waiting.length) {
          self.waiting.shift().call(self);
        }

        if (cb) {
          cb.call(self, self);
        }
      }
    },

    /**
     * Saves an object.
     * @param {object} obj The object to save.
     * @param {function} callback The callback function.
     * @returns {object} The adapter instance.
     */
    save: (obj, callback) => {
      const self = this;

      if (!self.store) {
        self.waiting.push(() => self.save(obj, callback));
        return self;
      }

      const objs = (self.isArray(obj) ? obj : [obj]).map(o => {
        if (!o.key) {
          o.key = self.uuid();
        }
        return o;
      });

      const win = (e) => {
        if (callback) {
          self.lambda(callback).call(self, self.isArray(obj) ? objs : objs[0]);
        }
      };

      const trans = self.db.transaction(self.record, READ_WRITE);
      const store = trans.objectStore(self.record);

      objs.forEach(o => {
        store.put(o, o.key);
      });

      store.transaction.oncomplete = win;
      store.transaction.onabort = fail;

      return self;
    },

    /**
     * Saves multiple objects.
     * @param {array} objs The objects to save.
     * @param {function} callback The callback function.
     * @returns {object} The adapter instance.
     */
    batch: (objs, callback) => {
      return this.save(objs, callback);
    },

    /**
     * Retrieves an object by key.
     * @param {string} key The key of the object to retrieve.
     * @param {function} callback The callback function.
     * @returns {object} The adapter instance.
     */
    get: (key, callback) => {
      const self = this;

      if (!self.store) {
        self.waiting.push(() => self.get(key, callback));
        return self;
      }

      const win = (e) => {
        const r = e.target.result;
        if (callback) {
          if (r) {
            r.key = key;
          }
          self.lambda(callback).call(self, r);
        }
      };

      if (!self.isArray(key)) {
        const req = self.db.transaction(self.record).objectStore(self.record).get(key);

        req.onsuccess = (event) => {
          req.onsuccess = req.onerror = null;
          win(event);
        };
        req.onerror = (event) => {
          req.onsuccess = req.onerror = null;
          fail(event);
        };
      } else {
        const results = [];
        const done = key.length;
        const keys = key;

        const getOne = (i) => {
          self.get(keys[i], (obj) => {
            results[i] = obj;
            if ((--done) > 0) {
              return;
            }
            if (callback) {
              self.lambda(callback).call(self, results);
            }
          });
        };

        keys.forEach((key, i) => {
          getOne(i);
        });
      }

      return self;
    },

    /**
     * Checks if an object exists.
     * @param {string} key The key of the object to check.
     * @param {function} callback The callback function.
     * @returns {object} The adapter instance.
     */
    exists: (key, callback) => {
      const self = this;

      if (!self.store) {
        self.waiting.push(() => self.exists(key, callback));
        return self;
      }

      const req = self.db.transaction(self.record).objectStore(self.record).openCursor(getIDBKeyRange().only(key));

      req.onsuccess = (event) => {
        req.onsuccess = req.onerror = null;
        const undef;
        self.lambda(callback).call(self, event.target.result !== null && event.target.result !== undef);
      };
      req.onerror = (event) => {
        req.onsuccess = req.onerror = null;
        fail(event);
      };

      return self;
    },

    /**
     * Retrieves all objects.
     * @param {function} callback The callback function.
     * @returns {object} The adapter instance.
     */
    all: (callback) => {
      const self = this;

      if (!self.store) {
        self.waiting.push(() => self.all(callback));
        return self;
      }

      const cb = self.fn(self.name, callback) || undefined;
      const objectStore = self.db.transaction(self.record).objectStore(self.record);
      const toReturn = [];

      objectStore.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          toReturn.push(cursor.value);
          cursor['continue']();
        } else {
          if (cb) {
            cb.call(self, toReturn);
          }
        }
      };

      return self;
    },

    /**
     * Retrieves all keys.
     * @param {function} callback The callback function.
     * @returns {object} The adapter instance.
     */
    keys: (callback) => {
      const self = this;

      if (!self.store) {
        self.waiting.push(() => self.keys(callback));
        return self;
      }

      const cb = self.fn(self.name, callback) || undefined;
      const objectStore = self.db.transaction(self.record).objectStore(self.record);
      const toReturn = [];

      objectStore.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          toReturn.push(cursor.key);
          cursor['continue']();
        } else {
          if (cb) {
            cb.call(self, toReturn);
          }
        }
      };

      return self;
    },

    /**
     * Removes an object.
     * @param {string} keyOrArray The key or array of keys to remove.
     * @param {function} callback The callback function.
     * @returns {object} The adapter instance.
     */
    remove: (keyOrArray, callback) => {
      const self = this;

      if (!self.store) {
        self.waiting.push(() => self.remove(keyOrArray, callback));
        return self;
      }

      const toDelete = self.isArray(keyOrArray) ? keyOrArray : [keyOrArray];
      const win = () => {
        if (callback) {
          self.lambda(callback).call(self);
        }
      };

      const os = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);

      toDelete.forEach((key) => {
        os['delete'](key.key ? key.key : key);
      });

      os.transaction.oncomplete = win;
      os.transaction.onabort = fail;

      return self;
    },

    /**
     * Removes all objects.
     * @param {function} callback The callback function.
     * @returns {object} The adapter instance.
     */
    nuke: (callback) => {
      const self = this;

      if (!self.store) {
        self.waiting.push(() => self.nuke(callback));
        return self;
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

      return self;
    }
  };

  /**
   * Handles errors.
   * @param {Error} e The error object.
   * @param {object} i The index object.
   */
  function fail(e, i) {
    console.error('error in indexed-db adapter!', e, i);
  }

  /**
   * Checks if auto increment is supported.
   * @returns {boolean} True if auto increment is supported, false otherwise.
   */
  function useAutoIncrement() {
    return !!window.indexedDB;
  }

})());
```