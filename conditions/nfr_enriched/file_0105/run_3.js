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

exports = module.exports = Base;

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

/**
 * Check if error should display a diff.
 *
 * @param {Error} err
 * @return {boolean}
 * @api private
 */
function showDiff (err) {
  return err && err.showDiff !== false && sameType(err.actual, err.expected) && err.expected !== undefined;
}

/**
 * Stringify actual and expected values if not already strings.
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
 * Extract error message from error object.
 *
 * @param {Error} err
 * @return {string}
 * @api private
 */
function extractErrorMessage (err) {
  if (err.message && typeof err.message.toString === 'function') {
    return err.message + '';
  }
  if (typeof err.inspect === 'function') {
    return err.inspect() + '';
  }
  return '';
}

/**
 * Parse error message and stack into separate components.
 *
 * @param {string} message
 * @param {string} stack
 * @return {Object} with msg and stack properties
 * @api private
 */
function parseErrorStack (message, stack) {
  const index = message ? stack.indexOf(message) : -1;

  if (index === -1) {
    return { msg: message, stack: stack };
  }

  const msgEndIndex = index + message.length;
  return {
    msg: stack.slice(0, msgEndIndex),
    stack: stack.slice(msgEndIndex + 1)
  };
}

/**
 * Format error title with test number and title.
 *
 * @param {number} testNumber
 * @param {string} testTitle
 * @return {string}
 * @api private
 */
function formatErrorTitle (testNumber, testTitle) {
  return color('error title', '  %s) %s:\n') +
    color('error message', '     %s') +
    color('error stack', '\n%s\n');
}

/**
 * Build formatted test title from title path.
 *
 * @param {Array} titlePath
 * @return {string}
 * @api private
 */
