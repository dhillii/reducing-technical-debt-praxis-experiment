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
exports = module.exports = Base;

/**
 * Save timer references to avoid Sinon interfering.
 * See: https://github.com/mochajs/mocha/issues/237
 */
const GlobalDate = global.Date;
const GlobalSetTimeout = global.setTimeout;
const GlobalSetInterval = global.setInterval;
const GlobalClearTimeout = global.clearTimeout;
const GlobalClearInterval = global.clearInterval;

/**
 * Check if both stdio streams are associated with a tty.
 */
const isatty = tty.isatty(1) && tty.isatty(2);

/**
 * Enable coloring by default, except in the browser interface.
 */
exports.useColors = !process.browser && (supportsColor || (process.env.MOCHA_COLORS !== undefined));

/**
 * Inline diffs instead of +/-
 */
exports.inlineDiffs = false;

/**
 * Default color map.
 */
exports.colors = {
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
};

/**
 * Default symbol map.
 */
exports.symbols = {
  ok: '✓',
  err: '✖',
  dot: '․',
  comma: ',',
  bang: '!'
};

/**
 * With node.js on Windows: use symbols available in terminal default fonts
 */
if (process.platform === 'win32') {
  exports.symbols.ok = '\u221A';
  exports.symbols.err = '\u00D7';
  exports.symbols.dot = '.';
}

/**
 * Color `str` with the given `type`,
 * allowing colors to be disabled,
 * as well as user-defined color
 * schemes.
 *
 * @param {string} type
 * @param {string} str
 * @return {string}
 * @api private
 */
exports.color = function (type, str) {
  if (!exports.useColors) {
    return String(str);
  }
  return '\u001b[' + exports.colors[type] + 'm' + str + '\u001b[0m';
};

/**
 * Expose term window size, with some defaults for when stderr is not a tty.
 */
exports.window = {
  width: 75
};

if (isatty) {
  exports.window.width = process.stdout.getWindowSize
    ? process.stdout.getWindowSize(1)[0]
    : tty.getWindowSize()[1];
}

/**
 * Expose some basic cursor interactions that are common among reporters.
 */
exports.cursor = {
  hide: function () {
    isatty && process.stdout.write('\u001b[?25l');
  },

  show: function () {
    isatty && process.stdout.write('\u001b[?25h');
  },

  deleteLine: function () {
    isatty && process.stdout.write('\u001b[2K');
  },

  beginningOfLine: function () {
    isatty && process.stdout.write('\u001b[0G');
  },

  CR: function () {
    if (isatty) {
      exports.cursor.deleteLine();
      exports.cursor.beginningOfLine();
    } else {
      process.stdout.write('\r');
    }
  }
};

/**
 * Determine if a diff should be shown for the given error.
 *
 * @param {Error} err
 * @return {boolean}
 * @api private
 */
function showDiff(err) {
  return err && err.showDiff !== false && sameType(err.actual, err.expected) && err.expected !== undefined;
}

/**
 * Convert non-string actual/expected values to strings.
 *
 * @param {Error} err
 * @api private
 */
function stringifyDiffObjs(err) {
  if (!utils.isString(err.actual) || !utils.isString(err.expected)) {
    err.actual = utils.stringify(err.actual);
    err.expected = utils.stringify(err.expected);
  }
}

/**
 * Format the test title path into a string.
 *
 * @param {Test} test
 * @return {string}
 * @api private
 */
function formatTestTitle(test) {
  let title = '';
  test.titlePath().forEach((str, index) => {
    if (index !== 0) {
      title += '\n     ';
    }
    for (let i = 0; i < index; i++) {
      title += '  ';
    }
    title += str;
  });
  return title;
}

/**
 * Extract message and stack from an error.
 *
 * @param {Error} err
 * @return {{msg: string, stack: string}}
 * @api private
 */
function extractMessageAndStack(err) {
  let message = '';
  if (err.message && typeof err.message.toString === 'function') {
    message = err.message + '';
  } else if (typeof err.inspect === 'function') {
    message = err.inspect() + '';
  }
  let stack = err.stack || message;
  const index = message ? stack.indexOf(message) : -1;

  if (index === -1) {
    return { msg: message, stack };
  }

  const afterMsg = index + message.length;
  const msg = stack.slice(0, afterMsg);
  stack = stack.slice(afterMsg + 1);
  return { msg, stack };
}

/**
 * Build the diff string for an error.
 *
 * @param {Error} err
 * @return {string}
 * @api private
 */
function buildDiffString(err) {
  if (!exports.inlineDiffs) {
    return unifiedDiff(err);
  }
  return inlineDiff(err);
}

/**
 * Output the given `failures` as a list.
 *
 * @param {Array} failures
 * @api public
 */
exports.list = function (failures) {
  console.log();
  failures.forEach((test, i) => {
    const fmt = color('error title', '  %s) %s:\n') +
      color('error message', '     %s') +
      color('error stack', '\n%s\n');

    const err = test.err;
    const { msg: initialMsg, stack: initialStack } = extractMessageAndStack(err);
    let msg = initialMsg;
    let stack = initialStack;

    if (err.uncaught) {
      msg = 'Uncaught ' + msg;
    }

    if (!exports.hideDiff && showDiff(err)) {
      stringifyDiffObjs(err);
      const newFmt = color('error title', '  %s) %s:\n%s') + color('error stack', '\n%s\n');
      const match = msg.match(/^([^:]+): expected/);
      msg = '\n      ' + color('error message', match ? match[1] : msg);

      msg += buildDiffString(err);

      console.log(newFmt, i + 1, formatTestTitle(test), msg, stack);
    } else {
      // indent stack trace
      stack = stack.replace(/^/gm, '  ');
      console.log(fmt, i + 1, formatTestTitle(test), msg, stack);
    }
  });
};

