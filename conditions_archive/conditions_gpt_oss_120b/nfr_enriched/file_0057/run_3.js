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

// -----------------------------------------------------------------------------
// Editor handling
// -----------------------------------------------------------------------------
ErrorOverlay.setEditorHandler(function editorHandler(errorLocation) {
  // Keep this sync with errorOverlayMiddleware.js
  fetch(
    `${launchEditorEndpoint}?fileName=${window.encodeURIComponent(
      errorLocation.fileName
    )}&lineNumber=${window.encodeURIComponent(
      errorLocation.lineNumber || 1
    )}&colNumber=${window.encodeURIComponent(errorLocation.colNumber || 1)}`
  );
});

// -----------------------------------------------------------------------------
// Runtime error tracking
// -----------------------------------------------------------------------------
let hadRuntimeError = false;
ErrorOverlay.startReportingRuntimeErrors({
  onError: () => {
    hadRuntimeError = true;
  },
  filename: '/static/js/bundle.js',
});

if (module.hot && typeof module.hot.dispose === 'function') {
  module.hot.dispose(() => {
    // TODO: why do we need this?
    ErrorOverlay.stopReportingRuntimeErrors();
  });
}

// -----------------------------------------------------------------------------
// WebSocket connection
// -----------------------------------------------------------------------------
const connection = new WebSocket(
  url.format({
    protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
    hostname: process.env.WDS_SOCKET_HOST || window.location.hostname,
    port: process.env.WDS_SOCKET_PORT || window.location.port,
    pathname: process.env.WDS_SOCKET_PATH || '/ws',
    slashes: true,
  })
);

// -----------------------------------------------------------------------------
// Connection event handlers
// -----------------------------------------------------------------------------
connection.onclose = () => {
  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info(
      'The development server has disconnected.\nRefresh the page if necessary.'
    );
  }
};

connection.onmessage = (e) => {
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
};

// -----------------------------------------------------------------------------
// Compilation state
// -----------------------------------------------------------------------------
let isFirstCompilation = true;
let mostRecentCompilationHash = null;
let hasCompileErrors = false;

// -----------------------------------------------------------------------------
// Helper utilities
// -----------------------------------------------------------------------------
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
 * Updates the stored hash of the most recent compilation.
 * @param {string} hash - The new compilation hash.
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
  return hasReactRefresh && ['abort', 'fail'].indexOf(status) === -1;
}

/**
 * Prints formatted warnings to the console, limiting output to the first five.
 * @param {string[]} warnings - Raw warning messages from webpack.
 */
function printFormattedWarnings(warnings) {
  const formatted = formatWebpackMessages({ warnings, errors: [] });
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
 * Logs formatted errors to the console.
 * @param {string[]} errors - Raw error messages from webpack.
 */
function logFormattedErrors(errors) {
  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    for (let i = 0; i < errors.length; i++) {
      console.error(stripAnsi(errors[i]));
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
      tryDismissErrorOverlay();
    });
  }
}

/**
 * Handles compilation warnings.
 * @param {string[]} warnings - Warning messages from webpack.
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
 * Handles compilation errors.
 * @param {string[]} errors - Error messages from webpack.
 */
function handleErrors(errors) {
  clearOutdatedErrors();

  isFirstCompilation = false;
  hasCompileErrors = true;

  const formatted = formatWebpackMessages({ errors, warnings: [] });
  ErrorOverlay.reportBuildError(formatted.errors[0]);
  logFormattedErrors(formatted.errors);
}

/**
 * Core logic for applying hot updates or falling back to a full reload.
 * @param {Function} [onHotUpdateSuccess] - Optional callback after a successful hot update.
 */
function tryApplyUpdates(onHotUpdateSuccess) {
  if (!module.hot) {
    window.location.reload();
    return;
  }

  if (!isUpdateAvailable() || !canApplyUpdates()) {
    return;
  }

  const handleApplyUpdates = (err, updatedModules) => {
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
  };

  const result = module.hot.check(/* autoApply */ true, handleApplyUpdates);

  // Webpack 2+ returns a Promise.
  if (result && typeof result.then === 'function') {
    result.then(
      (updatedModules) => handleApplyUpdates(null, updatedModules),
      (err) => handleApplyUpdates(err, null)
    );
  }
}
```