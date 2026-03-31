```javascript
'use strict';

var stripAnsi = require('strip-ansi');
var url = require('url');
var launchEditorEndpoint = require('./launchEditorEndpoint');
var formatWebpackMessages = require('./formatWebpackMessages');
var ErrorOverlay = require('react-error-overlay');

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_WARNINGS_DISPLAYED = 5;
const BUNDLE_FILENAME = '/static/js/bundle.js';

// ─── State ───────────────────────────────────────────────────────────────────

var state = {
  isFirstCompilation: true,
  mostRecentCompilationHash: null,
  hasCompileErrors: false,
  hadRuntimeError: false,
};

// ─── Editor Handler ──────────────────────────────────────────────────────────

function buildEditorUrl(errorLocation) {
  const params = new URLSearchParams({
    fileName: errorLocation.fileName,
    lineNumber: errorLocation.lineNumber || 1,
    colNumber: errorLocation.colNumber || 1,
  });
  return `${launchEditorEndpoint}?${params}`;
}

ErrorOverlay.setEditorHandler(function editorHandler(errorLocation) {
  fetch(buildEditorUrl(errorLocation));
});

// ─── Runtime Error Reporting ─────────────────────────────────────────────────

ErrorOverlay.startReportingRuntimeErrors({
  onError: function () {
    state.hadRuntimeError = true;
  },
  filename: BUNDLE_FILENAME,
});

if (module.hot && typeof module.hot.dispose === 'function') {
  module.hot.dispose(function () {
    ErrorOverlay.stopReportingRuntimeErrors();
  });
}

// ─── WebSocket Connection ────────────────────────────────────────────────────

function createWebSocketUrl() {
  return url.format({
    protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
    hostname: process.env.WDS_SOCKET_HOST || window.location.hostname,
    port: process.env.WDS_SOCKET_PORT || window.location.port,
    pathname: process.env.WDS_SOCKET_PATH || '/ws',
    slashes: true,
  });
}

var connection = new WebSocket(createWebSocketUrl());

connection.onclose = function () {
  console.info?.('The development server has disconnected.\nRefresh the page if necessary.');
};

// ─── Compilation Handlers ────────────────────────────────────────────────────

function clearOutdatedErrors() {
  if (state.hasCompileErrors) {
    console.clear?.();
  }
}

function markCompilationStart(hasErrors = false) {
  state.isFirstCompilation = false;
  state.hasCompileErrors = hasErrors;
}

function tryDismissErrorOverlay() {
  if (!state.hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
}

function applyHotUpdateIfNeeded() {
  if (!state.isFirstCompilation) {
    tryApplyUpdates(tryDismissErrorOverlay);
  }
}

function handleSuccess() {
  clearOutdatedErrors();
  applyHotUpdateIfNeeded();
  markCompilationStart();
}

function printWarnings(warnings) {
  const formatted = formatWebpackMessages({ warnings, errors: [] });

  formatted.warnings.slice(0, MAX_WARNINGS_DISPLAYED).forEach((warning) => {
    console.warn?.(stripAnsi(warning));
  });

  if (formatted.warnings.length > MAX_WARNINGS_DISPLAYED) {
    console.warn?.('There were more warnings in other files.\nYou can find a complete log in the terminal.');
  }
}

function handleWarnings(warnings) {
  clearOutdatedErrors();
  printWarnings(warnings);
  applyHotUpdateIfNeeded();
  markCompilationStart();
}

function handleErrors(errors) {
  clearOutdatedErrors();
  markCompilationStart(true);

  const formatted = formatWebpackMessages({ errors, warnings: [] });

  ErrorOverlay.reportBuildError(formatted.errors[0]);

  formatted.errors.forEach((error) => {
    console.error?.(stripAnsi(error));
  });
}

function handleAvailableHash(hash) {
  state.mostRecentCompilationHash = hash;
}

// ─── Message Routing ─────────────────────────────────────────────────────────

const messageHandlers = {
  hash: (data) => handleAvailableHash(data),
  ok: () => handleSuccess(),
  'still-ok': () => handleSuccess(),
  'content-changed': () => window.location.reload(),
  warnings: (data) => handleWarnings(data),
  errors: (data) => handleErrors(data),
};

connection.onmessage = function (e) {
  const message = JSON.parse(e.data);
  const handler = messageHandlers[message.type];
  if (handler) {
    handler(message.data);
  }
};

// ─── Hot Module Replacement ──────────────────────────────────────────────────

function isUpdateAvailable() {
  /* globals __webpack_hash__ */
  return state.mostRecentCompilationHash !== __webpack_hash__;
}

function canApplyUpdates() {
  return module.hot.status() === 'idle';
}

function canAcceptErrors() {
  const hasReactRefresh = process.env.FAST_REFRESH;
  const status = module.hot.status();
  return hasReactRefresh && !['abort', 'fail'].includes(status);
}

function handleApplyUpdates(onHotUpdateSuccess, err, updatedModules) {
  const haveErrors = err || state.hadRuntimeError;
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

function tryApplyUpdates(onHotUpdateSuccess) {
  if (!module.hot) {
    window.location.reload();
    return;
  }

  if (!isUpdateAvailable() || !canApplyUpdates()) {
    return;
  }

  const callback = handleApplyUpdates.bind(null, onHotUpdateSuccess);
  const result = module.hot.check(/* autoApply */ true, callback);

  if (result && result.then) {
    result.then(
      (updatedModules) => callback(null, updatedModules),
      (err) => callback(err, null)
    );
  }
}
```