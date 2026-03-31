```javascript
'use strict';

/**
 * Module dependencies.
 */

const tty = require('tty');
const diff = require('diff');
const ms = require('../ms');
const utils = require('../utils');
const supportsColor = process.browser ? null : require('supports-color');

/**
 * Expose `Base`.
 */

module.exports = Base;

/**
 * Save timer references to avoid Sinon interfering.
 * See: https://github.com/mochajs/mocha/issues/237
 */

/* eslint-disable no-unused-vars, no-native-reassign */
const GlobalDate = global.Date;
const GlobalSetTimeout = global.setTimeout;
const GlobalSetInterval = global.setInterval;
const GlobalClearTimeout = global.clearTimeout;
const GlobalClearInterval = global.clearInterval;
/* eslint-enable no-unused-vars, no-native-reassign */

/**
 * Configuration and constants
 */

const isatty = tty.isatty(1) && tty.isatty(2);
const isBrowser = process.browser;
const isWindows = process.platform === 'win32';

const config = {
  useColors: !isBrowser && (supportsColor || (process.env.MOCHA_COLORS !== undefined)),
  inlineDiffs: false,
  hideDiff: false,
  colors: {
    pass: 90,
    fail: 31,
    'bright pass': 92,
    'bright fail': 91,
    'bright yellow': 93,
    pending: 36,
    suite: 0,
    'error title': 0,
    'error message': 31,
    'error stack': 90,
    checkmark: 32,
    fast: 90,
    medium: 33,
    slow: 31,
    green: 32,
    light: 90,
    'diff gutter': 90,
    'diff added': 32,
    'diff removed': 31
  },
  symbols: {
    ok: '✓',
    err: '✖',
    dot: '․',
    comma: ',',
    bang: '!'
  }
};

// Windows-specific symbol adjustments
if (isWindows) {
  config.symbols.ok = '\u221A';
  config.symbols.err = '\u00D7';
  config.symbols.dot = '.';
}

// Export configuration
Object.assign(module.exports, config);

/**
 * Color utility
 */

const color = (type, str) => {
  if (!config.useColors) {
    return String(str);
  }
  return `\u001b[${config.colors[type]}m${str}\u001b[0m`;
};

module.exports.color = color;

/**
 * Window size configuration
 */

module.exports.window = {
  width: 75
};

if (isatty) {
  module.exports.window.width = process.stdout.getWindowSize
    ? process.stdout.getWindowSize(1)[0]
    : tty.getWindowSize()[1];
}

/**
 * Cursor control utilities
 */

const cursorWrite = (code) => isatty && process.stdout.write(code);

module.exports.cursor = {
  hide: () => cursorWrite('\u001b[?25l'),
  show: () => cursorWrite('\u001b[?25h'),
  deleteLine: () => cursorWrite('\u001b[2K'),
  beginningOfLine: () => cursorWrite('\u001b[0G'),
  CR: () => {
    if (isatty) {
      module.exports.cursor.deleteLine();
      module.exports.cursor.beginningOfLine();
    } else {
      process.stdout.write('\r');
    }
  }
};

/**
 * Utility functions
 */

const sameType = (a, b) => Object.prototype.toString.call(a) === Object.prototype.toString.call(b);

const showDiff = (err) => err && err.showDiff !== false && sameType(err.actual, err.expected) && err.expected !== undefined;

const stringifyDiffObjs = (err) => {
  if (!utils.isString(err.actual) || !utils.isString(err.expected)) {
    err.actual = utils.stringify(err.actual);
    err.expected = utils.stringify(err.expected);
  }
};

const pad = (str, len) => {
  str = String(str);
  return Array(len - str.length + 1).join(' ') + str;
};

const colorLines = (name, str) => str.split('\n').map(line => color(name, line)).join('\n');

/**
 * Diff generation utilities
 */

const errorDiff = (err) => {
  return diff.diffWordsWithSpace(err.actual, err.expected)
    .map(part => {
      if (part.added) return colorLines('diff added', part.value);
      if (part.removed) return colorLines('diff removed', part.value);
      return part.value;
    })
    .join('');
};

const inlineDiff = (err) => {
  let msg = errorDiff(err);
  const lines = msg.split('\n');

  if (lines.length > 4) {
    const width = String(lines.length).length;
    msg = lines.map((str, i) => `${pad(++i, width)} | ${str}`).join('\n');
  }

  msg = `\n${colorLines('diff removed', 'actual')} ${colorLines('diff added', 'expected')}\n\n${msg}\n`;
  return msg.replace(/^/gm, '      ');
};

const unifiedDiff = (err) => {
  const indent = '      ';
  const cleanUp = (line) => {
    if (line[0] === '+') return indent + colorLines('diff added', line);
    if (line[0] === '-') return indent + colorLines('diff removed', line);
    if (line.match(/@@/) || line.match(/\\ No newline/)) return null;
    return indent + line;
  };

  const msg = diff.createPatch('string', err.actual, err.expected);
  const lines = msg.split('\n').splice(5);

  return `\n      ${colorLines('diff added', '+ expected')} ${colorLines('diff removed', '- actual')}\n\n${lines.map(cleanUp).filter(Boolean).join('\n')}`;
};

/**
 * Output failures as a list
 */

module.exports.list = function(failures) {
  console.log();
  failures.forEach((test, i) => {
    const err = test.err;
    const message = extractMessage(err);
    let stack = err.stack || message;
    const index = message ? stack.indexOf(message) : -1;

    let msg = index === -1 ? message : stack.slice(0, index);
    stack = index === -1 ? stack : stack.slice(index + message.length + 1);

    if (err.uncaught) {
      msg = `Uncaught ${msg}`;
    }

    let fmt = `${color('error title', '  %s) %s:\n')}${color('error message', '     %s')}${color('error stack', '\n%s\n')}`;

    if (!config.hideDiff && showDiff(err)) {
      stringifyDiffObjs(err);
      fmt = `${color('error title', '  %s) %s:\n%s')}${color('error stack', '\n%s\n')}`;
      const match = message.match(/^([^:]+): expected/);
      msg = `\n      ${color('error message', match ? match[1] : msg)}`;
      msg += config.inlineDiffs ? inlineDiff(err) : unifiedDiff(err);
    }

    stack = stack.replace(/^/gm, '  ');
    const testTitle = buildTestTitle(test);

    console.log(fmt, i + 1, testTitle, msg, stack);
  });
};

const extractMessage = (err) => {
  if (err.message && typeof err.message.toString === 'function') {
    return err.message + '';
  }
  if (typeof err.inspect === 'function') {
    return err.inspect() + '';
  }
  return '';
};

const buildTestTitle = (test) => {
  let title = '';
  test.titlePath().forEach((str, index) => {
    if (index !== 0) title += '\n     ';
    title += '  '.repeat(index) + str;
  });
  return title;
};

/**
 * Base reporter constructor
 */

function Base(runner) {
  const stats = this.stats = { suites: 0, tests: 0, passes: 0, pending: 0, failures: 0 };
  const failures = this.failures = [];

  if (!runner) return;

  this.runner = runner;
  runner.stats = stats;

  runner.on('start', () => {
    stats.start = new GlobalDate();
  });

  runner.on('suite', (suite) => {
    stats.suites = stats.suites || 0;
    if (!suite.root) stats.suites++;
  });

  runner.on('test end', () => {
    stats.tests = (stats.tests || 0) + 1;
  });

  runner.on('pass', (test) => {
    stats.passes = (stats.passes || 0) + 1;
    test.speed = calculateSpeed(test);
  });

  runner.on('fail', (test, err) => {
    stats.failures = (stats.failures || 0) + 1;
    if (showDiff(err)) {
      stringifyDiffObjs(err);
    }
    test.err = err;
    failures.push(test);
  });

  runner.on('end', () => {
    stats.end = new GlobalDate();
    stats.duration = stats.end - stats.start;
  });

  runner.on('pending', () => {
    stats.pending = (stats.pending || 0) + 1;
  });
}

const calculateSpeed = (test) => {
  const slow = test.slow();
  if (test.duration > slow) return 'slow';
  if (test.duration > slow / 2) return 'medium';
  return 'fast';
};

/**
 * Output epilogue
 */

Base.prototype.epilogue = function() {
  const stats = this.stats;
  console.log();

  // Passes
  console.log(
    `${color('bright pass', ' ')}${color('green', ' %d passing')}${color('light', ' (%s)')}`,
    stats.passes || 0,
    ms(stats.duration)
  );

  // Pending
  if (stats.pending) {
    console.log(
      `${color('pending', ' ')}${color('pending', ' %d pending')}`,
      stats.pending
    );
  }

  // Failures
  if (stats.failures) {
    console.log(`${color('fail', '  %d failing')}`, stats.failures);
    Base.list(this.failures);
    console.log();
  }

  console.log();
};
```