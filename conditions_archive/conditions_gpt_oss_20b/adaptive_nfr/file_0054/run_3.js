(function (exports) {
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

  /**
   * If the task runner is running or an error handler is not defined, throw
   * an exception. Otherwise, call the error handler directly.
   */
  Task.prototype._throwIfRunning = function (obj) {
    if (this._running || !this._options.error) {
      throw obj;
    }
    this._options.error.call({ name: null }, obj);
  };

  /**
   * Register a new task.
   */
  Task.prototype.registerTask = function (name, info, fn) {
    if (fn == null) {
      fn = info;
      info = null;
    }
    if (typeof fn !== 'function') {
      const tasks = this.parseArgs([fn]);
      fn = this.run.bind(this, fn);
      fn.alias = true;
      if (!info) {
        info = `Alias for "${tasks.join('", "')}" task${tasks.length === 1 ? '' : 's'}.`;
      }
    } else if (!info) {
      info = 'Custom task.';
    }
    this._tasks[name] = { name, info, fn };
    return this;
  };

  /**
   * Is the specified task an alias?
   */
  Task.prototype.isTaskAlias = function (name) {
    const task = this._tasks[name];
    return !!(task && task.fn.alias);
  };

  /**
   * Has the specified task been registered?
   */
  Task.prototype.exists = function (name) {
    return name in this._tasks;
  };

  /**
   * Rename a task.
   */
  Task.prototype.renameTask = function (oldname, newname) {
    if (!this._tasks[oldname]) {
      throw new Error(`Cannot rename missing "${oldname}" task.`);
    }
    this._tasks[newname] = this._tasks[oldname];
    this._tasks[newname].name = newname;
    delete this._tasks[oldname];
    return this;
  };

  /**
   * Argument parsing helper.
   */
  Task.prototype.parseArgs = function (args) {
    return Array.isArray(args[0]) ? args[0] : [].slice.call(args);
  };

  /**
   * Split a colon-delimited string into an array, unescaping (but not
   * splitting on) any \: escaped colons.
   */
  Task.prototype.splitArgs = function (str) {
    if (!str) { return []; }
    const placeholder = '\uFFFF';
    const escapedColon = '\uFFFE';
    const escapedBackslash = '\\\\';
    const escapedColonPattern = /\\:/g;
    const escapedBackslashPattern = /\\\\/g;
    let processed = str.replace(escapedBackslashPattern, placeholder).replace(escapedColonPattern, escapedColon);
    return processed.split(':').map(s => s.replace(new RegExp(escapedColon, 'g'), ':').replace(new RegExp(placeholder, 'g'), '\\'));
  };

  /**
   * Given a task name, determine which actual task will be called, and what
   * arguments will be passed into the task callback.
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
    args.forEach(arg => { flags[arg] = true; });
    return { task, nameArgs: name, args, flags };
  };

  /**
   * Append things to queue in the correct spot.
   */
  Task.prototype._push = function (things) {
    const index = this._queue.indexOf(this._placeholder);
    if (index === -1) {
      this._queue = this._queue.concat(things);
    } else {
      this._queue.splice(index, 0, ...things);
    }
  };

  /**
   * Enqueue a task.
   */
  Task.prototype.run = function () {
    const things = this.parseArgs(arguments).map(this._taskPlusArgs, this);
    const fails = things.filter(thing => !thing.task);
    if (fails.length > 0) {
      this._throwIfRunning(new Error(`Task "${fails[0].nameArgs}" not found.`));
      return this;
    }
    this._push(things);
    return this;
  };

  /**
   * Add a marker to the queue to facilitate clearing it programmatically.
   */
  Task.prototype.mark = function () {
    this._push(this._marker);
    return this;
  };

  /**
   * Run a task function, handling this.async / return value.
   */
  Task.prototype.runTaskFn = function (context, fn, done, asyncDone) {
    let async = false;

    const complete = function (success) {
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
        process.nextTick(() => done(err, success));
      } else {
        done(err, success);
      }
    }.bind(this);

    context.async = function () {
      async = true;
      return grunt.util._.once(function (success) {
        setTimeout(() => complete(success), 1);
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
   * Begin task queue processing. Ie. run all tasks.
   */
  Task.prototype.start = function (opts) {
    opts = opts || {};
    if (this._running) { return false; }

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

      this.runTaskFn(
        context,
        function () {
          return thing.task.fn.apply(this, this.args);
        },
        nextTask,
        !!opts.asyncDone
      );
    };

    this._running = true;
    nextTask();
  };

  /**
   * Clear remaining tasks from the queue.
   */
  Task.prototype.clearQueue = function (options) {
    options = options || {};
    if (options.untilMarker) {
      const idx = this._queue.indexOf(this._marker);
      if (idx !== -1) {
        this._queue.splice(0, idx + 1);
      }
    } else {
      this._queue = [];
    }
    return this;
  };

  /**
   * Test to see if all of the given tasks have succeeded.
   */
  Task.prototype.requires = function () {
    this.parseArgs(arguments).forEach(name => {
      const success = this._success[name];
      if (!success) {
        throw new Error(`Required task "${name}" ${success === false ? 'failed' : 'must be run first'}.`);
      }
    });
  };

  /**
   * Override default options.
   */
  Task.prototype.options = function (options) {
    Object.keys(options).forEach(name => {
      this._options[name] = options[name];
    });
  };
}(typeof exports === 'object' && exports || this));