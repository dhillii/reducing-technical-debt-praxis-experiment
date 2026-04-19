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

const Base = module.exports = Base;

/**
 * Save timer references to avoid Sinon interfering.
 * See: https://github.com/mochajs/mocha/issues/237
 */

/* eslint-disable no-unused-vars, no-native-reassign */
const Date = global.Date;
const setTimeout = global.setTimeout;
const setInterval = global.setInterval;
const clearTimeout = global.clearTimeout;
const clearInterval = global.clearInterval;
/* eslint-enable no-unused-vars, no-native-reassign */

/**
 * Check if both stdio streams are associated with a tty.
 */

const isatty = tty.isatty(1) && tty.isatty(2);

/**
 * Enable coloring by default, except in the browser interface.
 */

Base.useColors = !process.browser && (supportsColor || (process.env.MOCHA_COLORS !== undefined));

/**
 * Inline diffs instead of +/-
 */

Base.inlineDiffs = false;

/**
 * Default color map.
 */

Base.colors = {
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

Base.symbols = {
  ok: '✓',
  err: '✖',
  dot: '․',
  comma: ',',
  bang: '!'
};

// With node.js on Windows: use symbols available in terminal default fonts
if (process.platform === 'win32') {
  Base.symbols.ok = '\u221A';
  Base.symbols.err = '\u00D7';
  Base.symbols.dot = '.';
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
const color = Base.color = function (type, str) {
  if (!Base.useColors) {
    return String(str);
  }
  return '\u001b[' + Base.colors[type] + 'm' + str + '\u001b[0m';
};

/**
 * Expose term window size, with some defaults for when stderr is not a tty.
 */

Base.window = {
  width: 75
};

if (isatty) {
  Base.window.width = process.stdout.getWindowSize
    ? process.stdout.getWindowSize(1)[0]
    : tty.getWindowSize()[1];
}

/**
 * Expose some basic cursor interactions that are common among reporters.
 */

Base.cursor = {
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
      Base.cursor.deleteLine();
      Base.cursor.beginningOfLine();
    } else {
      process.stdout.write('\r');
    }
  }
};

/**
 * Check if diff should be shown for the given error.
 *
 * @param {Error} err
 * @return {boolean}
 * @api private
 */
function showDiff (err) {
  return err && err.showDiff !== false && sameType(err.actual, err.expected) && err.expected !== undefined;
}

/**
 * Convert non-string values to strings for diffing.
 *
 * @param {Error} err
 * @api private
 */
