/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in
 * the LICENSE file in the root directory of this source tree.
 */

'use strict';

var stripAnsi = require('strip-ansi');
var url = require('url');
var launchEditorEndpoint = require('./launchEditorEndpoint');
var formatWebpackMessages = require('./formatWebpackMessages');
var ErrorOverlay = require('react-error-overlay');

/**
 * Editor handler for error overlay.
 */
ErrorOverlay.setEditorHandler(function editorHandler(errorLocation) {
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

/**
 * Runtime error tracking.
 */
var hadRuntimeError = false;
ErrorOverlay.startReportingRuntimeErrors({
  onError: function () {
    hadRuntimeError = true;
  },
  filename: '/static/js/bundle.js',
});

if (module.hot && typeof module.hot.dispose === 'function') {
  module.hot.dispose(function () {
    ErrorOverlay.stopReportingRuntimeErrors();
  });
}

/**
 * WebSocket connection to WebpackDevServer.
 */
var connection = new WebSocket(
  url.format({
    protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
    hostname: process.env.WDS_SOCKET_HOST || window.location.hostname,
    port: process.env.WDS_SOCKET_PORT || window.location.port,
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

/**
 * State variables.
 */
var isFirstCompilation = true;
var mostRecentCompilationHash = null;
var hasCompileErrors = false;

/**
 * Clears outdated console errors if any.
 */
function clearOutdatedErrors() {
  if (typeof console !== 'undefined' && typeof console.clear === 'function') {
    if (hasCompileErrors) {
      console.clear();
    }
  }
}

/**
 * Handles successful compilation.
 */
function handleSuccess() {
  clearOutdatedErrors();

  var isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  hasCompileErrors = false;

  if (isHotUpdate) {
    tryApplyUpdates(function onHotUpdateSuccess() {
      tryDismissErrorOverlay();
    });
  }
}

/**
 * Prints warnings to the console.
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
 * Handles compilation with warnings.
 */
function handleWarnings(warnings) {
  clearOutdatedErrors();

  var isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  hasCompileErrors = false;

  printWarnings(warnings);

  if (isHotUpdate) {
    tryApplyUpdates(function onSuccessfulHotUpdate() {
      tryDismissErrorOverlay();
    });
  }
}

/**
 * Handles compilation with errors.
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
 * Dismisses the error overlay if no compile errors exist.
 */
function tryDismissErrorOverlay() {
  if (!hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
}

/**
 * Updates the most recent compilation hash.
 */
function handleAvailableHash(hash) {
  mostRecentCompilationHash = hash;
}

/**
 * Determines if a newer compilation hash is available.
 */
function isUpdateAvailable() {
  /* globals __webpack_hash__ */
  return mostRecentCompilationHash !== __webpack_hash__;
}

/**
 * Checks if hot updates can be applied.
 */
function canApplyUpdates() {
  return module.hot.status() === 'idle';
}

/**
 * Checks if hot updates can be applied when errors are present.
 */
function canAcceptErrors() {
  const hasReactRefresh = process.env.FAST_REFRESH;
  const status = module.hot.status();
  return hasReactRefresh && ['abort', 'fail'].indexOf(status) === -1;
}

/**
 * Handles the application of hot updates.
 */
function tryApplyUpdates(onHotUpdateSuccess) {
  if (!module.hot) {
    window.location.reload();
    return;
  }

  if (!isUpdateAvailable() || !canApplyUpdates()) {
    return;
  }

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
      tryApplyUpdates();
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

/**
 * Handles incoming messages from the WebSocket.
 */
function handleMessage(e) {
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
      // No action for unknown message types.
      break;
  }
}

connection.onmessage = handleMessage;