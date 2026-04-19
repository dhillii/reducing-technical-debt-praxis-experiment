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

  // see https://groups.google.com/a/chromium.org/forum/?fromgroups#!topic/chromium-html5/OhsoAQLj7kc
  const READ_WRITE = (getIDBTransaction() && 'READ_WRITE' in getIDBTransaction()) ? getIDBTransaction().READ_WRITE : 'readwrite';

  // Helper functions
  const fail = (e, i) => {
    console.error('error in indexed-db adapter!', e, i);
  };

  const useAutoIncrement = () => {
    // using preliminary mozilla implementation which doesn't support
    // auto-generated keys.  Neither do some webkit implementations.
    return !!window.indexedDB;
  };

  // Upgrade handler
  const handleUpgrade = (request, self) => {
    self.db = request.result;
    self.transaction = request.transaction;
    try {
      self.db.deleteObjectStore(self.record);
    } catch (e) { /* ignore */ }
    self.db.createObjectStore(self.record, {
      autoIncrement: useAutoIncrement()
    });
  };

  // Success handler
  const handleSuccess = (event, self, cb) => {
    self.db = event.target.result;
    self.store = true;
    while (self.waiting.length) {
      self.waiting.shift().call(self);
    }
    if (cb) cb.call(self, self);
  };

  // Single get
  const getSingle = function(key, callback) {
    const self = this;
    const win = (e) => {
      const r = e.target.result;
      if (callback) {
        if (r) r.key = key;
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

  // Multiple get
  const getMultiple = function(keys, callback) {
    const self = this;
    const results = [];
    let remaining = keys.length;
    const getOne = (i) => {
      self.get(keys[i], (obj) => {
        results[i] = obj;
        if (--remaining > 0) return;
        if (callback) self.lambda(callback).call(self, results);
      });
    };
    for (let i = 0; i < keys.length; i++) getOne(i);
    return self;
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

      // queues pending operations
      self.waiting = [];

      // open idb
      self.idb = getIDB();
      const request = self.idb.open(self.name, STORE_VERSION);

      // attach callback handlers
      request.onerror = fail;
      request.onupgradeneeded = () => handleUpgrade(request, self);
      request.onsuccess = (event) => handleSuccess(event, self, cb);
    },

    save: function(obj, callback) {
      const self = this;
      if (!self.store) {
        self.waiting.push(() => self.save(obj, callback));
        return self;
      }

      const objs = (self.isArray(obj) ? obj : [obj]).map(o => {
        if (!o.key) o.key = self.uuid();
        return o;
      });

      const win = () => {
        if (callback) self.lambda(callback).call(self, self.isArray(obj) ? objs : objs[0]);
      };

      const trans = self.db.transaction(self.record, READ_WRITE);
      const store = trans.objectStore(self.record);

      for (const o of objs) {
        store.put(o, o.key);
      }

      store.transaction.oncomplete = win;
      store.transaction.onabort = fail;

      return self;
    },

    batch: function(objs, callback) {
      return this.save(objs, callback);
    },

    get: function(key, callback) {
      const self = this;
      if (!self.store) {
        self.waiting.push(() => self.get(key, callback));
        return self;
      }
      if (!self.isArray(key)) {
        return getSingle.call(self, key, callback);
      }
      return getMultiple.call(self, key, callback);
    },

    exists: function(key, callback) {
      if (!this.store) {
        this.waiting.push(() => this.exists(key, callback));
        return this;
      }

      const self = this;
      const req = self.db.transaction(self.record).objectStore(self.record).openCursor(getIDBKeyRange().only(key));

      req.onsuccess = function(event) {
        req.onsuccess = req.onerror = null;
        const undef;
        self.lambda(callback).call(self, event.target.result !== null &&
          event.target.result !== undef);
      };
      req.onerror = function(event) {
        req.onsuccess = req.onerror = null;
        fail(event);
      };

      return this;
    },

    all: function(callback) {
      const self = this;
      if (!self.store) {
        self.waiting.push(() => self.all(callback));
        return self;
      }
      const cb = self.fn(self.name, callback) || undefined;
      const objectStore = self.db.transaction(self.record).objectStore(self.record);
      const toReturn = [];
      objectStore.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          toReturn.push(cursor.value);
          cursor.continue();
        } else {
          if (cb) cb.call(self, toReturn);
        }
      };
      return self;
    },

    keys: function(callback) {
      const self = this;
      if (!self.store) {
        self.waiting.push(() => self.keys(callback));
        return self;
      }
      const cb = self.fn(self.name, callback) || undefined;
      const objectStore = self.db.transaction(self.record).objectStore(self.record);
      const toReturn = [];
      objectStore.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          toReturn.push(cursor.key);
          cursor.continue();
        } else {
          if (cb) cb.call(self, toReturn);
        }
      };
      return self;
    },

    remove: function(keyOrArray, callback) {
      const self = this;
      if (!self.store) {
        self.waiting.push(() => self.remove(keyOrArray, callback));
        return self;
      }

      const keys = self.isArray(keyOrArray) ? keyOrArray : [keyOrArray];
      const win = () => {
        if (callback) self.lambda(callback).call(self);
      };

      const os = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);
      for (const key of keys) {
        const k = key.key ? key.key : key;
        os.delete(k);
      }

      os.transaction.oncomplete = win;
      os.transaction.onabort = fail;

      return self;
    },

    nuke: function(callback) {
      const self = this;
      if (!self.store) {
        self.waiting.push(() => self.nuke(callback));
        return self;
      }

      const win = callback ? () => self.lambda(callback).call(self) : () => {};

      try {
        const os = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);
        os.clear();
        os.transaction.oncomplete = win;
        os.transaction.onabort = fail;
      } catch (e) {
        if (e.name === 'NotFoundError') win();
        else fail(e);
      }

      return self;
    }
  };

})());