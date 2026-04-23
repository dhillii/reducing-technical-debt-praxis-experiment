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

  // Helper: determine if we should throw.
  function shouldThrow(running, options) {
    return running || !options.error;
  }

  // If the task runner is running or an error handler is not defined, throw
  // an exception. Otherwise, call the error handler directly.
  Task.prototype._throwIfRunning = function (obj) {
    if (shouldThrow(this._running, this._options)) {
      // Throw an exception that the task runner will catch.
      throw obj;
    } else {
      // Not inside the task runner. Call the error handler and abort.
      this._options.error.call({ name: null }, obj);
    }
  };

  // Register a new task.
  Task.prototype.registerTask = function (name, info, fn) {
    // If optional "info" string is omitted, shuffle arguments a bit.
    if (fn == null) {
      fn = info;
      info = null;
    }
    // String or array of strings was passed instead of fn.
    let tasks;
    if (typeof fn !== 'function') {
      // Array of task names.
      tasks = this.parseArgs([fn]);
      // This task function just runs the specified tasks.
      fn = this.run.bind(this, fn);
      fn.alias = true;
      // Generate an info string if one wasn't explicitly passed.
      if (!info) {
        info =
          'Alias for "' +
          tasks.join('", "') +
          '" task' +
          (tasks.length === 1 ? '' : 's') +
          '.';
      }
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

  // Rename a task.
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

  // Argument parsing helper.
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

  // Determine task and arguments from a name.
  Task.prototype._taskPlusArgs = function (name) {
    const parts = this.splitArgs(name);
    let i = parts.length;
    let task;
    do {
      task = this._tasks[parts.slice(0, i).join(':')];
    } while (!task && --i > 0);
    const args = parts.slice(i);
    const flags = {};
    args.forEach(function (arg) {
      flags[arg] = true;
    });
    return { task: task, nameArgs: name, args: args, flags: flags };
  };

  // Append things to queue in the correct spot.
  Task.prototype._push = function (things) {
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
    const things = this.parseArgs(arguments).map(this._taskPlusArgs, this);
    const fails = things.filter(function (thing) {
      return !thing.task;
    });
    if (fails.length > 0) {
      this._throwIfRunning(new Error('Task "' + fails[0].nameArgs + '" not found.'));
      return this;
    }
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

  // Evaluate task result into error and success flag.
  function evaluateResult(result) {
    if (result === false) {
      return { err: new Error('Task failed.'), success: false };
    }
    if (result instanceof Error || {}.toString.call(result) === '[object Error]') {
      return { err: result, success: false };
    }
    return { err: null, success: true };
  }

  // Run a task function, handling this.async / return value.
  Task.prototype.runTaskFn = function (context, fn, done, asyncDone) {
    let async = false;

    const complete = function (result) {
      const { err, success } = evaluateResult(result);
      this.current = {};
      this._success[context.nameArgs] = success;
      if (!success && this._options.error) {
        this._options.error.call(
          { name: context.name, nameArgs: context.nameArgs },
          err
        );
      }
      if (asyncDone) {
        process.nextTick(function () {
          done(err, success);
        });
      } else {
        done(err, success);
      }
    }.bind(this);

    context.async = function () {
      async = true;
      return grunt.util._.once(function (result) {
        setTimeout(function () {
          complete(result);
        }, 1);
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
  Task.prototype.start = function (opts) {
    const options = opts || {};
    if (this._running) {
      return false;
    }

    const nextTask = function () {
      let thing;
      do {
        thing = this._queue.shift();
      } while (thing === this._placeholder || thing === this._marker);
      if (!thing) {
        this._running = false;
        if (this._options.done) {
          this._options.done();
        }
        return;
      }
      this._queue.unshift(this._placeholder);
      const context = {
        nameArgs: thing.nameArgs,
        name: thing.task.name,
        args: thing.args,
        flags: thing.flags
      };
      this.runTaskFn(
        context,
        function () {
          return thing.task.fn.apply(this, this.args);
        },
        nextTask,
        !!options.asyncDone
      );
    }.bind(this);

    this._running = true;
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
    this.parseArgs(arguments).forEach(
      function (name) {
        const success = this._success[name];
        if (!success) {
          throw new Error(
            'Required task "' +
              name +
              '" ' +
              (success === false ? 'failed' : 'must be run first') +
              '.'
          );
        }
      }.bind(this)
    );
  };

  // Override default options.
  Task.prototype.options = function (options) {
    Object.keys(options).forEach(
      function (name) {
        this._options[name] = options[name];
      }.bind(this)
    );
  };
}(typeof exports === 'object' && exports || this));