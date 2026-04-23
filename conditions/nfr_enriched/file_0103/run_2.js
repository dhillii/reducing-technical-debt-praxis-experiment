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
  const initializeObjectStore = function(self, request) {
      self.db = request.result;
      self.transaction = request.transaction;

      try {
          self.db.deleteObjectStore(self.record);
      } catch (e) { /* ignore */ }

      self.db.createObjectStore(self.record, {
          autoIncrement: useAutoIncrement()
      });
  };

  // Handles successful database connection
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

  // Executes a single get operation for a key
  const executeSingleGet = function(self, key, callback) {
      const win = function(e) {
          const result = e.target.result;
          if (callback) {
              if (result) { result.key = key; }
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

  // Executes batch get operations for multiple keys
  const executeBatchGet = function(self, keys, callback) {
      const results = [];
      let done = keys.length;

      const getOne = function(i) {
          self.get(keys[i], function(obj) {
              results[i] = obj;
              if ((--done) > 0) { return; }
              if (callback) {
                  self.lambda(callback).call(self, results);
              }
          });
      };

      for (let i = 0; i < keys.length; i++) {
          getOne(i);
      }
  };

  // Normalizes key input to array format
  const normalizeKeyArray = function(keyOrArray) {
      return this.isArray(keyOrArray) ? keyOrArray : [keyOrArray];
  };

  // Extracts the actual key from an object or returns the key itself
  const extractKey = function(item) {
      return item.key ? item.key : item;
  };

  // Processes save operation on the object store
  const processSaveOperation = function(self, objs, callback) {
      const win = function() {
          if (callback) { self.lambda(callback).call(self, self.isArray(objs) ? objs : objs[0]); }
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

  // Processes cursor iteration for all records
  const processCursorIteration = function(objectStore, callback, keyExtractor) {
      const toReturn = [];

      objectStore.openCursor().onsuccess = function(event) {
          const cursor = event.target.result;
          if (cursor) {
              toReturn.push(keyExtractor(cursor));
              cursor['continue']();
          } else {
              if (callback) callback(toReturn);
          }
      };
  };

  // Processes delete operation on the object store
  const processDeleteOperation = function(self, toDelete, callback) {
      const win = function() {
          if (callback) self.lambda(callback).call(self);
      };

      const os = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);

      for (let i = 0; i < toDelete.length; i++) {
          const key = extractKey(toDelete[i]);
          os['delete'](key);
      }

      os.transaction.oncomplete = win;
      os.transaction.onabort = fail;
  };

  // Processes nuke (clear) operation on the object store
  const processNukeOperation = function(self, callback) {
      const win = callback ? function() { self.lambda(callback).call(self); } : function(){};

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
            initializeObjectStore(self, request);
        };
        request.onsuccess = function(event) {
            handleDatabaseSuccess(self, event, cb);
        };

        return this;
    },

    save: function(obj, callback) {
        if (!this.store) {
            this.waiting.push(function() {
                this.save(obj, callback);
            });
            return this;
        }

        const self = this;
        const objs = (this.isArray(obj) ? obj : [obj]).map(function(o) {
            if (!o.key) { o.key = self.uuid(); }
            return o;
        });

        processSaveOperation(self, objs, callback);

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
            return this;
        }

        const self = this;

        if (!this.isArray(key)) {
            executeSingleGet(self, key, callback);
        } else {
            executeBatchGet(self, key, callback);
        }

        return this;
    },

    exists: function(key, callback) {
        if (!this.store) {
            this.waiting.push(function() {
                this.exists(key, callback);
            });
            return this;
        }

        const self = this;
        const req = self.db.transaction(self.record).objectStore(self.record).openCursor(getIDBKeyRange().only(key));

        req.onsuccess = function(event) {
            req.onsuccess = req.onerror = null;
            const undef = undefined;
            self.lambda(callback).call(self, event.target.result !== null && event.target.result !== undef);
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
            return this;
        }

        const cb = this.fn(this.name, callback) || undefined;
        const self = this;
        const objectStore = this.db.transaction(this.record).objectStore(this.record);

        processCursorIteration(objectStore, function(toReturn) {
            if (cb) cb.call(self, toReturn);
        }, function(cursor) {
            return cursor.value;
        });

        return this;
    },

    keys: function(callback) {
        if (!this.store) {
            this.waiting.push(function() {
                this.keys(callback);
            });
            return this;
        }

        const cb = this.fn(this.name, callback) || undefined;
        const self = this;
        const objectStore = this.db.transaction(this.record).objectStore(this.record);

        processCursorIteration(objectStore, function(toReturn) {
            if (cb) cb.call(self, toReturn);
        }, function(cursor) {
            return cursor.key;
        });

        return this;
    },

    remove: function(keyOrArray, callback) {
        if (!this.store) {
            this.waiting.push(function() {
                this.remove(keyOrArray, callback);
            });
            return this;
        }

        const self = this;
        const toDelete = normalizeKeyArray.call(this, keyOrArray);

        processDeleteOperation(self, toDelete, callback);

        return this;
    },

    nuke: function(callback) {
        if (!this.store) {
            this.waiting.push(function() {
                this.nuke(callback);
            });
            return this;
        }

        const self = this;
        processNukeOperation(self, callback);

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