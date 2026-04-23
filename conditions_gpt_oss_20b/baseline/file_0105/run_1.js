'use strict';

const tty = require('tty');
const diff = require('diff');
const ms = require('../ms');
const utils = require('../utils');
const supportsColor = process.browser ? null : require('supports-color');

exports = module.exports = Base;

const Date = global.Date;
const setTimeout = global.setTimeout;
const setInterval = global.setInterval;
const clearTimeout = global.clearTimeout;
const clearInterval = global.clearInterval;

const isatty = tty.isatty(1) && tty.isatty(2);

exports.useColors = !process.browser && (supportsColor || (process.env.MOCHA_COLORS !== undefined));

exports.inlineDiffs = false;

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

exports.symbols = {
  ok: '✓',
  err: '✖',
  dot: '․',
  comma: ',',
  bang: '!'
};

if (process.platform === 'win32') {
  exports.symbols.ok = '\u221A';
  exports.symbols.err = '\u00D7';
  exports.symbols.dot = '.';
}

const color = function (type, str) {
  if (!exports.useColors) {
    return String(str);
  }
  return '\u001b[' + exports.colors[type] + 'm' + str + '\u001b[0m';
};
exports.color = color;

const window = { width: 75 };
if (isatty) {
  window.width = process.stdout.getWindowSize
    ? process.stdout.getWindowSize(1)[0]
    : tty.getWindowSize()[1];
}
exports.window = window;

const cursor = {
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
      cursor.deleteLine();
      cursor.beginningOfLine();
    } else {
      process.stdout.write('\r');
    }
  }
};
exports.cursor = cursor;

function showDiff(err) {
  return err && err.showDiff !== false && sameType(err.actual, err.expected) && err.expected !== undefined;
}

function stringifyDiffObjs(err) {
  if (!utils.isString(err.actual) || !utils.isString(err.expected)) {
    err.actual = utils.stringify(err.actual);
    err.expected = utils.stringify(err.expected);
  }
}

exports.list = function (failures) {
  console.log();
  failures.forEach(function (test, i) {
    let fmt = color('error title', '  %s) %s:\n') +
      color('error message', '     %s') +
      color('error stack', '\n%s\n');

    let msg;
    const err = test.err;
    let message;
    if (err.message && typeof err.message.toString === 'function') {
      message = err.message + '';
    } else if (typeof err.inspect === 'function') {
      message = err.inspect() + '';
    } else {
      message = '';
    }
    let stack = err.stack || message;
    let index = message ? stack.indexOf(message) : -1;

    if (index === -1) {
      msg = message;
    } else {
      index += message.length;
      msg = stack.slice(0, index);
      stack = stack.slice(index + 1);
    }

    if (err.uncaught) {
      msg = 'Uncaught ' + msg;
    }
    if (!exports.hideDiff && showDiff(err)) {
      stringifyDiffObjs(err);
      fmt = color('error title', '  %s) %s:\n%s') + color('error stack', '\n%s\n');
      const match = message.match(/^([^:]+): expected/);
      msg = '\n      ' + color('error message', match ? match[1] : msg);

      if (exports.inlineDiffs) {
        msg += inlineDiff(err);
      } else {
        msg += unifiedDiff(err);
      }
    }

    stack = stack.replace(/^/gm, '  ');

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

    console.log(fmt, (i + 1), testTitle, msg, stack);
  });
};

function Base(runner) {
  const stats = this.stats = { suites: 0, tests: 0, passes: 0, pending: 0, failures: 0 };
  const failures = this.failures = [];

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

Base.prototype.epilogue = function () {
  const stats = this.stats;
  let fmt;

  console.log();

  fmt = color('bright pass', ' ') +
    color('green', ' %d passing') +
    color('light', ' (%s)');

  console.log(fmt,
    stats.passes || 0,
    ms(stats.duration));

  if (stats.pending) {
    fmt = color('pending', ' ') +
      color('pending', ' %d pending');

    console.log(fmt, stats.pending);
  }

  if (stats.failures) {
    fmt = color('fail', '  %d failing');

    console.log(fmt, stats.failures);

    Base.list(this.failures);
    console.log();
  }

  console.log();
};

function pad(str, len) {
  str = String(str);
  return Array(len - str.length + 1).join(' ') + str;
}

function inlineDiff(err) {
  let msg = errorDiff(err);

  const lines = msg.split('\n');
  if (lines.length > 4) {
    const width = String(lines.length).length;
    msg = lines.map(function (str, i) {
      return pad(++i, width) + ' |' + ' ' + str;
    }).join('\n');
  }

  msg = '\n' +
    color('diff removed', 'actual') +
    ' ' +
    color('diff added', 'expected') +
    '\n\n' +
    msg +
    '\n';

  msg = msg.replace(/^/gm, '      ');
  return msg;
}

function unifiedDiff(err) {
  const indent = '      ';
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
  function notBlank(line) {
    return typeof line !== 'undefined' && line !== null;
  }
  const msg = diff.createPatch('string', err.actual, err.expected);
  const lines = msg.split('\n').splice(5);
  return '\n      ' +
    colorLines('diff added', '+ expected') + ' ' +
    colorLines('diff removed', '- actual') + '\n\n' +
    lines.map(cleanUp).filter(notBlank).join('\n');
}

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

function colorLines(name, str) {
  return str.split('\n').map(function (str) {
    return color(name, str);
  }).join('\n');
}

const objToString = Object.prototype.toString;

function sameType(a, b) {
  return objToString.call(a) === objToString.call(b);
}