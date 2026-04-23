Lawnchair.adapter('indexed-db', (function(){

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

  const READ_WRITE = (getIDBTransaction() && 'READ_WRITE' in getIDBTransaction()) ? getIDBTransaction().READ_WRITE : 'readwrite';

  /**
   * Checks if store is ready for operations
   * @returns {boolean}
   */
  const isStoreReady = function(store) {
      return !!store;
  };

  /**
   * Checks if key is an array
   * @returns {boolean}
   */
  const isKeyArray = function(key, isArrayFn) {
      return isArrayFn(key);
  };

  /**
   * Checks if result exists in database
   * @returns {boolean}
   */
  const resultExists = function(result) {
      return result !== null && result !== undefined;
  };

  /**
   * Checks if error is NotFoundError
   * @returns {boolean}
   */
  const isNotFoundError = function(error) {
      return error.name === 'NotFoundError';
  };

  /**
   * Extracts key from object or returns the value itself
   * @returns {*}
   */
  const extractKey = function(item) {
      return item.key ? item.key : item;
  };

  /**
   * Ensures object has a key property
   * @returns {object}
   */
  const ensureKeyExists = function(obj, uuidFn) {
      if (!obj.key) {
          obj.key = uuidFn();
      }
      return obj;
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
        
        if (!isStoreReady(this.store)) {
            this.waiting.push(function() {
                this.save(obj, callback);
            });
            return;
        }

        const objs = (this.isArray(obj) ? obj : [obj]).map(function(o) {
            return ensureKeyExists(o, function() { return self.uuid(); });
        });

        const win = function() {
            if (callback) {
                self.lambda(callback).call(self, self.isArray(obj) ? objs : objs[0]);
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
        if (!isStoreReady(this.store)) {
            this.waiting.push(function() {
                this.get(key, callback);
            });
            return;
        }
        
        const self = this;
        const win = function(e) {
            const r = e.target.result;
            if (callback) {
                if (r) {
                    r.key = key;
                }
                self.lambda(callback).call(self, r);
            }
        };
        
        if (!isKeyArray(key, this.isArray.bind(this))) {
            this._getSingleKey(key, win);
        } else {
            this._getMultipleKeys(key, callback, win);
        }

        return this;
    },

    _getSingleKey: function(key, win) {
        const req = this.db.transaction(this.record).objectStore(this.record).get(key);

        req.onsuccess = function(event) {
            req.onsuccess = req.onerror = null;
            win(event);
        };
        req.onerror = function(event) {
            req.onsuccess = req.onerror = null;
            fail(event);
        };
    },

    _getMultipleKeys: function(keys, callback, win) {
        const self = this;
        const results = [];
        let done = keys.length;

        const getOne = function(i) {
            self.get(keys[i], function(obj) {
                results[i] = obj;
                done--;
                if (done > 0) {
                    return;
                }
                if (callback) {
                    self.lambda(callback).call(self, results);
                }
            });
        };

        for (let i = 0; i < keys.length; i++) {
            getOne(i);
        }
    },

    exists:function(key, callback) {
        if (!isStoreReady(this.store)) {
            this.waiting.push(function() {
                this.exists(key, callback);
            });
            return;
        }

        const self = this;
        const req = this.db.transaction(self.record).objectStore(this.record).openCursor(getIDBKeyRange().only(key));

        req.onsuccess = function(event) {
            req.onsuccess = req.onerror = null;
            const exists = resultExists(event.target.result);
            self.lambda(callback).call(self, exists);
        };
        req.onerror = function(event) {
            req.onsuccess = req.onerror = null;
            fail(event);
        };

        return this;
    },

    all:function(callback) {
        if (!isStoreReady(this.store)) {
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
                return;
            }
            if (cb) {
                cb.call(self, toReturn);
            }
        };
        
        return this;
    },

    keys:function(callback) {
        if (!isStoreReady(this.store)) {
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
                return;
            }
            if (cb) {
                cb.call(self, toReturn);
            }
        };
        
        return this;
    },

    remove:function(keyOrArray, callback) {
        if (!isStoreReady(this.store)) {
            this.waiting.push(function() {
                this.remove(keyOrArray, callback);
            });
            return;
        }

        const self = this;
        const toDelete = this.isArray(keyOrArray) ? keyOrArray : [keyOrArray];

        const win = function() {
            if (callback) {
                self.lambda(callback).call(self);
            }
        };

        const os = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);

        for (let i = 0; i < toDelete.length; i++) {
            const key = extractKey(toDelete[i]);
            os['delete'](key);
        }

        os.transaction.oncomplete = win;
        os.transaction.onabort = fail;

        return this;
    },

    nuke:function(callback) {
        if (!isStoreReady(this.store)) {
            this.waiting.push(function() {
                this.nuke(callback);
            });
            return;
        }
        
        const self = this;
        const win = callback ? function() { self.lambda(callback).call(self); } : function(){};
        
        try {
            const os = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);
            os.clear();
            os.transaction.oncomplete = win;
            os.transaction.onabort = fail;
        } catch (e) {
            if (isNotFoundError(e)) {
                win();
            } else {
                fail(e);
            }
        }
        
        return this;
    }
    
  };

  function fail(e, i) {
      console.error('error in indexed-db adapter!', e, i);
  }

  function useAutoIncrement() {
      return !!window.indexedDB;
  }

})());