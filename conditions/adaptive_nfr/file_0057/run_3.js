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
  ErrorOverlay.setEditorHandler(handleEditorError);
  ErrorOverlay.startReportingRuntimeErrors({
    onError: () => {
      state.hadRuntimeError = true;
    },
    filename: '/static/js/bundle.js',
  });

  if (module.hot && typeof module.hot.dispose === 'function') {
    module.hot.dispose(() => {
      ErrorOverlay.stopReportingRuntimeErrors();
    });
  }
}

function handleEditorError(errorLocation) {
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
  connection.onclose = () => {
    if (typeof console !== 'undefined' && typeof console.info === 'function') {
      console.info(
        'The development server has disconnected.\nRefresh the page if necessary.'
      );
    }
  };

  connection.onmessage = handleWebSocketMessage;
}

// ============================================================================
// Console Utilities
// ============================================================================

function clearConsole() {
  if (typeof console !== 'undefined' && typeof console.clear === 'function') {
    if (state.hasCompileErrors) {
      console.clear();
    }
  }
}

function logWarnings(warnings) {
  const formatted = formatWebpackMessages({
    warnings,
    errors: [],
  });

  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    formatted.warnings.forEach((warning, index) => {
      if (index === 5) {
        console.warn(
          'There were more warnings in other files.\n' +
            'You can find a complete log in the terminal.'
        );
        return;
      }
      console.warn(stripAnsi(warning));
    });
  }
}

function logErrors(errors) {
  const formatted = formatWebpackMessages({
    errors,
    warnings: [],
  });

  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    formatted.errors.forEach((error) => {
      console.error(stripAnsi(error));
    });
  }

  return formatted;
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

  logWarnings(warnings);

  if (isHotUpdate) {
    tryApplyUpdates(() => {
      tryDismissErrorOverlay();
    });
  }
}

function handleErrors(errors) {
  clearConsole();

  state.isFirstCompilation = false;
  state.hasCompileErrors = true;

  const formatted = logErrors(errors);
  ErrorOverlay.reportBuildError(formatted.errors[0]);
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
// WebSocket Message Router
// ============================================================================

const messageHandlers = {
  hash: (data) => handleAvailableHash(data),
  'still-ok': () => handleSuccess(),
  ok: () => handleSuccess(),
  'content-changed': () => window.location.reload(),
  warnings: (data) => handleWarnings(data),
  errors: (data) => handleErrors(data),
};

function handleWebSocketMessage(event) {
  const message = JSON.parse(event.data);
  const handler = messageHandlers[message.type];
  if (handler) {
    handler(message.data);
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
  return hasReactRefresh && ['abort', 'fail'].indexOf(status) === -1;
}

function handleApplyUpdates(err, updatedModules, onHotUpdateSuccess) {
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
    handleApplyUpdates(err, updatedModules, onHotUpdateSuccess);
  });

  if (result && result.then) {
    result.then(
      (updatedModules) => {
        handleApplyUpdates(null, updatedModules, onHotUpdateSuccess);
      },
      (err) => {
        handleApplyUpdates(err, null, onHotUpdateSuccess);
      }
    );
  }
}

// ============================================================================
// Initialization
// ============================================================================

setupErrorOverlay();
const connection = createWebSocketConnection();
setupWebSocketConnection(connection);
```