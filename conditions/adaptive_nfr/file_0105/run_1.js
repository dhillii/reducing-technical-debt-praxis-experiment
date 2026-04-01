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
 * Determines if error should display a diff.
 * @param {Error} err
 * @return {boolean}
 * @api private
 */
function showDiff (err) {
  return err && err.showDiff !== false && sameType(err.actual, err.expected) && err.expected !== undefined;
}

/**
 * Converts actual/expected to strings if needed.
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
 * Processes error message and stack.
 * @param {string} message
 * @param {string} stack
 * @return {Object} {msg, stack}
 * @api private
 */
function processErrorMessageAndStack (message, stack) {
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
 * Formats error output with diff information.
 * @param {string} message
 * @param {Error} err
 * @return {string}
 * @api private
 */
function formatDiffOutput (message, err) {
  let msg = '\n      ' + color('error message', message);
  const match = message.match(/^([^:]+): expected/);
  if (match) {
    msg = '\n      ' + color('error message', match[1]);
  }

  if (exports.inlineDiffs) {
    msg += inlineDiff(err);
  } else {
    msg += unifiedDiff(err);
  }

  return msg;
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
    // format
    let fmt = color('error title', '  %s) %s:\n') +
      color('error message', '     %s') +
      color('error stack', '\n%s\n');

    // msg
    const err = test.err;
    const message = extractErrorMessage(err);
    const stack = err.stack || message;

    const { msg: processedMsg, stack: processedStack } = processErrorMessageAndStack(message, stack);
    let msg = processedMsg;

    // uncaught
    if (err.uncaught) {
      msg = 'Uncaught ' + msg;
    }

    // explicitly show diff
    if (!exports.hideDiff && showDiff(err)) {
      stringifyDiffObjs(err);
      fmt = color('error title', '  %s) %s:\n%s') + color('error stack', '\n%s\n');
      msg = formatDiffOutput(message, err);
    }

    // indent stack trace
    const indentedStack = processedStack.replace(/^/gm, '  ');

    // indented test title
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

    console.log(fmt, (i + 1), testTitle, msg, indentedStack);
  });
};

/**
 * Speed classification strategy for test duration.
 * @api private
 */
const speedClassifier = {
  /**
   * Classifies test speed based on duration.
   * @param {number} duration
   * @param {Function} slowThreshold
   * @return {string}
   */
  classify: function (duration, slowThreshold) {
    const slow = slowThreshold();
    if (duration > slow) {
      return 'slow';
    }
    if (duration > slow / 2) {
      return 'medium';
    }
    return 'fast';
  }
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

function Base (runner) {
  const stats = this.stats = { suites: 0, tests: 0, passes: 0, pending: 0, failures: 0 };
  const failures = this.failures = [];

  if (!runner) {
    return;
  }
  this.runner = runner;

  runner.stats = stats;

  runner.on('start', function () {
    stats.start = new GlobalDate();
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
    test.speed = speedClassifier.classify(test.duration, test.slow.bind(test));
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
    stats.end = new GlobalDate();
    stats.duration = new GlobalDate() - stats.start;
  });

  runner.on('pending', function () {
    stats.pending++;
  });
}

/**
 * Epilogue output formatter strategy.
 * @api private
 */
const epilogueFormatters = {
  /**
   * Formats passing tests output.
   * @param {number} passes
   * @param {number} duration
   * @return {string}
   */
  passes: function (passes, duration) {
    const fmt = color('bright pass', ' ') +
      color('green', ' %d passing') +
      color('light', ' (%s)');
    return { fmt: fmt, args: [passes || 0, ms(duration)] };
  },

  /**
   * Formats pending tests output.
   * @param {number} pending
   * @return {string|null}
   */
  pending: function (pending) {
    if (!pending) {
      return null;
    }
    const fmt = color('pending', ' ') +
      color('pending', ' %d pending');
    return { fmt: fmt, args: [pending] };
  },

  /**
   * Formats failing tests output.
   * @param {number} failures
   * @return {string|null}
   */
  failures: function (failures) {
    if (!failures) {
      return null;
    }
    const fmt = color('fail', '  %d failing');
    return { fmt: fmt, args: [failures] };
  }
};

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
  const passesOutput = epilogueFormatters.passes(stats.passes, stats.duration);
  console.log(passesOutput.fmt, ...passesOutput.args);

  // pending
  const pendingOutput = epilogueFormatters.pending(stats.pending);
  if (pendingOutput) {
    console.log(pendingOutput.fmt, ...pendingOutput.args);
  }

  // failures
  const failuresOutput = epilogueFormatters.failures(stats.failures);
  if (failuresOutput) {
    console.log(failuresOutput.fmt, ...failuresOutput.args);
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
 * Diff line processor strategy.
 * @api private
 */
const diffLineProcessors = {
  /**
   * Processes added lines.
   * @param {string} line
   * @param {string} indent
   * @return {string}
   */
  added: function (line, indent) {
    return indent + colorLines('diff added', line);
  },

  /**
   * Processes removed lines.
   * @param {string} line
   * @param {string} indent
   * @return {string}
   */
  removed: function (line, indent) {
    return indent + colorLines('diff removed', line);
  },

  /**
   * Processes hunk header lines.
   * @param {string} line
   * @return {string}
   */
  hunk: function (line) {
    return '--';
  },

  /**
   * Processes newline indicator lines.
   * @param {string} line
   * @return {null}
   */
  newlineIndicator: function (line) {
    return null;
  },

  /**
   * Processes regular lines.
   * @param {string} line
   * @param {string} indent
   * @return {string}
   */
  regular: function (line, indent) {
    return indent + line;
  }
};

/**
 * Determines the processor type for a diff line.
 * @param {string} line
 * @return {string}
 * @api private
 */
function getDiffLineType (line) {
  if (line[0] === '+') {
    return 'added';
  }
  if (line[0