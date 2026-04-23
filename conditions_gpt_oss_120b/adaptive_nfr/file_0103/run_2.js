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
  const READ_WRITE = (getIDBTransaction() && 'READ_WRITE' in getIDBTransaction())
      ? getIDBTransaction().READ_WRITE
      : 'readwrite';

  /**
   * Checks whether a callback is a function.
   * @param {*} cb
   * @returns {boolean}
   */
  function isFunction(cb) {
      return typeof cb === 'function';
  }

  /**
   * Determines if the result from an IndexedDB request is defined.
   * @param {Event} event
   * @returns {boolean}
   */
  function isResultDefined(event) {
      const result = event.target.result;
      return result !== null && result !== undefined;
  }

  /**
   * Guard for store readiness.
   * @param {object} adapter
   * @param {Function} enqueue
   * @returns {boolean} true if operation should be deferred
   */
  function deferIfNotReady(adapter, enqueue) {
      if (!adapter.store) {
          adapter.waiting.push(enqueue);
          return true;
      }
      return false;
  }

  return {
    valid: function() {
        return !!getIDB();
    },

    init: function(options, callback) {
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
        request.onupgradeneeded = () => handleUpgrade(self, request);
        request.onsuccess = (event) => handleSuccess(self, event, cb);
    },

    save: function(obj, callback) {
        const self = this;
        if (deferIfNotReady(this, () => this.save(obj, callback))) {
            return;
        }

        const items = this.isArray(obj) ? obj : [obj];
        const objs = items.map(o => {
            if (!o.key) {
                o.key = self.uuid();
            }
            return o;
        });

        const onComplete = () => {
            if (callback) {
                self.lambda(callback).call(self, this.isArray(obj) ? objs : objs[0]);
            }
        };

        const transaction = this.db.transaction(this.record, READ_WRITE);
        const store = transaction.objectStore(this.record);
        for (let i = 0; i < objs.length; i++) {
            const o = objs[i];
            store.put(o, o.key);
        }
        store.transaction.oncomplete = onComplete;
        store.transaction.onabort = fail;

        return this;
    },

    batch: function (objs, callback) {
        return this.save(objs, callback);
    },

    get: function(key, callback) {
        if (deferIfNotReady(this, () => this.get(key, callback))) {
            return;
        }

        const self = this;
        const onSuccess = (event) => {
            const result = event.target.result;
            if (callback) {
                if (result) {
                    result.key = key;
                }
                self.lambda(callback).call(self, result);
            }
        };

        if (!this.isArray(key)) {
            const request = this.db.transaction(this.record).objectStore(this.record).get(key);
            request.onsuccess = (event) => {
                request.onsuccess = request.onerror = null;
                onSuccess(event);
            };
            request.onerror = (event) => {
                request.onsuccess = request.onerror = null;
                fail(event);
            };
        } else {
            const keys = key;
            const results = new Array(keys.length);
            let remaining = keys.length;

            const collectResult = (index, obj) => {
                results[index] = obj;
                if (--remaining === 0 && callback) {
                    self.lambda(callback).call(self, results);
                }
            };

            for (let i = 0; i < keys.length; i++) {
                this.get(keys[i], (obj) => collectResult(i, obj));
            }
        }

        return this;
    },

    exists: function(key, callback) {
        if (deferIfNotReady(this, () => this.exists(key, callback))) {
            return;
        }

        const self = this;
        const request = this.db.transaction(self.record)
            .objectStore(this.record)
            .openCursor(getIDBKeyRange().only(key));

        request.onsuccess = (event) => {
            request.onsuccess = request.onerror = null;
            const exists = isResultDefined(event);
            self.lambda(callback).call(self, exists);
        };
        request.onerror = (event) => {
            request.onsuccess = request.onerror = null;
            fail(event);
        };

        return this;
    },

    all: function(callback) {
        if (deferIfNotReady(this, () => this.all(callback))) {
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

    keys: function(callback) {
        if (deferIfNotReady(this, () => this.keys(callback))) {
            return;
        }

        const cb = this.fn(this.name, callback) || undefined;
        const self = this;
        const objectStore = this.db.transaction(this.record).objectStore(this.record);
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

    remove: function(keyOrArray, callback) {
        if (deferIfNotReady(this, () => this.remove(keyOrArray, callback))) {
            return;
        }

        const self = this;
        const toDelete = this.isArray(keyOrArray) ? keyOrArray : [keyOrArray];

        const onComplete = () => {
            if (callback) {
                self.lambda(callback).call(self);
            }
        };

        const store = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);
        for (let i = 0; i < toDelete.length; i++) {
            const item = toDelete[i];
            const delKey = item && item.key ? item.key : item;
            store['delete'](delKey);
        }

        store.transaction.oncomplete = onComplete;
        store.transaction.onabort = fail;

        return this;
    },

    nuke: function(callback) {
        if (deferIfNotReady(this, () => this.nuke(callback))) {
            return;
        }

        const self = this;
        const onComplete = callback ? () => self.lambda(callback).call(self) : () => {};

        try {
            const store = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);
            store.clear();
            store.transaction.oncomplete = onComplete;
            store.transaction.onabort = fail;
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

  // Helper functions

  /**
   * Handles the upgrade event for IndexedDB.
   * @param {object} adapter
   * @param {IDBOpenDBRequest} request
   */
  function handleUpgrade(adapter, request) {
      adapter.db = request.result;
      adapter.transaction = request.transaction;

      // NB! in case of a version conflict, we don't try to migrate,
      // instead just throw away the old store and create a new one.
      try {
          adapter.db.deleteObjectStore(adapter.record);
      } catch (e) {
          /* ignore */
      }

      // create object store.
      adapter.db.createObjectStore(adapter.record, {
          autoIncrement: useAutoIncrement()
      });
  }

  /**
   * Handles the success event for IndexedDB.
   * @param {object} adapter
   * @param {Event} event
   * @param {Function} cb
   */
  function handleSuccess(adapter, event, cb) {
      // remember the db instance
      adapter.db = event.target.result;

      // storage is now possible
      adapter.store = true;

      // execute all pending operations
      while (adapter.waiting.length) {
          adapter.waiting.shift().call(adapter);
      }

      // fire the callback if provided
      if (cb) {
          cb.call(adapter, adapter);
      }
  }

  function fail(e) {
      console.error('error in indexed-db adapter!', e);
  }

  function useAutoIncrement() {
      // using preliminary mozilla implementation which doesn't support
      // auto-generated keys.  Neither do some webkit implementations.
      return !!window.indexedDB;
  }

})()));