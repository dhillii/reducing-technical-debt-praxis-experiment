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
   * Returns the IndexedDB object.
   * @returns {IDBFactory} The IndexedDB object.
   */
  const getIDB = () => {
    return window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;
  };

  /**
   * Returns the IDBTransaction object.
   * @returns {IDBTransaction} The IDBTransaction object.
   */
  const getIDBTransaction = () => {
    return window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.oIDBTransaction || window.msIDBTransaction;
  };

  /**
   * Returns the IDBKeyRange object.
   * @returns {IDBKeyRange} The IDBKeyRange object.
   */
  const getIDBKeyRange = () => {
    return window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.oIDBKeyRange || window.msIDBKeyRange;
  };

  // see https://groups.google.com/a/chromium.org/forum/?fromgroups#!topic/chromium-html5/OhsoAQLj7kc
  const READ_WRITE = (getIDBTransaction() && 'READ_WRITE' in getIDBTransaction()) ? getIDBTransaction().READ_WRITE : 'readwrite';

  return {
    /**
     * Checks if the IndexedDB adapter is valid.
     * @returns {boolean} True if the adapter is valid, false otherwise.
     */
    valid: () => {
      return !!getIDB();
    },

    /**
     * Initializes the IndexedDB adapter.
     * @param {object} options The options object.
     * @param {function} callback The callback function.
     */
    init: (options, callback) => {
      const self = this;
      const cb = self.fn(self.name, callback);

      if (!cb || typeof cb !== 'function') {
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

      /**
       * Handles the onupgradeneeded event.
       */
      function onupgradeneeded() {
        self.db = request.result;
        self.transaction = request.transaction;

        // NB! in case of a version conflict, we don't try to migrate,
        // instead just throw away the old store and create a new one.
        // this happens if somebody changed the 
        try {
          self.db.deleteObjectStore(self.record);
        } catch (e) { /* ignore */ }

        // create object store.
        self.db.createObjectStore(self.record, {
          autoIncrement: useAutoIncrement()
        });
      }

      /**
       * Handles the onsuccess event.
       * @param {Event} event The event object.
       */
      function onsuccess(event) {
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

    /**
     * Saves an object to the IndexedDB store.
     * @param {object} obj The object to save.
     * @param {function} callback The callback function.
     * @returns {object} The IndexedDB adapter.
     */
    save: (obj, callback) => {
      const self = this;

      if (!self.store) {
        self.waiting.push(() => self.save(obj, callback));
        return self;
      }

      const objs = (self.isArray(obj) ? obj : [obj]).map((o) => {
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

      objs.forEach((o) => {
        store.put(o, o.key);
      });

      store.transaction.oncomplete = win;
      store.transaction.onabort = fail;

      return self;
    },

    /**
     * Saves multiple objects to the IndexedDB store.
     * @param {object[]} objs The objects to save.
     * @param {function} callback The callback function.
     * @returns {object} The IndexedDB adapter.
     */
    batch: (objs, callback) => {
      return this.save(objs, callback);
    },

    /**
     * Retrieves an object from the IndexedDB store.
     * @param {string} key The key of the object to retrieve.
     * @param {function} callback The callback function.
     * @returns {object} The IndexedDB adapter.
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
     * Checks if an object exists in the IndexedDB store.
     * @param {string} key The key of the object to check.
     * @param {function} callback The callback function.
     * @returns {object} The IndexedDB adapter.
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
     * Retrieves all objects from the IndexedDB store.
     * @param {function} callback The callback function.
     * @returns {object} The IndexedDB adapter.
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
     * Retrieves all keys from the IndexedDB store.
     * @param {function} callback The callback function.
     * @returns {object} The IndexedDB adapter.
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
     * Removes an object from the IndexedDB store.
     * @param {string} keyOrArray The key or array of keys to remove.
     * @param {function} callback The callback function.
     * @returns {object} The IndexedDB adapter.
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
     * Clears the IndexedDB store.
     * @param {function} callback The callback function.
     * @returns {object} The IndexedDB adapter.
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
   * Checks if auto-increment is supported.
   * @returns {boolean} True if auto-increment is supported, false otherwise.
   */
  function useAutoIncrement() {
    return !!window.indexedDB;
  }

})());
```