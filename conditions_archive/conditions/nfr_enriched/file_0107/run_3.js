```javascript
'use strict';

/**
 * Module dependencies.
 */

const EventEmitter = require('events').EventEmitter;
const Pending = require('./pending');
const utils = require('./utils');
const { inherits } = utils;
const debug = require('debug')('mocha:runner');
const Runnable = require('./runnable');
const { stackTraceFilter, stringify, type, undefinedError } = utils;

/**
 * Non-enumerable globals.
 */

const GLOBALS = [
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
function Runner(suite, delay) {
  this._globals = [];
  this._abort = false;
  this._delay = delay;
  this.suite = suite;
  this.started = false;
  this.total = suite.total();
  this.failures = 0;
  this.on('test end', (test) => {
    this.checkGlobals(test);
  });
  this.on('hook end', (hook) => {
    this.checkGlobals(hook);
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
 * @param {boolean} invert
 * @return {Runner} Runner instance.
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
 * @return {number}
 * @api public
 */
Runner.prototype.grepTotal = function(suite) {
  let total = 0;

  suite.eachTest((test) => {
    let match = this._grep.test(test.fullTitle());
    if (this._invert) {
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
Runner.prototype.globalProps = function() {
  const props = Object.keys(global);

  // non-enumerables
  for (let i = 0; i < GLOBALS.length; ++i) {
    if (~props.indexOf(GLOBALS[i])) {
      continue;
    }
    props.push(GLOBALS[i]);
  }

  return props;
};

/**
 * Allow the given `arr` of globals.
 *
 * @param {Array} arr
 * @return {Runner} Runner instance.
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
  let ok = this._globals;

  const globals = this.globalProps();
  let leaks;

  if (test) {
    ok = ok.concat(test._allowedGlobals || []);
  }

  if (this.prevGlobalsLength === globals.length) {
    return;
  }
  this.prevGlobalsLength = globals.length;

  leaks = filterLeaks(ok, globals);
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
  const suite = this.suite;
  const hooks = suite['_' + name];

  const next = (i) => {
    const hook = hooks[i];
    if (!hook) {
      return fn();
    }
    this.currentRunnable = hook;

    hook.ctx.currentTest = this.test;

    this.emit('hook', hook);

    if (!hook.listeners('error').length) {
      hook.on('error', (err) => {
        this.failHook(hook, err);
      });
    }

    hook.run((err) => {
      const testError = hook.error();
      if (testError) {
        this.fail(this.test, testError);
      }
      if (err) {
        this._handleHookError(err, name, suite, hook, fn);
      } else {
        this.emit('hook end', hook);
        delete hook.ctx.currentTest;
        next(++i);
      }
    });
  };

  Runner.immediately(() => {
    next(0);
  });
};

/**
 * Handle hook execution errors.
 *
 * @api private
 * @param {Error} err
 * @param {string} name
 * @param {Suite} suite
 * @param {Hook} hook
 * @param {Function} fn
 */
Runner.prototype._handleHookError = function(err, name, suite, hook, fn) {
  if (err instanceof Pending) {
    if (name === 'beforeEach' || name === 'afterEach') {
      this.test.pending = true;
    } else {
      suite.tests.forEach((test) => {
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
  const orig = this.suite;

  const next = (suite) => {
    this.suite = suite;

    if (!suite) {
      this.suite = orig;
      return fn();
    }

    this.hook(name, (err) => {
      if (err) {
        const errSuite = this.suite;
        this.suite = orig;
        return fn(err, errSuite);
      }

      next(suites.pop());
    });
  };

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
Runner.prototype.hookDown = function(name, fn) {
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
Runner.prototype.parents = function() {
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
Runner.prototype.runTest = function(fn) {
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
  test.on('error', (err) => {
    this.fail(test, err);
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
  const tests = suite.tests.slice();
  let test;

  const hookErr = (_, errSuite, after) => {
    const orig = this.suite;

    this.suite = after ? errSuite.parent : errSuite;

    if (this.suite) {
      this.hookUp('afterEach', (err2, errSuite2) => {
        this.suite = orig;
        if (err2) {
          return hookErr(err2, errSuite2, true);
        }
        fn(errSuite);
      });
    } else {
      this.suite = orig;
      fn(errSuite);
    }
  };

  const next = (err, errSuite) => {
    if (this.failures && suite._bail) {
      return fn();
    }

    if (this._abort) {
      return fn();
    }

    if (err) {
      return hookErr(err, errSuite, true);
    }

    test = tests.shift();

    if (!test) {
      return fn();
    }

    if (!this._shouldRunTest(test)) {
      return this._scheduleNextTest(next);
    }

    if (test.isPending()) {
      return this._handlePendingTest(test, next);
    }

    this.emit('test', this.test = test);
    this.hookDown('beforeEach', (err, errSuite) => {
      if (test.isPending()) {
        return this._handlePendingTest(test, next);
      }
      if (err) {
        return hookErr(err, errSuite, false);
      }
      this.currentRunnable = this.test;
      this.runTest((err) => {
        this._handleTestResult(err, test, tests, next, hookErr);
      });
    });
  };

  this.next = next;
  this.hookErr = hookErr;
  next();
};

/**
 * Determine if test should run based on grep filter.
 *
 * @api private
 * @param {Test} test
 * @return {boolean}
 */
Runner.prototype._shouldRunTest = function(test) {
  let match = this._grep.test(test.fullTitle());
  if (this._invert) {
    match = !match;
  }
  return match;
};

/**
 * Schedule next test execution with appropriate timing.
 *
 * @api private
 * @param {Function} next
 */
Runner.prototype._scheduleNextTest = function(next) {
  if (this._grep !== this._defaultGrep) {
    Runner.immediately(next);
  } else {
    next();
  }
};

/**
 * Handle pending test execution.
 *
 * @api private
 * @param {Test} test
 * @param {Function} next
 */
Runner.prototype._handlePendingTest = function(test, next) {
  if (this.forbidPending) {
    test.isPending = alwaysFalse;
    this.fail(test, new Error('Pending test forbidden'));
    delete test.isPending;
  } else {
    this.emit('pending', test);
  }
  this.emit('test end', test);
  return next();
};

/**
 * Handle test result and determine next action.
 *
 * @api private
 * @param {Error} err
 * @param {Test} test
 * @param {Array} tests
 * @param {Function} next
 * @param {Function} hookErr
 */
Runner.prototype._handleTestResult = function(err, test, tests, next, hookErr) {
  test = this.test;
  if (err) {
    return this._processTestError(err, test, tests, next, hookErr);
  }

  test.state = 'passed';
  this.emit('pass', test);
  this.emit('test end', test);
  this.hookUp('afterEach', next);
};

/**
 * Process test error and handle retries or failures.
 *
 * @api private
 * @param {Error} err
 * @param {Test} test
 * @param {Array} tests
 * @param {Function} next
 * @param {Function} hookErr
 */
Runner.prototype._processTestError = function(err, test, tests, next, hookErr) {
  const retry = test.currentRetry();
  if (err instanceof Pending && this.forbidPending) {
    this.fail(test, new Error('Pending test forbidden'));
  } else if (err instanceof Pending) {
    test.pending = true;
    this.emit('pending', test);
  } else if (retry < test.retries()) {
    const clonedTest = test.clone();
    clonedTest.currentRetry(retry + 1);
    tests.unshift(clonedTest);
    return this.hookUp('afterEach', next);
  } else {
    this.fail(test, err);
  }
  this.emit('test end', test);

  if (err instanceof Pending) {
    return next();
  }

  return this.hookUp('afterEach', next);
};

function alwaysFalse() {
  return false;
}

/**
 * Run the given `suite` and invoke the callback `fn()` when complete.
 *
 * @api private
 * @param {Suite} suite
 * @param {Function} fn
 */
Runner.prototype.runSuite = function(suite, fn) {
  let i = 0;
  const total = this.grepTotal(suite);
  let afterAllHookCalled = false;

  debug('run suite %s', suite.fullTitle());

  if (!total || (this.failures && suite._bail)) {
    return fn();
  }

  this.emit('suite', this.suite = suite);

  const next = (errSuite) => {
    if (errSuite) {
      if (errSuite === suite) {
        return done();
      }
      return done(errSuite);
    }

    if (this._abort) {
      return done();
    }

    const curr = suite.suites[i++];
    if (!curr) {
      return done();
    }

    if (this._grep !== this._defaultGrep) {
      Runner.immediately(() => {
        this.runSuite(curr, next);
      });
    } else {
      this.runSuite(curr, next);
    }
  };

  const done = (errSuite) => {
    this.suite = suite;
    this.nextSuite = next;

    if (afterAllHookCalled) {
      fn(errSuite);
    } else {
      afterAllHookCalled = true;
      delete this.test;

      this.hook('afterAll', () => {
        this.emit('suite end', suite);
        fn(errSuite);
      });
    }
  };

  this.nextSuite = next;

  this.hook('beforeAll', (err) => {
    if (err) {
      return done();
    }
    this.runTests(suite, next);
  });
};

/**
 * Handle uncaught exceptions.
 *
 * @param {Error} err
 * @api private
 */
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

  let runnable = this.currentRunnable;

  if (!runnable) {
    return this._handleUncaughtOutsideTest(err);
  }

  runnable.clearTimeout();

  if (runnable.state || runnable.isPending()) {
    return;
  }
  this.fail(runnable, err);

  this._recoverFromRunnable(runnable, err);
};

/**
 * Handle uncaught error outside test suite.
 *
 * @api private
 * @param {Error} err
 */
Runner.prototype._handleUncaughtOutsideTest = function(err) {
  const runnable = new Runnable('Uncaught error outside test suite');
  runnable.parent = this.suite;

  if (this.started) {
    this.fail(runnable, err);
  } else {
    this.emit('start');
    this.fail(runnable, err);
    this.emit('end');
  }
};

/**
 * Recover from runnable error based on type.
 *
 * @api private
 * @param {Runnable} runnable
 * @param {Error} err
 */
Runner.prototype._recoverFromRunnable = function(runnable, err) {
  if (runnable.type === 'test') {
    this.emit('test end', runnable);
    this.hookUp('afterEach', this.next);
    return;
  }

  if (runnable.type === 'hook') {
    const errSuite = this.suite;
    const fullTitle = runnable.fullTitle();
    if (fullTitle.indexOf('after each') > -1) {
      return this.hookErr(err, errSuite, true);
    }
    if (fullTitle.indexOf('before each') > -1) {
      return this.hookErr(err, errSuite, false);
    }
    return this.nextSuite(errSuite);
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
function cleanSuiteReferences(suite) {
  const cleanArrReferences = (arr) => {
    for (let i = 0; i < arr.length; i++) {
      delete arr[i].fn;
    }
  };

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
 * @return {Runner} Runner instance.
 * @api public
 */
Runner.prototype.run = function(fn) {
  const rootSuite = this.suite;

  if (hasOnly(rootSuite)) {
    filterOnly(rootSuite);
  }

  fn = fn || function() {};

  const uncaught = (err) => {
    this.uncaught(err);
  };

  const start = () => {
    this.started = true;
    this.emit('start');
    this.runSuite(rootSuite, () => {
      debug('finished running');
      this.emit('end');
    });
  };

  debug('start');

  this.on('suite end', cleanSuiteReferences);

  this.on('end', () => {
    debug('end');
    process.removeListener('uncaughtException', uncaught);
    fn(this.failures);
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
Runner.prototype.abort = function() {
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
function filterOnly(suite) {
  if (suite._onlyTests.length) {
    suite.tests = suite._onlyTests;
    suite.suites = [];
  } else {
    suite.tests = [];
    suite._onlySuites.forEach((onlySuite) => {
      if (hasOnly(onlySuite)) {
        filterOnly(onlySuite);
      }
    });
    suite.suites = suite.suites.filter((childSuite) => {
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
function hasOnly(suite) {
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
function filterLeaks(ok, globals) {
  return globals.filter((key) => {
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

    const matched = ok.filter((okKey) => {
      if (~okKey.indexOf('*')) {
        return key.indexOf(okKey.split('*')[0]) === 0;
      }
      return key === okKey;
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
function extraGlobals() {
  if (typeof process === 'object' && typeof process.version === 'string') {
    const parts = process.version.split('.');
    const nodeVersion = parts.reduce((a, v) => {
      return a << 8 | v;
    });

    if (nodeVersion < 0x00090B) {
      return ['errno'];
    }
  }

  return [];
}
```