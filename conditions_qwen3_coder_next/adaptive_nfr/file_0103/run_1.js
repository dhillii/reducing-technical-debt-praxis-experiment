'use strict';
Lawnchair.adapter('indexed-db', (function(){

  var STORE_VERSION = 3;

  function isIDBAvailable() {
      return !!(window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB);
  }

  function isIDBTransactionAvailable() {
      return window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.oIDBTransaction || window.msIDBTransaction;
  }

  function isIDBKeyRangeAvailable() {
      return window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.oIDBKeyRange || window.msIDBKeyRange;
  }

  function getReadType() {
      var trans = isIDBTransactionAvailable();
      if (trans && 'READ_WRITE' in trans) {
          return trans.READ_WRITE;
      }
      return 'readwrite';
  }

  var READ_WRITE = getReadType();

  return {
    valid: function() {
        return isIDBAvailable();
    },

    init: function(options, callback) {
        var self = this;
        var cb = self.fn(self.name, callback);
        if (cb && typeof cb !== 'function') {
            throw 'callback not valid';
        }

        self.waiting = [];
        self.idb = isIDBAvailable() && (window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB);
        var request = self.idb.open(self.name, STORE_VERSION);

        request.onerror = fail;
        request.onupgradeneeded = function() { handleUpgrade(self, request); };
        request.onsuccess = function(event) { handleSuccess(self, request, cb); };
    },

    save: function(obj, callback) {
        var self = this;
        if (!self.store) {
            self.waiting.push(function() { self.save(obj, callback); });
            return;
        }

        var objs = ensureArray(obj, self);
        objs = objs.map(function(o) { return ensureKey(o, self); });

        var win = function(e) {
            if (callback) {
                self.lambda(callback).call(self, Array.isArray(obj) ? objs : objs[0]);
            }
        };

        var trans = self.db.transaction(self.record, READ_WRITE);
        var store = trans.objectStore(self.record);

        for (var i = 0; i < objs.length; i++) {
            store.put(objs[i], objs[i].key);
        }

        store.transaction.oncomplete = win;
        store.transaction.onabort = fail;

        return this;
    },

    batch: function(objs, callback) {
        return this.save(objs, callback);
    },

    get: function(key, callback) {
        var self = this;
        if (!self.store) {
            self.waiting.push(function() { self.get(key, callback); });
            return;
        }

        if (!Array.isArray(key)) {
            executeSingleGet(self, key, callback);
            return;
        }

        executeMultiGet(self, key, callback);
        return this;
    },

    exists: function(key, callback) {
        var self = this;
        if (!self.store) {
            self.waiting.push(function() { self.exists(key, callback); });
            return;
        }

        var req = self.db.transaction(self.record).objectStore(self.record).openCursor(getIDBKeyRange().only(key));

        req.onsuccess = function(event) {
            req.onsuccess = req.onerror = null;
            var isDefined = event.target.result !== null &&
                            typeof event.target.result !== 'undefined';
            self.lambda(callback).call(self, isDefined);
        };
        req.onerror = function(event) {
            req.onsuccess = req.onerror = null;
            fail(event);
        };

        return this;
    },

    all: function(callback) {
        var self = this;
        if (!self.store) {
            self.waiting.push(function() { self.all(callback); });
            return;
        }

        var objectStore = self.db.transaction(self.record).objectStore(self.record);
        var callbackFn = self.fn(self.name, callback);
        var results = [];

        objectStore.openCursor().onsuccess = function(event) {
            var cursor = event.target.result;
            if (cursor) {
                results.push(cursor.value);
                cursor['continue']();
                return;
            }
            if (callbackFn) {
                callbackFn.call(self, results);
            }
        };

        return this;
    },

    keys: function(callback) {
        var self = this;
        if (!self.store) {
            self.waiting.push(function() { self.keys(callback); });
            return;
        }

        var objectStore = self.db.transaction(self.record).objectStore(self.record);
        var callbackFn = self.fn(self.name, callback);
        var results = [];

        objectStore.openCursor().onsuccess = function(event) {
            var cursor = event.target.result;
            if (cursor) {
                results.push(cursor.key);
                cursor['continue']();
                return;
            }
            if (callbackFn) {
                callbackFn.call(self, results);
            }
        };

        return this;
    },

    remove: function(keyOrArray, callback) {
        var self = this;
        if (!self.store) {
            self.waiting.push(function() { self.remove(keyOrArray, callback); });
            return;
        }

        var toDelete = Array.isArray(keyOrArray) ? keyOrArray : [keyOrArray];
        var win = function() {
            if (callback) self.lambda(callback).call(self);
        };

        var os = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);

        for (var i = 0; i < toDelete.length; i++) {
            var key = isObjectWithKey(toDelete[i]) ? toDelete[i].key : toDelete[i];
            os['delete'](key);
        }

        os.transaction.oncomplete = win;
        os.transaction.onabort = fail;
        return this;
    },

    nuke: function(callback) {
        var self = this;
        if (!self.store) {
            self.waiting.push(function() { self.nuke(callback); });
            return;
        }

        var win = callback ? function() { self.lambda(callback).call(self); } : function(){};

        try {
            var os = self.db.transaction(self.record, READ_WRITE).objectStore(self.record);
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

  function getIDBKeyRange() {
      return isIDBKeyRangeAvailable();
  }

  function handleUpgrade(self, request) {
      self.db = request.result;
      self.transaction = request.transaction;

      try {
          self.db.deleteObjectStore(self.record);
      } catch (e) {
          // ignore
      }

      self.db.createObjectStore(self.record, {
          autoIncrement: useAutoIncrement()
      });
  }

  function handleSuccess(self, request, cb) {
      self.db = request.result;
      self.store = true;

      while (self.waiting.length) {
          self.waiting.shift().call(self);
      }

      if (cb) {
          cb.call(self, self);
      }
  }

  function executeSingleGet(self, key, callback) {
      var req = self.db.transaction(self.record).objectStore(self.record).get(key);

      req.onsuccess = function(event) {
          req.onsuccess = req.onerror = null;
          var result = event.target.result;
          if (callback) {
              if (result) { result.key = key; }
              self.lambda(callback).call(self, result);
          }
      };

      req.onerror = function(event) {
          req.onsuccess = req.onerror = null;
          fail(event);
      };
  }

  function executeMultiGet(self, keys, callback) {
      var results = [];
      var remaining = keys.length;

      function getOne(i) {
          self.get(keys[i], function(obj) {
              results[i] = obj;
              if (--remaining > 0) { return; }
              if (callback) {
                  self.lambda(callback).call(self, results);
              }
          });
      }

      for (var i = 0; i < keys.length; i++) {
          getOne(i);
      }
  }

  function ensureArray(obj, self) {
      return Array.isArray(obj) ? obj : [obj];
  }

  function ensureKey(o, self) {
      if (!o.key) { o.key = self.uuid(); }
      return o;
  }

  function isObjectWithKey(obj) {
      return typeof obj === 'object' && obj !== null && 'key' in obj;
  }

  function useAutoIncrement() {
      return !!window.indexedDB;
  }

  function fail(e, i) {
      console.error('error in indexed-db adapter!', e, i);
  }

})());