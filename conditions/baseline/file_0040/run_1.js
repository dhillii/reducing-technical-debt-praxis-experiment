Here's the refactored code with reduced complexity, better organization, and improved readability:

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
const BUNDLE_FILENAME = '/static/js/bundle.js';
const SOCKET_PROTOCOL_MAP = { 'https:': 'wss', 'http:': 'ws' };

// --- State ---

const state = {
  isFirstCompilation: true,
  mostRecentCompilationHash: null,
  hasCompileErrors: false,
  hadRuntimeError: false,
};

// --- Editor Handler ---

ErrorOverlay.setEditorHandler(({ fileName, lineNumber, colNumber }) => {
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
  filename: BUNDLE_FILENAME,
});

if (module.hot?.dispose) {
  module.hot.dispose(() => ErrorOverlay.stopReportingRuntimeErrors());
}

// --- WebSocket Connection ---

function createWebSocketUrl() {
  return url.format({
    protocol: SOCKET_PROTOCOL_MAP[window.location.protocol] || 'ws',
    hostname: process.env.WDS_SOCKET_HOST || window.location.hostname,
    port: process.env.WDS_SOCKET_PORT || window.location.port,
    pathname: process.env.WDS_SOCKET_PATH || '/ws',
    slashes: true,
  });
}

const connection = new WebSocket(createWebSocketUrl());

connection.onclose = () => {
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

connection.onmessage = ({ data }) => {
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
  state.isFirstCompilation = false;
  state.hasCompileErrors = hasErrors;
}

function handleSuccess() {
  const isHotUpdate = !state.isFirstCompilation;
  finalizeCompilation();

  if (isHotUpdate) {
    tryApplyUpdates(tryDismissErrorOverlay);
  }
}

function handleWarnings(warnings) {
  const isHotUpdate = !state.isFirstCompilation;
  finalizeCompilation();
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

  formattedWarnings.slice(0, MAX_WARNINGS_SHOWN).forEach((warning) => {
    console.warn?.(stripAnsi(warning));
  });

  if (formattedWarnings.length > MAX_WARNINGS_SHOWN) {
    console.warn?.('There were more warnings in other files.\nYou can find a complete log in the terminal.');
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
  const isSafeStatus = !['abort', 'fail'].includes(module.hot.status());
  return hasReactRefresh && isSafeStatus;
}

function handleApplyUpdates(err, updatedModules, onHotUpdateSuccess) {
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

  const callback = (err, updatedModules) =>
    handleApplyUpdates(err, updatedModules, onHotUpdateSuccess);

  const result = module.hot.check(true, callback);

  result?.then(
    (updatedModules) => callback(null, updatedModules),
    (err) => callback(err, null)
  );
}
```

Key improvements made:

1. **State consolidation**: Grouped related state variables into a single `state` object for better cohesion and clarity.

2. **Eliminated duplication**: Extracted `finalizeCompilation()` to replace repeated logic in `handleSuccess` and `handleWarnings`.

3. **Simplified URL building**: Extracted `createWebSocketUrl()` and replaced the protocol ternary with a lookup map.

4. **Cleaner message dispatch**: Replaced the `switch` statement with a `messageHandlers` map using optional chaining.

5. **Improved warning printing**: Replaced the `for` loop with `slice` + `forEach`, eliminating the mid-loop `break`.

6. **Simplified editor handler**: Used destructuring and `URLSearchParams` instead of manual string concatenation.

7. **Optional chaining**: Used `?.` for `console` method checks and `module.hot.dispose`, removing verbose `typeof` guards.

8. **Extracted `handleApplyUpdates`**: Moved the inner function out of `tryApplyUpdates` to reduce nesting and improve testability.

9. **Named constants**: Replaced magic values (`5`, `'/static/js/bundle.js'`) with named constants.