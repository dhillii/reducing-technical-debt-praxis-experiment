(function (exports) {
  'use strict';

  const grunt = require('../grunt');

  /**
   * Determine if a value is an Error object.
   * @param {*} obj - Value to test.
   * @returns {boolean} True if obj is an Error.
   */
  function isError(obj) {
    return obj instanceof Error || Object.prototype.toString.call(obj) === '[object Error]';
  }

  /**
   * Construct-o-rama.
   */
  function Task() {
    /** @type {Object} Information about the currently-running task. */
    this.current = {};
    /** @type {Object} Tasks. */
    this._tasks = {};
    /** @type {Array} Task queue. */
    this._queue = [];
    /** @type {Object} Queue placeholder (for dealing with nested tasks). */
    this._placeholder = { placeholder: true };
    /** @type {Object} Queue marker (for clearing the queue programmatically). */
    this._marker = { marker: true };
    /** @type {Object} Options. */
    this._options = {};
    /** @type {boolean} Is the queue running? */
    this._running = false;
    /** @type {Object} Success status of completed tasks. */
    this._success = {};
  }

  // Expose the constructor function.
  exports.Task = Task;

  // Create a new Task instance.
  exports.create = function () {
    return new Task();
  };

  /**
   * If the task runner is running or an error handler is not defined, throw
   * an exception. Otherwise, call the error handler directly.
   * @param {*} obj - Error object to throw or pass to handler.
   */
  Task.prototype._throwIfRunning = function (obj) {
    if (this._running || !this._options.error) {
      throw obj;
    } else {
      this._options.error.call({ name: null }, obj);
    }
  };

  /**
   * Register a new task.
   * @param {string} name - Task name.
   * @param {string|function} info - Optional info string or task function.
   * @param {function} [fn] - Task function.
   * @returns {Task} Chainable.
   */
  Task.prototype.registerTask = function (name, info, fn) {
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
        info = 'Alias for "' + tasks.join('", "') + '" task' +
          (tasks.length === 1 ? '' : 's') + '.';
      }
    } else if (!info) {
      info = 'Custom task.';
    }
    this._tasks[name] = { name, info, fn };
    return this;
  };

  /**
   * Is the specified task an alias?
   * @param {string} name - Task name.
   * @returns {boolean}
   */
  Task.prototype.isTaskAlias = function (name) {
    return !!this._tasks[name].fn.alias;
  };

  /**
   * Has the specified task been registered?
   * @param {string} name - Task name.
   * @returns {boolean}
   */
  Task.prototype.exists = function (name) {
    return name in this._tasks;
  };

  /**
   * Rename a task.
   * @param {string} oldname - Existing task name.
   * @param {string} newname - New task name.
   * @returns {Task} Chainable.
   */
  Task.prototype.renameTask = function (oldname, newname) {
    if (!this._tasks[oldname]) {
      throw new Error('Cannot rename missing "' + oldname + '" task.');
    }
    this._tasks[newname] = this._tasks[oldname];
    this._tasks[newname].name = newname;
    delete this._tasks[oldname];
    return this;
  };

  /**
   * Argument parsing helper.
   * @param {Array} args - Arguments.
   * @returns {Array} Parsed arguments.
   */
  Task.prototype.parseArgs = function (args) {
    return Array.isArray(args[0]) ? args[0] : [].slice.call(args);
  };

  /**
   * Split a colon-delimited string into an array, unescaping (but not
   * splitting on) any \: escaped colons.
   * @param {string} str - Input string.
   * @returns {Array} Split parts.
   */
  Task.prototype.splitArgs = function (str) {
    if (!str) { return []; }
    str = str.replace(/\\\\/g, '\uFFFF').replace(/\\:/g, '\uFFFE');
    return str.split(':').map(function (s) {
      return s.replace(/\uFFFE/g, ':').replace(/\uFFFF/g, '\\');
    });
  };

  /**
   * Given a task name, determine which actual task will be called, and what
   * arguments will be passed into the task callback.
   * @param {string} name - Task name with optional args.
   * @returns {Object} Task info.
   */
  Task.prototype._taskPlusArgs = function (name) {
    const parts = this.splitArgs(name);
    let i = parts.length;
    let task;
    do {
      task = this._tasks[parts.slice(0, i).join(':')];
    } while (!task && --i > 0);
    const args = parts.slice(i);
    const flags = {};
    args.forEach(function (arg) { flags[arg] = true; });
    return { task, nameArgs: name, args, flags };
  };

  /**
   * Append things to queue in the correct spot.
   * @param {Array} things - Task+args objects.
   */
  Task.prototype._push = function (things) {
    const index = this._queue.indexOf(this._placeholder);
    if (index === -1) {
      this._queue = this._queue.concat(things);
    } else {
      [].splice.apply(this._queue, [index, 0].concat(things));
    }
  };

  /**
   * Enqueue a task.
   * @returns {Task} Chainable.
   */
  Task.prototype.run = function () {
    const things = this.parseArgs(arguments).map(this._taskPlusArgs, this);
    const fails = things.filter(function (thing) { return !thing.task; });
    if (fails.length > 0) {
      this._throwIfRunning(new Error('Task "' + fails[0].nameArgs + '" not found.'));
      return this;
    }
    this._push(things);
    return this;
  };

  /**
   * Add a marker to the queue to facilitate clearing it programmatically.
   * @returns {Task} Chainable.
   */
  Task.prototype.mark = function () {
    this._push(this._marker);
    return this;
  };

  /**
   * Run a task function, handling this.async / return value.
   * @param {Object} context - Task context.
   * @param {function} fn - Task function.
   * @param {function} done - Callback when task completes.
   * @param {boolean} asyncDone - Whether to call done asynchronously.
   */
  Task.prototype.runTaskFn = function (context, fn, done, asyncDone) {
    let async = false;

    const complete = (success) => {
      let err = null;
      if (success === false) {
        err = new Error(`Task "${context.nameArgs}" failed.`);
      } else if (isError(success)) {
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
        setTimeout(() => complete(success), 1);
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

  /**
   * Begin task queue processing. Ie. run all tasks.
   * @param {Object} [opts] - Options.
   */
  Task.prototype.start = function (opts = {}) {
    if (this._running) { return false; }
    this._running = true;

    const nextTask = () => {
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

      this.runTaskFn(context, () => thing.task.fn.apply(this, this.args), nextTask, !!opts.asyncDone);
    };

    nextTask();
  };

  /**
   * Clear remaining tasks from the queue.
   * @param {Object} [options] - Options.
   * @returns {Task} Chainable.
   */
  Task.prototype.clearQueue = function (options = {}) {
    if (options.untilMarker) {
      this._queue.splice(0, this._queue.indexOf(this._marker) + 1);
    } else {
      this._queue = [];
    }
    return this;
  };

  /**
   * Test to see if all of the given tasks have succeeded.
   * @throws {Error} If a required task failed or has not run.
   */
  Task.prototype.requires = function () {
    this.parseArgs(arguments).forEach(function (name) {
      const success = this._success[name];
      if (!success) {
        throw new Error('Required task "' + name +
          '" ' + (success === false ? 'failed' : 'must be run first') + '.');
      }
    }.bind(this));
  };

  /**
   * Override default options.
   * @param {Object} options - Options to set.
   */
  Task.prototype.options = function (options) {
    Object.keys(options).forEach(function (name) {
      this._options[name] = options[name];
    }.bind(this));
  };

}(typeof exports === 'object' && exports || this));