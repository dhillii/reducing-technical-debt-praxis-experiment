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

// ─── State ───────────────────────────────────────────────────────────────────

var hadRuntimeError = false;
var isFirstCompilation = true;
var mostRecentCompilationHash = null;
var hasCompileErrors = false;

// ─── Editor Handler ──────────────────────────────────────────────────────────

ErrorOverlay.setEditorHandler(function editorHandler({ fileName, lineNumber, colNumber }) {
  const params = new URLSearchParams({
    fileName,
    lineNumber: lineNumber || 1,
    colNumber: colNumber || 1,
  });
  fetch(`${launchEditorEndpoint}?${params}`);
});

// ─── Runtime Error Reporting ─────────────────────────────────────────────────

ErrorOverlay.startReportingRuntimeErrors({
  onError: () => { hadRuntimeError = true; },
  filename: BUNDLE_PATH,
});

if (module.hot && typeof module.hot.dispose === 'function') {
  module.hot.dispose(() => ErrorOverlay.stopReportingRuntimeErrors());
}

// ─── WebSocket Connection ────────────────────────────────────────────────────

function buildSocketUrl() {
  return url.format({
    protocol: window.location.protocol === 'https:' ? 'wss' : 'ws',
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

// ─── Compilation Helpers ─────────────────────────────────────────────────────

function clearOutdatedErrors() {
  if (hasCompileErrors) {
    console.clear?.();
  }
}

function tryDismissErrorOverlay() {
  if (!hasCompileErrors) {
    ErrorOverlay.dismissBuildError();
  }
}

function markCompilationStart() {
  const isHotUpdate = !isFirstCompilation;
  isFirstCompilation = false;
  return isHotUpdate;
}

function applyHotUpdateIfNeeded(onSuccess) {
  tryApplyUpdates(function onHotUpdateSuccess() {
    tryDismissErrorOverlay();
    onSuccess?.();
  });
}

// ─── Compilation Handlers ────────────────────────────────────────────────────

function handleSuccess() {
  clearOutdatedErrors();
  const isHotUpdate = markCompilationStart();
  hasCompileErrors = false;

  if (isHotUpdate) {
    applyHotUpdateIfNeeded();
  }
}

function handleWarnings(warnings) {
  clearOutdatedErrors();
  const isHotUpdate = markCompilationStart();
  hasCompileErrors = false;

  printFormattedMessages('warnings', warnings);

  if (isHotUpdate) {
    applyHotUpdateIfNeeded();
  }
}

function handleErrors(errors) {
  clearOutdatedErrors();
  markCompilationStart();
  hasCompileErrors = true;

  const { errors: formattedErrors } = formatWebpackMessages({ errors, warnings: [] });

  ErrorOverlay.reportBuildError(formattedErrors[0]);
  printFormattedMessages('errors', formattedErrors);
}

function printFormattedMessages(type, rawMessages) {
  const logFn = type === 'errors' ? console.error : console.warn;
  if (typeof logFn !== 'function') return;

  const formatted = type === 'errors'
    ? rawMessages
    : formatWebpackMessages({ warnings: rawMessages, errors: [] }).warnings;

  const limit = type === 'warnings' ? MAX_WARNINGS_SHOWN : formatted.length;

  for (let i = 0; i < formatted.length; i++) {
    if (i === limit) {
      console.warn('There were more warnings in other files.\nYou can find a complete log in the terminal.');
      break;
    }
    logFn(stripAnsi(formatted[i]));
  }
}

// ─── Hash Handler ────────────────────────────────────────────────────────────

function handleAvailableHash(hash) {
  mostRecentCompilationHash = hash;
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
  const { type, data } = JSON.parse(e.data);
  messageHandlers[type]?.(data);
};

// ─── Hot Module Replacement ──────────────────────────────────────────────────

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

    onHotUpdateSuccess?.();

    if (isUpdateAvailable()) {
      tryApplyUpdates();
    }
  }

  const result = module.hot.check(/* autoApply */ true, handleApplyUpdates);

  if (result?.then) {
    result.then(
      (updatedModules) => handleApplyUpdates(null, updatedModules),
      (err) => handleApplyUpdates(err, null)
    );
  }
}
```