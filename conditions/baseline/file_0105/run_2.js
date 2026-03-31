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
 * Configuration constants
 */

const isatty = tty.isatty(1) && tty.isatty(2);
const DEFAULT_WINDOW_WIDTH = 75;
const ANSI_ESCAPE = '\u001b';
const ANSI_RESET = '\u001b[0m';

/**
 * Color and symbol configuration
 */

const colorMap = {
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

const symbolMap = {
  ok: '✓',
  err: '✖',
  dot: '․',
  comma: ',',
  bang: '!'
};

// Windows platform adjustments
if (process.platform === 'win32') {
  symbolMap.ok = '\u221A';
  symbolMap.err = '\u00D7';
  symbolMap.dot = '.';
}

/**
 * Utility functions
 */

function color(type, str) {
  if (!exports.useColors) {
    return String(str);
  }
  return `${ANSI_ESCAPE}[${colorMap[type]}m${str}${ANSI_RESET}`;
}

function pad(str, len) {
  str = String(str);
  return Array(len - str.length + 1).join(' ') + str;
}

function sameType(a, b) {
  return Object.prototype.toString.call(a) === Object.prototype.toString.call(b);
}

function showDiff(err) {
  return err && err.showDiff !== false && sameType(err.actual, err.expected) && err.expected !== undefined;
}

function stringifyDiffObjs(err) {
  if (!utils.isString(err.actual) || !utils.isString(err.expected)) {
    err.actual = utils.stringify(err.actual);
    err.expected = utils.stringify(err.expected);
  }
}

function colorLines(name, str) {
  return str.split('\n').map(line => color(name, line)).join('\n');
}

function errorDiff(err) {
  return diff.diffWordsWithSpace(err.actual, err.expected)
    .map(str => {
      if (str.added) {
        return colorLines('diff added', str.value);
      }
      if (str.removed) {
        return colorLines('diff removed', str.value);
      }
      return str.value;
    })
    .join('');
}

function inlineDiff(err) {
  let msg = errorDiff(err);
  const lines = msg.split('\n');

  if (lines.length > 4) {
    const width = String(lines.length).length;
    msg = lines.map((str, i) => pad(++i, width) + ' |' + ' ' + str).join('\n');
  }

  msg = '\n' +
    color('diff removed', 'actual') + ' ' +
    color('diff added', 'expected') + '\n\n' +
    msg + '\n';

  return msg.replace(/^/gm, '      ');
}

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

  const msg = diff.createPatch('string', err.actual, err.expected);
  const lines = msg.split('\n').splice(5);

  return '\n      ' +
    colorLines('diff added', '+ expected') + ' ' +
    colorLines('diff removed', '- actual') + '\n\n' +
    lines.map(cleanUp).filter(line => typeof line !== 'undefined' && line !== null).join('\n');
}

function getTestTitlePath(test) {
  let testTitle = '';
  test.titlePath().forEach((str, index) => {
    if (index !== 0) {
      testTitle += '\n     ';
    }
    testTitle += '  '.repeat(index) + str;
  });
  return testTitle;
}

function extractErrorMessage(err) {
  let message;
  if (err.message && typeof err.message.toString === 'function') {
    message = err.message + '';
  } else if (typeof err.inspect === 'function') {
    message = err.inspect() + '';
  } else {
    message = '';
  }
  return message;
}

function parseErrorStack(err, message) {
  const stack = err.stack || message;
  const index = message ? stack.indexOf(message) : -1;

  if (index === -1) {
    return { msg: message, stack };
  }

  const endIndex = index + message.length;
  return {
    msg: stack.slice(0, endIndex),
    stack: stack.slice(endIndex + 1)
  };
}

