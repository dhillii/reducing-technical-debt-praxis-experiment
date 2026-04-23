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

  const fail = (e, i) => {
    console.error('error in indexed-db adapter!', e, i);
  };

  const useAutoIncrement = () => {
    // using preliminary mozilla implementation which doesn't support
    // auto-generated keys.  Neither do some webkit implementations.
    return !!window.indexedDB;
  };

  return {
    valid: () => {
      return !!getIDB();
    },

    init: (options, callback) => {
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
        } catch (e) {
          // ignore
        }

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

    save: (obj, callback) => {
      const self = this;
      if (!this.store) {
        this.waiting.push(() => {
          this.save(obj, callback);
        });
        return;
      }

      const objs = (this.isArray(obj) ? obj : [obj]).map(o => {
        if (!o.key) {
          o.key = self.uuid();
        }
        return o;
      });

      const win = (e) => {
        if (callback) {
          self.lambda(callback).call(self, this.isArray(obj) ? objs : objs[0]);
        }
      };

      const trans = this.db.transaction(this.record, READ_WRITE);
      const store = trans.objectStore(this.record);

      for (let i = 0; i < objs.length; i++) {
        store.put(objs[i], objs[i].key);
      }

      store.transaction.oncomplete = win;
      store.transaction.onabort = fail;

      return this;
    },

    batch: (objs, callback) => {
      return this.save(objs, callback);
    },

    get: (key, callback) => {
      const self = this;
      if (!this.store) {
        this.waiting.push(() => {
          this.get(key, callback);
        });
        return;
      }

      const win = (e) => {
        const r = e.target.result;
        if (callback) {
          if (r) {
            r.key = key;
          }
          self.lambda(callback).call(self, r);
        }
      };

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
        const results = [];
        let done = key.length;
        const keys = key;

        const getOne = (i) => {
          self.get(keys[i], (obj) => {
            results[i] = obj;
            if ((--done) > 0) {
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

      return this;
    },

    exists: (key, callback) => {
      const self = this;

      if (!this.store) {
        this.waiting.push(() => {
          this.exists(key, callback);
        });
        return;
      }

      const req = this.db.transaction(self.record).objectStore(self.record).openCursor(getIDBKeyRange().only(key));

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

    all: (callback) => {
      const self = this;
      const cb = this.fn(this.name, callback) || undefined;
      const objectStore = this.db.transaction(this.record).objectStore(this.record);
      const toReturn = [];

      objectStore.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          toReturn.push(cursor.value);
          cursor['continue']();
        } else {
          if (cb) {
            cb.call(self, toReturn);
          }
        }
      };
      return this;
    },

    keys: (callback) => {
      const self = this;
      const cb = this.fn(this.name, callback) || undefined;
      const objectStore = this.db.transaction(this.record).objectStore(this.record);
      const toReturn = [];

      objectStore.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          toReturn.push(cursor.key);
          cursor['continue']();
        } else {
          if (cb) {
            cb.call(self, toReturn);
          }
        }
      };
      return this;
    },

    remove: (keyOrArray, callback) => {
      const self = this;

      if (!this.store) {
        this.waiting.push(() => {
          this.remove(keyOrArray, callback);
        });
        return;
      }

      const toDelete = this.isArray(keyOrArray) ? keyOrArray : [keyOrArray];

      const win = () => {
        if (callback) {
          self.lambda(callback).call(self);
        }
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

    nuke: (callback) => {
      const self = this;
      const win = callback ? () => {
        self.lambda(callback).call(self);
      } : () => {};

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

})();