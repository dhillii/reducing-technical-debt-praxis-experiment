Lawnchair.adapter('indexed-db', (function(){

  // update the STORE_VERSION when the schema used by this adapter changes
  // (for example, if you change the STORE_NAME above)
  // NB: Causes onupgradeneeded to be fired, which erases the old database!
  const STORE_VERSION = 3;

  // Retrieves the IndexedDB implementation from the current browser
  const getIDB = function() {
      return window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;
  };

  // Retrieves the IDBTransaction implementation from the current browser
  const getIDBTransaction = function() {
      return window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.oIDBTransaction || window.msIDBTransaction;
  };

  // Retrieves the IDBKeyRange implementation from the current browser
  const getIDBKeyRange = function() {
      return window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.oIDBKeyRange || window.msIDBKeyRange;
  };

  // see https://groups.google.com/a/chromium.org/forum/?fromgroups#!topic/chromium-html5/OhsoAQLj7kc
  const READ_WRITE = (getIDBTransaction() && 'READ_WRITE' in getIDBTransaction()) ? getIDBTransaction().READ_WRITE : 'readwrite';

  // Handles database upgrade initialization
  const handleUpgradeNeeded = function(self, request) {
      self.db = request.result;
      self.transaction = request.transaction;

      try {
          self.db.deleteObjectStore(self.record);
      } catch (e) { /* ignore */ }

      self.db.createObjectStore(self.record, {
          autoIncrement: useAutoIncrement()
      });
  };

  // Handles successful database opening
  const handleDatabaseSuccess = function(self, event, callback) {
      self.db = event.target.result;
      self.store = true;

      while (self.waiting.length) {
          self.waiting.shift().call(self);
      }

      if (callback) {
          callback.call(self, self);
      }
  };

  // Processes a single object for saving
  const processSaveObject = function(obj, self) {
      if (!obj.key) {
          obj.key = self.uuid();
      }
      return obj;
  };

  // Executes the actual save operation on the object store
  const executeSave = function(self, objs, callback) {
      const win = function() {
          if (callback) {
              self.lambda(callback).call(self, self.isArray(objs) ? objs : objs[0]);
          }
      };

      const trans = self.db.transaction(self.record, READ_WRITE);
      const store = trans.objectStore(self.record);

      for (let i = 0; i < objs.length; i++) {
          const obj = objs[i];
          store.put(obj, obj.key);
      }

      store.transaction.oncomplete = win;
      store.transaction.onabort = fail;
  };

  // Handles successful single key retrieval
  const handleGetSuccess = function(self, key, callback, event) {
      const result = event.target.result;
      if (callback) {
          if (result) {
              result.key = key;
          }
          self.lambda(callback).call(self, result);
      }
  };

  // Retrieves a single key from the database
  const getSingleKey = function(self, key, callback) {
      const req = self.db.transaction(self.record).objectStore(self.record).get(key);

      req.onsuccess = function(event) {
          req.onsuccess = req.onerror = null;
          handleGetSuccess(self, key, callback, event);
      };

      req.onerror = function(event) {
          req.onsuccess = req.onerror = null;
          fail(event);
      };
  };

  // Retrieves multiple keys from the database
  const getMultipleKeys = function(self, keys, callback) {
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

  // Handles cursor success for all() operation
  const handleAllCursorSuccess = function(self, callback, event, toReturn) {
      const cursor = event.target.result;
      if (cursor) {
          toReturn.push(cursor.value);
          cursor['continue']();
      } else {
          if (callback) {
              callback.call(self, toReturn);
          }
      }
  };

  // Handles cursor success for keys() operation
  const handleKeysCursorSuccess = function(self, callback, event, toReturn) {
      const cursor = event.target.result;
      if (cursor) {
          toReturn.push(cursor.key);
          cursor['continue']();
      } else {
          if (callback) {
              callback.call(self, toReturn);
          }
      }
  };

  // Normalizes key or array of keys to array format
  const normalizeKeysToArray = function(keyOrArray) {
      return this.isArray(keyOrArray) ? keyOrArray : [keyOrArray];
  };

  // Extracts the actual key value from a key or object
  const extractKeyValue = function(item) {
      return item.key ? item.key : item;
  };

  // Executes the actual remove operation on the object store
  const executeRemove = function(self, toDelete, callback) {
      const win = function() {
          if (callback) {
              self.lambda(callback).call(self);
          }
      };

      const objectStore = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);

      for (let i = 0; i < toDelete.length; i++) {
          const key = extractKeyValue(toDelete[i]);
          objectStore['delete'](key);
      }

      objectStore.transaction.oncomplete = win;
      objectStore.transaction.onabort = fail;
  };

  // Executes the actual nuke operation on the object store
  const executeNuke = function(self, callback) {
      const win = callback ? function() {
          self.lambda(callback).call(self);
      } : function(){};

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
            handleUpgradeNeeded(self, request);
        };
        request.onsuccess = function(event) {
            handleDatabaseSuccess(self, event, cb);
        };
    },

    save: function(obj, callback) {
        if (!this.store) {
            this.waiting.push(function() {
                this.save(obj, callback);
            });
            return;
        }

        const self = this;
        const objs = (this.isArray(obj) ? obj : [obj]).map(function(o) {
            return processSaveObject(o, self);
        });

        executeSave(this, objs, callback);
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
            getSingleKey(self, key, callback);
        } else {
            getMultipleKeys(self, key, callback);
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
        if (!this.store) {
            this.waiting.push(function() {
                this.all(callback);
            });
            return;
        }

        const cb = this.fn(this.name, callback) || undefined;
        const self = this;
        const objectStore = this.db.transaction(this.record).objectStore(this.record);
        const toReturn = [];

        objectStore.openCursor().onsuccess = function(event) {
            handleAllCursorSuccess(self, cb, event, toReturn);
        };

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
        const objectStore = this.db.transaction(this.record).objectStore(this.record);
        const toReturn = [];

        objectStore.openCursor().onsuccess = function(event) {
            handleKeysCursorSuccess(self, cb, event, toReturn);
        };

        return this;
    },

    remove: function(keyOrArray, callback) {
        if (!this.store) {
            this.waiting.push(function() {
                this.remove(keyOrArray, callback);
            });
            return;
        }

        const toDelete = normalizeKeysToArray.call(this, keyOrArray);
        executeRemove(this, toDelete, callback);
        return this;
    },

    nuke: function(callback) {
        if (!this.store) {
            this.waiting.push(function() {
                this.nuke(callback);
            });
            return;
        }

        executeNuke(this, callback);
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