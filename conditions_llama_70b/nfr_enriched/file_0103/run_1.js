Lawnchair.adapter('indexed-db', (function(){

  // update the STORE_VERSION when the schema used by this adapter changes
  // (for example, if you change the STORE_NAME above)
  // NB: Causes onupgradeneeded to be fired, which erases the old database!
  const STORE_VERSION = 3;

  /**
   * Retrieves the IndexedDB object.
   * @returns {IDBFactory} The IndexedDB object.
   */
  const getIDB = () => {
    return window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;
  };

  /**
   * Retrieves the IDBTransaction object.
   * @returns {IDBTransaction} The IDBTransaction object.
   */
  const getIDBTransaction = () => {
    return window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.oIDBTransaction || window.msIDBTransaction;
  };

  /**
   * Retrieves the IDBKeyRange object.
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

      for (const o of objs) {
        store.put(o, o.key);
      }

      store.transaction.oncomplete = win;
      store.transaction.onabort = fail;

      return self;
    },

    /**
     * Saves multiple objects to the IndexedDB store.
     * @param {array} objs The objects to save.
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

        for (let i = 0, l = keys.length; i < l; i++) {
          getOne(i);
        }
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

      const toDelete = keyOrArray;
      if (!self.isArray(keyOrArray)) {
        toDelete = [keyOrArray];
      }

      const win = () => {
        if (callback) {
          self.lambda(callback).call(self);
        }
      };

      const os = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);

      for (const key of toDelete) {
        os['delete'](key);
      }

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
   * @param {number} i The index.
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