function buildTestTitle (titlePath) {
  let testTitle = '';
  titlePath.forEach(function (str, index) {
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
 * Format diff output for error message.
 *
 * @param {Error} err
 * @param {string} message
 * @return {Object} with fmt and msg properties
 * @api private
 */
function formatDiffOutput (err, message) {
  const fmt = color('error title', '  %s) %s:\n%s') + color('error stack', '\n%s\n');
  const match = message.match(/^([^:]+): expected/);
  let msg = '\n      ' + color('error message', match ? match[1] : message);

  if (exports.inlineDiffs) {
    msg += inlineDiff(err);
  } else {
    msg += unifiedDiff(err);
  }

  return { fmt: fmt, msg: msg };
}

/**
 * Output the given `failures` as a list.
 *
 * @param {Array} failures
 * @api public
 */

exports.list = function (failures) {
  console.log();
  failures.forEach(function (test, i) {
    const err = test.err;
    const message = extractErrorMessage(err);
    const stack = err.stack || message;

    const parsed = parseErrorStack(message, stack);
    let msg = parsed.msg;
    let formattedStack = parsed.stack;
    let fmt = formatErrorTitle(i + 1, test.titlePath()[0]);

    if (err.uncaught) {
      msg = 'Uncaught ' + msg;
    }

    if (!exports.hideDiff && showDiff(err)) {
      stringifyDiffObjs(err);
      const diffOutput = formatDiffOutput(err, message);
      fmt = diffOutput.fmt;
      msg = diffOutput.msg;
    }

    formattedStack = formattedStack.replace(/^/gm, '  ');
    const testTitle = buildTestTitle(test.titlePath());

    console.log(fmt, (i + 1), testTitle, msg, formattedStack);
  });
};

/**
 * Initialize stats object with default values.
 *
 * @return {Object}
 * @api private
 */
function createStatsObject () {
  return { suites: 0, tests: 0, passes: 0, pending: 0, failures: 0 };
}

/**
 * Determine test speed based on duration.
 *
 * @param {number} duration
 * @param {number} slowThreshold
 * @return {string}
 * @api private
 */
function determineTestSpeed (duration, slowThreshold) {
  if (duration > slowThreshold) {
    return 'slow';
  }
  if (duration > slowThreshold / 2) {
    return 'medium';
  }
  return 'fast';
}

/**
 * Attach event listeners for suite events.
 *
 * @param {Runner} runner
 * @param {Object} stats
 * @api private
 */
function attachSuiteListeners (runner, stats) {
  runner.on('suite', function (suite) {
    stats.suites = stats.suites || 0;
    if (!suite.root) {
      stats.suites++;
    }
  });
}

/**
 * Attach event listeners for test events.
 *
 * @param {Runner} runner
 * @param {Object} stats
 * @api private
 */
function attachTestListeners (runner, stats) {
  runner.on('test end', function () {
    stats.tests = stats.tests || 0;
    stats.tests++;
  });
}

/**
 * Attach event listeners for pass events.
 *
 * @param {Runner} runner
 * @param {Object} stats
 * @api private
 */
function attachPassListeners (runner, stats) {
  runner.on('pass', function (test) {
    stats.passes = stats.passes || 0;
    test.speed = determineTestSpeed(test.duration, test.slow());
    stats.passes++;
  });
}

/**
 * Attach event listeners for fail events.
 *
 * @param {Runner} runner
 * @param {Object} stats
 * @param {Array} failures
 * @api private
 */
function attachFailListeners (runner, stats, failures) {
  runner.on('fail', function (test, err) {
    stats.failures = stats.failures || 0;
    stats.failures++;
    if (showDiff(err)) {
      stringifyDiffObjs(err);
    }
    test.err = err;
    failures.push(test);
  });
}

/**
 * Attach event listeners for timing events.
 *
 * @param {Runner} runner
 * @param {Object} stats
 * @api private
 */
function attachTimingListeners (runner, stats) {
  runner.on('start', function () {
    stats.start = new GlobalDate();
  });

  runner.on('end', function () {
    stats.end = new GlobalDate();
    stats.duration = new GlobalDate() - stats.start;
  });
}

/**
 * Attach event listeners for pending events.
 *
 * @param {Runner} runner
 * @param {Object} stats
 * @api private
 */
function attachPendingListeners (runner, stats) {
  runner.on('pending', function () {
    stats.pending++;
  });
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
  const stats = this.stats = createStatsObject();
  const failures = this.failures = [];

  if (!runner) {
    return;
  }

  this.runner = runner;
  runner.stats = stats;

  attachTimingListeners(runner, stats);
  attachSuiteListeners(runner, stats);
  attachTestListeners(runner, stats);
  attachPassListeners(runner, stats);
  attachFailListeners(runner, stats, failures);
  attachPendingListeners(runner, stats);
}

/**
 * Format passes epilogue section.
 *
 * @param {Object} stats
 * @return {string}
 * @api private
 */
function formatPassesEpilogue (stats) {
  const fmt = color('bright pass', ' ') +
    color('green', ' %d passing') +
    color('light', ' (%s)');

  return { fmt: fmt, passes: stats.passes || 0, duration: ms(stats.duration) };
}

/**
 * Format pending epilogue section.
 *
 * @param {Object} stats
 * @return {string|null}
 * @api private
 */
function formatPendingEpilogue (stats) {
  if (!stats.pending) {
    return null;
  }

  const fmt = color('pending', ' ') +
    color('pending', ' %d pending');

  return { fmt: fmt, pending: stats.pending };
}

/**
 * Format failures epilogue section.
 *
 * @param {Object} stats
 * @return {string|null}
 * @api private
 */
function formatFailuresEpilogue (stats) {
  if (!stats.failures) {
    return null;
  }

  const fmt = color('fail', '  %d failing');
  return { fmt: fmt, failures: stats.failures };
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

  const passesOutput = formatPassesEpilogue(stats);
  console.log(passesOutput.fmt, passesOutput.passes, passesOutput.duration);

  const pendingOutput = formatPendingEpilogue(stats);
  if (pendingOutput) {
    console.log(pendingOutput.fmt, pendingOutput.pending);
  }

  const failuresOutput = formatFailuresEpilogue(stats);
  if (failuresOutput) {
    console.log(failuresOutput.fmt, failuresOutput.failures);
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
function pad (str, len) {
  str = String(str);
  return Array(len - str.length + 1).join(' ') + str;
}

/**
 * Add line numbers to diff output.
 *
 * @param {string} msg
 * @return {string}
 * @api private
 */
function addLineNumbers (msg) {
  const lines = msg.split('\n');
  if (lines.length <=