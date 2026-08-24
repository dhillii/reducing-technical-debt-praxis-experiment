'use strict';

/**
 * Module dependencies.
 */

var tty = require('tty');
var diff = require('diff');
var ms = require('../ms');
var utils = require('../utils');
var supportsColor = process.browser ? null : require('supports-color');

/**
 * Expose `Base`.
 */

exports = module.exports = Base;

/**
 * Save timer references to avoid Sinon interfering.
 * See: https://github.com/mochajs/mocha/issues/237
 */

/* eslint-disable no-unused-vars, no-native-reassign */
var Date = global.Date;
var setTimeout = global.setTimeout;
var setInterval = global.setInterval;
var clearTimeout = global.clearTimeout;
var clearInterval = global.clearInterval;
/* eslint-enable no-unused-vars, no-native-reassign */

/**
 * Check if both stdio streams are associated with a tty.
 */

var isatty = tty.isatty(1) && tty.isatty(2);

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
var color = exports.color = function (type, str) {
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
 * Indicates whether to display a diff for the given error.
 *
 * @param {Error} err
 * @returns {boolean}
 * @api private
 */
function showDiff(err) {
  return err &&
    err.showDiff !== false &&
    sameType(err.actual, err.expected) &&
    err.expected !== undefined;
}

/**
 * Converts actual/expected values in the error to strings if needed.
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
 * Output the given `failures` as a list.
 *
 * @param {Array} failures
 * @api public
 */

exports.list = function (failures) {
  console.log();
  failures.forEach(outputFailure);
};

/**
 * Format and output a single test failure.
 *
 * @param {Object} test
 * @param {number} index
 * @api private
 */
function outputFailure(test, index) {
  var fmt = buildErrorFormat();
  var err = test.err;
  var message = extractErrorMessage(err);
  var stack = extractStack(err, message);
  var msg = prepareMessage(message, stack, err);
  var testTitle = buildTestTitle(test);

  if (shouldShowDiff(err)) {
    msg = prepareDiffMessage(err, msg);
  }

  stack = indentMultilineString(stack);
  console.log(fmt, (index + 1), testTitle, msg, stack);
}

/**
 * Build the default printf-style format string for error output.
 *
 * @returns {string}
 * @api private
 */
function buildErrorFormat() {
  return color('error title', '  %s) %s:\n') +
    color('error message', '     %s') +
    color('error stack', '\n%s\n');
}

/**
 * Build the printf-style format string for diff output.
 *
 * @returns {string}
 * @api private
 */
function buildDiffErrorFormat() {
  return color('error title', '  %s) %s:\n%s') +
    color('error stack', '\n%s\n');
}

/**
 * Extract error message from error object.
 *
 * @param {Error} err
 * @returns {string}
 * @api private
 */
function extractErrorMessage(err) {
  if (err.message && typeof err.message.toString === 'function') {
    return err.message + '';
  } else if (typeof err.inspect === 'function') {
    return err.inspect() + '';
  }
  return '';
}

/**
 * Extract and normalize stack trace from error object.
 *
 * @param {Error} err
 * @param {string} message
 * @returns {string}
 * @api private
 */
function extractStack(err, message) {
  var fullStack = err.stack || message;
  if (!message) {
    return fullStack;
  }

  var index = fullStack.indexOf(message);
  if (index === -1) {
    return fullStack;
  }

  index += message.length;
  return fullStack.slice(index + 1);
}

/**
 * Prepare final message string including uncaught and/or diff info.
 *
 * @param {string} message
 * @param {string} stack
 * @param {Error} err
 * @returns {string}
 * @api private
 */
function prepareMessage(message, stack, err) {
  var msg = message;

  if (err.uncaught) {
    msg = 'Uncaught ' + msg;
  }

  return msg;
}

/**
 * Build indented suite/test title path for error reporting.
 *
 * @param {Object} test
 * @returns {string}
 * @api private
 */
function buildTestTitle(test) {
  var testTitle = '';
  var titlePath = test.titlePath();
  titlePath.forEach(function (str, index) {
    if (index !== 0) {
      testTitle += '\n     ';
    }
    var padding = '';
    for (var i = 0; i < index; i++) {
      padding += '  ';
    }
    testTitle += padding + str;
  });
  return testTitle;
}

/**
 * Determine whether to show diff output for the given error.
 *
 * @param {Error} err
 * @returns {boolean}
 * @api private
 */
function shouldShowDiff(err) {
  return !exports.hideDiff && showDiff(err);
}

/**
 * Prepare diff message for display.
 *
 * @param {Error} err
 * @param {string} message
 * @returns {string}
 * @api private
 */
function prepareDiffMessage(err, message) {
  stringifyDiffObjs(err);
  var fmt = buildDiffErrorFormat();
  var match = message.match(/^([^:]+): expected/);
  var msg = '\n      ' + color('error message', match ? match[1] : message);

  if (exports.inlineDiffs) {
    msg += inlineDiff(err);
  } else {
    msg += unifiedDiff(err);
  }

  return msg;
}

/**
 * Indent all lines of a multiline string.
 *
 * @param {string} str
 * @returns {string}
 * @api private
 */
function indentMultilineString(str) {
  return str.replace(/^/gm, '  ');
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

function Base (runner) {
  var stats = this.stats = { suites: 0, tests: 0, passes: 0, pending: 0, failures: 0 };
  var failures = this.failures = [];

  if (!runner) {
    return;
  }
  this.runner = runner;

  runner.stats = stats;

  runner.on('start', function () {
    stats.start = new Date();
  });

  runner.on('suite', function (suite) {
    stats.suites = stats.suites || 0;
    suite.root || stats.suites++;
  });

  runner.on('test end', function () {
    stats.tests = stats.tests || 0;
    stats.tests++;
  });

  runner.on('pass', function (test) {
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

  runner.on('fail', function (test, err) {
    stats.failures = stats.failures || 0;
    stats.failures++;
    if (showDiff(err)) {
      stringifyDiffObjs(err);
    }
    test.err = err;
    failures.push(test);
  });

  runner.on('end', function () {
    stats.end = new Date();
    stats.duration = new Date() - stats.start;
  });

  runner.on('pending', function () {
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
  var stats = this.stats;
  var fmt;

  console.log();

  // passes
  fmt = color('bright pass', ' ') +
    color('green', ' %d passing') +
    color('light', ' (%s)');

  console.log(fmt,
    stats.passes || 0,
    ms(stats.duration));

  // pending
  if (stats.pending) {
    fmt = color('pending', ' ') +
      color('pending', ' %d pending');

    console.log(fmt, stats.pending);
  }

  // failures
  if (stats.failures) {
    fmt = color('fail', '  %d failing');

    console.log(fmt, stats.failures);

    Base.list(this.failures);
    console.log();
  }

  console.log();
};

/**
 * Pad the given `str` to `len`.
 *
 * @api private
 * @param {string} str
 * @param {string} len
 * @return {string}
 */
function pad(str, len) {
  str = String(str);
  return Array(len - str.length + 1).join(' ') + str;
}

/**
 * Returns an inline diff between 2 strings with coloured ANSI output.
 *
 * @param {Error} err with actual/expected
 * @returns {string} Diff
 * @api private
 */
function inlineDiff(err) {
  var msg = errorDiff(err);
  msg = formatDiffLines(msg);
  msg = addDiffLegend(msg);
  msg = indentMultilineString(msg);
  return msg;
}

/**
 * Add line numbers to diff lines if appropriate.
 *
 * @param {string} msg
 * @returns {string}
 * @api private
 */
function formatDiffLines(msg) {
  var lines = msg.split('\n');
  if (lines.length <= 4) {
    return lines.join('\n');
  }

  var width = String(lines.length).length;
  return lines.map(function (str, i) {
    return pad(++i, width) + ' |' + ' ' + str;
  }).join('\n');
}

/**
 * Add legend for color-annotated diff output.
 *
 * @param {string} msg
 * @returns {string}
 * @api private
 */
function addDiffLegend(msg) {
  return '\n' +
    color('diff removed', 'actual') +
    ' ' +
    color('diff added', 'expected') +
    '\n\n' +
    msg +
    '\n';
}

/**
 * Returns a unified diff between two strings.
 *
 * @param {Error} err with actual/expected
 * @returns {string} The diff.
 * @api private
 */
function unifiedDiff(err) {
  var indent = '      ';
  var msg = diff.createPatch('string', err.actual, err.expected);
  var lines = msg.split('\n').splice(5);
  lines = lines.map(cleanUpLine).filter(hasContent);

  return '\n      ' +
    colorLines('diff added', '+ expected') + ' ' +
    colorLines('diff removed', '- actual') +
    '\n\n' +
    lines.join('\n');

  /**
   * Clean and color a single diff line.
   *
   * @param {string} line
   * @returns {string|null}
   */
  function cleanUpLine(line) {
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

  /**
   * Predicate: true if line is neither undefined nor null.
   *
   * @param {string|undefined|null} line
   * @returns {boolean}
   */
  function hasContent(line) {
    return line !== undefined && line !== null;
  }
}

/**
 * Return a character diff for `err`.
 *
 * @param {Error} err
 * @returns {string}
 * @api private
 */
function errorDiff(err) {
  return diff.diffWordsWithSpace(err.actual, err.expected).map(function (str) {
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
 * @param {string} name
 * @param {string} str
 * @returns {string}
 * @api private
 */
function colorLines(name, str) {
  return str.split('\n').map(function (str) {
    return color(name, str);
  }).join('\n');
}

/**
 * Object#toString reference.
 */
var objToString = Object.prototype.toString;

/**
 * Check that a / b have the same type.
 *
 * @param {Object} a
 * @param {Object} b
 * @returns {boolean}
 * @api private
 */
function sameType(a, b) {
  return objToString.call(a) === objToString.call(b);
}