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

  // Generate info string for aliased tasks.
  Task.prototype._generateAliasInfo = function(tasks) {
    const plural = tasks.length === 1 ? '' : 's';
    return 'Alias for "' + tasks.join('", "') + '" task' + plural + '.';
  };

  // Create a task function that runs specified tasks.
  Task.prototype._createAliasFunction = function(taskNames) {
    const fn = this.run.bind(this, taskNames);
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
    
    let taskInfo = info;
    let taskFn = fn;
    
    // String or array of strings was passed instead of fn.
    if (typeof fn !== 'function') {
      // Array of task names.
      const tasks = this.parseArgs([fn]);
      // This task function just runs the specified tasks.
      taskFn = this._createAliasFunction(fn);
      // Generate an info string if one wasn't explicitly passed.
      if (!taskInfo) {
        taskInfo = this._generateAliasInfo(tasks);
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
    const escaped = str.replace(/\\\\/g, '\uFFFF').replace(/\\:/g, '\uFFFE');
    // Split on :
    return escaped.split(':').map(function(s) {
      // Restore place-held : followed by \\
      return s.replace(/\uFFFE/g, ':').replace(/\uFFFF/g, '\\');
    });
  };

  // Find the task matching the given name parts.
  Task.prototype._findTask = function(parts) {
    let i = parts.length;
    let task;
    do {
      // Get a task.
      task = this._tasks[parts.slice(0, i).join(':')];
      // If the task doesn't exist, decrement `i`, and if `i` is greater than
      // 0, repeat.
    } while (!task && --i > 0);
    return {task: task, taskIndex: i};
  };

  // Build flags object from arguments.
  Task.prototype._buildFlags = function(args) {
    const flags = {};
    args.forEach(function(arg) { flags[arg] = true; });
    return flags;
  };

  // Given a task name, determine which actual task will be called, and what
  // arguments will be passed into the task callback. "foo" -> task "foo", no
  // args. "foo:bar:baz" -> task "foo:bar:baz" with no args (if "foo:bar:baz"
  // task exists), otherwise task "foo:bar" with arg "baz" (if "foo:bar" task
  // exists), otherwise task "foo" with args "bar" and "baz".
  Task.prototype._taskPlusArgs = function(name) {
    // Get task name / argument parts.
    const parts = this.splitArgs(name);
    // Find matching task.
    const {task, taskIndex} = this._findTask(parts);
    // Just the args.
    const args = parts.slice(taskIndex);
    // Maybe you want to use them as flags instead of as positional args?
    const flags = this._buildFlags(args);
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

  // Determine if value represents a task failure.
  Task.prototype._isFailure = function(success) {
    return success === false || success instanceof Error || 
           {}.toString.call(success) === '[object Error]';
  };

  // Create error from failure value.
  Task.prototype._createErrorFromFailure = function(success, nameArgs) {
    if (success === false) {
      return new Error('Task "' + nameArgs + '" failed.');
    }
    return success;
  };

  // Handle task completion and invoke done callback.
  Task.prototype._completeTask = function(context, success, done, asyncDone) {
    let err = null;
    let taskSuccess = success;

    if (this._isFailure(success)) {
      err = this._createErrorFromFailure(success, context.nameArgs);
      taskSuccess = false;
    } else {
      taskSuccess = true;
    }

    // The task has ended, reset the current task object.
    this.current = {};
    // A task has "failed" only if it returns false (async) or if the
    // function returned by .async is passed false.
    this._success[context.nameArgs] = taskSuccess;
    // If task failed, call error handler.
    if (!taskSuccess && this._options.error) {
      this._options.error.call({name: context.name, nameArgs: context.nameArgs}, err);
    }
    // only call done async if explicitly requested to
    // see: https://github.com/gruntjs/grunt/pull/1026
    if (asyncDone) {
      process.nextTick(function() {
        done(err, taskSuccess);
      });
    } else {
      done(err, taskSuccess);
    }
  };

  // Run a task function, handling this.async / return value.
  Task.prototype.runTaskFn = function(context, fn, done, asyncDone) {
    // Async flag.
    let async = false;

    // Update the internal status object and run the next task.
    const complete = function(success) {
      this._completeTask(context, success, done, asyncDone);
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

  // Skip placeholder and marker items in queue.
  Task.prototype._skipQueueMarkers = function() {
    let thing;
    do {
      thing = this._queue.shift();
    } while (thing === this._placeholder || thing === this._marker);
    return thing;
  };

  // Create context object for task execution.
  Task.prototype._createTaskContext = function(thing) {
    return {
      // The current task name plus args, as-passed.
      nameArgs: thing.nameArgs,
      // The current task name.
      name: thing.task.name,
      // The current task arguments.
      args: thing.args,
      // The current arguments, available as named flags.
      flags: thing.flags
    };
  };

  // Execute the next task in the queue.
  Task.prototype._executeNextTask = function(nextTask, asyncDone) {
    const thing = this._skipQueueMarkers();
    
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
    const context = this._createTaskContext(thing);

    // Actually run the task function (handling this.async, etc)
    this.runTaskFn(context, function() {
      return thing.task.fn.apply(this, this.args);
    }, nextTask, !!asyncDone);
  };

  // Begin task queue processing. Ie. run all tasks.
  Task.prototype.start = function(opts) {
    const options = opts || {};
    
    // Abort if already running.
    if (this._running) { return false; }
    
    // Actually process the next task.
    const nextTask = function() {
      this._executeNextTask(nextTask, options.asyncDone);
    }.bind(this);

    // Update flag.
    this._running = true;
    // Process the next task.
    nextTask();
  };

  // Clear remaining tasks from the queue.
  Task.prototype.clearQueue = function(options) {
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
```