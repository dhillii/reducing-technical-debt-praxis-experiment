```javascript
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
   * Determines if fn is a function and returns task configuration.
   * @param {*} fn - The function or task specification
   * @param {string} info - Optional info string
   * @returns {{tasks: string[], fn: Function, info: string, isAlias: boolean}}
   */
  const _parseTaskDefinition = function(fn, info) {
    if (typeof fn === 'function') {
      return {
        tasks: [],
        fn: fn,
        info: info || 'Custom task.',
        isAlias: false
      };
    }
    // String or array of strings was passed instead of fn.
    const tasks = this.parseArgs([fn]);
    const taskFn = this.run.bind(this, fn);
    taskFn.alias = true;
    const taskInfo = info || ('Alias for "' + tasks.join('", "') + '" task' +
      (tasks.length === 1 ? '' : 's') + '.');
    return {
      tasks: tasks,
      fn: taskFn,
      info: taskInfo,
      isAlias: true
    };
  };

  // Register a new task.
  Task.prototype.registerTask = function(name, info, fn) {
    // If optional "info" string is omitted, shuffle arguments a bit.
    if (fn == null) {
      fn = info;
      info = null;
    }
    
    const taskDef = _parseTaskDefinition.call(this, fn, info);
    
    // Add task into cache.
    this._tasks[name] = {name: name, info: taskDef.info, fn: taskDef.fn};
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
    str = str.replace(/\\\\/g, '\uFFFF').replace(/\\:/g, '\uFFFE');
    // Split on :
    return str.split(':').map(function(s) {
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
   * Determines error status from success value.
   * @param {*} success - Success value or error object
   * @param {string} nameArgs - Task name and arguments
   * @returns {{err: Error|null, success: boolean}}
   */
  const _resolveTaskStatus = function(success, nameArgs) {
    if (success === false) {
      return {
        err: new Error('Task "' + nameArgs + '" failed.'),
        success: false
      };
    }
    if (success instanceof Error || {}.toString.call(success) === '[object Error]') {
      return {
        err: success,
        success: false
      };
    }
    return {
      err: null,
      success: true
    };
  };

  /**
   * Calls error handler if task failed and error handler is configured.
   * @param {Object} options - Task options
   * @param {boolean} success - Whether task succeeded
   * @param {Object} context - Task context
   * @param {Error} err - Error object if any
   */
  const _handleTaskError = function(options, success, context, err) {
    if (!success && options.error) {
      options.error.call({name: context.name, nameArgs: context.nameArgs}, err);
    }
  };

  /**
   * Invokes done callback, optionally asynchronously.
   * @param {Function} done - Callback function
   * @param {Error} err - Error object if any
   * @param {boolean} success - Success status
   * @param {boolean} asyncDone - Whether to invoke asynchronously
   */
  const _invokeDone = function(done, err, success, asyncDone) {
    if (asyncDone) {
      process.nextTick(function() {
        done(err, success);
      });
    } else {
      done(err, success);
    }
  };

  // Run a task function, handling this.async / return value.
  Task.prototype.runTaskFn = function(context, fn, done, asyncDone) {
    // Async flag.
    let async = false;

    // Update the internal status object and run the next task.
    const complete = function(success) {
      const status = _resolveTaskStatus(success, context.nameArgs);
      
      // The task has ended, reset the current task object.
      this.current = {};
      // A task has "failed" only if it returns false (async) or if the
      // function returned by .async is passed false.
      this._success[context.nameArgs] = status.success;
      
      // If task failed, call error handler.
      _handleTaskError(this._options, status.success, context, status.err);
      
      // only call done async if explicitly requested to
      // see: https://github.com/gruntjs/grunt/pull/1026
      _invokeDone(done, status.err, status.success, asyncDone);
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
   * Checks if item should be skipped during queue processing.
   * @param {*} item - Queue item
   * @param {Object} placeholder - Placeholder reference
   * @param {Object} marker - Marker reference
   * @returns {boolean}
   */
  const _isQueueItemSkippable = function(item, placeholder, marker) {
    return item === placeholder || item === marker;
  };

  /**
   * Creates task execution context from queue item.
   * @param {Object} thing - Queue item with task info
   * @returns {Object}
   */
  const _createTaskContext = function(thing) {
    return {
      nameArgs: thing.nameArgs,
      name: thing.task.name,
      args: thing.args,
      flags: thing.flags
    };
  };

  /**
   * Processes queue completion when empty.
   * @param {Object} task - Task instance
   * @param {Object} options - Task options
   */
  const _handleQueueEmpty = function(task, options) {
    task._running = false;
    if (options.done) {
      options.done();
    }
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
      let thing;
      // Skip any placeholders or markers.
      do {
        thing = this._queue.shift();
      } while (thing && _isQueueItemSkippable(thing, this._placeholder, this._marker));
      
      // If queue was empty, we're all done.
      if (!thing) {
        _handleQueueEmpty(this, this._options);
        return;
      }
      
      // Add a placeholder to the front of the queue.
      this._queue.unshift(this._placeholder);

      // Expose some information about the currently-running task.
      const context = _createTaskContext(thing);

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

  /**
   * Checks if a task succeeded.
   * @param {boolean|undefined} success - Success status
   * @returns {boolean}
   */
  const _isTaskSuccessful = function(success) {
    return success === true;
  };

  /**
   * Gets error message for failed task requirement.
   * @param {string} name - Task name
   * @param {boolean|undefined} success - Success status
   * @returns {string}
   */
  const _getTaskRequirementError = function(name, success) {
    const reason = success === false ? 'failed' : 'must be run first';
    return 'Required task "' + name + '" ' + reason + '.';
  };

  // Test to see if all of the given tasks have succeeded.
  Task.prototype.requires = function() {
    this.parseArgs(arguments).forEach(function(name) {
      const success = this._success[name];
      if (!_isTaskSuccessful(success)) {
        throw new Error(_getTaskRequirementError(name, success));
      }
    }.bind(this));
  };

  // Override default options.
  Task.prototype.options = function(options) {
    Object.keys(