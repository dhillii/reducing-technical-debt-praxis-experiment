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

// Configure editor handler for error overlay.
ErrorOverlay.setEditorHandler(function editorHandler(errorLocation) {
  // Keep this sync with errorOverlayMiddleware.js
  fetch(
    `${launchEditorEndpoint}?fileName=${window.encodeURIComponent(
      errorLocation.fileName
    )}&lineNumber=${window.encodeURIComponent(
      errorLocation.lineNumber || 1
    )}&colNumber=${window.encodeURIComponent(
      errorLocation.colNumber || 1
    )}`
  );
});

// Track runtime errors to force a full reload on next successful compile.
let hadRuntimeError = false;
ErrorOverlay.startReportingRuntimeErrors({
  onError: () => {
    hadRuntimeError = true;
  },
  filename: '/static/js/bundle.js',
});

if (module.hot && typeof module.hot.dispose === 'function') {
  module.hot.dispose(() => {
    // Stop reporting runtime errors when the module is disposed.
    ErrorOverlay.stopReportingRuntimeErrors();
  });
}

// Establish WebSocket connection to the dev server.
const connection = new WebSocket(
  url.format({
    protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
    hostname: process.env.WDS_SOCKET_HOST || window.location.hostname,
    port: process.env.WDS_SOCKET_PORT || window.location.port,
    pathname: process.env.WDS_SOCKET_PATH || '/ws',
    slashes: true,
  })
);

// Log disconnection notice.
connection.onclose = () => {
  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info(
      'The development server has disconnected.\nRefresh the page if necessary.'
    );
  }
};

// State tracking for HMR.
let isFirstCompilation = true;
let mostRecentCompilationHash = null;
let hasCompileErrors = false;

/**
 * Clears console if previous compile had errors.
 */
function clearOutdatedErrors() {
  if (
    typeof console !== 'undefined' &&
    typeof console.clear === 'function' &&
    hasCompileErrors
  ) {
    console.clear();
  }
}

/**
 * Handles successful compilation.
 */
function handleSuccess() {
  clearOutdatedErrors();

  const isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  hasCompileErrors = false;

  if (isHotUpdate) {
    tryApplyUpdates(() => {
      tryDismissErrorOverlay();
    });
  }
}

/**
 * Prints formatted warnings to the console.
 * @param {string[]} warnings
 */
function printFormattedWarnings(warnings) {
  const formatted = formatWebpackMessages({
    warnings,
    errors: [],
  });

  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    formatted.warnings.forEach((msg, index) => {
      if (index === 5) {
        console.warn(
          'There were more warnings in other files.\n' +
            'You can find a complete log in the terminal.'
        );
        return;
      }
      console.warn(stripAnsi(msg));
    });
  }
}

/**
 * Handles compilation that produced warnings.
 * @param {string[]} warnings
 */
function handleWarnings(warnings) {
  clearOutdatedErrors();

  const isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  hasCompileErrors = false;

  printFormattedWarnings(warnings);

  if (isHotUpdate) {
    tryApplyUpdates(() => {
      tryDismissErrorOverlay();
    });
  }
}

/**
 * Logs formatted errors and reports the first one to the overlay.
 * @param {string[]} errors
 */
function handleErrors(errors) {
  clearOutdatedErrors();

  isFirstCompilation = false;
  hasCompileErrors = true;

  const formatted = formatWebpackMessages({
    errors,
    warnings: [],
  });

  // Show the first error in the overlay.
  ErrorOverlay.reportBuildError(formatted.errors[0]);

  // Log all errors to the console.
  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    formatted.errors.forEach((msg) => {
      console.error(stripAnsi(msg));
    });
  }
}

/**
 * Dismisses the error overlay if there are no compile errors.
 */
function tryDismissErrorOverlay() {
  if (!hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
}

/**
 * Updates the stored hash of the most recent compilation.
 * @param {string} hash
 */
function handleAvailableHash(hash) {
  mostRecentCompilationHash = hash;
}

/**
 * Determines whether a newer compilation is available.
 * @returns {boolean}
 */
function isUpdateAvailable() {
  /* globals __webpack_hash__ */
  return mostRecentCompilationHash !== __webpack_hash__;
}

/**
 * Checks if HMR can currently apply updates.
 * @returns {boolean}
 */
function canApplyUpdates() {
  return module.hot.status() === 'idle';
}

/**
 * Determines if errors can be accepted based on React Refresh status.
 * @returns {boolean}
 */
function canAcceptErrors() {
  const hasReactRefresh = process.env.FAST_REFRESH;
  const status = module.hot.status();
  return (
    hasReactRefresh && ['abort', 'fail'].indexOf(status) === -1
  );
}

/**
 * Handles the result of a hot update check.
 * @param {Error|null} err
 * @param {Array<string>|null} updatedModules
 * @param {Function} [onHotUpdateSuccess]
 */
function processHotUpdateResult(err, updatedModules, onHotUpdateSuccess) {
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
    // New update arrived while processing the previous one.
    tryApplyUpdates();
  }
}

/**
 * Attempts to apply hot updates; falls back to full reload if not possible.
 * @param {Function} [onHotUpdateSuccess]
 */
function tryApplyUpdates(onHotUpdateSuccess) {
  if (!module.hot) {
    window.location.reload();
    return;
  }

  if (!isUpdateAvailable() || !canApplyUpdates()) {
    return;
  }

  const result = module.hot.check(true, (err, updatedModules) => {
    processHotUpdateResult(err, updatedModules, onHotUpdateSuccess);
  });

  // Webpack 2+ returns a Promise.
  if (result && typeof result.then === 'function') {
    result.then(
      (updatedModules) => processHotUpdateResult(null, updatedModules, onHotUpdateSuccess),
      (err) => processHotUpdateResult(err, null, onHotUpdateSuccess)
    );
  }
}

/**
 * Dispatches incoming WebSocket messages to appropriate handlers.
 * @param {MessageEvent} e
 */
function handleSocketMessage(e) {
  const message = JSON.parse(e.data);
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
    // No action needed.
  }
}

// Register message handler.
connection.onmessage = handleSocketMessage;