function stringifyDiffObjs (err) {
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

Base.list = function (failures) {
  console.log();
  failures.forEach(function (test, i) {
    const formattedTest = formatTest(test, i);
    console.log(formattedTest);
  });
};

/**
 * Format a single test failure for output.
 *
 * @param {Object} test
 * @param {number} index
 * @return {string}
 * @api private
 */
function formatTest (test, index) {
  const err = test.err;
  const message = getMessage(err);
  const stack = getStack(err, message);
  const msg = getErrorMessage(err, message, stack);
  const testTitle = formatTestTitle(test);
  const fmt = getFormatString(err);
  const stackWithIndent = indentStack(stack);
  return fmt(index, testTitle, msg, stackWithIndent);
}

/**
 * Get the error message from the error object.
 *
 * @param {Error} err
 * @return {string}
 * @api private
 */
function getMessage (err) {
  if (err.message && typeof err.message.toString === 'function') {
    return err.message + '';
  }
  if (typeof err.inspect === 'function') {
    return err.inspect() + '';
  }
  return '';
}

/**
 * Get the stack trace, removing the message if present.
 *
 * @param {Error} err
 * @param {string} message
 * @return {string}
 * @api private
 */
function getStack (err, message) {
  const stack = err.stack || message;
  const index = message ? stack.indexOf(message) : -1;

  if (index === -1) {
    return stack;
  }
  const indexWithLength = index + message.length;
  const msg = stack.slice(0, index);
  const stackWithoutMsg = stack.slice(indexWithLength + 1);
  return stackWithoutMsg;
}

/**
 * Get the error message for display, handling uncaught errors and diffs.
 *
 * @param {Error} err
 * @param {string} message
 * @param {string} stack
 * @return {string}
 * @api private
 */
function getErrorMessage (err, message, stack) {
  if (err.uncaught) {
    return 'Uncaught ' + message;
  }
  if (!Base.hideDiff && showDiff(err)) {
    stringifyDiffObjs(err);
    const match = message.match(/^([^:]+): expected/);
    const diffMsg = match ? match[1] : message;
    const diffContent = getDiffContent(err);
    return '\n      ' + color('error message', diffMsg) + diffContent;
  }
  return message;
}

/**
 * Get the format string based on whether diff is shown.
 *
 * @param {Error} err
 * @return {string}
 * @api private
 */
function getFormatString (err) {
  if (!Base.hideDiff && showDiff(err)) {
    return color('error title', '  %s) %s:\n%s') + color('error stack', '\n%s\n');
  }
  return color('error title', '  %s) %s:\n') + color('error message', '     %s') + color('error stack', '\n%s\n');
}

/**
 * Get the diff content for the error.
 *
 * @param {Error} err
 * @return {string}
 * @api private
 */
function getDiffContent (err) {
  if (Base.inlineDiffs) {
    return inlineDiff(err);
  }
  return unifiedDiff(err);
}

/**
 * Format the test title with proper indentation.
 *
 * @param {Object} test
 * @return {string}
 * @api private
 */
function formatTestTitle (test) {
  const testTitle = '';
  test.titlePath().forEach(function (str, index) {
    if (index !== 0) {
      testTitle += '\n     ';
    }
    for (let i = 0; i < index; i++) {
      testTitle += '  ';
    }
    testTitle += str;
  });
  return testTitle;
}

/**
 * Indent the stack trace.
 *
 * @param {string} stack
 * @return {string}
 * @api private
 */
function indentStack (stack) {
  return stack.replace(/^/gm, '  ');
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
  const stats = this.stats = { suites: 0, tests: 0, passes: 0, pending: 0, failures: 0 };
  const failures = this.failures = [];

  if (!runner) {
    return;
  }
  this.runner = runner;

  runner.stats = stats;

  setupEventListeners(runner, stats, failures);
}

/**
 * Set up event listeners for the runner.
 *
 * @param {Runner} runner
 * @param {Object} stats
 * @param {Array} failures
 * @api private
 */
function setupEventListeners (runner, stats, failures) {
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
    setTestSpeed(test);
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
 * Set the speed of a test based on its duration.
 *
 * @param {Object} test
 * @api private
 */
function setTestSpeed (test) {
  const slowThreshold = test.slow();
  if (test.duration > slowThreshold) {
    test.speed = 'slow';
  } else if (test.duration > slowThreshold / 2) {
    test.speed = 'medium';
  } else {
    test.speed = 'fast';
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
  const fmt = getEpilogueFormat();

  console.log();

  // passes
  const passesFormat = color('bright pass', ' ') +
    color('green', ' %d passing') +
    color('light', ' (%s)');

  console.log(passesFormat,
    stats.passes || 0,
    ms(stats.duration));

  // pending
  if (stats.pending) {
    const pendingFormat = color('pending', ' ') +
      color('pending', ' %d pending');

    console.log(pendingFormat, stats.pending);
  }

  // failures
  if (stats.failures) {
    const failuresFormat = color('fail', '  %d failing');

    console.log(failuresFormat, stats.failures);

    Base.list(this.failures);
    console.log();
  }

  console.log();
};

/**
 * Get the format string for the epilogue.
 *
 * @return {string}
 * @api private
 */
function getEpilogueFormat () {
  return color('bright pass', ' ') +
    color('green', ' %d passing') +
    color('light', ' (%s)');
}

/**
 * Pad the given `str` to `len`.
 *
 * @api private
 * @param {string} str
 * @param {string} len
 * @return {string}
 */
function pad (str, len) {
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
function inlineDiff (err) {
  const msg = errorDiff(err);

  // linenos
  const lines = msg.split('\n');
  if (lines.length > 4) {
    const width = String(lines.length).length;
    msg = lines.map(function (str, i) {
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
function unifiedDiff (err) {
  const indent = '      ';
  const cleanUp = function (line) {
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
  const notBlank = function (line) {
    return typeof line !== 'undefined' && line !== null;
  };
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
function errorDiff (err) {
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
 * @api private
 * @param {string} name
 * @param {string} str
 * @return {string}
 */
function colorLines (name, str) {
  return str.split('\n').map(function (str) {
    return color(name, str);
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
function sameType (a, b) {
  return objToString.call(a) === objToString.call(b);
}