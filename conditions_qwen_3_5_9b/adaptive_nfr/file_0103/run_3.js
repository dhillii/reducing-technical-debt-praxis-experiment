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

  const isCallbackValid = function(callback) {
      return callback && typeof callback === 'function';
  };

  const isStoreReady = function(self) {
      return self.store;
  };

  const isKeyArray = function(key) {
      return self.isArray(key);
  };

  const isNotFoundError = function(e) {
      return e.name === 'NotFoundError';
  };

  const hasPendingOperations = function(self) {
      return self.waiting.length > 0;
  };

  const executePendingOperations = function(self) {
      while (self.waiting.length) {
          self.waiting.shift().call(self);
      }
  };

  const fireCallback = function(self, cb, data) {
      if (cb) {
          self.lambda(cb).call(self, data);
      }
  };

  const handleTransactionComplete = function(self, callback) {
      return function() {
          if (callback) {
              self.lambda(callback).call(self);
          }
      };
  };

  const handleTransactionAbort = function(self) {
      return function(event) {
          fail(event);
      };
  };

  const handleCursorSuccess = function(self, callback, results) {
      return function(event) {
          const cursor = event.target.result;
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

  const handleCursorSuccessKeys = function(self, callback, results) {
      return function(event) {
          const cursor = event.target.result;
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

  const handleGetSuccess = function(self, callback) {
      return function(event) {
          const result = event.target.result;
          if (result) {
              result.key = event.target.result.key;
          }
          if (callback) {
              self.lambda(callback).call(self, result);
          }
      };
  };

  const handleGetError = function(self) {
      return function(event) {
          fail(event);
      };
  };

  const handleBatchSuccess = function(self, callback, results) {
      return function(event) {
          if (callback) {
              self.lambda(callback).call(self, self.isArray(results) ? results : results[0]);
          }
      };
  };

  const handleBatchError = function(self) {
      return function(event) {
          fail(event);
      };
  };

  const handleRemoveSuccess = function(self, callback) {
      return function() {
          if (callback) {
              self.lambda(callback).call(self);
          }
      };
  };

  const handleRemoveError = function(self) {
      return function(event) {
          fail(event);
      };
  };

  const handleNukeSuccess = function(self, callback) {
      return function() {
          if (callback) {
              self.lambda(callback).call(self);
          }
      };
  };

  const handleNukeError = function(self) {
      return function(event) {
          fail(event);
      };
  };

  const handleExistsSuccess = function(self, callback) {
      return function(event) {
          const result = event.target.result;
          const isUndefined = result === null || result === undefined;
          if (callback) {
              self.lambda(callback).call(self, !isUndefined);
          }
      };
  };

  const handleExistsError = function(self) {
      return function(event) {
          fail(event);
      };
  };

  const handleUpgradeNeeded = function(self) {
      self.db = self.idb.open(self.name, STORE_VERSION).result;
      self.transaction = self.db.transaction;

      try {
          self.db.deleteObjectStore(self.record);
      } catch (e) {
          // ignore
      }

      self.db.createObjectStore(self.record, {
          autoIncrement: useAutoIncrement()
      });
  };

  const handleOpenSuccess = function(self, callback) {
      self.db = self.idb.open(self.name, STORE_VERSION).result;
      self.store = true;

      if (hasPendingOperations(self)) {
          executePendingOperations(self);
      }

      if (callback) {
          self.lambda(callback).call(self, self);
      }
  };

  const handleOpenError = function(self) {
      fail(self.idb.open(self.name, STORE_VERSION));
  };

  const getOne = function(self, keys, index, results, done) {
      self.get(keys[index], function(obj) {
          results[index] = obj;
          if (done > 0) {
              return;
          }
          if (callback) {
              self.lambda(callback).call(self, results);
          }
      });
  };

  const processBatch = function(self, objs, callback) {
      const results = (self.isArray(objs) ? objs : [objs]).map(function(o){
          if(!o.key) {
              o.key = self.uuid();
          }
          return o;
      });

      const win = function (e) {
          if (callback) {
              self.lambda(callback).call(self, self.isArray(objs) ? results : results[0]);
          }
      };

      const trans = self.db.transaction(self.record, READ_WRITE);
      const store = trans.objectStore(self.record);

      for (let i = 0; i < results.length; i++) {
          const o = results[i];
          store.put(o, o.key);
      }

      store.transaction.oncomplete = win;
      store.transaction.onabort = handleBatchError(self);

      return self;
  };

  const processGet = function(self, key, callback) {
      if (!isKeyArray(self, key)) {
          const req = self.db.transaction(self.record).objectStore(self.record).get(key);

          req.onsuccess = handleGetSuccess(self, callback);
          req.onerror = handleGetError(self);
      } else {
          const results = [];
          const done = key.length;
          const keys = key;

          const getOne = function(i) {
              self.get(keys[i], function(obj) {
                  results[i] = obj;
                  if (done > 0) {
                      return;
                  }
                  if (callback) {
                      self.lambda(callback).call(self, results);
                  }
              });
          };

          for (let i = 0, l = keys.length; i < l; i++) {
              getOne(i);
          }
      }

      return self;
  };

  const processRemove = function(self, keyOrArray, callback) {
      const toDelete = !isKeyArray(self, keyOrArray) ? [keyOrArray] : keyOrArray;

      const win = handleRemoveSuccess(self, callback);

      const os = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);

      for (let i = 0; i < toDelete.length; i++) {
          const key = toDelete[i].key ? toDelete[i].key : toDelete[i];
          os['delete'](key);
      }

      os.transaction.oncomplete = win;
      os.transaction.onabort = handleRemoveError(self);

      return self;
  };

  const processNuke = function(self, callback) {
      const win = handleNukeSuccess(self, callback);

      try {
          const os = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);
          os.clear();
          os.transaction.oncomplete = win;
          os.transaction.onabort = handleNukeError(self);
      } catch (e) {
          if (isNotFoundError(e)) {
              win();
          } else {
              handleNukeError(self)(e);
          }
      }

      return self;
  };

  const processExists = function(self, key, callback) {
      const req = self.db.transaction(self.record).objectStore(self.record).openCursor(getIDBKeyRange().only(key));

      req.onsuccess = handleExistsSuccess(self, callback);
      req.onerror = handleExistsError(self);

      return self;
  };

  const processAll = function(self, callback) {
      const cb = self.fn(self.name, callback) || undefined;
      const objectStore = self.db.transaction(self.record).objectStore(self.record);
      const toReturn = [];

      objectStore.openCursor().onsuccess = handleCursorSuccess(self, cb, toReturn);

      return self;
  };

  const processKeys = function(self, callback) {
      const cb = self.fn(self.name, callback) || undefined;
      const objectStore = self.db.transaction(self.record).objectStore(self.record);
      const toReturn = [];

      objectStore.openCursor().onsuccess = handleCursorSuccessKeys(self, cb, toReturn);

      return self;
  };

  const processSave = function(self, obj, callback) {
      if (!isStoreReady(self)) {
          self.waiting.push(function() {
              self.save(obj, callback);
          });
          return self;
      }

      return processBatch(self, obj, callback);
  };

  const processInit = function(self, options, callback) {
      const cb = self.fn(self.name, callback);
      if (cb && !isCallbackValid(cb)) {
          throw 'callback not valid';
      }

      self.waiting = [];
      self.idb = getIDB();
      const request = self.idb.open(self.name, STORE_VERSION);

      request.onerror = handleOpenError(self);
      request.onupgradeneeded = handleUpgradeNeeded(self);
      request.onsuccess = handleOpenSuccess(self, cb);
  };

  return {
    valid: function() {
        return !!getIDB();
    },

    init: function(options, callback) {
        processInit(this, options, callback);
    },

    save:function(obj, callback) {
        return processSave(this, obj, callback);
    },
    
    batch: function (objs, callback) {
        return processSave(this, objs, callback);
    },
    

    get:function(key, callback) {
        if (!isStoreReady(this)) {
            this.waiting.push(function() {
                this.get(key, callback);
            });
            return this;
        }
        
        return processGet(this, key, callback);
    },

    exists:function(key, callback) {
        if (!isStoreReady(this)) {
            this.waiting.push(function() {
                this.exists(key, callback);
            });
            return this;
        }

        return processExists(this, key, callback);
    },

    all:function(callback) {
        if (!isStoreReady(this)) {
            this.waiting.push(function() {
                this.all(callback);
            });
            return this;
        }
        return processAll(this, callback);
    },

    keys:function(callback) {
        if (!isStoreReady(this)) {
            this.waiting.push(function() {
                this.keys(callback);
            });
            return this;
        }
        return processKeys(this, callback);
    },

    remove:function(keyOrArray, callback) {
        if (!isStoreReady(this)) {
            this.waiting.push(function() {
                this.remove(keyOrArray, callback);
            });
            return this;
        }
        return processRemove(this, keyOrArray, callback);
    },

    nuke:function(callback) {
        if (!isStoreReady(this)) {
            this.waiting.push(function() {
                this.nuke(callback);
            });
            return this;
        }
        return processNuke(this, callback);
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