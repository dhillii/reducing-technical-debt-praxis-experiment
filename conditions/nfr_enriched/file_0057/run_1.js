```javascript
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

// This alternative WebpackDevServer combines the functionality of:
// https://github.com/webpack/webpack-dev-server/blob/webpack-1/client/index.js
// https://github.com/webpack/webpack/blob/webpack-1/hot/dev-server.js

// It only supports their simplest configuration (hot updates on same server).
// It makes some opinionated choices on top, like adding a syntax error overlay
// that looks similar to our console output. The error overlay is inspired by:
// https://github.com/glenjamin/webpack-hot-middleware

const stripAnsi = require('strip-ansi');
const url = require('url');
const launchEditorEndpoint = require('./launchEditorEndpoint');
const formatWebpackMessages = require('./formatWebpackMessages');
const ErrorOverlay = require('react-error-overlay');

// ============================================================================
// State Management
// ============================================================================

let isFirstCompilation = true;
let mostRecentCompilationHash = null;
let hadRuntimeError = false;
let hasCompileErrors = false;

// ============================================================================
// Error Overlay Setup
// ============================================================================

/**
 * Configures the error overlay editor handler to launch the editor at the
 * specified error location.
 */
function setupErrorOverlayEditor() {
  ErrorOverlay.setEditorHandler(function editorHandler(errorLocation) {
    // Keep this sync with errorOverlayMiddleware.js
    fetch(
      launchEditorEndpoint +
        '?fileName=' +
        window.encodeURIComponent(errorLocation.fileName) +
        '&lineNumber=' +
        window.encodeURIComponent(errorLocation.lineNumber || 1) +
        '&colNumber=' +
        window.encodeURIComponent(errorLocation.colNumber || 1)
    );
  });
}

/**
 * Initializes runtime error reporting. Tracks if a runtime error occurs
 * to determine if a full page reload is necessary.
 */
function initializeRuntimeErrorReporting() {
  ErrorOverlay.startReportingRuntimeErrors({
    onError: function () {
      hadRuntimeError = true;
    },
    filename: '/static/js/bundle.js',
  });
}

/**
 * Registers cleanup handler for hot module replacement disposal.
 */
function registerHotModuleDisposal() {
  if (module.hot && typeof module.hot.dispose === 'function') {
    module.hot.dispose(function () {
      ErrorOverlay.stopReportingRuntimeErrors();
    });
  }
}

setupErrorOverlayEditor();
initializeRuntimeErrorReporting();
registerHotModuleDisposal();

// ============================================================================
// WebSocket Connection
// ============================================================================

/**
 * Creates a WebSocket connection to the development server.
 */
function createDevServerConnection() {
  return new WebSocket(
    url.format({
      protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
      hostname: process.env.WDS_SOCKET_HOST || window.location.hostname,
      port: process.env.WDS_SOCKET_PORT || window.location.port,
      pathname: process.env.WDS_SOCKET_PATH || '/ws',
      slashes: true,
    })
  );
}

const connection = createDevServerConnection();

/**
 * Handles WebSocket connection closure.
 */
function handleConnectionClose() {
  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info(
      'The development server has disconnected.\nRefresh the page if necessary.'
    );
  }
}

connection.onclose = handleConnectionClose;

// ============================================================================
// Console Management
// ============================================================================

/**
 * Clears console if there are outdated compile errors.
 */
function clearOutdatedErrors() {
  if (typeof console !== 'undefined' && typeof console.clear === 'function') {
    if (hasCompileErrors) {
      console.clear();
    }
  }
}

/**
 * Logs warnings to the console, limiting output to first 5 warnings.
 */
function logWarningsToConsole(warnings) {
  const formatted = formatWebpackMessages({
    warnings: warnings,
    errors: [],
  });

  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    for (let i = 0; i < formatted.warnings.length; i++) {
      if (i === 5) {
        console.warn(
          'There were more warnings in other files.\n' +
            'You can find a complete log in the terminal.'
        );
        break;
      }
      console.warn(stripAnsi(formatted.warnings[i]));
    }
  }
}

/**
 * Logs errors to the console.
 */
function logErrorsToConsole(errors) {
  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    for (let i = 0; i < errors.length; i++) {
      console.error(stripAnsi(errors[i]));
    }
  }
}

// ============================================================================
// Compilation State Handlers
// ============================================================================

/**
 * Handles successful compilation without errors or warnings.
 */
function handleSuccess() {
  clearOutdatedErrors();

  const isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  hasCompileErrors = false;

  if (isHotUpdate) {
    tryApplyUpdates(tryDismissErrorOverlay);
  }
}

/**
 * Handles compilation with warnings.
 */
function handleWarnings(warnings) {
  clearOutdatedErrors();

  const isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  hasCompileErrors = false;

  logWarningsToConsole(warnings);

  if (isHotUpdate) {
    tryApplyUpdates(tryDismissErrorOverlay);
  }
}

/**
 * Handles compilation with errors.
 */
function handleErrors(errors) {
  clearOutdatedErrors();

  isFirstCompilation = false;
  hasCompileErrors = true;

  const formatted = formatWebpackMessages({
    errors: errors,
    warnings: [],
  });

  ErrorOverlay.reportBuildError(formatted.errors[0]);
  logErrorsToConsole(formatted.errors);
}

/**
 * Updates the most recent compilation hash.
 */
function handleAvailableHash(hash) {
  mostRecentCompilationHash = hash;
}

/**
 * Dismisses error overlay if there are no compile errors.
 */
function tryDismissErrorOverlay() {
  if (!hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
}

// ============================================================================
// Message Routing
// ============================================================================

/**
 * Routes messages from the development server to appropriate handlers.
 */
function routeServerMessage(message) {
  switch (message.type) {
    case 'hash':
      handleAvailableHash(message.data);
      break;
    case 'still-ok':
    case 'ok':
      handleSuccess();
      break;
    case 'content-changed':
      window.location.reload();
      break;
    case 'warnings':
      handleWarnings(message.data);
      break;
    case 'errors':
      handleErrors(message.data);
      break;
    default:
      // Do nothing.
  }
}

connection.onmessage = function (e) {
  const message = JSON.parse(e.data);
  routeServerMessage(message);
};

// ============================================================================
// Hot Module Replacement
// ============================================================================

/**
 * Checks if a newer version of the code is available.
 */
function isUpdateAvailable() {
  /* globals __webpack_hash__ */
  return mostRecentCompilationHash !== __webpack_hash__;
}

/**
 * Checks if hot module replacement is in a state that allows updates.
 */
function canApplyUpdates() {
  return module.hot.status() === 'idle';
}

/**
 * Determines if the current state can accept errors during hot updates.
 * React Refresh can handle errors, but certain states require a full reload.
 */
function canAcceptErrors() {
  const hasReactRefresh = process.env.FAST_REFRESH;
  const status = module.hot.status();

  return hasReactRefresh && ['abort', 'fail'].indexOf(status) === -1;
}

/**
 * Handles the result of a hot module replacement check.
 */
function handleApplyUpdatesResult(err, updatedModules, onHotUpdateSuccess) {
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
    tryApplyUpdates(onHotUpdateSuccess);
  }
}

/**
 * Attempts to apply hot module updates, falling back to a full reload if necessary.
 */
function tryApplyUpdates(onHotUpdateSuccess) {
  if (!module.hot) {
    window.location.reload();
    return;
  }

  if (!isUpdateAvailable() || !canApplyUpdates()) {
    return;
  }

  const result = module.hot.check(/* autoApply */ true, function (err, updatedModules) {
    handleApplyUpdatesResult(err, updatedModules, onHotUpdateSuccess);
  });

  // webpack 2 returns a Promise instead of invoking a callback
  if (result && result.then) {
    result.then(
      function (updatedModules) {
        handleApplyUpdatesResult(null, updatedModules, onHotUpdateSuccess);
      },
      function (err) {
        handleApplyUpdatesResult(err, null, onHotUpdateSuccess);
      }
    );
  }
}
```