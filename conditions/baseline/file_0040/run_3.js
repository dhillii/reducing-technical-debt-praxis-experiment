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

const BUNDLE_PATH = '/static/js/bundle.js';
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

function buildEditorUrl({ fileName, lineNumber, colNumber }) {
  const params = new URLSearchParams({
    fileName,
    lineNumber: lineNumber || 1,
    colNumber: colNumber || 1,
  });
  return `${launchEditorEndpoint}?${params}`;
}

ErrorOverlay.setEditorHandler(function editorHandler(errorLocation) {
  fetch(buildEditorUrl(errorLocation));
});

// --- Runtime Error Reporting ---

ErrorOverlay.startReportingRuntimeErrors({
  onError: () => { state.hadRuntimeError = true; },
  filename: BUNDLE_PATH,
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
  console?.info?.('The development server has disconnected.\nRefresh the page if necessary.');
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

connection.onmessage = function (e) {
  const { type, data } = JSON.parse(e.data);
  messageHandlers[type]?.(data);
};

// --- Compilation Handlers ---

function clearOutdatedErrors() {
  if (state.hasCompileErrors) {
    console?.clear?.();
  }
}

function finalizeCompilation(hasErrors = false) {
  clearOutdatedErrors();
  state.isFirstCompilation = false;
  state.hasCompileErrors = hasErrors;
}

function tryDismissErrorOverlay() {
  if (!state.hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
}

function applyHotUpdateIfNeeded() {
  if (!state.isFirstCompilation) {
    tryApplyUpdates(tryDismissErrorOverlay);
  }
}

function handleSuccess() {
  finalizeCompilation(false);
  applyHotUpdateIfNeeded();
}

function handleWarnings(warnings) {
  finalizeCompilation(false);

  const { warnings: formatted } = formatWebpackMessages({ warnings, errors: [] });

  formatted.slice(0, MAX_WARNINGS_SHOWN).forEach((warning) => {
    console?.warn?.(stripAnsi(warning));
  });

  if (formatted.length > MAX_WARNINGS_SHOWN) {
    console?.warn?.('There were more warnings in other files.\nYou can find a complete log in the terminal.');
  }

  applyHotUpdateIfNeeded();
}

function handleErrors(errors) {
  finalizeCompilation(true);

  const { errors: formatted } = formatWebpackMessages({ errors, warnings: [] });

  ErrorOverlay.reportBuildError(formatted[0]);

  formatted.forEach((error) => console?.error?.(stripAnsi(error)));
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

function handleApplyUpdates(onHotUpdateSuccess) {
  return function (err, updatedModules) {
    const needsForcedReload = !err && !updatedModules;
    const hasUnrecoverableError = (err || state.hadRuntimeError) && !canAcceptErrors();

    if (hasUnrecoverableError || needsForcedReload) {
      window.location.reload();
      return;
    }

    onHotUpdateSuccess?.();

    if (isUpdateAvailable()) {
      tryApplyUpdates();
    }
  };
}

function tryApplyUpdates(onHotUpdateSuccess) {
  if (!module.hot) {
    window.location.reload();
    return;
  }

  if (!isUpdateAvailable() || !canApplyUpdates()) {
    return;
  }

  const callback = handleApplyUpdates(onHotUpdateSuccess);
  const result = module.hot.check(/* autoApply */ true, callback);

  // webpack 2+ returns a Promise
  result?.then(
    (updatedModules) => callback(null, updatedModules),
    (err) => callback(err, null)
  );
}
```

Key improvements made:

1. **Centralized state** into a single `state` object, eliminating scattered mutable variables.

2. **Extracted `finalizeCompilation()`** to consolidate the repeated pattern of clearing errors and updating state flags in `handleSuccess`, `handleWarnings`, and `handleErrors`.

3. **Extracted `applyHotUpdateIfNeeded()`** to remove the duplicated hot-update logic shared between `handleSuccess` and `handleWarnings`.

4. **Simplified message dispatch** using a `messageHandlers` lookup map instead of a `switch` statement.

5. **Extracted `handleApplyUpdates()`** as a curried function to reduce nesting and improve testability.

6. **Used optional chaining** (`?.`) to simplify `console` existence checks.

7. **Replaced `indexOf`** with `Array.includes()` for more readable array membership checks.

8. **Extracted `buildEditorUrl()`** and `createWebSocketUrl()` to isolate URL construction logic.

9. **Used `URLSearchParams`** for cleaner URL parameter encoding.

10. **Replaced manual loop with `slice` + `forEach`** in `handleWarnings` for cleaner iteration.