/**
 * indexed db adapter
 * === 
 * - originally authored by Vivian Li
 *
 */ 

Lawnchair.adapter('indexed-db', (function(){

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
    return !!window.indexedDB;
  }

  return {
    valid: function () {
      return !!getIDB();
    },

    init: function (options, callback) {
      const self = this;
      const cb = self.fn(self.name, callback);
      if (cb && typeof cb !== 'function') {
        throw 'callback not valid';
      }

      self.waiting = [];

      const idb = getIDB();
      const request = idb.open(self.name, STORE_VERSION);

      request.onerror = fail;
      request.onupgradeneeded = function () {
        self.db = request.result;
        self.transaction = request.transaction;
        try {
          self.db.deleteObjectStore(self.record);
        } catch (e) { /* ignore */ }
        self.db.createObjectStore(self.record, {
          autoIncrement: useAutoIncrement()
        });
      };

      request.onsuccess = function (event) {
        self.db = event.target.result;
        self.store = true;
        while (self.waiting.length) {
          self.waiting.shift().call(self);
        }
        if (cb) {
          cb.call(self, self);
        }
      };
    },

    save: function (obj, callback) {
      const self = this;
      if (!this.store) {
        this.waiting.push(function () {
          this.save(obj, callback);
        });
        return;
      }

      const objs = (this.isArray(obj) ? obj : [obj]).map(function (o) {
        if (!o.key) { o.key = self.uuid(); }
        return o;
      });

      const win = function () {
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

    get: function (key, callback) {
      if (!this.store) {
        this.waiting.push(function () {
          this.get(key, callback);
        });
        return;
      }

      const self = this;
      const win = function (e) {
        const r = e.target.result;
        if (callback) {
          if (r) { r.key = key; }
          self.lambda(callback).call(self, r);
        }
      };

      if (!this.isArray(key)) {
        const req = this.db.transaction(this.record).objectStore(this.record).get(key);
        req.onsuccess = function (event) {
          req.onsuccess = req.onerror = null;
          win(event);
        };
        req.onerror = function (event) {
          req.onsuccess = req.onerror = null;
          fail(event);
        };
      } else {
        const results = [];
        let remaining = key.length;
        const keys = key;

        const getOne = function (i) {
          self.get(keys[i], function (obj) {
            results[i] = obj;
            if (--remaining > 0) { return; }
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

    exists: function (key, callback) {
      if (!this.store) {
        this.waiting.push(function () {
          this.exists(key, callback);
        });
        return;
      }

      const self = this;
      const req = this.db.transaction(self.record).objectStore(this.record).openCursor(getIDBKeyRange().only(key));

      req.onsuccess = function (event) {
        req.onsuccess = req.onerror = null;
        const undef;
        self.lambda(callback).call(self, event.target.result !== null && event.target.result !== undef);
      };
      req.onerror = function (event) {
        req.onsuccess = req.onerror = null;
        fail(event);
      };

      return this;
    },

    all: function (callback) {
      if (!this.store) {
        this.waiting.push(function () {
          this.all(callback);
        });
        return;
      }
      const cb = this.fn(this.name, callback) || undefined;
      const self = this;
      const objectStore = this.db.transaction(this.record).objectStore(this.record);
      const toReturn = [];
      objectStore.openCursor().onsuccess = function (event) {
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

    keys: function (callback) {
      if (!this.store) {
        this.waiting.push(function () {
          this.keys(callback);
        });
        return;
      }
      const cb = this.fn(this.name, callback) || undefined;
      const self = this;
      const objectStore = this.db.transaction(this.record).objectStore(this.record);
      const toReturn = [];
      objectStore.openCursor().onsuccess = function (event) {
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

    remove: function (keyOrArray, callback) {
      if (!this.store) {
        this.waiting.push(function () {
          this.remove(keyOrArray, callback);
        });
        return;
      }
      const self = this;
      const toDelete = this.isArray(keyOrArray) ? keyOrArray : [keyOrArray];
      const win = function () {
        if (callback) self.lambda(callback).call(self);
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

    nuke: function (callback) {
      if (!this.store) {
        this.waiting.push(function () {
          this.nuke(callback);
        });
        return;
      }
      const self = this;
      const win = callback ? function () { self.lambda(callback).call(self); } : function () { };
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