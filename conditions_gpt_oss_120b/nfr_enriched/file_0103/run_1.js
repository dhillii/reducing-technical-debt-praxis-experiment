/**
 * indexed db adapter
 * === 
 * - originally authored by Vivian Li
 *
 */ 

Lawnchair.adapter('indexed-db', (function () {
    // update the STORE_VERSION when the schema used by this adapter changes
    // (for example, if you change the STORE_NAME above)
    // NB: Causes onupgradeneeded to be fired, which erases the old database!
    const STORE_VERSION = 3;

    const getIDB = () => window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;
    const getIDBTransaction = () => window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.oIDBTransaction || window.msIDBTransaction;
    const getIDBKeyRange = () => window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.oIDBKeyRange || window.msIDBKeyRange;

    // see https://groups.google.com/a/chromium.org/forum/?fromgroups#!topic/chromium-html5/OhsoAQLj7kc
    const READ_WRITE = (getIDBTransaction() && 'READ_WRITE' in getIDBTransaction())
        ? getIDBTransaction().READ_WRITE
        : 'readwrite';

    /** Log errors from IndexedDB operations */
    function fail(e, i) {
        console.error('error in indexed-db adapter!', e, i);
    }

    /** Determine whether to use auto‑increment for the object store */
    function useAutoIncrement() {
        // using preliminary mozilla implementation which doesn't support
        // auto-generated keys.  Neither do some webkit implementations.
        return !!window.indexedDB;
    }

    /** Enqueue an operation if the store isn’t ready yet */
    function enqueueIfNotReady(self, fn) {
        if (!self.store) {
            self.waiting.push(fn);
            return true;
        }
        return false;
    }

    /** Process all queued operations once the store becomes ready */
    function flushWaiting(self) {
        while (self.waiting.length) {
            self.waiting.shift().call(self);
        }
    }

    /** Open the IndexedDB database and wire up event handlers */
    function openDatabase(self, callback) {
        const request = self.idb.open(self.name, STORE_VERSION);
        request.onerror = fail;
        request.onupgradeneeded = () => handleUpgrade(self, request);
        request.onsuccess = (event) => handleSuccess(self, event, callback);
    }

    /** Handle the onupgradeneeded event – recreate the object store */
    function handleUpgrade(self, request) {
        self.db = request.result;
        self.transaction = request.transaction;
        try {
            self.db.deleteObjectStore(self.record);
        } catch (_) { /* ignore */ }
        self.db.createObjectStore(self.record, { autoIncrement: useAutoIncrement() });
    }

    /** Handle the onsuccess event – store reference and run pending ops */
    function handleSuccess(self, event, callback) {
        self.db = event.target.result;
        self.store = true;
        flushWaiting(self);
        if (callback) {
            const cb = self.fn(self.name, callback);
            if (cb) cb.call(self, self);
        }
    }

    /** Save one or many objects to the store */
    function performSave(self, objs, callback) {
        const transaction = self.db.transaction(self.record, READ_WRITE);
        const store = transaction.objectStore(self.record);
        objs.forEach(o => store.put(o, o.key));
        transaction.oncomplete = () => {
            if (callback) self.lambda(callback).call(self, self.isArray(objs) ? objs : objs[0]);
        };
        transaction.onabort = fail;
    }

    /** Retrieve a single record by key */
    function fetchSingle(self, key, callback) {
        const request = self.db.transaction(self.record).objectStore(self.record).get(key);
        request.onsuccess = (event) => {
            request.onsuccess = request.onerror = null;
            const result = event.target.result;
            if (callback) {
                if (result) result.key = key;
                self.lambda(callback).call(self, result);
            }
        };
        request.onerror = (event) => {
            request.onsuccess = request.onerror = null;
            fail(event);
        };
    }

    /** Retrieve multiple records by an array of keys */
    function fetchMultiple(self, keys, callback) {
        const results = new Array(keys.length);
        let remaining = keys.length;
        const collect = (index, obj) => {
            results[index] = obj;
            if (--remaining) return;
            if (callback) self.lambda(callback).call(self, results);
        };
        keys.forEach((k, i) => self.get(k, (obj) => collect(i, obj)));
    }

    /** Check existence of a key */
    function checkExists(self, key, callback) {
        const req = self.db.transaction(self.record).objectStore(self.record).openCursor(getIDBKeyRange().only(key));
        req.onsuccess = (event) => {
            req.onsuccess = req.onerror = null;
            const exists = event.target.result !== null && event.target.result !== undefined;
            self.lambda(callback).call(self, exists);
        };
        req.onerror = (event) => {
            req.onsuccess = req.onerror = null;
            fail(event);
        };
    }

    /** Retrieve all records */
    function fetchAll(self, callback) {
        const objectStore = self.db.transaction(self.record).objectStore(self.record);
        const results = [];
        objectStore.openCursor().onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                results.push(cursor.value);
                cursor['continue']();
            } else if (callback) {
                const cb = self.fn(self.name, callback);
                if (cb) cb.call(self, results);
            }
        };
    }

    /** Retrieve all keys */
    function fetchKeys(self, callback) {
        const objectStore = self.db.transaction(self.record).objectStore(self.record);
        const keys = [];
        objectStore.openCursor().onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                keys.push(cursor.key);
                cursor['continue']();
            } else if (callback) {
                const cb = self.fn(self.name, callback);
                if (cb) cb.call(self, keys);
            }
        };
    }

    /** Delete one or many records */
    function performRemove(self, keysOrArray, callback) {
        const keys = self.isArray(keysOrArray) ? keysOrArray : [keysOrArray];
        const transaction = self.db.transaction(self.record, READ_WRITE);
        const store = transaction.objectStore(self.record);
        keys.forEach(k => {
            const key = k && k.key ? k.key : k;
            store['delete'](key);
        });
        transaction.oncomplete = () => {
            if (callback) self.lambda(callback).call(self);
        };
        transaction.onabort = fail;
    }

    /** Clear the entire store */
    function performNuke(self, callback) {
        const win = callback ? () => self.lambda(callback).call(self) : () => { };
        try {
            const store = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);
            store.clear();
            store.transaction.oncomplete = win;
            store.transaction.onabort = fail;
        } catch (e) {
            if (e.name === 'NotFoundError') win(); else fail(e);
        }
    }

    return {
        valid: function () {
            return !!getIDB();
        },

        init: function (options, callback) {
            const self = this;
            const cb = self.fn(self.name, callback);
            if (cb && typeof cb !== 'function') throw 'callback not valid';
            self.waiting = [];
            self.idb = getIDB();
            openDatabase(self, cb);
        },

        save: function (obj, callback) {
            const self = this;
            if (enqueueIfNotReady(self, () => self.save(obj, callback))) return this;
            const objs = (self.isArray(obj) ? obj : [obj]).map(o => {
                if (!o.key) o.key = self.uuid();
                return o;
            });
            performSave(self, objs, callback);
            return this;
        },

        batch: function (objs, callback) {
            return this.save(objs, callback);
        },

        get: function (key, callback) {
            const self = this;
            if (enqueueIfNotReady(self, () => self.get(key, callback))) return this;
            if (self.isArray(key)) {
                fetchMultiple(self, key, callback);
            } else {
                fetchSingle(self, key, callback);
            }
            return this;
        },

        exists: function (key, callback) {
            const self = this;
            if (enqueueIfNotReady(self, () => self.exists(key, callback))) return this;
            checkExists(self, key, callback);
            return this;
        },

        all: function (callback) {
            const self = this;
            if (enqueueIfNotReady(self, () => self.all(callback))) return this;
            fetchAll(self, callback);
            return this;
        },

        keys: function (callback) {
            const self = this;
            if (enqueueIfNotReady(self, () => self.keys(callback))) return this;
            fetchKeys(self, callback);
            return this;
        },

        remove: function (keyOrArray, callback) {
            const self = this;
            if (enqueueIfNotReady(self, () => self.remove(keyOrArray, callback))) return this;
            performRemove(self, keyOrArray, callback);
            return this;
        },

        nuke: function (callback) {
            const self = this;
            if (enqueueIfNotReady(self, () => self.nuke(callback))) return this;
            performNuke(self, callback);
            return this;
        }
    };
})());