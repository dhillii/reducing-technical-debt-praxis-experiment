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

  // see https://groups.google.com/a/chromium.org/forum/?fromgroups#!topic/chromium-html5/OhsoAQLj7kc
  const READ_WRITE = (getIDBTransaction() && 'READ_WRITE' in getIDBTransaction()) ? getIDBTransaction().READ_WRITE : 'readwrite';

  /**
   * Handles database upgrade needed event
   */
  const handleUpgradeNeeded = function(self, request) {
    self.db = request.result;
    self.transaction = request.transaction;

    // NB! in case of a version conflict, we don't try to migrate,
    // instead just throw away the old store and create a new one.
    try {
        self.db.deleteObjectStore(self.record);
    } catch (e) { /* ignore */ }

    // create object store.
    self.db.createObjectStore(self.record, {
        autoIncrement: useAutoIncrement()
    });
  };

  /**
   * Handles successful database opening
   */
  const handleOpenSuccess = function(self, event, callback) {
    // remember the db instance
    self.db = event.target.result;

    // storage is now possible
    self.store = true;

    // execute all pending operations
    while (self.waiting.length) {
        self.waiting.shift().call(self);
    }

    // we're done, fire the callback
    if (callback) {
        callback.call(self, self);
    }
  };

  /**
   * Processes save operation for objects
   */
  const processSaveObjects = function(self, objs, callback) {
    const win = function (e) {
      if (callback) { self.lambda(callback).call(self, self.isArray(objs) ? objs : objs[0] ) }
    };

    const trans = self.db.transaction(self.record, READ_WRITE);
    const store = trans.objectStore(self.record);

    for (let i = 0; i < objs.length; i++) {
     const o = objs[i];
     store.put(o, o.key);
    }
    store.transaction.oncomplete = win;
    store.transaction.onabort = fail;
  };

  /**
   * Handles single key retrieval
   */
  const retrieveSingleKey = function(self, key, callback) {
    const req = self.db.transaction(self.record).objectStore(self.record).get(key);

    req.onsuccess = function(event) {
        req.onsuccess = req.onerror = null;
        const r = event.target.result;
        if (callback) {
            if (r) { r.key = key; }
            self.lambda(callback).call(self, r);
        }
    };
    req.onerror = function(event) {
        req.onsuccess = req.onerror = null;
        fail(event);
    };
  };

  /**
   * Handles multiple key retrieval
   */
  const retrieveMultipleKeys = function(self, keys, callback) {
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
    
    for (let i = 0, l = keys.length; i < l; i++) 
        getOne(i);
  };

  /**
   * Checks if a key exists in the store
   */
  const checkKeyExists = function(self, key, callback) {
    const req = self.db.transaction(self.record).objectStore(self.record).openCursor(getIDBKeyRange().only(key));

    req.onsuccess = function(event) {
        req.onsuccess = req.onerror = null;
        // exists iff req.result is not null
        // XXX but firefox returns undefined instead, sigh XXX
        const undef;
        self.lambda(callback).call(self, event.target.result !== null &&
                                         event.target.result !== undef);
    };
    req.onerror = function(event) {
        req.onsuccess = req.onerror = null;
        fail(event);
    };
  };

  /**
   * Retrieves all records from the store
   */
  const retrieveAllRecords = function(self, callback) {
    const objectStore = self.db.transaction(self.record).objectStore(self.record);
    const toReturn = [];
    objectStore.openCursor().onsuccess = function(event) {
      const cursor = event.target.result;
      if (cursor) {
           toReturn.push(cursor.value);
           cursor['continue']();
      }
      else {
          if (callback) callback.call(self, toReturn);
      }
    };
  };

  /**
   * Retrieves all keys from the store
   */
  const retrieveAllKeys = function(self, callback) {
    const objectStore = self.db.transaction(self.record).objectStore(self.record);
    const toReturn = [];
    // in theory we could use openKeyCursor() here, but no one actually
    // supports it yet.
    objectStore.openCursor().onsuccess = function(event) {
      const cursor = event.target.result;
      if (cursor) {
           toReturn.push(cursor.key);
           cursor['continue']();
      }
      else {
          if (callback) callback.call(self, toReturn);
      }
    };
  };

  /**
   * Processes removal of objects
   */
  const processRemoval = function(self, toDelete, callback) {
    const win = function () {
      if (callback) self.lambda(callback).call(self)
    };

    const os = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);

    for (let i = 0; i < toDelete.length; i++) {
      const key = toDelete[i].key ? toDelete[i].key : toDelete[i];
      os['delete'](key);
    }

    os.transaction.oncomplete = win;
    os.transaction.onabort = fail;
  };

  /**
   * Clears all records from the store
   */
  const clearAllRecords = function(self, callback) {
    const win = callback ? function() { self.lambda(callback).call(self) } : function(){};
    
    try {
      const os = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);
      os.clear();
      os.transaction.oncomplete = win;
      os.transaction.onabort = fail;
    } catch (e) {
      if (e.name=='NotFoundError') 
        win() 
      else 
        fail(e);
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

        // queues pending operations
        self.waiting = [];

        // open idb
        self.idb = getIDB();
        const request = self.idb.open(self.name, STORE_VERSION);

        // attach callback handlers
        request.onerror = fail;
        request.onupgradeneeded = function() {
            handleUpgradeNeeded(self, request);
        };
        request.onsuccess = function(event) {
            handleOpenSuccess(self, event, cb);
        };
    },

    save:function(obj, callback) {
        const self = this;
        if(!this.store) {
            this.waiting.push(function() {
                this.save(obj, callback);
            });
            return;
         }

         const objs = (this.isArray(obj) ? obj : [obj]).map(function(o){
             if(!o.key) { 
                 o.key = self.uuid();
             } 
             return o;
         });

         if (!this.store) {
            this.waiting.push(() => this.save(obj, callback));
            return this;
         }

         processSaveObjects(this, objs, callback);
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
        
        if (!this.isArray(key)){
            retrieveSingleKey(self, key, callback);
        } else {
            retrieveMultipleKeys(self, key, callback);
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

        checkKeyExists(this, key, callback);
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
        retrieveAllRecords(this, cb);
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
        retrieveAllKeys(this, cb);
        return this;
    },

    remove:function(keyOrArray, callback) {
        if(!this.store) {
            this.waiting.push(function() {
                this.remove(keyOrArray, callback);
            });
            return;
        }
        
        let toDelete = keyOrArray; 
        if (!this.isArray(keyOrArray)) {
          toDelete=[keyOrArray];
        }

        processRemoval(this, toDelete, callback);
        return this;
    },

    nuke:function(callback) {
        if(!this.store) {
            this.waiting.push(function() {
                this.nuke(callback);
            });
            return;
        }
        
        clearAllRecords(this, callback);
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