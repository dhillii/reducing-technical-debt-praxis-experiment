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
    this._tasks[name] = { name, info, fn };
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

  // Split a colon-delimited string into an array, handling escaped colons.
  Task.prototype.splitArgs = function(str) {
    if (!str) { return []; }
    const placeholder = str.replace(/\\\\/g, '\uFFFF').replace(/\\:/g, '\uFFFE');
    return placeholder.split(':').map(s => s.replace(/\uFFFE/g, ':').replace(/\uFFFF/g, '\\'));
  };

  // Resolve task name and arguments.
  Task.prototype._taskPlusArgs = function(name) {
    const parts = this.splitArgs(name);
    const { task, i } = this._findTask(parts);
    const args = parts.slice(i);
    const flags = this._argsToFlags(args);
    return { task, nameArgs: name, args, flags };
  };

  // Find the most specific registered task for given parts.
  Task.prototype._findTask = function(parts) {
    let i = parts.length;
    let task = null;
    while (i > 0) {
      const candidate = this._tasks[parts.slice(0, i).join(':')];
      if (candidate) {
        task = candidate;
        break;
      }
      i--;
    }
    return { task, i };
  };

  // Convert argument list to flag map.
  Task.prototype._argsToFlags = function(args) {
    const flags = {};
    args.forEach(arg => { flags[arg] = true; });
    return flags;
  };

  // Append items to queue respecting placeholder.
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

  // Run a task function, handling async.
  Task.prototype.runTaskFn = function(context, fn, done, asyncDone) {
    let async = false;

    const complete = (success) => {
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
        this._options.error.call({ name: context.name, nameArgs: context.nameArgs }, err);
      }
      if (asyncDone) {
        process.nextTick(() => done(err, success));
      } else {
        done(err, success);
      }
    };

    context.async = () => {
      async = true;
      return grunt.util._.once((success) => {
        setTimeout(() => { complete(success); }, 1);
      });
    };

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

  // Begin task queue processing.
  Task.prototype.start = function(opts) {
    const options = opts || {};
    if (this._running) { return false; }
    this._running = true;
    const next = () => this._processNextTask(options);
    next();
  };

  // Process the next task in the queue.
  Task.prototype._processNextTask = function(options) {
    const thing = this._dequeueNext();
    if (!thing) {
      this._running = false;
      if (this._options.done) { this._options.done(); }
      return;
    }
    this._queue.unshift(this._placeholder);
    const context = this._buildContext(thing);
    this.runTaskFn(context, () => thing.task.fn.apply(this, this.args), () => this._processNextTask(options), !!options.asyncDone);
  };

  // Dequeue next non-placeholder/marker task.
  Task.prototype._dequeueNext = function() {
    let item;
    do {
      item = this._queue.shift();
    } while (item === this._placeholder || item === this._marker);
    return item;
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