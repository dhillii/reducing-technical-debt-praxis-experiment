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
      request.onupgradeneeded = function() { handleUpgrade.call(self, request); };
      request.onsuccess = function(event) { handleSuccess.call(self, event, cb); };
    },

    save: function(obj, callback) {
      const self = this;
      if (!this.store) {
        this.waiting.push(function() { self.save(obj, callback); });
        return this;
      }

      const objs = (this.isArray(obj) ? obj : [obj]).map(o => {
        if (!o.key) o.key = self.uuid();
        return o;
      });

      const win = function() {
        if (callback) self.lambda(callback).call(self, self.isArray(obj) ? objs : objs[0]);
      };

      const trans = this.db.transaction(this.record, READ_WRITE);
      const store = trans.objectStore(this.record);

      for (const o of objs) {
        store.put(o, o.key);
      }

      store.transaction.oncomplete = win;
      store.transaction.onabort = fail;

      return this;
    },

    batch: function(objs, callback) {
      return this.save(objs, callback);
    },

    get: function(key, callback) {
      const self = this;
      if (!this.store) {
        this.waiting.push(function() { self.get(key, callback); });
        return this;
      }
      if (!this.isArray(key)) {
        return getSingle.call(this, key, callback);
      }
      return getMultiple.call(this, key, callback);
    },

    exists: function(key, callback) {
      const self = this;
      if (!this.store) {
        this.waiting.push(function() { self.exists(key, callback); });
        return this;
      }
      const req = this.db.transaction(this.record).objectStore(this.record).openCursor(getIDBKeyRange().only(key));
      req.onsuccess = function(event) {
        req.onsuccess = req.onerror = null;
        const exists = event.target.result !== null && event.target.result !== undefined;
        self.lambda(callback).call(self, exists);
      };
      req.onerror = function(event) {
        req.onsuccess = req.onerror = null;
        fail(event);
      };
      return this;
    },

    all: function(callback) {
      const self = this;
      if (!this.store) {
        this.waiting.push(function() { self.all(callback); });
        return this;
      }
      const cb = this.fn(this.name, callback) || undefined;
      const objectStore = this.db.transaction(this.record).objectStore(this.record);
      const toReturn = [];
      objectStore.openCursor().onsuccess = function(event) {
        const cursor = event.target.result;
        if (cursor) {
          toReturn.push(cursor.value);
          cursor.continue();
        } else {
          if (cb) cb.call(self, toReturn);
        }
      };
      return this;
    },

    keys: function(callback) {
      const self = this;
      if (!this.store) {
        this.waiting.push(function() { self.keys(callback); });
        return this;
      }
      const cb = this.fn(this.name, callback) || undefined;
      const objectStore = this.db.transaction(this.record).objectStore(this.record);
      const toReturn = [];
      objectStore.openCursor().onsuccess = function(event) {
        const cursor = event.target.result;
        if (cursor) {
          toReturn.push(cursor.key);
          cursor.continue();
        } else {
          if (cb) cb.call(self, toReturn);
        }
      };
      return this;
    },

    remove: function(keyOrArray, callback) {
      const self = this;
      if (!this.store) {
        this.waiting.push(function() { self.remove(keyOrArray, callback); });
        return this;
      }
      const toDelete = this.isArray(keyOrArray) ? keyOrArray : [keyOrArray];
      const win = function() {
        if (callback) self.lambda(callback).call(self);
      };
      const os = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);
      for (const item of toDelete) {
        const key = item.key ? item.key : item;
        os.delete(key);
      }
      os.transaction.oncomplete = win;
      os.transaction.onabort = fail;
      return this;
    },

    nuke: function(callback) {
      const self = this;
      if (!this.store) {
        this.waiting.push(function() { self.nuke(callback); });
        return this;
      }
      const win = callback ? function() { self.lambda(callback).call(self); } : function(){};
      try {
        const os = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);
        os.clear();
        os.transaction.oncomplete = win;
        os.transaction.onabort = fail;
      } catch (e) {
        if (e.name === 'NotFoundError') win();
        else fail(e);
      }
      return this;
    }
  };

  // --------------------------------------------------------------------
  // Helper functions
  // --------------------------------------------------------------------

  function fail(e, i) {
    console.error('error in indexed-db adapter!', e, i);
  }

  function useAutoIncrement() {
    // using preliminary mozilla implementation which doesn't support
    // auto-generated keys.  Neither do some webkit implementations.
    return !!window.indexedDB;
  }

  // --------------------------------------------------------------------
  // Upgrade and success handlers for init
  // --------------------------------------------------------------------

  function handleUpgrade(request) {
    this.db = request.result;
    this.transaction = request.transaction;
    try {
      this.db.deleteObjectStore(this.record);
    } catch (e) { /* ignore */ }
    this.db.createObjectStore(this.record, { autoIncrement: useAutoIncrement() });
  }

  function handleSuccess(event, cb) {
    this.db = event.target.result;
    this.store = true;
    while (this.waiting.length) {
      this.waiting.shift().call(this);
    }
    if (cb) cb.call(this, this);
  }

  // --------------------------------------------------------------------
  // Get helpers
  // --------------------------------------------------------------------

  function getSingle(key, callback) {
    const self = this;
    const win = function(e) {
      const r = e.target.result;
      if (callback) {
        if (r) r.key = key;
        self.lambda(callback).call(self, r);
      }
    };
    const req = this.db.transaction(this.record).objectStore(this.record).get(key);
    req.onsuccess = function(event) {
      req.onsuccess = req.onerror = null;
      win(event);
    };
    req.onerror = function(event) {
      req.onsuccess = req.onerror = null;
      fail(event);
    };
    return this;
  }

  function getMultiple(keys, callback) {
    const self = this;
    const results = [];
    let remaining = keys.length;
    const getOne = function(i) {
      self.get(keys[i], function(obj) {
        results[i] = obj;
        if (--remaining > 0) return;
        if (callback) self.lambda(callback).call(self, results);
      });
    };
    for (let i = 0; i < keys.length; i++) getOne(i);
    return this;
  }

})();