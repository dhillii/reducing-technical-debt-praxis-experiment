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

const CONFIG = {
  bundlePath: '/static/js/bundle.js',
  maxWarningsToShow: 5,
  warningsTruncatedMessage:
    'There were more warnings in other files.\nYou can find a complete log in the terminal.',
};

const WS_CONFIG = {
  protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
  hostname: process.env.WDS_SOCKET_HOST || window.location.hostname,
  port: process.env.WDS_SOCKET_PORT || window.location.port,
  pathname: process.env.WDS_SOCKET_PATH || '/ws',
  slashes: true,
};

// ============================================================================
// State Management
// ============================================================================

const state = {
  isFirstCompilation: true,
  mostRecentCompilationHash: null,
  hasCompileErrors: false,
  hadRuntimeError: false,
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
    filename: CONFIG.bundlePath,
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
  const wsUrl = url.format(WS_CONFIG);
  const connection = new WebSocket(wsUrl);

  connection.onclose = () => {
    logInfo(
      'The development server has disconnected.\nRefresh the page if necessary.'
    );
  };

  connection.onmessage = handleWebSocketMessage;

  return connection;
}

function handleWebSocketMessage(event) {
  const message = JSON.parse(event.data);
  const handlers = {
    hash: handleAvailableHash,
    'still-ok': handleSuccess,
    ok: handleSuccess,
    'content-changed': () => window.location.reload(),
    warnings: (data) => handleWarnings(data),
    errors: (data) => handleErrors(data),
  };

  const handler = handlers[message.type];
  if (handler) {
    handler(message.data);
  }
}

// ============================================================================
// Console Utilities
// ============================================================================

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

function clearConsole() {
  if (
    typeof console !== 'undefined' &&
    typeof console.clear === 'function' &&
    state.hasCompileErrors
  ) {
    console.clear();
  }
}

// ============================================================================
// Message Handlers
// ============================================================================

function handleSuccess() {
  clearConsole();

  const isHotUpdate = !state.isFirstCompilation;
  state.isFirstCompilation = false;
  state.hasCompileErrors = false;

  if (isHotUpdate) {
    tryApplyUpdates(() => {
      tryDismissErrorOverlay();
    });
  }
}

function handleWarnings(warnings) {
  clearConsole();

  const isHotUpdate = !state.isFirstCompilation;
  state.isFirstCompilation = false;
  state.hasCompileErrors = false;

  printWarnings(warnings);

  if (isHotUpdate) {
    tryApplyUpdates(() => {
      tryDismissErrorOverlay();
    });
  }
}

function printWarnings(warnings) {
  const formatted = formatWebpackMessages({
    warnings,
    errors: [],
  });

  formatted.warnings.forEach((warning, index) => {
    if (index === CONFIG.maxWarningsToShow) {
      logWarn(CONFIG.warningsTruncatedMessage);
      return;
    }
    logWarn(stripAnsi(warning));
  });
}

function handleErrors(errors) {
  clearConsole();

  state.isFirstCompilation = false;
  state.hasCompileErrors = true;

  const formatted = formatWebpackMessages({
    errors,
    warnings: [],
  });

  ErrorOverlay.reportBuildError(formatted.errors[0]);

  formatted.errors.forEach((error) => {
    logError(stripAnsi(error));
  });
}

function handleAvailableHash(hash) {
  state.mostRecentCompilationHash = hash;
}

function tryDismissErrorOverlay() {
  if (!state.hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
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

  const handleApplyUpdates = (err, updatedModules) => {
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
  };

  const result = module.hot.check(true, handleApplyUpdates);

  if (result && typeof result.then === 'function') {
    result.then(
      (updatedModules) => handleApplyUpdates(null, updatedModules),
      (err) => handleApplyUpdates(err, null)
    );
  }
}

// ============================================================================
// Initialization
// ============================================================================

setupErrorOverlay();
createWebSocketConnection();
```