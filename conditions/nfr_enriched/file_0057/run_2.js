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
// Utility Functions
// ============================================================================

function safeConsoleCall(method, ...args) {
  if (typeof console !== 'undefined' && typeof console[method] === 'function') {
    console[method](...args);
  }
}

function clearConsoleIfNeeded() {
  if (state.hasCompileErrors) {
    safeConsoleCall('clear');
  }
}

function dismissErrorOverlayIfNeeded() {
  if (!state.hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
}

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
  return hasReactRefresh && status && !['abort', 'fail'].includes(status);
}

function formatEditorUrl(errorLocation) {
  const params = new URLSearchParams({
    fileName: errorLocation.fileName,
    lineNumber: errorLocation.lineNumber || 1,
    colNumber: errorLocation.colNumber || 1,
  });
  return `${launchEditorEndpoint}?${params.toString()}`;
}

// ============================================================================
// Error Overlay Setup
// ============================================================================

ErrorOverlay.setEditorHandler((errorLocation) => {
  fetch(formatEditorUrl(errorLocation));
});

ErrorOverlay.startReportingRuntimeErrors({
  onError: () => {
    state.hadRuntimeError = true;
  },
  filename: CONFIG.bundlePath,
});

if (module.hot?.dispose) {
  module.hot.dispose(() => {
    ErrorOverlay.stopReportingRuntimeErrors();
  });
}

// ============================================================================
// WebSocket Connection
// ============================================================================

const connection = new WebSocket(url.format(WS_CONFIG));

connection.onclose = () => {
  safeConsoleCall(
    'info',
    'The development server has disconnected.\nRefresh the page if necessary.'
  );
};

// ============================================================================
// Message Handlers
// ============================================================================

function handleSuccess() {
  clearConsoleIfNeeded();

  const isHotUpdate = !state.isFirstCompilation;
  state.isFirstCompilation = false;
  state.hasCompileErrors = false;

  if (isHotUpdate) {
    tryApplyUpdates(() => dismissErrorOverlayIfNeeded());
  }
}

function handleWarnings(warnings) {
  clearConsoleIfNeeded();

  const isHotUpdate = !state.isFirstCompilation;
  state.isFirstCompilation = false;
  state.hasCompileErrors = false;

  printWarnings(warnings);

  if (isHotUpdate) {
    tryApplyUpdates(() => dismissErrorOverlayIfNeeded());
  }
}

function printWarnings(warnings) {
  const formatted = formatWebpackMessages({
    warnings,
    errors: [],
  });

  formatted.warnings.forEach((warning, index) => {
    if (index === CONFIG.maxWarningsToShow) {
      safeConsoleCall('warn', CONFIG.warningsTruncatedMessage);
      return;
    }
    safeConsoleCall('warn', stripAnsi(warning));
  });
}

function handleErrors(errors) {
  clearConsoleIfNeeded();

  state.isFirstCompilation = false;
  state.hasCompileErrors = true;

  const formatted = formatWebpackMessages({
    errors,
    warnings: [],
  });

  ErrorOverlay.reportBuildError(formatted.errors[0]);

  formatted.errors.forEach((error) => {
    safeConsoleCall('error', stripAnsi(error));
  });
}

function handleAvailableHash(hash) {
  state.mostRecentCompilationHash = hash;
}

const messageHandlers = {
  hash: handleAvailableHash,
  'still-ok': handleSuccess,
  ok: handleSuccess,
  'content-changed': () => window.location.reload(),
  warnings: handleWarnings,
  errors: handleErrors,
};

connection.onmessage = (event) => {
  const message = JSON.parse(event.data);
  const handler = messageHandlers[message.type];
  if (handler) {
    handler(message.data);
  }
};

// ============================================================================
// Hot Module Replacement
// ============================================================================

function handleApplyUpdates(err, updatedModules, onHotUpdateSuccess) {
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

  // Handle webpack 2+ Promise-based API
  if (result?.then) {
    result.then(
      (updatedModules) => handleApplyUpdates(null, updatedModules, onHotUpdateSuccess),
      (err) => handleApplyUpdates(err, null, onHotUpdateSuccess)
    );
  }
}
```