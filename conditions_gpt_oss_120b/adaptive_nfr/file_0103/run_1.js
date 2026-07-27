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
    return txn && 'READ_WRITE' in txn ? txn.READ_WRITE : 'readwrite';
  })();

  /**
   * Determines whether the IndexedDB transaction object supports READ_WRITE.
   * @returns {boolean}
   */
  const hasReadWrite = () => {
    const txn = getIDBTransaction();
    return !!(txn && 'READ_WRITE' in txn);
  };

  /**
   * Checks if a cursor result is defined (not null or undefined).
   * @param {*} result
   * @returns {boolean}
   */
  const isResultDefined = (result) => {
    return result !== null && result !== undefined;
  };

  return {
    valid: function () {
      return !!getIDB();
    },

    init: function (options, callback) {
      const self = this;
      const cb = self.fn(self.name, callback);
      if (cb && typeof cb !== 'function') {
        throw new Error('callback not valid');
      }

      self.waiting = [];
      self.idb = getIDB();
      const request = self.idb.open(self.name, STORE_VERSION);

      request.onerror = fail;
      request.onupgradeneeded = () => handleUpgradeNeeded(self, request);
      request.onsuccess = (event) => handleSuccess(self, event, cb);
    },

    save: function (obj, callback) {
      const self = this;
      if (!self.store) {
        self.waiting.push(() => self.save(obj, callback));
        return this;
      }

      const objects = (self.isArray(obj) ? obj : [obj]).map((o) => {
        if (!o.key) {
          o.key = self.uuid();
        }
        return o;
      });

      const transaction = self.db.transaction(self.record, READ_WRITE);
      const store = transaction.objectStore(self.record);
      objects.forEach((o) => store.put(o, o.key));

      const onComplete = () => {
        if (callback) {
          self.lambda(callback).call(self, self.isArray(obj) ? objects : objects[0]);
        }
      };
      store.transaction.oncomplete = onComplete;
      store.transaction.onabort = fail;

      return this;
    },

    batch: function (objs, callback) {
      return this.save(objs, callback);
    },

    get: function (key, callback) {
      const self = this;
      if (!self.store) {
        self.waiting.push(() => self.get(key, callback));
        return this;
      }

      const handleResult = (event) => {
        const result = event.target.result;
        if (callback) {
          if (result) {
            result.key = key;
          }
          self.lambda(callback).call(self, result);
        }
      };

      if (!self.isArray(key)) {
        const req = self.db.transaction(self.record).objectStore(self.record).get(key);
        req.onsuccess = (event) => {
          req.onsuccess = req.onerror = null;
          handleResult(event);
        };
        req.onerror = (event) => {
          req.onsuccess = req.onerror = null;
          fail(event);
        };
      } else {
        const keys = key;
        const results = new Array(keys.length);
        let remaining = keys.length;

        const handleOne = (index) => {
          self.get(keys[index], (obj) => {
            results[index] = obj;
            remaining--;
            if (remaining === 0 && callback) {
              self.lambda(callback).call(self, results);
            }
          });
        };

        keys.forEach((_, i) => handleOne(i));
      }

      return this;
    },

    exists: function (key, callback) {
      const self = this;
      if (!self.store) {
        self.waiting.push(() => self.exists(key, callback));
        return this;
      }

      const req = self.db.transaction(self.record).objectStore(self.record).openCursor(getIDBKeyRange().only(key));

      const handleSuccess = (event) => {
        req.onsuccess = req.onerror = null;
        const exists = isResultDefined(event.target.result);
        self.lambda(callback).call(self, exists);
      };

      const handleError = (event) => {
        req.onsuccess = req.onerror = null;
        fail(event);
      };

      req.onsuccess = handleSuccess;
      req.onerror = handleError;

      return this;
    },

    all: function (callback) {
      const self = this;
      if (!self.store) {
        self.waiting.push(() => self.all(callback));
        return this;
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

    keys: function (callback) {
      const self = this;
      if (!self.store) {
        self.waiting.push(() => self.keys(callback));
        return this;
      }

      const cb = self.fn(self.name, callback) || undefined;
      const objectStore = self.db.transaction(self.record).objectStore(self.record);
      const keysArr = [];

      objectStore.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          keysArr.push(cursor.key);
          cursor['continue']();
        } else if (cb) {
          cb.call(self, keysArr);
        }
      };

      return this;
    },

    remove: function (keyOrArray, callback) {
      const self = this;
      if (!self.store) {
        self.waiting.push(() => self.remove(keyOrArray, callback));
        return this;
      }

      const toDelete = self.isArray(keyOrArray) ? keyOrArray : [keyOrArray];

      const win = () => {
        if (callback) {
          self.lambda(callback).call(self);
        }
      };

      const objectStore = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);
      toDelete.forEach((item) => {
        const delKey = item && item.key ? item.key : item;
        objectStore['delete'](delKey);
      });

      objectStore.transaction.oncomplete = win;
      objectStore.transaction.onabort = fail;

      return this;
    },

    nuke: function (callback) {
      const self = this;
      if (!self.store) {
        self.waiting.push(() => self.nuke(callback));
        return this;
      }

      const win = callback ? () => self.lambda(callback).call(self) : () => {};

      try {
        const objectStore = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);
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

  /**
   * Handles the onupgradeneeded event.
   * @param {*} self
   * @param {*} request
   */
  function handleUpgradeNeeded(self, request) {
    self.db = request.result;
    self.transaction = request.transaction;
    try {
      self.db.deleteObjectStore(self.record);
    } catch (e) {
      /* ignore */
    }
    self.db.createObjectStore(self.record, {
      autoIncrement: useAutoIncrement()
    });
  }

  /**
   * Handles the onsuccess event for opening the database.
   * @param {*} self
   * @param {*} event
   * @param {*} cb
   */
  function handleSuccess(self, event, cb) {
    self.db = event.target.result;
    self.store = true;
    while (self.waiting.length) {
      const fn = self.waiting.shift();
      fn.call(self);
    }
    if (cb) {
      cb.call(self, self);
    }
  }

})());