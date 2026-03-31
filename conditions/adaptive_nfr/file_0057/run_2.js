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

const BUNDLE_FILENAME = '/static/js/bundle.js';
const MAX_WARNINGS_SHOWN = 5;

// --- State ---

var hadRuntimeError = false;
var isFirstCompilation = true;
var mostRecentCompilationHash = null;
var hasCompileErrors = false;

// --- Editor Handler ---

ErrorOverlay.setEditorHandler(function editorHandler(errorLocation) {
  const params = new URLSearchParams({
    fileName: errorLocation.fileName,
    lineNumber: errorLocation.lineNumber || 1,
    colNumber: errorLocation.colNumber || 1,
  });
  fetch(`${launchEditorEndpoint}?${params}`);
});

// --- Runtime Error Reporting ---

ErrorOverlay.startReportingRuntimeErrors({
  onError: function () {
    hadRuntimeError = true;
  },
  filename: BUNDLE_FILENAME,
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
  console.info?.('The development server has disconnected.\nRefresh the page if necessary.');
};

// --- Utility Functions ---

function clearOutdatedErrors() {
  if (hasCompileErrors) {
    console.clear?.();
  }
}

function tryDismissErrorOverlay() {
  if (!hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
}

function isUpdateAvailable() {
  /* globals __webpack_hash__ */
  return mostRecentCompilationHash !== __webpack_hash__;
}

function canApplyUpdates() {
  return module.hot.status() === 'idle';
}

function canAcceptErrors() {
  const hasReactRefresh = process.env.FAST_REFRESH;
  const status = module.hot.status();
  return hasReactRefresh && !['abort', 'fail'].includes(status);
}

function beginCompilationCycle() {
  clearOutdatedErrors();
  const isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  hasCompileErrors = false;
  return isHotUpdate;
}

// --- Compilation Handlers ---

function handleSuccess() {
  const isHotUpdate = beginCompilationCycle();
  if (isHotUpdate) {
    tryApplyUpdates(tryDismissErrorOverlay);
  }
}

function handleWarnings(warnings) {
  const isHotUpdate = beginCompilationCycle();

  const formatted = formatWebpackMessages({ warnings, errors: [] });
  const warningsToShow = formatted.warnings.slice(0, MAX_WARNINGS_SHOWN);

  warningsToShow.forEach((warning) => console.warn?.(stripAnsi(warning)));

  if (formatted.warnings.length > MAX_WARNINGS_SHOWN) {
    console.warn?.(
      'There were more warnings in other files.\nYou can find a complete log in the terminal.'
    );
  }

  if (isHotUpdate) {
    tryApplyUpdates(tryDismissErrorOverlay);
  }
}

function handleErrors(errors) {
  clearOutdatedErrors();
  isFirstCompilation = false;
  hasCompileErrors = true;

  const formatted = formatWebpackMessages({ errors, warnings: [] });

  ErrorOverlay.reportBuildError(formatted.errors[0]);
  formatted.errors.forEach((error) => console.error?.(stripAnsi(error)));
}

function handleAvailableHash(hash) {
  mostRecentCompilationHash = hash;
}

// --- Message Handler ---

const messageHandlers = {
  hash: (data) => handleAvailableHash(data),
  ok: () => handleSuccess(),
  'still-ok': () => handleSuccess(),
  'content-changed': () => window.location.reload(),
  warnings: (data) => handleWarnings(data),
  errors: (data) => handleErrors(data),
};

connection.onmessage = function (e) {
  const message = JSON.parse(e.data);
  const handler = messageHandlers[message.type];
  if (handler) {
    handler(message.data);
  }
};

// --- Hot Module Replacement ---

function handleApplyUpdates(err, updatedModules) {
  const needsForcedReload = !err && !updatedModules;
  const hasErrors = err || hadRuntimeError;

  if ((hasErrors && !canAcceptErrors()) || needsForcedReload) {
    window.location.reload();
    return;
  }

  if (isUpdateAvailable()) {
    tryApplyUpdates();
  }
}

function tryApplyUpdates(onHotUpdateSuccess) {
  if (!module.hot) {
    window.location.reload();
    return;
  }

  if (!isUpdateAvailable() || !canApplyUpdates()) {
    return;
  }

  function onApplyUpdates(err, updatedModules) {
    handleApplyUpdates(err, updatedModules);
    if (!err && updatedModules && typeof onHotUpdateSuccess === 'function') {
      onHotUpdateSuccess();
    }
  }

  const result = module.hot.check(/* autoApply */ true, onApplyUpdates);

  if (result && result.then) {
    result.then(
      (updatedModules) => onApplyUpdates(null, updatedModules),
      (err) => onApplyUpdates(err, null)
    );
  }
}
```