/**
 * Initialize a new `Base` reporter.
 *
 * All other reporters generally
 * inherit from this reporter, providing
 * stats such as test duration, number
 * of tests passed / failed etc.
 *
 * @param {Runner} runner
 * @api public
 */
function Base(runner) {
  const stats = this.stats = { suites: 0, tests: 0, passes: 0, pending: 0, failures: 0 };
  const failures = this.failures = [];

  if (!runner) {
    return;
  }
  this.runner = runner;
  runner.stats = stats;

  runner.on('start', onStart);
  runner.on('suite', onSuite);
  runner.on('test end', onTestEnd);
  runner.on('pass', onPass);
  runner.on('fail', onFail);
  runner.on('end', onEnd);
  runner.on('pending', onPending);

  function onStart() {
    stats.start = new GlobalDate();
  }

  function onSuite(suite) {
    stats.suites = stats.suites || 0;
    if (!suite.root) {
      stats.suites++;
    }
  }

  function onTestEnd() {
    stats.tests = stats.tests || 0;
    stats.tests++;
  }

  function onPass(test) {
    stats.passes = stats.passes || 0;
    if (test.duration > test.slow()) {
      test.speed = 'slow';
    } else if (test.duration > test.slow() / 2) {
      test.speed = 'medium';
    } else {
      test.speed = 'fast';
    }
    stats.passes++;
  }

  function onFail(test, err) {
    stats.failures = stats.failures || 0;
    stats.failures++;
    if (showDiff(err)) {
      stringifyDiffObjs(err);
    }
    test.err = err;
    failures.push(test);
  }

  function onEnd() {
    stats.end = new GlobalDate();
    stats.duration = new GlobalDate() - stats.start;
  }

  function onPending() {
    stats.pending++;
  }
}

/**
 * Output common epilogue used by many of
 * the bundled reporters.
 *
 * @api public
 */
Base.prototype.epilogue = function () {
  const stats = this.stats;
  console.log();

  printPasses(stats);
  printPending(stats);
  printFailures(stats, this.failures);

  console.log();
};

function printPasses(stats) {
  const fmt = color('bright pass', ' ') +
    color('green', ' %d passing') +
    color('light', ' (%s)');
  console.log(fmt, stats.passes || 0, ms(stats.duration));
}

function printPending(stats) {
  if (!stats.pending) return;
  const fmt = color('pending', ' ') +
    color('pending', ' %d pending');
  console.log(fmt, stats.pending);
}

function printFailures(stats, failures) {
  if (!stats.failures) return;
  const fmt = color('fail', '  %d failing');
  console.log(fmt, stats.failures);
  Base.list(failures);
  console.log();
}

/**
 * Pad the given `str` to `len`.
 *
 * @api private
 * @param {string} str
 * @param {number} len
 * @return {string}
 */
function pad(str, len) {
  str = String(str);
  return Array(len - str.length + 1).join(' ') + str;
}

/**
 * Returns an inline diff between 2 strings with coloured ANSI output
 *
 * @api private
 * @param {Error} err with actual/expected
 * @return {string} Diff
 */
function inlineDiff(err) {
  const msg = errorDiff(err);
  const lines = msg.split('\n');
  let formatted = msg;

  if (lines.length > 4) {
    const width = String(lines.length).length;
    formatted = lines.map((line, i) => pad(i + 1, width) + ' | ' + line).join('\n');
  }

  formatted = '\n' +
    color('diff removed', 'actual') + ' ' +
    color('diff added', 'expected') + '\n\n' +
    formatted + '\n';

  return formatted.replace(/^/gm, '      ');
}

/**
 * Returns a unified diff between two strings.
 *
 * @api private
 * @param {Error} err with actual/expected
 * @return {string} The diff.
 */
function unifiedDiff(err) {
  const indent = '      ';
  const msg = diff.createPatch('string', err.actual, err.expected);
  const lines = msg.split('\n').splice(5);

  function cleanUp(line) {
    if (line[0] === '+') {
      return indent + colorLines('diff added', line);
    }
    if (line[0] === '-') {
      return indent + colorLines('diff removed', line);
    }
    if (line.match(/@@/)) {
      return '--';
    }
    if (line.match(/\\ No newline/)) {
      return null;
    }
    return indent + line;
  }

  return '\n      ' +
    colorLines('diff added', '+ expected') + ' ' +
    colorLines('diff removed', '- actual') + '\n\n' +
    lines.map(cleanUp).filter(Boolean).join('\n');
}

/**
 * Return a character diff for `err`.
 *
 * @api private
 * @param {Error} err
 * @return {string}
 */
function errorDiff(err) {
  return diff.diffWordsWithSpace(err.actual, err.expected).map(part => {
    if (part.added) {
      return colorLines('diff added', part.value);
    }
    if (part.removed) {
      return colorLines('diff removed', part.value);
    }
    return part.value;
  }).join('');
}

/**
 * Color lines for `str`, using the color `name`.
 *
 * @api private
 * @param {string} name
 * @param {string} str
 * @return {string}
 */
function colorLines(name, str) {
  return str.split('\n').map(line => color(name, line)).join('\n');
}

/**
 * Object#toString reference.
 */
const objToString = Object.prototype.toString;

/**
 * Check that a / b have the same type.
 *
 * @api private
 * @param {Object} a
 * @param {Object} b
 * @return {boolean}
 */
function sameType(a, b) {
  return objToString.call(a) === objToString.call(b);
}