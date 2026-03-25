Here's the refactored code with reduced complexity, improved readability, and better organization:

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
const WEBSOCKET_PATH = process.env.WDS_SOCKET_PATH || '/ws';

// --- State ---

var hadRuntimeError = false;
var isFirstCompilation = true;
var mostRecentCompilationHash = null;
var hasCompileErrors = false;

// --- Editor Handler ---

function buildEditorUrl(errorLocation) {
  const params = new URLSearchParams({
    fileName: errorLocation.fileName,
    lineNumber: errorLocation.lineNumber || 1,
    colNumber: errorLocation.colNumber || 1,
  });
  return `${launchEditorEndpoint}?${params}`;
}

ErrorOverlay.setEditorHandler(function editorHandler(errorLocation) {
  fetch(buildEditorUrl(errorLocation));
});

// --- Error Overlay Setup ---

ErrorOverlay.startReportingRuntimeErrors({
  onError: () => { hadRuntimeError = true; },
  filename: BUNDLE_FILENAME,
});

if (module.hot?.dispose) {
  module.hot.dispose(() => ErrorOverlay.stopReportingRuntimeErrors());
}

// --- WebSocket Connection ---

function buildWebSocketUrl() {
  return url.format({
    protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
    hostname: process.env.WDS_SOCKET_HOST || window.location.hostname,
    port: process.env.WDS_SOCKET_PORT || window.location.port,
    pathname: WEBSOCKET_PATH,
    slashes: true,
  });
}

var connection = new WebSocket(buildWebSocketUrl());

connection.onclose = function () {
  console.info?.('The development server has disconnected.\nRefresh the page if necessary.');
};

// --- Compilation Handlers ---

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

function applyHotUpdateIfNeeded() {
  if (!isFirstCompilation) {
    tryApplyUpdates(tryDismissErrorOverlay);
  }
}

function resetCompilationState() {
  clearOutdatedErrors();
  isFirstCompilation = false;
  hasCompileErrors = false;
}

function handleSuccess() {
  resetCompilationState();
  applyHotUpdateIfNeeded();
}

function printWarningsToConsole(warnings) {
  const formatted = formatWebpackMessages({ warnings, errors: [] });
  const warningsToShow = formatted.warnings.slice(0, MAX_WARNINGS_SHOWN);

  warningsToShow.forEach(warning => console.warn?.(stripAnsi(warning)));

  if (formatted.warnings.length > MAX_WARNINGS_SHOWN) {
    console.warn?.('There were more warnings in other files.\nYou can find a complete log in the terminal.');
  }
}

function handleWarnings(warnings) {
  resetCompilationState();
  printWarningsToConsole(warnings);
  applyHotUpdateIfNeeded();
}

function handleErrors(errors) {
  clearOutdatedErrors();
  isFirstCompilation = false;
  hasCompileErrors = true;

  const formatted = formatWebpackMessages({ errors, warnings: [] });

  ErrorOverlay.reportBuildError(formatted.errors[0]);
  formatted.errors.forEach(error => console.error?.(stripAnsi(error)));
}

function handleAvailableHash(hash) {
  mostRecentCompilationHash = hash;
}

// --- Message Handlers Map ---

const messageHandlers = {
  'hash': ({ data }) => handleAvailableHash(data),
  'still-ok': () => handleSuccess(),
  'ok': () => handleSuccess(),
  'content-changed': () => window.location.reload(),
  'warnings': ({ data }) => handleWarnings(data),
  'errors': ({ data }) => handleErrors(data),
};

connection.onmessage = function (e) {
  const message = JSON.parse(e.data);
  messageHandlers[message.type]?.(message);
};

// --- Hot Module Replacement ---

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

function handleApplyUpdates(onHotUpdateSuccess, err, updatedModules) {
  const needsForcedReload = !err && !updatedModules;
  const hasErrors = err || hadRuntimeError;

  if (needsForcedReload || (hasErrors && !canAcceptErrors())) {
    window.location.reload();
    return;
  }

  onHotUpdateSuccess?.();

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
  const result = module.hot.check(/* autoApply */ true, callback);

  result?.then(
    updatedModules => callback(null, updatedModules),
    err => callback(err, null)
  );
}
```

Key improvements made:

1. **Extracted constants** (`BUNDLE_FILENAME`, `MAX_WARNINGS_SHOWN`, `WEBSOCKET_PATH`) to avoid magic values.
2. **Extracted helper functions** (`buildEditorUrl`, `buildWebSocketUrl`, `resetCompilationState`, `applyHotUpdateIfNeeded`) to reduce duplication between `handleSuccess` and `handleWarnings`.
3. **Replaced switch statement** with a `messageHandlers` map for cleaner message dispatching.
4. **Used optional chaining** (`?.`) to simplify `console` existence checks and `module.hot.dispose`.
5. **Replaced manual loops** with `forEach`/`slice` for warning/error printing.
6. **Extracted `handleApplyUpdates`** as a named, bound function to reduce nesting in `tryApplyUpdates`.
7. **Used `URLSearchParams`** for cleaner URL construction in the editor handler.
8. **Used `includes`** instead of `indexOf` for the status check in `canAcceptErrors`.