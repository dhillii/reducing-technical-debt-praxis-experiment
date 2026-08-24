Lawnchair.adapter('indexed-db', (function(){

  // update the STORE_VERSION when the schema used by this adapter changes
  // (for example, if you change the STORE_NAME above)
  // NB: Causes onupgradeneeded to be fired, which erases the old database!
  const STORE_VERSION = 3;

  /**
   * Returns the appropriate indexedDB implementation for the current environment.
   * Helper function to abstract vendor-prefixed variants.
   */
  const getIDB = function() {
      return window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;
  };

  /**
   * Returns the appropriate IDBTransaction implementation for the current environment.
   * Helper function to abstract vendor-prefixed variants.
   */
  const getIDBTransaction = function() {
      return window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.oIDBTransaction || window.msIDBTransaction;
  };

  /**
   * Returns the appropriate IDBKeyRange implementation for the current environment.
   * Helper function to abstract vendor-prefixed variants.
   */
  const getIDBKeyRange = function() {
      return window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.oIDBKeyRange || window.msIDBKeyRange;
  };

  /**
   * Normalizes the IDB transaction mode string for READ_WRITE operations, handling vendor prefixes.
   */
  const getREAD_WRITEMode = function() {
      const IDBTransaction = getIDBTransaction();
      if (IDBTransaction && 'READ_WRITE' in IDBTransaction) {
          return IDBTransaction.READ_WRITE;
      }
      return 'readwrite';
  };

  const READ_WRITE = getREAD_WRITEMode();

  return {
    valid: function() {
        return !!getIDB();
    },

    init: function(options, callback) {
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
        request.onupgradeneeded = onupgradeneeded;
        request.onsuccess = onsuccess;

        /**
         * Handles upgrade logic when database schema changes.
         * Deletes existing object store and creates a fresh one.
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
         * Handles successful database opening.
         * Resumes pending operations and invokes callback.
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

    save:function(obj, callback) {
        const self = this;

        if (!this.store) {
            this.waiting.push(() => this.save(obj, callback));
            return;
        }

        const objs = (this.isArray(obj) ? obj : [obj]).map(o => {
            if (!o.key) o.key = self.uuid();
            return o;
        });

        const onSuccess = (e) => {
            if (callback) { self.lambda(callback).call(self, self.isArray(obj) ? objs : objs[0]); }
        };

        const transaction = this.db.transaction(this.record, READ_WRITE);
        const store = transaction.objectStore(this.record);

        objs.forEach(o => store.put(o, o.key));
        store.transaction.oncomplete = onSuccess;
        store.transaction.onabort = fail;
        return this;
    },
    
    batch: function (objs, callback) {
        return this.save(objs, callback);
    },
    

    get:function(key, callback) {
        if (!this.store) {
            this.waiting.push(() => this.get(key, callback));
            return;
        }

        const self = this;
        const handleSuccess = (e) => {
            const result = e.target.result;
            if (callback) {
                if (result) result.key = key;
                self.lambda(callback).call(self, result);
            }
        };

        if (!this.isArray(key)) {
            const request = this.db.transaction(this.record).objectStore(this.record).get(key);
            request.onsuccess = (event) => {
                request.onsuccess = request.onerror = null;
                handleSuccess(event);
            };
            request.onerror = (event) => {
                request.onsuccess = request.onerror = null;
                fail(event);
            };
        } else {
            const results = [];
            let remaining = key.length;

            const completeIfDone = () => {
                if (--remaining === 0 && callback) {
                    self.lambda(callback).call(self, results);
                }
            };

            const fetchKey = (i) => {
                self.get(key[i], (obj) => {
                    results[i] = obj;
                    completeIfDone();
                });
            };

            for (let i = 0; i < key.length; i++) {
                fetchKey(i);
            }
        }

        return this;
    },

    exists:function(key, callback) {
        if (!this.store) {
            this.waiting.push(() => this.exists(key, callback));
            return;
        }

        const self = this;
        const request = this.db.transaction(self.record).objectStore(self.record)
            .openCursor(getIDBKeyRange().only(key));

        request.onsuccess = (event) => {
            request.onsuccess = request.onerror = null;
            const exists = event.target.result !== null;
            self.lambda(callback).call(self, exists);
        };

        request.onerror = (event) => {
            request.onsuccess = request.onerror = null;
            fail(event);
        };

        return this;
    },

    all:function(callback) {
        if (!this.store) {
            this.waiting.push(() => this.all(callback));
            return;
        }

        const cb = this.fn(this.name, callback) || undefined;
        const self = this;
        const objectStore = this.db.transaction(this.record).objectStore(this.record);
        const results = [];

        const cursorHandler = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                results.push(cursor.value);
                cursor.continue();
            } else if (cb) {
                cb.call(self, results);
            }
        };

        objectStore.openCursor().onsuccess = cursorHandler;
        return this;
    },

    keys:function(callback) {
        if (!this.store) {
            this.waiting.push(() => this.keys(callback));
            return;
        }

        const cb = this.fn(this.name, callback) || undefined;
        const self = this;
        const objectStore = this.db.transaction(this.record).objectStore(this.record);
        const keyList = [];

        const cursorHandler = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                keyList.push(cursor.key);
                cursor.continue();
            } else if (cb) {
                cb.call(self, keyList);
            }
        };

        objectStore.openCursor().onsuccess = cursorHandler;
        return this;
    },

    remove:function(keyOrArray, callback) {
        if (!this.store) {
            this.waiting.push(() => this.remove(keyOrArray, callback));
            return;
        }

        const self = this;
        const targets = this.isArray(keyOrArray) ? keyOrArray : [keyOrArray];

        const onSuccess = () => {
            if (callback) self.lambda(callback).call(self);
        };

        const transaction = this.db.transaction(this.record, READ_WRITE);
        const objectStore = transaction.objectStore(this.record);

        targets.forEach(entry => {
            const key = entry.key || entry;
            objectStore.delete(key);
        });

        objectStore.transaction.oncomplete = onSuccess;
        objectStore.transaction.onerror = fail;

        return this;
    },

    nuke:function(callback) {
        if (!this.store) {
            this.waiting.push(() => this.nuke(callback));
            return;
        }

        const self = this;
        const onSuccess = callback ? () => self.lambda(callback).call(self) : () => {};

        try {
            const transaction = this.db.transaction(this.record, READ_WRITE);
            const objectStore = transaction.objectStore(this.record);
            objectStore.clear();
            objectStore.transaction.oncomplete = onSuccess;
            objectStore.transaction.onerror = fail;
        } catch (e) {
            if (e.name === 'NotFoundError') {
                onSuccess();
            } else {
                fail(e);
            }
        }

        return this;
    }
    
  };

  /**
   * Logs errors from indexedDB operations for debugging.
   */
  function fail(e, i) {
      console.error('error in indexed-db adapter!', e, i);
  }

  /**
   * Determines whether to enable auto-increment for records.
   * Based on presence of indexedDB support.
   */
  function useAutoIncrement() {
      return !!window.indexedDB;
  }

})());