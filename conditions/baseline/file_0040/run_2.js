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

const MAX_WARNINGS_SHOWN = 5;
const BUNDLE_FILENAME = '/static/js/bundle.js';

// --- State ---

var compilationState = {
  isFirst: true,
  mostRecentHash: null,
  hasErrors: false,
};

var hadRuntimeError = false;

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

// --- Runtime Error Reporting ---

ErrorOverlay.startReportingRuntimeErrors({
  onError: () => { hadRuntimeError = true; },
  filename: BUNDLE_FILENAME,
});

if (module.hot && typeof module.hot.dispose === 'function') {
  module.hot.dispose(() => ErrorOverlay.stopReportingRuntimeErrors());
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

connection.onclose = function () {
  console.info?.('The development server has disconnected.\nRefresh the page if necessary.');
};

// --- Compilation Handlers ---

function clearOutdatedErrors() {
  if (compilationState.hasErrors) {
    console.clear?.();
  }
}

function prepareCompilationUpdate() {
  clearOutdatedErrors();
  const isHotUpdate = !compilationState.isFirst;
  compilationState.isFirst = false;
  compilationState.hasErrors = false;
  return isHotUpdate;
}

function tryDismissErrorOverlay() {
  if (!compilationState.hasErrors) {
    ErrorOverlay.dismissBuildError();
  }
}

function applyHotUpdateIfNeeded(isHotUpdate) {
  if (isHotUpdate) {
    tryApplyUpdates(tryDismissErrorOverlay);
  }
}

function handleSuccess() {
  const isHotUpdate = prepareCompilationUpdate();
  applyHotUpdateIfNeeded(isHotUpdate);
}

function printWarnings(warnings) {
  const { warnings: formatted } = formatWebpackMessages({ warnings, errors: [] });

  formatted.slice(0, MAX_WARNINGS_SHOWN).forEach(warning => {
    console.warn?.(stripAnsi(warning));
  });

  if (formatted.length > MAX_WARNINGS_SHOWN) {
    console.warn?.('There were more warnings in other files.\nYou can find a complete log in the terminal.');
  }
}

function handleWarnings(warnings) {
  const isHotUpdate = prepareCompilationUpdate();
  printWarnings(warnings);
  applyHotUpdateIfNeeded(isHotUpdate);
}

function handleErrors(errors) {
  clearOutdatedErrors();
  compilationState.isFirst = false;
  compilationState.hasErrors = true;

  const { errors: formatted } = formatWebpackMessages({ errors, warnings: [] });

  ErrorOverlay.reportBuildError(formatted[0]);
  formatted.forEach(error => console.error?.(stripAnsi(error)));
}

function handleAvailableHash(hash) {
  compilationState.mostRecentHash = hash;
}

// --- Message Handler ---

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
  const handler = messageHandlers[message.type];
  if (handler) handler(message);
};

// --- Hot Module Replacement ---

function isUpdateAvailable() {
  /* globals __webpack_hash__ */
  return compilationState.mostRecentHash !== __webpack_hash__;
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
  const hasUnrecoverableError = (err || hadRuntimeError) && !canAcceptErrors();

  if (hasUnrecoverableError || needsForcedReload) {
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
  const result = module.hot.check(/* autoApply */ true, callback);

  // webpack 2+ returns a Promise
  if (result && result.then) {
    result.then(
      updatedModules => callback(null, updatedModules),
      err => callback(err, null)
    );
  }
}
```

Key improvements made:

1. **State consolidation** — Grouped related state variables into a `compilationState` object to reduce scattered mutable state.

2. **Extracted shared logic** — `prepareCompilationUpdate()` and `applyHotUpdateIfNeeded()` eliminate duplication between `handleSuccess` and `handleWarnings`.

3. **Simplified message dispatch** — Replaced the `switch` statement with a `messageHandlers` lookup map.

4. **Cleaner URL building** — Used `URLSearchParams` in `buildEditorUrl()` instead of manual string concatenation.

5. **Optional chaining** — Replaced verbose `typeof console !== 'undefined'` guards with `console.warn?.()` etc.

6. **Simplified warning printing** — Used `slice` and `forEach` instead of a manual `for` loop with a `break`.

7. **Curried callback** — Used `.bind()` in `tryApplyUpdates` to avoid an extra closure layer for `handleApplyUpdates`.

8. **Named constants** — Extracted magic values like `5` and `'/static/js/bundle.js'` into named constants.