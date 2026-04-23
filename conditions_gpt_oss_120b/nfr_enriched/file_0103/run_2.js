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

  // Helper: ensure the store is ready before executing the core logic
  function withStoreReady(coreFn) {
    return function(...args) {
      if (!this.store) {
        this.waiting.push(() => coreFn.apply(this, args));
        return this;
      }
      return coreFn.apply(this, args);
    };
  }

  // Core implementations (single responsibility)

  function coreValid() {
    return !!getIDB();
  }

  function coreInit(options, callback) {
    const self = this;
    const cb = self.fn(self.name, callback);
    if (cb && typeof cb !== 'function') {
      throw 'callback not valid';
    }

    self.waiting = [];
    self.idb = getIDB();
    const request = self.idb.open(self.name, STORE_VERSION);

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
  }

  function coreSave(obj, callback) {
    const self = this;
    const objects = (this.isArray(obj) ? obj : [obj]).map(o => {
      if (!o.key) { o.key = self.uuid(); }
      return o;
    });

    const transaction = this.db.transaction(this.record, READ_WRITE);
    const store = transaction.objectStore(this.record);

    objects.forEach(o => store.put(o, o.key));

    transaction.oncomplete = () => {
      if (callback) {
        self.lambda(callback).call(self, this.isArray(obj) ? objects : objects[0]);
      }
    };
    transaction.onabort = fail;
    return this;
  }

  function coreBatch(objs, callback) {
    return coreSave.call(this, objs, callback);
  }

  function coreGet(key, callback) {
    if (this.isArray(key)) {
      return coreGetMultiple.call(this, key, callback);
    }
    return coreGetSingle.call(this, key, callback);
  }

  function coreGetSingle(key, callback) {
    const self = this;
    const request = this.db.transaction(this.record).objectStore(this.record).get(key);

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
    return this;
  }

  function coreGetMultiple(keys, callback) {
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
    return this;
  }

  function coreExists(key, callback) {
    const self = this;
    const req = this.db.transaction(this.record).objectStore(this.record).openCursor(getIDBKeyRange().only(key));

    req.onsuccess = event => {
      req.onsuccess = req.onerror = null;
      const exists = event.target.result !== null && event.target.result !== undefined;
      self.lambda(callback).call(self, exists);
    };
    req.onerror = event => {
      req.onsuccess = req.onerror = null;
      fail(event);
    };
    return this;
  }

  function coreAll(callback) {
    const cb = this.fn(this.name, callback) || undefined;
    const self = this;
    const store = this.db.transaction(this.record).objectStore(this.record);
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
    return this;
  }

  function coreKeys(callback) {
    const cb = this.fn(this.name, callback) || undefined;
    const self = this;
    const store = this.db.transaction(this.record).objectStore(this.record);
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
    return this;
  }

  function coreRemove(keyOrArray, callback) {
    const self = this;
    const toDelete = this.isArray(keyOrArray) ? keyOrArray : [keyOrArray];
    const transaction = this.db.transaction(this.record, READ_WRITE);
    const store = transaction.objectStore(this.record);

    toDelete.forEach(item => {
      const key = item && item.key ? item.key : item;
      store['delete'](key);
    });

    transaction.oncomplete = () => {
      if (callback) {
        self.lambda(callback).call(self);
      }
    };
    transaction.onabort = fail;
    return this;
  }

  function coreNuke(callback) {
    const self = this;
    const onComplete = callback ? () => self.lambda(callback).call(self) : () => {};

    try {
      const transaction = this.db.transaction(this.record, READ_WRITE);
      const store = transaction.objectStore(this.record);
      store.clear();
      transaction.oncomplete = onComplete;
      transaction.onabort = fail;
    } catch (e) {
      if (e.name === 'NotFoundError') {
        onComplete();
      } else {
        fail(e);
      }
    }
    return this;
  }

  // Public API with store‑ready wrappers
  return {
    valid: coreValid,

    init: coreInit,

    save: withStoreReady(coreSave),

    batch: withStoreReady(coreBatch),

    get: withStoreReady(coreGet),

    exists: withStoreReady(coreExists),

    all: withStoreReady(coreAll),

    keys: withStoreReady(coreKeys),

    remove: withStoreReady(coreRemove),

    nuke: withStoreReady(coreNuke)
  };

  // Helper functions

  function fail(e) {
    console.error('error in indexed-db adapter!', e);
  }

  function useAutoIncrement() {
    // using preliminary mozilla implementation which doesn't support
    // auto-generated keys.  Neither do some webkit implementations.
    return !!window.indexedDB;
  }

})());