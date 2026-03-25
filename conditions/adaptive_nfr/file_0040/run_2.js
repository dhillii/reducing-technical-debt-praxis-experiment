# Refactored WebpackDevServer Client

## Key Improvements
- Extracted constants and configuration
- Eliminated code duplication in `handleSuccess`/`handleWarnings`
- Simplified console guard pattern
- Extracted WebSocket URL building
- Improved `canAcceptErrors` readability
- Unified hot update callback pattern

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

const MAX_WARNINGS_SHOWN = 5;
const BUNDLE_PATH = '/static/js/bundle.js';
const UNRECOVERABLE_HOT_STATUSES = ['abort', 'fail'];

// --- Editor Handler ---

ErrorOverlay.setEditorHandler(function editorHandler(errorLocation) {
  const { fileName, lineNumber = 1, colNumber = 1 } = errorLocation;
  const params = new URLSearchParams({ fileName, lineNumber, colNumber });
  fetch(`${launchEditorEndpoint}?${params}`);
});

// --- Runtime Error Tracking ---
// If a runtime error occurs, we cannot guarantee application state integrity,
// so we force a full reload on the next successful compile.
// See https://github.com/facebook/create-react-app/issues/3096

var hadRuntimeError = false;

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

function buildSocketUrl() {
  return url.format({
    protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
    hostname: process.env.WDS_SOCKET_HOST || window.location.hostname,
    port: process.env.WDS_SOCKET_PORT || window.location.port,
    pathname: process.env.WDS_SOCKET_PATH || '/ws',
    slashes: true,
  });
}

var connection = new WebSocket(buildSocketUrl());

// We won't try to reconnect to avoid spamming the console.
// Disconnect usually happens when the developer stops the server.
connection.onclose = function () {
  safeConsole('info', 'The development server has disconnected.\nRefresh the page if necessary.');
};

// --- Compilation State ---

var isFirstCompilation = true;
var mostRecentCompilationHash = null;
var hasCompileErrors = false;

// --- Console Utilities ---

function safeConsole(method, ...args) {
  if (typeof console !== 'undefined' && typeof console[method] === 'function') {
    console[method](...args);
  }
}

function clearOutdatedErrors() {
  if (hasCompileErrors) {
    safeConsole('clear');
  }
}

// --- Compilation Handlers ---

function handleSuccess() {
  handleSuccessfulCompilation();
}

function handleWarnings(warnings) {
  const formatted = formatWebpackMessages({ warnings, errors: [] });
  const capped = formatted.warnings.slice(0, MAX_WARNINGS_SHOWN);

  capped.forEach(warning => safeConsole('warn', stripAnsi(warning)));

  if (formatted.warnings.length > MAX_WARNINGS_SHOWN) {
    safeConsole('warn', 'There were more warnings in other files.\nYou can find a complete log in the terminal.');
  }

  handleSuccessfulCompilation();
}

function handleErrors(errors) {
  clearOutdatedErrors();
  isFirstCompilation = false;
  hasCompileErrors = true;

  const formatted = formatWebpackMessages({ errors, warnings: [] });

  ErrorOverlay.reportBuildError(formatted.errors[0]);
  formatted.errors.forEach(error => safeConsole('error', stripAnsi(error)));
}

function handleSuccessfulCompilation() {
  clearOutdatedErrors();

  const isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  hasCompileErrors = false;

  if (isHotUpdate) {
    tryApplyUpdates(tryDismissErrorOverlay);
  }
}

function tryDismissErrorOverlay() {
  if (!hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
}

// --- Hash Tracking ---

function handleAvailableHash(hash) {
  mostRecentCompilationHash = hash;
}

function isUpdateAvailable() {
  /* globals __webpack_hash__ */
  return mostRecentCompilationHash !== __webpack_hash__;
}

// --- Hot Module Replacement ---

function canApplyUpdates() {
  return module.hot.status() === 'idle';
}

function canAcceptErrors() {
  const hasReactRefresh = process.env.FAST_REFRESH;
  const isRecoverableStatus = !UNRECOVERABLE_HOT_STATUSES.includes(module.hot.status());
  return hasReactRefresh && isRecoverableStatus;
}

function handleApplyUpdates(onHotUpdateSuccess, err, updatedModules) {
  const needsForcedReload = !err && !updatedModules;
  const hasErrors = err || hadRuntimeError;

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

function tryApplyUpdates(onHotUpdateSuccess) {
  if (!module.hot) {
    window.location.reload();
    return;
  }

  if (!isUpdateAvailable() || !canApplyUpdates()) {
    return;
  }

  const callback = handleApplyUpdates.bind(null, onHotUpdateSuccess);

  // https://webpack.github.io/docs/hot-module-replacement.html#check
  // webpack 2+ returns a Promise instead of invoking a callback
  const result = module.hot.check(/* autoApply */ true, callback);

  if (result && result.then) {
    result.then(
      updatedModules => callback(null, updatedModules),
      err => callback(err, null)
    );
  }
}

// --- Message Handler ---

const messageHandlers = {
  'hash':           message => handleAvailableHash(message.data),
  'ok':             ()      => handleSuccess(),
  'still-ok':       ()      => handleSuccess(),
  'warnings':       message => handleWarnings(message.data),
  'errors':         message => handleErrors(message.data),
  'content-changed':()      => window.location.reload(),
};

connection.onmessage = function (e) {
  const message = JSON.parse(e.data);
  const handler = messageHandlers[message.type];
  if (handler) {
    handler(message);
  }
};
```

## Summary of Changes

| Area | Before | After |
|---|---|---|
| **Console calls** | Repeated `typeof console` guards | `safeConsole()` utility |
| **`handleSuccess`/`handleWarnings`** | Duplicated state reset + hot update logic | Shared `handleSuccessfulCompilation()` |
| **Warning printing** | `for` loop with index check | `slice` + `forEach` |
| **`canAcceptErrors`** | `indexOf` check | `Array.includes` |
| **`handleApplyUpdates`** | Inline closure | Named function with bound `onHotUpdateSuccess` |
| **Socket URL** | Inline object literal | `buildSocketUrl()` function |
| **Message routing** | `switch` statement | Dispatch table (`messageHandlers`) |
| **Editor URL** | Manual string concatenation | `URLSearchParams` |
| **Magic values** | Scattered literals | Named constants |