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

  const isStoreAvailable = function() {
      return !!this.store;
  };

  const isCallbackValid = function(callback) {
      return callback && typeof callback === 'function';
  };

  const isKeyArray = function(key) {
      return this.isArray(key);
  };

  const isNotFoundError = function(e) {
      return e.name === 'NotFoundError';
  };

  const isAutoIncrementSupported = function() {
      // using preliminary mozilla implementation which doesn't support
      // auto-generated keys.  Neither do some webkit implementations.
      return !!window.indexedDB;
  };

  const handleSuccess = function(self, callback, result) {
      if (callback) {
          self.lambda(callback).call(self, result);
      }
  };

  const handleFailure = function(e) {
      console.error('error in indexed-db adapter!', e);
  };

  const processPendingOperations = function(self) {
      while (self.waiting.length) {
          self.waiting.shift().call(self);
      }
  };

  const executeBatch = function(self, objs, callback) {
      const mappedObjs = (self.isArray(objs) ? objs : [objs]).map(function(o){
          if(!o.key) { o.key = self.uuid(); }
          return o;
      });

      const win = function (e) {
          if (callback) { 
              self.lambda(callback).call(self, self.isArray(objs) ? mappedObjs : mappedObjs[0]); 
          }
      };

      const trans = self.db.transaction(self.record, READ_WRITE);
      const store = trans.objectStore(self.record);

      for (let i = 0; i < mappedObjs.length; i++) {
          store.put(mappedObjs[i], mappedObjs[i].key);
      }
      
      store.transaction.oncomplete = win;
      store.transaction.onabort = handleFailure;
      
      return this;
  };

  const executeGetSingle = function(self, key, callback) {
      const req = self.db.transaction(self.record).objectStore(self.record).get(key);

      req.onsuccess = function(event) {
          req.onsuccess = req.onerror = null;
          const result = event.target.result;
          if (result) { result.key = key; }
          handleSuccess(self, callback, result);
      };
      req.onerror = function(event) {
          req.onsuccess = req.onerror = null;
          handleFailure(event);
      };
  };

  const executeGetMultiple = function(self, keys, callback) {
      const results = [];
      let done = keys.length;
      const keysArray = keys;

      const getOne = function(i) {
          self.get(keysArray[i], function(obj) {
              results[i] = obj;
              if ((--done) > 0) { return; }
              if (callback) {
                  self.lambda(callback).call(self, results);
              }
          });
      };
      for (let i = 0, l = keysArray.length; i < l; i++) {
          getOne(i);
      }
  };

  const executeExists = function(self, key, callback) {
      const req = self.db.transaction(self.record).objectStore(self.record).openCursor(getIDBKeyRange().only(key));

      req.onsuccess = function(event) {
          req.onsuccess = req.onerror = null;
          // exists iff req.result is not null
          // XXX but firefox returns undefined instead, sigh XXX
          const undef = undefined;
          handleSuccess(self, callback, event.target.result !== null && event.target.result !== undef);
      };
      req.onerror = function(event) {
          req.onsuccess = req.onerror = null;
          handleFailure(event);
      };
  };

  const executeAll = function(self, callback) {
      const cb = this.fn(this.name, callback) || undefined;
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
  };

  const executeKeys = function(self, callback) {
      const cb = this.fn(this.name, callback) || undefined;
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
  };

  const executeRemove = function(self, keyOrArray, callback) {
      const toDelete = keyOrArray; 
      if (!this.isArray(keyOrArray)) {
          toDelete=[keyOrArray];
      }

      const win = function () {
          if (callback) self.lambda(callback).call(self);
      };

      const os = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);

      for (let i = 0; i < toDelete.length; i++) {
          const key = toDelete[i].key ? toDelete[i].key : toDelete[i];
          os['delete'](key);
      };

      os.transaction.oncomplete = win;
      os.transaction.onabort = handleFailure;

      return this;
  };

  const executeNuke = function(self, callback) {
      const win = callback ? function() { self.lambda(callback).call(self) } : function(){};
      
      try {
          const os = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);
          os.clear();
          os.transaction.oncomplete = win;
          os.transaction.onabort = handleFailure;
      } catch (e) {
          if (isNotFoundError(e)) {
              win();
          } else {
              handleFailure(e);
          }
      }
      return this;
  };

  return {
    valid: function() {
        return !!getIDB();
    },

    init: function(options, callback) {
        const self = this;

        const cb = self.fn(self.name, callback);
        if (!isCallbackValid(cb)) {
            throw 'callback not valid';
        }

        // queues pending operations
        self.waiting = [];

        // open idb
        self.idb = getIDB();
        const request = self.idb.open(self.name, STORE_VERSION);

        // attach callback handlers
        request.onerror = handleFailure;
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
                autoIncrement: isAutoIncrementSupported()
            });
        }

        // database is ready for use
        function onsuccess(event) {
            // remember the db instance
            self.db = event.target.result;

            // storage is now possible
            self.store = true;

            // execute all pending operations
            processPendingOperations(self);

            // we're done, fire the callback
            if (cb) {
                cb.call(self, self);
            }
        }
    },

    save:function(obj, callback) {
        if (!isStoreAvailable.call(this)) {
            this.waiting.push(function() {
                this.save(obj, callback);
            });
            return;
        }

        const objs = (this.isArray(obj) ? obj : [obj]).map(function(o){
            if(!o.key) { o.key = this.uuid(); }
            return o;
        }.bind(this));

        const win  = function (e) {
            if (callback) { this.lambda(callback).call(this, this.isArray(obj) ? objs : objs[0]) }
        }.bind(this);

        const trans = this.db.transaction(this.record, READ_WRITE);
        const store = trans.objectStore(this.record);

        for (let i = 0; i < objs.length; i++) {
            store.put(objs[i], objs[i].key);
        }
        store.transaction.oncomplete = win;
        store.transaction.onabort = handleFailure;
        
        return this;
    },
    
    batch: function (objs, callback) {
        return executeBatch.call(this, this, objs, callback);
    },
    

    get:function(key, callback) {
        if (!isStoreAvailable.call(this)) {
            this.waiting.push(function() {
                this.get(key, callback);
            });
            return;
        }
        
        
        const self = this;
        const win  = function (e) {
            const r = e.target.result;
            if (callback) {
                if (r) { r.key = key; }
                handleSuccess(self, callback, r);
            }
        };
        
        if (!isKeyArray.call(this, key)){
            executeGetSingle.call(this, this, key, callback);

        } else {

            // note: these are hosted.
            executeGetMultiple.call(this, this, key, callback);
        }

        return this;
    },

    exists:function(key, callback) {
        if (!isStoreAvailable.call(this)) {
            this.waiting.push(function() {
                this.exists(key, callback);
            });
            return;
        }

        const self = this;

        executeExists.call(this, this, key, callback);

        return this;
    },

    all:function(callback) {
        if (!isStoreAvailable.call(this)) {
            this.waiting.push(function() {
                this.all(callback);
            });
            return;
        }
        executeAll.call(this, this, callback);
        return this;
    },

    keys:function(callback) {
        if (!isStoreAvailable.call(this)) {
            this.waiting.push(function() {
                this.keys(callback);
            });
            return;
        }
        executeKeys.call(this, this, callback);
        return this;
    },

    remove:function(keyOrArray, callback) {
        if (!isStoreAvailable.call(this)) {
            this.waiting.push(function() {
                this.remove(keyOrArray, callback);
            });
            return;
        }
        executeRemove.call(this, this, keyOrArray, callback);

        return this;
    },

    nuke:function(callback) {
        if (!isStoreAvailable.call(this)) {
            this.waiting.push(function() {
                this.nuke(callback);
            });
            return;
        }
        executeNuke.call(this, this, callback);
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