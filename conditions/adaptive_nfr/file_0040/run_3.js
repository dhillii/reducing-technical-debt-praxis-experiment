# Refactored WebpackDevServer Client

## Key Improvements
- Extracted constants and configuration
- Eliminated code duplication in `handleSuccess`/`handleWarnings`
- Simplified console guard pattern
- Extracted WebSocket URL builder
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

// --- State ---

var hadRuntimeError = false;
var isFirstCompilation = true;
var mostRecentCompilationHash = null;
var hasCompileErrors = false;

// --- Editor Handler ---

ErrorOverlay.setEditorHandler(function editorHandler(errorLocation) {
  const { fileName, lineNumber = 1, colNumber = 1 } = errorLocation;
  const params = new URLSearchParams({
    fileName,
    lineNumber,
    colNumber,
  });
  fetch(`${launchEditorEndpoint}?${params}`);
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
  consoleSafe('info', 'The development server has disconnected.\nRefresh the page if necessary.');
};

// --- Message Handlers ---

const messageHandlers = {
  hash: function (data) {
    mostRecentCompilationHash = data;
  },
  ok: handleSuccess,
  'still-ok': handleSuccess,
  'content-changed': function () {
    window.location.reload();
  },
  warnings: handleWarnings,
  errors: handleErrors,
};

connection.onmessage = function (e) {
  var message = JSON.parse(e.data);
  var handler = messageHandlers[message.type];
  if (handler) {
    handler(message.data);
  }
};

// --- Compilation Handlers ---

function handleSuccess() {
  handleCompilationComplete(false);
}

function handleWarnings(warnings) {
  handleCompilationComplete(false);

  var formatted = formatWebpackMessages({ warnings, errors: [] });
  var warningsToShow = formatted.warnings.slice(0, MAX_WARNINGS_SHOWN);

  warningsToShow.forEach(function (warning) {
    consoleSafe('warn', stripAnsi(warning));
  });

  if (formatted.warnings.length > MAX_WARNINGS_SHOWN) {
    consoleSafe('warn', 'There were more warnings in other files.\nYou can find a complete log in the terminal.');
  }
}

function handleErrors(errors) {
  clearOutdatedErrors();
  isFirstCompilation = false;
  hasCompileErrors = true;

  var formatted = formatWebpackMessages({ errors, warnings: [] });

  ErrorOverlay.reportBuildError(formatted.errors[0]);

  formatted.errors.forEach(function (error) {
    consoleSafe('error', stripAnsi(error));
  });
}

/**
 * Shared logic for successful/warning compilations.
 * Clears errors, tracks state, and attempts hot updates when applicable.
 */
function handleCompilationComplete(withErrors) {
  clearOutdatedErrors();

  var isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  hasCompileErrors = withErrors;

  if (isHotUpdate) {
    tryApplyUpdates(tryDismissErrorOverlay);
  }
}

function clearOutdatedErrors() {
  if (hasCompileErrors) {
    consoleSafe('clear');
  }
}

function tryDismissErrorOverlay() {
  if (!hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
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
  const hasReactRefresh = process.env.FAST_REFRESH;
  const status = module.hot.status();
  return hasReactRefresh && !UNRECOVERABLE_HOT_STATUSES.includes(status);
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
    const haveErrors = err || hadRuntimeError;
    const needsForcedReload = !err && !updatedModules;

    if ((haveErrors && !canAcceptErrors()) || needsForcedReload) {
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

  var result = module.hot.check(/* autoApply */ true, handleApplyUpdates);

  if (result && result.then) {
    result.then(
      function (updatedModules) { handleApplyUpdates(null, updatedModules); },
      function (err) { handleApplyUpdates(err, null); }
    );
  }
}

// --- Utilities ---

/**
 * Safely calls a console method if available.
 * Eliminates repetitive typeof console checks throughout the codebase.
 */
function consoleSafe(method) {
  var args = Array.prototype.slice.call(arguments, 1);
  if (typeof console !== 'undefined' && typeof console[method] === 'function') {
    console[method].apply(console, args);
  }
}
```

## Summary of Changes

| Area | Before | After |
|------|--------|-------|
| Console guards | Repeated `typeof console !== 'undefined'` checks | Single `consoleSafe()` utility |
| `handleSuccess` / `handleWarnings` | Duplicated state mutation logic | Unified `handleCompilationComplete()` |
| Warning loop | `for` loop with index-based break | `slice()` + `forEach` |
| Editor URL building | Manual string concatenation | `URLSearchParams` |
| Message dispatch | `switch` statement | Handler map lookup |
| Magic values | Inline literals | Named constants |
| Socket URL | Inline object | `buildSocketUrl()` function |