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

module.exports = Runner;

function Runner (suite, delay) {
  const self = this;
  this._globals = [];
  this._abort = false;
  this._delay = delay;
  this.suite = suite;
  this.started = false;
  this.total = suite.total();
  this.failures = 0;

  this.on('test end', () => self.checkGlobals());
  this.on('hook end', () => self.checkGlobals());

  this._defaultGrep = /.*/;
  this.grep(this._defaultGrep);
  this.globals(this.globalProps().concat(extraGlobals()));
}

Runner.immediately = global.setImmediate || process.nextTick;

inherits(Runner, EventEmitter);

Runner.prototype.grep = function (re, invert) {
  debug('grep %s', re);
  this._grep = re;
  this._invert = invert;
  this.total = this.grepTotal(this.suite);
  return this;
};

Runner.prototype.grepTotal = function (suite) {
  let total = 0;
  const { _grep, _invert } = this;

  suite.eachTest(test => {
    const match = _grep.test(test.fullTitle());
    const shouldCount = _invert ? !match : match;
    if (shouldCount) total++;
  });

  return total;
};

Runner.prototype.globalProps = function () {
  const props = Object.keys(global);

  for (const globalName of GLOBALS) {
    if (!~props.indexOf(globalName)) {
      props.push(globalName);
    }
  }

  return props;
};

Runner.prototype.globals = function (arr) {
  if (!arguments.length) {
    return this._globals;
  }
  debug('globals %j', arr);
  this._globals = this._globals.concat(arr);
  return this;
};

Runner.prototype.checkGlobals = function () {
  if (this.ignoreLeaks) return;

  const globals = this.globalProps();

  if (this.prevGlobalsLength === globals.length) return;
  this.prevGlobalsLength = globals.length;

  const leaks = filterLeaks(this._globals, globals);
  this._globals = this._globals.concat(leaks);

  if (!leaks.length) return;

  const message = leaks.length > 1
    ? 'global leaks detected: ' + leaks.join(', ')
    : 'global leak detected: ' + leaks[0];

  this.fail(this.test, new Error(message));
};

Runner.prototype.fail = function (test, err) {
  if (test.isPending()) return;

  ++this.failures;
  test.state = 'failed';

  if (!(err instanceof Error || (err && typeof err.message === 'string'))) {
    err = new Error('the ' + type(err) + ' ' + stringify(err) + ' was thrown, throw an Error :)');
  }

  try {
    err.stack = (this.fullStackTrace || !err.stack)
      ? err.stack
      : stackFilter(err.stack);
  } catch (ignored) { }

  this.emit('fail', test, err);
};

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

