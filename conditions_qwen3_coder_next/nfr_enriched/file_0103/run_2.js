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

  const getIdb = function() {
      return window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;
  };

  const getIdbTransaction = function() {
      return window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.oIDBTransaction || window.msIDBTransaction;
  };

  const getIdbKeyRange = function() {
      return window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.oIDBKeyRange || window.msIDBKeyRange;
  };

  // see https://groups.google.com/a/chromium.org/forum/?fromgroups#!topic/chromium-html5/OhsoAQLj7kc
  const READ_WRITE = (getIdbTransaction() && 'READ_WRITE' in getIdbTransaction()) ? getIdbTransaction().READ_WRITE : 'readwrite';

  return {
    valid: function() {
        return !!getIdb();
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
        self.idb = getIdb();
        const request = self.idb.open(self.name, STORE_VERSION);

        // attach callback handlers
        request.onerror = fail;
        request.onupgradeneeded = onupgradeneeded;
        request.onsuccess = onsuccess;

        // first start or indexeddb needs a version upgrade
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

        // database is ready for use
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
        if(!this.store) {
            this.waiting.push(function() {
                this.save(obj, callback);
            });
            return;
         }

         const objs = ensureArray(obj).map(addKeyIfMissing);

         const win = (e) => {
           if (callback) { self.lambda(callback).call(self, Array.isArray(obj) ? objs : objs[0]); }
         };

         const transaction = this.db.transaction(this.record, READ_WRITE);
         const store = transaction.objectStore(this.record);

         for (const o of objs) {
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
        if(!this.store) {
            this.waiting.push(function() {
                this.get(key, callback);
            });
            return;
        }
        
        const win = (e) => {
            const result = e.target.result;
            if (callback) {
                if (result) { result.key = key; }
                this.lambda(callback).call(this, result);
            }
        }.bind(this);
        
        if (!Array.isArray(key)){
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
            collectMultipleKeys.call(this, key, callback);
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

        const req = this.db.transaction(this.record).objectStore(this.record).openCursor(getIdbKeyRange().only(key));

        req.onsuccess = (event) => {
            req.onsuccess = req.onerror = null;
            const exists = event.target.result !== null;
            this.lambda(callback).call(this, exists);
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
        const objectStore = this.db.transaction(this.record).objectStore(this.record);
        const results = [];
        scanObjectStore(objectStore, results, (data) => {
            if (cb) cb.call(this, data);
        });
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
        const objectStore = this.db.transaction(this.record).objectStore(this.record);
        const resultKeys = [];
        scanObjectStore(objectStore, resultKeys, (keys) => {
            if (cb) cb.call(this, keys);
        }, true);
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

        const toDelete = ensureArray(keyOrArray);

        const win = () => {
          if (callback) self.lambda(callback).call(self);
        };

        const transaction = this.db.transaction(this.record, READ_WRITE);
        const store = transaction.objectStore(this.record);

        for (const item of toDelete) {
          const key = item.key ? item.key : item;
          store['delete'](key);
        }

        store.transaction.oncomplete = win;
        store.transaction.onabort = fail;

        return this;
    },

    nuke:function(callback) {
        if(!this.store) {
            this.waiting.push(function() {
                this.nuke(callback);
            });
            return;
        }
        
        const win = callback ? () => this.lambda(callback).call(this) : () => {};
        
        try {
          const transaction = this.db.transaction(this.record, READ_WRITE);
          const store = transaction.objectStore(this.record);
          store.clear();
          store.transaction.oncomplete = win;
          store.transaction.onabort = fail;
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

  /**
   * Ensures the input is an array; wraps non-array input in an array.
   * @param {*} value - input to ensure as array
   * @returns {Array} array version of the input
   */
  function ensureArray(value) {
      return Array.isArray(value) ? value : [value];
  }

  /**
   * Adds a key to an object if it doesn't already have one, using uuid().
   * @param {Object} obj - object that may need a key
   * @returns {Object} object with guaranteed key property
   */
  function addKeyIfMissing(obj) {
      if (!obj.key) {
          obj.key = this.uuid();
      }
      return obj;
  }

  /**
   * Collects results for multiple get calls asynchronously.
   * @param {Array} keys - array of keys to fetch
   * @param {Function} callback - callback invoked when all results are ready
   */
  function collectMultipleKeys(keys, callback) {
      const results = [];
      let remaining = keys.length;

      const onComplete = () => {
          if (callback) {
              this.lambda(callback).call(this, results);
          }
      };

      for (let i = 0; i < keys.length; i++) {
          this.get(keys[i], (obj) => {
              results[i] = obj;
              remaining--;
              if (remaining === 0) {
                  onComplete();
              }
          });
      }
  }

  /**
   * Scans an object store and collects keys or values.
   * @param {ObjectStore} store - object store instance
   * @param {Array} collector - array to push collected items into
   * @param {Function} onDone - callback when scan completes
   * @param {Boolean} collectKeys - if true, collect keys instead of values
   */
  function scanObjectStore(store, collector, onDone, collectKeys = false) {
      const request = store.openCursor();
      request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
              const item = collectKeys ? cursor.key : cursor.value;
              collector.push(item);
              cursor['continue']();
          } else {
              setTimeout(() => onDone(collector), 0);
          }
      };
  }

})());