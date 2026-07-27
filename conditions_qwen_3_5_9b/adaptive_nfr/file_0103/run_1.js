Lawnchair.adapter('indexed-db', (function(){

  /**
   * @type {number}
   */
  var STORE_VERSION = 3;

  /**
   * @returns {IndexedDB}
   */
  var getIDB = function() {
      return window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.oIndexedDB || window.msIndexedDB;
  };

  /**
   * @returns {IDBTransaction}
   */
  var getIDBTransaction = function() {
      return window.IDBTransaction || window.webkitIDBTransaction || window.mozIDBTransaction || window.oIDBTransaction || window.msIDBTransaction;
  };

  /**
   * @returns {IDBKeyRange}
   */
  var getIDBKeyRange = function() {
      return window.IDBKeyRange || window.webkitIDBKeyRange || window.mozIDBKeyRange || window.oIDBKeyRange || window.msIDBKeyRange;
  };

  /**
   * @returns {string}
   */
  var READ_WRITE = (getIDBTransaction() && 'READ_WRITE' in getIDBTransaction()) ? getIDBTransaction().READ_WRITE : 'readwrite';

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAvailable = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isStoreReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isObjectStoreReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isCursorReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isKeyReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isDeleteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isClearReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isPutReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterValidReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterFailReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterUseAutoIncrementReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReadWriteReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBTransactionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetIDBKeyRangeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterStoreVersionReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterLawnchairReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterInitReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterSaveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterBatchReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterGetReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterExistsReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterAllReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterKeysReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterRemoveReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}
   */
  var isIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterIndexedDBAdapterNukeReady = function(idb, name, version) {
      return !!idb;
  };

  /**
   * @param {IndexedDB} idb
   * @param {string} name
   * @param {number} version
   * @returns {boolean}