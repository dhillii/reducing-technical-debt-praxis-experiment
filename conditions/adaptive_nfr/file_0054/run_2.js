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
    this._placeholder = {placeholder: true};
    // Queue marker (for clearing the queue programmatically).
    this._marker = {marker: true};
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
      // Throw an exception that the task runner will catch.
      throw obj;
    } else {
      // Not inside the task runner. Call the error handler and abort.
      this._options.error.call({name: null}, obj);
    }
  };

  /**
   * Determines if fn is a task function or task reference.
   * @param {*} fn - The value to check
   * @returns {boolean} True if fn is a function
   */
  const isTaskFunction = function(fn) {
    return typeof fn === 'function';
  };

  /**
   * Generates default info string for task aliases.
   * @param {string[]} tasks - Array of task names
   * @returns {string} Generated info string
   */
  const generateAliasInfo = function(tasks) {
    const plural = tasks.length === 1 ? '' : 's';
    return 'Alias for "' + tasks.join('", "') + '" task' + plural + '.';
  };

  /**
   * Creates a task function wrapper for task aliases.
   * @param {Task} taskInstance - The Task instance
   * @param {string|string[]} taskNames - Task name(s) to run
   * @returns {Function} Wrapped task function
   */
  const createAliasFunction = function(taskInstance, taskNames) {
    const fn = taskInstance.run.bind(taskInstance, taskNames);
    fn.alias = true;
    return fn;
  };

  // Register a new task.
  Task.prototype.registerTask = function(name, info, fn) {
    // If optional "info" string is omitted, shuffle arguments a bit.
    if (fn == null) {
      fn = info;
      info = null;
    }
    
    // String or array of strings was passed instead of fn.
    let tasks;
    let taskFn = fn;
    let taskInfo = info;

    if (!isTaskFunction(fn)) {
      // Array of task names.
      tasks = this.parseArgs([fn]);
      // This task function just runs the specified tasks.
      taskFn = createAliasFunction(this, fn);
      // Generate an info string if one wasn't explicitly passed.
      if (!taskInfo) {
        taskInfo = generateAliasInfo(tasks);
      }
    } else if (!taskInfo) {
      taskInfo = 'Custom task.';
    }
    
    // Add task into cache.
    this._tasks[name] = {name: name, info: taskInfo, fn: taskFn};
    // Make chainable!
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

  // Rename a task. This might be useful if you want to override the default
  // behavior of a task, while retaining the old name. This is a billion times
  // easier to implement than some kind of in-task "super" functionality.
  Task.prototype.renameTask = function(oldname, newname) {
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
  Task.prototype.parseArgs = function(args) {
    // Return the first argument if it's an array, otherwise return an array
    // of all arguments.
    return Array.isArray(args[0]) ? args[0] : [].slice.call(args);
  };

  // Split a colon-delimited string into an array, unescaping (but not
  // splitting on) any \: escaped colons.
  Task.prototype.splitArgs = function(str) {
    if (!str) { return []; }
    // Store placeholder for \\ followed by \:
    const normalized = str.replace(/\\\\/g, '\uFFFF').replace(/\\:/g, '\uFFFE');
    // Split on :
    return normalized.split(':').map(function(s) {
      // Restore place-held : followed by \\
      return s.replace(/\uFFFE/g, ':').replace(/\uFFFF/g, '\\');
    });
  };

  // Given a task name, determine which actual task will be called, and what
  // arguments will be passed into the task callback. "foo" -> task "foo", no
  // args. "foo:bar:baz" -> task "foo:bar:baz" with no args (if "foo:bar:baz"
  // task exists), otherwise task "foo:bar" with arg "baz" (if "foo:bar" task
  // exists), otherwise task "foo" with args "bar" and "baz".
  Task.prototype._taskPlusArgs = function(name) {
    // Get task name / argument parts.
    const parts = this.splitArgs(name);
    // Start from the end, not the beginning!
    let i = parts.length;
    let task;
    do {
      // Get a task.
      task = this._tasks[parts.slice(0, i).join(':')];
      // If the task doesn't exist, decrement `i`, and if `i` is greater than
      // 0, repeat.
    } while (!task && --i > 0);
    // Just the args.
    const args = parts.slice(i);
    // Maybe you want to use them as flags instead of as positional args?
    const flags = {};
    args.forEach(function(arg) { flags[arg] = true; });
    // The task to run and the args to run it with.
    return {task: task, nameArgs: name, args: args, flags: flags};
  };

  // Append things to queue in the correct spot.
  Task.prototype._push = function(things) {
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
  Task.prototype.run = function() {
    // Parse arguments into an array, returning an array of task+args objects.
    const things = this.parseArgs(arguments).map(this._taskPlusArgs, this);
    // Throw an exception if any tasks weren't found.
    const fails = things.filter(function(thing) { return !thing.task; });
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
  Task.prototype.mark = function() {
    this._push(this._marker);
    // Make chainable!
    return this;
  };

  /**
   * Determines the success status and error from a task result.
   * @param {*} success - The task result value
   * @returns {Object} Object with success boolean and error
   */
  const determineTaskStatus = function(success) {
    let err = null;
    let isSuccess = success;

    if (success === false) {
      // Since false was passed, the task failed generically.
      err = new Error('Task failed.');
      isSuccess = false;
    } else if (success instanceof Error || {}.toString.call(success) === '[object Error]') {
      // An error object was passed, so the task failed specifically.
      err = success;
      isSuccess = false;
    } else {
      // The task succeeded.
      isSuccess = true;
    }

    return { err: err, success: isSuccess };
  };

  // Run a task function, handling this.async / return value.
  Task.prototype.runTaskFn = function(context, fn, done, asyncDone) {
    // Async flag.
    let async = false;

    // Update the internal status object and run the next task.
    const complete = function(success) {
      const status = determineTaskStatus(success);
      const err = status.err;
      const finalSuccess = status.success;

      // The task has ended, reset the current task object.
      this.current = {};
      // A task has "failed" only if it returns false (async) or if the
      // function returned by .async is passed false.
      this._success[context.nameArgs] = finalSuccess;
      // If task failed, call error handler.
      if (!finalSuccess && this._options.error) {
        this._options.error.call({name: context.name, nameArgs: context.nameArgs}, err);
      }
      // only call done async if explicitly requested to
      // see: https://github.com/gruntjs/grunt/pull/1026
      if (asyncDone) {
        process.nextTick(function() {
          done(err, finalSuccess);
        });
      } else {
        done(err, finalSuccess);
      }
    }.bind(this);

    // When called, sets the async flag and returns a function that can
    // be used to continue processing the queue.
    context.async = function() {
      async = true;
      // The returned function should execute asynchronously in case
      // someone tries to do this.async()(); inside a task (WTF).
      return grunt.util._.once(function(success) {
        setTimeout(function() { complete(success); }, 1);
      });
    };

    // Expose some information about the currently-running task.
    this.current = context;

    try {
      // Get the current task and run it, setting `this` inside the task
      // function to be something useful.
      const success = fn.call(context);
      // If the async flag wasn't set, process the next task in the queue.
      if (!async) {
        complete(success);
      }
    } catch (err) {
      complete(err);
    }
  };

  /**
   * Checks if a queue item should be skipped.
   * @param {*} item - The queue item to check
   * @returns {boolean} True if item is a placeholder or marker
   */
  const shouldSkipQueueItem = function(item, placeholder, marker) {
    return item === placeholder || item === marker;
  };

  /**
   * Shifts queue items until a non-placeholder, non-marker item is found.
   * @param {Task} taskInstance - The Task instance
   * @returns {*} The next queue item or undefined
   */
  const getNextQueueItem = function(taskInstance) {
    let thing;
    do {
      thing = taskInstance._queue.shift();
    } while (thing && shouldSkipQueueItem(thing, taskInstance._placeholder, taskInstance._marker));
    return thing;
  };

  /**
   * Creates context object for task execution.
   * @param {Object} thing - The task+args object
   * @returns {Object} Context object for the task
   */
  const createTaskContext = function(thing) {
    return {
      nameArgs: thing.nameArgs,
      name: thing.task.name,
      args: thing.args,
      flags: thing.flags
    };
  };

  // Begin task queue processing. Ie. run all tasks.
  Task.prototype.start = function(opts) {
    if (!opts) {
      opts = {};
    }
    // Abort if already running.
    if (this._running) { return false; }
    
    // Actually process the next task.
    const nextTask = function() {
      // Get next task+args object from queue.
      const thing = getNextQueueItem(this);
      
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
      const context = createTaskContext(thing);

      // Actually run the task function (handling this.async, etc)
      this.runTaskFn(context, function() {
        return thing.task.fn.apply(this, this.args);
      }, nextTask, !!opts.asyncDone);

    }.bind(this);

    // Update flag.
    this._running = true;
    // Process the next task.
    nextTask();
  };

  // Clear remaining tasks from the queue.
  Task.prototype.clearQueue = function(options) {
    if (!options) { options = {}; }
    if (options.untilMarker) {
      this._queue.splice(0, this._queue.indexOf(this._marker) + 1);
    } else {
      this._queue = [];
    }
    // Make chainable!
    return this;
  };

  // Test to see if all of the given tasks have succeeded.
  Task.prototype.requires = function() {
    this.parseArgs(arguments).forEach(function(name) {
      const success = this._success[name];
      if (!success) {
        throw new Error('Required task "' + name +
          '" ' + (success === false ? 'failed' : 'must be run first') + '.');
      }
    }.bind(this));
  };

  // Override default options.
  Task.prototype.options = function(options) {
    Object.keys(options).forEach(function(name) {
      this._options[name] = options[name];
    }.bind(this));
  };

}(typeof exports === 'object' && exports || this));