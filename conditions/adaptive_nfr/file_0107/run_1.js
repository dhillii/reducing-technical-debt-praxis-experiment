'use strict';

/**
 * Module dependencies.
 */

const EventEmitter = require('events').EventEmitter;
const Pending = require('./pending');
const utils = require('./utils');
const inherits = utils.inherits;
const debug = require('debug')('mocha:runner');
const Runnable = require('./runnable');
const stackFilter = utils.stackTraceFilter();
const stringify = utils.stringify;
const type = utils.type;
const undefinedError = utils.undefinedError;

/**
 * Non-enumerable globals.
 */

const globals = [
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
 * Events:
 *
 *   - `start`  execution started
 *   - `end`  execution complete
 *   - `suite`  (suite) test suite execution started
 *   - `suite end`  (suite) all tests (and sub-suites) have finished
 *   - `test`  (test) test execution started
 *   - `test end`  (test) test completed
 *   - `hook`  (hook) hook execution started
 *   - `hook end`  (hook) hook complete
 *   - `pass`  (test) test passed
 *   - `fail`  (test, err) test failed
 *   - `pending`  (test) test pending
 *
 * @api public
 * @param {Suite} suite Root suite
 * @param {boolean} [delay] Whether or not to delay execution of root suite
 * until ready.
 */
function Runner (suite, delay) {
  const self = this;
  this._globals = [];
  this._abort = false;
  this._delay = delay;
  this.suite = suite;
  this.started = false;
  this.total = suite.total();
  this.failures = 0;
  this.on('test end', function (test) {
    self.checkGlobals(test);
  });
  this.on('hook end', function (hook) {
    self.checkGlobals(hook);
  });
  this._defaultGrep = /.*/;
  this.grep(this._defaultGrep);
  this.globals(this.globalProps().concat(extraGlobals()));
}

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
 * @param {RegExp} re
 * @param {boolean} invert
 * @return {Runner} Runner instance.
 */
Runner.prototype.grep = function (re, invert) {
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
 * @param {Suite} suite
 * @return {number}
 */
Runner.prototype.grepTotal = function (suite) {
  const self = this;
  let total = 0;

  suite.eachTest(function (test) {
    let match = self._grep.test(test.fullTitle());
    if (self._invert) {
      match = !match;
    }
    if (match) {
      total++;
    }
  });

  return total;
};

/**
 * Return a list of global properties.
 *
 * @return {Array}
 * @api private
 */
Runner.prototype.globalProps = function () {
  const props = Object.keys(global);

  // non-enumerables
  for (let i = 0; i < globals.length; ++i) {
    if (~props.indexOf(globals[i])) {
      continue;
    }
    props.push(globals[i]);
  }

  return props;
};

/**
 * Allow the given `arr` of globals.
 *
 * @param {Array} arr
 * @return {Runner} for chaining
 * @api public
 * @param {Array} arr
 * @return {Runner} Runner instance.
 */
Runner.prototype.globals = function (arr) {
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
Runner.prototype.checkGlobals = function (test) {
  if (this.ignoreLeaks) {
    return;
  }
  let ok = this._globals;

  const currentGlobals = this.globalProps();
  let leaks;

  if (test) {
    ok = ok.concat(test._allowedGlobals || []);
  }

  if (this.prevGlobalsLength === currentGlobals.length) {
    return;
  }
  this.prevGlobalsLength = currentGlobals.length;

  leaks = filterLeaks(ok, currentGlobals);
  this._globals = this._globals.concat(leaks);

  if (leaks.length > 1) {
    this.fail(test, new Error('global leaks detected: ' + leaks.join(', ') + ''));
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
Runner.prototype.fail = function (test, err) {
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
 * Hook failures work in the following pattern:
 * - If bail, then exit
 * - Failed `before` hook skips all tests in a suite and subsuites,
 *   but jumps to corresponding `after` hook
 * - Failed `before each` hook skips remaining tests in a
 *   suite and jumps to corresponding `after each` hook,
 *   which is run only once
 * - Failed `after` hook does not alter
 *   execution order
 * - Failed `after each` hook skips remaining tests in a
 *   suite and subsuites, but executes other `after each`
 *   hooks
 *
 * @api private
 * @param {Hook} hook
 * @param {Error} err
 */
Runner.prototype.failHook = function (hook, err) {
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

Runner.prototype.hook = function (name, fn) {
  const suite = this.suite;
  const hooks = suite['_' + name];
  const self = this;

  function next (i) {
    const hook = hooks[i];
    if (!hook) {
      return fn();
    }
    self.currentRunnable = hook;

    hook.ctx.currentTest = self.test;

    self.emit('hook', hook);

    if (!hook.listeners('error').length) {
      hook.on('error', function (err) {
        self.failHook(hook, err);
      });
    }

    hook.run(function (err) {
      const testError = hook.error();
      if (testError) {
        self.fail(self.test, testError);
      }
      if (err) {
        handleHookError(err, name, self, suite, hook, fn);
      } else {
        self.emit('hook end', hook);
        delete hook.ctx.currentTest;
        next(++i);
      }
    });
  }

  Runner.immediately(function () {
    next(0);
  });
};

/**
 * Handle hook error based on hook type and pending status.
 * @param {Error} err
 * @param {string} name
 * @param {Runner} self
 * @param {Suite} suite
 * @param {Hook} hook
 * @param {Function} fn
 * @api private
 */
function handleHookError (err, name, self, suite, hook, fn) {
  if (err instanceof Pending) {
    if (name === 'beforeEach' || name === 'afterEach') {
      self.test.pending = true;
    } else {
      suite.tests.forEach(function (test) {
        test.pending = true;
      });
      hook.pending = true;
    }
    self.emit('hook end', hook);
    delete hook.ctx.currentTest;
  } else {
    self.failHook(hook, err);
    return fn(err);
  }
}

/**
 * Run hook `name` for the given array of `suites`
 * in order, and callback `fn(err, errSuite)`.
 *
 * @api private
 * @param {string} name
 * @param {Array} suites
 * @param {Function} fn
 */
Runner.prototype.hooks = function (name, suites, fn) {
  const self = this;
  const orig = this.suite;

  function next (suite) {
    self.suite = suite;

    if (!suite) {
      self.suite = orig;
      return fn();
    }

    self.hook(name, function (err) {
      if (err) {
        const errSuite = self.suite;
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
Runner.prototype.hookUp = function (name, fn) {
  const suites = [this.suite].concat(this.parents()).reverse();
  this.hooks(name, suites, fn);
};

/**
 * Run hooks from the bottom up.
 *
 * @param {String} name
 * @param {Function} fn
 * @api private
 */
Runner.prototype.hookDown = function (name, fn) {
  const suites = [this.suite].concat(this.parents());
  this.hooks(name, suites, fn);
};

/**
 * Return an array of parent Suites from
 * closest to furthest.
 *
 * @return {Array}
 * @api private
 */
Runner.prototype.parents = function () {
  let suite = this.suite;
  const suites = [];
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
Runner.prototype.runTest = function (fn) {
  const self = this;
  const test = this.test;

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
  test.on('error', function (err) {
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
 * Determine if test matches grep pattern.
 * @param {Test} test
 * @param {RegExp} grep
 * @param {boolean} invert
 * @return {boolean}
 * @api private
 */
function testMatchesGrep (test, grep, invert) {
  let match = grep.test(test.fullTitle());
  if (invert) {
    match = !match;
  }
  return match;
}

/**
 * Handle pending test based on forbidPending setting.
 * @param {Test} test
 * @param {Runner} self
 * @api private
 */
function handlePendingTest (test, self) {
  if (self.forbidPending) {
    test.isPending = alwaysFalse;
    self.fail(test, new Error('Pending test forbidden'));
    delete test.isPending;
  } else {
    self.emit('pending', test);
  }
}

/**
 * Handle test error with retry logic.
 * @param {Error} err
 * @param {Test} test
 * @param {Array} tests
 * @param {Runner} self
 * @return {boolean} true if error was handled as retry
 * @api private
 */
function handleTestError (err, test, tests, self) {
  const retry = test.currentRetry();
  if (err instanceof Pending && self.forbidPending) {
    self.fail(test, new Error('Pending test forbidden'));
    return false;
  } else if (err instanceof Pending) {
    test.pending = true;
    self.emit('pending', test);
    return false;
  } else if (retry < test.retries()) {
    const clonedTest = test.clone();
    clonedTest.currentRetry(retry + 1);
    tests.unshift(clonedTest);
    return true;
  } else {
    self.fail(test, err);
    return false;
  }
}

/**
 * Run tests in the given `suite` and invoke the callback `fn()` when complete.
 *
 * @api private
 * @param {Suite} suite
 * @param {Function} fn
 */
Runner.prototype.runTests = function (suite, fn) {
  const self = this;
  const tests = suite.tests.slice();
  let test;

  function hookErr (_, errSuite, after) {
    const orig = self.suite;

    self.suite = after ? errSuite.parent : errSuite;

    if (self.suite) {
      self.hookUp('afterEach', function (err2, errSuite2) {
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

  function next (err, errSuite) {
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

    if (!testMatchesGrep(test, self._grep, self._invert)) {
      if (self._grep !== self._defaultGrep) {
        Runner.immediately(next);
      } else {
        next();
      }
      return;
    }

    if (test.isPending()) {
      handlePendingTest(test, self);
      self.emit('test end', test);
      return next();
    }

    self.emit('test', self.test = test);
    self.hookDown('beforeEach', function (err, errSuite) {
      if (test.isPending()) {
        handlePendingTest(test, self);
        self.emit('test end', test);
        return next();
      }
      if (err) {
        return hookErr(err, errSuite, false);
      }
      self.currentRunnable = self.test;
      self.runTest(function (err) {
        test = self.test;
        if (err) {
          const isRetry = handleTestError(err, test, tests, self);
          self.emit('test end', test);

          if (err instanceof Pending) {
            return next();
          }

          if (isRetry) {
            return self.hookUp('afterEach', next);
          }

          return self.hookUp('afterEach', next);
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

function alwaysFalse () {
  return false;
}

/**
 * Run the given `suite` and invoke the callback `fn()` when complete.
 *
 * @api private
 * @param {Suite} suite
 * @param {Function} fn
 */
Runner.prototype.runSuite = function (suite, fn) {
  let i = 0;
  const self = this;
  const total = this.grepTotal(suite);
  let afterAllHookCalled = false;

  debug('run suite %s', suite.fullTitle());

  if (!total || (self.failures && suite._bail)) {
    return fn();
  }

  this.emit('suite', this.suite = suite);

  function next (errSuite) {
    if (errSuite) {
      if (errSuite === suite) {
        return done();
      }
      return done(errSuite);
    }

    if (self._abort) {
      return done();
    }

    const curr = suite.suites[i++];
    if (!curr) {
      return done();
    }

    if (self._grep !== self._defaultGrep) {
      Runner.immediately(function () {
        self.runSuite(curr, next);
      });
    } else {
      self.runSuite(curr, next);
    }
  }

  function done (errSuite) {
    self.suite = suite;
    self.nextSuite = next;

    if (afterAllHookCalled) {
      fn(errSuite);
    } else {
      afterAllHookCalled = true;

      delete self.test;

      self.hook('afterAll', function () {
        self.emit('suite end', suite);
        fn(errSuite);
      });
    }
  }

  this.nextSuite = next;

  this.hook('beforeAll', function (err) {
    if (err) {
      return done();
    }
    self.runTests(suite, next);
  });
};

/**
 * Determine if runnable is a test.
 * @param {Runnable} runnable
 * @return {boolean}
 * @api private
 */
function isTest (runnable) {
  return runnable.type === 'test';
}

/**
 * Determine if runnable is a hook.
 * @param {Runnable} runnable
 * @return {boolean}
 * @api private
 */
function isHook (runnable) {
  return runnable.type === 'hook';
}

/**
 * Determine hook type from full title.
 * @param {string} fullTitle
 * @return {string|null} 'afterEach', 'beforeEach', or null
 * @api private
 */
function getHookType (fullTitle) {
  if (fullTitle.indexOf('after each') > -1) {
    return 'afterEach';
  }
  if (fullTitle.indexOf('before each') > -1) {
    return 'beforeEach';
  }
  return null;
}

/**
 * Handle uncaught exception for hook runnable.
 * @param {Runnable} runnable
 * @param {Error} err
 * @param {Runner} self
 * @api private
 */
function handleUncaughtHook (runnable, err, self) {
  const errSuite = self.suite;
  const hookType = getHookType(runnable.fullTitle());

  if (hookType === 'afterEach') {
    return self.hookErr(err, errSuite, true);
  }
  if (hookType === 'beforeEach') {
    return self.hookErr(err, errSuite, false);
  }
  return self.nextSuite(errSuite);
}

/**
 * Handle uncaught exception for test runnable.
 * @param {Runnable} runnable
 * @param {Runner} self
 * @api private
 */
function handleUncaughtTest (runnable, self) {
  self.emit('test end', runnable);
  self.hookUp('afterEach', self.next);
}

/**
 * Handle uncaught exceptions.
 *
 * @param {Error} err
 * @api private
 */
Runner.prototype.uncaught = function (err) {
  if (err) {
    debug('uncaught exception %s', err === (function () {
      return this;
    }.call(err)) ? (err.message || err) : err);
  } else {
    debug('uncaught undefined exception');
    err = undefinedError();
  }
  err.uncaught = true;

  let runnable = this.currentRunnable;

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

  if (isTest(runnable)) {
    handleUncaughtTest(runnable, this);
    return;
  }

  if (isHook(runnable)) {
    handleUncaughtHook(runnable, err, this);
    return;
  }

  this.emit('end');
};

/**
 * Cleans up the references to all the deferred functions
 * (before/after/beforeEach/afterEach) and tests of a Suite.
 * These must be deleted otherwise a memory leak can happen,
 * as those functions may reference variables from closures,
 * thus those variables can never be garbage collected as long
 * as the deferred functions exist.
 *
 * @param {Suite} suite
 */
function cleanSuiteReferences (suite) {
  function cleanArrReferences (arr) {
    for (let i = 0; i < arr.length; i++) {
      delete arr[i].fn;
    }
  }

  if (Array.isArray(suite._beforeAll)) {
    cleanArrReferences(suite._beforeAll);
  }

  if (Array.isArray(suite._beforeEach)) {
    cleanArrReferences(suite._beforeEach);
  }

  if (Array.isArray(suite._afterAll)) {
    cleanArrReferences(suite._afterAll);
  }

  if (Array.isArray(suite._afterEach)) {
    cleanArrReferences(suite._afterEach);
  }

  for (let i = 0; i < suite.tests.length; i++) {
    delete suite.tests[i].fn;
  }
}

/**
 * Run the root suite and invoke `fn(failures)`
 * on completion.
 *
 * @param {Function} fn
 * @return {Runner} for chaining
 * @api public
 * @param {Function} fn
 * @return {Runner} Runner instance.
 */
Runner.prototype.run = function (fn) {
  const self = this;
  const rootSuite = this.suite;

  if (hasOnly(rootSuite)) {
    filterOnly(rootSuite);
  }

  fn = fn || function () {};

  function uncaught (err) {
    self.uncaught(err);
  }

  function start () {
    self.started = true;
    self.emit('start');
    self.runSuite(rootSuite, function () {
      debug('finished running');
      self.emit('end');
    });
  }

  debug('start');

  this.on('suite end', cleanSuiteReferences);

  this.on('end', function () {
    debug('end');
    process.removeListener('uncaughtException', uncaught);
    fn(self.failures);
  });

  process.on('uncaughtException', uncaught);

  if (this._delay) {
    this.emit('waiting', rootSuite);
    rootSuite.once('run', start);
  } else {
    start();
  }

  return this;
};

/**
 * Cleanly abort execution.
 *
 * @api public
 * @return {Runner} Runner instance.
 */
Runner.prototype.abort = function () {
  debug('aborting');
  this._abort = true;

  return this;
};

/**
 * Filter suites based on `isOnly` logic.
 *
 * @param {Array} suite
 * @returns {Boolean}
 * @api private
 */
function filterOnly (suite) {
  if (suite._onlyTests.length) {
    suite.tests = suite._onlyTests;
    suite.suites = [];
  } else {
    suite.tests = [];
    suite._onlySuites.forEach(function (onlySuite) {
      if (hasOnly(onlySuite)) {
        filterOnly(onlySuite);
      }
    });
    suite.suites = suite.suites.filter(function (childSuite) {
      return suite._onlySuites.indexOf(childSuite) !== -1 || filterOnly(childSuite);
    });
  }
  return suite.tests.length || suite.suites.length;
}

/**
 * Determines whether a suite has an `only` test or suite as a descendant.
 *
 * @param {Array} suite
 * @returns {Boolean}
 * @api private
 */
function hasOnly (suite) {
  return suite._onlyTests.length || suite._onlySuites.length || suite.suites.some(hasOnly);
}

/**
 * Filter leaks with the given globals flagged as `ok`.
 *
 * @api private
 * @param {Array} ok
 * @param {Array} globals
 * @return {Array}
 */
function filterLeaks (ok, globals) {
  return globals.filter(function (key) {
    if (/^\d+/.test(key)) {
      return false;
    }

    if (global.navigator && (/^getInterface/).test(key)) {
      return false;
    }

    if (global.navigator && (/^\d+/).test(key)) {
      return false;
    }

    if (/^mocha-/.test(key)) {
      return false;
    }

    const matched = ok.filter(function (ok) {
      if (~ok.indexOf('*')) {
        return key.indexOf(ok.split('*')[0]) === 0;
      }
      return key === ok;
    });
    return !matched.length && (!global.navigator || key !== 'onerror');
  });
}

/**
 * Array of globals dependent on the environment.
 *
 * @return {Array}
 * @api private
 */
function extraGlobals () {
  if (typeof process === 'object' && typeof process.version === 'string') {
    const parts = process.version.split('.');
    const nodeVersion = parts.reduce(function (a, v) {
      return a << 8 | v;
    });

    if (nodeVersion < 0x00090B) {
      return ['errno'];
    }
  }

  return [];
}