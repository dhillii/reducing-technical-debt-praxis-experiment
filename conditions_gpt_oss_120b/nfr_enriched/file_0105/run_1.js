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
 * Export `Base`.
 */
exports = module.exports = Base;

/**
 * Save timer references to avoid Sinon interfering.
 * See: https://github.com/mochajs/mocha/issues/237
 */
const OriginalDate = global.Date;
const originalSetTimeout = global.setTimeout;
const originalSetInterval = global.setInterval;
const originalClearTimeout = global.clearTimeout;
const originalClearInterval = global.clearInterval;

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
 * Determine whether a diff should be shown for an error.
 *
 * @param {Error} err
 * @return {boolean}
 */
function shouldShowDiff(err) {
  return err && err.showDiff !== false && sameType(err.actual, err.expected) && err.expected !== undefined;
}

/**
 * Ensure error actual/expected are strings for diffing.
 *
 * @param {Error} err
 */
function normalizeDiffObjects(err) {
  if (!utils.isString(err.actual) || !utils.isString(err.expected)) {
    err.actual = utils.stringify(err.actual);
    err.expected = utils.stringify(err.expected);
  }
}

/**
 * Format the hierarchical title of a test.
 *
 * @param {Test} test
 * @return {string}
 */
function formatTestTitle(test) {
  let title = '';
  test.titlePath().forEach((segment, idx) => {
    if (idx !== 0) {
      title += '\n     ';
    }
    title += '  '.repeat(idx) + segment;
  });
  return title;
}

/**
 * Extract message and stack from an error, handling various representations.
 *
 * @param {Error} err
 * @return {{msg:string, stack:string, message:string}}
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

  if (index !== -1) {
    const end = index + message.length;
    const msg = stack.slice(0, end);
    const remainingStack = stack.slice(end + 1);
    return { msg, stack: remainingStack, message };
  }

  return { msg: message, stack, message };
}

/**
 * Prefix uncaught errors with a label.
 *
 * @param {string} msg
 * @param {Error} err
 * @return {string}
 */
function prefixUncaught(msg, err) {
  return err.uncaught ? 'Uncaught ' + msg : msg;
}

/**
 * Build diff output for an error, respecting configuration.
 *
 * @param {Error} err
 * @param {string} baseMessage
 * @return {{msg:string, fmt:string}}
 */
function buildDiffSection(err, baseMessage) {
  normalizeDiffObjects(err);
  const match = baseMessage.match(/^([^:]+): expected/);
  const diffHeader = '\n      ' + color('error message', match ? match[1] : baseMessage);
  const diffBody = exports.inlineDiffs ? inlineDiff(err) : unifiedDiff(err);
  const fmt = color('error title', '  %s) %s:\n%s') + color('error stack', '\n%s\n');
  return { msg: diffHeader + diffBody, fmt };
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
    const err = test.err;
    const { msg: initialMsg, stack, message } = extractMessageAndStack(err);
    let formattedMsg = prefixUncaught(initialMsg, err);
    let fmt = color('error title', '  %s) %s:\n') +
      color('error message', '     %s') +
      color('error stack', '\n%s\n');

    if (!exports.hideDiff && shouldShowDiff(err)) {
      const diffSection = buildDiffSection(err, message);
      formattedMsg = diffSection.msg;
      fmt = diffSection.fmt;
    }

    const indentedStack = stack.replace(/^/gm, '  ');
    const testTitle = formatTestTitle(test);
    console.log(fmt, i + 1, testTitle, formattedMsg, indentedStack);
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

  runner.on('start', () => {
    stats.start = new OriginalDate();
  });

  runner.on('suite', suite => {
    suite.root || stats.suites++;
  });

  runner.on('test end', () => {
    stats.tests++;
  });

  runner.on('pass', test => {
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
    stats.failures++;
    if (shouldShowDiff(err)) {
      normalizeDiffObjects(err);
    }
    test.err = err;
    failures.push(test);
  });

  runner.on('end', () => {
    stats.end = new OriginalDate();
    stats.duration = new OriginalDate() - stats.start;
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

  // passes
  let fmt = color('bright pass', ' ') +
    color('green', ' %d passing') +
    color('light', ' (%s)');
  console.log(fmt, stats.passes || 0, ms(stats.duration));

  // pending
  if (stats.pending) {
    fmt = color('pending', ' ') + color('pending', ' %d pending');
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
    formatted = lines.map((line, idx) => {
      return pad(idx + 1, width) + ' | ' + line;
    }).join('\n');
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
  const patch = diff.createPatch('string', err.actual, err.expected);
  const lines = patch.split('\n').splice(5);

  function colorLine(line) {
    if (line[0] === '+') {
      return indent + colorLines('diff added', line);
    }
    if (line[0] === '-') {
      return indent + colorLines('diff removed', line);
    }
    if (/@@/.test(line)) {
      return '--';
    }
    if (/\\ No newline/.test(line)) {
      return null;
    }
    return indent + line;
  }

  const filtered = lines.map(colorLine).filter(l => l != null);
  return '\n      ' +
    colorLines('diff added', '+ expected') + ' ' +
    colorLines('diff removed', '- actual') +
    '\n\n' +
    filtered.join('\n');
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