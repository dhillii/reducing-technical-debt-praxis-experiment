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
  const READ_WRITE = (() => {
    const txn = getIDBTransaction();
    return txn && 'READ_WRITE' in txn ? txn.READ_WRITE : 'readwrite';
  })();

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
        } catch (e) {
          /* ignore */
        }

        // create object store.
        self.db.createObjectStore(self.record, {
          autoIncrement: useAutoIncrement()
        });
      }

      function onSuccess(event) {
        self.db = event.target.result;
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
      if (!this.store) {
        this.waiting.push(() => this.save(obj, callback));
        return;
      }

      const objects = (this.isArray(obj) ? obj : [obj]).map(o => {
        if (!o.key) {
          o.key = this.uuid();
        }
        return o;
      });

      const onComplete = () => {
        if (callback) {
          this.lambda(callback).call(this, this.isArray(obj) ? objects : objects[0]);
        }
      };

      const transaction = this.db.transaction(this.record, READ_WRITE);
      const store = transaction.objectStore(this.record);

      for (const o of objects) {
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

      const self = this;

      const handleSingleKey = singleKey => {
        const request = self.db.transaction(self.record).objectStore(self.record).get(singleKey);
        request.onsuccess = event => {
          request.onsuccess = request.onerror = null;
          const result = event.target.result;
          if (callback) {
            if (result) {
              result.key = singleKey;
            }
            self.lambda(callback).call(self, result);
          }
        };
        request.onerror = event => {
          request.onsuccess = request.onerror = null;
          fail(event);
        };
      };

      const handleMultipleKeys = keysArray => {
        const results = new Array(keysArray.length);
        let remaining = keysArray.length;

        const onItemFetched = (index, obj) => {
          results[index] = obj;
          if (--remaining === 0 && callback) {
            self.lambda(callback).call(self, results);
          }
        };

        keysArray.forEach((k, i) => {
          self.get(k, obj => onItemFetched(i, obj));
        });
      };

      if (isSingleKey(key)) {
        handleSingleKey(key);
      } else {
        handleMultipleKeys(key);
      }

      return this;
    },

    exists: function (key, callback) {
      if (!this.store) {
        this.waiting.push(() => this.exists(key, callback));
        return;
      }

      const self = this;
      const request = this.db.transaction(self.record).objectStore(this.record).openCursor(getIDBKeyRange().only(key));

      request.onsuccess = event => {
        request.onsuccess = request.onerror = null;
        const exists = isCursorResultDefined(event);
        self.lambda(callback).call(self, exists);
      };
      request.onerror = event => {
        request.onsuccess = request.onerror = null;
        fail(event);
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

      objectStore.openCursor().onsuccess = event => {
        const cursor = event.target.result;
        if (hasCursor(cursor)) {
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
      const keys = [];

      objectStore.openCursor().onsuccess = event => {
        const cursor = event.target.result;
        if (hasCursor(cursor)) {
          keys.push(cursor.key);
          cursor['continue']();
        } else if (cb) {
          cb.call(self, keys);
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
        if (callback) {
          self.lambda(callback).call(self);
        }
      };

      const objectStore = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);

      for (const item of toDelete) {
        const delKey = item && item.key ? item.key : item;
        objectStore['delete'](delKey);
      }

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
      const onComplete = callback ? () => self.lambda(callback).call(self) : () => {};

      try {
        const objectStore = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);
        objectStore.clear();
        objectStore.transaction.oncomplete = onComplete;
        objectStore.transaction.onabort = fail;
      } catch (e) {
        if (e.name === 'NotFoundError') {
          onComplete();
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

  /**
   * Logs an error from the indexed‑db adapter.
   * @param {any} e - The error object.
   * @param {any} [i] - Optional additional info.
   */
  function fail(e, i) {
    console.error('error in indexed-db adapter!', e, i);
  }

  /**
   * Determines whether auto‑increment should be used.
   * @returns {boolean}
   */
  function useAutoIncrement() {
    // using preliminary mozilla implementation which doesn't support
    // auto‑generated keys. Neither do some webkit implementations.
    return !!window.indexedDB;
  }

  /**
   * Checks if the provided key is a single (non‑array) value.
   * @param {any} key
   * @returns {boolean}
   */
  function isSingleKey(key) {
    return !Array.isArray(key);
  }

  /**
   * Determines whether a cursor result is defined (not null/undefined).
   * @param {Event} event
   * @returns {boolean}
   */
  function isCursorResultDefined(event) {
    const result = event.target.result;
    return result !== null && result !== undefined;
  }

  /**
   * Checks whether a cursor object exists.
   * @param {IDBCursorWithValue|null} cursor
   * @returns {boolean}
   */
  function hasCursor(cursor) {
    return !!cursor;
  }

})());