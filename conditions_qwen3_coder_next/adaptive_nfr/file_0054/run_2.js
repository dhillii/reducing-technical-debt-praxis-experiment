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
 * @param {*} obj - The object to throw or pass to error handler.
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
 * @param {string} name - Task name.
 * @param {string} [info] - Task description.
 * @param {Function|string|string[]} fn - Task function or task alias specification.
 * @returns {Task} Chainable instance.
 */
Task.prototype.registerTask = function(name, info, fn) {
  if (fn == null) {
    fn = info;
    info = null;
  }

  if (typeof fn !== 'function') {
    var tasks = this.parseArgs([fn]);
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
 * @param {string} name - Task name.
 * @returns {boolean} True if task is an alias.
 */
Task.prototype.isTaskAlias = function(name) {
  return !!this._tasks[name].fn.alias;
};

/**
 * Checks if the specified task has been registered.
 * @param {string} name - Task name.
 * @returns {boolean} True if task exists.
 */
Task.prototype.exists = function(name) {
  return name in this._tasks;
};

/**
 * Renames an existing task to a new name.
 * @param {string} oldname - Current task name.
 * @param {string} newname - New task name.
 * @returns {Task} Chainable instance.
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
 * Supports: fn('foo'), fn('foo', 'bar'), fn(['foo', 'bar'])
 * @param {Array} args - Input arguments.
 * @returns {string[]} Parsed arguments array.
 */
Task.prototype.parseArgs = function(args) {
  return Array.isArray(args[0]) ? args[0] : [].slice.call(args);
};

/**
 * Splits a colon-delimited string into an array, respecting escaped colons.
 * @param {string} str - Input string.
 * @returns {string[]} Parsed parts.
 */
Task.prototype.splitArgs = function(str) {
  if (!str) { return []; }
  str = str.replace(/\\\\/g, '\uFFFF').replace(/\\:/g, '\uFFFE');
  return str.split(':').map(function(s) {
    return s.replace(/\uFFFE/g, ':').replace(/\uFFFF/g, '\\');
  });
};

/**
 * Determines the actual task and arguments for a given task specification.
 * @param {string} name - Task name with optional arguments.
 * @returns {Object} Task and argument information.
 */
Task.prototype._taskPlusArgs = function(name) {
  var parts = this.splitArgs(name);
  var i = parts.length;
  var task;

  do {
    task = this._tasks[parts.slice(0, i).join(':')];
  } while (!task && --i > 0);

  var args = parts.slice(i);
  var flags = {};
  args.forEach(function(arg) { flags[arg] = true; });

  return {task: task, nameArgs: name, args: args, flags: flags};
};

/**
 * Appends items to the queue at the correct position relative to placeholders/markers.
 * @param {Array} things - Items to push.
 */
Task.prototype._push = function(things) {
  var index = this._queue.indexOf(this._placeholder);
  if (index === -1) {
    this._queue = this._queue.concat(things);
  } else {
    [].splice.apply(this._queue, [index, 0].concat(things));
  }
};

/**
 * Enqueues one or more tasks.
 * @param {...*} args - Task specifications.
 * @returns {Task} Chainable instance.
 */
Task.prototype.run = function() {
  var things = this.parseArgs(arguments).map(this._taskPlusArgs, this);
  var fails = things.filter(function(thing) { return !thing.task; });

  if (fails.length > 0) {
    this._throwIfRunning(new Error('Task "' + fails[0].nameArgs + '" not found.'));
    return this;
  }

  this._push(things);
  return this;
};

/**
 * Adds a marker to the queue for programmatic clearing.
 * @returns {Task} Chainable instance.
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
 * @param {boolean} asyncDone - Whether to defer done callback.
 */
Task.prototype.runTaskFn = function(context, fn, done, asyncDone) {
  var async = false;

  var complete = function(success) {
    var err = null;
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

  context.async = function() {
    async = true;
    return grunt.util._.once(function(success) {
      setTimeout(function() { complete(success); }, 1);
    });
  };

  this.current = context;

  try {
    var success = fn.call(context);
    if (!async) {
      complete(success);
    }
  } catch (err) {
    complete(err);
  }
};

/**
 * Starts processing the task queue.
 * @param {Object} [opts] - Options including asyncDone flag.
 * @returns {boolean} False if already running, otherwise undefined.
 */
Task.prototype.start = function(opts) {
  if (!opts) { opts = {}; }
  if (this._running) { return false; }

  var nextTask = function() {
    var thing;
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

    var context = {
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
 * Clears remaining tasks from the queue.
 * @param {Object} [options] - Options including untilMarker flag.
 * @returns {Task} Chainable instance.
 */
Task.prototype.clearQueue = function(options) {
  if (!options) { options = {}; }
  if (options.untilMarker) {
    this._queue.splice(0, this._queue.indexOf(this._marker) + 1);
  } else {
    this._queue = [];
  }
  return this;
};

/**
 * Ensures all specified tasks have succeeded.
 * @param {...*} args - Task names to check.
 */
Task.prototype.requires = function() {
  this.parseArgs(arguments).forEach(function(name) {
    var success = this._success[name];
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