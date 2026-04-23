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

  // --------------------------------------------------------------------
  // Helper functions
  // --------------------------------------------------------------------
  const fail = (e, i) => {
    console.error('error in indexed-db adapter!', e, i);
  };

  const useAutoIncrement = () => {
    // using preliminary mozilla implementation which doesn't support
    // auto-generated keys.  Neither do some webkit implementations.
    return !!window.indexedDB;
  };

  const handleUpgrade = (self, request) => {
    self.db = request.result;
    self.transaction = request.transaction;
    try {
      self.db.deleteObjectStore(self.record);
    } catch (e) { /* ignore */ }
    self.db.createObjectStore(self.record, {
      autoIncrement: useAutoIncrement()
    });
  };

  const handleSuccess = (self, event, cb) => {
    self.db = event.target.result;
    self.store = true;
    while (self.waiting.length) {
      self.waiting.shift().call(self);
    }
    if (cb) {
      cb.call(self, self);
    }
  };

  const processWaiting = (self) => {
    while (self.waiting.length) {
      self.waiting.shift().call(self);
    }
  };

  const saveObjects = (self, objs, callback) => {
    const win = () => {
      if (callback) {
        self.lambda(callback).call(self, self.isArray(objs) ? objs : objs[0]);
      }
    };
    const trans = self.db.transaction(self.record, READ_WRITE);
    const store = trans.objectStore(self.record);
    for (const o of objs) {
      store.put(o, o.key);
    }
    store.transaction.oncomplete = win;
    store.transaction.onabort = fail;
    return self;
  };

  const getSingle = (self, key, callback) => {
    const win = (e) => {
      const r = e.target.result;
      if (callback) {
        if (r) { r.key = key; }
        self.lambda(callback).call(self, r);
      }
    };
    const req = self.db.transaction(self.record).objectStore(self.record).get(key);
    req.onsuccess = (event) => {
      req.onsuccess = req.onerror = null;
      win(event);
    };
    req.onerror = (event) => {
      req.onsuccess = req.onerror = null;
      fail(event);
    };
    return self;
  };

  const getMultiple = (self, keys, callback) => {
    const results = [];
    let remaining = keys.length;
    const processOne = (i) => {
      self.get(keys[i], (obj) => {
        results[i] = obj;
        if (--remaining > 0) { return; }
        if (callback) {
          self.lambda(callback).call(self, results);
        }
      });
    };
    for (let i = 0; i < keys.length; i++) {
      processOne(i);
    }
    return self;
  };

  const existsKey = (self, key, callback) => {
    const req = self.db.transaction(self.record).objectStore(self.record).openCursor(getIDBKeyRange().only(key));
    req.onsuccess = (event) => {
      req.onsuccess = req.onerror = null;
      const undef = undefined;
      self.lambda(callback).call(self, event.target.result !== null &&
        event.target.result !== undef);
    };
    req.onerror = (event) => {
      req.onsuccess = req.onerror = null;
      fail(event);
    };
    return self;
  };

  const getAll = (self, callback) => {
    const cb = self.fn(self.name, callback) || undefined;
    const objectStore = self.db.transaction(self.record).objectStore(self.record);
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
    return self;
  };

  const getKeys = (self, callback) => {
    const cb = self.fn(self.name, callback) || undefined;
    const objectStore = self.db.transaction(self.record).objectStore(self.record);
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
    return self;
  };

  const removeKeys = (self, keyOrArray, callback) => {
    const toDelete = self.isArray(keyOrArray) ? keyOrArray : [keyOrArray];
    const win = () => {
      if (callback) self.lambda(callback).call(self);
    };
    const os = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);
    for (const item of toDelete) {
      const key = item.key ? item.key : item;
      os['delete'](key);
    }
    os.transaction.oncomplete = win;
    os.transaction.onabort = fail;
    return self;
  };

  const nukeDatabase = (self, callback) => {
    const win = callback ? () => { self.lambda(callback).call(self); } : () => {};
    try {
      const os = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);
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
    return self;
  };

  // --------------------------------------------------------------------
  // Adapter implementation
  // --------------------------------------------------------------------
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
      return saveObjects(self, objs, callback);
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
      if (this.isArray(key)) {
        return getMultiple(this, key, callback);
      }
      return getSingle(this, key, callback);
    },

    exists: function(key, callback) {
      if (!this.store) {
        this.waiting.push(function() {
          this.exists(key, callback);
        });
        return;
      }
      return existsKey(this, key, callback);
    },

    all: function(callback) {
      if (!this.store) {
        this.waiting.push(function() {
          this.all(callback);
        });
        return;
      }
      return getAll(this, callback);
    },

    keys: function(callback) {
      if (!this.store) {
        this.waiting.push(function() {
          this.keys(callback);
        });
        return;
      }
      return getKeys(this, callback);
    },

    remove: function(keyOrArray, callback) {
      if (!this.store) {
        this.waiting.push(function() {
          this.remove(keyOrArray, callback);
        });
        return;
      }
      return removeKeys(this, keyOrArray, callback);
    },

    nuke: function(callback) {
      if (!this.store) {
        this.waiting.push(function() {
          this.nuke(callback);
        });
        return;
      }
      return nukeDatabase(this, callback);
    }
  };

})());