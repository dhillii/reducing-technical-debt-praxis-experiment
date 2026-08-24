'use strict';

// This alternative WebpackDevServer combines the functionality of:
// https://github.com/webpack/webpack-dev-server/blob/webpack-1/client/index.js
// https://github.com/webpack/webpack/blob/webpack-1/hot/dev-server.js

// It only supports their simplest configuration (hot updates on same server).
// It makes some opinionated choices on top, like adding a syntax error overlay
// that looks similar to our console output. The error overlay is inspired by:
// https://github.com/glenjamin/webpack-hot-middleware

var stripAnsi = require('strip-ansi');
var url = require('url');
var launchEditorEndpoint = require('./launchEditorEndpoint');
var formatWebpackMessages = require('./formatWebpackMessages');
var ErrorOverlay = require('react-error-overlay');

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

// We need to keep track of if there has been a runtime error.
// Essentially, we cannot guarantee application state was not corrupted by the
// runtime error. To prevent confusing behavior, we forcibly reload the entire
// application. This is handled below when we are notified of a compile (code
// change).
// See https://github.com/facebook/create-react-app/issues/3096
var hadRuntimeError = false;
ErrorOverlay.startReportingRuntimeErrors({
  onError: function () {
    hadRuntimeError = true;
  },
  filename: '/static/js/bundle.js',
});

if (module.hot && typeof module.hot.dispose === 'function') {
  module.hot.dispose(function () {
    // TODO: why do we need this?
    ErrorOverlay.stopReportingRuntimeErrors();
  });
}

/**
 * Constructs the WebSocket URL for connecting to WebpackDevServer.
 * @returns {string} The fully formatted WebSocket URL.
 */
function buildWebSocketUrl() {
  return url.format({
    protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
    hostname: process.env.WDS_SOCKET_HOST || window.location.hostname,
    port: process.env.WDS_SOCKET_PORT || window.location.port,
    pathname: process.env.WDS_SOCKET_PATH || '/ws',
    slashes: true,
  });
}

// Connect to WebpackDevServer via a socket.
var connection = new WebSocket(buildWebSocketUrl());

/**
 * Handles connection close event by logging a friendly message.
 */
function handleConnectionClose() {
  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info(
      'The development server has disconnected.\nRefresh the page if necessary.'
    );
  }
}

// Unlike WebpackDevServer client, we won't try to reconnect
// to avoid spamming the console. Disconnect usually happens
// when developer stops the server.
connection.onclose = handleConnectionClose;

// Remember some state related to hot module replacement.
var isFirstCompilation = true;
var mostRecentCompilationHash = null;
var hasCompileErrors = false;

/**
 * Clears outdated compile errors from the console if present.
 */
function clearOutdatedErrors() {
  if (typeof console !== 'undefined' && typeof console.clear === 'function') {
    if (hasCompileErrors) {
      console.clear();
    }
  }
}

/**
 * Processes successful compilation events.
 */
function handleSuccess() {
  clearOutdatedErrors();

  var isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  hasCompileErrors = false;

  if (isHotUpdate) {
    tryApplyUpdates(tryDismissErrorOverlay);
  }
}

/**
 * Prints warnings to the console, limited to first 5 warnings.
 * @param {string[]} warnings - Array of warning messages.
 */
function printWarnings(warnings) {
  var formatted = formatWebpackMessages({
    warnings: warnings,
    errors: [],
  });

  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    for (var i = 0; i < formatted.warnings.length; i++) {
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
 * Processes compilation with warnings (e.g., ESLint).
 * @param {string[]} warnings - Array of warning messages.
 */
function handleWarnings(warnings) {
  clearOutdatedErrors();

  isFirstCompilation = false;
  hasCompileErrors = false;

  printWarnings(warnings);

  if (!isFirstCompilation) {
    tryApplyUpdates(tryDismissErrorOverlay);
  }
}

/**
 * Processes compilation errors and reports them to the error overlay and console.
 * @param {string[]} errors - Array of error messages.
 */
function handleErrors(errors) {
  clearOutdatedErrors();

  isFirstCompilation = false;
  hasCompileErrors = true;

  var formatted = formatWebpackMessages({
    errors: errors,
    warnings: [],
  });

  ErrorOverlay.reportBuildError(formatted.errors[0]);

  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    for (var i = 0; i < formatted.errors.length; i++) {
      console.error(stripAnsi(formatted.errors[i]));
    }
  }
}

/**
 * Dismisses the error overlay if no compile errors are present.
 */
function tryDismissErrorOverlay() {
  if (!hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
}

/**
 * Updates the most recent compilation hash.
 * @param {string} hash - The new compilation hash.
 */
function handleAvailableHash(hash) {
  mostRecentCompilationHash = hash;
}

/**
 * Handles incoming messages from the WebpackDevServer.
 * @param {MessageEvent} e - WebSocket message event.
 */
function handleServerMessage(e) {
  var message = JSON.parse(e.data);
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

// Handle messages from the server.
connection.onmessage = handleServerMessage;

/**
 * Determines whether a newer version of the compiled code is available.
 * @returns {boolean} True if an update is available.
 */
function isUpdateAvailable() {
  /* globals __webpack_hash__ */
  return mostRecentCompilationHash !== __webpack_hash__;
}

/**
 * Checks whether the module hot replacement system is idle.
 * @returns {boolean} True if status is 'idle'.
 */
function canApplyUpdates() {
  return module.hot.status() === 'idle';
}

/**
 * Determines if React Fast Refresh can safely accept updates in the current state.
 * @returns {boolean} True if updates can be accepted.
 */
function canAcceptErrors() {
  const hasReactRefresh = process.env.FAST_REFRESH;

  const status = module.hot.status();
  return hasReactRefresh && ['abort', 'fail'].indexOf(status) === -1;
}

/**
 * Attempts to apply hot updates, falling back to full reload on failure.
 * @param {Function} [onHotUpdateSuccess] - Callback on successful hot update.
 */
function tryApplyUpdates(onHotUpdateSuccess) {
  if (!module.hot) {
    window.location.reload();
    return;
  }

  if (!isUpdateAvailable() || !canApplyUpdates()) {
    return;
  }

  /**
   * Handles the result of a hot update check application.
   * @param {Error|null} err - Error if update failed.
   * @param {Array|string|null} updatedModules - Modules updated, or null.
   */
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
      tryApplyUpdates(onHotUpdateSuccess);
    }
  }

  var result = module.hot.check(true, handleApplyUpdates);

  if (result && result.then) {
    result.then(
      function (updatedModules) {
        handleApplyUpdates(null, updatedModules);
      },
      function (err) {
        handleApplyUpdates(err, null);
      }
    );
  }
}