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

const SOCKET_CONFIG = {
  protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
  hostname: process.env.WDS_SOCKET_HOST || window.location.hostname,
  port: process.env.WDS_SOCKET_PORT || window.location.port,
  pathname: process.env.WDS_SOCKET_PATH || '/ws',
  slashes: true,
};

const MESSAGE_TYPES = {
  HASH: 'hash',
  STILL_OK: 'still-ok',
  OK: 'ok',
  CONTENT_CHANGED: 'content-changed',
  WARNINGS: 'warnings',
  ERRORS: 'errors',
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
  const connection = new WebSocket(url.format(SOCKET_CONFIG));

  connection.onclose = () => {
    logInfo(
      'The development server has disconnected.\nRefresh the page if necessary.'
    );
  };

  connection.onmessage = (event) => {
    handleMessage(JSON.parse(event.data));
  };

  return connection;
}

// ============================================================================
// Message Handling
// ============================================================================

const messageHandlers = {
  [MESSAGE_TYPES.HASH]: (data) => {
    state.mostRecentCompilationHash = data;
  },
  [MESSAGE_TYPES.STILL_OK]: handleSuccess,
  [MESSAGE_TYPES.OK]: handleSuccess,
  [MESSAGE_TYPES.CONTENT_CHANGED]: () => {
    window.location.reload();
  },
  [MESSAGE_TYPES.WARNINGS]: handleWarnings,
  [MESSAGE_TYPES.ERRORS]: handleErrors,
};

function handleMessage(message) {
  const handler = messageHandlers[message.type];
  if (handler) {
    handler(message.data);
  }
}

// ============================================================================
// Compilation State Handlers
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

  const formatted = formatWebpackMessages({ errors, warnings: [] });

  ErrorOverlay.reportBuildError(formatted.errors[0]);
  logErrors(formatted.errors);
}

// ============================================================================
// Utility Functions
// ============================================================================

function clearOutdatedErrors() {
  if (state.hasCompileErrors && canClearConsole()) {
    console.clear();
  }
}

function printWarnings(warnings) {
  const formatted = formatWebpackMessages({ warnings, errors: [] });

  if (!canLogToConsole()) return;

  formatted.warnings.forEach((warning, index) => {
    if (index === CONFIG.maxWarningsToShow) {
      console.warn(CONFIG.warningsTruncatedMessage);
      return;
    }
    console.warn(stripAnsi(warning));
  });
}

function logErrors(errors) {
  if (!canLogToConsole()) return;
  errors.forEach((error) => console.error(stripAnsi(error)));
}

function tryDismissErrorOverlay() {
  if (!state.hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
}

function canClearConsole() {
  return typeof console !== 'undefined' && typeof console.clear === 'function';
}

function canLogToConsole() {
  return typeof console !== 'undefined' && typeof console.warn === 'function';
}

function logInfo(message) {
  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info(message);
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

function tryApplyUpdates(onHotUpdateSuccess) {
  if (!module.hot) {
    window.location.reload();
    return;
  }

  if (!isUpdateAvailable() || !canApplyUpdates()) {
    return;
  }

  const result = module.hot.check(true, handleApplyUpdates);

  if (result?.then) {
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

    onHotUpdateSuccess?.();

    if (isUpdateAvailable()) {
      tryApplyUpdates(onHotUpdateSuccess);
    }
  }
}

// ============================================================================
// Initialization
// ============================================================================

setupErrorOverlay();
createWebSocketConnection();
```