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

const Date = global.Date;
const setTimeout = global.setTimeout;
const setInterval = global.setInterval;
const clearTimeout = global.clearTimeout;
const clearInterval = global.clearInterval;

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

// With node.js on Windows: use symbols available in terminal default fonts
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
const color = exports.color = function (type, str) {
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

const showDiff = function (err) {
  return err && err.showDiff !== false && sameType(err.actual, err.expected) && err.expected !== undefined;
};

const stringifyDiffObjs = function (err) {
  if (!utils.isString(err.actual) || !utils.isString(err.expected)) {
    err.actual = utils.stringify(err.actual);
    err.expected = utils.stringify(err.expected);
  }
};

/**
 * Output the given `failures` as a list.
 *
 * @param {Array} failures
 * @api public
 */
const list = function (failures) {
  console.log();
  failures.forEach((test, i) => {
    formatFailure(test, i);
  });
};

exports.list = list;

/**
 * Format and output a single failure.
 *
 * @param {Object} test
 * @param {number} index
 * @api private
 */
function formatFailure(test, index) {
  const err = test.err;
  const { msg, stack } = extractMessageAndStack(err);
  const testTitle = buildTestTitle(test);
  let fmt = color('error title', '  %s) %s:\n') +
    color('error message', '     %s') +
    color('error stack', '\n%s\n');

  if (!exports.hideDiff && showDiff(err)) {
    stringifyDiffObjs(err);
    fmt = color('error title', '  %s) %s:\n%s') + color('error stack', '\n%s\n');
    const match = msg.match(/^([^:]+): expected/);
    const title = match ? match[1] : msg;
    let diffText = exports.inlineDiffs ? inlineDiff(err) : unifiedDiff(err);
    const formattedMsg = '\n      ' + color('error message', title) + diffText;
    formatMessageAndStack(err, formattedMsg, fmt, testTitle, index);
  } else {
    formatMessageAndStack(err, msg, fmt, testTitle, index);
  }
}

/**
 * Extract message and stack from an error.
 *
 * @param {Error} err
 * @return {Object} { msg, stack }
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
  let msg = message;
  if (index !== -1) {
    const after = index + message.length;
    msg = stack.slice(0, after);
    stack = stack.slice(after + 1);
  }
  if (err.uncaught) {
    msg = 'Uncaught ' + msg;
  }
  stack = stack.replace(/^/gm, '  ');
  return { msg, stack };
}

/**
 * Build the test title string with indentation.
 *
 * @param {Object} test
 * @return {string}
 * @api private
 */
function buildTestTitle(test) {
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
 * Output formatted failure information.
 *
 * @param {Error} err
 * @param {string} msg
 * @param {string} fmt
 * @param {string} testTitle
 * @param {number} index
 * @api private
 */
function formatMessageAndStack(err, msg, fmt, testTitle, index) {
  console.log(fmt, (index + 1), testTitle, msg, err.stack || msg);
}

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

  runner.on('start', () => {
    stats.start = new Date();
  });

  runner.on('suite', (suite) => {
    stats.suites = stats.suites || 0;
    if (!suite.root) {
      stats.suites++;
    }
  });

  runner.on('test end', () => {
    stats.tests = stats.tests || 0;
    stats.tests++;
  });

  runner.on('pass', (test) => {
    stats.passes = stats.passes || 0;
    if (test.duration > test.slow()) {
      test.speed = 'slow';
    } else if (test.duration > test.slow() / 2) {
      test.speed = 'medium';
    } else {
      test.speed = 'fast';
    }
    stats.passes++;
  });

  runner.on('fail', (test, err) => {
    stats.failures = stats.failures || 0;
    stats.failures++;
    if (showDiff(err)) {
      stringifyDiffObjs(err);
    }
    test.err = err;
    failures.push(test);
  });

  runner.on('end', () => {
    stats.end = new Date();
    stats.duration = new Date() - stats.start;
  });

  runner.on('pending', () => {
    stats.pending++;
  });
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

/**
 * Print passing tests summary.
 *
 * @param {Object} stats
 * @api private
 */
function printPasses(stats) {
  const fmt = color('bright pass', ' ') +
    color('green', ' %d passing') +
    color('light', ' (%s)');
  console.log(fmt, stats.passes || 0, ms(stats.duration));
}

/**
 * Print pending tests summary.
 *
 * @param {Object} stats
 * @api private
 */
function printPending(stats) {
  if (stats.pending) {
    const fmt = color('pending', ' ') +
      color('pending', ' %d pending');
    console.log(fmt, stats.pending);
  }
}

/**
 * Print failures summary and list.
 *
 * @param {Object} stats
 * @param {Array} failures
 * @api private
 */
function printFailures(stats, failures) {
  if (stats.failures) {
    const fmt = color('fail', '  %d failing');
    console.log(fmt, stats.failures);
    Base.list(failures);
    console.log();
  }
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
  let msg = errorDiff(err);

  // linenos
  const lines = msg.split('\n');
  if (lines.length > 4) {
    const width = String(lines.length).length;
    msg = lines.map((str, i) => {
      return pad(++i, width) + ' |' + ' ' + str;
    }).join('\n');
  }

  // legend
  msg = '\n' +
    color('diff removed', 'actual') +
    ' ' +
    color('diff added', 'expected') +
    '\n\n' +
    msg +
    '\n';

  // indent
  msg = msg.replace(/^/gm, '      ');
  return msg;
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
  const cleanUp = (line) => {
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
  };
  const notBlank = (line) => typeof line !== 'undefined' && line !== null;
  const msg = diff.createPatch('string', err.actual, err.expected);
  const lines = msg.split('\n').splice(5);
  return '\n      ' +
    colorLines('diff added', '+ expected') + ' ' +
    colorLines('diff removed', '- actual') +
    '\n\n' +
    lines.map(cleanUp).filter(notBlank).join('\n');
}

/**
 * Return a character diff for `err`.
 *
 * @api private
 * @param {Error} err
 * @return {string}
 */
function errorDiff(err) {
  return diff.diffWordsWithSpace(err.actual, err.expected).map((str) => {
    if (str.added) {
      return colorLines('diff added', str.value);
    }
    if (str.removed) {
      return colorLines('diff removed', str.value);
    }
    return str.value;
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
  return str.split('\n').map((s) => {
    return color(name, s);
  }).join('\n');
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