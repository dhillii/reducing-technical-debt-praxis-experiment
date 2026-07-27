Lawnchair.adapter('indexed-db', (function(){

  // update the STORE_VERSION when the schema used by this adapter changes
  // (for example, if you change the STORE_NAME above)
  // NB: Causes onupgradeneeded to be fired, which erases the old database!
  const STORE_VERSION = 3;

  // Retrieves the IndexedDB implementation, checking vendor prefixes
  const getIDB = function() {
      return window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;
  };

  // Retrieves the IDBTransaction implementation, checking vendor prefixes
  const getIDBTransaction = function() {
      return window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.oIDBTransaction || window.msIDBTransaction;
  };

  // Retrieves the IDBKeyRange implementation, checking vendor prefixes
  const getIDBKeyRange = function() {
      return window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.oIDBKeyRange || window.msIDBKeyRange;
  };

  // see https://groups.google.com/a/chromium.org/forum/?fromgroups#!topic/chromium-html5/OhsoAQLj7kc
  const READ_WRITE = (getIDBTransaction() && 'READ_WRITE' in getIDBTransaction()) ? getIDBTransaction().READ_WRITE : 'readwrite';

  // Handles database upgrade/initialization
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

  // Handles successful database open
  const handleDatabaseSuccess = function(event, self, callback) {
      self.db = event.target.result;
      self.store = true;

      while (self.waiting.length) {
          self.waiting.shift().call(self);
      }

      if (callback) {
          callback.call(self, self);
      }
  };

  // Ensures objects have keys and returns array of objects
  const ensureObjectKeys = function(obj, self) {
      return (self.isArray(obj) ? obj : [obj]).map(function(o) {
          if (!o.key) {
              o.key = self.uuid();
          }
          return o;
      });
  };

  // Stores objects in the database
  const storeObjects = function(objectStore, objs) {
      for (let i = 0; i < objs.length; i++) {
          const obj = objs[i];
          objectStore.put(obj, obj.key);
      }
  };

  // Handles single key retrieval
  const retrieveSingleKey = function(self, key, callback) {
      const win = function(e) {
          const result = e.target.result;
          if (callback) {
              if (result) {
                  result.key = key;
              }
              self.lambda(callback).call(self, result);
          }
      };

      const req = self.db.transaction(self.record).objectStore(self.record).get(key);

      req.onsuccess = function(event) {
          req.onsuccess = req.onerror = null;
          win(event);
      };
      req.onerror = function(event) {
          req.onsuccess = req.onerror = null;
          fail(event);
      };
  };

  // Handles multiple key retrieval
  const retrieveMultipleKeys = function(self, keys, callback) {
      const results = [];
      let done = keys.length;

      const getOne = function(i) {
          self.get(keys[i], function(obj) {
              results[i] = obj;
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

  // Checks if a key exists in the store
  const checkKeyExists = function(self, key, callback) {
      const req = self.db.transaction(self.record).objectStore(self.record).openCursor(getIDBKeyRange().only(key));

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
  };

  // Iterates through all records in the store
  const iterateAllRecords = function(self, callback, extractKey) {
      const objectStore = self.db.transaction(self.record).objectStore(self.record);
      const toReturn = [];

      objectStore.openCursor().onsuccess = function(event) {
          const cursor = event.target.result;
          if (cursor) {
              toReturn.push(extractKey ? cursor.key : cursor.value);
              cursor['continue']();
          } else {
              if (callback) {
                  callback.call(self, toReturn);
              }
          }
      };
  };

  // Deletes specified keys from the store
  const deleteKeys = function(self, toDelete) {
      const objectStore = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);

      for (let i = 0; i < toDelete.length; i++) {
          const key = toDelete[i].key ? toDelete[i].key : toDelete[i];
          objectStore['delete'](key);
      }

      return objectStore;
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
            handleDatabaseSuccess(event, self, cb);
        };
    },

    save: function(obj, callback) {
        const self = this;
        if (!this.store) {
            this.waiting.push(function() {
                this.save(obj, callback);
            });
            return;
        }

        const objs = ensureObjectKeys(obj, self);

        const win = function() {
            if (callback) {
                self.lambda(callback).call(self, self.isArray(obj) ? objs : objs[0]);
            }
        };

        const trans = this.db.transaction(this.record, READ_WRITE);
        const store = trans.objectStore(this.record);

        storeObjects(store, objs);
        store.transaction.oncomplete = win;
        store.transaction.onabort = fail;

        return this;
    },

    batch: function(objs, callback) {
        return this.save(objs, callback);
    },

    get: function(key, callback) {
        if (!this.store) {
            this.waiting.push(function() {
                this.get(key, callback);
            });
            return;
        }

        const self = this;

        if (!this.isArray(key)) {
            retrieveSingleKey(self, key, callback);
        } else {
            retrieveMultipleKeys(self, key, callback);
        }

        return this;
    },

    exists: function(key, callback) {
        if (!this.store) {
            this.waiting.push(function() {
                this.exists(key, callback);
            });
            return;
        }

        const self = this;
        checkKeyExists(self, key, callback);

        return this;
    },

    all: function(callback) {
        if (!this.store) {
            this.waiting.push(function() {
                this.all(callback);
            });
            return;
        }

        const cb = this.fn(this.name, callback) || undefined;
        const self = this;

        iterateAllRecords(self, cb, false);

        return this;
    },

    keys: function(callback) {
        if (!this.store) {
            this.waiting.push(function() {
                this.keys(callback);
            });
            return;
        }

        const cb = this.fn(this.name, callback) || undefined;
        const self = this;

        iterateAllRecords(self, cb, true);

        return this;
    },

    remove: function(keyOrArray, callback) {
        if (!this.store) {
            this.waiting.push(function() {
                this.remove(keyOrArray, callback);
            });
            return;
        }

        const self = this;
        const toDelete = this.isArray(keyOrArray) ? keyOrArray : [keyOrArray];

        const win = function() {
            if (callback) {
                self.lambda(callback).call(self);
            }
        };

        const objectStore = deleteKeys(self, toDelete);
        objectStore.transaction.oncomplete = win;
        objectStore.transaction.onabort = fail;

        return this;
    },

    nuke: function(callback) {
        if (!this.store) {
            this.waiting.push(function() {
                this.nuke(callback);
            });
            return;
        }

        const self = this;
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

  function fail(e, i) {
      console.error('error in indexed-db adapter!', e, i);
  }

  function useAutoIncrement() {
      return !!window.indexedDB;
  }

})());