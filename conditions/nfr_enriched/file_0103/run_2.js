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

  // Retrieves the IndexedDB implementation with vendor prefixes
  const getIDB = function() {
      return window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;
  };

  // Retrieves the IDBTransaction implementation with vendor prefixes
  const getIDBTransaction = function() {
      return window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.oIDBTransaction || window.msIDBTransaction;
  };

  // Retrieves the IDBKeyRange implementation with vendor prefixes
  const getIDBKeyRange = function() {
      return window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.oIDBKeyRange || window.msIDBKeyRange;
  };

  // see https://groups.google.com/a/chromium.org/forum/?fromgroups#!topic/chromium-html5/OhsoAQLj7kc
  const READ_WRITE = (getIDBTransaction() && 'READ_WRITE' in getIDBTransaction()) ? getIDBTransaction().READ_WRITE : 'readwrite';

  // Handles database upgrade and schema creation
  const handleUpgradeNeeded = function(request, self) {
      self.db = request.result;
      self.transaction = request.transaction;

      try {
          self.db.deleteObjectStore(self.record);
      } catch (e) { /* ignore */ }

      self.db.createObjectStore(self.record, {
          autoIncrement: useAutoIncrement()
      });
  };

  // Handles successful database initialization
  const handleInitSuccess = function(event, self, callback) {
      self.db = event.target.result;
      self.store = true;

      while (self.waiting.length) {
          self.waiting.shift().call(self);
      }

      if (callback) {
          callback.call(self, self);
      }
  };

  // Ensures keys exist on objects, generating UUIDs as needed
  const ensureObjectKeys = function(objs, self) {
      return objs.map(function(obj) {
          if (!obj.key) {
              obj.key = self.uuid();
          }
          return obj;
      });
  };

  // Stores objects in the database transaction
  const storeObjectsInTransaction = function(store, objs) {
      for (let i = 0; i < objs.length; i++) {
          const obj = objs[i];
          store.put(obj, obj.key);
      }
  };

  // Handles single key retrieval
  const handleSingleKeyGet = function(key, self, callback) {
      const req = self.db.transaction(self.record).objectStore(self.record).get(key);

      req.onsuccess = function(event) {
          req.onsuccess = req.onerror = null;
          const result = event.target.result;
          if (callback) {
              if (result) {
                  result.key = key;
              }
              self.lambda(callback).call(self, result);
          }
      };

      req.onerror = function(event) {
          req.onsuccess = req.onerror = null;
          fail(event);
      };
  };

  // Handles multiple key retrieval
  const handleMultipleKeysGet = function(keys, self, callback) {
      const results = [];
      let done = keys.length;

      const getOne = function(index) {
          self.get(keys[index], function(obj) {
              results[index] = obj;
              if ((--done) > 0) {
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
  };

  // Normalizes input to array format
  const normalizeToArray = function(input) {
      return Array.isArray(input) ? input : [input];
  };

  // Extracts keys from objects or returns the value if already a key
  const extractKeys = function(items) {
      return items.map(function(item) {
          return item.key ? item.key : item;
      });
  };

  // Deletes items from object store
  const deleteItemsFromStore = function(objectStore, items) {
      const keys = extractKeys(items);
      for (let i = 0; i < keys.length; i++) {
          objectStore['delete'](keys[i]);
      }
  };

  // Checks if store is ready, queues operation if not
  const checkStoreReady = function(self, operation) {
      if (!self.store) {
          self.waiting.push(operation);
          return false;
      }
      return true;
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

        self.waiting = [];
        self.idb = getIDB();
        const request = self.idb.open(self.name, STORE_VERSION);

        request.onerror = fail;
        request.onupgradeneeded = function() {
            handleUpgradeNeeded(request, self);
        };
        request.onsuccess = function(event) {
            handleInitSuccess(event, self, cb);
        };
    },

    save: function(obj, callback) {
        const self = this;

        if (!checkStoreReady(this, function() {
            this.save(obj, callback);
        })) {
            return;
        }

        const objs = ensureObjectKeys(normalizeToArray(obj), self);

        const win = function() {
            if (callback) {
                self.lambda(callback).call(self, Array.isArray(obj) ? objs : objs[0]);
            }
        };

        const trans = this.db.transaction(this.record, READ_WRITE);
        const store = trans.objectStore(this.record);

        storeObjectsInTransaction(store, objs);

        store.transaction.oncomplete = win;
        store.transaction.onabort = fail;

        return this;
    },

    batch: function(objs, callback) {
        return this.save(objs, callback);
    },

    get: function(key, callback) {
        const self = this;

        if (!checkStoreReady(this, function() {
            this.get(key, callback);
        })) {
            return;
        }

        if (!Array.isArray(key)) {
            handleSingleKeyGet(key, self, callback);
        } else {
            handleMultipleKeysGet(key, self, callback);
        }

        return this;
    },

    exists: function(key, callback) {
        const self = this;

        if (!checkStoreReady(this, function() {
            this.exists(key, callback);
        })) {
            return;
        }

        const req = this.db.transaction(self.record).objectStore(this.record).openCursor(getIDBKeyRange().only(key));

        req.onsuccess = function(event) {
            req.onsuccess = req.onerror = null;
            const undef = undefined;
            self.lambda(callback).call(self, event.target.result !== null &&
                                             event.target.result !== undef);
        };

        req.onerror = function(event) {
            req.onsuccess = req.onerror = null;
            fail(event);
        };

        return this;
    },

    all: function(callback) {
        const self = this;

        if (!checkStoreReady(this, function() {
            this.all(callback);
        })) {
            return;
        }

        const cb = this.fn(this.name, callback) || undefined;
        const objectStore = this.db.transaction(this.record).objectStore(this.record);
        const toReturn = [];

        objectStore.openCursor().onsuccess = function(event) {
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

        return this;
    },

    keys: function(callback) {
        const self = this;

        if (!checkStoreReady(this, function() {
            this.keys(callback);
        })) {
            return;
        }

        const cb = this.fn(this.name, callback) || undefined;
        const objectStore = this.db.transaction(this.record).objectStore(this.record);
        const toReturn = [];

        objectStore.openCursor().onsuccess = function(event) {
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

        return this;
    },

    remove: function(keyOrArray, callback) {
        const self = this;

        if (!checkStoreReady(this, function() {
            this.remove(keyOrArray, callback);
        })) {
            return;
        }

        const toDelete = normalizeToArray(keyOrArray);

        const win = function() {
            if (callback) {
                self.lambda(callback).call(self);
            }
        };

        const objectStore = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);

        deleteItemsFromStore(objectStore, toDelete);

        objectStore.transaction.oncomplete = win;
        objectStore.transaction.onabort = fail;

        return this;
    },

    nuke: function(callback) {
        const self = this;

        if (!checkStoreReady(this, function() {
            this.nuke(callback);
        })) {
            return;
        }

        const win = callback ? function() {
            self.lambda(callback).call(self);
        } : function() {};

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

  // Helper functions

  // Logs errors from IndexedDB operations
  function fail(e, i) {
      console.error('error in indexed-db adapter!', e, i);
  }

  // Determines if auto-increment is supported by the browser
  function useAutoIncrement() {
      return !!window.indexedDB;
  }

})());
```