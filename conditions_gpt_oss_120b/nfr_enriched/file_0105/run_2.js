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
const color = exports.color = (type, str) => {
  if (!exports.useColors) {
    return String(str);
  }
  return `\u001b[${exports.colors[type]}m${str}\u001b[0m`;
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
  hide: () => {
    isatty && process.stdout.write('\u001b[?25l');
  },
  show: () => {
    isatty && process.stdout.write('\u001b[?25h');
  },
  deleteLine: () => {
    isatty && process.stdout.write('\u001b[2K');
  },
  beginningOfLine: () => {
    isatty && process.stdout.write('\u001b[0G');
  },
  CR: () => {
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
 * Ensure error actual/expected are strings.
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
 * Build a formatted title path for a test.
 *
 * @param {Test} test
 * @return {string}
 */
function buildTestTitle(test) {
  let title = '';
  test.titlePath().forEach((segment, idx) => {
    if (idx !== 0) title += '\n     ';
    title += '  '.repeat(idx) + segment;
  });
  return title;
}

/**
 * Extract a readable message from an error.
 *
 * @param {Error} err
 * @return {{msg:string, stack:string}}
 */
function extractErrorMessage(err) {
  let message = '';
  if (err.message && typeof err.message.toString === 'function') {
    message = err.message + '';
  } else if (typeof err.inspect === 'function') {
    message = err.inspect() + '';
  }

  const stack = err.stack || message;
  const idx = message ? stack.indexOf(message) : -1;

  if (idx === -1) {
    return { msg: message, stack };
  }

  const end = idx + message.length;
  return {
    msg: stack.slice(0, end),
    stack: stack.slice(end + 1)
  };
}

/**
 * Append diff information to a message.
 *
 * @param {Error} err
 * @param {string} baseMsg
 * @return {string}
 */
function appendDiff(err, baseMsg) {
  normalizeDiffObjects(err);
  const match = err.message && err.message.match(/^([^:]+): expected/);
  const diffHeader = `\n      ${color('error message', match ? match[1] : baseMsg)}`;
  const diffBody = exports.inlineDiffs ? inlineDiff(err) : unifiedDiff(err);
  return diffHeader + diffBody;
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
    const { msg, stack: rawStack } = extractErrorMessage(err);
    let formattedMsg = msg;
    let formattedStack = rawStack.replace(/^/gm, '  ');
    let titleFmt = color('error title', '  %s) %s:\n') + color('error message', '     %s') + color('error stack', '\n%s\n');

    if (err.uncaught) {
      formattedMsg = 'Uncaught ' + formattedMsg;
    }

    if (!exports.hideDiff && shouldShowDiff(err)) {
      formattedMsg = appendDiff(err, formattedMsg);
      titleFmt = color('error title', '  %s) %s:\n%s') + color('error stack', '\n%s\n');
    }

    const testTitle = buildTestTitle(test);
    console.log(titleFmt, i + 1, testTitle, formattedMsg, formattedStack);
  });
};

/**
 * Initialize a new `Base` reporter.
 *
 * @param {Runner} runner
 * @api public
 */
function Base(runner) {
  const stats = this.stats = { suites: 0, tests: 0, passes: 0, pending: 0, failures: 0 };
  this.failures = [];

  if (!runner) return;
  this.runner = runner;
  runner.stats = stats;

  runner.on('start', () => {
    stats.start = new Date();
  });

  runner.on('suite', suite => {
    if (!suite.root) stats.suites++;
  });

  runner.on('test end', () => {
    stats.tests++;
  });

  runner.on('pass', test => {
    assignTestSpeed(test);
    stats.passes++;
  });

  runner.on('fail', (test, err) => {
    stats.failures++;
    if (shouldShowDiff(err)) normalizeDiffObjects(err);
    test.err = err;
    this.failures.push(test);
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
 * Determine test speed category.
 *
 * @param {Test} test
 */
function assignTestSpeed(test) {
  const slow = test.slow();
  if (test.duration > slow) {
    test.speed = 'slow';
  } else if (test.duration > slow / 2) {
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
  console.log();

  // passes
  let fmt = `${color('bright pass', ' ')}${color('green', ' %d passing')}${color('light', ' (%s)')}`;
  console.log(fmt, stats.passes || 0, ms(stats.duration));

  // pending
  if (stats.pending) {
    fmt = `${color('pending', ' ')}${color('pending', ' %d pending')}`;
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
 * @param {string} str
 * @param {number} len
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
 * @return {string}
 */
function inlineDiff(err) {
  const msg = errorDiff(err);
  const lines = msg.split('\n');

  let formatted = msg;
  if (lines.length > 4) {
    const width = String(lines.length).length;
    formatted = lines
      .map((line, i) => `${pad(i + 1, width)} | ${line}`)
      .join('\n');
  }

  formatted = `\n${color('diff removed', 'actual')} ${color('diff added', 'expected')}\n\n${formatted}\n`;
  return formatted.replace(/^/gm, '      ');
}

/**
 * Returns a unified diff between two strings.
 *
 * @param {Error} err with actual/expected
 * @return {string}
 */
function unifiedDiff(err) {
  const indent = '      ';
  const rawPatch = diff.createPatch('string', err.actual, err.expected);
  const lines = rawPatch.split('\n').splice(5);

  const cleanLine = line => {
    if (line[0] === '+') return indent + colorLines('diff added', line);
    if (line[0] === '-') return indent + colorLines('diff removed', line);
    if (/@@/.test(line)) return '--';
    if (/\\ No newline/.test(line)) return null;
    return indent + line;
  };

  const notBlank = line => line != null;
  const header = `\n${colorLines('diff added', '+ expected')} ${colorLines('diff removed', '- actual')}\n\n`;

  return header + lines.map(cleanLine).filter(notBlank).join('\n');
}

/**
 * Return a character diff for `err`.
 *
 * @param {Error} err
 * @return {string}
 */
function errorDiff(err) {
  return diff.diffWordsWithSpace(err.actual, err.expected)
    .map(part => {
      if (part.added) return colorLines('diff added', part.value);
      if (part.removed) return colorLines('diff removed', part.value);
      return part.value;
    })
    .join('');
}

/**
 * Color lines for `str`, using the color `name`.
 *
 * @param {string} name
 * @param {string} str
 * @return {string}
 */
function colorLines(name, str) {
  return str.split('\n')
    .map(line => color(name, line))
    .join('\n');
}

/**
 * Object#toString reference.
 */
const objToString = Object.prototype.toString;

/**
 * Check that a / b have the same type.
 *
 * @param {Object} a
 * @param {Object} b
 * @return {boolean}
 */
function sameType(a, b) {
  return objToString.call(a) === objToString.call(b);
}