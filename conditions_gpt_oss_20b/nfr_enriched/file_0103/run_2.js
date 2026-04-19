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
  const fail = (e, i) => console.error('error in indexed-db adapter!', e, i);
  const useAutoIncrement = () => !!window.indexedDB;

  // Upgrade handler
  const handleUpgrade = (request, self) => {
    self.db = request.result;
    self.transaction = request.transaction;
    try {
      self.db.deleteObjectStore(self.record);
    } catch (e) { /* ignore */ }
    self.db.createObjectStore(self.record, { autoIncrement: useAutoIncrement() });
  };

  // Success handler
  const handleSuccess = (event, self, cb) => {
    self.db = event.target.result;
    self.store = true;
    while (self.waiting.length) {
      self.waiting.shift().call(self);
    }
    if (cb) {
      cb.call(self, self);
    }
  };

  // Prepare objects for saving
  const prepareObjects = (self, obj) => {
    const objs = Array.isArray(obj) ? obj : [obj];
    return objs.map(o => {
      if (!o.key) { o.key = self.uuid(); }
      return o;
    });
  };

  // Success callback for save
  const saveSuccess = (self, callback, objs) => {
    if (callback) {
      self.lambda(callback).call(self, Array.isArray(objs) ? objs : objs[0]);
    }
  };

  // Single get operation
  const getSingle = (self, key, callback) => {
    const req = self.db.transaction(self.record).objectStore(self.record).get(key);
    req.onsuccess = event => {
      req.onsuccess = req.onerror = null;
      const r = event.target.result;
      if (callback) {
        if (r) { r.key = key; }
        self.lambda(callback).call(self, r);
      }
    };
    req.onerror = event => {
      req.onsuccess = req.onerror = null;
      fail(event);
    };
  };

  // Multiple get operation
  const getMultiple = (self, keys, callback) => {
    const results = [];
    let remaining = keys.length;
    const process = (i, key) => {
      self.get(key, obj => {
        results[i] = obj;
        if (--remaining === 0 && callback) {
          self.lambda(callback).call(self, results);
        }
      });
    };
    keys.forEach((k, i) => process(i, k));
  };

  // Delete objects
  const deleteObjects = (self, keys) => {
    const os = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);
    keys.forEach(k => {
      const key = k.key ? k.key : k;
      os.delete(key);
    });
    return os;
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
      request.onupgradeneeded = () => handleUpgrade(request, self);
      request.onsuccess = event => handleSuccess(event, self, cb);
    },

    save: function(obj, callback) {
      const self = this;
      if (!this.store) {
        this.waiting.push(() => this.save(obj, callback));
        return;
      }

      const objs = prepareObjects(self, obj);
      const win = () => saveSuccess(self, callback, objs);

      const trans = this.db.transaction(this.record, READ_WRITE);
      const store = trans.objectStore(this.record);
      objs.forEach(o => store.put(o, o.key));

      store.transaction.oncomplete = win;
      store.transaction.onabort = fail;
      return this;
    },

    batch: function(objs, callback) {
      return this.save(objs, callback);
    },

    get: function(key, callback) {
      if (!this.store) {
        this.waiting.push(() => this.get(key, callback));
        return;
      }
      const self = this;
      if (!this.isArray(key)) {
        getSingle(self, key, callback);
      } else {
        getMultiple(self, key, callback);
      }
      return this;
    },

    exists: function(key, callback) {
      if (!this.store) {
        this.waiting.push(() => this.exists(key, callback));
        return;
      }
      const self = this;
      const req = this.db.transaction(self.record).objectStore(this.record).openCursor(getIDBKeyRange().only(key));
      req.onsuccess = event => {
        req.onsuccess = req.onerror = null;
        const undef = undefined;
        self.lambda(callback).call(self, event.target.result !== null && event.target.result !== undef);
      };
      req.onerror = event => {
        req.onsuccess = req.onerror = null;
        fail(event);
      };
      return this;
    },

    all: function(callback) {
      if (!this.store) {
        this.waiting.push(() => this.all(callback));
        return;
      }
      const cb = this.fn(this.name, callback) || undefined;
      const self = this;
      const objectStore = this.db.transaction(this.record).objectStore(this.record);
      const toReturn = [];
      objectStore.openCursor().onsuccess = event => {
        const cursor = event.target.result;
        if (cursor) {
          toReturn.push(cursor.value);
          cursor['continue']();
        } else if (cb) {
          cb.call(self, toReturn);
        }
      };
      return this;
    },

    keys: function(callback) {
      if (!this.store) {
        this.waiting.push(() => this.keys(callback));
        return;
      }
      const cb = this.fn(this.name, callback) || undefined;
      const self = this;
      const objectStore = this.db.transaction(this.record).objectStore(this.record);
      const toReturn = [];
      objectStore.openCursor().onsuccess = event => {
        const cursor = event.target.result;
        if (cursor) {
          toReturn.push(cursor.key);
          cursor['continue']();
        } else if (cb) {
          cb.call(self, toReturn);
        }
      };
      return this;
    },

    remove: function(keyOrArray, callback) {
      if (!this.store) {
        this.waiting.push(() => this.remove(keyOrArray, callback));
        return;
      }
      const self = this;
      const toDelete = Array.isArray(keyOrArray) ? keyOrArray : [keyOrArray];
      const win = () => {
        if (callback) self.lambda(callback).call(self);
      };
      const os = deleteObjects(self, toDelete);
      os.transaction.oncomplete = win;
      os.transaction.onabort = fail;
      return this;
    },

    nuke: function(callback) {
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

})());