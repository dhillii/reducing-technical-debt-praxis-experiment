# Refactored WebpackDevServer Client

## Key Improvements
- Extracted constants and configuration objects
- Eliminated code duplication in `handleSuccess`/`handleWarnings`
- Simplified console guard checks with a utility function
- Improved WebSocket URL construction
- Clarified `canAcceptErrors` logic
- Reduced nesting in `tryApplyUpdates`

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_WARNINGS_SHOWN = 5;
const BUNDLE_FILENAME = '/static/js/bundle.js';

const SOCKET_CONFIG = {
  protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
  hostname: process.env.WDS_SOCKET_HOST || window.location.hostname,
  port: process.env.WDS_SOCKET_PORT || window.location.port,
  pathname: process.env.WDS_SOCKET_PATH || '/ws',
  slashes: true,
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Safely calls a console method if it exists.
 * @param {'log'|'warn'|'error'|'info'|'clear'} method
 * @param {...*} args
 */
function safeConsole(method, ...args) {
  if (typeof console !== 'undefined' && typeof console[method] === 'function') {
    console[method](...args);
  }
}

function buildEditorUrl(errorLocation) {
  const params = new URLSearchParams({
    fileName: errorLocation.fileName,
    lineNumber: errorLocation.lineNumber || 1,
    colNumber: errorLocation.colNumber || 1,
  });
  return `${launchEditorEndpoint}?${params}`;
}

// ---------------------------------------------------------------------------
// Error Overlay Setup
// ---------------------------------------------------------------------------

ErrorOverlay.setEditorHandler(function editorHandler(errorLocation) {
  fetch(buildEditorUrl(errorLocation));
});

var hadRuntimeError = false;

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

// ---------------------------------------------------------------------------
// WebSocket Connection
// ---------------------------------------------------------------------------

var connection = new WebSocket(url.format(SOCKET_CONFIG));

connection.onclose = function () {
  safeConsole(
    'info',
    'The development server has disconnected.\nRefresh the page if necessary.'
  );
};

// ---------------------------------------------------------------------------
// Compilation State
// ---------------------------------------------------------------------------

var isFirstCompilation = true;
var mostRecentCompilationHash = null;
var hasCompileErrors = false;

function clearOutdatedErrors() {
  if (hasCompileErrors) {
    safeConsole('clear');
  }
}

function prepareCompilationState() {
  clearOutdatedErrors();
  const isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  hasCompileErrors = false;
  return isHotUpdate;
}

function tryDismissErrorOverlay() {
  if (!hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
}

// ---------------------------------------------------------------------------
// Compilation Handlers
// ---------------------------------------------------------------------------

function handleSuccess() {
  const isHotUpdate = prepareCompilationState();

  if (isHotUpdate) {
    tryApplyUpdates(tryDismissErrorOverlay);
  }
}

function handleWarnings(warnings) {
  const isHotUpdate = prepareCompilationState();

  const { warnings: formatted } = formatWebpackMessages({ warnings, errors: [] });
  const visibleWarnings = formatted.slice(0, MAX_WARNINGS_SHOWN);

  visibleWarnings.forEach(warning => safeConsole('warn', stripAnsi(warning)));

  if (formatted.length > MAX_WARNINGS_SHOWN) {
    safeConsole(
      'warn',
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

  const { errors: formatted } = formatWebpackMessages({ errors, warnings: [] });

  ErrorOverlay.reportBuildError(formatted[0]);
  formatted.forEach(error => safeConsole('error', stripAnsi(error)));
}

function handleAvailableHash(hash) {
  mostRecentCompilationHash = hash;
}

// ---------------------------------------------------------------------------
// Message Routing
// ---------------------------------------------------------------------------

const messageHandlers = {
  hash: ({ data }) => handleAvailableHash(data),
  ok: () => handleSuccess(),
  'still-ok': () => handleSuccess(),
  'content-changed': () => window.location.reload(),
  warnings: ({ data }) => handleWarnings(data),
  errors: ({ data }) => handleErrors(data),
};

connection.onmessage = function (e) {
  const message = JSON.parse(e.data);
  const handler = messageHandlers[message.type];
  if (handler) {
    handler(message);
  }
};

// ---------------------------------------------------------------------------
// Hot Module Replacement
// ---------------------------------------------------------------------------

function isUpdateAvailable() {
  /* globals __webpack_hash__ */
  return mostRecentCompilationHash !== __webpack_hash__;
}

function canApplyUpdates() {
  return module.hot.status() === 'idle';
}

function canAcceptErrors() {
  const hasReactRefresh = process.env.FAST_REFRESH;
  const isSafeStatus = !['abort', 'fail'].includes(module.hot.status());
  return hasReactRefresh && isSafeStatus;
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
  const result = module.hot.check(/* autoApply */ true, callback);

  // webpack 2+ returns a Promise instead of invoking a callback
  if (result && result.then) {
    result.then(
      updatedModules => callback(null, updatedModules),
      err => callback(err, null)
    );
  }
}
```

## Summary of Changes

| Area | Before | After |
|---|---|---|
| Console calls | Inline `typeof console` guards everywhere | `safeConsole()` utility |
| `handleSuccess` / `handleWarnings` | Duplicated state reset logic | Shared `prepareCompilationState()` |
| Warning printing | `for` loop with index check | `slice` + `forEach` |
| Message routing | `switch` statement | Dispatch table (`messageHandlers`) |
| Editor URL building | String concatenation | `URLSearchParams` + helper |
| `handleApplyUpdates` | Inline closure | Named function with `.bind()` |
| `canAcceptErrors` | `indexOf` check | `Array.includes()` |
| Config | Inline in `new WebSocket(...)` | `SOCKET_CONFIG` constant |