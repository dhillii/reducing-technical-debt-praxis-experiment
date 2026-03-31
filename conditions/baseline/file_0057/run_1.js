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
const MAX_WARNINGS_TO_DISPLAY = 5;
const WARNING_LIMIT_MESSAGE =
  'There were more warnings in other files.\nYou can find a complete log in the terminal.';

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
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const hostname = process.env.WDS_SOCKET_HOST || window.location.hostname;
  const port = process.env.WDS_SOCKET_PORT || window.location.port;
  const pathname = process.env.WDS_SOCKET_PATH || '/ws';

  return new WebSocket(
    url.format({
      protocol,
      hostname,
      port,
      pathname,
      slashes: true,
    })
  );
}

function setupWebSocketConnection(connection) {
  connection.onmessage = handleWebSocketMessage;
  connection.onclose = handleWebSocketClose;
}

function handleWebSocketClose() {
  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info(
      'The development server has disconnected.\nRefresh the page if necessary.'
    );
  }
}

// ============================================================================
// Message Handlers
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

function handleWebSocketMessage(event) {
  const message = JSON.parse(event.data);
  const handler = messageHandlers[message.type];
  if (handler) {
    handler(message.data);
  }
}

// ============================================================================
// Compilation State Handlers
// ============================================================================

function clearOutdatedErrors() {
  if (
    state.hasCompileErrors &&
    typeof console !== 'undefined' &&
    typeof console.clear === 'function'
  ) {
    console.clear();
  }
}

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
  logErrorsToConsole(formatted.errors);
}

// ============================================================================
// Console Output Utilities
// ============================================================================

function printWarnings(warnings) {
  const formatted = formatWebpackMessages({
    warnings,
    errors: [],
  });

  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    formatted.warnings.forEach((warning, index) => {
      if (index === MAX_WARNINGS_TO_DISPLAY) {
        console.warn(WARNING_LIMIT_MESSAGE);
        return;
      }
      console.warn(stripAnsi(warning));
    });
  }
}

function logErrorsToConsole(errors) {
  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    errors.forEach((error) => {
      console.error(stripAnsi(error));
    });
  }
}

function tryDismissErrorOverlay() {
  if (!state.hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
}

// ============================================================================
// Hot Module Replacement Logic
// ============================================================================

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

function tryApplyUpdates(onHotUpdateSuccess) {
  if (!module.hot) {
    window.location.reload();
    return;
  }

  if (!isUpdateAvailable() || !canApplyUpdates()) {
    return;
  }

  const result = module.hot.check(true, handleApplyUpdates);

  if (result && typeof result.then === 'function') {
    result.then(
      (updatedModules) => handleApplyUpdates(null, updatedModules),
      (err) => handleApplyUpdates(err, null)
    );
  }

  function handleApplyUpdates(err, updatedModules) {
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
}

// ============================================================================
// Initialization
// ============================================================================

setupErrorOverlay();
const connection = createWebSocketConnection();
setupWebSocketConnection(connection);
```