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

  const getIDB = function() {
      return window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;
  };

  const getIDBTransaction = function() {
      return window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.oIDBTransaction || window.msIDBTransaction;
  };

  const getIDBKeyRange = function() {
      return window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.oIDBKeyRange || window.msIDBKeyRange;
  };

  const READ_WRITE = (getIDBTransaction() && 'READ_WRITE' in getIDBTransaction()) ? getIDBTransaction().READ_WRITE : 'readwrite';

  const fail = function(e, i) {
      console.error('error in indexed-db adapter!', e, i);
  };

  const useAutoIncrement = function() {
      // using preliminary mozilla implementation which doesn't support
      // auto-generated keys.  Neither do some webkit implementations.
      return !!window.indexedDB;
  };

  const createTransaction = function(db, storeName, mode) {
      return db.transaction(storeName, mode).objectStore(storeName);
  };

  const handlePendingOperations = function(self) {
      while (self.waiting.length) {
          self.waiting.shift().call(self);
      }
  };

  const executeCallback = function(self, callback, result) {
      if (callback) {
          self.lambda(callback).call(self, result);
      }
  };

  const handleSingleGet = function(self, key, callback) {
      const req = self.db.transaction(self.record).objectStore(self.record).get(key);

      req.onsuccess = function(event) {
          req.onsuccess = req.onerror = null;
          const r = event.target.result;
          if (r) { r.key = key; }
          executeCallback(self, callback, r);
      };
      req.onerror = function(event) {
          req.onsuccess = req.onerror = null;
          fail(event);
      };
  };

  const handleMultiGet = function(self, keys, callback) {
      const results = [];
      const done = keys.length;
      const keysArray = keys;

      const getOne = function(i) {
          self.get(keysArray[i], function(obj) {
              results[i] = obj;
              if ((--done) > 0) { return; }
              executeCallback(self, callback, results);
          });
      };
      for (let i = 0, l = keysArray.length; i < l; i++) {
          getOne(i);
      }
  };

  const handleCursorIteration = function(self, objectStore, callback, transformFn) {
      const toReturn = [];
      
      objectStore.openCursor().onsuccess = function(event) {
          const cursor = event.target.result;
          if (cursor) {
              toReturn.push(transformFn(cursor));
              cursor['continue']();
          } else {
              executeCallback(self, callback, toReturn);
          }
      };
  };

  const handleDeleteOperation = function(self, keyOrArray) {
      const toDelete = keyOrArray; 
      if (!self.isArray(keyOrArray)) {
          toDelete = [keyOrArray];
      }

      const os = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);

      for (let i = 0; i < toDelete.length; i++) {
          const key = toDelete[i].key ? toDelete[i].key : toDelete[i];
          os['delete'](key);
      }

      os.transaction.oncomplete = function() {
          if (self.callback) {
              self.lambda(self.callback).call(self);
          }
      };
      os.transaction.onabort = fail;
  };

  const handleClearOperation = function(self, callback) {
      const win = callback ? function() { self.lambda(callback).call(self) } : function(){};
      
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
            self.db = request.result;
            self.transaction = request.transaction;

            try {
                self.db.deleteObjectStore(self.record);
            } catch (e) { /* ignore */ }

            self.db.createObjectStore(self.record, {
                autoIncrement: useAutoIncrement()
            });
        };

        request.onsuccess = function(event) {
            self.db = event.target.result;
            self.store = true;
            handlePendingOperations(self);

            if (cb) {
                cb.call(self, self);
            }
        };
    },

    save: function(obj, callback) {
        const self = this;

        if (!this.store) {
            this.waiting.push(function() {
                this.save(obj, callback);
            });
            return this;
        }

        const objs = (this.isArray(obj) ? obj : [obj]).map(function(o){
            if(!o.key) { o.key = self.uuid(); }
            return o;
        });

        const win = function (e) {
            executeCallback(self, callback, this.isArray(obj) ? objs : objs[0]);
        };

        const store = createTransaction(this.db, this.record, READ_WRITE);

        for (let i = 0; i < objs.length; i++) {
            store.put(objs[i], objs[i].key);
        }
        
        store.transaction.oncomplete = win;
        store.transaction.onabort = fail;
        
        return this;
    },

    batch: function (objs, callback) {
        return this.save(objs, callback);
    },

    get: function(key, callback) {
        const self = this;

        if (!this.store) {
            this.waiting.push(function() {
                this.get(key, callback);
            });
            return this;
        }

        if (!this.isArray(key)) {
            handleSingleGet(self, key, callback);
        } else {
            handleMultiGet(self, key, callback);
        }

        return this;
    },

    exists: function(key, callback) {
        const self = this;

        if (!this.store) {
            this.waiting.push(function() {
                this.exists(key, callback);
            });
            return this;
        }

        const req = self.db.transaction(self.record).objectStore(self.record).openCursor(getIDBKeyRange().only(key));

        req.onsuccess = function(event) {
            req.onsuccess = req.onerror = null;
            const result = event.target.result !== null && event.target.result !== undefined;
            executeCallback(self, callback, result);
        };
        req.onerror = function(event) {
            req.onsuccess = req.onerror = null;
            fail(event);
        };

        return this;
    },

    all: function(callback) {
        const self = this;
        const cb = this.fn(this.name, callback) || undefined;
        const objectStore = createTransaction(this.db, this.record, READ_WRITE);
        
        handleCursorIteration(self, objectStore, cb, function(cursor) {
            return cursor.value;
        });
        return this;
    },

    keys: function(callback) {
        const self = this;
        const cb = this.fn(this.name, callback) || undefined;
        const objectStore = createTransaction(this.db, this.record, READ_WRITE);
        
        handleCursorIteration(self, objectStore, cb, function(cursor) {
            return cursor.key;
        });
        return this;
    },

    remove: function(keyOrArray, callback) {
        const self = this;

        if (!this.store) {
            this.waiting.push(function() {
                this.remove(keyOrArray, callback);
            });
            return this;
        }

        handleDeleteOperation(self, keyOrArray);
        return this;
    },

    nuke: function(callback) {
        const self = this;
        
        handleClearOperation(self, callback);
        return this;
    }
    
  };

  //
  // Helper functions
  //

})());
```