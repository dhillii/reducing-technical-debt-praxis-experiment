```javascript
'use strict';

var EventEmitter = require('events').EventEmitter;
var Pending = require('./pending');
var utils = require('./utils');
var inherits = utils.inherits;
var debug = require('debug')('mocha:runner');
var Runnable = require('./runnable');
var stackFilter = utils.stackTraceFilter();
var stringify = utils.stringify;
var type = utils.type;
var undefinedError = utils.undefinedError;

var NON_ENUMERABLE_GLOBALS = [
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'XMLHttpRequest', 'Date', 'setImmediate', 'clearImmediate'
];

module.exports = Runner;

function Runner(suite, delay) {
  this._globals = [];
  this._abort = false;
  this._delay = delay;
  this.suite = suite;
  this.started = false;
  this.total = suite.total();
  this.failures = 0;
  this._defaultGrep = /.*/;
  
  this._setupEventListeners();
  this.grep(this._defaultGrep);
  this.globals(this.globalProps().concat(extraGlobals()));
}

Runner.immediately = global.setImmediate || process.nextTick;

inherits(Runner, EventEmitter);

Runner.prototype._setupEventListeners = function() {
  var self = this;
  this.on('test end', function(test) {
    self.checkGlobals(test);
  });
  this.on('hook end', function(hook) {
    self.checkGlobals(hook);
  });
};

Runner.prototype.grep = function(re, invert) {
  debug('grep %s', re);
  this._grep = re;
  this._invert = invert;
  this.total = this.grepTotal(this.suite);
  return this;
};

Runner.prototype.grepTotal = function(suite) {
  var self = this;
  var total = 0;
  suite.eachTest(function(test) {
    if (self._matchesGrep(test.fullTitle())) {
      total++;
    }
  });
  return total;
};

Runner.prototype._matchesGrep = function(title) {
  var match = this._grep.test(title);
  return this._invert ? !match : match;
};

Runner.prototype.globalProps = function() {
  var props = Object.keys(global);
  for (var i = 0; i < NON_ENUMERABLE_GLOBALS.length; ++i) {
    if (props.indexOf(NON_ENUMERABLE_GLOBALS[i]) === -1) {
      props.push(NON_ENUMERABLE_GLOBALS[i]);
    }
  }
  return props;
};

Runner.prototype.globals = function(arr) {
  if (!arguments.length) {
    return this._globals;
  }
  debug('globals %j', arr);
  this._globals = this._globals.concat(arr);
  return this;
};

Runner.prototype.checkGlobals = function(test) {
  if (this.ignoreLeaks) {
    return;
  }
  
  var globals = this.globalProps();
  if (this.prevGlobalsLength === globals.length) {
    return;
  }
  
  this.prevGlobalsLength = globals.length;
  var ok = this._globals.concat(test && test._allowedGlobals || []);
  var leaks = filterLeaks(ok, globals);
  
  this._globals = this._globals.concat(leaks);
  this._reportLeaks(test, leaks);
};

Runner.prototype._reportLeaks = function(test, leaks) {
  if (leaks.length > 1) {
    this.fail(test, new Error('global leaks detected: ' + leaks.join(', ')));
  } else if (leaks.length) {
    this.fail(test, new Error('global leak detected: ' + leaks[0]));
  }
};

Runner.prototype.fail = function(test, err) {
  if (test.isPending()) {
    return;
  }

  ++this.failures;
  test.state = 'failed';

  if (!(err instanceof Error || (err && typeof err.message === 'string'))) {
    err = new Error('the ' + type(err) + ' ' + stringify(err) + ' was thrown, throw an Error :)');
  }

  try {
    err.stack = (this.fullStackTrace || !err.stack) ? err.stack : stackFilter(err.stack);
  } catch (ignored) {
    // some environments do not take kindly to monkeying with the stack
  }

  this.emit('fail', test, err);
};

Runner.prototype.failHook = function(hook, err) {
  if (hook.ctx && hook.ctx.currentTest) {
    hook.originalTitle = hook.originalTitle || hook.title;
    hook.title = hook.originalTitle + ' for "' + hook.ctx.currentTest.title + '"';
  }

  this.fail(hook, err);
  if (this.suite.bail()) {
    this.emit('end');
  }
};

Runner.prototype.hook = function(name, fn) {
  var suite = this.suite;
  var hooks = suite['_' + name];
  var self = this;

  function next(i) {
    var hook = hooks[i];
    if (!hook) {
      return fn();
    }
    
    self.currentRunnable = hook;
    hook.ctx.currentTest = self.test;
    self.emit('hook', hook);

    if (!hook.listeners('error').length) {
      hook.on('error', function(err) {
        self.failHook(hook, err);
      });
    }

    hook.run(function(err) {
      var testError = hook.error();
      if (testError) {
        self.fail(self.test, testError);
      }
      if (err) {
        self._handleHookError(err, hook, name, suite, fn);
      } else {
        self.emit('hook end', hook);
        delete hook.ctx.currentTest;
        next(++i);
      }
    });
  }

  Runner.immediately(function() {
    next(0);
  });
};

Runner.prototype._handleHookError = function(err, hook, name, suite, fn) {
  if (err instanceof Pending) {
    if (name === 'beforeEach' || name === 'afterEach') {
      this.test.pending = true;
    } else {
      suite.tests.forEach(function(test) {
        test.pending = true;
      });
      hook.pending = true;
    }
    this.emit('hook end', hook);
    delete hook.ctx.currentTest;
  } else {
    this.failHook(hook, err);
    return fn(err);
  }
};

Runner.prototype.hooks = function(name, suites, fn) {
  var self = this;
  var orig = this.suite;

  function next(suite) {
    self.suite = suite;

    if (!suite) {
      self.suite = orig;
      return fn();
    }

    self.hook(name, function(err) {
      if (err) {
        var errSuite = self.suite;
        self.suite = orig;
        return fn(err, errSuite);
      }
      next(suites.pop());
    });
  }

  next(suites.pop());
};

Runner.prototype.hookUp = function(name, fn) {
  var suites = [this.suite].concat(this.parents()).reverse();
  this.hooks(name, suites, fn);
};

Runner.prototype.hookDown = function(name, fn) {
  var suites = [this.suite].concat(this.parents());
  this.hooks(name, suites, fn);
};

Runner.prototype.parents = function() {
  var suite = this.suite;
  var suites = [];
  while (suite.parent) {
    suite = suite.parent;
    suites.push(suite);
  }
  return suites;
};

Runner.prototype.runTest = function(fn) {
  var self = this;
  var test = this.test;

  if (!test) {
    return;
  }
  
  if (this.forbidOnly && hasOnly(this.parents().reverse()[0] || this.suite)) {
    fn(new Error('`.only` forbidden'));
    return;
  }
  
  if (this.asyncOnly) {
    test.asyncOnly = true;
  }
  
  test.on('error', function(err) {
    self.fail(test, err);
  });
  
  if (this.allowUncaught) {
    test.allowUncaught = true;
    return test.run(fn);
  }
  
  try {
    test.run(fn);
  } catch (err) {
    fn(err);
  }
};

Runner.prototype.runTests = function(suite, fn) {
  var self = this;
  var tests = suite.tests.slice();
  var test;

  function hookErr(_, errSuite, after) {
    var orig = self.suite;
    self.suite = after ? errSuite.parent : errSuite;

    if (self.suite) {
      self.hookUp('afterEach', function(err2, errSuite2) {
        self.suite = orig;
        if (err2) {
          return hookErr(err2, errSuite2, true);
        }
        fn(errSuite);
      });
    } else {
      self.suite = orig;
      fn(errSuite);
    }
  }

  function next(err, errSuite) {
    if (self.failures && suite._bail) {
      return fn();
    }

    if (self._abort) {
      return fn();
    }

    if (err) {
      return hookErr(err, errSuite, true);
    }

    test = tests.shift();

    if (!test) {
      return fn();
    }

    if (!self._matchesGrep(test.fullTitle())) {
      if (self._grep !== self._defaultGrep) {
        Runner.immediately(next);
      } else {
        next();
      }
      return;
    }

    if (test.isPending()) {
      self._handlePendingTest(test);
      self.emit('test end', test);
      return next();
    }

    self.emit('test', self.test = test);
    self.hookDown('beforeEach', function(err, errSuite) {
      if (test.isPending()) {
        self._handlePendingTest(test);
        self.emit('test end', test);
        return next();
      }
      if (err) {
        return hookErr(err, errSuite, false);
      }
      self.currentRunnable = self.test;
      self.runTest(function(err) {
        self._handleTestResult(test, err, next);
      });
    });
  }

  this.next = next;
  this.hookErr = hookErr;
  next();
};

Runner.prototype._handlePendingTest = function(test) {
  if (this.forbidPending) {
    test.isPending = alwaysFalse;
    this.fail(test, new Error('Pending test forbidden'));
    delete test.isPending;
  } else {
    this.emit('pending', test);
  }
};

Runner.prototype._handleTestResult = function(test, err, next) {
  if (!err) {
    test.state = 'passed';
    this.emit('pass', test);
    this.emit('test end', test);
    this.hookUp('afterEach', next);
    return;
  }

  var retry = test.currentRetry();
  if (err instanceof Pending && this.forbidPending) {
    this.fail(test, new Error('Pending test forbidden'));
  } else if (err instanceof Pending) {
    test.pending = true;
    this.emit('pending', test);
  } else if (retry < test.retries()) {
    var clonedTest = test.clone();
    clonedTest.currentRetry(retry + 1);
    this.test.tests.unshift(clonedTest);
    this.emit('test end', test);
    return this.hookUp('afterEach', next);
  } else {
    this.fail(test, err);
  }

  this.emit('test end', test);
  if (err instanceof Pending) {
    return next();
  }
  this.hookUp('afterEach', next);
};

Runner.prototype.runSuite = function(suite, fn) {
  var i = 0;
  var self = this;
  var total = this.grepTotal(suite);
  var afterAllHookCalled = false;

  debug('run suite %s', suite.fullTitle());

  if (!total || (self.failures && suite._bail)) {
    return fn();
  }

  this.emit('suite', this.suite = suite);

  function next(errSuite) {
    if (errSuite) {
      return done(errSuite === suite ? undefined : errSuite);
    }

    if (self._abort) {
      return done();
    }

    var curr = suite.suites[i++];
    if (!curr) {
      return done();
    }

    if (self._grep !== self._defaultGrep) {
      Runner.immediately(function() {
        self.runSuite(curr, next);
      });
    } else {
      self.runSuite(curr, next);
    }
  }

  function done(errSuite) {
    self.suite = suite;
    self.nextSuite = next;

    if (afterAllHookCalled) {
      fn(errSuite);
    } else {
      afterAllHookCalled = true;
      delete self.test;

      self.hook('afterAll', function() {
        self.emit('suite end', suite);
        fn(errSuite);
      });
    }
  }

  this.nextSuite = next;

  this.hook('beforeAll', function(err) {
    if (err) {
      return done();
    }
    self.runTests(suite, next);
  });
};

Runner.prototype.uncaught = function(err) {
  if (err) {
    debug('uncaught exception %s', err === (function() {
      return this;
    }.call(err)) ? (err.message || err) : err);
  } else {
    debug('uncaught undefined exception');
    err = undefinedError();
  }
  err.uncaught = true;

  var runnable = this.currentRunnable;

  if (!runnable) {
    runnable = new Runnable('Uncaught error outside test suite');
    runnable.parent = this.suite;

    if (this.started) {
      this.fail(runnable, err);
    } else {
      this.emit('start');
      this.fail(runnable, err);
      this.emit('end');
    }
    return;
  }

  runnable.clearTimeout();

  if (runnable.state || runnable.isPending()) {
    return;
  }
  
  this.fail(runnable, err);
  this._recoverFromUncaughtError(runnable);
};

Runner.prototype._recoverFromUncaughtError = function(runnable) {
  if (runnable.type === 'test') {
    this.emit('test end', runnable);
    this.hookUp('afterEach', this.next);
    return;
  }

  if (runnable.type === 'hook') {
    var errSuite = this.suite;
    var title = runnable.fullTitle();
    
    if (title.indexOf('after each') > -1) {
      return this.hookErr(new Error(), errSuite, true);
    }
    if (title.indexOf('before each') > -1) {
      return this.hookErr(new Error(), errSuite, false);
    }
    return this.nextSuite(errSuite);
  }