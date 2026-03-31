```javascript
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

const stripAnsi = require('strip-ansi');
const url = require('url');
const launchEditorEndpoint = require('./launchEditorEndpoint');
const formatWebpackMessages = require('./formatWebpackMessages');
const ErrorOverlay = require('react-error-overlay');

// ============================================================================
// Configuration & Constants
// ============================================================================

const BUNDLE_PATH = '/static/js/bundle.js';
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss' : 'ws';
const MAX_WARNINGS_TO_DISPLAY = 5;

// ============================================================================
// State Management
// ============================================================================

const state = {
  hadRuntimeError: false,
  isFirstCompilation: true,
  mostRecentCompilationHash: null,
  hasCompileErrors: false,
};

// ============================================================================
// Error Overlay Setup
// ============================================================================

function setupErrorOverlay() {
  ErrorOverlay.setEditorHandler(handleEditorRequest);
  ErrorOverlay.startReportingRuntimeErrors({
    onError: () => {
      state.hadRuntimeError = true;
    },
    filename: BUNDLE_PATH,
  });

  if (module.hot && typeof module.hot.dispose === 'function') {
    module.hot.dispose(() => {
      ErrorOverlay.stopReportingRuntimeErrors();
    });
  }
}

function handleEditorRequest(errorLocation) {
  const params = new URLSearchParams({
    fileName: errorLocation.fileName,
    lineNumber: errorLocation.lineNumber || 1,
    colNumber: errorLocation.colNumber || 1,
  });
  fetch(`${launchEditorEndpoint}?${params}`);
}

// ============================================================================
// WebSocket Connection
// ============================================================================

function createWebSocketConnection() {
  const wsUrl = url.format({
    protocol: WS_PROTOCOL,
    hostname: process.env.WDS_SOCKET_HOST || window.location.hostname,
    port: process.env.WDS_SOCKET_PORT || window.location.port,
    pathname: process.env.WDS_SOCKET_PATH || '/ws',
    slashes: true,
  });

  return new WebSocket(wsUrl);
}

function setupConnectionHandlers(connection) {
  connection.onclose = () => {
    logInfo('The development server has disconnected.\nRefresh the page if necessary.');
  };

  connection.onmessage = (event) => {
    const message = JSON.parse(event.data);
    handleServerMessage(message);
  };
}

// ============================================================================
// Message Handling
// ============================================================================

const messageHandlers = {
  hash: (data) => {
    state.mostRecentCompilationHash = data;
  },
  'still-ok': handleSuccess,
  ok: handleSuccess,
  'content-changed': () => {
    window.location.reload();
  },
  warnings: handleWarnings,
  errors: handleErrors,
};

function handleServerMessage(message) {
  const handler = messageHandlers[message.type];
  if (handler) {
    handler(message.data);
  }
}

// ============================================================================
// Compilation Handlers
// ============================================================================

function handleSuccess() {
  clearOutdatedErrors();
  const isHotUpdate = !state.isFirstCompilation;
  state.isFirstCompilation = false;
  state.hasCompileErrors = false;

  if (isHotUpdate) {
    tryApplyUpdates(tryDismissErrorOverlay);
  }
}

function handleWarnings(warnings) {
  clearOutdatedErrors();
  const isHotUpdate = !state.isFirstCompilation;
  state.isFirstCompilation = false;
  state.hasCompileErrors = false;

  printWarnings(warnings);

  if (isHotUpdate) {
    tryApplyUpdates(tryDismissErrorOverlay);
  }
}

function handleErrors(errors) {
  clearOutdatedErrors();
  state.isFirstCompilation = false;
  state.hasCompileErrors = true;

  const formatted = formatWebpackMessages({
    errors,
    warnings: [],
  });

  ErrorOverlay.reportBuildError(formatted.errors[0]);
  logErrors(formatted.errors);
}

// ============================================================================
// Utility Functions
// ============================================================================

function clearOutdatedErrors() {
  if (state.hasCompileErrors) {
    logClear();
  }
}

function tryDismissErrorOverlay() {
  if (!state.hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
}

function printWarnings(warnings) {
  const formatted = formatWebpackMessages({
    warnings,
    errors: [],
  });

  formatted.warnings.forEach((warning, index) => {
    if (index === MAX_WARNINGS_TO_DISPLAY) {
      logWarn('There were more warnings in other files.\nYou can find a complete log in the terminal.');
      return;
    }
    logWarn(stripAnsi(warning));
  });
}

function logInfo(message) {
  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info(message);
  }
}

function logWarn(message) {
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(message);
  }
}

function logError(message) {
  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    console.error(message);
  }
}

function logErrors(errors) {
  errors.forEach((error) => {
    logError(stripAnsi(error));
  });
}

function logClear() {
  if (typeof console !== 'undefined' && typeof console.clear === 'function') {
    console.clear();
  }
}

// ============================================================================
// Hot Module Replacement
// ============================================================================

function isUpdateAvailable() {
  /* globals __webpack_hash__ */
  return state.mostRecentCompilationHash !== __webpack_hash__;
}

function canApplyUpdates() {
  return module.hot && module.hot.status() === 'idle';
}

function canAcceptErrors() {
  const hasReactRefresh = process.env.FAST_REFRESH;
  const status = module.hot?.status();
  return hasReactRefresh && (!status || ['abort', 'fail'].indexOf(status) === -1);
}

function handleApplyUpdatesResult(err, updatedModules, onHotUpdateSuccess) {
  const haveErrors = err || state.hadRuntimeError;
  const needsForcedReload = !err && !updatedModules;

  if ((haveErrors && !canAcceptErrors()) || needsForcedReload) {
    window.location.reload();
    return;
  }

  if (typeof onHotUpdateSuccess === 'function') {
    onHotUpdateSuccess();
  }

  if (isUpdateAvailable()) {
    tryApplyUpdates(onHotUpdateSuccess);
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

  const result = module.hot.check(true, (err, updatedModules) => {
    handleApplyUpdatesResult(err, updatedModules, onHotUpdateSuccess);
  });

  // Handle webpack 2+ Promise-based API
  if (result && typeof result.then === 'function') {
    result.then(
      (updatedModules) => {
        handleApplyUpdatesResult(null, updatedModules, onHotUpdateSuccess);
      },
      (err) => {
        handleApplyUpdatesResult(err, null, onHotUpdateSuccess);
      }
    );
  }
}

// ============================================================================
// Initialization
// ============================================================================

setupErrorOverlay();
const connection = createWebSocketConnection();
setupConnectionHandlers(connection);
```