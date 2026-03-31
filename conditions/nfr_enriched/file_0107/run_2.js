```javascript
'use strict';

/**
 * Module dependencies.
 */

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

/**
 * Non-enumerable globals.
 */
var GLOBALS = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'XMLHttpRequest',
  'Date',
  'setImmediate',
  'clearImmediate'
];

/**
 * Expose `Runner`.
 */
module.exports = Runner;

/**
 * Initialize a `Runner` for the given `suite`.
 *
 * @api public
 * @param {Suite} suite Root suite
 * @param {boolean} [delay] Whether or not to delay execution of root suite
 */
function Runner(suite, delay) {
  this._globals = [];
  this._abort = false;
  this._delay = delay;
  this.suite = suite;
  this.started = false;
  this.total = suite.total();
  this.failures = 0;
  this._defaultGrep = /.*/;

  this._setupGlobalChecks();
  this.grep(this._defaultGrep);
  this.globals(this.globalProps().concat(extraGlobals()));
}

/**
 * Setup global leak detection listeners.
 *
 * @api private
 */
Runner.prototype._setupGlobalChecks = function() {
  var self = this;
  this.on('test end', function(test) {
    self.checkGlobals(test);
  });
  this.on('hook end', function(hook) {
    self.checkGlobals(hook);
  });
};

/**
 * Wrapper for setImmediate, process.nextTick, or browser polyfill.
 *
 * @param {Function} fn
 * @api private
 */
Runner.immediately = global.setImmediate || process.nextTick;

/**
 * Inherit from `EventEmitter.prototype`.
 */
inherits(Runner, EventEmitter);

/**
 * Run tests with full titles matching `re`. Updates runner.total
 * with number of tests matched.
 *
 * @param {RegExp} re
 * @param {Boolean} invert
 * @return {Runner} for chaining
 * @api public
 */
Runner.prototype.grep = function(re, invert) {
  debug('grep %s', re);
  this._grep = re;
  this._invert = invert;
  this.total = this.grepTotal(this.suite);
  return this;
};

/**
 * Returns the number of tests matching the grep search for the
 * given suite.
 *
 * @param {Suite} suite
 * @return {Number}
 * @api public
 */
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

/**
 * Check if a test title matches the grep pattern.
 *
 * @param {string} title
 * @return {boolean}
 * @api private
 */
Runner.prototype._matchesGrep = function(title) {
  var match = this._grep.test(title);
  return this._invert ? !match : match;
};

/**
 * Return a list of global properties.
 *
 * @return {Array}
 * @api private
 */
Runner.prototype.globalProps = function() {
  var props = Object.keys(global);

  // Add non-enumerable globals
  for (var i = 0; i < GLOBALS.length; ++i) {
    if (props.indexOf(GLOBALS[i]) === -1) {
      props.push(GLOBALS[i]);
    }
  }

  return props;
};

/**
 * Allow the given `arr` of globals.
 *
 * @param {Array} arr
 * @return {Runner} for chaining
 * @api public
 */
Runner.prototype.globals = function(arr) {
  if (!arguments.length) {
    return this._globals;
  }
  debug('globals %j', arr);
  this._globals = this._globals.concat(arr);
  return this;
};

/**
 * Check for global variable leaks.
 *
 * @api private
 */
Runner.prototype.checkGlobals = function(test) {
  if (this.ignoreLeaks) {
    return;
  }

  var globals = this.globalProps();

  if (this.prevGlobalsLength === globals.length) {
    return;
  }

  this.prevGlobalsLength = globals.length;

  var allowedGlobals = this._globals.concat(test && test._allowedGlobals || []);
  var leaks = filterLeaks(allowedGlobals, globals);

  this._globals = this._globals.concat(leaks);

  if (leaks.length > 1) {
    this.fail(test, new Error('global leaks detected: ' + leaks.join(', ')));
  } else if (leaks.length) {
    this.fail(test, new Error('global leak detected: ' + leaks[0]));
  }
};

/**
 * Fail the given `test`.
 *
 * @api private
 * @param {Test} test
 * @param {Error} err
 */
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
    err.stack = (this.fullStackTrace || !err.stack)
      ? err.stack
      : stackFilter(err.stack);
  } catch (ignored) {
    // some environments do not take kindly to monkeying with the stack
  }

  this.emit('fail', test, err);
};

/**
 * Fail the given `hook` with `err`.
 *
 * @api private
 * @param {Hook} hook
 * @param {Error} err
 */
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

/**
 * Run hook `name` callbacks and then invoke `fn()`.
 *
 * @api private
 * @param {string} name
 * @param {Function} fn
 */
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
        if (err instanceof Pending) {
          self._handlePendingHook(name, hook);
        } else {
          self.failHook(hook, err);
          return fn(err);
        }
      }

      self.emit('hook end', hook);
      delete hook.ctx.currentTest;
      next(++i);
    });
  }

  Runner.immediately(function() {
    next(0);
  });
};

/**
 * Handle pending hook logic.
 *
 * @api private
 * @param {string} name
 * @param {Hook} hook
 */
Runner.prototype._handlePendingHook = function(name, hook) {
  if (name === 'beforeEach' || name === 'afterEach') {
    this.test.pending = true;
  } else {
    this.suite.tests.forEach(function(test) {
      test.pending = true;
    });
    hook.pending = true;
  }
};

/**
 * Run hook `name` for the given array of `suites`
 * in order, and callback `fn(err, errSuite)`.
 *
 * @api private
 * @param {string} name
 * @param {Array} suites
 * @param {Function} fn
 */
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

/**
 * Run hooks from the top level down.
 *
 * @param {String} name
 * @param {Function} fn
 * @api private
 */
Runner.prototype.hookUp = function(name, fn) {
  var suites = [this.suite].concat(this.parents()).reverse();
  this.hooks(name, suites, fn);
};

/**
 * Run hooks from the bottom up.
 *
 * @param {String} name
 * @param {Function} fn
 * @api private
 */
Runner.prototype.hookDown = function(name, fn) {
  var suites = [this.suite].concat(this.parents());
  this.hooks(name, suites, fn);
};

/**
 * Return an array of parent Suites from
 * closest to furthest.
 *
 * @return {Array}
 * @api private
 */
Runner.prototype.parents = function() {
  var suite = this.suite;
  var suites = [];
  while (suite.parent) {
    suite = suite.parent;
    suites.push(suite);
  }
  return suites;
};

/**
 * Run the current test and callback `fn(err)`.
 *
 * @param {Function} fn
 * @api private
 */
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

/**
 * Run tests in the given `suite` and invoke the callback `fn()` when complete.
 *
 * @api private
 * @param {Suite} suite
 * @param {Function} fn
 */
Runner.prototype.runTests = function(suite, fn) {
  var self = this;
  var tests = suite.tests.slice();

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

    var test = tests.shift();

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
        test = self.test;
        if (err) {
          return self._handleTestError(test, err, tests, next);
        }

        test.state = 'passed';
        self.emit('pass', test);
        self.emit('test end', test);
        self.hookUp('afterEach', next);
      });
    });
  }

  this.next = next;
  this.hookErr = hookErr;
  next();
};

/**
 * Handle pending test logic.
 *
 * @api private
 * @param {Test} test
 */
Runner.prototype._handlePendingTest = function(test) {
  if (this.forbidPending) {
    test.isPending = alwaysFalse;
    this.fail(test, new Error('Pending test forbidden'));
    delete test.isPending;
  } else {
    this.emit('pending', test);
  }
};

/**
 * Handle test error and retry logic.
 *
 * @api private
 * @param {Test} test
 * @param {Error} err
 * @param {Array} tests
 * @param {Function} next
 * @return {*}
 */
Runner.prototype._handleTestError = function(test, err, tests, next) {
  var self = this;
  var retry = test.currentRetry();

  if (err instanceof Pending && this.forbidPending) {
    this.fail(test, new Error('Pending test forbidden'));
  } else if (err instanceof Pending) {
    test.pending = true;
    this.emit('pending', test);
  } else if (retry < test.retries()) {
    var clonedTest = test.clone();
    clonedTest.currentRetry(retry + 1);
    tests.unshift(clonedTest);
    return this.hookUp('afterEach', next);
  } else {
    this.fail(test, err