```javascript
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

  const getIDB = function() {
      return window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;
  };

  const getIDBTransaction = function() {
      return window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.oIndexedDB || window.msIDBTransaction;
  };

  const getIDBKeyRange = function() {
      return window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.oIndexedDB || window.msIDBTransaction;
  };

  const READ_WRITE = (getIDBTransaction() && 'READ_WRITE' in getIDBTransaction()) ? getIDBTransaction().READ_WRITE : 'readwrite';

  const hasValidCallback = function(cb) {
      return cb && typeof cb === 'function';
  };

  const isStoreReady = function(self) {
      return self.store === true;
  };

  const isSingleKey = function(key) {
      return !this.isArray(key);
  };

  const isNotFoundError = function(e) {
      return e.name === 'NotFoundError';
  };

  const hasResult = function(result) {
      return result !== null && result !== undefined;
  };

  const extractKey = function(obj) {
      return obj.key ? obj.key : obj;
  };

  const extractKeys = function(objs) {
      return (this.isArray(objs) ? objs : [objs]).map(function(o){
          if(!o.key) { o.key = this.uuid(); }
          return o;
      }.bind(this));
  };

  const executeCallback = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithArray = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, this.isArray(data) ? data : data[0]); 
      }
  };

  const executeCallbackWithResults = function(self, callback, results) {
      if (callback) { 
          self.lambda(callback).call(self, results); 
      }
  };

  const executeCallbackWithCursor = function(self, callback, cursor) {
      if (callback) { 
          self.lambda(callback).call(self, cursor); 
      }
  };

  const executeCallbackWithKeys = function(self, callback, keys) {
      if (callback) { 
          self.lambda(callback).call(self, keys); 
      }
  };

  const executeCallbackWithAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorAll = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorRemove = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorNuke = function(self, callback) {
      if (callback) { 
          self.lambda(callback).call(self); 
      }
  };

  const executeCallbackWithCursorExists = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorGet = function(self, callback, result) {
      if (callback) { 
          self.lambda(callback).call(self, result); 
      }
  };

  const executeCallbackWithCursorBatch = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorSave = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self, data); 
      }
  };

  const executeCallbackWithCursorKeys = function(self, callback, data) {
      if (callback) { 
          self.lambda(callback).call(self,