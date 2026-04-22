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

  const getIDB = () => {
    return window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;
  };

  const getIDBTransaction = () => {
    return window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.oIDBTransaction || window.msIDBTransaction;
  };

  const getIDBKeyRange = () => {
    return window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.oIDBKeyRange || window.msIDBKeyRange;
  };

  // see https://groups.google.com/a/chromium.org/forum/?fromgroups#!topic/chromium-html5/OhsoAQLj7kc
  const READ_WRITE = (() => {
    const txn = getIDBTransaction();
    if (txn && 'READ_WRITE' in txn) {
      return txn.READ_WRITE;
    }
    return 'readwrite';
  })();

  /**
   * Determines whether the result from a cursor is defined.
   * @param {*} result - The cursor result.
   * @returns {boolean} True if result is neither null nor undefined.
   */
  function isResultDefined(result) {
    return result !== null && result !== undefined;
  }

  /**
   * Guard clause to validate callback type.
   * @param {*} cb - Callback to validate.
   * @throws Will throw if callback is defined but not a function.
   */
  function validateCallback(cb) {
    if (cb && typeof cb !== 'function') {
      throw 'callback not valid';
    }
  }

  /**
   * Handles successful get for a single key.
   * @param {Object} self - Adapter instance.
   * @param {*} key - Requested key.
   * @param {Function} callback - User callback.
   * @param {Event} event - Success event.
   */
  function handleGetSuccess(self, key, callback, event) {
    const result = event.target.result;
    if (!callback) return;
    if (result) result.key = key;
    self.lambda(callback).call(self, result);
  }

  /**
   * Handles successful existence check.
   * @param {Object} self - Adapter instance.
   * @param {Function} callback - User callback.
   * @param {Event} event - Success event.
   */
  function handleExistsSuccess(self, callback, event) {
    const defined = isResultDefined(event.target.result);
    self.lambda(callback).call(self, defined);
  }

  /**
   * Handles multiple get operations.
   * @param {Object} self - Adapter instance.
   * @param {Array} keys - Array of keys.
   * @param {Function} callback - User callback.
   */
  function handleMultipleGet(self, keys, callback) {
    const results = new Array(keys.length);
    let remaining = keys.length;

    const onItem = (index, obj) => {
      results[index] = obj;
      if (--remaining === 0 && callback) {
        self.lambda(callback).call(self, results);
      }
    };

    keys.forEach((k, i) => {
      self.get(k, (obj) => onItem(i, obj));
    });
  }

  return {
    valid: function () {
      return !!getIDB();
    },

    init: function (options, callback) {
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
      const self = this;
      if (!this.store) {
        this.waiting.push(() => this.save(obj, callback));
        return;
      }

      const objects = (this.isArray(obj) ? obj : [obj]).map((o) => {
        if (!o.key) o.key = self.uuid();
        return o;
      });

      const onComplete = () => {
        if (callback) {
          self.lambda(callback).call(self, this.isArray(obj) ? objects : objects[0]);
        }
      };

      const transaction = this.db.transaction(this.record, READ_WRITE);
      const store = transaction.objectStore(this.record);

      for (let i = 0; i < objects.length; i++) {
        const o = objects[i];
        store.put(o, o.key);
      }

      store.transaction.oncomplete = onComplete;
      store.transaction.onabort = fail;

      return this;
    },

    batch: function (objs, callback) {
      return this.save(objs, callback);
    },

    get: function (key, callback) {
      if (!this.store) {
        this.waiting.push(() => this.get(key, callback));
        return;
      }

      if (!this.isArray(key)) {
        const req = this.db.transaction(this.record).objectStore(this.record).get(key);
        req.onsuccess = (e) => {
          req.onsuccess = req.onerror = null;
          handleGetSuccess(this, key, callback, e);
        };
        req.onerror = (e) => {
          req.onsuccess = req.onerror = null;
          fail(e);
        };
      } else {
        handleMultipleGet(this, key, callback);
      }

      return this;
    },

    exists: function (key, callback) {
      if (!this.store) {
        this.waiting.push(() => this.exists(key, callback));
        return;
      }

      const req = this.db.transaction(this.record).objectStore(this.record).openCursor(getIDBKeyRange().only(key));

      req.onsuccess = (e) => {
        req.onsuccess = req.onerror = null;
        handleExistsSuccess(this, callback, e);
      };
      req.onerror = (e) => {
        req.onsuccess = req.onerror = null;
        fail(e);
      };

      return this;
    },

    all: function (callback) {
      if (!this.store) {
        this.waiting.push(() => this.all(callback));
        return;
      }
      const cb = this.fn(this.name, callback) || undefined;
      const self = this;
      const objectStore = this.db.transaction(this.record).objectStore(this.record);
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

    keys: function (callback) {
      if (!this.store) {
        this.waiting.push(() => this.keys(callback));
        return;
      }
      const cb = this.fn(this.name, callback) || undefined;
      const self = this;
      const objectStore = this.db.transaction(this.record).objectStore(this.record);
      const results = [];

      objectStore.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          results.push(cursor.key);
          cursor['continue']();
        } else if (cb) {
          cb.call(self, results);
        }
      };
      return this;
    },

    remove: function (keyOrArray, callback) {
      if (!this.store) {
        this.waiting.push(() => this.remove(keyOrArray, callback));
        return;
      }

      const self = this;
      const toDelete = this.isArray(keyOrArray) ? keyOrArray : [keyOrArray];

      const onComplete = () => {
        if (callback) self.lambda(callback).call(self);
      };

      const objectStore = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);

      toDelete.forEach((item) => {
        const delKey = item && item.key ? item.key : item;
        objectStore['delete'](delKey);
      });

      objectStore.transaction.oncomplete = onComplete;
      objectStore.transaction.onabort = fail;

      return this;
    },

    nuke: function (callback) {
      if (!this.store) {
        this.waiting.push(() => this.nuke(callback));
        return;
      }

      const self = this;
      const win = callback ? () => self.lambda(callback).call(self) : () => { };

      try {
        const objectStore = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);
        objectStore.clear();
        objectStore.transaction.oncomplete = win;
        objectStore.transaction.onabort = fail;
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