```javascript
'use strict';

var EventEmitter = require('events').EventEmitter;
var Pending = require('./pending');
var debug = require('debug')('mocha:runnable');
var milliseconds = require('./ms');
var utils = require('./utils');

var Date = global.Date;
var setTimeout = global.setTimeout;
var setInterval = global.setInterval;
var clearTimeout = global.clearTimeout;
var clearInterval = global.clearInterval;

var toString = Object.prototype.toString;

module.exports = Runnable;

function Runnable(title, fn) {
  this.title = title;
  this.fn = fn;
  this.body = (fn || '').toString();
  this.async = fn && fn.length;
  this.sync = !this.async;
  this._timeout = 2000;
  this._slow = 75;
  this._enableTimeouts = true;
  this.timedOut = false;
  this._trace = new Error('done() called multiple times');
  this._retries = -1;
  this._currentRetry = 0;
  this.pending = false;
}

utils.inherits(Runnable, EventEmitter);

Runnable.prototype.timeout = function(ms) {
  if (!arguments.length) {
    return this._timeout;
  }
  if (ms === 0 || ms > Math.pow(2, 31)) {
    this._enableTimeouts = false;
  }
  if (typeof ms === 'string') {
    ms = milliseconds(ms);
  }
  debug('timeout %d', ms);
  this._timeout = ms;
  if (this.timer) {
    this.resetTimeout();
  }
  return this;
};

Runnable.prototype.slow = function(ms) {
  if (!arguments.length || typeof ms === 'undefined') {
    return this._slow;
  }
  if (typeof ms === 'string') {
    ms = milliseconds(ms);
  }
  debug('timeout %d', ms);
  this._slow = ms;
  return this;
};

Runnable.prototype.enableTimeouts = function(enabled) {
  if (!arguments.length) {
    return this._enableTimeouts;
  }
  debug('enableTimeouts %s', enabled);
  this._enableTimeouts = enabled;
  return this;
};

Runnable.prototype.skip = function() {
  throw new Pending('sync skip');
};

Runnable.prototype.isPending = function() {
  return this.pending || (this.parent && this.parent.isPending());
};

Runnable.prototype.retries = function(n) {
  if (!arguments.length) {
    return this._retries;
  }
  this._retries = n;
  return this;
};

Runnable.prototype.currentRetry = function(n) {
  if (!arguments.length) {
    return this._currentRetry;
  }
  this._currentRetry = n;
  return this;
};

Runnable.prototype.fullTitle = function() {
  return this.titlePath().join(' ');
};

Runnable.prototype.titlePath = function() {
  return this.parent.titlePath().concat([this.title]);
};

Runnable.prototype.clearTimeout = function() {
  clearTimeout(this.timer);
};

Runnable.prototype.inspect = function() {
  return JSON.stringify(this, function(key, val) {
    if (key[0] === '_') {
      return;
    }
    if (key === 'parent') {
      return '#<Suite>';
    }
    if (key === 'ctx') {
      return '#<Context>';
    }
    return val;
  }, 2);
};

Runnable.prototype.resetTimeout = function() {
  var self = this;
  var ms = this.timeout() || 1e9;

  if (!this._enableTimeouts) {
    return;
  }
  this.clearTimeout();
  this.timer = setTimeout(function() {
    if (!self._enableTimeouts) {
      return;
    }
    self.callback(new Error('Timeout of ' + ms +
      'ms exceeded. For async tests and hooks, ensure "done()" is called; if returning a Promise, ensure it resolves.'));
    self.timedOut = true;
  }, ms);
};

Runnable.prototype.globals = function(globals) {
  if (!arguments.length) {
    return this._allowedGlobals;
  }
  this._allowedGlobals = globals;
  return this;
};

Runnable.prototype.run = function(fn) {
  var self = this;
  var start = new Date();
  var ctx = this.ctx;
  var finished;
  var emitted;

  if (ctx && ctx.runnable) {
    ctx.runnable(this);
  }

  function multiple(err) {
    if (emitted) {
      return;
    }
    emitted = true;
    self.emit('error', err || new Error('done() called multiple times; stacktrace may be inaccurate'));
  }

  function done(err) {
    var ms = self.timeout();
    if (self.timedOut) {
      return;
    }
    if (finished) {
      return multiple(err || self._trace);
    }

    self.clearTimeout();
    self.duration = new Date() - start;
    finished = true;
    if (!err && self.duration > ms && self._enableTimeouts) {
      err = new Error('Timeout of ' + ms +
        'ms exceeded. For async tests and hooks, ensure "done()" is called; if returning a Promise, ensure it resolves.');
    }
    fn(err);
  }

  this.callback = done;

  if (this.async) {
    return self._runAsync(done, ctx);
  }

  return self._runSync(done, ctx);

  function callFn(fn) {
    var result = fn.call(ctx);
    if (result && typeof result.then === 'function') {
      self.resetTimeout();
      result
        .then(function() {
          done();
          return null;
        },
        function(reason) {
          done(reason || new Error('Promise rejected with no or falsy reason'));
        });
    } else {
      if (self.asyncOnly) {
        return done(new Error('--async-only option in use without declaring `done()` or returning a promise'));
      }
      done();
    }
  }

  function callFnAsync(fn) {
    var result = fn.call(ctx, function(err) {
      if (err instanceof Error || toString.call(err) === '[object Error]') {
        return done(err);
      }
      if (err) {
        if (Object.prototype.toString.call(err) === '[object Object]') {
          return done(new Error('done() invoked with non-Error: ' +
            JSON.stringify(err)));
        }
        return done(new Error('done() invoked with non-Error: ' + err));
      }
      if (result && utils.isPromise(result)) {
        return done(new Error('Resolution method is overspecified. Specify a callback *or* return a Promise; not both.'));
      }

      done();
    });
  }
};

Runnable.prototype._runAsync = function(done, ctx) {
  var self = this;
  var emitted = false;

  this.resetTimeout();

  this.skip = function asyncSkip() {
    done(new Pending('async skip call'));
    throw new Pending('async skip; aborting execution');
  };

  if (this.allowUncaught) {
    return this._callFnAsync(done, ctx);
  }

  try {
    this._callFnAsync(done, ctx);
  } catch (err) {
    emitted = true;
    done(utils.getError(err));
  }
};

Runnable.prototype._runSync = function(done, ctx) {
  var self = this;
  var emitted = false;

  if (this.allowUncaught) {
    if (this.isPending()) {
      done();
    } else {
      this._callFn(done, ctx);
    }
    return;
  }

  try {
    if (this.isPending()) {
      done();
    } else {
      this._callFn(done, ctx);
    }
  } catch (err) {
    emitted = true;
    done(utils.getError(err));
  }
};

Runnable.prototype._callFn = function(done, ctx) {
  var self = this;
  var result = this.fn.call(ctx);
  if (result && typeof result.then === 'function') {
    self.resetTimeout();
    result
      .then(function() {
        done();
        return null;
      },
      function(reason) {
        done(reason || new Error('Promise rejected with no or falsy reason'));
      });
  } else {
    if (self.asyncOnly) {
      return done(new Error('--async-only option in use without declaring `done()` or returning a promise'));
    }
    done();
  }
};

Runnable.prototype._callFnAsync = function(done, ctx) {
  var self = this;
  var result = this.fn.call(ctx, function(err) {
    if (err instanceof Error || toString.call(err) === '[object Error]') {
      return done(err);
    }
    if (err) {
      if (Object.prototype.toString.call(err) === '[object Object]') {
        return done(new Error('done() invoked with non-Error: ' +
          JSON.stringify(err)));
      }
      return done(new Error('done() invoked with non-Error: ' + err));
    }
    if (result && utils.isPromise(result)) {
      return done(new Error('Resolution method is overspecified. Specify a callback *or* return a Promise; not both.'));
    }

    done();
  });
};
```