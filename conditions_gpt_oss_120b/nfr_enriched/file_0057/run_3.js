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

// Connect to WebpackDevServer via a socket.
const connection = new WebSocket(
  url.format({
    protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
    hostname: process.env.WDS_SOCKET_HOST || window.location.hostname,
    port: process.env.WDS_SOCKET_PORT || window.location.port,
    // Hardcoded in WebpackDevServer
    pathname: process.env.WDS_SOCKET_PATH || '/ws',
    slashes: true,
  })
);

connection.onclose = function () {
  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info(
      'The development server has disconnected.\nRefresh the page if necessary.'
    );
  }
};

let isFirstCompilation = true;
let mostRecentCompilationHash = null;
let hasCompileErrors = false;

/**
 * Clears console if there were previous compile errors.
 */
function clearOutdatedErrors() {
  if (typeof console !== 'undefined' && typeof console.clear === 'function') {
    if (hasCompileErrors) {
      console.clear();
    }
  }
}

/**
 * Dismisses the error overlay when there are no compile errors.
 */
function tryDismissErrorOverlay() {
  if (!hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
}

/**
 * Handles a successful compilation.
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
 * Formats and prints warnings to the console.
 * @param {string[]} warnings
 */
function printWarnings(warnings) {
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
 * Handles compilation with warnings.
 * @param {string[]} warnings
 */
function handleWarnings(warnings) {
  clearOutdatedErrors();

  const isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  hasCompileErrors = false;

  printWarnings(warnings);

  if (isHotUpdate) {
    tryApplyUpdates(() => {
      tryDismissErrorOverlay();
    });
  }
}

/**
 * Handles compilation with errors.
 * @param {string[]} errors
 */
function handleErrors(errors) {
  clearOutdatedErrors();

  isFirstCompilation = false;
  hasCompileErrors = true;

  const formatted = formatWebpackMessages({
    errors: errors,
    warnings: [],
  });

  // Show the first error in the overlay.
  ErrorOverlay.reportBuildError(formatted.errors[0]);

  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    for (let i = 0; i < formatted.errors.length; i++) {
      console.error(stripAnsi(formatted.errors[i]));
    }
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
 * Checks if hot updates can be applied based on HMR status.
 * @returns {boolean}
 */
function canApplyUpdates() {
  return module.hot.status() === 'idle';
}

/**
 * Determines if errors can be accepted by React Refresh.
 * @returns {boolean}
 */
function canAcceptErrors() {
  const hasReactRefresh = process.env.FAST_REFRESH;
  const status = module.hot.status();
  return hasReactRefresh && ['abort', 'fail'].indexOf(status) === -1;
}

/**
 * Handles the result of a hot module check.
 * @param {Error|null} err
 * @param {Array<string>|null} updatedModules
 * @param {Function} [onHotUpdateSuccess]
 */
function handleApplyUpdates(err, updatedModules, onHotUpdateSuccess) {
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

  const checkResult = module.hot.check(/* autoApply */ true, (err, updatedModules) => {
    handleApplyUpdates(err, updatedModules, onHotUpdateSuccess);
  });

  if (checkResult && typeof checkResult.then === 'function') {
    checkResult.then(
      (updatedModules) => handleApplyUpdates(null, updatedModules, onHotUpdateSuccess),
      (err) => handleApplyUpdates(err, null, onHotUpdateSuccess)
    );
  }
}

/**
 * Processes a 'hash' message.
 * @param {string} hash
 */
function processHashMessage(hash) {
  handleAvailableHash(hash);
}

/**
 * Processes an 'ok' or 'still-ok' message.
 */
function processOkMessage() {
  handleSuccess();
}

/**
 * Processes a 'content-changed' message.
 */
function processContentChangedMessage() {
  window.location.reload();
}

/**
 * Processes a 'warnings' message.
 * @param {string[]} warnings
 */
function processWarningsMessage(warnings) {
  handleWarnings(warnings);
}

/**
 * Processes an 'errors' message.
 * @param {string[]} errors
 */
function processErrorsMessage(errors) {
  handleErrors(errors);
}

/**
 * Dispatches incoming WebSocket messages to appropriate handlers.
 * @param {MessageEvent} e
 */
function handleSocketMessage(e) {
  const message = JSON.parse(e.data);
  switch (message.type) {
    case 'hash':
      processHashMessage(message.data);
      break;
    case 'still-ok':
    case 'ok':
      processOkMessage();
      break;
    case 'content-changed':
      processContentChangedMessage();
      break;
    case 'warnings':
      processWarningsMessage(message.data);
      break;
    case 'errors':
      processErrorsMessage(message.data);
      break;
    default:
      // No action needed.
  }
}

connection.onmessage = handleSocketMessage;