```javascript
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

var stripAnsi = require('strip-ansi');
var url = require('url');
var launchEditorEndpoint = require('./launchEditorEndpoint');
var formatWebpackMessages = require('./formatWebpackMessages');
var ErrorOverlay = require('react-error-overlay');

// --- Constants ---

var BUNDLE_PATH = '/static/js/bundle.js';
var MAX_WARNINGS_SHOWN = 5;

// --- State ---

var hadRuntimeError = false;
var isFirstCompilation = true;
var mostRecentCompilationHash = null;
var hasCompileErrors = false;

// --- Editor Handler ---

ErrorOverlay.setEditorHandler(function editorHandler(errorLocation) {
  var params = new URLSearchParams({
    fileName: errorLocation.fileName,
    lineNumber: errorLocation.lineNumber || 1,
    colNumber: errorLocation.colNumber || 1,
  });
  fetch(launchEditorEndpoint + '?' + params.toString());
});

// --- Runtime Error Reporting ---

ErrorOverlay.startReportingRuntimeErrors({
  onError: function () {
    hadRuntimeError = true;
  },
  filename: BUNDLE_PATH,
});

if (module.hot && typeof module.hot.dispose === 'function') {
  module.hot.dispose(function () {
    ErrorOverlay.stopReportingRuntimeErrors();
  });
}

// --- WebSocket Connection ---

var connection = new WebSocket(
  url.format({
    protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
    hostname: process.env.WDS_SOCKET_HOST || window.location.hostname,
    port: process.env.WDS_SOCKET_PORT || window.location.port,
    pathname: process.env.WDS_SOCKET_PATH || '/ws',
    slashes: true,
  })
);

connection.onclose = function () {
  safeConsole('info', 'The development server has disconnected.\nRefresh the page if necessary.');
};

connection.onmessage = function (e) {
  var message = JSON.parse(e.data);
  var handlers = {
    hash: function () { handleAvailableHash(message.data); },
    ok: handleSuccess,
    'still-ok': handleSuccess,
    'content-changed': function () { window.location.reload(); },
    warnings: function () { handleWarnings(message.data); },
    errors: function () { handleErrors(message.data); },
  };

  var handler = handlers[message.type];
  if (handler) handler();
};

// --- Utility ---

function safeConsole(method) {
  var args = Array.prototype.slice.call(arguments, 1);
  if (typeof console !== 'undefined' && typeof console[method] === 'function') {
    console[method].apply(console, args);
  }
}

function clearOutdatedErrors() {
  if (hasCompileErrors) {
    safeConsole('clear');
  }
}

function beginCompilation() {
  var isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  hasCompileErrors = false;
  return isHotUpdate;
}

function tryDismissErrorOverlay() {
  if (!hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
}

function applyHotUpdateIfNeeded() {
  tryApplyUpdates(tryDismissErrorOverlay);
}

// --- Compilation Handlers ---

function handleAvailableHash(hash) {
  mostRecentCompilationHash = hash;
}

function handleSuccess() {
  clearOutdatedErrors();
  var isHotUpdate = beginCompilation();
  if (isHotUpdate) {
    applyHotUpdateIfNeeded();
  }
}

function handleWarnings(warnings) {
  clearOutdatedErrors();
  var isHotUpdate = beginCompilation();

  var formatted = formatWebpackMessages({ warnings: warnings, errors: [] });
  formatted.warnings.slice(0, MAX_WARNINGS_SHOWN).forEach(function (warning) {
    safeConsole('warn', stripAnsi(warning));
  });

  if (formatted.warnings.length > MAX_WARNINGS_SHOWN) {
    safeConsole('warn', 'There were more warnings in other files.\nYou can find a complete log in the terminal.');
  }

  if (isHotUpdate) {
    applyHotUpdateIfNeeded();
  }
}

function handleErrors(errors) {
  clearOutdatedErrors();
  isFirstCompilation = false;
  hasCompileErrors = true;

  var formatted = formatWebpackMessages({ errors: errors, warnings: [] });
  ErrorOverlay.reportBuildError(formatted.errors[0]);

  formatted.errors.forEach(function (error) {
    safeConsole('error', stripAnsi(error));
  });
}

// --- Hot Module Replacement ---

function isUpdateAvailable() {
  /* globals __webpack_hash__ */
  return mostRecentCompilationHash !== __webpack_hash__;
}

function canApplyUpdates() {
  return module.hot.status() === 'idle';
}

function canAcceptErrors() {
  var hasReactRefresh = process.env.FAST_REFRESH;
  var status = module.hot.status();
  return hasReactRefresh && ['abort', 'fail'].indexOf(status) === -1;
}

function tryApplyUpdates(onHotUpdateSuccess) {
  if (!module.hot) {
    window.location.reload();
    return;
  }

  if (!isUpdateAvailable() || !canApplyUpdates()) {
    return;
  }

  function handleApplyUpdates(err, updatedModules) {
    var needsForcedReload = !err && !updatedModules;
    var hasErrors = err || hadRuntimeError;

    if (needsForcedReload || (hasErrors && !canAcceptErrors())) {
      window.location.reload();
      return;
    }

    if (typeof onHotUpdateSuccess === 'function') {
      onHotUpdateSuccess();
    }

    if (isUpdateAvailable()) {
      tryApplyUpdates();
    }
  }

  var result = module.hot.check(true, handleApplyUpdates);

  if (result && result.then) {
    result.then(
      function (updatedModules) { handleApplyUpdates(null, updatedModules); },
      function (err) { handleApplyUpdates(err, null); }
    );
  }
}
```