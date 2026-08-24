var getIDB = function() {
    return window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;
};

var getIDBTransaction = function() {
    return window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.oIDBTransaction || window.msIDBTransaction;
};

var getIDBKeyRange = function() {
    return window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.oIDBKeyRange || window.msIDBKeyRange;
};

var isIDBTransactionSupported = function() {
    var tx = getIDBTransaction();
    return !!(tx && 'READ_WRITE' in tx);
};

var getReadWriteBarrierMode = function() {
    return isIDBTransactionSupported() ? getIDBTransaction().READ_WRITE : 'readwrite';
};

var useAutoIncrement = function() {
    return !!window.indexedDB;
};

var isStoreAvailable = function(adapter) {
    return adapter.store === true;
};

var queuePendingOperation = function(adapter, operation) {
    adapter.waiting.push(function() {
        operation.call(adapter);
    });
};

var executeCallback = function(adapter, callback, result) {
    if (typeof callback !== 'function') return;
    adapter.lambda(callback).call(adapter, result);
};

var executeWaitingOperations = function(adapter) {
    while (adapter.waiting.length) {
        adapter.waiting.shift().call(adapter);
    }
};

var processKeyList = function(adapter, keys, callback, processItem) {
    var results = [];
    var done = keys.length;

    var getOne = function(i) {
        processItem(keys[i], function(obj) {
            results[i] = obj;
            if (--done > 0) return;
            executeCallback(adapter, callback, results);
        });
    };

    for (var i = 0, l = keys.length; i < l; i++) {
        getOne(i);
    }
};

var wrapCursorProcessing = function(objectStore, callback, adaptor) {
    objectStore.openCursor().onsuccess = function(event) {
        var cursor = event.target.result;
        if (cursor) {
            callback(cursor);
            cursor['continue']();
        } else {
            executeCallback(adaptor, callback, []);
        }
    };
};

var safeExecuteOnTransactionComplete = function(transaction, oncomplete, onabort) {
    transaction.oncomplete = oncomplete;
    transaction.onabort = onabort;
};

