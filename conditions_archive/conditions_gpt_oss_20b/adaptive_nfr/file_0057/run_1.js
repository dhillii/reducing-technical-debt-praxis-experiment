/**
 * Copyright (c) 2015-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this file.
 */

'use strict';

const stripAnsi = require('strip-ansi');
const url = require('url');
const launchEditorEndpoint = require('./launchEditorEndpoint');
const formatWebpackMessages = require('./formatWebpackMessages');
const ErrorOverlay = require('react-error-overlay');

/**
 * Editor handler for error overlay.
 * @param {{fileName: string, lineNumber?: number, colNumber?: number}} errorLocation
 */
ErrorOverlay.setEditorHandler(function editorHandler(errorLocation) {
  fetch(
    `${launchEditorEndpoint}?fileName=${window.encodeURIComponent(
      errorLocation.fileName
    )}&lineNumber=${window.encodeURIComponent(
      errorLocation.lineNumber || 1
    )}&colNumber=${window.encodeURIComponent(errorLocation.colNumber || 1)}`
  );
});

let hadRuntimeError = false;
ErrorOverlay.startReportingRuntimeErrors({
  onError: () => {
    hadRuntimeError = true;
  },
  filename: '/static/js/bundle.js',
});

if (module.hot && typeof module.hot.dispose === 'function') {
  module.hot.dispose(() => {
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

connection.onclose = () => {
  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info(
      'The development server has disconnected.\nRefresh the page if necessary.'
    );
  }
};

let isFirstCompilation = true;
let mostRecentCompilationHash = null;
let hasCompileErrors = false;

function clearOutdatedErrors() {
  if (typeof console !== 'undefined' && typeof console.clear === 'function') {
    if (hasCompileErrors) {
      console.clear();
    }
  }
}

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

function handleErrors(errors) {
  clearOutdatedErrors();

  isFirstCompilation = false;
  hasCompileErrors = true;

  const formatted = formatWebpackMessages({
    errors,
    warnings: [],
  });

  ErrorOverlay.reportBuildError(formatted.errors[0]);

  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    for (const err of formatted.errors) {
      console.error(stripAnsi(err));
    }
  }
}

function tryDismissErrorOverlay() {
  if (!hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
}

function handleAvailableHash(hash) {
  mostRecentCompilationHash = hash;
}

function isUpdateAvailable() {
  /* globals __webpack_hash__ */
  return mostRecentCompilationHash !== __webpack_hash__;
}

function canApplyUpdates() {
  return module.hot.status() === 'idle';
}

function canAcceptErrors() {
  const hasReactRefresh = process.env.FAST_REFRESH;
  const status = module.hot.status();
  return hasReactRefresh && ['abort', 'fail'].indexOf(status) === -1;
}

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
      updatedModules => handleApplyUpdates(null, updatedModules),
      err => handleApplyUpdates(err, null)
    );
  }
}

function printWarnings(warnings) {
  const formatted = formatWebpackMessages({
    warnings,
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

const messageHandlers = {
  hash: handleAvailableHash,
  'still-ok': handleSuccess,
  ok: handleSuccess,
  'content-changed': () => {
    window.location.reload();
  },
  warnings: handleWarnings,
  errors: handleErrors,
};

connection.onmessage = e => {
  const message = JSON.parse(e.data);
  const handler = messageHandlers[message.type];
  if (handler) {
    handler(message.data);
  }
};