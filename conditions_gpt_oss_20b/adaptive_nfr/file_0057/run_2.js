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

/**
 * Editor handler for error overlay.
 * @param {{fileName: string, lineNumber?: number, colNumber?: number}} errorLocation
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

const connection = new WebSocket(
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

let isFirstCompilation = true;
let mostRecentCompilationHash = null;
let hasCompileErrors = false;

/**
 * Clears outdated compile errors from the console.
 */
function clearOutdatedErrors() {
  if (typeof console !== 'undefined' && typeof console.clear === 'function') {
    if (hasCompileErrors) {
      console.clear();
    }
  }
}

/**
 * Prints warnings to the console, limiting to 5.
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
 * Logs errors to the console.
 * @param {string[]} errors
 */
function logErrors(errors) {
  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    for (let i = 0; i < errors.length; i++) {
      console.error(stripAnsi(errors[i]));
    }
  }
}

/**
 * Applies hot updates and dismisses the error overlay if applicable.
 * @param {Function} onSuccess
 */
function applyUpdatesAndDismiss(onSuccess) {
  tryApplyUpdates(function () {
    tryDismissErrorOverlay();
    if (typeof onSuccess === 'function') {
      onSuccess();
    }
  });
}

/**
 * Successful compilation handler.
 */
function handleSuccess() {
  clearOutdatedErrors();

  const isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  hasCompileErrors = false;

  if (isHotUpdate) {
    applyUpdatesAndDismiss();
  }
}

/**
 * Compilation with warnings handler.
 * @param {string[]} warnings
 */
function handleWarnings(warnings) {
  clearOutdatedErrors();

  const isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  hasCompileErrors = false;

  printWarnings(warnings);

  if (isHotUpdate) {
    applyUpdatesAndDismiss();
  }
}

/**
 * Compilation with errors handler.
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

  ErrorOverlay.reportBuildError(formatted.errors[0]);

  logErrors(formatted.errors);
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
 * Updates the most recent compilation hash.
 * @param {string} hash
 */
function handleAvailableHash(hash) {
  mostRecentCompilationHash = hash;
}

/**
 * Checks if a newer version of the code is available.
 * @returns {boolean}
 */
function isUpdateAvailable() {
  /* globals __webpack_hash__ */
  return mostRecentCompilationHash !== __webpack_hash__;
}

/**
 * Checks if hot updates can be applied.
 * @returns {boolean}
 */
function canApplyUpdates() {
  return module.hot.status() === 'idle';
}

/**
 * Checks if hot updates can accept errors.
 * @returns {boolean}
 */
function canAcceptErrors() {
  const hasReactRefresh = process.env.FAST_REFRESH;
  const status = module.hot.status();
  return hasReactRefresh && ['abort', 'fail'].indexOf(status) === -1;
}

/**
 * Attempts to apply hot updates, falling back to a full reload.
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

  const result = module.hot.check(true, handleApplyUpdates);

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
 * Dispatches incoming WebSocket messages to appropriate handlers.
 * @param {{type: string, data?: any}} message
 */
function dispatchMessage(message) {
  const handlers = {
    hash: handleAvailableHash,
    'still-ok': handleSuccess,
    ok: handleSuccess,
    'content-changed': function () {
      window.location.reload();
    },
    warnings: handleWarnings,
    errors: handleErrors,
  };

  const handler = handlers[message.type];
  if (handler) {
    handler(message.data);
  }
}

connection.onmessage = function (e) {
  const message = JSON.parse(e.data);
  dispatchMessage(message);
};