function formatErrorOutput(test, i) {
  const err = test.err;
  const message = extractErrorMessage(err);
  const { msg: initialMsg, stack } = parseErrorStack(err, message);

  let msg = initialMsg;
  let fmt = color('error title', '  %s) %s:\n') +
    color('error message', '     %s') +
    color('error stack', '\n%s\n');

  if (err.uncaught) {
    msg = 'Uncaught ' + msg;
  }

  if (!exports.hideDiff && showDiff(err)) {
    stringifyDiffObjs(err);
    fmt = color('error title', '  %s) %s:\n%s') + color('error stack', '\n%s\n');
    const match = message.match(/^([^:]+): expected/);
    msg = '\n      ' + color('error message', match ? match[1] : msg);

    msg += exports.inlineDiffs ? inlineDiff(err) : unifiedDiff(err);
  }

  const indentedStack = stack.replace(/^/gm, '  ');
  const testTitle = getTestTitlePath(test);

  return { fmt, i: i + 1, testTitle, msg, stack: indentedStack };
}

/**
 * Cursor control utilities
 */

const cursorControl = {
  hide: () => isatty && process.stdout.write(`${ANSI_ESCAPE}[?25l`),
  show: () => isatty && process.stdout.write(`${ANSI_ESCAPE}[?25h`),
  deleteLine: () => isatty && process.stdout.write(`${ANSI_ESCAPE}[2K`),
  beginningOfLine: () => isatty && process.stdout.write(`${ANSI_ESCAPE}[0G`),
  CR: () => {
    if (isatty) {
      cursorControl.deleteLine();
      cursorControl.beginningOfLine();
    } else {
      process.stdout.write('\r');
    }
  }
};

/**
 * Get window width
 */

function getWindowWidth() {
  if (!isatty) {
    return DEFAULT_WINDOW_WIDTH;
  }
  return process.stdout.getWindowSize
    ? process.stdout.getWindowSize(1)[0]
    : tty.getWindowSize()[1];
}

/**
 * Initialize stats object
 */

function initializeStats() {
  return {
    suites: 0,
    tests: 0,
    passes: 0,
    pending: 0,
    failures: 0
  };
}

/**
 * Determine test speed
 */

function getTestSpeed(test) {
  const slowThreshold = test.slow();
  if (test.duration > slowThreshold) {
    return 'slow';
  }
  if (test.duration > slowThreshold / 2) {
    return 'medium';
  }
  return 'fast';
}

/**
 * Base reporter
 */

function Base(runner) {
  const stats = this.stats = initializeStats();
  const failures = this.failures = [];

  if (!runner) {
    return;
  }

  this.runner = runner;
  runner.stats = stats;

  runner.on('start', () => {
    stats.start = new GlobalDate();
  });

  runner.on('suite', (suite) => {
    if (!suite.root) {
      stats.suites++;
    }
  });

  runner.on('test end', () => {
    stats.tests++;
  });

  runner.on('pass', (test) => {
    test.speed = getTestSpeed(test);
    stats.passes++;
  });

  runner.on('fail', (test, err) => {
    stats.failures++;
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
    stats.pending++;
  });
}

/**
 * Output failures as a list
 */

Base.list = function(failures) {
  console.log();
  failures.forEach((test, i) => {
    const { fmt, i: index, testTitle, msg, stack } = formatErrorOutput(test, i);
    console.log(fmt, index, testTitle, msg, stack);
  });
};

/**
 * Output epilogue
 */

Base.prototype.epilogue = function() {
  const stats = this.stats;

  console.log();

  // Passes
  console.log(
    color('bright pass', ' ') + color('green', ' %d passing') + color('light', ' (%s)'),
    stats.passes || 0,
    ms(stats.duration)
  );

  // Pending
  if (stats.pending) {
    console.log(
      color('pending', ' ') + color('pending', ' %d pending'),
      stats.pending
    );
  }

  // Failures
  if (stats.failures) {
    console.log(color('fail', '  %d failing'), stats.failures);
    Base.list(this.failures);
    console.log();
  }

  console.log();
};

/**
 * Exports
 */

exports = module.exports = Base;
exports.useColors = !process.browser && (supportsColor || (process.env.MOCHA_COLORS !== undefined));
exports.inlineDiffs = false;
exports.colors = colorMap;
exports.symbols = symbolMap;
exports.color = color;
exports.cursor = cursorControl;
exports.window = {
  width: getWindowWidth()
};
exports.list = Base.list;
```