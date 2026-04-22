```javascript
(function(exports) {

  'use strict';

  const grunt = require('../grunt');

  /**
   * Task constructor.
   * @constructor
   */
  function Task() {
    /**
     * Information about the currently-running task.
     * @type {Object}
     */
    this.current = {};

    /**
     * Tasks.
     * @type {Object}
     */
    this._tasks = {};

    /**
     * Task queue.
     * @type {Array}
     */
    this._queue = [];

    /**
     * Queue placeholder (for dealing with nested tasks).
     * @type {Object}
     */
    this._placeholder = { placeholder: true };

    /**
     * Queue marker (for clearing the queue programmatically).
     * @type {Object}
     */
    this._marker = { marker: true };

    /**
     * Options.
     * @type {Object}
     */
    this._options = {};

    /**
     * Is the queue running?
     * @type {Boolean}
     */
    this._running = false;

    /**
     * Success status of completed tasks.
     * @type {Object}
     */
    this._success = {};
  }

  // Expose the constructor function.
  exports.Task = Task;

  /**
   * Create a new Task instance.
   * @returns {Task}
   */
  exports.create = function() {
    return new Task();
  };

  /**
   * If the task runner is running or an error handler is not defined, throw
   * an exception. Otherwise, call the error handler directly.
   * @param {Object} obj
   * @throws {Error}
   */
  Task.prototype._throwIfRunning = function(obj) {
    if (this._running || !this._options.error) {
      throw obj;
    } else {
      this._options.error.call({ name: null }, obj);
    }
  };

  /**
   * Register a new task.
   * @param {String} name
   * @param {String} [info]
   * @param {Function} [fn]
   * @returns {Task}
   */
  Task.prototype.registerTask = function(name, info, fn) {
    const tasks = this._parseTaskArguments(name, info, fn);
    this._tasks[name] = { name: name, info: info, fn: tasks.fn };
    return this;
  };

  /**
   * Parse task arguments.
   * @param {String} name
   * @param {String} [info]
   * @param {Function} [fn]
   * @returns {Object}
   * @private
   */
  Task.prototype._parseTaskArguments = function(name, info, fn) {
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
    return { fn, info };
  };

  /**
   * Is the specified task an alias?
   * @param {String} name
   * @returns {Boolean}
   */
  Task.prototype.isTaskAlias = function(name) {
    return !!this._tasks[name].fn.alias;
  };

  /**
   * Has the specified task been registered?
   * @param {String} name
   * @returns {Boolean}
   */
  Task.prototype.exists = function(name) {
    return name in this._tasks;
  };

  /**
   * Rename a task.
   * @param {String} oldname
   * @param {String} newname
   * @returns {Task}
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
   * Argument parsing helper.
   * @param {Array} args
   * @returns {Array}
   */
  Task.prototype.parseArgs = function(args) {
    return Array.isArray(args[0]) ? args[0] : [].slice.call(args);
  };

  /**
   * Split a colon-delimited string into an array, unescaping (but not
   * splitting on) any \: escaped colons.
   * @param {String} str
   * @returns {Array}
   */
  Task.prototype.splitArgs = function(str) {
    if (!str) { return []; }
    str = str.replace(/\\\\/g, '\uFFFF').replace(/\\:/g, '\uFFFE');
    return str.split(':').map(function(s) {
      return s.replace(/\uFFFE/g, ':').replace(/\uFFFF/g, '\\');
    });
  };

  /**
   * Given a task name, determine which actual task will be called, and what
   * arguments will be passed into the task callback.
   * @param {String} name
   * @returns {Object}
   * @private
   */
  Task.prototype._taskPlusArgs = function(name) {
    const parts = this.splitArgs(name);
    let i = parts.length;
    let task;
    do {
      task = this._tasks[parts.slice(0, i).join(':')];
      if (!task && --i > 0) { continue; }
    } while (!task && i > 0);
    const args = parts.slice(i);
    const flags = {};
    args.forEach(function(arg) { flags[arg] = true; });
    return { task: task, nameArgs: name, args: args, flags: flags };
  };

  /**
   * Append things to queue in the correct spot.
   * @param {Array} things
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
   * Enqueue a task.
   * @returns {Task}
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
   * Add a marker to the queue to facilitate clearing it programmatically.
   * @returns {Task}
   */
  Task.prototype.mark = function() {
    this._push(this._marker);
    return this;
  };

  /**
   * Run a task function, handling this.async / return value.
   * @param {Object} context
   * @param {Function} fn
   * @param {Function} done
   * @param {Boolean} asyncDone
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
   * Begin task queue processing. Ie. run all tasks.
   * @param {Object} opts
   * @returns {Boolean}
   */
  Task.prototype.start = function(opts) {
    if (!opts) {
      opts = {};
    }
    if (this._running) { return false; }
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
   * Clear remaining tasks from the queue.
   * @param {Object} options
   * @returns {Task}
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
   * Test to see if all of the given tasks have succeeded.
   * @throws {Error}
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
   * Override default options.
   * @param {Object} options
   */
  Task.prototype.options = function(options) {
    Object.keys(options).forEach(function(name) {
      this._options[name] = options[name];
    }.bind(this));
  };

}(typeof exports === 'object' && exports || this));
```