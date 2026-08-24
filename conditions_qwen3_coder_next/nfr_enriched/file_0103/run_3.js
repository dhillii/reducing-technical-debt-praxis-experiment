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

  // Returns the appropriate indexedDB implementation for the current browser
  function getIDB() {
      return window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;
  };

  // Returns the appropriate IDBTransaction implementation for the current browser
  function getIDBTransaction() {
      return window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.oIDBTransaction || window.msIDBTransaction;
  };

  // Returns the appropriate IDBKeyRange implementation for the current browser
  function getIDBKeyRange() {
      return window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.oIDBKeyRange || window.msIDBKeyRange;
  };

  // Determines the correct transaction mode for read/write operations
  const READ_WRITE = (() => {
      const idbTransaction = getIDBTransaction();
      return (idbTransaction && 'READ_WRITE' in idbTransaction) ? idbTransaction.READ_WRITE : 'readwrite';
  })();

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

        const idb = getIDB();
        const request = idb.open(self.name, STORE_VERSION);

        request.onerror = fail;
        request.onupgradeneeded = onupgradeneeded;
        request.onsuccess = onsuccess;

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
            this.waiting.push(function() {
                this.save(obj, callback);
            });
            return;
        }

        const objs = this.prepareObjectsForSave(obj);
        const win = this.createSaveSuccessHandler(callback, obj);

        const trans = this.db.transaction(this.record, READ_WRITE);
        const store = trans.objectStore(this.record);

        this.putObjectsInStore(store, objs);

        store.transaction.oncomplete = win;
        store.transaction.onabort = fail;
        
        return this;
    },
    
    batch: function (objs, callback) {
        return this.save(objs, callback);
    },
    

    get:function(key, callback) {
        if(!this.store) {
            this.waiting.push(function() {
                this.get(key, callback);
            });
            return;
        }
        
        const self = this;
        const win = this.createGetSuccessHandler(callback, key);

        if (!this.isArray(key)) {
            const req = this.db.transaction(this.record).objectStore(this.record).get(key);

            req.onsuccess = function(event) {
                req.onsuccess = req.onerror = null;
                win(event);
            };
            req.onerror = function(event) {
                req.onsuccess = req.onerror = null;
                fail(event);
            };
        } else {
            this.batchGet(key, callback);
        }

        return this;
    },

    exists:function(key, callback) {
        if(!this.store) {
            this.waiting.push(function() {
                this.exists(key, callback);
            });
            return;
        }

        const self = this;
        const onlyRange = getIDBKeyRange().only(key);
        const req = this.db.transaction(self.record).objectStore(this.record).openCursor(onlyRange);

        req.onsuccess = function(event) {
            req.onsuccess = req.onerror = null;
            const resultExists = event.target.result !== null;
            self.lambda(callback).call(self, resultExists);
        };
        req.onerror = function(event) {
            req.onsuccess = req.onerror = null;
            fail(event);
        };

        return this;
    },

    all:function(callback) {
        if(!this.store) {
            this.waiting.push(function() {
                this.all(callback);
            });
            return;
        }
        
        const cb = this.fn(this.name, callback) || undefined;
        const self = this;
        const objectStore = this.db.transaction(this.record).objectStore(this.record);
        const results = [];

        objectStore.openCursor().onsuccess = function(event) {
            const cursor = event.target.result;
            if (cursor) {
                results.push(cursor.value);
                cursor['continue']();
            } else {
                if (cb) cb.call(self, results);
            }
        };
        return this;
    },

    keys:function(callback) {
        if(!this.store) {
            this.waiting.push(function() {
                this.keys(callback);
            });
            return;
        }
        
        const cb = this.fn(this.name, callback) || undefined;
        const self = this;
        const objectStore = this.db.transaction(this.record).objectStore(this.record);
        const results = [];

        objectStore.openCursor().onsuccess = function(event) {
            const cursor = event.target.result;
            if (cursor) {
                results.push(cursor.key);
                cursor['continue']();
            } else {
                if (cb) cb.call(self, results);
            }
        };
        return this;
    },

    remove:function(keyOrArray, callback) {
        if(!this.store) {
            this.waiting.push(function() {
                this.remove(keyOrArray, callback);
            });
            return;
        }
        
        const self = this;
        const toDelete = this.ensureArray(keyOrArray);
        const win = this.createDeleteSuccessHandler(callback);

        const os = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);

        this.deleteKeysFromStore(os, toDelete);

        os.transaction.oncomplete = win;
        os.transaction.onabort = fail;

        return this;
    },

    nuke:function(callback) {
        if(!this.store) {
            this.waiting.push(function() {
                this.nuke(callback);
            });
            return;
        }
        
        const self = this;
        const win = callback ? function() { self.lambda(callback).call(self) } : function() {};
        
        try {
            const os = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);
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
      return !!window.indexedDB;
  }

  // Extracted: Prepares objects for saving, ensuring each has a key
  function prepareObjectsForSave(obj) {
      return (this.isArray(obj) ? obj : [obj]).map(function(o) {
          if(!o.key) { o.key = this.uuid(); }
          return o;
      }, this);
  }

  // Extracted: Returns success handler for save operations
  function createSaveSuccessHandler(callback, originalObj) {
      return function(e) {
          if (callback) {
              this.lambda(callback).call(this, this.isArray(originalObj) ? this.savedObjs : this.savedObjs[0]);
          }
      };
  }

  // Extracted: Puts all provided objects into the object store
  function putObjectsInStore(store, objs) {
      for (let i = 0; i < objs.length; i++) {
          const o = objs[i];
          store.put(o, o.key);
      }
  }

  // Extracted: Handles batch key fetch operations
  function batchGet(keys, callback) {
      const results = [];
      let remaining = keys.length;

      const handleResult = (i) => {
          this.get(keys[i], (obj) => {
              results[i] = obj;
              remaining--;
              if (remaining === 0 && callback) {
                  this.lambda(callback).call(this, results);
              }
          });
      };

      for (let i = 0; i < keys.length; i++) {
          handleResult(i);
      }
  }

  // Extracted: Returns success handler for get operations, handles key assignment if present
  function createGetSuccessHandler(callback, key) {
      return function(event) {
          const result = event.target.result;
          if (callback) {
              if (result) { result.key = key; }
              this.lambda(callback).call(this, result);
          }
      };
  }

  // Extracted: Converts single key or object into an array
  function ensureArray(keyOrArray) {
      return this.isArray(keyOrArray) ? keyOrArray : [keyOrArray];
  }

  // Extracted: Returns success handler for delete operations
  function createDeleteSuccessHandler(callback) {
      return function() {
          if (callback) { this.lambda(callback).call(this); }
      };
  }

  // Extracted: Deletes keys from the object store
  function deleteKeysFromStore(os, toDelete) {
      for (let i = 0; i < toDelete.length; i++) {
          const key = toDelete[i].key ? toDelete[i].key : toDelete[i];
          os['delete'](key);
      }
  }

})());