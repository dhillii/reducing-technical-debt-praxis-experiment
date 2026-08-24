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
            this.waiting.push(() => this.save(obj, callback));
            return;
        }

        const objs = this.prepareObjects(obj);
        const win = this.createSaveCallback(callback, obj, objs);

        const trans = this.db.transaction(this.record, READ_WRITE);
        const store = trans.objectStore(this.record);

        this.putObjects(store, objs);

        store.transaction.oncomplete = win;
        store.transaction.onabort = fail;
        
        return this;
    },
    
    batch: function (objs, callback) {
        return this.save(objs, callback);
    },
    

    get:function(key, callback) {
        if (!this.store) {
            this.waiting.push(() => this.get(key, callback));
            return;
        }
        
        const self = this;
        const win = this.createGetCallback(callback, key);

        if (!this.isArray(key)) {
            const req = this.db.transaction(this.record).objectStore(this.record).get(key);

            req.onsuccess = (event) => {
                req.onsuccess = req.onerror = null;
                win(event);
            };
            req.onerror = (event) => {
                req.onsuccess = req.onerror = null;
                fail(event);
            };
        } else {
            this.getMultipleKeys(key, callback);
        }

        return this;
    },

    exists:function(key, callback) {
        if (!this.store) {
            this.waiting.push(() => this.exists(key, callback));
            return;
        }

        const self = this;
        const req = this.db.transaction(self.record).objectStore(this.record).openCursor(getIDBKeyRange().only(key));

        req.onsuccess = (event) => {
            req.onsuccess = req.onerror = null;
            const undef = undefined;
            self.lambda(callback).call(self, event.target.result !== null && event.target.result !== undef);
        };
        req.onerror = (event) => {
            req.onsuccess = req.onerror = null;
            fail(event);
        };

        return this;
    },

    all:function(callback) {
        if (!this.store) {
            this.waiting.push(() => this.all(callback));
            return;
        }
        const cb = this.fn(this.name, callback) || undefined;
        const self = this;
        const objectStore = this.db.transaction(this.record).objectStore(this.record);
        const toReturn = [];
        objectStore.openCursor().onsuccess = (event) => {
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

    keys:function(callback) {
        if (!this.store) {
            this.waiting.push(() => this.keys(callback));
            return;
        }
        const cb = this.fn(this.name, callback) || undefined;
        const self = this;
        const objectStore = this.db.transaction(this.record).objectStore(this.record);
        const toReturn = [];
        objectStore.openCursor().onsuccess = (event) => {
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

    remove:function(keyOrArray, callback) {
        if (!this.store) {
            this.waiting.push(() => this.remove(keyOrArray, callback));
            return;
        }
        const self = this;

        const toDelete = this.isArray(keyOrArray) ? keyOrArray : [keyOrArray];
        const win = this.createRemoveCallback(callback);

        const os = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);

        this.deleteKeys(os, toDelete);

        os.transaction.oncomplete = win;
        os.transaction.onabort = fail;

        return this;
    },

    nuke:function(callback) {
        if (!this.store) {
            this.waiting.push(() => this.nuke(callback));
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

  // Helper functions

  function fail(e, i) {
      console.error('error in indexed-db adapter!', e, i);
  }

  function useAutoIncrement() {
      return !!window.indexedDB;
  }

  // Extracted helper: Prepare objects for saving
  function prepareObjects(obj) {
      const self = this;
      return (this.isArray(obj) ? obj : [obj]).map(function(o) {
          if (!o.key) { o.key = self.uuid(); }
          return o;
      });
  }

  // Extracted helper: Create save callback
  function createSaveCallback(callback, originalObj, preparedObjs) {
      const self = this;
      return function(e) {
          if (callback) {
              self.lambda(callback).call(self, self.isArray(originalObj) ? preparedObjs : preparedObjs[0]);
          }
      };
  }

  // Extracted helper: Put objects into store
  function putObjects(store, objs) {
      for (let i = 0; i < objs.length; i++) {
          const o = objs[i];
          store.put(o, o.key);
      }
  }

  // Extracted helper: Create get callback
  function createGetCallback(callback, key) {
      const self = this;
      return function(event) {
          const r = event.target.result;
          if (callback) {
              if (r) { r.key = key; }
              self.lambda(callback).call(self, r);
          }
      };
  }

  // Extracted helper: Get multiple keys sequentially
  function getMultipleKeys(keys, callback) {
      const self = this;
      const results = [];
      let done = keys.length;

      function getOne(i) {
          self.get(keys[i], function(obj) {
              results[i] = obj;
              if (--done > 0) { return; }
              if (callback) {
                  self.lambda(callback).call(self, results);
              }
          });
      }

      for (let i = 0, l = keys.length; i < l; i++) {
          getOne(i);
      }
  }

  // Extracted helper: Create remove callback
  function createRemoveCallback(callback) {
      const self = this;
      return function() {
          if (callback) self.lambda(callback).call(self);
      };
  }

  // Extracted helper: Delete keys from store
  function deleteKeys(os, toDelete) {
      for (let i = 0; i < toDelete.length; i++) {
          const key = toDelete[i].key ? toDelete[i].key : toDelete[i];
          os['delete'](key);
      }
  }

})());