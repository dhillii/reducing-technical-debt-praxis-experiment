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
        request.onupgradeneeded = onupgradeneeded;
        request.onsuccess = onsuccess;

        // first start or indexeddb needs a version upgrade
        function onupgradeneeded() {
            self.db = request.result;
            self.transaction = request.transaction;

            // NB! in case of a version conflict, we don't try to migrate,
            // instead just throw away the old store and create a new one.
            // this happens if somebody changed the 
            try {
                self.db.deleteObjectStore(self.record);
            } catch (e) { /* ignore */ }

            // create object store.
            self.db.createObjectStore(self.record, {
                autoIncrement: useAutoIncrement()
            });
        }

        // database is ready for use
        function onsuccess(event) {
            // remember the db instance
            self.db = event.target.result;

            // storage is now possible
            self.store = true;

            // execute all pending operations
            while (self.waiting.length) {
                self.waiting.shift().call(self);
            }

            // we're done, fire the callback
            if (cb) {
                cb.call(self, self);
            }
        }
    },

    save: function(obj, callback) {
        const self = this;
        if (!this.store) {
            this.waiting.push(() => this.save(obj, callback));
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
                self.lambda(callback).call(self, self.isArray(obj) ? objs : objs[0]);
            }
        };

        const trans = this.db.transaction(this.record, READ_WRITE);
        const store = trans.objectStore(this.record);

        objs.forEach(o => {
            store.put(o, o.key);
        });

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
            const done = key.length;
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

            keys.forEach((key, i) => {
                getOne(i);
            });
        }

        return this;
    },

    exists: function(key, callback) {
        if (!this.store) {
            this.waiting.push(() => this.exists(key, callback));
            return;
        }

        const self = this;

        const req = this.db.transaction(self.record).objectStore(self.record).openCursor(getIDBKeyRange().only(key));

        req.onsuccess = (event) => {
            req.onsuccess = req.onerror = null;
            const undef;
            self.lambda(callback).call(self, event.target.result !== null && event.target.result !== undef);
        };
        req.onerror = (event) => {
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

    keys: function(callback) {
        if (!this.store) {
            this.waiting.push(() => this.keys(callback));
            return;
        }

        const cb = this.fn(this.name, callback) || undefined;
        const self = this;
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

    remove: function(keyOrArray, callback) {
        if (!this.store) {
            this.waiting.push(() => this.remove(keyOrArray, callback));
            return;
        }

        const self = this;

        const toDelete = Array.isArray(keyOrArray) ? keyOrArray : [keyOrArray];

        const win = () => {
            if (callback) {
                self.lambda(callback).call(self);
            }
        };

        const os = this.db.transaction(this.record, READ_WRITE).objectStore(this.record);

        toDelete.forEach((key) => {
            os['delete'](key.key || key);
        });

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

  //
  // Helper functions
  //

  function fail(e, i) {
      console.error('error in indexed-db adapter!', e, i);
  }

  function useAutoIncrement() {
      // using preliminary mozilla implementation which doesn't support
      // auto-generated keys.  Neither do some webkit implementations.
      return !!window.indexedDB;
  }

})());