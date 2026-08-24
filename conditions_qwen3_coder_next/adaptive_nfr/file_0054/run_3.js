'use strict';

var grunt = require('../grunt');

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

/**
 * Throws an exception if the task runner is running or no error handler is defined.
 * Otherwise, calls the error handler directly.
 * @param {*} obj - The object to throw or pass to the error handler.
 */
Task.prototype._throwIfRunning = function(obj) {
  if (this._running || !this._options.error) {
    throw obj;
  } else {
    this._options.error.call({name: null}, obj);
  }
};

/**
 * Registers a new task with the given name, optional info, and function.
 * @param {string} name - The name of the task.
 * @param {string} [info] - Optional description of the task.
 * @param {Function|string|string[]} fn - Task function, or task name(s) for alias.
 * @returns {Task} - Chainable instance.
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

/**
 * Checks if the specified task is an alias.
 * @param {string} name - The task name to check.
 * @returns {boolean} - True if the task is an alias.
 */
Task.prototype.isTaskAlias = function(name) {
  return !!this._tasks[name].fn.alias;
};

/**
 * Checks if the specified task has been registered.
 * @param {string} name - The task name to check.
 * @returns {boolean} - True if the task exists.
 */
Task.prototype.exists = function(name) {
  return name in this._tasks;
};

/**
 * Renames an existing task from oldname to newname.
 * @param {string} oldname - The current name of the task.
 * @param {string} newname - The new name for the task.
 * @returns {Task} - Chainable instance.
 */
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
 * Parses arguments into an array.
 * Supports: fn('foo'), fn('foo', 'bar'), fn(['foo', 'bar']).
 * @param {Array} args - Input arguments.
 * @returns {string[]} - Parsed array of arguments.
 */
Task.prototype.parseArgs = function(args) {
  return Array.isArray(args[0]) ? args[0] : [].slice.call(args);
};

/**
 * Splits a colon-delimited string into an array, respecting escaped colons.
 * @param {string} str - Input string.
 * @returns {string[]} - Parsed array.
 */
Task.prototype.splitArgs = function(str) {
  if (!str) { return []; }

  str = str.replace(/\\\\/g, '\uFFFF').replace(/\\:/g, '\uFFFE');
  return str.split(':').map(function(s) {
    return s.replace(/\uFFFE/g, ':').replace(/\uFFFF/g, '\\');
  });
};

/**
 * Determines the actual task and arguments for a given task name string.
 * @param {string} name - Task name with optional colon-separated args.
 * @returns {{task: Object|null, nameArgs: string, args: string[], flags: Object}} - Task info.
 */
Task.prototype._taskPlusArgs = function(name) {
  const parts = this.splitArgs(name);
  let i = parts.length;
  let task;

  do {
    task = this._tasks[parts.slice(0, i).join(':')];
  } while (!task && --i > 0);

  const args = parts.slice(i);
  const flags = {};
  args.forEach(function(arg) { flags[arg] = true; });

  return {task: task, nameArgs: name, args: args, flags: flags};
};

/**
 * Appends items to the queue at the correct position (before placeholder or at end).
 * @param {Array} things - Items to push.
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
 * Enqueues one or more tasks.
 * @param {...*} args - Task names or arrays of task names.
 * @returns {Task} - Chainable instance.
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

/**
 * Adds a marker to the queue for programmatic clearing.
 * @returns {Task} - Chainable instance.
 */
Task.prototype.mark = function() {
  this._push(this._marker);
  return this;
};

/**
 * Executes a task function, handling async behavior and completion.
 * @param {Object} context - Task execution context.
 * @param {Function} fn - Task function to execute.
 * @param {Function} done - Completion callback.
 * @param {boolean} asyncDone - Whether to defer done() via nextTick.
 */
Task.prototype.runTaskFn = function(context, fn, done, asyncDone) {
  let async = false;

  /**
   * Completes task execution and triggers callbacks.
   * @param {boolean|Error} success - Success status or error object.
   */
  function complete(success) {
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
  }

  context.async = function() {
    async = true;
    return grunt.util._.once(function(success) {
      setTimeout(function() { complete.call(this, success); }.bind(this), 1);
    }.bind(this));
  };

  this.current = context;

  try {
    const success = fn.call(context);
    if (!async) {
      complete.call(this, success);
    }
  } catch (err) {
    complete.call(this, err);
  }
};

/**
 * Starts processing the task queue.
 * @param {Object} [opts] - Options including asyncDone flag.
 * @returns {void}
 */
Task.prototype.start = function(opts) {
  if (!opts) { opts = {}; }
  if (this._running) { return false; }

  /**
   * Processes the next task in the queue.
   */
  const nextTask = function() {
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

    this.runTaskFn(context, function() {
      return thing.task.fn.apply(this, this.args);
    }, nextTask, !!opts.asyncDone);
  }.bind(this);

  this._running = true;
  nextTask();
};

/**
 * Clears tasks from the queue, optionally up to a marker.
 * @param {Object} [options] - Options including untilMarker flag.
 * @returns {Task} - Chainable instance.
 */
Task.prototype.clearQueue = function(options) {
  if (!options) { options = {}; }

  if (options.untilMarker) {
    const markerIndex = this._queue.indexOf(this._marker);
    this._queue.splice(0, markerIndex + 1);
  } else {
    this._queue = [];
  }

  return this;
};

/**
 * Ensures all specified tasks have succeeded; throws if not.
 * @param {...string} names - Task names to check.
 */
Task.prototype.requires = function() {
  this.parseArgs(arguments).forEach(function(name) {
    const success = this._success[name];
    if (!success) {
      throw new Error('Required task "' + name +
        '" ' + (success === false ? 'failed' : 'must be run first') + '.');
    }
  }.bind(this));
};

/**
 * Overrides default options with provided values.
 * @param {Object} options - Options to merge.
 */
Task.prototype.options = function(options) {
  Object.keys(options).forEach(function(name) {
    this._options[name] = options[name];
  }.bind(this));
};