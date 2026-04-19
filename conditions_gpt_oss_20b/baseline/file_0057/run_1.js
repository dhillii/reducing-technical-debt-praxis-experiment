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

ErrorOverlay.setEditorHandler(errorLocation => {
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

const clearOutdatedErrors = () => {
  if (typeof console !== 'undefined' && typeof console.clear === 'function') {
    if (hasCompileErrors) {
      console.clear();
    }
  }
};

const handleSuccess = () => {
  clearOutdatedErrors();

  const isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  hasCompileErrors = false;

  if (isHotUpdate) {
    tryApplyUpdates(() => {
      tryDismissErrorOverlay();
    });
  }
};

const handleWarnings = warnings => {
  clearOutdatedErrors();

  const isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  hasCompileErrors = false;

  const printWarnings = () => {
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
  };

  printWarnings();

  if (isHotUpdate) {
    tryApplyUpdates(() => {
      tryDismissErrorOverlay();
    });
  }
};

const handleErrors = errors => {
  clearOutdatedErrors();

  isFirstCompilation = false;
  hasCompileErrors = true;

  const formatted = formatWebpackMessages({
    errors,
    warnings: [],
  });

  ErrorOverlay.reportBuildError(formatted.errors[0]);

  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    for (let i = 0; i < formatted.errors.length; i++) {
      console.error(stripAnsi(formatted.errors[i]));
    }
  }
};

const tryDismissErrorOverlay = () => {
  if (!hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
};

const handleAvailableHash = hash => {
  mostRecentCompilationHash = hash;
};

connection.onmessage = e => {
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
      // Do nothing.
  }
};

const isUpdateAvailable = () => {
  /* globals __webpack_hash__ */
  return mostRecentCompilationHash !== __webpack_hash__;
};

const canApplyUpdates = () => module.hot.status() === 'idle';

const canAcceptErrors = () => {
  const hasReactRefresh = process.env.FAST_REFRESH;
  const status = module.hot.status();
  return hasReactRefresh && ['abort', 'fail'].indexOf(status) === -1;
};

const tryApplyUpdates = onHotUpdateSuccess => {
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

  const result = module.hot.check(true, handleApplyUpdates);

  if (result && result.then) {
    result.then(
      updatedModules => handleApplyUpdates(null, updatedModules),
      err => handleApplyUpdates(err, null)
    );
  }
};
```