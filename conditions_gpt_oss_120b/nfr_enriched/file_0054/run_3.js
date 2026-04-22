(function(exports) {
  'use strict';

  const grunt = require('../grunt');

  // Construct-o-rama.
  function Task() {
    // Information about the currently-running task.
    this.current = {};
    // Tasks.
    this._tasks = {};
    // Task queue.
    this._queue = [];
    // Queue placeholder (for dealing with nested tasks).
    this._placeholder = { placeholder: true };
    // Queue marker (for clearing the queue programmatically).
    this._marker = { marker: true };
    // Options.
    this._options = {};
    // Is the queue running?
    this._running = false;
    // Success status of completed tasks.
    this._success = {};
  }

  // Expose the constructor function.
  exports.Task = Task;

  // Create a new Task instance.
  exports.create = function() {
    return new Task();
  };

  // If the task runner is running or an error handler is not defined, throw
  // an exception. Otherwise, call the error handler directly.
  Task.prototype._throwIfRunning = function(obj) {
    if (this._running || !this._options.error) {
      throw obj;
    } else {
      this._options.error.call({ name: null }, obj);
    }
  };

  // Register a new task.
  Task.prototype.registerTask = function(name, info, fn) {
    if (fn == null) {
      fn = info;
      info = null;
    }
    let tasks;
    if (typeof fn !== 'function') {
      tasks = this.parseArgs([fn]);
      fn = this.run.bind(this, fn);
      fn.alias = true;
      if (!info) {
        info = 'Alias for "' + tasks.join('", "') + '" task' + (tasks.length === 1 ? '' : 's') + '.';
      }
    } else if (!info) {
      info = 'Custom task.';
    }
    this._tasks[name] = { name: name, info: info, fn: fn };
    return this;
  };

  // Is the specified task an alias?
  Task.prototype.isTaskAlias = function(name) {
    return !!this._tasks[name].fn.alias;
  };

  // Has the specified task been registered?
  Task.prototype.exists = function(name) {
    return name in this._tasks;
  };

  // Rename a task.
  Task.prototype.renameTask = function(oldname, newname) {
    if (!this._tasks[oldname]) {
      throw new Error('Cannot rename missing "' + oldname + '" task.');
    }
    this._tasks[newname] = this._tasks[oldname];
    this._tasks[newname].name = newname;
    delete this._tasks[oldname];
    return this;
  };

  // Argument parsing helper.
  Task.prototype.parseArgs = function(args) {
    return Array.isArray(args[0]) ? args[0] : [].slice.call(args);
  };

  // Split a colon-delimited string into an array, unescaping any \: escaped colons.
  Task.prototype.splitArgs = function(str) {
    if (!str) { return []; }
    const placeholder = str.replace(/\\\\/g, '\uFFFF').replace(/\\:/g, '\uFFFE');
    return placeholder.split(':').map(s => s.replace(/\uFFFE/g, ':').replace(/\uFFFF/g, '\\'));
  };

  // Resolve task name and arguments.
  Task.prototype._taskPlusArgs = function(name) {
    const parts = this.splitArgs(name);
    let i = parts.length;
    let task;
    do {
      task = this._tasks[parts.slice(0, i).join(':')];
    } while (!task && --i > 0);
    const args = parts.slice(i);
    const flags = {};
    args.forEach(arg => { flags[arg] = true; });
    return { task: task, nameArgs: name, args: args, flags: flags };
  };

  // Append things to queue in the correct spot.
  Task.prototype._push = function(things) {
    const index = this._queue.indexOf(this._placeholder);
    if (index === -1) {
      this._queue = this._queue.concat(things);
    } else {
      [].splice.apply(this._queue, [index, 0].concat(things));
    }
  };

  // Enqueue a task.
  Task.prototype.run = function() {
    const things = this.parseArgs(arguments).map(this._taskPlusArgs, this);
    const fails = things.filter(thing => !thing.task);
    if (fails.length > 0) {
      this._throwIfRunning(new Error('Task "' + fails[0].nameArgs + '" not found.'));
      return this;
    }
    this._push(things);
    return this;
  };

  // Add a marker to the queue.
  Task.prototype.mark = function() {
    this._push(this._marker);
    return this;
  };

  // Create async completion handler.
  Task.prototype._createAsyncHandler = function(context, done, asyncDone) {
    let async = false;
    const complete = (result) => {
      let err = null;
      let success = true;
      if (result === false) {
        err = new Error('Task "' + context.nameArgs + '" failed.');
        success = false;
      } else if (result instanceof Error || {}.toString.call(result) === '[object Error]') {
        err = result;
        success = false;
      }
      this.current = {};
      this._success[context.nameArgs] = success;
      if (!success && this._options.error) {
        this._options.error.call({ name: context.name, nameArgs: context.nameArgs }, err);
      }
      if (asyncDone) {
        process.nextTick(() => done(err, success));
      } else {
        done(err, success);
      }
    }.bind(this);

    const asyncFn = () => {
      async = true;
      return grunt.util._.once((res) => {
        setTimeout(() => complete(res), 1);
      });
    };
    context.async = asyncFn;
    return { async, complete };
  };

  // Run a task function, handling async.
  Task.prototype.runTaskFn = function(context, fn, done, asyncDone) {
    const { async, complete } = this._createAsyncHandler(context, done, asyncDone);
    this.current = context;
    try {
      const result = fn.call(context);
      if (!async) {
        complete(result);
      }
    } catch (err) {
      complete(err);
    }
  };

  // Retrieve next task+args object, skipping placeholders/markers.
  Task.prototype._nextThing = function() {
    let thing;
    do {
      thing = this._queue.shift();
    } while (thing === this._placeholder || thing === this._marker);
    return thing;
  };

  // Build execution context for a task.
  Task.prototype._buildContext = function(thing) {
    return {
      nameArgs: thing.nameArgs,
      name: thing.task.name,
      args: thing.args,
      flags: thing.flags
    };
  };

  // Begin task queue processing.
  Task.prototype.start = function(opts) {
    const options = opts || {};
    if (this._running) { return false; }
    this._running = true;

    const processNext = () => {
      const thing = this._nextThing();
      if (!thing) {
        this._running = false;
        if (this._options.done) { this._options.done(); }
        return;
      }
      this._queue.unshift(this._placeholder);
      const context = this._buildContext(thing);
      const taskFn = () => thing.task.fn.apply(this, thing.args);
      this.runTaskFn(context, taskFn, processNext, !!options.asyncDone);
    };

    processNext();
  };

  // Clear remaining tasks from the queue.
  Task.prototype.clearQueue = function(options) {
    const opts = options || {};
    if (opts.untilMarker) {
      const idx = this._queue.indexOf(this._marker);
      if (idx !== -1) {
        this._queue.splice(0, idx + 1);
      }
    } else {
      this._queue = [];
    }
    return this;
  };

  // Ensure required tasks succeeded.
  Task.prototype.requires = function() {
    this.parseArgs(arguments).forEach(name => {
      const success = this._success[name];
      if (!success) {
        throw new Error('Required task "' + name + '" ' + (success === false ? 'failed' : 'must be run first') + '.');
      }
    });
  };

  // Override default options.
  Task.prototype.options = function(options) {
    Object.keys(options).forEach(name => {
      this._options[name] = options[name];
    });
  };
}(typeof exports === 'object' && exports || this));