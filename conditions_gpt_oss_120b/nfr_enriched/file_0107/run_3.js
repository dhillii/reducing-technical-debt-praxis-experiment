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
  this.on('test end', test => {
    self.checkGlobals(test);
  });
  this.on('hook end', hook => {
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
 * Returns the number of tests matching the grep search for the
 * given suite.
 *
 * @api public
 */
Runner.prototype.grepTotal = function (suite) {
  let total = 0;
  suite.eachTest(test => {
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
 * @api private
 */
Runner.prototype.globalProps = function () {
  const props = Object.keys(global);
  for (const name of globals) {
    if (!props.includes(name)) {
      props.push(name);
    }
  }
  return props;
};

/**
 * Allow the given `arr` of globals.
 *
 * @api public
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
  const globalsList = this.globalProps();

  if (test) {
    ok = ok.concat(test._allowedGlobals || []);
  }

  if (this.prevGlobalsLength === globalsList.length) {
    return;
  }
  this.prevGlobalsLength = globalsList.length;

  const leaks = filterLeaks(ok, globalsList);
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
 * @api private
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
 */
Runner.prototype.hook = function (name, fn) {
  const suite = this.suite;
  const hooks = suite['_' + name];
  const self = this;

  const runNextHook = (i) => {
    const hook = hooks[i];
    if (!hook) {
      return fn();
    }
    self.currentRunnable = hook;
    hook.ctx.currentTest = self.test;
    self.emit('hook', hook);

    if (!hook.listeners('error').length) {
      hook.on('error', err => {
        self.failHook(hook, err);
      });
    }

    hook.run(err => {
      const testError = hook.error();
      if (testError) {
        self.fail(self.test, testError);
      }
      if (err) {
        if (err instanceof Pending) {
          handlePendingHook(name, suite, hook);
        } else {
          self.failHook(hook, err);
          return fn(err);
        }
      }
      self.emit('hook end', hook);
      delete hook.ctx.currentTest;
      runNextHook(i + 1);
    });
  };

  Runner.immediately(() => {
    runNextHook(0);
  });
};

/**
 * Adjust hook behavior when a Pending error occurs.
 *
 * @private
 */
function handlePendingHook (name, suite, hook) {
  if (name === 'beforeEach' || name === 'afterEach') {
    this.test.pending = true;
  } else {
    suite.tests.forEach(test => {
      test.pending = true;
    });
    hook.pending = true;
  }
}

/**
 * Run hook `name` for the given array of `suites`
 * in order, and callback `fn(err, errSuite)`.
 *
 * @api private
 */
Runner.prototype.hooks = function (name, suites, fn) {
  const self = this;
  const orig = this.suite;

  const next = suite => {
    self.suite = suite;
    if (!suite) {
      self.suite = orig;
      return fn();
    }
    self.hook(name, err => {
      if (err) {
        const errSuite = self.suite;
        self.suite = orig;
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
 * @api private
 */
Runner.prototype.hookUp = function (name, fn) {
  const suites = [this.suite].concat(this.parents()).reverse();
  this.hooks(name, suites, fn);
};

/**
 * Run hooks from the bottom up.
 *
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
 * Run the current test and callback `fn(err)`.
 *
 * @api private
 */
Runner.prototype.runTest = function (fn) {
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
  test.on('error', err => {
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
 */
Runner.prototype.runTests = function (suite, fn) {
  const self = this;
  const tests = suite.tests.slice();

  const handleHookError = (err, errSuite, after) => {
    const orig = self.suite;
    self.suite = after ? errSuite.parent : errSuite;
    if (self.suite) {
      self.hookUp('afterEach', (err2, errSuite2) => {
        self.suite = orig;
        if (err2) {
          return handleHookError(err2, errSuite2, true);
        }
        fn(errSuite);
      });
    } else {
      self.suite = orig;
      fn(errSuite);
    }
  };

  const processNext = (err, errSuite) => {
    if (self.failures && suite._bail) {
      return fn();
    }
    if (self._abort) {
      return fn();
    }
    if (err) {
      return handleHookError(err, errSuite, true);
    }

    const test = tests.shift();
    if (!test) {
      return fn();
    }

    const match = self._grep.test(test.fullTitle());
    const isMatch = self._invert ? !match : match;
    if (!isMatch) {
      if (self._grep !== self._defaultGrep) {
        Runner.immediately(() => processNext());
      } else {
        processNext();
      }
      return;
    }

    if (test.isPending()) {
      handlePendingTest(test);
      return processNext();
    }

    self.emit('test', self.test = test);
    self.hookDown('beforeEach', (hookErr, hookSuite) => {
      if (test.isPending()) {
        handlePendingTest(test);
        return processNext();
      }
      if (hookErr) {
        return handleHookError(hookErr, hookSuite, false);
      }
      self.currentRunnable = self.test;
      self.runTest(runErr => {
        if (runErr) {
          handleRunError(runErr, test, tests, processNext);
        } else {
          test.state = 'passed';
          self.emit('pass', test);
          self.emit('test end', test);
          self.hookUp('afterEach', processNext);
        }
      });
    });
  };

  const handlePendingTest = test => {
    if (self.forbidPending) {
      test.isPending = alwaysFalse;
      self.fail(test, new Error('Pending test forbidden'));
      delete test.isPending;
    } else {
      self.emit('pending', test);
    }
    self.emit('test end', test);
  };

  const handleRunError = (runErr, test, testQueue, nextFn) => {
    const retry = test.currentRetry();
    if (runErr instanceof Pending && self.forbidPending) {
      self.fail(test, new Error('Pending test forbidden'));
    } else if (runErr instanceof Pending) {
      test.pending = true;
      self.emit('pending', test);
    } else if (retry < test.retries()) {
      const clonedTest = test.clone();
      clonedTest.currentRetry(retry + 1);
      testQueue.unshift(clonedTest);
      return self.hookUp('afterEach', nextFn);
    } else {
      self.fail(test, runErr);
    }
    self.emit('test end', test);
    if (runErr instanceof Pending) {
      return nextFn();
    }
    self.hookUp('afterEach', nextFn);
  };

  this.next = processNext;
  this.hookErr = handleHookError;
  processNext();
};

/**
 * Always-false helper.
 */
function alwaysFalse () {
  return false;
}

/**
 * Run the given `suite` and invoke the callback `fn()` when complete.
 *
 * @api private
 */
Runner.prototype.runSuite = function (suite, fn) {
  const self = this;
  const total = this.grepTotal(suite);
  let afterAllHookCalled = false;
  let index = 0;

  debug('run suite %s', suite.fullTitle());

  if (!total || (self.failures && suite._bail)) {
    return fn();
  }

  this.emit('suite', this.suite = suite);

  const nextSuite = errSuite => {
    if (errSuite) {
      if (errSuite === suite) {
        return done();
      }
      return done(errSuite);
    }
    if (self._abort) {
      return done();
    }
    const child = suite.suites[index++];
    if (!child) {
      return done();
    }
    if (self._grep !== self._defaultGrep) {
      Runner.immediately(() => {
        self.runSuite(child, nextSuite);
      });
    } else {
      self.runSuite(child, nextSuite);
    }
  };

  const done = errSuite => {
    self.suite = suite;
    self.nextSuite = nextSuite;
    if (afterAllHookCalled) {
      fn(errSuite);
    } else {
      afterAllHookCalled = true;
      delete self.test;
      self.hook('afterAll', () => {
        self.emit('suite end', suite);
        fn(errSuite);
      });
    }
  };

  this.nextSuite = nextSuite;

  this.hook('beforeAll', err => {
    if (err) {
      return done();
    }
    self.runTests(suite, nextSuite);
  });
};

/**
 * Handle uncaught exceptions.
 *
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

  if (runnable.type === 'test') {
    this.emit('test end', runnable);
    this.hookUp('afterEach', this.next);
    return;
  }

  if (runnable.type === 'hook') {
    const errSuite = this.suite;
    if (runnable.fullTitle().indexOf('after each') > -1) {
      return this.hookErr(err, errSuite, true);
    }
    if (runnable.fullTitle().indexOf('before each') > -1) {
      return this.hookErr(err, errSuite, false);
    }
    return this.nextSuite(errSuite);
  }

  this.emit('end');
};

/**
 * Clean up references to deferred functions and test bodies.
 *
 * @private
 */
function cleanSuiteReferences (suite) {
  const cleanArr = arr => {
    for (const item of arr) {
      delete item.fn;
    }
  };
  if (Array.isArray(suite._beforeAll)) cleanArr(suite._beforeAll);
  if (Array.isArray(suite._beforeEach)) cleanArr(suite._beforeEach);
  if (Array.isArray(suite._afterAll)) cleanArr(suite._afterAll);
  if (Array.isArray(suite._afterEach)) cleanArr(suite._afterEach);
  for (const test of suite.tests) {
    delete test.fn;
  }
}

/**
 * Run the root suite and invoke `fn(failures)` on completion.
 *
 * @api public
 */
Runner.prototype.run = function (fn) {
  const self = this;
  const rootSuite = this.suite;

  if (hasOnly(rootSuite)) {
    filterOnly(rootSuite);
  }

  fn = fn || function () {};

  const uncaught = err => {
    self.uncaught(err);
  };

  const start = () => {
    self.started = true;
    self.emit('start');
    self.runSuite(rootSuite, () => {
      debug('finished running');
      self.emit('end');
    });
  };

  debug('start');

  this.on('suite end', cleanSuiteReferences);
  this.on('end', () => {
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
 */
Runner.prototype.abort = function () {
  debug('aborting');
  this._abort = true;
  return this;
};

/**
 * Filter suites based on `isOnly` logic.
 *
 * @private
 */
function filterOnly (suite) {
  if (suite._onlyTests.length) {
    suite.tests = suite._onlyTests;
    suite.suites = [];
  } else {
    suite.tests = [];
    suite._onlySuites.forEach(onlySuite => {
      if (hasOnly(onlySuite)) {
        filterOnly(onlySuite);
      }
    });
    suite.suites = suite.suites.filter(childSuite => {
      return suite._onlySuites.includes(childSuite) || filterOnly(childSuite);
    });
  }
  return suite.tests.length || suite.suites.length;
}

/**
 * Determines whether a suite has an `only` test or suite as a descendant.
 *
 * @private
 */
function hasOnly (suite) {
  return suite._onlyTests.length || suite._onlySuites.length || suite.suites.some(hasOnly);
}

/**
 * Filter leaks with the given globals flagged as `ok`.
 *
 * @private
 */
function filterLeaks (ok, globals) {
  return globals.filter(key => {
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
    const matched = ok.filter(okItem => {
      if (okItem.includes('*')) {
        return key.indexOf(okItem.split('*')[0]) === 0;
      }
      return key === okItem;
    });
    return !matched.length && (!global.navigator || key !== 'onerror');
  });
}

/**
 * Array of globals dependent on the environment.
 *
 * @private
 */
function extraGlobals () {
  if (typeof process === 'object' && typeof process.version === 'string') {
    const parts = process.version.split('.');
    const nodeVersion = parts.reduce((a, v) => (a << 8) | v);
    if (nodeVersion < 0x00090B) {
      return ['errno'];
    }
  }
  return [];
}