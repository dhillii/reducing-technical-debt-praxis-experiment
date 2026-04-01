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
const DateRef = global.Date;
const setTimeoutRef = global.setTimeout;
const setIntervalRef = global.setInterval;
const clearTimeoutRef = global.clearTimeout;
const clearIntervalRef = global.clearInterval;
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
 * Determines if error should display a diff.
 * @param {Error} err
 * @return {boolean}
 * @api private
 */
function showDiff (err) {
  return err && err.showDiff !== false && sameType(err.actual, err.expected) && err.expected !== undefined;
}

/**
 * Stringifies actual and expected if not already strings.
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
 * Extracts message from error object.
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
 * Processes error message and stack to separate them.
 * @param {string} message
 * @param {string} stack
 * @return {Object} {msg, stack}
 * @api private
 */
function processMessageAndStack (message, stack) {
  const index = message ? stack.indexOf(message) : -1;

  if (index === -1) {
    return { msg: message, stack: stack };
  }

  const endIndex = index + message.length;
  return {
    msg: stack.slice(0, endIndex),
    stack: stack.slice(endIndex + 1)
  };
}

/**
 * Formats uncaught error message.
 * @param {string} msg
 * @param {boolean} isUncaught
 * @return {string}
 * @api private
 */
function formatUncaughtMessage (msg, isUncaught) {
  return isUncaught ? 'Uncaught ' + msg : msg;
}

/**
 * Builds diff format string and message.
 * @param {Error} err
 * @param {string} message
 * @return {Object} {fmt, msg}
 * @api private
 */
function buildDiffOutput (err, message) {
  const match = message.match(/^([^:]+): expected/);
  let msg = '\n      ' + color('error message', match ? match[1] : message);

  if (exports.inlineDiffs) {
    msg += inlineDiff(err);
  } else {
    msg += unifiedDiff(err);
  }

  const fmt = color('error title', '  %s) %s:\n%s') + color('error stack', '\n%s\n');
  return { fmt: fmt, msg: msg };
}

/**
 * Builds test title path string.
 * @param {Object} test
 * @return {string}
 * @api private
 */
function buildTestTitle (test) {
  let testTitle = '';
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
 * Output the given `failures` as a list.
 *
 * @param {Array} failures
 * @api public
 */

exports.list = function (failures) {
  console.log();
  failures.forEach(function (test, i) {
    let fmt = color('error title', '  %s) %s:\n') +
      color('error message', '     %s') +
      color('error stack', '\n%s\n');

    const err = test.err;
    const message = extractErrorMessage(err);
    let stack = err.stack || message;
    const { msg: processedMsg, stack: processedStack } = processMessageAndStack(message, stack);
    let msg = processedMsg;
    stack = processedStack;

    msg = formatUncaughtMessage(msg, err.uncaught);

    // explicitly show diff
    if (!exports.hideDiff && showDiff(err)) {
      stringifyDiffObjs(err);
      const diffOutput = buildDiffOutput(err, message);
      fmt = diffOutput.fmt;
      msg = diffOutput.msg;
    }

    // indent stack trace
    stack = stack.replace(/^/gm, '  ');

    // indented test title
    const testTitle = buildTestTitle(test);

    console.log(fmt, (i + 1), testTitle, msg, stack);
  });
};

/**
 * Determines test speed category based on duration.
 * @param {number} duration
 * @param {Function} slowFn
 * @return {string}
 * @api private
 */
function determineTestSpeed (duration, slowFn) {
  const slowThreshold = slowFn();
  if (duration > slowThreshold) {
    return 'slow';
  }
  if (duration > slowThreshold / 2) {
    return 'medium';
  }
  return 'fast';
}

/**
 * Initializes runner event handlers for pass events.
 * @param {Object} runner
 * @param {Object} stats
 * @api private
 */
function setupPassHandler (runner, stats) {
  runner.on('pass', function (test) {
    stats.passes = stats.passes || 0;
    test.speed = determineTestSpeed(test.duration, test.slow);
    stats.passes++;
  });
}

/**
 * Initializes runner event handlers for fail events.
 * @param {Object} runner
 * @param {Object} stats
 * @param {Array} failures
 * @api private
 */
function setupFailHandler (runner, stats, failures) {
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

  runner.on('start', function () {
    stats.start = new DateRef();
  });

  runner.on('suite', function (suite) {
    stats.suites = stats.suites || 0;
    suite.root || stats.suites++;
  });

  runner.on('test end', function () {
    stats.tests = stats.tests || 0;
    stats.tests++;
  });

  setupPassHandler(runner, stats);
  setupFailHandler(runner, stats, failures);

  runner.on('end', function () {
    stats.end = new DateRef();
    stats.duration = new DateRef() - stats.start;
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
  const stats = this.stats;
  let fmt;

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
  let msg = errorDiff(err);

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
 * Processes a diff line based on its prefix.
 * @param {string} line
 * @param {string} indent
 * @return {string|null}
 * @api private
 */
function processDiffLine (line, indent) {
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
 * Returns a unified diff between two strings.
 *
 * @api private
 * @param {Error} err with actual/expected
 * @return {string} The diff.
 */
function unifiedDiff (err) {
  const indent = '      ';
  const msg = diff.createPatch('string', err.actual, err.expected);
  const lines = msg.split('\n').splice(5);
  return '\n      ' +
    colorLines('diff added', '+ expected') + ' ' +
    colorLines('diff removed', '- actual') +
    '\n\n' +
    lines.map(line => processDiffLine(line, indent)).filter(line => typeof line !== 'undefined' && line !== null).join('\n');
}

/**
 * Return a character diff for `err`.
 *
 * @api private
 * @param {Error} err
 * @return {string}
 */
function errorDiff (err) {
  const diffStrategies = {
    added: (str) => colorLines('diff added', str.value),
    removed: (str) => colorLines('diff removed', str.value),
    default: (str) => str.value
  };

  return diff.diffWordsWithSpace(err.actual, err.expected).map(function (str) {
    if (str.added) {
      return diffStrategies.added(str);
    }
    if (str.removed) {
      return diffStrategies.removed(str);
    }
    return diffStrategies.default(str);
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
```