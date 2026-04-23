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
  exports.create = function () {
    return new Task();
  };

  // If the task runner is running or an error handler is not defined, throw
  // an exception. Otherwise, call the error handler directly.
  Task.prototype._throwIfRunning = function (obj) {
    if (this._running || !this._options.error) {
      // Throw an exception that the task runner will catch.
      throw obj;
    } else {
      // Not inside the task runner. Call the error handler and abort.
      this._options.error.call({ name: null }, obj);
    }
  };

  /**
   * Handle alias task registration.
   * @param {string|function} fn - Original fn argument.
   * @param {string|null} info - Optional info string.
   * @returns {{fn: function, info: string}} Normalized task function and info.
   */
  Task.prototype._prepareAlias = function (fn, info) {
    const tasks = this.parseArgs([fn]);
    const aliasFn = this.run.bind(this, fn);
    aliasFn.alias = true;
    const generatedInfo = info || `Alias for "${tasks.join('", "')}" task${tasks.length === 1 ? '' : 's'}.`;
    return { fn: aliasFn, info: generatedInfo };
  };

  // Register a new task.
  Task.prototype.registerTask = function (name, info, fn) {
    // If optional "info" string is omitted, shuffle arguments a bit.
    if (fn == null) {
      fn = info;
      info = null;
    }
    // String or array of strings was passed instead of fn.
    if (typeof fn !== 'function') {
      const { fn: aliasFn, info: aliasInfo } = this._prepareAlias(fn, info);
      fn = aliasFn;
      info = aliasInfo;
    } else if (!info) {
      info = 'Custom task.';
    }
    // Add task into cache.
    this._tasks[name] = { name: name, info: info, fn: fn };
    // Make chainable!
    return this;
  };

  // Is the specified task an alias?
  Task.prototype.isTaskAlias = function (name) {
    return !!this._tasks[name].fn.alias;
  };

  // Has the specified task been registered?
  Task.prototype.exists = function (name) {
    return name in this._tasks;
  };

  // Rename a task. This might be useful if you want to override the default
  // behavior of a task, while retaining the old name. This is a billion times
  // easier to implement than some kind of in-task "super" functionality.
  Task.prototype.renameTask = function (oldname, newname) {
    if (!this._tasks[oldname]) {
      throw new Error(`Cannot rename missing "${oldname}" task.`);
    }
    // Rename task.
    this._tasks[newname] = this._tasks[oldname];
    // Update name property of task.
    this._tasks[newname].name = newname;
    // Remove old name.
    delete this._tasks[oldname];
    // Make chainable!
    return this;
  };

  // Argument parsing helper. Supports these signatures:
  //  fn('foo')                 // ['foo']
  //  fn('foo', 'bar', 'baz')   // ['foo', 'bar', 'baz']
  //  fn(['foo', 'bar', 'baz']) // ['foo', 'bar', 'baz']
  Task.prototype.parseArgs = function (args) {
    // Return the first argument if it's an array, otherwise return an array
    // of all arguments.
    return Array.isArray(args[0]) ? args[0] : [].slice.call(args);
  };

  // Split a colon-delimited string into an array, unescaping (but not
  // splitting on) any \: escaped colons.
  Task.prototype.splitArgs = function (str) {
    if (!str) {
      return [];
    }
    // Store placeholder for \\ followed by \:
    const escaped = str.replace(/\\\\/g, '\uFFFF').replace(/\\:/g, '\uFFFE');
    // Split on :
    return escaped.split(':').map(function (s) {
      // Restore place-held : followed by \\
      return s.replace(/\uFFFE/g, ':').replace(/\uFFFF/g, '\\');
    });
  };

  /**
   * Build a flags object from an array of arguments.
   * @param {string[]} args
   * @returns {Object<string,boolean>}
   */
  Task.prototype._buildFlags = function (args) {
    const flags = {};
    args.forEach(function (arg) {
      flags[arg] = true;
    });
    return flags;
  };

  // Given a task name, determine which actual task will be called, and what
  // arguments will be passed into the task callback. "foo" -> task "foo", no
  // args. "foo:bar:baz" -> task "foo:bar:baz" with no args (if "foo:bar:baz"
  // task exists), otherwise task "foo:bar" with arg "baz" (if "foo:bar" task
  // exists), otherwise task "foo" with args "bar" and "baz".
  Task.prototype._taskPlusArgs = function (name) {
    // Get task name / argument parts.
    const parts = this.splitArgs(name);
    // Start from the end, not the beginning!
    let i = parts.length;
    let task;
    do {
      // Get a task.
      task = this._tasks[parts.slice(0, i).join(':')];
    } while (!task && --i > 0);
    // Just the args.
    const args = parts.slice(i);
    // The task to run and the args to run it with.
    return {
      task: task,
      nameArgs: name,
      args: args,
      flags: this._buildFlags(args)
    };
  };

  // Append things to queue in the correct spot.
  Task.prototype._push = function (things) {
    // Get current placeholder index.
    const index = this._queue.indexOf(this._placeholder);
    if (index === -1) {
      // No placeholder, add task+args objects to end of queue.
      this._queue = this._queue.concat(things);
    } else {
      // Placeholder exists, add task+args objects just before placeholder.
      [].splice.apply(this._queue, [index, 0].concat(things));
    }
  };

  /**
   * Validate that all tasks exist, throwing if any are missing.
   * @param {Array} things
   */
  Task.prototype._validateTasks = function (things) {
    const missing = things.filter(function (thing) {
      return !thing.task;
    });
    if (missing.length > 0) {
      this._throwIfRunning(new Error(`Task "${missing[0].nameArgs}" not found.`));
    }
  };

  // Enqueue a task.
  Task.prototype.run = function () {
    // Parse arguments into an array, returning an array of task+args objects.
    const things = this.parseArgs(arguments).map(this._taskPlusArgs, this);
    // Throw an exception if any tasks weren't found.
    this._validateTasks(things);
    // Append things to queue in the correct spot.
    this._push(things);
    // Make chainable!
    return this;
  };

  // Add a marker to the queue to facilitate clearing it programmatically.
  Task.prototype.mark = function () {
    this._push(this._marker);
    // Make chainable!
    return this;
  };

  /**
   * Complete a task, handling success/error propagation.
   * @param {Object} context
   * @param {*} result
   * @param {boolean} asyncDone
   * @param {function} done
   */
  Task.prototype._complete = function (context, result, asyncDone, done) {
    let err = null;
    let success;
    if (result === false) {
      err = new Error(`Task "${context.nameArgs}" failed.`);
      success = false;
    } else if (result instanceof Error || {}.toString.call(result) === '[object Error]') {
      err = result;
      success = false;
    } else {
      success = true;
    }
    // Reset current task.
    this.current = {};
    this._success[context.nameArgs] = success;
    if (!success && this._options.error) {
      this._options.error.call({ name: context.name, nameArgs: context.nameArgs }, err);
    }
    if (asyncDone) {
      process.nextTick(function () {
        done(err, success);
      });
    } else {
      done(err, success);
    }
  };

  // Run a task function, handling this.async / return value.
  Task.prototype.runTaskFn = function (context, fn, done, asyncDone) {
    // Async flag.
    let async = false;

    // When called, sets the async flag and returns a function that can
    // be used to continue processing the queue.
    context.async = function () {
      async = true;
      // The returned function should execute asynchronously in case
      // someone tries to do this.async()(); inside a task (WTF).
      return grunt.util._.once(function (success) {
        setTimeout(function () {
          this._complete(context, success, asyncDone, done);
        }.bind(this), 1);
      }.bind(this));
    }.bind(this);

    // Expose some information about the currently-running task.
    this.current = context;

    try {
      const result = fn.call(context);
      if (!async) {
        this._complete(context, result, asyncDone, done);
      }
    } catch (err) {
      this._complete(context, err, asyncDone, done);
    }
  };

  // Begin task queue processing. Ie. run all tasks.
  Task.prototype.start = function (opts) {
    const options = opts || {};
    // Abort if already running.
    if (this._running) {
      return false;
    }

    const nextTask = function () {
      // Get next task+args object from queue.
      let thing;
      // Skip any placeholders or markers.
      do {
        thing = this._queue.shift();
      } while (thing === this._placeholder || thing === this._marker);
      // If queue was empty, we're all done.
      if (!thing) {
        this._running = false;
        if (this._options.done) {
          this._options.done();
        }
        return;
      }
      // Add a placeholder to the front of the queue.
      this._queue.unshift(this._placeholder);

      // Expose some information about the currently-running task.
      const context = {
        nameArgs: thing.nameArgs,
        name: thing.task.name,
        args: thing.args,
        flags: thing.flags
      };

      // Actually run the task function (handling this.async, etc)
      this.runTaskFn(
        context,
        function () {
          return thing.task.fn.apply(this, this.args);
        },
        nextTask,
        !!options.asyncDone
      );
    }.bind(this);

    // Update flag.
    this._running = true;
    // Process the next task.
    nextTask();
  };

  // Clear remaining tasks from the queue.
  Task.prototype.clearQueue = function (options) {
    const opts = options || {};
    if (opts.untilMarker) {
      this._queue.splice(0, this._queue.indexOf(this._marker) + 1);
    } else {
      this._queue = [];
    }
    // Make chainable!
    return this;
  };

  // Test to see if all of the given tasks have succeeded.
  Task.prototype.requires = function () {
    this.parseArgs(arguments).forEach(function (name) {
      const success = this._success[name];
      if (!success) {
        throw new Error(`Required task "${name}" ${success === false ? 'failed' : 'must be run first'}.`);
      }
    }.bind(this));
  };

  // Override default options.
  Task.prototype.options = function (options) {
    Object.keys(options).forEach(function (name) {
      this._options[name] = options[name];
    }.bind(this));
  };

}(typeof exports === 'object' && exports || this));