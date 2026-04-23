Lawnchair.adapter('indexed-db', (function(){

  // update the STORE_VERSION when the schema used by this adapter changes
  // (for example, if you change the STORE_NAME above)
  // NB: Causes onupgradeneeded to be fired, which erases the old database!
  const STORE_VERSION = 3;

  const getIDB = () => {
      return window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;
  };

  const getIDBTransaction = () => {
      return window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.oIDBTransaction || window.msIDBTransaction;
  };

  const getIDBKeyRange = () => {
      return window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.oIDBKeyRange || window.msIDBKeyRange;
  };

  const READ_WRITE = (getIDBTransaction() && 'READ_WRITE' in getIDBTransaction()) ? getIDBTransaction().READ_WRITE : 'readwrite';

  const logError = (error, context) => {
      console.error('error in indexed-db adapter!', error, context);
  };

  const useAutoIncrement = () => {
      // using preliminary mozilla implementation which doesn't support
      // auto-generated keys.  Neither do some webkit implementations.
      return !!window.indexedDB;
  };

  const handleSuccess = (self, callback, result) => {
      if (callback) {
          self.lambda(callback).call(self, result);
      }
  };

  const handleFailure = (self, error) => {
      logError(error, self.name);
  };

  const handleCursorSuccess = (self, callback, results) => {
      if (callback) {
          self.lambda(callback).call(self, results);
      }
  };

  const handleCursorFailure = (self, error) => {
      logError(error, self.name);
  };

  const handleTransactionComplete = (self, callback) => {
      if (callback) {
          self.lambda(callback).call(self);
      }
  };

  const handleTransactionAbort = (self, error) => {
      logError(error, self.name);
  };

  const handleUpgradeNeeded = (self) => {
      self.db = self.request.result;
      self.transaction = self.request.transaction;

      try {
          self.db.deleteObjectStore(self.record);
      } catch (e) { /* ignore */ }

      self.db.createObjectStore(self.record, {
          autoIncrement: useAutoIncrement()
      });
  };

  const handleDatabaseReady = (self, callback) => {
      self.db = self.request.result;
      self.store = true;

      while (self.waiting.length) {
          self.waiting.shift().call(self);
      }

      if (callback) {
          callback.call(self, self);
      }
  };

  const handleGetSuccess = (self, callback, result) => {
      if (result) {
          result.key = self.request.key;
      }
      handleSuccess(self, callback, result);
  };

  const handleGetFailure = (self, error) => {
      handleFailure(self, error);
  };

  const handleBatchGetSuccess = (self, callback, results) => {
      handleSuccess(self, callback, results);
  };

  const handleBatchGetFailure = (self, error) => {
      handleFailure(self, error);
  };

  const handleExistsSuccess = (self, callback, cursor) => {
      const exists = cursor !== null && cursor !== undefined;
      handleSuccess(self, callback, exists);
  };

  const handleExistsFailure = (self, error) => {
      handleFailure(self, error);
  };

  const handleRemoveSuccess = (self, callback) => {
      handleTransactionComplete(self, callback);
  };

  const handleRemoveFailure = (self, error) => {
      handleTransactionAbort(self, error);
  };

  const handleNukeSuccess = (self, callback) => {
      handleTransactionComplete(self, callback);
  };

  const handleNukeFailure = (self, error) => {
      handleTransactionAbort(self, error);
  };

  const handleSaveSuccess = (self, callback, results) => {
      if (callback) {
          self.lambda(callback).call(self, self.isArray(results) ? results : [results[0]]);
      }
  };

  const handleSaveFailure = (self, error) => {
      handleTransactionAbort(self, error);
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

        request.onerror = () => handleFailure(self, request.error);
        request.onupgradeneeded = () => handleUpgradeNeeded(self);
        request.onsuccess = () => handleDatabaseReady(self, cb);
    },

    save: function(obj, callback) {
        const self = this;
        if(!this.store) {
            this.waiting.push(() => {
                this.save(obj, callback);
            });
            return;
        }

        const objs = (this.isArray(obj) ? obj : [obj]).map(o => {
            if(!o.key) { o.key = self.uuid(); }
            return o;
        });

        const win = () => handleSaveSuccess(self, callback, objs);

        const trans = this.db.transaction(this.record, READ_WRITE);
        const store = trans.objectStore(this.record);

        for (let i = 0; i < objs.length; i++) {
            store.put(objs[i], objs[i].key);
        }

        trans.oncomplete = win;
        trans.onabort = () => handleSaveFailure(self, trans.error);

        return this;
    },

    batch: function (objs, callback) {
        return this.save(objs, callback);
    },

    get: function(key, callback) {
        const self = this;
        if(!this.store) {
            this.waiting.push(() => {
                this.get(key, callback);
            });
            return;
        }

        const win = (e) => handleGetSuccess(self, callback, e.target.result);

        if (!this.isArray(key)){
            const req = this.db.transaction(this.record).objectStore(this.record).get(key);

            req.onsuccess = (event) => {
                req.onsuccess = req.onerror = null;
                win(event);
            };
            req.onerror = (event) => {
                req.onsuccess = req.onerror = null;
                handleGetFailure(self, req.error);
            };
        
        } else {

            const results = [];
            const done = key.length;
            const keys = key;

            const getOne = (i) => {
                self.get(keys[i], (obj) => {
                    results[i] = obj;
                    if ((--done) > 0) { return; }
                    handleBatchGetSuccess(self, callback, results);
                });
            };
            for (let i = 0, l = keys.length; i < l; i++) 
                getOne(i);
        }

        return this;
    },

    exists: function(key, callback) {
        const self = this;

        if(!this.store) {
            this.waiting.push(() => {
                this.exists(key, callback);
            });
            return;
        }

        const req = this.db.transaction(self.record).objectStore(self.record).openCursor(getIDBKeyRange().only(key));

        req.onsuccess = (event) => {
            req.onsuccess = req.onerror = null;
            handleExistsSuccess(self, callback, event.target.result);
        };
        req.onerror = (event) => {
            req.onsuccess = req.onerror = null;
            handleExistsFailure(self, req.error);
        };

        return this;
    },

    all: function(callback) {
        const self = this;
        if(!this.store) {
            this.waiting.push(() => {
                this.all(callback);
            });
            return;
        }
        const cb = this.fn(this.name, callback) || undefined;
        const objectStore = this.db.transaction(this.record).objectStore(this.record);
        const toReturn = [];
        objectStore.openCursor().onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
               toReturn.push(cursor.value);
               cursor['continue']();
          }
          else {
              handleSuccess(self, cb, toReturn);
          }
        };
        return this;
    },

    keys: function(callback) {
        const self = this;
        if(!this.store) {
            this.waiting.push(() => {
                this.keys(callback);
            });
            return;
        }
        const cb = this.fn(this.name, callback) || undefined;
        const objectStore = this.db.transaction(this.record).objectStore(this.record);
        const toReturn = [];
        objectStore.openCursor().onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
               toReturn.push(cursor.key);
               cursor['continue']();
          }
          else {
              handleSuccess(self, cb, toReturn);
          }
        };
        return this;
    },

    remove: function(keyOrArray, callback) {
        const self = this;

        if(!this.store) {
            this.waiting.push(() => {
                this.remove(keyOrArray, callback);
            });
            return;
        }

        const toDelete = keyOrArray; 
        if (!this.isArray(keyOrArray)) {
          toDelete=[keyOrArray];
        }

        const win = () => handleRemoveSuccess(self, callback);

        const os = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);

        for (let i = 0; i < toDelete.length; i++) {
            const key = toDelete[i].key ? toDelete[i].key : toDelete[i];
            os['delete'](key);
        };

        os.transaction.oncomplete = win;
        os.transaction.onabort = () => handleRemoveFailure(self, os.transaction.error);

        return this;
    },

    nuke: function(callback) {
        const self = this;
        
        const win = callback ? () => handleNukeSuccess(self, callback) : () => {};
        
        try {
          const os = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);
          os.clear();
          os.transaction.oncomplete = win;
          os.transaction.onabort = () => handleNukeFailure(self, os.transaction.error);
        } catch (e) {
          if (e.name=='NotFoundError') 
            handleNukeSuccess(self, callback) 
          else 
            handleNukeFailure(self, e);
        }
        return this;
    }
    
  };

})());