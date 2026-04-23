(function(exports) {

  'use strict';

  const grunt = require('../grunt');

  /**
   * Task constructor.
   * @constructor
   */
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

  /**
   * Throws an exception if the task runner is running or an error handler is not defined.
   * @param {Object} obj - The object to throw.
   * @private
   */
  Task.prototype._throwIfRunning = function(obj) {
    if (this._running || !this._options.error) {
      throw obj;
    } else {
      this._options.error.call({ name: null }, obj);
    }
  };

  /**
   * Registers a new task.
   * @param {string} name - The task name.
   * @param {string} [info] - The task info.
   * @param {Function} [fn] - The task function.
   * @returns {Task} The task instance.
   */
  Task.prototype.registerTask = function(name, info, fn) {
    // Normalize arguments
    if (fn == null) {
      fn = info;
      info = null;
    }

    // Check if task is an alias
    if (typeof fn !== 'function') {
      const tasks = this.parseArgs([fn]);
      fn = this.run.bind(this, fn);
      fn.alias = true;
      info = info || `Alias for "${tasks.join('", ')}" task${tasks.length === 1 ? '' : 's'}.`;
    } else if (!info) {
      info = 'Custom task.';
    }

    // Add task to cache
    this._tasks[name] = { name, info, fn };
    return this;
  };

  /**
   * Checks if a task is an alias.
   * @param {string} name - The task name.
   * @returns {boolean} True if the task is an alias, false otherwise.
   */
  Task.prototype.isTaskAlias = function(name) {
    return !!this._tasks[name].fn.alias;
  };

  /**
   * Checks if a task exists.
   * @param {string} name - The task name.
   * @returns {boolean} True if the task exists, false otherwise.
   */
  Task.prototype.exists = function(name) {
    return name in this._tasks;
  };

  /**
   * Renames a task.
   * @param {string} oldname - The old task name.
   * @param {string} newname - The new task name.
   * @returns {Task} The task instance.
   */
  Task.prototype.renameTask = function(oldname, newname) {
    if (!this._tasks[oldname]) {
      throw new Error(`Cannot rename missing "${oldname}" task.`);
    }
    this._tasks[newname] = this._tasks[oldname];
    this._tasks[newname].name = newname;
    delete this._tasks[oldname];
    return this;
  };

  /**
   * Parses arguments into an array.
   * @param {Array} args - The arguments to parse.
   * @returns {Array} The parsed arguments.
   * @private
   */
  Task.prototype.parseArgs = function(args) {
    return Array.isArray(args[0]) ? args[0] : [].slice.call(args);
  };

  /**
   * Splits a colon-delimited string into an array.
   * @param {string} str - The string to split.
   * @returns {Array} The split string.
   * @private
   */
  Task.prototype.splitArgs = function(str) {
    if (!str) return [];
    str = str.replace(/\\\\/g, '\uFFFF').replace(/\\:/g, '\uFFFE');
    return str.split(':').map(function(s) {
      return s.replace(/\uFFFE/g, ':').replace(/\uFFFF/g, '\\');
    });
  };

  /**
   * Gets the task and arguments from a task name.
   * @param {string} name - The task name.
   * @returns {Object} The task and arguments.
   * @private
   */
  Task.prototype._taskPlusArgs = function(name) {
    const parts = this.splitArgs(name);
    let i = parts.length;
    let task;
    do {
      task = this._tasks[parts.slice(0, i).join(':')];
      if (!task && --i > 0) continue;
    } while (!task && i > 0);
    const args = parts.slice(i);
    const flags = {};
    args.forEach(function(arg) { flags[arg] = true; });
    return { task, nameArgs: name, args, flags };
  };

  /**
   * Appends tasks to the queue.
   * @param {Array} things - The tasks to append.
   * @private
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
   * Enqueues a task.
   * @param {...string} args - The task names.
   * @returns {Task} The task instance.
   */
  Task.prototype.run = function() {
    const things = this.parseArgs(arguments).map(this._taskPlusArgs, this);
    const fails = things.filter(function(thing) { return !thing.task; });
    if (fails.length > 0) {
      this._throwIfRunning(new Error(`Task "${fails[0].nameArgs}" not found.`));
      return this;
    }
    this._push(things);
    return this;
  };

  /**
   * Adds a marker to the queue.
   * @returns {Task} The task instance.
   */
  Task.prototype.mark = function() {
    this._push(this._marker);
    return this;
  };

  /**
   * Runs a task function.
   * @param {Object} context - The task context.
   * @param {Function} fn - The task function.
   * @param {Function} done - The done callback.
   * @param {boolean} [asyncDone] - Whether to call done asynchronously.
   * @private
   */
  Task.prototype.runTaskFn = function(context, fn, done, asyncDone) {
    let async = false;

    const complete = function(success) {
      let err = null;
      if (success === false) {
        err = new Error(`Task "${context.nameArgs}" failed.`);
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
      const success = fn.call(context);
      if (!async) {
        complete(success);
      }
    } catch (err) {
      complete(err);
    }
  };

  /**
   * Starts the task queue processing.
   * @param {Object} [opts] - The options.
   * @returns {boolean} Whether the queue was started.
   */
  Task.prototype.start = function(opts) {
    if (!opts) opts = {};
    if (this._running) return false;
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
   * Clears the remaining tasks from the queue.
   * @param {Object} [options] - The options.
   * @returns {Task} The task instance.
   */
  Task.prototype.clearQueue = function(options) {
    if (!options) options = {};
    if (options.untilMarker) {
      this._queue.splice(0, this._queue.indexOf(this._marker) + 1);
    } else {
      this._queue = [];
    }
    return this;
  };

  /**
   * Tests if all given tasks have succeeded.
   * @param {...string} args - The task names.
   */
  Task.prototype.requires = function() {
    this.parseArgs(arguments).forEach(function(name) {
      const success = this._success[name];
      if (!success) {
        throw new Error(`Required task "${name}" ${success === false ? 'failed' : 'must be run first'}.`);
      }
    }.bind(this));
  };

  /**
   * Overrides default options.
   * @param {Object} options - The options to override.
   */
  Task.prototype.options = function(options) {
    Object.keys(options).forEach(function(name) {
      this._options[name] = options[name];
    }.bind(this));
  };

}(typeof exports === 'object' && exports || this));