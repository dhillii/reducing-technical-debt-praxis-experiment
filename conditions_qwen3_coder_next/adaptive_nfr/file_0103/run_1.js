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

  var getIDB = function() {
      return window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;
  };

  var getIDBTransaction = function() {
      return window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.oIDBTransaction || window.msIDBTransaction;
  };

  var getIDBKeyRange = function() {
      return window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.oIDBKeyRange || window.msIDBKeyRange;
  };

  // see https://groups.google.com/a/chromium.org/forum/?fromgroups#!topic/chromium-html5/OhsoAQLj7kc
  var READ_WRITE = (getIDBTransaction() && 'READ_WRITE' in getIDBTransaction()) ? getIDBTransaction().READ_WRITE : 'readwrite';

  /**
   * Returns true if IndexedDB is available in the current environment.
   * @returns {boolean}
   */
  function isIndexedDBAvailable() {
      return !!getIDB();
  }

  return {
    valid: function() {
        return isIndexedDBAvailable();
    },

    init: function(options, callback) {
        var self = this;

        var cb = self.fn(self.name, callback);
        if (cb && typeof cb !== 'function') {
            throw 'callback not valid';
        }

        // queues pending operations
        self.waiting = [];

        // open idb
        self.idb = getIDB();
        var request = self.idb.open(self.name, STORE_VERSION);

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
        var self = this;

        if (!this.store) {
            this.waiting.push(function() {
                this.save(obj, callback);
            });
            return this;
        }

        var objs = (this.isArray(obj) ? obj : [obj]).map(function(o){ if (!o.key) { o.key = self.uuid(); } return o; });

        var win = function (e) {
            if (callback) { self.lambda(callback).call(self, self.isArray(obj) ? objs : objs[0]); }
        };

        var trans = this.db.transaction(this.record, READ_WRITE);
        var store = trans.objectStore(this.record);

        for (var i = 0; i < objs.length; i++) {
            store.put(objs[i], objs[i].key);
        }

        store.transaction.oncomplete = win;
        store.transaction.onabort = fail;

        return this;
    },
    
    batch: function (objs, callback) {
        return this.save(objs, callback);
    },
    

    get:function(key, callback) {
        var self = this;

        if (!this.store) {
            this.waiting.push(function() {
                this.get(key, callback);
            });
            return this;
        }

        if (!this.isArray(key)) {
            return performGet(this, key, callback);
        }

        return performBatchGet(this, key, callback);
    },

    /**
     * Performs single-key retrieval from IndexedDB.
     * @param {Object} instance - Lawnchair instance
     * @param {string|number} key - Key to retrieve
     * @param {Function} callback - Callback function
     * @returns {Object} - Lawnchair instance
     */
    performGet: function(instance, key, callback) {
        var req = instance.db.transaction(instance.record).objectStore(instance.record).get(key);
        
        req.onsuccess = function(event) {
            req.onsuccess = req.onerror = null;
            var r = event.target.result;
            if (r) { r.key = key; }
            if (callback) {
                instance.lambda(callback).call(instance, r);
            }
        };
        req.onerror = function(event) {
            req.onsuccess = req.onerror = null;
            fail(event);
        };
        
        return instance;
    },

    /**
     * Performs multi-key retrieval by calling single retrieval for each key.
     * @param {Object} instance - Lawnchair instance
     * @param {Array} keys - Array of keys to retrieve
     * @param {Function} callback - Callback function
     * @returns {Object} - Lawnchair instance
     */
    performBatchGet: function(instance, keys, callback) {
        var results = [];
        var done = keys.length;
        
        var getOne = function(i) {
            instance.get(keys[i], function(obj) {
                results[i] = obj;
                if (--done > 0) { return; }
                if (callback) {
                    instance.lambda(callback).call(instance, results);
                }
            });
        };
        
        for (var i = 0, l = keys.length; i < l; i++) {
            getOne(i);
        }
        
        return instance;
    },

    exists:function(key, callback) {
        var self = this;

        if (!this.store) {
            this.waiting.push(function() {
                this.exists(key, callback);
            });
            return this;
        }

        var req = this.db.transaction(self.record).objectStore(this.record).openCursor(getIDBKeyRange().only(key));

        req.onsuccess = function(event) {
            req.onsuccess = req.onerror = null;
            var result = event.target.result;
            if (callback) {
                self.lambda(callback).call(self, result !== null);
            }
        };
        req.onerror = function(event) {
            req.onsuccess = req.onerror = null;
            fail(event);
        };

        return this;
    },

    all:function(callback) {
        var self = this;

        if (!this.store) {
            this.waiting.push(function() {
                this.all(callback);
            });
            return this;
        }

        var cb = this.fn(this.name, callback);
        var objectStore = this.db.transaction(this.record).objectStore(this.record);
        var toReturn = [];
        
        objectStore.openCursor().onsuccess = function(event) {
          var cursor = event.target.result;
          if (cursor) {
               toReturn.push(cursor.value);
               cursor['continue']();
          } else {
              if (cb) cb.call(self, toReturn);
          }
        };

        return this;
    },

    keys:function(callback) {
        var self = this;

        if (!this.store) {
            this.waiting.push(function() {
                this.keys(callback);
            });
            return this;
        }

        var cb = this.fn(this.name, callback);
        var objectStore = this.db.transaction(this.record).objectStore(this.record);
        var toReturn = [];
        
        objectStore.openCursor().onsuccess = function(event) {
          var cursor = event.target.result;
          if (cursor) {
               toReturn.push(cursor.key);
               cursor['continue']();
          } else {
              if (cb) cb.call(self, toReturn);
          }
        };
        
        return this;
    },

    remove:function(keyOrArray, callback) {
        var self = this;

        if (!this.store) {
            this.waiting.push(function() {
                this.remove(keyOrArray, callback);
            });
            return this;
        }

        var toDelete = this.isArray(keyOrArray) ? keyOrArray : [keyOrArray];
        var win = function () {
            if (callback) self.lambda(callback).call(self);
        };

        var os = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);

        for (var i = 0; i < toDelete.length; i++) {
            var key = toDelete[i].key ? toDelete[i].key : toDelete[i];
            os['delete'](key);
        }

        os.transaction.oncomplete = win;
        os.transaction.onabort = fail;

        return this;
    },

    nuke:function(callback) {
        var self = this;

        if (!this.store) {
            this.waiting.push(function() {
                this.nuke(callback);
            });
            return this;
        }
        
        var win = callback ? function() { self.lambda(callback).call(self) } : function(){};
        
        try {
            var os = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);
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
      // using preliminary mozilla implementation which doesn't support
      // auto-generated keys.  Neither do some webkit implementations.
      return !!window.indexedDB;
  }

})());