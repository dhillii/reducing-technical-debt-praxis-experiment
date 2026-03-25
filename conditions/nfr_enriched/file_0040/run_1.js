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

const BUNDLE_FILE = '/static/js/bundle.js';
const MAX_WARNINGS_SHOWN = 5;
const SOCKET_PROTOCOLS = { 'https:': 'wss', 'http:': 'ws' };

// --- State ---

const state = {
  isFirstCompilation: true,
  mostRecentCompilationHash: null,
  hasCompileErrors: false,
  hadRuntimeError: false,
};

// --- Editor Handler ---

ErrorOverlay.setEditorHandler(function editorHandler({ fileName, lineNumber, colNumber }) {
  const params = new URLSearchParams({
    fileName,
    lineNumber: lineNumber || 1,
    colNumber: colNumber || 1,
  });
  fetch(`${launchEditorEndpoint}?${params}`);
});

// --- Runtime Error Reporting ---

ErrorOverlay.startReportingRuntimeErrors({
  onError: () => { state.hadRuntimeError = true; },
  filename: BUNDLE_FILE,
});

if (module.hot?.dispose) {
  module.hot.dispose(() => ErrorOverlay.stopReportingRuntimeErrors());
}

// --- WebSocket Connection ---

function createWebSocketUrl() {
  return url.format({
    protocol: SOCKET_PROTOCOLS[window.location.protocol] || 'ws',
    hostname: process.env.WDS_SOCKET_HOST || window.location.hostname,
    port: process.env.WDS_SOCKET_PORT || window.location.port,
    pathname: process.env.WDS_SOCKET_PATH || '/ws',
    slashes: true,
  });
}

const connection = new WebSocket(createWebSocketUrl());

connection.onclose = function () {
  console.info?.('The development server has disconnected.\nRefresh the page if necessary.');
};

// --- Message Handlers ---

const messageHandlers = {
  hash: (data) => { state.mostRecentCompilationHash = data; },
  'still-ok': () => handleSuccess(),
  ok: () => handleSuccess(),
  'content-changed': () => window.location.reload(),
  warnings: (data) => handleWarnings(data),
  errors: (data) => handleErrors(data),
};

connection.onmessage = function ({ data }) {
  const message = JSON.parse(data);
  messageHandlers[message.type]?.(message.data);
};

// --- Compilation Handlers ---

function clearOutdatedErrors() {
  if (state.hasCompileErrors) {
    console.clear?.();
  }
}

function finalizeCompilation(hasErrors = false) {
  clearOutdatedErrors();
  const isHotUpdate = !state.isFirstCompilation;
  state.isFirstCompilation = false;
  state.hasCompileErrors = hasErrors;
  return isHotUpdate;
}

function handleSuccess() {
  const isHotUpdate = finalizeCompilation();
  if (isHotUpdate) {
    tryApplyUpdates(tryDismissErrorOverlay);
  }
}

function handleWarnings(warnings) {
  const isHotUpdate = finalizeCompilation();
  printWarnings(warnings);
  if (isHotUpdate) {
    tryApplyUpdates(tryDismissErrorOverlay);
  }
}

function handleErrors(errors) {
  finalizeCompilation(true);

  const { errors: formattedErrors } = formatWebpackMessages({ errors, warnings: [] });

  ErrorOverlay.reportBuildError(formattedErrors[0]);
  formattedErrors.forEach((error) => console.error?.(stripAnsi(error)));
}

function tryDismissErrorOverlay() {
  if (!state.hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
}

// --- Warning Printer ---

function printWarnings(warnings) {
  const { warnings: formattedWarnings } = formatWebpackMessages({ warnings, errors: [] });

  if (!console.warn) return;

  const warningsToShow = formattedWarnings.slice(0, MAX_WARNINGS_SHOWN);
  warningsToShow.forEach((warning) => console.warn(stripAnsi(warning)));

  if (formattedWarnings.length > MAX_WARNINGS_SHOWN) {
    console.warn('There were more warnings in other files.\nYou can find a complete log in the terminal.');
  }
}

// --- Hot Module Replacement ---

function isUpdateAvailable() {
  /* globals __webpack_hash__ */
  return state.mostRecentCompilationHash !== __webpack_hash__;
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
  const hasErrors = err || state.hadRuntimeError;

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
    (updatedModules) => callback(null, updatedModules),
    (err) => callback(err, null)
  );
}
```

Key improvements made:

1. **Centralized state** into a single `state` object, eliminating scattered global variables.

2. **Extracted `finalizeCompilation`** to eliminate duplicated logic shared between `handleSuccess` and `handleWarnings`.

3. **Replaced switch/case** with a `messageHandlers` lookup object for cleaner message dispatching.

4. **Extracted `printWarnings`** into its own function and simplified the loop using `slice` and `forEach`.

5. **Simplified URL building** by extracting `createWebSocketUrl` and using a protocol lookup map.

6. **Used optional chaining** (`?.`) to replace verbose `typeof console !== 'undefined'` checks.

7. **Used `URLSearchParams`** for cleaner URL parameter construction in the editor handler.

8. **Extracted `handleApplyUpdates`** as a named, bound function to reduce nesting in `tryApplyUpdates`.

9. **Used `Array.includes`** instead of `indexOf` for more readable array membership checks.