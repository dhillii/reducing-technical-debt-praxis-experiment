```javascript
'use strict';

var stripAnsi = require('strip-ansi');
var url = require('url');
var launchEditorEndpoint = require('./launchEditorEndpoint');
var formatWebpackMessages = require('./formatWebpackMessages');
var ErrorOverlay = require('react-error-overlay');

// ─── Constants ───────────────────────────────────────────────────────────────

const BUNDLE_PATH = '/static/js/bundle.js';
const MAX_WARNINGS_SHOWN = 5;
const SOCKET_PROTOCOL_MAP = { 'https:': 'wss', 'http:': 'ws' };

// ─── State ────────────────────────────────────────────────────────────────────

var state = {
  isFirstCompilation: true,
  mostRecentCompilationHash: null,
  hasCompileErrors: false,
  hadRuntimeError: false,
};

// ─── Editor Handler ──────────────────────────────────────────────────────────

function buildEditorUrl({ fileName, lineNumber, colNumber }) {
  const params = new URLSearchParams({
    fileName,
    lineNumber: lineNumber || 1,
    colNumber: colNumber || 1,
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
  filename: BUNDLE_PATH,
});

if (module.hot && typeof module.hot.dispose === 'function') {
  module.hot.dispose(function () {
    ErrorOverlay.stopReportingRuntimeErrors();
  });
}

// ─── WebSocket Connection ────────────────────────────────────────────────────

function buildSocketUrl() {
  return url.format({
    protocol: SOCKET_PROTOCOL_MAP[window.location.protocol] || 'ws',
    hostname: process.env.WDS_SOCKET_HOST || window.location.hostname,
    port: process.env.WDS_SOCKET_PORT || window.location.port,
    pathname: process.env.WDS_SOCKET_PATH || '/ws',
    slashes: true,
  });
}

var connection = new WebSocket(buildSocketUrl());

connection.onclose = function () {
  console.info?.('The development server has disconnected.\nRefresh the page if necessary.');
};

// ─── Compilation Handlers ────────────────────────────────────────────────────

function clearOutdatedErrors() {
  if (state.hasCompileErrors) {
    console.clear?.();
  }
}

function tryDismissErrorOverlay() {
  if (!state.hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
}

function applyHotUpdateIfNeeded(onSuccess) {
  tryApplyUpdates(function onHotUpdateSuccess() {
    tryDismissErrorOverlay();
    onSuccess?.();
  });
}

function handleSuccess() {
  clearOutdatedErrors();

  const isHotUpdate = !state.isFirstCompilation;
  state.isFirstCompilation = false;
  state.hasCompileErrors = false;

  if (isHotUpdate) {
    applyHotUpdateIfNeeded();
  }
}

function printWarnings(warnings) {
  const formatted = formatWebpackMessages({ warnings, errors: [] });

  formatted.warnings.slice(0, MAX_WARNINGS_SHOWN).forEach((warning) => {
    console.warn?.(stripAnsi(warning));
  });

  if (formatted.warnings.length > MAX_WARNINGS_SHOWN) {
    console.warn?.('There were more warnings in other files.\nYou can find a complete log in the terminal.');
  }
}

function handleWarnings(warnings) {
  clearOutdatedErrors();

  const isHotUpdate = !state.isFirstCompilation;
  state.isFirstCompilation = false;
  state.hasCompileErrors = false;

  printWarnings(warnings);

  if (isHotUpdate) {
    applyHotUpdateIfNeeded();
  }
}

function handleErrors(errors) {
  clearOutdatedErrors();

  state.isFirstCompilation = false;
  state.hasCompileErrors = true;

  const formatted = formatWebpackMessages({ errors, warnings: [] });

  ErrorOverlay.reportBuildError(formatted.errors[0]);

  formatted.errors.forEach((error) => {
    console.error?.(stripAnsi(error));
  });
}

function handleAvailableHash(hash) {
  state.mostRecentCompilationHash = hash;
}

// ─── Message Dispatcher ──────────────────────────────────────────────────────

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

  onHotUpdateSuccess?.();

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

  if (result?.then) {
    result.then(
      (updatedModules) => callback(null, updatedModules),
      (err) => callback(err, null)
    );
  }
}
```