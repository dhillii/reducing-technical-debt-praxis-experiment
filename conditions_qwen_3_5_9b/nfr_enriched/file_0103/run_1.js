Lawnchair.adapter('indexed-db', (function(){

  // update the STORE_VERSION when the schema used by this adapter changes
  // (for example, if you change the STORE_NAME above)
  // NB: Causes onupgradeneeded to be fired, which erases the old database!
  var STORE_VERSION = 3;

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

  var fail = function(e, i) {
      console.error('error in indexed-db adapter!', e, i);
  };

  var useAutoIncrement = function() {
      // using preliminary mozilla implementation which doesn't support
      // auto-generated keys.  Neither do some webkit implementations.
      return !!window.indexedDB;
  };

  var createObjectStore = function(db, record) {
      db.createObjectStore(record, {
          autoIncrement: useAutoIncrement()
      });
  };

  var executePendingOperations = function(self) {
      while (self.waiting.length) {
          self.waiting.shift().call(self);
      }
  };

  var fireCallback = function(self, cb, result) {
      if (cb) {
          cb.call(self, result);
      }
  };

  var handleTransactionComplete = function(self, callback) {
      return function() {
          if (callback) {
              self.lambda(callback).call(self);
          }
      };
  };

  var handleTransactionAbort = function(self) {
      return function() {
          fail(this);
      };
  };

  var handleGetSuccess = function(self, callback) {
      return function(event) {
          var result = event.target.result;
          if (result) {
              result.key = event.target.key;
          }
          if (callback) {
              self.lambda(callback).call(self, result);
          }
      };
  };

  var handleGetError = function(self) {
      return function(event) {
          event.target.result = null;
          var successHandler = event.target.onsuccess;
          var errorHandler = event.target.onerror;
          event.target.onsuccess = null;
          event.target.onerror = null;
          if (successHandler) {
              successHandler(event);
          }
          if (errorHandler) {
              errorHandler(event);
          }
      };
  };

  var handleCursorSuccess = function(self, callback, results) {
      return function(event) {
          var cursor = event.target.result;
          if (cursor) {
              results.push(cursor.value);
              cursor['continue']();
          } else {
              if (callback) {
                  callback.call(self, results);
              }
          }
      };
  };

  var handleCursorKeySuccess = function(self, callback, results) {
      return function(event) {
          var cursor = event.target.result;
          if (cursor) {
              results.push(cursor.key);
              cursor['continue']();
          } else {
              if (callback) {
                  callback.call(self, results);
              }
          }
      };
  };

  var handleExistsSuccess = function(self, callback) {
      return function(event) {
          var result = event.target.result !== null && event.target.result !== undefined;
          if (callback) {
              self.lambda(callback).call(self, result);
          }
      };
  };

  var handleExistsError = function(self) {
      return function(event) {
          event.target.result = null;
          var successHandler = event.target.onsuccess;
          var errorHandler = event.target.onerror;
          event.target.onsuccess = null;
          event.target.onerror = null;
          if (successHandler) {
              successHandler(event);
          }
          if (errorHandler) {
              errorHandler(event);
          }
      };
  };

  var handleBatchSuccess = function(self, callback) {
      return function(event) {
          if (callback) {
              self.lambda(callback).call(self);
          }
      };
  };

  var handleBatchAbort = function(self) {
      return function() {
          fail(this);
      };
  };

  var handleNukeSuccess = function(self) {
      return function() {
          if (this.name === 'NotFoundError') {
              return;
          }
          fail(this);
      };
  };

  var handleNukeAbort = function(self) {
      return function() {
          fail(this);
      };
  };

  return {
    valid: function() {
        return !!getIDB();
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
            createObjectStore(self.db, self.record);
        }

        // database is ready for use
        function onsuccess(event) {
            // remember the db instance
            self.db = event.target.result;

            // storage is now possible
            self.store = true;

            // execute all pending operations
            executePendingOperations(self);

            // we're done, fire the callback
            fireCallback(self, cb, self);
        }
    },

    save: function(obj, callback) {
        var self = this;
        if(!this.store) {
            this.waiting.push(function() {
                this.save(obj, callback);
            });
            return;
         }

         var objs = (this.isArray(obj) ? obj : [obj]).map(function(o){if(!o.key) { o.key = self.uuid()} return o})

         var win  = function (e) {
           if (callback) { self.lambda(callback).call(self, self.isArray(obj) ? objs : objs[0] ) }
         };

         var trans = this.db.transaction(this.record, READ_WRITE);
         var store = trans.objectStore(this.record);

         for (var i = 0; i < objs.length; i++) {
          var o = objs[i];
          store.put(o, o.key);
         }
         store.transaction.oncomplete = handleBatchSuccess(self, callback);
         store.transaction.onabort = handleBatchAbort(self);
         
         return this;
    },
    
    batch: function (objs, callback) {
        return this.save(objs, callback);
    },
    

    get: function(key, callback) {
        if(!this.store) {
            this.waiting.push(function() {
                this.get(key, callback);
            });
            return;
        }
        
        
        var self = this;
        var win  = function (e) {
            var r = e.target.result;
            if (callback) {
                if (r) { r.key = key; }
                self.lambda(callback).call(self, r);
            }
        };
        
        if (!this.isArray(key)){
            var req = this.db.transaction(this.record).objectStore(this.record).get(key);

            req.onsuccess = handleGetSuccess(self, callback);
            req.onerror = handleGetError(self);
        
        } else {

            // note: these are hosted.
            var results = []
            ,   done = key.length
            ,   keys = key

            var getOne = function(i) {
                self.get(keys[i], function(obj) {
                    results[i] = obj;
                    if ((--done) > 0) { return; }
                    if (callback) {
                        self.lambda(callback).call(self, results);
                    }
                });
            };
            for (var i = 0, l = keys.length; i < l; i++) 
                getOne(i);
        }

        return this;
    },

    exists: function(key, callback) {
        if(!this.store) {
            this.waiting.push(function() {
                this.exists(key, callback);
            });
            return;
        }

        var self = this;

        var req = this.db.transaction(self.record).objectStore(self.record).openCursor(getIDBKeyRange().only(key));

        req.onsuccess = handleExistsSuccess(self, callback);
        req.onerror = handleExistsError(self);

        return this;
    },

    all: function(callback) {
        if(!this.store) {
            this.waiting.push(function() {
                this.all(callback);
            });
            return;
        }
        var cb = this.fn(this.name, callback) || undefined;
        var self = this;
        var objectStore = this.db.transaction(this.record).objectStore(this.record);
        var toReturn = [];
        objectStore.openCursor().onsuccess = handleCursorSuccess(self, callback, toReturn);
        return this;
    },

    keys: function(callback) {
        if(!this.store) {
            this.waiting.push(function() {
                this.keys(callback);
            });
            return;
        }
        var cb = this.fn(this.name, callback) || undefined;
        var self = this;
        var objectStore = this.db.transaction(this.record).objectStore(this.record);
        var toReturn = [];
        // in theory we could use openKeyCursor() here, but no one actually
        // supports it yet.
        objectStore.openCursor().onsuccess = handleCursorKeySuccess(self, callback, toReturn);
        return this;
    },

    remove: function(keyOrArray, callback) {
        if(!this.store) {
            this.waiting.push(function() {
                this.remove(keyOrArray, callback);
            });
            return;
        }
        var self = this;

        var toDelete = keyOrArray; 
        if (!this.isArray(keyOrArray)) {
          toDelete=[keyOrArray];
        }


        var win = function () {
          if (callback) self.lambda(callback).call(self)
        };

        var os = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);

        var key = keyOrArray.key ? keyOrArray.key : keyOrArray;
        for (var i = 0; i < toDelete.length; i++) {
          var key = toDelete[i].key ? toDelete[i].key : toDelete[i];
          os['delete'](key);
        };

        os.transaction.oncomplete = handleTransactionComplete(self, callback);
        os.transaction.onabort = handleTransactionAbort(self);

        return this;
    },

    nuke: function(callback) {
        if(!this.store) {
            this.waiting.push(function() {
                this.nuke(callback);
            });
            return;
        }
        
        var self = this
        ,   win  = callback ? function() { self.lambda(callback).call(self) } : function(){};
        
        try {
          var os = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);
          os.clear();
          os.transaction.oncomplete = handleNukeSuccess(self);
          os.transaction.onabort = handleNukeAbort(self);
        } catch (e) {
          if (e.name=='NotFoundError') 
            win() 
          else 
            fail(e);
        }
        return this;
    }
    
  };

  //
  // Helper functions
  //

})());