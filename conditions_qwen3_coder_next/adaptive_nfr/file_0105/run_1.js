var tty = require('tty');
var diff = require('diff');
var ms = require('../ms');
var utils = require('../utils');
var supportsColor = process.browser ? null : require('supports-color');

exports = module.exports = Base;

var Date = global.Date;
var setTimeout = global.setTimeout;
var setInterval = global.setInterval;
var clearTimeout = global.clearTimeout;
var clearInterval = global.clearInterval;

var isatty = tty.isatty(1) && tty.isatty(2);

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

var color = exports.color = function (type, str) {
  if (!exports.useColors) {
    return String(str);
  }
  return '\u001b[' + exports.colors[type] + 'm' + str + '\u001b[0m';
};

exports.window = {
  width: 75
};

if (isatty) {
  exports.window.width = process.stdout.getWindowSize
    ? process.stdout.getWindowSize(1)[0]
    : tty.getWindowSize()[1];
}

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

function showDiff (err) {
  return err && err.showDiff !== false && sameType(err.actual, err.expected) && err.expected !== undefined;
}

function stringifyDiffObjs (err) {
  if (!utils.isString(err.actual) || !utils.isString(err.expected)) {
    err.actual = utils.stringify(err.actual);
    err.expected = utils.stringify(err.expected);
  }
}

exports.list = function (failures) {
  console.log();
  failures.forEach(function (test, i) {
    var fmt = color('error title', '  %s) %s:\n') +
      color('error message', '     %s') +
      color('error stack', '\n%s\n');

    var err = test.err;
    var message = getMessage(err);
    var stack = err.stack || message;
    var msg = extractMessageAndStripFromStack(message, stack);

    if (err.uncaught) {
      msg = 'Uncaught ' + msg;
    }

    if (!exports.hideDiff && showDiff(err)) {
      stringifyDiffObjs(err);
      fmt = color('error title', '  %s) %s:\n%s') + color('error stack', '\n%s\n');
      var match = message.match(/^([^:]+): expected/);
      msg = '\n      ' + color('error message', match ? match[1] : msg);

      msg += exports.inlineDiffs ? inlineDiff(err) : unifiedDiff(err);
    }

    stack = stack.replace(/^/gm, '  ');
    var testTitle = formatTestTitlePath(test);

    console.log(fmt, (i + 1), testTitle, msg, stack);
  });
};

function getMessage (err) {
  if (err.message && typeof err.message.toString === 'function') {
    return err.message + '';
  }
  if (typeof err.inspect === 'function') {
    return err.inspect() + '';
  }
  return '';
}

function extractMessageAndStripFromStack (message, stack) {
  if (!message) {
    return message;
  }

  var index = stack.indexOf(message);
  if (index === -1) {
    return message;
  }

  index += message.length;
  var msg = stack.slice(0, index);
  stack = stack.slice(index + 1);
  return msg;
}

function formatTestTitlePath (test) {
  var titlePath = test.titlePath();
  var testTitle = '';
  var i;

  for (i = 0; i < titlePath.length; i++) {
    var str = titlePath[i];
    if (i !== 0) {
      testTitle += '\n     ';
    }
    for (var j = 0; j < i; j++) {
      testTitle += '  ';
    }
    testTitle += str;
  }

  return testTitle;
}

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

Base.prototype.epilogue = function () {
  var stats = this.stats;
  var fmt;

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

function pad (str, len) {
  str = String(str);
  return Array(len - str.length + 1).join(' ') + str;
}

function inlineDiff (err) {
  var msg = errorDiff(err);

  var lines = msg.split('\n');
  if (lines.length > 4) {
    var width = String(lines.length).length;
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

function unifiedDiff (err) {
  var indent = '      ';
  function cleanUp (line) {
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
  function notBlank (line) {
    return typeof line !== 'undefined' && line !== null;
  }

  var msg = diff.createPatch('string', err.actual, err.expected);
  var lines = msg.split('\n').splice(5);
  return '\n      ' +
    colorLines('diff added', '+ expected') + ' ' +
    colorLines('diff removed', '- actual') +
    '\n\n' +
    lines.map(cleanUp).filter(notBlank).join('\n');
}

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

function colorLines (name, str) {
  return str.split('\n').map(function (line) {
    return color(name, line);
  }).join('\n');
}

var objToString = Object.prototype.toString;

function sameType (a, b) {
  return objToString.call(a) === objToString.call(b);
}