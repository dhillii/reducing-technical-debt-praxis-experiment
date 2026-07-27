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

  const getIDB = () => window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;

  const getIDBTransaction = () => window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.oIDBTransaction || window.msIDBTransaction;

  const getIDBKeyRange = () => window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.oIDBKeyRange || window.msIDBKeyRange;

  const READ_WRITE = (getIDBTransaction() && 'READ_WRITE' in getIDBTransaction()) ? getIDBTransaction().READ_WRITE : 'readwrite';

  // Helper functions
  function fail(e, i) {
      console.error('error in indexed-db adapter!', e, i);
  }

  function useAutoIncrement() {
      // using preliminary mozilla implementation which doesn't support
      // auto-generated keys.  Neither do some webkit implementations.
      return !!window.indexedDB;
  }

  // Upgrade handler
  function handleUpgrade(self, request) {
      self.db = request.result;
      self.transaction = request.transaction;
      try {
          self.db.deleteObjectStore(self.record);
      } catch (e) { /* ignore */ }
      self.db.createObjectStore(self.record, {
          autoIncrement: useAutoIncrement()
      });
  }

  // Success handler
  function handleSuccess(self, event, cb) {
      self.db = event.target.result;
      self.store = true;
      while (self.waiting.length) {
          self.waiting.shift().call(self);
      }
      if (cb) {
          cb.call(self, self);
      }
  }

  // Save completion handler
  function handleSaveComplete(self, callback, objs) {
      if (callback) {
          self.lambda(callback).call(self, self.isArray(objs) ? objs : objs[0]);
      }
  }

  // Get single record
  function handleGetSingle(self, key, callback) {
      const win = (e) => {
          const r = e.target.result;
          if (callback) {
              if (r) { r.key = key; }
              self.lambda(callback).call(self, r);
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
  }

  // Get multiple records
  function handleGetMultiple(self, keys, callback) {
      const results = [];
      let remaining = keys.length;
      const getOne = (i) => {
          self.get(keys[i], function(obj) {
              results[i] = obj;
              remaining--;
              if (remaining === 0 && callback) {
                  self.lambda(callback).call(self, results);
              }
          });
      };
      for (let i = 0; i < keys.length; i++) {
          getOne(i);
      }
  }

  // Remove completion handler
  function handleRemoveComplete(self, callback) {
      if (callback) {
          self.lambda(callback).call(self);
      }
  }

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
        request.onupgradeneeded = () => handleUpgrade(self, request);
        request.onsuccess = (event) => handleSuccess(self, event, cb);
    },

    save: function(obj, callback) {
        const self = this;
        if (!this.store) {
            this.waiting.push(function() {
                this.save(obj, callback);
            });
            return;
        }
        const objs = (this.isArray(obj) ? obj : [obj]).map(o => {
            if (!o.key) { o.key = self.uuid(); }
            return o;
        });
        const trans = this.db.transaction(this.record, READ_WRITE);
        const store = trans.objectStore(this.record);
        for (let i = 0; i < objs.length; i++) {
            const o = objs[i];
            store.put(o, o.key);
        }
        store.transaction.oncomplete = () => handleSaveComplete(self, callback, objs);
        store.transaction.onabort = fail;
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
            return;
        }
        if (!this.isArray(key)) {
            handleGetSingle(this, key, callback);
        } else {
            handleGetMultiple(this, key, callback);
        }
        return this;
    },

    exists: function(key, callback) {
        if (!this.store) {
            this.waiting.push(function() {
                this.exists(key, callback);
            });
            return;
        }
        const self = this;
        const req = this.db.transaction(self.record).objectStore(self.record).openCursor(getIDBKeyRange().only(key));
        req.onsuccess = function(event) {
            req.onsuccess = req.onerror = null;
            const undef;
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
            return;
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
            } else {
                if (cb) cb.call(self, toReturn);
            }
        };
        return this;
    },

    keys: function(callback) {
        if (!this.store) {
            this.waiting.push(function() {
                this.keys(callback);
            });
            return;
        }
        const cb = this.fn(this.name, callback) || undefined;
        const self = this;
        const objectStore = this.db.transaction(this.record).objectStore(this.record);
        const toReturn = [];
        objectStore.openCursor().onsuccess = function(event) {
            const cursor = event.target.result;
            if (cursor) {
                toReturn.push(cursor.key);
                cursor['continue']();
            } else {
                if (cb) cb.call(self, toReturn);
            }
        };
        return this;
    },

    remove: function(keyOrArray, callback) {
        if (!this.store) {
            this.waiting.push(function() {
                this.remove(keyOrArray, callback);
            });
            return;
        }
        const self = this;
        const toDelete = this.isArray(keyOrArray) ? keyOrArray : [keyOrArray];
        const os = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);
        for (let i = 0; i < toDelete.length; i++) {
            const key = toDelete[i].key ? toDelete[i].key : toDelete[i];
            os.delete(key);
        }
        os.transaction.oncomplete = () => handleRemoveComplete(self, callback);
        os.transaction.onabort = fail;
        return this;
    },

    nuke: function(callback) {
        if (!this.store) {
            this.waiting.push(function() {
                this.nuke(callback);
            });
            return;
        }
        const self = this;
        const win = callback ? () => self.lambda(callback).call(self) : () => {};
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

})());