Lawnchair.adapter('indexed-db', (function() {
    var STORE_VERSION = 3;

    return {
        valid: function() {
            return !!getIDB();
        },

        init: function(options, callback) {
            var self = this;
            var cb = self.fn(self.name, callback);

            if (cb && typeof cb !== 'function') {
                throw 'callback not valid';
            }

            self.waiting = [];
            self.idb = getIDB();

            var request = self.idb.open(self.name, STORE_VERSION);
            request.onerror = function(e) { console.error('error in indexed-db adapter!', e); };

            request.onupgradeneeded = function() {
                self.db = request.result;
                self.transaction = request.transaction;

                try { self.db.deleteObjectStore(self.record); } catch (e) {}
                self.db.createObjectStore(self.record, {
                    autoIncrement: useAutoIncrement()
                });
            };

            request.onsuccess = function(event) {
                self.db = event.target.result;
                self.store = true;
                executeWaitingOperations(self);
                executeCallback(self, cb, self);
            };
        },

        save: function(obj, callback) {
            if (!isStoreAvailable(this)) {
                queuePendingOperation(this, function() {
                    this.save(obj, callback);
                });
                return this;
            }

            var objs = (this.isArray(obj) ? obj : [obj]).map(function(o) {
                if (!o.key) o.key = this.uuid();
                return o;
            }.bind(this));

            var onSuccess = function(e) {
                var result = this.isArray(obj) ? objs : objs[0];
                executeCallback(this, callback, result);
            }.bind(this);

            var trans = this.db.transaction(this.record, getReadWriteBarrierMode());
            var store = trans.objectStore(this.record);

            objs.forEach(function(o) {
                store.put(o, o.key);
            });

            store.transaction.oncomplete = onSuccess;
            store.transaction.onabort = function(e) {
                console.error('error in indexed-db adapter!', e);
            };

            return this;
        },

        batch: function(objs, callback) {
            return this.save(objs, callback);
        },

        get: function(key, callback) {
            if (!isStoreAvailable(this)) {
                queuePendingOperation(this, function() {
                    this.get(key, callback);
                });
                return this;
            }

            var self = this;

            if (!this.isArray(key)) {
                var req = this.db.transaction(this.record).objectStore(this.record).get(key);
                req.onsuccess = function(event) {
                    req.onsuccess = req.onerror = null;
                    var result = event.target.result;
                    if (result) result.key = key;
                    executeCallback(self, callback, result);
                };
                req.onerror = function(event) {
                    req.onsuccess = req.onerror = null;
                    console.error('error in indexed-db adapter!', event);
                };
            } else {
                processKeyList(this, key, callback, function(k, cb) {
                    self.get(k, cb);
                });
            }

            return this;
        },

        exists: function(key, callback) {
            if (!isStoreAvailable(this)) {
                queuePendingOperation(this, function() {
                    this.exists(key, callback);
                });
                return this;
            }

            var self = this;
            var keyRange = getIDBKeyRange().only(key);

            var req = this.db.transaction(this.record).objectStore(this.record).openCursor(keyRange);
            req.onsuccess = function(event) {
                req.onsuccess = req.onerror = null;
                var exists = event.target.result !== null;
                executeCallback(self, callback, exists);
            };
            req.onerror = function(event) {
                req.onsuccess = req.onerror = null;
                console.error('error in indexed-db adapter!', event);
            };

            return this;
        },

        all: function(callback) {
            if (!isStoreAvailable(this)) {
                queuePendingOperation(this, function() {
                    this.all(callback);
                });
                return this;
            }

            var objectStore = this.db.transaction(this.record).objectStore(this.record);
            var results = [];
            var cursorHandler = function(cursor) {
                results.push(cursor.value);
                cursor['continue']();
            };

            objectStore.openCursor().onsuccess = function(event) {
                var cursor = event.target.result;
                if (cursor) {
                    cursorHandler(cursor);
                } else {
                    executeCallback(this, callback, results);
                }
            }.bind(this);

            return this;
        },

        keys: function(callback) {
            if (!isStoreAvailable(this)) {
                queuePendingOperation(this, function() {
                    this.keys(callback);
                });
                return this;
            }

            var objectStore = this.db.transaction(this.record).objectStore(this.record);
            var keys = [];
            var cursorHandler = function(cursor) {
                keys.push(cursor.key);
                cursor['continue']();
            };

            objectStore.openCursor().onsuccess = function(event) {
                var cursor = event.target.result;
                if (cursor) {
                    cursorHandler(cursor);
                } else {
                    executeCallback(this, callback, keys);
                }
            }.bind(this);

            return this;
        },

        remove: function(keyOrArray, callback) {
            if (!isStoreAvailable(this)) {
                queuePendingOperation(this, function() {
                    this.remove(keyOrArray, callback);
                });
                return this;
            }

            var self = this;
            var toDelete = this.isArray(keyOrArray) ? keyOrArray : [keyOrArray];
            var keys = toDelete.map(function(item) {
                return item.key ? item.key : item;
            });

            var trans = this.db.transaction(this.record, getReadWriteBarrierMode());
            var store = trans.objectStore(this.record);

            keys.forEach(function(key) {
                store['delete'](key);
            });

            var onSuccess = function() {
                executeCallback(self, callback, {});
            };

            safeExecuteOnTransactionComplete(trans, onSuccess, function() {
                console.error('error in indexed-db adapter!');
            });

            return this;
        },

        nuke: function(callback) {
            if (!isStoreAvailable(this)) {
                queuePendingOperation(this, function() {
                    this.nuke(callback);
                });
                return this;
            }

            var self = this;
            var win = callback ? function() { executeCallback(self, callback, {}); } : function(){};

            try {
                var trans = this.db.transaction(this.record, getReadWriteBarrierMode());
                var store = trans.objectStore(this.record);
                store.clear();
                safeExecuteOnTransactionComplete(trans, win, function() {
                    console.error('error in indexed-db adapter!');
                });
            } catch (e) {
                if (e.name === 'NotFoundError') {
                    win();
                } else {
                    console.error('error in indexed-db adapter!', e);
                }
            }

            return this;
        }
    };
})());