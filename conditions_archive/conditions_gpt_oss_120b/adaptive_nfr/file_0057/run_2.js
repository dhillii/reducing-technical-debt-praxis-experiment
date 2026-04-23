/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of the source tree.
 */

'use strict';

const stripAnsi = require('strip-ansi');
const url = require('url');
const launchEditorEndpoint = require('./launchEditorEndpoint');
const formatWebpackMessages = require('./formatWebpackMessages');
const ErrorOverlay = require('react-error-overlay');

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

/**
 * Tracks whether a runtime error has occurred.
 * @type {boolean}
 */
let hadRuntimeError = false;
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

// Unlike WebpackDevServer client, we won't try to reconnect
// to avoid spamming the console. Disconnect usually happens
// when developer stops the server.
connection.onclose = function () {
  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info(
      'The development server has disconnected.\nRefresh the page if necessary.'
    );
  }
};

// Remember some state related to hot module replacement.
let isFirstCompilation = true;
let mostRecentCompilationHash = null;
let hasCompileErrors = false;

/**
 * Clears the console if there were compile errors.
 */
function clearOutdatedErrors() {
  if (typeof console !== 'undefined' && typeof console.clear === 'function') {
    if (hasCompileErrors) {
      console.clear();
    }
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
      // Only dismiss it when we're sure it's a hot update.
      // Otherwise it would flicker right before the reload.
      tryDismissErrorOverlay();
    });
  }
}

/**
 * Handles compilation warnings.
 * @param {Array<string>} warnings
 */
function handleWarnings(warnings) {
  clearOutdatedErrors();

  const isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  hasCompileErrors = false;

  const formatted = formatWebpackMessages({
    warnings,
    errors: [],
  });

  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    formatted.warnings.forEach((msg, i) => {
      if (i === 5) {
        console.warn(
          'There were more warnings in other files.\n' +
            'You can find a complete log in the terminal.'
        );
        return;
      }
      console.warn(stripAnsi(msg));
    });
  }

  if (isHotUpdate) {
    tryApplyUpdates(() => {
      tryDismissErrorOverlay();
    });
  }
}

/**
 * Handles compilation errors.
 * @param {Array<string>} errors
 */
function handleErrors(errors) {
  clearOutdatedErrors();

  isFirstCompilation = false;
  hasCompileErrors = true;

  const formatted = formatWebpackMessages({
    errors,
    warnings: [],
  });

  // Only show the first error.
  ErrorOverlay.reportBuildError(formatted.errors[0]);

  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    formatted.errors.forEach((msg) => {
      console.error(stripAnsi(msg));
    });
  }

  // Do not attempt to reload now.
  // We will reload on next success instead.
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
 * Determines whether a newer compilation hash is available.
 * @returns {boolean}
 */
function isUpdateAvailable() {
  /* globals __webpack_hash__ */
  // __webpack_hash__ is the hash of the current compilation.
  // It's a global variable injected by webpack.
  return mostRecentCompilationHash !== __webpack_hash__;
}

/**
 * Checks if hot updates can be applied (module is idle).
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
  // NOTE: This var is injected by Webpack's DefinePlugin, and is a boolean instead of string.
  const hasReactRefresh = process.env.FAST_REFRESH;
  const status = module.hot.status();
  // React refresh can handle hot-reloading over errors.
  // However, when hot-reload status is abort or fail,
  // it indicates the current update cannot be applied safely,
  // and thus we should bail out to a forced reload for consistency.
  return hasReactRefresh && ['abort', 'fail'].indexOf(status) === -1;
}

/**
 * Attempts to apply hot updates, falling back to a full reload.
 * @param {Function} [onHotUpdateSuccess]
 */
function tryApplyUpdates(onHotUpdateSuccess) {
  if (!module.hot) {
    // HotModuleReplacementPlugin is not in webpack configuration.
    window.location.reload();
    return;
  }

  if (!isUpdateAvailable() || !canApplyUpdates()) {
    return;
  }

  /**
   * Handles the result of hot module check.
   * @param {Error|null} err
   * @param {Array<string>|null} updatedModules
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
      // While we were updating, there was a new update! Do it again.
      tryApplyUpdates();
    }
  }

  // https://webpack.github.io/docs/hot-module-replacement.html#check
  const result = module.hot.check(/* autoApply */ true, handleApplyUpdates);

  // webpack 2 returns a Promise instead of invoking a callback
  if (result && typeof result.then === 'function') {
    result.then(
      (updatedModules) => handleApplyUpdates(null, updatedModules),
      (err) => handleApplyUpdates(err, null)
    );
  }
}

/**
 * Mapping of message types to their handlers.
 */
const messageHandlers = {
  hash: (data) => handleAvailableHash(data),
  'still-ok': () => handleSuccess(),
  ok: () => handleSuccess(),
  'content-changed': () => window.location.reload(),
  warnings: (data) => handleWarnings(data),
  errors: (data) => handleErrors(data),
};

// Handle messages from the server.
connection.onmessage = function (e) {
  const { type, data } = JSON.parse(e.data);
  const handler = messageHandlers[type];
  if (handler) {
    handler(data);
  }
};