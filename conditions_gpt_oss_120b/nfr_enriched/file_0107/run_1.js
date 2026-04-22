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
 * Non‑enumerable globals.
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
 * @api public
 * @param {Suite} suite Root suite
 * @param {boolean} [delay] Whether or not to delay execution of root suite
 * until ready.
 */
function Runner (suite, delay) {
  this._globals = [];
  this._abort = false;
  this._delay = delay;
  this.suite = suite;
  this.started = false;
  this.total = suite.total();
  this.failures = 0;
  this._defaultGrep = /.*/;
  this._grep = this._defaultGrep;
  this._invert = false;
  this._globals = [];
  this.on('test end', test => this.checkGlobals(test));
  this.on('hook end', hook => this.checkGlobals(hook));
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
 * Set grep pattern.
 *
 * @param {RegExp} re
 * @param {boolean} [invert]
 * @return {Runner}
 * @api public
 */
Runner.prototype.grep = function (re, invert) {
  debug('grep %s', re);
  this._grep = re;
  this._invert = invert;
  this.total = this.grepTotal(this.suite);
  return this;
};

/**
 * Count tests matching grep.
 *
 * @param {Suite} suite
 * @return {number}
 * @api public
 */
Runner.prototype.grepTotal = function (suite) {
  let total = 0;
  suite.eachTest(test => {
    let match = this._grep.test(test.fullTitle());
    if (this._invert) match = !match;
    if (match) total++;
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
  for (const name of globals) {
    if (!props.includes(name)) props.push(name);
  }
  return props;
};

/**
 * Get or set allowed globals.
 *
 * @param {Array} [arr]
 * @return {Runner|Array}
 * @api public
 */
Runner.prototype.globals = function (arr) {
  if (!arguments.length) return this._globals;
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
  if (this.ignoreLeaks) return;

  const allowed = this._globals.concat(test ? test._allowedGlobals || [] : []);
  const currentGlobals = this.globalProps();

  if (this.prevGlobalsLength === currentGlobals.length) return;
  this.prevGlobalsLength = currentGlobals.length;

  const leaks = filterLeaks(allowed, currentGlobals);
  this._globals = this._globals.concat(leaks);

  if (leaks.length) {
    const message = leaks.length > 1
      ? `global leaks detected: ${leaks.join(', ')}`
      : `global leak detected: ${leaks[0]}`;
    this.fail(test, new Error(message));
  }
};

/**
 * Fail a test.
 *
 * @param {Test} test
 * @param {Error} err
 * @api private
 */
Runner.prototype.fail = function (test, err) {
  if (test.isPending()) return;

  this.failures++;
  test.state = 'failed';

  if (!(err instanceof Error || (err && typeof err.message === 'string'))) {
    err = new Error(`the ${type(err)} ${stringify(err)} was thrown, throw an Error :)`);
  }

  try {
    err.stack = (this.fullStackTrace || !err.stack) ? err.stack : stackFilter(err.stack);
  } catch (_) {
    // ignore stack manipulation errors
  }

  this.emit('fail', test, err);
};

/**
 * Fail a hook.
 *
 * @param {Hook} hook
 * @param {Error} err
 * @api private
 */
Runner.prototype.failHook = function (hook, err) {
  if (hook.ctx && hook.ctx.currentTest) {
    hook.originalTitle = hook.originalTitle || hook.title;
    hook.title = `${hook.originalTitle} for "${hook.ctx.currentTest.title}"`;
  }
  this.fail(hook, err);
  if (this.suite.bail()) this.emit('end');
};

/**
 * Execute a series of hooks of a given name.
 *
 * @param {string} name
 * @param {Function} done
 * @api private
 */
Runner.prototype.hook = function (name, done) {
  const suite = this.suite;
  const hooks = suite[`_${name}`];
  const runNext = (i) => {
    const hook = hooks[i];
    if (!hook) return done();

    this.currentRunnable = hook;
    hook.ctx.currentTest = this.test;
    this.emit('hook', hook);

    if (!hook.listeners('error').length) {
      hook.once('error', err => this.failHook(hook, err));
    }

    hook.run(err => {
      const hookError = hook.error();
      if (hookError) this.fail(this.test, hookError);
      if (err) {
        if (err instanceof Pending) {
          handlePendingHook(this, hook, name);
        } else {
          this.failHook(hook, err);
          return done(err);
        }
      }
      this.emit('hook end', hook);
      delete hook.ctx.currentTest;
      runNext(i + 1);
    });
  };
  Runner.immediately(() => runNext(0));
};

/**
 * Handle a pending hook according to its type.
 *
 * @param {Runner} runner
 * @param {Hook} hook
 * @param {string} name
 * @api private
 */
function handlePendingHook (runner, hook, name) {
  if (name === 'beforeEach' || name === 'afterEach') {
    runner.test.pending = true;
  } else {
    runner.suite.tests.forEach(t => t.pending = true);
    hook.pending = true;
  }
}

/**
 * Run hooks for an array of suites.
 *
 * @param {string} name
 * @param {Array} suites
 * @param {Function} done
 * @api private
 */
Runner.prototype.hooks = function (name, suites, done) {
  const originalSuite = this.suite;
  const iterate = (suite) => {
    this.suite = suite;
    if (!suite) {
      this.suite = originalSuite;
      return done();
    }
    this.hook(name, err => {
      if (err) {
        const errSuite = this.suite;
        this.suite = originalSuite;
        return done(err, errSuite);
      }
      iterate(suites.pop());
    });
  };
  iterate(suites.pop());
};

/**
 * Run hooks from the top down.
 *
 * @param {string} name
 * @param {Function} done
 * @api private
 */
Runner.prototype.hookUp = function (name, done) {
  const suites = [this.suite].concat(this.parents()).reverse();
  this.hooks(name, suites, done);
};

/**
 * Run hooks from the bottom up.
 *
 * @param {string} name
 * @param {Function} done
 * @api private
 */
Runner.prototype.hookDown = function (name, done) {
  const suites = [this.suite].concat(this.parents());
  this.hooks(name, suites, done);
};

/**
 * Return an array of parent suites.
 *
 * @return {Array}
 * @api private
 */
Runner.prototype.parents = function () {
  const suites = [];
  let suite = this.suite;
  while (suite.parent) {
    suite = suite.parent;
    suites.push(suite);
  }
  return suites;
};

/**
 * Run a single test.
 *
 * @param {Function} done
 * @api private
 */
Runner.prototype.runTest = function (done) {
  const test = this.test;
  if (!test) return;

  if (this.forbidOnly && hasOnly(this.parents().reverse()[0] || this.suite)) {
    return done(new Error('`.only` forbidden'));
  }

  if (this.asyncOnly) test.asyncOnly = true;

  test.once('error', err => this.fail(test, err));

  if (this.allowUncaught) {
    test.allowUncaught = true;
    return test.run(done);
  }

  try {
    test.run(done);
  } catch (err) {
    done(err);
  }
};

/**
 * Determine if a test matches the grep pattern.
 *
 * @param {Test} test
 * @return {boolean}
 * @api private
 */
function matchesGrep (runner, test) {
  let match = runner._grep.test(test.fullTitle());
  if (runner._invert) match = !match;
  return match;
}

/**
 * Process a pending test according to configuration.
 *
 * @param {Runner} runner
 * @param {Test} test
 * @param {Function} next
 * @api private
 */
function handlePendingTest (runner, test, next) {
  if (runner.forbidPending) {
    test.isPending = alwaysFalse;
    runner.fail(test, new Error('Pending test forbidden'));
    delete test.isPending;
  } else {
    runner.emit('pending', test);
  }
  runner.emit('test end', test);
  next();
}

/**
 * Run all tests in a suite.
 *
 * @param {Suite} suite
 * @param {Function} done
 * @api private
 */
Runner.prototype.runTests = function (suite, done) {
  const tests = suite.tests.slice();
  const runner = this;

  const hookError = (err, errSuite, after) => {
    const original = runner.suite;
    runner.suite = after ? errSuite.parent : errSuite;
    if (runner.suite) {
      runner.hookUp('afterEach', (err2, errSuite2) => {
        runner.suite = original;
        if (err2) return hookError(err2, errSuite2, true);
        done(errSuite);
      });
    } else {
      runner.suite = original;
      done(errSuite);
    }
  };

  const next = (err, errSuite) => {
    if (runner.failures && suite._bail) return done();
    if (runner._abort) return done();
    if (err) return hookError(err, errSuite, true);

    const test = tests.shift();
    if (!test) return done();

    if (!matchesGrep(runner, test)) {
      if (runner._grep !== runner._defaultGrep) {
        return Runner.immediately(() => next());
      }
      return next();
    }

    if (test.isPending()) return handlePendingTest(runner, test, next);

    runner.emit('test', runner.test = test);
    runner.hookDown('beforeEach', (hookErr, hookSuite) => {
      if (test.isPending()) return handlePendingTest(runner, test, next);
      if (hookErr) return hookError(hookErr, hookSuite, false);

      runner.currentRunnable = runner.test;
      runner.runTest(err => {
        const currentTest = runner.test;
        if (err) {
          processTestError(runner, currentTest, err, tests, next);
          return;
        }
        currentTest.state = 'passed';
        runner.emit('pass', currentTest);
        runner.emit('test end', currentTest);
        runner.hookUp('afterEach', next);
      });
    });
  };

  this.next = next;
  this.hookErr = hookError;
  next();
};

/**
 * Process errors that occurred during a test run.
 *
 * @param {Runner} runner
 * @param {Test} test
 * @param {Error} err
 * @param {Array} pendingTests
 * @param {Function} next
 * @api private
 */
function processTestError (runner, test, err, pendingTests, next) {
  const retry = test.currentRetry();
  if (err instanceof Pending && runner.forbidPending) {
    runner.fail(test, new Error('Pending test forbidden'));
  } else if (err instanceof Pending) {
    test.pending = true;
    runner.emit('pending', test);
  } else if (retry < test.retries()) {
    const cloned = test.clone();
    cloned.currentRetry(retry + 1);
    pendingTests.unshift(cloned);
    return runner.hookUp('afterEach', next);
  } else {
    runner.fail(test, err);
  }
  runner.emit('test end', test);
  if (err instanceof Pending) return next();
  runner.hookUp('afterEach', next);
}

/**
 * Run a suite.
 *
 * @param {Suite} suite
 * @param {Function} done
 * @api private
 */
Runner.prototype.runSuite = function (suite, done) {
  const runner = this;
  const total = this.grepTotal(suite);
  let afterAllHookCalled = false;
  let index = 0;

  debug('run suite %s', suite.fullTitle());

  if (!total || (runner.failures && suite._bail)) return done();

  this.emit('suite', this.suite = suite);

  const nextSuite = (errSuite) => {
    if (errSuite) {
      if (errSuite === suite) return finish();
      return finish(errSuite);
    }
    if (runner._abort) return finish();

    const child = suite.suites[index++];
    if (!child) return finish();

    const runChild = () => runner.runSuite(child, nextSuite);
    if (runner._grep !== runner._defaultGrep) {
      Runner.immediately(runChild);
    } else {
      runChild();
    }
  };

  const finish = (errSuite) => {
    runner.suite = suite;
    runner.nextSuite = nextSuite;
    if (afterAllHookCalled) {
      return done(errSuite);
    }
    afterAllHookCalled = true;
    delete runner.test;
    runner.hook('afterAll', () => {
      runner.emit('suite end', suite);
      done(errSuite);
    });
  };

  this.nextSuite = nextSuite;

  this.hook('beforeAll', err => {
    if (err) return finish();
    runner.runTests(suite, nextSuite);
  });
};

/**
 * Handle uncaught exceptions.
 *
 * @param {Error} err
 * @api private
 */
Runner.prototype.uncaught = function (err) {
  if (err) {
    debug('uncaught exception %s', err === (function () { return this; }.call(err)) ? (err.message || err) : err);
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

  if (runnable.state || runnable.isPending()) return;
  this.fail(runnable, err);

  if (runnable.type === 'test') {
    this.emit('test end', runnable);
    this.hookUp('afterEach', this.next);
    return;
  }

  if (runnable.type === 'hook') {
    const errSuite = this.suite;
    if (runnable.fullTitle().includes('after each')) {
      return this.hookErr(err, errSuite, true);
    }
    if (runnable.fullTitle().includes('before each')) {
      return this.hookErr(err, errSuite, false);
    }
    return this.nextSuite(errSuite);
  }

  this.emit('end');
};

/**
 * Clean up suite references to avoid memory leaks.
 *
 * @param {Suite} suite
 * @api private
 */
function cleanSuiteReferences (suite) {
  const clean = arr => {
    for (const hook of arr) delete hook.fn;
  };
  if (Array.isArray(suite._beforeAll)) clean(suite._beforeAll);
  if (Array.isArray(suite._beforeEach)) clean(suite._beforeEach);
  if (Array.isArray(suite._afterAll)) clean(suite._afterAll);
  if (Array.isArray(suite._afterEach)) clean(suite._afterEach);
  for (const test of suite.tests) delete test.fn;
}

/**
 * Run the root suite.
 *
 * @param {Function} [fn]
 * @return {Runner}
 * @api public
 */
Runner.prototype.run = function (fn) {
  const runner = this;
  const root = this.suite;

  if (hasOnly(root)) filterOnly(root);

  fn = fn || (() => {});

  const uncaught = err => runner.uncaught(err);
  const start = () => {
    runner.started = true;
    runner.emit('start');
    runner.runSuite(root, () => {
      debug('finished running');
      runner.emit('end');
    });
  };

  debug('start');
  this.on('suite end', cleanSuiteReferences);
  this.on('end', () => {
    debug('end');
    process.removeListener('uncaughtException', uncaught);
    fn(runner.failures);
  });
  process.on('uncaughtException', uncaught);

  if (this._delay) {
    this.emit('waiting', root);
    root.once('run', start);
  } else {
    start();
  }

  return this;
};

/**
 * Abort execution.
 *
 * @return {Runner}
 * @api public
 */
Runner.prototype.abort = function () {
  debug('aborting');
  this._abort = true;
  return this;
};

/**
 * Filter suites based on `only` logic.
 *
 * @param {Suite} suite
 * @return {boolean}
 * @api private
 */
function filterOnly (suite) {
  if (suite._onlyTests.length) {
    suite.tests = suite._onlyTests;
    suite.suites = [];
  } else {
    suite.tests = [];
    suite._onlySuites.forEach(onlySuite => {
      if (hasOnly(onlySuite)) filterOnly(onlySuite);
    });
    suite.suites = suite.suites.filter(child => suite._onlySuites.includes(child) || filterOnly(child));
  }
  return suite.tests.length || suite.suites.length;
}

/**
 * Determine if a suite contains `only` tests or suites.
 *
 * @param {Suite} suite
 * @return {boolean}
 * @api private
 */
function hasOnly (suite) {
  return suite._onlyTests.length || suite._onlySuites.length || suite.suites.some(hasOnly);
}

/**
 * Filter global leaks.
 *
 * @param {Array} ok
 * @param {Array} globals
 * @return {Array}
 * @api private
 */
function filterLeaks (ok, globals) {
  return globals.filter(key => {
    if (/^\d+/.test(key)) return false;
    if (global.navigator && (/^getInterface/).test(key)) return false;
    if (global.navigator && (/^\d+/).test(key)) return false;
    if (/^mocha-/.test(key)) return false;

    const matched = ok.filter(okItem => {
      if (okItem.includes('*')) {
        return key.startsWith(okItem.split('*')[0]);
      }
      return key === okItem;
    });
    return !matched.length && (!global.navigator || key !== 'onerror');
  });
}

/**
 * Return environment‑specific globals.
 *
 * @return {Array}
 * @api private
 */
function extraGlobals () {
  if (typeof process === 'object' && typeof process.version === 'string') {
    const parts = process.version.split('.');
    const nodeVersion = parts.reduce((a, v) => (a << 8) | v);
    if (nodeVersion < 0x00090B) return ['errno'];
  }
  return [];
}

/**
 * Helper that always returns false.
 *
 * @return {boolean}
 */
function alwaysFalse () {
  return false;
}