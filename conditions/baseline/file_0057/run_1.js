```javascript
'use strict';

var stripAnsi = require('strip-ansi');
var url = require('url');
var launchEditorEndpoint = require('./launchEditorEndpoint');
var formatWebpackMessages = require('./formatWebpackMessages');
var ErrorOverlay = require('react-error-overlay');

// ─── Constants ───────────────────────────────────────────────────────────────

const BUNDLE_FILE = '/static/js/bundle.js';
const MAX_WARNINGS_SHOWN = 5;

// ─── State ────────────────────────────────────────────────────────────────────

var hadRuntimeError = false;
var isFirstCompilation = true;
var mostRecentCompilationHash = null;
var hasCompileErrors = false;

// ─── Editor Handler ───────────────────────────────────────────────────────────

ErrorOverlay.setEditorHandler(function editorHandler({ fileName, lineNumber, colNumber }) {
  const params = new URLSearchParams({
    fileName,
    lineNumber: lineNumber || 1,
    colNumber: colNumber || 1,
  });
  fetch(`${launchEditorEndpoint}?${params}`);
});

// ─── Runtime Error Reporting ──────────────────────────────────────────────────

ErrorOverlay.startReportingRuntimeErrors({
  onError: () => { hadRuntimeError = true; },
  filename: BUNDLE_FILE,
});

if (module.hot && typeof module.hot.dispose === 'function') {
  module.hot.dispose(() => ErrorOverlay.stopReportingRuntimeErrors());
}

// ─── WebSocket Connection ─────────────────────────────────────────────────────

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

// ─── Compilation Handlers ─────────────────────────────────────────────────────

function clearOutdatedErrors() {
  if (hasCompileErrors) {
    console.clear?.();
  }
}

function markCompilationStart(hasErrors = false) {
  const isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  hasCompileErrors = hasErrors;
  return isHotUpdate;
}

function tryDismissErrorOverlay() {
  if (!hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
}

function handleSuccess() {
  clearOutdatedErrors();
  const isHotUpdate = markCompilationStart();

  if (isHotUpdate) {
    tryApplyUpdates(tryDismissErrorOverlay);
  }
}

function printWarningsToConsole(warnings) {
  const { warnings: formatted } = formatWebpackMessages({ warnings, errors: [] });

  formatted.slice(0, MAX_WARNINGS_SHOWN).forEach(warning => {
    console.warn?.(stripAnsi(warning));
  });

  if (formatted.length > MAX_WARNINGS_SHOWN) {
    console.warn?.('There were more warnings in other files.\nYou can find a complete log in the terminal.');
  }
}

function handleWarnings(warnings) {
  clearOutdatedErrors();
  const isHotUpdate = markCompilationStart();

  printWarningsToConsole(warnings);

  if (isHotUpdate) {
    tryApplyUpdates(tryDismissErrorOverlay);
  }
}

function handleErrors(errors) {
  clearOutdatedErrors();
  markCompilationStart(true);

  const { errors: formatted } = formatWebpackMessages({ errors, warnings: [] });

  ErrorOverlay.reportBuildError(formatted[0]);
  formatted.forEach(error => console.error?.(stripAnsi(error)));
}

function handleAvailableHash(hash) {
  mostRecentCompilationHash = hash;
}

// ─── Message Handler ──────────────────────────────────────────────────────────

const messageHandlers = {
  hash: ({ data }) => handleAvailableHash(data),
  ok: () => handleSuccess(),
  'still-ok': () => handleSuccess(),
  'content-changed': () => window.location.reload(),
  warnings: ({ data }) => handleWarnings(data),
  errors: ({ data }) => handleErrors(data),
};

connection.onmessage = function (e) {
  const message = JSON.parse(e.data);
  const handler = messageHandlers[message.type];
  if (handler) handler(message);
};

// ─── Hot Module Replacement ───────────────────────────────────────────────────

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

function handleApplyUpdates(onHotUpdateSuccess, err, updatedModules) {
  const needsForcedReload = !err && !updatedModules;
  const hasErrors = err || hadRuntimeError;

  if (needsForcedReload || (hasErrors && !canAcceptErrors())) {
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
      updatedModules => callback(null, updatedModules),
      err => callback(err, null)
    );
  }
}
```