var stripAnsi = require('strip-ansi');
var url = require('url');
var launchEditorEndpoint = require('./launchEditorEndpoint');
var formatWebpackMessages = require('./formatWebpackMessages');
var ErrorOverlay = require('react-error-overlay');

ErrorOverlay.setEditorHandler(function editorHandler(errorLocation) {
  const urlParams = new URLSearchParams({
    fileName: errorLocation.fileName,
    lineNumber: errorLocation.lineNumber || 1,
    colNumber: errorLocation.colNumber || 1,
  });
  fetch(`${launchEditorEndpoint}?${urlParams.toString()}`);
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

function createWebSocketConnection() {
  return new WebSocket(
    url.format({
      protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
      hostname: process.env.WDS_SOCKET_HOST || window.location.hostname,
      port: process.env.WDS_SOCKET_PORT || window.location.port,
      pathname: process.env.WDS_SOCKET_PATH || '/ws',
      slashes: true,
    })
  );
}

var connection = createWebSocketConnection();

function logDisconnectMessage() {
  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info(
      'The development server has disconnected.\nRefresh the page if necessary.'
    );
  }
}

connection.onclose = function () {
  logDisconnectMessage();
};

var isFirstCompilation = true;
var mostRecentCompilationHash = null;
var hasCompileErrors = false;

function clearOldErrors() {
  if (hasCompileErrors && typeof console !== 'undefined' && typeof console.clear === 'function') {
    console.clear();
  }
}

function applyHotUpdate(onSuccess) {
  module.hot.check(true, function (err, updatedModules) {
    const needForcedReload = err || hadRuntimeError
      ? false
      : !updatedModules;

    if (
      (err || hadRuntimeError) && !canAcceptErrors() ||
      needForcedReload
    ) {
      window.location.reload();
      return;
    }

    onSuccess && onSuccess();

    if (isUpdateAvailable()) {
      applyHotUpdate(onSuccess);
    }
  });
}

function tryApplyUpdates(onSuccess) {
  if (!module.hot) {
    window.location.reload();
    return;
  }

  if (!isUpdateAvailable() || !canApplyUpdates()) {
    return;
  }

  applyHotUpdate(onSuccess);
}

function handleSuccess() {
  clearOldErrors();

  const isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  hasCompileErrors = false;

  if (isHotUpdate) {
    tryApplyUpdates(tryDismissErrorOverlay);
  }
}

function handleWarnings(warnings) {
  clearOldErrors();

  const isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  hasCompileErrors = false;

  const formatted = formatWebpackMessages({ warnings, errors: [] });

  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    formatted.warnings.slice(0, 5).forEach((warning) =>
      console.warn(stripAnsi(warning))
    );

    if (formatted.warnings.length > 5) {
      console.warn(
        'There were more warnings in other files.\n' +
          'You can find a complete log in the terminal.'
      );
    }
  }

  if (isHotUpdate) {
    tryApplyUpdates(tryDismissErrorOverlay);
  }
}

function handleErrors(errors) {
  clearOldErrors();

  isFirstCompilation = false;
  hasCompileErrors = true;

  const formatted = formatWebpackMessages({ errors, warnings: [] });

  ErrorOverlay.reportBuildError(formatted.errors[0]);

  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    formatted.errors.forEach((error) => console.error(stripAnsi(error)));
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
  return hasReactRefresh && !['abort', 'fail'].includes(status);
}

connection.onmessage = function (e) {
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
  }
};