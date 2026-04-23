'use strict';

const stripAnsi = require('strip-ansi');
const url = require('url');
const launchEditorEndpoint = require('./launchEditorEndpoint');
const formatWebpackMessages = require('./formatWebpackMessages');
const ErrorOverlay = require('react-error-overlay');

ErrorOverlay.setEditorHandler(function editorHandler(errorLocation) {
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

let hadRuntimeError = false;
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

/** @type {WebSocket} */
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
  if (isConsoleMethodAvailable('info')) {
    console.info(
      'The development server has disconnected.\nRefresh the page if necessary.'
    );
  }
};

let isFirstCompilation = true;
let mostRecentCompilationHash = null;
let hasCompileErrors = false;

/**
 * Clears console if there were compile errors.
 */
function clearOutdatedErrors() {
  if (isConsoleMethodAvailable('clear') && hasCompileErrors) {
    console.clear();
  }
}

/**
 * Determines if the current compilation is a hot update.
 * @returns {boolean}
 */
function isHotUpdate() {
  return !isFirstCompilation;
}

/**
 * Handles successful compilation.
 */
function handleSuccess() {
  clearOutdatedErrors();

  const hotUpdate = isHotUpdate();
  isFirstCompilation = false;
  hasCompileErrors = false;

  if (hotUpdate) {
    tryApplyUpdates(() => {
      tryDismissErrorOverlay();
    });
  }
}

/**
 * Prints formatted warnings to the console.
 * @param {string[]} warnings
 */
function printWarnings(warnings) {
  const formatted = formatWebpackMessages({
    warnings,
    errors: [],
  });

  if (isConsoleMethodAvailable('warn')) {
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

  const hotUpdate = isHotUpdate();
  isFirstCompilation = false;
  hasCompileErrors = false;

  printWarnings(warnings);

  if (hotUpdate) {
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
    errors,
    warnings: [],
  });

  ErrorOverlay.reportBuildError(formatted.errors[0]);

  if (isConsoleMethodAvailable('error')) {
    for (let i = 0; i < formatted.errors.length; i++) {
      console.error(stripAnsi(formatted.errors[i]));
    }
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
 * Updates the most recent compilation hash.
 * @param {string} hash
 */
function handleAvailableHash(hash) {
  mostRecentCompilationHash = hash;
}

/**
 * Determines if a newer compilation hash is available.
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
 * Determines if errors can be accepted based on React Refresh status.
 * @returns {boolean}
 */
function canAcceptErrors() {
  const hasReactRefresh = process.env.FAST_REFRESH;
  const status = module.hot.status();
  return hasReactRefresh && ['abort', 'fail'].indexOf(status) === -1;
}

/**
 * Predicate to decide if a forced reload is required.
 * @param {Error|null} err
 * @param {Array<string>|null} updatedModules
 * @returns {boolean}
 */
function shouldForceReload(err, updatedModules) {
  const haveErrors = err || hadRuntimeError;
  const needsForcedReload = !err && !updatedModules;
  return (haveErrors && !canAcceptErrors()) || needsForcedReload;
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
    if (shouldForceReload(err, updatedModules)) {
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

  const result = module.hot.check(/* autoApply */ true, handleApplyUpdates);

  if (result && typeof result.then === 'function') {
    result.then(
      (updatedModules) => handleApplyUpdates(null, updatedModules),
      (err) => handleApplyUpdates(err, null)
    );
  }
}

/**
 * Utility to check console method availability.
 * @param {string} method
 * @returns {boolean}
 */
function isConsoleMethodAvailable(method) {
  return typeof console !== 'undefined' && typeof console[method] === 'function';
}

/**
 * Message handler map for WebSocket messages.
 */
const messageHandlers = {
  hash: (msg) => handleAvailableHash(msg.data),
  'still-ok': () => handleSuccess(),
  ok: () => handleSuccess(),
  'content-changed': () => {
    window.location.reload();
  },
  warnings: (msg) => handleWarnings(msg.data),
  errors: (msg) => handleErrors(msg.data),
};

connection.onmessage = function (e) {
  const message = JSON.parse(e.data);
  const handler = messageHandlers[message.type];
  if (handler) {
    handler(message);
  }
};