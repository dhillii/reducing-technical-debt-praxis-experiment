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
   * Checks if the provided callback is valid
   * @param {Function} cb - The callback to validate
   * @returns {boolean} True if callback is valid, false otherwise
   */
  const isValidCallback = function(cb) {
    return cb && typeof cb !== 'function';
  };

  /**
   * Checks if storage is available
   * @param {Object} context - The adapter context
   * @returns {boolean} True if storage is available, false otherwise
   */
  const isStorageAvailable = function(context) {
    return !context.store;
  };

  /**
   * Checks if the object has a key property
   * @param {Object} obj - The object to check
   * @returns {boolean} True if object has key, false otherwise
   */
  const hasKeyProperty = function(obj) {
    return !obj.key;
  };

  /**
   * Checks if result is null or undefined
   * @param {any} result - The result to check
   * @returns {boolean} True if result is null or undefined, false otherwise
   */
  const isResultNullOrUndefined = function(result) {
    const undef = undefined;
    return result === null || result === undef;
  };

  /**
   * Processes a single get operation
   * @param {Object} self - The adapter instance
   * @param {Array} keys - Array of keys to get
   * @param {number} index - Current index
   * @param {Array} results - Results array
   * @param {number} remaining - Number of operations remaining
   * @param {Function} callback - Callback function
   */
  const processGetOperation = function(self, keys, index, results, remaining, callback) {
    self.get(keys[index], function(obj) {
      results[index] = obj;
      if ((--remaining) > 0) { return; }
      if (callback) {
        self.lambda(callback).call(self, results);
      }
    });
  };

  return {
    valid: function() {
        return !!getIDB();
    },

    init: function(options, callback) {
        const self = this;

        const cb = self.fn(self.name, callback);
        if (isValidCallback(cb)) {
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
        request.onsuccess = function(event) {
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
        };
    },

    save:function(obj, callback) {
        const self = this;
        if(isStorageAvailable(this)) {
            this.waiting.push(function() {
                this.save(obj, callback);
            });
            return this;
         }

         const objs = (this.isArray(obj) ? obj : [obj]).map(function(o){
           if(hasKeyProperty(o)) { 
             o.key = self.uuid();
           } 
           return o;
         });

         const win  = function (e) {
           if (callback) { 
             self.lambda(callback).call(self, self.isArray(obj) ? objs : objs[0] );
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
        if(isStorageAvailable(this)) {
            this.waiting.push(function() {
                this.get(key, callback);
            });
            return this;
        }
        
        
        const self = this;
        const win  = function (e) {
            const r = e.target.result;
            if (callback) {
                if (r) { r.key = key; }
                self.lambda(callback).call(self, r);
            }
        };
        
        if (!this.isArray(key)){
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
            // note: these are hosted.
            const results = [];
            const done = key.length;
            const keys = key;

            for (let i = 0, l = keys.length; i < l; i++) {
              processGetOperation(self, keys, i, results, done, callback);
            }
        }

        return this;
    },

    exists:function(key, callback) {
        if(isStorageAvailable(this)) {
            this.waiting.push(function() {
                this.exists(key, callback);
            });
            return this;
        }

        const self = this;

        const req = this.db.transaction(self.record).objectStore(this.record).openCursor(getIDBKeyRange().only(key));

        req.onsuccess = function(event) {
            req.onsuccess = req.onerror = null;
            // exists iff req.result is not null
            // XXX but firefox returns undefined instead, sigh XXX
            self.lambda(callback).call(self, !isResultNullOrUndefined(event.target.result));
        };
        req.onerror = function(event) {
            req.onsuccess = req.onerror = null;
            fail(event);
        };

        return this;
    },

    all:function(callback) {
        if(isStorageAvailable(this)) {
            this.waiting.push(function() {
                this.all(callback);
            });
            return this;
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
          }
          else {
              if (cb) cb.call(self, toReturn);
          }
        };
        return this;
    },

    keys:function(callback) {
        if(isStorageAvailable(this)) {
            this.waiting.push(function() {
                this.keys(callback);
            });
            return this;
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
          }
          else {
              if (cb) cb.call(self, toReturn);
          }
        };
        return this;
    },

    remove:function(keyOrArray, callback) {
        if(isStorageAvailable(this)) {
            this.waiting.push(function() {
                this.remove(keyOrArray, callback);
            });
            return this;
        }
        const self = this;

        let toDelete = keyOrArray; 
        if (!this.isArray(keyOrArray)) {
          toDelete=[keyOrArray];
        }


        const win = function () {
          if (callback) self.lambda(callback).call(self);
        };

        const os = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);

        for (let i = 0; i < toDelete.length; i++) {
          const key = toDelete[i].key ? toDelete[i].key : toDelete[i];
          os['delete'](key);
        }

        os.transaction.oncomplete = win;
        os.transaction.onabort = fail;

        return this;
    },

    nuke:function(callback) {
        if(isStorageAvailable(this)) {
            this.waiting.push(function() {
                this.nuke(callback);
            });
            return this;
        }
        
        const self = this;
        const win  = callback ? function() { self.lambda(callback).call(self); } : function(){};
        
        try {
          const os = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);
          os.clear();
          os.transaction.oncomplete = win;
          os.transaction.onabort = fail;
        } catch (e) {
          if (e.name==='NotFoundError') 
            win(); 
          else 
            fail(e);
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