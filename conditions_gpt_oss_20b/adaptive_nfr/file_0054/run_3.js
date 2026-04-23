(function(exports) {

  'use strict';

  const grunt = require('../grunt');

  /**
   * Task constructor.
   */
  function Task() {
    this.current = {};
    this._tasks = {};
    this._queue = [];
    this._placeholder = {placeholder: true};
    this._marker = {marker: true};
    this._options = {};
    this._running = false;
    this._success = {};
  }

  exports.Task = Task;

  exports.create = function() {
    return new Task();
  };

  /**
   * Throw if the task runner is running or no error handler is defined.
   */
  Task.prototype._throwIfRunning = function(obj) {
    if (this._running || !this._options.error) {
      throw obj;
    } else {
      this._options.error.call({name: null}, obj);
    }
  };

  /**
   * Register a new task.
   */
  Task.prototype.registerTask = function(name, info, fn) {
    if (fn == null) {
      fn = info;
      info = null;
    }
    if (typeof fn !== 'function') {
      const tasks = this.parseArgs([fn]);
      fn = this.run.bind(this, fn);
      fn.alias = true;
      if (!info) {
        info = 'Alias for "' + tasks.join('", "') + '" task' +
          (tasks.length === 1 ? '' : 's') + '.';
      }
    } else if (!info) {
      info = 'Custom task.';
    }
    this._tasks[name] = {name: name, info: info, fn: fn};
    return this;
  };

  Task.prototype.isTaskAlias = function(name) {
    return !!this._tasks[name].fn.alias;
  };

  Task.prototype.exists = function(name) {
    return name in this._tasks;
  };

  Task.prototype.renameTask = function(oldname, newname) {
    if (!this._tasks[oldname]) {
      throw new Error('Cannot rename missing "' + oldname + '" task.');
    }
    this._tasks[newname] = this._tasks[oldname];
    this._tasks[newname].name = newname;
    delete this._tasks[oldname];
    return this;
  };

  /**
   * Parse arguments into an array.
   */
  Task.prototype.parseArgs = function(args) {
    return Array.isArray(args[0]) ? args[0] : [].slice.call(args);
  };

  /**
   * Split a colon-delimited string into an array, unescaping escaped colons.
   */
  Task.prototype.splitArgs = function(str) {
    if (!str) { return []; }
    str = str.replace(/\\\\/g, '\uFFFF').replace(/\\:/g, '\uFFFE');
    return str.split(':').map(function(s) {
      return s.replace(/\uFFFE/g, ':').replace(/\uFFFF/g, '\\');
    });
  };

  /**
   * Find task and arguments for a given name.
   */
  Task.prototype._taskPlusArgs = function(name) {
    const parts = this.splitArgs(name);
    let i = parts.length;
    let task;
    do {
      task = this._tasks[parts.slice(0, i).join(':')];
    } while (!task && --i > 0);
    const args = parts.slice(i);
    const flags = this._buildFlags(args);
    return {task, nameArgs: name, args, flags};
  };

  /**
   * Build flags object from args array.
   */
  Task.prototype._buildFlags = function(args) {
    const flags = {};
    args.forEach(function(arg) { flags[arg] = true; });
    return flags;
  };

  /**
   * Append things to queue in the correct spot.
   */
  Task.prototype._push = function(things) {
    const index = this._queue.indexOf(this._placeholder);
    if (index === -1) {
      this._queue = this._queue.concat(things);
    } else {
      [].splice.apply(this._queue, [index, 0].concat(things));
    }
  };

  /**
   * Enqueue a task.
   */
  Task.prototype.run = function() {
    const things = this.parseArgs(arguments).map(this._taskPlusArgs, this);
    const fails = things.filter(function(thing) { return !thing.task; });
    if (fails.length > 0) {
      this._throwIfRunning(new Error('Task "' + fails[0].nameArgs + '" not found.'));
      return this;
    }
    this._push(things);
    return this;
  };

  Task.prototype.mark = function() {
    this._push(this._marker);
    return this;
  };

  /**
   * Run a task function, handling this.async / return value.
   */
  Task.prototype.runTaskFn = function(context, fn, done, asyncDone) {
    let async = false;
    const complete = this._createComplete(context, done, asyncDone);
    const asyncFn = this._createAsync(context, complete);
    context.async = asyncFn;
    this.current = context;
    try {
      const success = fn.call(context);
      if (!async) {
        complete(success);
      }
    } catch (err) {
      complete(err);
    }
  };

  /**
   * Create the completion callback for a task.
   */
  Task.prototype._createComplete = function(context, done, asyncDone) {
    return function(success) {
      let err = null;
      if (success === false) {
        err = new Error('Task "' + context.nameArgs + '" failed.');
      } else if (success instanceof Error || {}.toString.call(success) === '[object Error]') {
        err = success;
        success = false;
      } else {
        success = true;
      }
      this.current = {};
      this._success[context.nameArgs] = success;
      if (!success && this._options.error) {
        this._options.error.call({name: context.name, nameArgs: context.nameArgs}, err);
      }
      if (asyncDone) {
        process.nextTick(function() {
          done(err, success);
        });
      } else {
        done(err, success);
      }
    }.bind(this);
  };

  /**
   * Create the async function for a task.
   */
  Task.prototype._createAsync = function(context, complete) {
    return function() {
      async = true;
      return grunt.util._.once(function(success) {
        setTimeout(function() { complete(success); }, 1);
      });
    };
  };

  /**
   * Begin task queue processing.
   */
  Task.prototype.start = function(opts) {
    opts = opts || {};
    if (this._running) { return false; }
    const nextTask = this._createNextTask(opts);
    this._running = true;
    nextTask();
  };

  /**
   * Create the nextTask function for start().
   */
  Task.prototype._createNextTask = function(opts) {
    const self = this;
    return function nextTask() {
      let thing;
      do {
        thing = self._queue.shift();
      } while (thing === self._placeholder || thing === self._marker);
      if (!thing) {
        self._running = false;
        if (self._options.done) {
          self._options.done();
        }
        return;
      }
      self._queue.unshift(self._placeholder);
      const context = {
        nameArgs: thing.nameArgs,
        name: thing.task.name,
        args: thing.args,
        flags: thing.flags
      };
      self.runTaskFn(context, function() {
        return thing.task.fn.apply(this, this.args);
      }, nextTask, !!opts.asyncDone);
    };
  };

  Task.prototype.clearQueue = function(options) {
    options = options || {};
    if (options.untilMarker) {
      this._queue.splice(0, this._queue.indexOf(this._marker) + 1);
    } else {
      this._queue = [];
    }
    return this;
  };

  Task.prototype.requires = function() {
    this.parseArgs(arguments).forEach(function(name) {
      const success = this._success[name];
      if (!success) {
        throw new Error('Required task "' + name +
          '" ' + (success === false ? 'failed' : 'must be run first') + '.');
      }
    }.bind(this));
  };

  Task.prototype.options = function(options) {
    Object.keys(options).forEach(function(name) {
      this._options[name] = options[name];
    }.bind(this));
  };

}(typeof exports === 'object' && exports || this));