Runner.prototype.hook = function (name, fn) {
  const { suite, currentRunnable: savedRunnable, test } = this;
  const hooks = suite['_' + name];
  const self = this;

  function next (i) {
    const hook = hooks[i];
    if (!hook) return fn();

    self.currentRunnable = hook;
    hook.ctx.currentTest = self.test;
    self.emit('hook', hook);

    if (!hook.listeners('error').length) {
      hook.on('error', err => self.failHook(hook, err));
    }

    hook.run((err) => {
      const testError = hook.error();
      if (testError) self.fail(self.test, testError);

      if (err) {
        if (err instanceof Pending) {
          if (name === 'beforeEach' || name === 'afterEach') {
            self.test.pending = true;
          } else {
            suite.tests.forEach(test => test.pending = true);
            hook.pending = true;
          }
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

  Runner.immediately(() => next(0));
};

Runner.prototype.hooks = function (name, suites, fn) {
  const self = this;
  const origSuite = this.suite;

  function next (suite) {
    self.suite = suite;

    if (!suite) {
      self.suite = origSuite;
      return fn();
    }

    self.hook(name, (err) => {
      if (err) {
        const errSuite = self.suite;
        self.suite = origSuite;
        return fn(err, errSuite);
      }
      next(suites.pop());
    });
  }

  next(suites.pop());
};

Runner.prototype.hookUp = function (name, fn) {
  const suites = [this.suite].concat(this.parents()).reverse();
  this.hooks(name, suites, fn);
};

Runner.prototype.hookDown = function (name, fn) {
  const suites = [this.suite].concat(this.parents());
  this.hooks(name, suites, fn);
};

Runner.prototype.parents = function () {
  const suites = [];
  let suite = this.suite;

  while (suite.parent) {
    suite = suite.parent;
    suites.push(suite);
  }

  return suites;
};

Runner.prototype.runTest = function (fn) {
  const { test, forbidOnly, asyncOnly, allowUncaught } = this;

  if (!test) return;

  if (forbidOnly && hasOnly(this.parents().reverse()[0] || this.suite)) {
    fn(new Error('`.only` forbidden'));
    return;
  }

  if (asyncOnly) test.asyncOnly = true;

  test.on('error', err => this.fail(test, err));

  if (allowUncaught) {
    test.allowUncaught = true;
    return test.run(fn);
  }

  try {
    test.run(fn);
  } catch (err) {
    fn(err);
  }
};

Runner.prototype.runTests = function (suite, fn) {
  const self = this;
  const tests = suite.tests.slice();

  function hookErr (_, errSuite, after) {
    const orig = self.suite;

    self.suite = after ? errSuite.parent : errSuite;

    if (!self.suite) {
      self.suite = orig;
      return fn(errSuite);
    }

    self.hookUp('afterEach', (err2, errSuite2) => {
      self.suite = orig;
      if (err2) return hookErr(err2, errSuite2, true);
      fn(errSuite);
    });
  }

  function next (err, errSuite) {
    if (self.failures && suite._bail) return fn();
    if (self._abort) return fn();
    if (err) return hookErr(err, errSuite, true);

    const test = tests.shift();

    if (!test) return fn();

    const match = self._grep.test(test.fullTitle());
    const shouldSkip = self._invert ? !match : !match;
    if (shouldSkip) {
      if (self._grep !== self._defaultGrep) {
        Runner.immediately(next);
      } else {
        next();
      }
      return;
    }

    if (test.isPending()) {
      if (self.forbidPending) {
        test.isPending = alwaysFalse;
        self.fail(test, new Error('Pending test forbidden'));
        delete test.isPending;
      } else {
        self.emit('pending', test);
      }
      self.emit('test end', test);
      return next();
    }

    self.emit('test', self.test = test);
    self.hookDown('beforeEach', (err, errSuite) => {
      if (test.isPending()) {
        if (self.forbidPending) {
          test.isPending = alwaysFalse;
          self.fail(test, new Error('Pending test forbidden'));
          delete test.isPending;
        } else {
          self.emit('pending', test);
        }
        self.emit('test end', test);
        return next();
      }
      if (err) return hookErr(err, errSuite, false);

      self.currentRunnable = self.test;
      self.runTest((err) => {
        test = self.test;
        if (err) {
          const retry = test.currentRetry();
          if (err instanceof Pending && self.forbidPending) {
            self.fail(test, new Error('Pending test forbidden'));
          } else if (err instanceof Pending) {
            test.pending = true;
            self.emit('pending', test);
          } else if (retry < test.retries()) {
            const clonedTest = test.clone();
            clonedTest.currentRetry(retry + 1);
            tests.unshift(clonedTest);
            return self.hookUp('afterEach', next);
          } else {
            self.fail(test, err);
          }
          self.emit('test end', test);

          if (err instanceof Pending) return next();
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

Runner.prototype.runSuite = function (suite, fn) {
  let i = 0;
  const self = this;
  const total = this.grepTotal(suite);
  let afterAllHookCalled = false;

  if (!total || (self.failures && suite._bail)) return fn();

  this.emit('suite', this.suite = suite);

  function next (errSuite) {
    if (errSuite) {
      if (errSuite === suite) return done();
      return done(errSuite);
    }
    if (self._abort) return done();

    const curr = suite.suites[i++];
    if (!curr) return done();

    if (self._grep !== self._defaultGrep) {
      Runner.immediately(() => self.runSuite(curr, next));
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

      self.hook('afterAll', () => {
        self.emit('suite end', suite);
        fn(errSuite);
      });
    }
  }

  this.nextSuite = next;

  this.hook('beforeAll', (err) => {
    if (err) return done();
    self.runTests(suite, next);
  });
};

Runner.prototype.uncaught = function (err) {
  if (!err) {
    debug('uncaught undefined exception');
    err = undefinedError();
  } else {
    debug('uncaught exception %s', err === (function () { return this; }.call(err)) ? (err.message || err) : err);
  }
  err.uncaught = true;

  const runnable = this.currentRunnable || createRunnableForUncaughtException(this);
  if (!this.started) {
    this.emit('start');
    this.fail(runnable, err);
    this.emit('end');
    return;
  }

  runnable.clearTimeout();

  if (runnable.state || runnable.isPending()) return;

  this.fail(runnable, err);

  if (runnable.type === 'test') {
    this.emit('test end', runnable);
    this.hookUp('afterEach', this.next);
  } else if (runnable.type === 'hook') {
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

function createRunnableForUncaughtException (runner) {
  const runnable = new Runnable('Uncaught error outside test suite');
  runnable.parent = runner.suite;
  return runnable;
}

function cleanSuiteReferences (suite) {
  function cleanArrReferences (arr) {
    for (let i = 0; i < arr.length; i++) {
      delete arr[i].fn;
    }
  }

  if (Array.isArray(suite._beforeAll)) cleanArrReferences(suite._beforeAll);
  if (Array.isArray(suite._beforeEach)) cleanArrReferences(suite._beforeEach);
  if (Array.isArray(suite._afterAll)) cleanArrReferences(suite._afterAll);
  if (Array.isArray(suite._afterEach)) cleanArrReferences(suite._afterEach);

  for (let i = 0; i < suite.tests.length; i++) {
    delete suite.tests[i].fn;
  }
}

Runner.prototype.run = function (fn) {
  const self = this;
  const rootSuite = this.suite;

  if (hasOnly(rootSuite)) {
    filterOnly(rootSuite);
  }

  fn = fn || function () { };

  function uncaught (err) {
    self.uncaught(err);
  }

  function start () {
    self.started = true;
    self.emit('start');
    self.runSuite(rootSuite, () => {
      debug('finished running');
      self.emit('end');
    });
  }

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

Runner.prototype.abort = function () {
  debug('aborting');
  this._abort = true;
  return this;
};

function filterOnly (suite) {
  if (suite._onlyTests.length) {
    suite.tests = suite._onlyTests;
    suite.suites = [];
  } else {
    suite.tests = [];
    suite._onlySuites.forEach(onlySuite => {
      if (hasOnly(onlySuite)) filterOnly(onlySuite);
    });
    suite.suites = suite.suites.filter(childSuite => {
      return suite._onlySuites.indexOf(childSuite) !== -1 || filterOnly(childSuite);
    });
  }
  return suite.tests.length || suite.suites.length;
}

function hasOnly (suite) {
  return suite._onlyTests.length || suite._onlySuites.length || suite.suites.some(hasOnly);
}

function filterLeaks (ok, globals) {
  return globals.filter(key => {
    if (/^\d+/.test(key)) return false;
    if (global.navigator && /^getInterface/.test(key)) return false;
    if (global.navigator && /^\d+/.test(key)) return false;
    if (/^mocha-/.test(key)) return false;

    const matched = ok.some(allowed => {
      if (~allowed.indexOf('*')) return key.indexOf(allowed.split('*')[0]) === 0;
      return key === allowed;
    });

    return !matched && (!global.navigator || key !== 'onerror');
  });
}

function extraGlobals () {
  if (typeof process === 'object' && typeof process.version === 'string') {
    const parts = process.version.split('.');
    let nodeVersion = parts.reduce((acc, v) => acc << 8 | +v, 0);

    if (nodeVersion < 0x00090B) {
      return ['errno'];
    }
  }
  return [];
}