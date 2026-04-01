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
        if (err instanceof Pending) {
          this._handlePendingHook(name, hook, suite);
        } else {
          this.failHook(hook, err);

          // stop executing hooks, notify callee of hook err
          return fn(err);
        }
      }
      this.emit('hook end', hook);
      delete hook.ctx.currentTest;
      next(++i);
    });
  };

  Runner.immediately(() => {
    next(0);
  });
};

/**
 * Handle pending hook logic based on hook type.
 *
 * @api private
 * @param {string} name
 * @param {Hook} hook
 * @param {Suite} suite
 */
Runner.prototype._handlePendingHook = function(name, hook, suite) {
  if (name === 'beforeEach' || name === 'afterEach') {
    this.test.pending = true;
  } else {
    suite.tests.forEach((test) => {
      test.pending = true;
    });
    // a pending hook won't be executed twice.
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
    // before/after Each hook for errSuite failed:
    const orig = this.suite;

    // for failed 'after each' hook start from errSuite parent,
    // otherwise start from errSuite itself
    this.suite = after ? errSuite.parent : errSuite;

    if (this.suite) {
      // call hookUp afterEach
      this.hookUp('afterEach', (err2, errSuite2) => {
        this.suite = orig;
        // some hooks may fail even now
        if (err2) {
          return hookErr(err2, errSuite2, true);
        }
        // report error suite
        fn(errSuite);
      });
    } else {
      // there is no need calling other 'after each' hooks
      this.suite = orig;
      fn(errSuite);
    }
  };

  const next = (err, errSuite) => {
    // if we bail after first err
    if (this.failures && suite._bail) {
      return fn();
    }

    if (this._abort) {
      return fn();
    }

    if (err) {
      return hookErr(err, errSuite, true);
    }

    // next test
    test = tests.shift();

    // all done
    if (!test) {
      return fn();
    }

    // grep
    if (!this._shouldRunTest(test)) {
      return this._scheduleNextTest(next);
    }

    if (test.isPending()) {
      return this._handlePendingTest(test, next);
    }

    // execute test and hook(s)
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
 * Determine if a test should be run based on grep filter.
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
 * Schedule the next test execution with appropriate timing.
 *
 * @api private
 * @param {Function} next
 */
Runner.prototype._scheduleNextTest =