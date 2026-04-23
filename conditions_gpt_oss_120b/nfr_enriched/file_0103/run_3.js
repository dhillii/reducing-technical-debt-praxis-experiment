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

  // see https://groups.google.com/a/chromium.org/forum/?fromgroups#!topic/chromium-html5/OhsoAQLj7kc
  const READ_WRITE = (getIDBTransaction() && 'READ_WRITE' in getIDBTransaction()) ? getIDBTransaction().READ_WRITE : 'readwrite';

  /**
   * Enqueue operation if the store is not ready, otherwise execute it.
   */
  function withStoreReady(self, fn, args) {
    if (!self.store) {
      self.waiting.push(() => fn.apply(self, args));
      return;
    }
    return fn.apply(self, args);
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

      // queues pending operations
      self.waiting = [];

      // open idb
      self.idb = getIDB();
      const request = self.idb.open(self.name, STORE_VERSION);

      // attach callback handlers
      request.onerror = fail;
      request.onupgradeneeded = onUpgradeNeeded;
      request.onsuccess = onSuccess;

      function onUpgradeNeeded() {
        self.db = request.result;
        self.transaction = request.transaction;
        try {
          self.db.deleteObjectStore(self.record);
        } catch (e) { /* ignore */ }
        self.db.createObjectStore(self.record, { autoIncrement: useAutoIncrement() });
      }

      function onSuccess(event) {
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

    save: function(obj, callback) {
      const self = this;
      return withStoreReady(self, function() {
        const objects = (self.isArray(obj) ? obj : [obj]).map(o => {
          if (!o.key) { o.key = self.uuid(); }
          return o;
        });

        const transaction = self.db.transaction(self.record, READ_WRITE);
        const store = transaction.objectStore(self.record);

        objects.forEach(o => store.put(o, o.key));

        transaction.oncomplete = () => {
          if (callback) {
            self.lambda(callback).call(self, self.isArray(obj) ? objects : objects[0]);
          }
        };
        transaction.onabort = fail;
        return self;
      }, []);
    },

    batch: function(objs, callback) {
      return this.save(objs, callback);
    },

    get: function(key, callback) {
      const self = this;
      return withStoreReady(self, function() {
        if (self.isArray(key)) {
          return getMultipleKeys.call(self, key, callback);
        }
        return getSingleKey.call(self, key, callback);
      }, []);
    },

    exists: function(key, callback) {
      const self = this;
      return withStoreReady(self, function() {
        const req = self.db.transaction(self.record).objectStore(self.record)
          .openCursor(getIDBKeyRange().only(key));

        req.onsuccess = event => {
          req.onsuccess = req.onerror = null;
          const exists = event.target.result !== null && event.target.result !== undefined;
          self.lambda(callback).call(self, exists);
        };
        req.onerror = event => {
          req.onsuccess = req.onerror = null;
          fail(event);
        };
        return self;
      }, []);
    },

    all: function(callback) {
      const self = this;
      return withStoreReady(self, function() {
        const cb = self.fn(self.name, callback) || undefined;
        const store = self.db.transaction(self.record).objectStore(self.record);
        const results = [];

        store.openCursor().onsuccess = event => {
          const cursor = event.target.result;
          if (cursor) {
            results.push(cursor.value);
            cursor['continue']();
          } else if (cb) {
            cb.call(self, results);
          }
        };
        return self;
      }, []);
    },

    keys: function(callback) {
      const self = this;
      return withStoreReady(self, function() {
        const cb = self.fn(self.name, callback) || undefined;
        const store = self.db.transaction(self.record).objectStore(self.record);
        const keys = [];

        store.openCursor().onsuccess = event => {
          const cursor = event.target.result;
          if (cursor) {
            keys.push(cursor.key);
            cursor['continue']();
          } else if (cb) {
            cb.call(self, keys);
          }
        };
        return self;
      }, []);
    },

    remove: function(keyOrArray, callback) {
      const self = this;
      return withStoreReady(self, function() {
        const toDelete = self.isArray(keyOrArray) ? keyOrArray : [keyOrArray];
        const transaction = self.db.transaction(self.record, READ_WRITE);
        const store = transaction.objectStore(self.record);

        toDelete.forEach(item => {
          const delKey = item && item.key ? item.key : item;
          store['delete'](delKey);
        });

        transaction.oncomplete = () => {
          if (callback) {
            self.lambda(callback).call(self);
          }
        };
        transaction.onabort = fail;
        return self;
      }, []);
    },

    nuke: function(callback) {
      const self = this;
      return withStoreReady(self, function() {
        const win = callback ? () => self.lambda(callback).call(self) : () => {};
        try {
          const store = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);
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
        return self;
      }, []);
    }
  };

  //
  // Helper functions
  //

  function fail(e) {
    console.error('error in indexed-db adapter!', e);
  }

  function useAutoIncrement() {
    // using preliminary mozilla implementation which doesn't support
    // auto-generated keys.  Neither do some webkit implementations.
    return !!window.indexedDB;
  }

  function getSingleKey(key, callback) {
    const self = this;
    const request = self.db.transaction(self.record).objectStore(self.record).get(key);
    request.onsuccess = event => {
      request.onsuccess = request.onerror = null;
      const result = event.target.result;
      if (callback) {
        if (result) { result.key = key; }
        self.lambda(callback).call(self, result);
      }
    };
    request.onerror = event => {
      request.onsuccess = request.onerror = null;
      fail(event);
    };
    return self;
  }

  function getMultipleKeys(keys, callback) {
    const self = this;
    const results = new Array(keys.length);
    let remaining = keys.length;

    const collect = (index, obj) => {
      results[index] = obj;
      if (--remaining === 0 && callback) {
        self.lambda(callback).call(self, results);
      }
    };

    keys.forEach((k, i) => {
      self.get(k, obj => collect(i, obj));
    });
    return self;
  }

})());