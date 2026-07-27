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
   * Resolve task function and info based on provided arguments.
   * @private
   */
  function resolveTaskInfo(info, fn) {
    if (fn == null) {
      fn = info;
      info = null;
    }
    if (typeof fn !== 'function') {
      const tasks = this.parseArgs([fn]);
      const aliasFn = this.run.bind(this, fn);
      aliasFn.alias = true;
      const generatedInfo = info || ('Alias for "' + tasks.join('", "') + '" task' + (tasks.length === 1 ? '' : 's') + '.');
      return { fn: aliasFn, info: generatedInfo };
    }
    return { fn: fn, info: info || 'Custom task.' };
  }

  // Register a new task.
  Task.prototype.registerTask = function (name, info, fn) {
    const resolved = resolveTaskInfo.call(this, info, fn);
    // Add task into cache.
    this._tasks[name] = { name: name, info: resolved.info, fn: resolved.fn };
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
      throw new Error('Cannot rename missing "' + oldname + '" task.');
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
    if (!str) { return []; }
    // Store placeholder for \\ followed by \:
    str = str.replace(/\\\\/g, '\uFFFF').replace(/\\:/g, '\uFFFE');
    // Split on :
    return str.split(':').map(function (s) {
      // Restore place-held : followed by \\
      return s.replace(/\uFFFE/g, ':').replace(/\uFFFF/g, '\\');
    });
  };

  /**
   * Find the most specific task matching the given parts.
   * @private
   */
  Task.prototype._findTask = function (parts) {
    let i = parts.length;
    let task;
    do {
      task = this._tasks[parts.slice(0, i).join(':')];
    } while (!task && --i > 0);
    return { task, index: i };
  };

  // Given a task name, determine which actual task will be called, and what
  // arguments will be passed into the task callback. "foo" -> task "foo", no
  // args. "foo:bar:baz" -> task "foo:bar:baz" with no args (if "foo:bar:baz"
  // task exists), otherwise task "foo:bar" with arg "baz" (if "foo:bar" task
  // exists), otherwise task "foo" with args "bar" and "baz".
  Task.prototype._taskPlusArgs = function (name) {
    // Get task name / argument parts.
    const parts = this.splitArgs(name);
    const { task, index } = this._findTask(parts);
    // Just the args.
    const args = parts.slice(index);
    // Maybe you want to use them as flags instead of as positional args?
    const flags = {};
    args.forEach(function (arg) { flags[arg] = true; });
    // The task to run and the args to run it with.
    return { task: task, nameArgs: name, args: args, flags: flags };
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

  // Enqueue a task.
  Task.prototype.run = function () {
    // Parse arguments into an array, returning an array of task+args objects.
    const things = this.parseArgs(arguments).map(this._taskPlusArgs, this);
    // Throw an exception if any tasks weren't found.
    const fails = things.filter(function (thing) { return !thing.task; });
    if (fails.length > 0) {
      this._throwIfRunning(new Error('Task "' + fails[0].nameArgs + '" not found.'));
      return this;
    }
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
   * Determine success status and possible error from a task result.
   * @private
   */
  function evaluateResult(contextName, result) {
    let err = null;
    let success;
    if (result === false) {
      err = new Error('Task "' + contextName + '" failed.');
      success = false;
    } else if (result instanceof Error || {}.toString.call(result) === '[object Error]') {
      err = result;
      success = false;
    } else {
      success = true;
    }
    return { err, success };
  }

  // Run a task function, handling this.async / return value.
  Task.prototype.runTaskFn = function (context, fn, done, asyncDone) {
    // Async flag.
    let async = false;

    // Update the internal status object and run the next task.
    const complete = function (result) {
      const { err, success } = evaluateResult(context.nameArgs, result);
      // The task has ended, reset the current task object.
      this.current = {};
      // Record success status.
      this._success[context.nameArgs] = success;
      // If task failed, call error handler.
      if (!success && this._options.error) {
        this._options.error.call({ name: context.name, nameArgs: context.nameArgs }, err);
      }
      // only call done async if explicitly requested to
      // see: https://github.com/gruntjs/grunt/pull/1026
      if (asyncDone) {
        process.nextTick(function () {
          done(err, success);
        });
      } else {
        done(err, success);
      }
    }.bind(this);

    // When called, sets the async flag and returns a function that can
    // be used to continue processing the queue.
    context.async = function () {
      async = true;
      // The returned function should execute asynchronously in case
      // someone tries to do this.async()(); inside a task (WTF).
      return grunt.util._.once(function (success) {
        setTimeout(function () { complete(success); }, 1);
      });
    };

    // Expose some information about the currently-running task.
    this.current = context;

    try {
      // Get the current task and run it, setting `this` inside the task
      // function to be something useful.
      const result = fn.call(context);
      // If the async flag wasn't set, process the next task in the queue.
      if (!async) {
        complete(result);
      }
    } catch (err) {
      complete(err);
    }
  };

  // Begin task queue processing. Ie. run all tasks.
  Task.prototype.start = function (opts) {
    if (!opts) {
      opts = {};
    }
    // Abort if already running.
    if (this._running) { return false; }

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
        // The current task name plus args, as-passed.
        nameArgs: thing.nameArgs,
        // The current task name.
        name: thing.task.name,
        // The current task arguments.
        args: thing.args,
        // The current arguments, available as named flags.
        flags: thing.flags
      };

      // Actually run the task function (handling this.async, etc)
      this.runTaskFn(context, function () {
        return thing.task.fn.apply(this, this.args);
      }, nextTask, !!opts.asyncDone);

    }.bind(this);

    // Update flag.
    this._running = true;
    // Process the next task.
    nextTask();
  };

  // Clear remaining tasks from the queue.
  Task.prototype.clearQueue = function (options) {
    if (!options) { options = {}; }
    if (options.untilMarker) {
      const markerIdx = this._queue.indexOf(this._marker);
      if (markerIdx !== -1) {
        this._queue.splice(0, markerIdx + 1);
      }
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
        throw new Error('Required task "' + name +
          '" ' + (success === false ? 'failed' : 'must be run first') + '.');
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