'use strict';

const stripAnsi = require('strip-ansi');
const url = require('url');
const launchEditorEndpoint = require('./launchEditorEndpoint');
const formatWebpackMessages = require('./formatWebpackMessages');
const ErrorOverlay = require('react-error-overlay');

// State management for hot module replacement
const hmrState = {
  isFirstCompilation: true,
  mostRecentCompilationHash: null,
  hasCompileErrors: false,
  hadRuntimeError: false,
};

// Initialize error overlay editor handler
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

// Initialize runtime error reporting
ErrorOverlay.startReportingRuntimeErrors({
  onError: function () {
    hmrState.hadRuntimeError = true;
  },
  filename: '/static/js/bundle.js',
});

// Cleanup on module disposal
if (module.hot && typeof module.hot.dispose === 'function') {
  module.hot.dispose(function () {
    ErrorOverlay.stopReportingRuntimeErrors();
  });
}

// Create WebSocket connection to development server
const connection = new WebSocket(
  url.format({
    protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
    hostname: process.env.WDS_SOCKET_HOST || window.location.hostname,
    port: process.env.WDS_SOCKET_PORT || window.location.port,
    pathname: process.env.WDS_SOCKET_PATH || '/ws',
    slashes: true,
  })
);

// Handle WebSocket disconnection
connection.onclose = function () {
  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info(
      'The development server has disconnected.\nRefresh the page if necessary.'
    );
  }
};

// Clear outdated compilation errors from console
function clearOutdatedErrors() {
  if (typeof console !== 'undefined' && typeof console.clear === 'function') {
    if (hmrState.hasCompileErrors) {
      console.clear();
    }
  }
}

// Handle successful compilation
function handleSuccess() {
  clearOutdatedErrors();

  const isHotUpdate = !hmrState.isFirstCompilation;
  hmrState.isFirstCompilation = false;
  hmrState.hasCompileErrors = false;

  if (isHotUpdate) {
    tryApplyUpdates(function onHotUpdateSuccess() {
      tryDismissErrorOverlay();
    });
  }
}

// Print warnings to console
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

// Handle compilation with warnings
function handleWarnings(warnings) {
  clearOutdatedErrors();

  const isHotUpdate = !hmrState.isFirstCompilation;
  hmrState.isFirstCompilation = false;
  hmrState.hasCompileErrors = false;

  printWarnings(warnings);

  if (isHotUpdate) {
    tryApplyUpdates(function onSuccessfulHotUpdate() {
      tryDismissErrorOverlay();
    });
  }
}

// Log errors to console
function logErrorsToConsole(errors) {
  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    for (let i = 0; i < errors.length; i++) {
      console.error(stripAnsi(errors[i]));
    }
  }
}

// Handle compilation with errors
function handleErrors(errors) {
  clearOutdatedErrors();

  hmrState.isFirstCompilation = false;
  hmrState.hasCompileErrors = true;

  const formatted = formatWebpackMessages({
    errors: errors,
    warnings: [],
  });

  ErrorOverlay.reportBuildError(formatted.errors[0]);
  logErrorsToConsole(formatted.errors);
}

// Dismiss error overlay if no compile errors
function tryDismissErrorOverlay() {
  if (!hmrState.hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
}

// Update the most recent compilation hash
function handleAvailableHash(hash) {
  hmrState.mostRecentCompilationHash = hash;
}

// Route incoming messages from WebSocket
function routeMessage(message) {
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
      break;
  }
}

// Handle incoming WebSocket messages
connection.onmessage = function (e) {
  const message = JSON.parse(e.data);
  routeMessage(message);
};

// Check if a newer version of code is available
function isUpdateAvailable() {
  /* globals __webpack_hash__ */
  return hmrState.mostRecentCompilationHash !== __webpack_hash__;
}

// Check if hot module replacement can be applied
function canApplyUpdates() {
  return module.hot.status() === 'idle';
}

// Check if errors can be accepted during hot reload
function canAcceptErrors() {
  const hasReactRefresh = process.env.FAST_REFRESH;
  const status = module.hot.status();
  return hasReactRefresh && ['abort', 'fail'].indexOf(status) === -1;
}

// Handle the result of applying hot updates
function handleApplyUpdates(err, updatedModules, onHotUpdateSuccess) {
  const haveErrors = err || hmrState.hadRuntimeError;
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

// Execute hot module replacement check
function executeHotModuleCheck(onHotUpdateSuccess) {
  const result = module.hot.check(/* autoApply */ true, function (err, updatedModules) {
    handleApplyUpdates(err, updatedModules, onHotUpdateSuccess);
  });

  if (result && result.then) {
    result.then(
      function (updatedModules) {
        handleApplyUpdates(null, updatedModules, onHotUpdateSuccess);
      },
      function (err) {
        handleApplyUpdates(err, null, onHotUpdateSuccess);
      }
    );
  }
}

// Attempt to apply hot updates or reload
function tryApplyUpdates(onHotUpdateSuccess) {
  if (!module.hot) {
    window.location.reload();
    return;
  }

  if (!isUpdateAvailable() || !canApplyUpdates()) {
    return;
  }

  executeHotModuleCheck(onHotUpdateSuccess);
}