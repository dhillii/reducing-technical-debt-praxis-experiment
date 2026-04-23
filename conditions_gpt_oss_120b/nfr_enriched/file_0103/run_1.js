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

  // Helper: log failures
  function fail(e, i) {
      console.error('error in indexed-db adapter!', e, i);
  }

  // Helper: determine if auto‑increment can be used
  function useAutoIncrement() {
      // using preliminary mozilla implementation which doesn't support
      // auto-generated keys.  Neither do some webkit implementations.
      return !!window.indexedDB;
  }

  // Helper: ensure the store is ready; otherwise enqueue the operation
  function readyOrEnqueue(self, operation) {
      if (!self.store) {
          self.waiting.push(operation);
          return false;
      }
      return true;
  }

  // Helper: process queued operations after the DB is ready
  function flushWaitingQueue(self) {
      while (self.waiting.length) {
          self.waiting.shift().call(self);
      }
  }

  // Helper: handle upgrade needed event
  function handleUpgradeNeeded(self, request) {
      self.db = request.result;
      self.transaction = request.transaction;
      try {
          self.db.deleteObjectStore(self.record);
      } catch (e) { /* ignore */ }
      self.db.createObjectStore(self.record, { autoIncrement: useAutoIncrement() });
  }

  // Helper: handle successful open event
  function handleOpenSuccess(self, event, initCallback) {
      self.db = event.target.result;
      self.store = true;
      flushWaitingQueue(self);
      if (initCallback) {
          initCallback.call(self, self);
      }
  }

  // Helper: store objects (single or batch)
  function storeObjects(self, objects, callback) {
      const transaction = self.db.transaction(self.record, READ_WRITE);
      const objectStore = transaction.objectStore(self.record);
      objects.forEach(o => objectStore.put(o, o.key));
      transaction.oncomplete = () => {
          if (callback) {
              self.lambda(callback).call(self, self.isArray(objects) ? objects : objects[0]);
          }
      };
      transaction.onabort = fail;
  }

  // Helper: retrieve a single record
  function retrieveSingle(self, key, callback) {
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
  }

  // Helper: retrieve multiple records
  function retrieveMultiple(self, keys, callback) {
      const results = new Array(keys.length);
      let remaining = keys.length;
      const collect = (index, obj) => {
          results[index] = obj;
          if (--remaining === 0 && callback) {
              self.lambda(callback).call(self, results);
          }
      };
      keys.forEach((k, i) => self.get(k, obj => collect(i, obj)));
  }

  return {
    valid: function() {
        return !!getIDB();
    },

    init: function(options, callback) {
        const self = this;
        const initCb = self.fn(self.name, callback);
        if (initCb && typeof initCb !== 'function') {
            throw 'callback not valid';
        }

        self.waiting = [];
        self.idb = getIDB();
        const request = self.idb.open(self.name, STORE_VERSION);

        request.onerror = fail;
        request.onupgradeneeded = () => handleUpgradeNeeded(self, request);
        request.onsuccess = event => handleOpenSuccess(self, event, initCb);
    },

    save: function(obj, callback) {
        const self = this;
        if (!readyOrEnqueue(self, () => self.save(obj, callback))) {
            return this;
        }

        const objects = (self.isArray(obj) ? obj : [obj]).map(o => {
            if (!o.key) { o.key = self.uuid(); }
            return o;
        });

        storeObjects(self, objects, callback);
        return this;
    },

    batch: function(objs, callback) {
        return this.save(objs, callback);
    },

    get: function(key, callback) {
        const self = this;
        if (!readyOrEnqueue(self, () => self.get(key, callback))) {
            return this;
        }

        if (self.isArray(key)) {
            retrieveMultiple(self, key, callback);
        } else {
            retrieveSingle(self, key, callback);
        }
        return this;
    },

    exists: function(key, callback) {
        const self = this;
        if (!readyOrEnqueue(self, () => self.exists(key, callback))) {
            return this;
        }

        const request = self.db.transaction(self.record).objectStore(self.record)
            .openCursor(getIDBKeyRange().only(key));

        request.onsuccess = event => {
            request.onsuccess = request.onerror = null;
            const result = event.target.result;
            const exists = result !== null && result !== undefined;
            self.lambda(callback).call(self, exists);
        };
        request.onerror = event => {
            request.onsuccess = request.onerror = null;
            fail(event);
        };
        return this;
    },

    all: function(callback) {
        const self = this;
        if (!readyOrEnqueue(self, () => self.all(callback))) {
            return this;
        }

        const cb = self.fn(self.name, callback) || undefined;
        const objectStore = self.db.transaction(self.record).objectStore(self.record);
        const results = [];

        objectStore.openCursor().onsuccess = event => {
            const cursor = event.target.result;
            if (cursor) {
                results.push(cursor.value);
                cursor['continue']();
            } else if (cb) {
                cb.call(self, results);
            }
        };
        return this;
    },

    keys: function(callback) {
        const self = this;
        if (!readyOrEnqueue(self, () => self.keys(callback))) {
            return this;
        }

        const cb = self.fn(self.name, callback) || undefined;
        const objectStore = self.db.transaction(self.record).objectStore(self.record);
        const keys = [];

        objectStore.openCursor().onsuccess = event => {
            const cursor = event.target.result;
            if (cursor) {
                keys.push(cursor.key);
                cursor['continue']();
            } else if (cb) {
                cb.call(self, keys);
            }
        };
        return this;
    },

    remove: function(keyOrArray, callback) {
        const self = this;
        if (!readyOrEnqueue(self, () => self.remove(keyOrArray, callback))) {
            return this;
        }

        const toDelete = self.isArray(keyOrArray) ? keyOrArray : [keyOrArray];
        const transaction = self.db.transaction(self.record, READ_WRITE);
        const objectStore = transaction.objectStore(self.record);

        toDelete.forEach(item => {
            const key = item && item.key ? item.key : item;
            objectStore['delete'](key);
        });

        transaction.oncomplete = () => {
            if (callback) {
                self.lambda(callback).call(self);
            }
        };
        transaction.onabort = fail;
        return this;
    },

    nuke: function(callback) {
        const self = this;
        if (!readyOrEnqueue(self, () => self.nuke(callback))) {
            return this;
        }

        const win = callback ? () => self.lambda(callback).call(self) : () => {};

        try {
            const transaction = self.db.transaction(self.record, READ_WRITE);
            const objectStore = transaction.objectStore(self.record);
            objectStore.clear();
            transaction.oncomplete = win;
            transaction.onabort = fail;
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