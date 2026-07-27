Lawnchair.adapter('indexed-db', (function(){

  // update the STORE_VERSION when the schema used by this adapter changes
  // (for example, if you change the STORE_NAME above)
  // NB: Causes onupgradeneeded to be fired, which erases the old database!
  const STORE_VERSION = 3;

  /**
   * Retrieves the IndexedDB implementation from the window object.
   * @returns {IDBFactory} The IndexedDB factory interface.
   */
  const getIDB = function() {
      return window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;
  };

  /**
   * Retrieves the IDBTransaction implementation from the window object.
   * @returns {IDBTransaction} The IDBTransaction interface.
   */
  const getIDBTransaction = function() {
      return window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.oIDBTransaction || window.msIDBTransaction;
  };

  /**
   * Retrieves the IDBKeyRange implementation from the window object.
   * @returns {IDBKeyRange} The IDBKeyRange interface.
   */
  const getIDBKeyRange = function() {
      return window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.oIDBKeyRange || window.msIDBKeyRange;
  };

  // see https://groups.google.com/a/chromium.org/forum/?fromgroups#!topic/chromium-html5/OhsoAQLj7kc
  const READ_WRITE = (getIDBTransaction() && 'READ_WRITE' in getIDBTransaction()) ? getIDBTransaction().READ_WRITE : 'readwrite';

  /**
   * Checks if store is ready; if not, queues the operation.
   * @param {Function} operation - The operation to queue or execute.
   * @returns {boolean} True if store is ready, false if queued.
   */
  const isStoreReady = function(self, operation) {
      if (self.store) {
          return true;
      }
      self.waiting.push(operation);
      return false;
  };

  /**
   * Ensures a key exists on an object; generates one if missing.
   * @param {Object} obj - The object to check.
   * @param {Function} uuidFn - Function to generate UUID.
   * @returns {Object} The object with a key.
   */
  const ensureKey = function(obj, uuidFn) {
      if (!obj.key) {
          obj.key = uuidFn();
      }
      return obj;
  };

  /**
   * Normalizes input to an array.
   * @param {*} value - The value to normalize.
   * @param {Function} isArrayFn - Function to check if value is array.
   * @returns {Array} The normalized array.
   */
  const normalizeToArray = function(value, isArrayFn) {
      return isArrayFn(value) ? value : [value];
  };

  /**
   * Checks if a value is a single key (not an array).
   * @param {*} key - The key to check.
   * @param {Function} isArrayFn - Function to check if value is array.
   * @returns {boolean} True if single key.
   */
  const isSingleKey = function(key, isArrayFn) {
      return !isArrayFn(key);
  };

  /**
   * Extracts the actual key from an object or returns the value as-is.
   * @param {*} item - The item to extract key from.
   * @returns {*} The extracted key.
   */
  const extractKey = function(item) {
      return item.key ? item.key : item;
  };

  /**
   * Checks if cursor result exists (handles Firefox undefined case).
   * @param {*} result - The cursor result.
   * @returns {boolean} True if result exists.
   */
  const cursorResultExists = function(result) {
      const undef = undefined;
      return result !== null && result !== undef;
  };

  /**
   * Checks if error is NotFoundError.
   * @param {Error} error - The error to check.
   * @returns {boolean} True if NotFoundError.
   */
  const isNotFoundError = function(error) {
      return error.name === 'NotFoundError';
  };

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

        // first start or indexeddb needs a version upgrade
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

        // database is ready for use
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

    save:function(obj, callback) {
        const self = this;
        if (!isStoreReady(this, function() {
            this.save(obj, callback);
        })) {
            return;
        }

        const objs = normalizeToArray(obj, this.isArray.bind(this))
            .map(o => ensureKey(o, self.uuid.bind(self)));

        const win = function (e) {
            if (callback) {
                self.lambda(callback).call(self, self.isArray(obj) ? objs : objs[0]);
            }
        };

        const trans = this.db.transaction(this.record, READ_WRITE);
        const store = trans.objectStore(this.record);

        for (let i = 0; i < objs.length; i++) {
            const o = objs[i];
            store.put(o, o.key);
        }
        store.transaction.oncomplete = win;
        store.transaction.onabort = fail;
        
        return this;
    },
    
    batch: function (objs, callback) {
        return this.save(objs, callback);
    },

    get:function(key, callback) {
        if (!isStoreReady(this, function() {
            this.get(key, callback);
        })) {
            return;
        }
        
        const self = this;
        const win = function (e) {
            const r = e.target.result;
            if (callback) {
                if (r) { r.key = key; }
                self.lambda(callback).call(self, r);
            }
        };
        
        if (isSingleKey(key, this.isArray.bind(this))) {
            this.getSingleKey(key, win);
        } else {
            this.getMultipleKeys(key, callback, win);
        }

        return this;
    },

    getSingleKey: function(key, win) {
        const req = this.db.transaction(this.record).objectStore(this.record).get(key);

        req.onsuccess = function(event) {
            req.onsuccess = req.onerror = null;
            win(event);
        };
        req.onerror = function(event) {
            req.onsuccess = req.onerror = null;
            fail(event);
        };
    },

    getMultipleKeys: function(keys, callback, win) {
        const self = this;
        const results = [];
        let done = keys.length;

        const getOne = function(i) {
            self.get(keys[i], function(obj) {
                results[i] = obj;
                done--;
                if (done > 0) {
                    return;
                }
                if (callback) {
                    self.lambda(callback).call(self, results);
                }
            });
        };

        for (let i = 0; i < keys.length; i++) {
            getOne(i);
        }
    },

    exists:function(key, callback) {
        if (!isStoreReady(this, function() {
            this.exists(key, callback);
        })) {
            return;
        }

        const self = this;
        const req = this.db.transaction(self.record).objectStore(this.record).openCursor(getIDBKeyRange().only(key));

        req.onsuccess = function(event) {
            req.onsuccess = req.onerror = null;
            const result = cursorResultExists(event.target.result);
            self.lambda(callback).call(self, result);
        };
        req.onerror = function(event) {
            req.onsuccess = req.onerror = null;
            fail(event);
        };

        return this;
    },

    all:function(callback) {
        if (!isStoreReady(this, function() {
            this.all(callback);
        })) {
            return;
        }

        const cb = this.fn(this.name, callback) || undefined;
        const self = this;
        const objectStore = this.db.transaction(this.record).objectStore(this.record);
        const toReturn = [];
        
        objectStore.openCursor().onsuccess = function(event) {
            const cursor = event.target.result;
            if (cursor) {
                toReturn.push(cursor.value);
                cursor['continue']();
                return;
            }
            if (cb) {
                cb.call(self, toReturn);
            }
        };
        return this;
    },

    keys:function(callback) {
        if (!isStoreReady(this, function() {
            this.keys(callback);
        })) {
            return;
        }

        const cb = this.fn(this.name, callback) || undefined;
        const self = this;
        const objectStore = this.db.transaction(this.record).objectStore(this.record);
        const toReturn = [];
        
        // in theory we could use openKeyCursor() here, but no one actually
        // supports it yet.
        objectStore.openCursor().onsuccess = function(event) {
            const cursor = event.target.result;
            if (cursor) {
                toReturn.push(cursor.key);
                cursor['continue']();
                return;
            }
            if (cb) {
                cb.call(self, toReturn);
            }
        };
        return this;
    },

    remove:function(keyOrArray, callback) {
        if (!isStoreReady(this, function() {
            this.remove(keyOrArray, callback);
        })) {
            return;
        }

        const self = this;
        const toDelete = normalizeToArray(keyOrArray, this.isArray.bind(this));

        const win = function () {
            if (callback) {
                self.lambda(callback).call(self);
            }
        };

        const os = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);

        for (let i = 0; i < toDelete.length; i++) {
            const key = extractKey(toDelete[i]);
            os['delete'](key);
        }

        os.transaction.oncomplete = win;
        os.transaction.onabort = fail;

        return this;
    },

    nuke:function(callback) {
        if (!isStoreReady(this, function() {
            this.nuke(callback);
        })) {
            return;
        }
        
        const self = this;
        const win = callback ? function() { self.lambda(callback).call(self); } : function(){};
        
        try {
            const os = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);
            os.clear();
            os.transaction.oncomplete = win;
            os.transaction.onabort = fail;
        } catch (e) {
            if (isNotFoundError(e)) {
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