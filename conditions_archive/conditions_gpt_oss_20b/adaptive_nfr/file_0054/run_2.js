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

  /**
   * Throw an exception if the task runner is running or an error handler is not defined.
   * Otherwise, call the error handler directly.
   */
  Task.prototype._throwIfRunning = function(obj) {
    if (this._running || !this._options.error) {
      throw obj;
    }
    this._options.error.call({name: null}, obj);
  };

  /**
   * Strategy handlers for registering tasks.
   */
  const registerHandlers = {
    alias: function(task, fn, info) {
      const tasks = this.parseArgs([fn]);
      fn = this.run.bind(this, fn);
      fn.alias = true;
      if (!info) {
        info = 'Alias for "' + tasks.join('", "') + '" task' +
          (tasks.length === 1 ? '' : 's') + '.';
      }
      return {name: task, info, fn};
    },
    custom: function(task, fn, info) {
      if (!info) {
        info = 'Custom task.';
      }
      return {name: task, info, fn};
    }
  };

  /**
   * Register a new task.
   */
  Task.prototype.registerTask = function(name, info, fn) {
    if (fn == null) {
      fn = info;
      info = null;
    }
    const handler = typeof fn === 'function' ? registerHandlers.custom : registerHandlers.alias;
    const taskDef = handler.call(this, name, fn, info);
    this._tasks[name] = taskDef;
    return this;
  };

  /**
   * Is the specified task an alias?
   */
  Task.prototype.isTaskAlias = function(name) {
    return !!this._tasks[name].fn.alias;
  };

  /**
   * Has the specified task been registered?
   */
  Task.prototype.exists = function(name) {
    return name in this._tasks;
  };

  /**
   * Rename a task.
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
   * Argument parsing helper.
   */
  Task.prototype.parseArgs = function(args) {
    return Array.isArray(args[0]) ? args[0] : [].slice.call(args);
  };

  /**
   * Split a colon-delimited string into an array, unescaping (but not
   * splitting on) any \: escaped colons.
   */
  Task.prototype.splitArgs = function(str) {
    if (!str) { return []; }
    const placeholder = '\uFFFF';
    const escapedColon = '\uFFFE';
    str = str.replace(/\\\\/g, placeholder).replace(/\\:/g, escapedColon);
    return str.split(':').map(function(s) {
      return s.replace(new RegExp(escapedColon, 'g'), ':')
              .replace(new RegExp(placeholder, 'g'), '\\');
    });
  };

  /**
   * Find task and build args/flags.
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
    return {task, nameArgs: name, args, flags};
  };

  /**
   * Append things to queue in the correct spot.
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
   * Add a marker to the queue to facilitate clearing it programmatically.
   */
  Task.prototype.mark = function() {
    this._push(this._marker);
    return this;
  };

  /**
   * Handle completion of a task.
   */
  function handleCompletion(context, success, done, asyncDone, options) {
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

  /**
   * Run a task function, handling this.async / return value.
   */
  Task.prototype.runTaskFn = function(context, fn, done, asyncDone) {
    let async = false;
    const complete = handleCompletion.bind(this, context, done, asyncDone, this._options);

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
   * Get next task from queue, skipping placeholders and markers.
   */
  function getNextTask(queue, placeholder, marker) {
    let thing;
    do {
      thing = queue.shift();
    } while (thing === placeholder || thing === marker);
    return thing;
  }

  /**
   * Process a single task.
   */
  Task.prototype._processTask = function(nextTask, opts) {
    const thing = getNextTask(this._queue, this._placeholder, this._marker);
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
  };

  /**
   * Begin task queue processing. Ie. run all tasks.
   */
  Task.prototype.start = function(opts) {
    opts = opts || {};
    if (this._running) { return false; }
    this._running = true;
    const nextTask = this._processTask.bind(this, this._processTask, opts);
    nextTask();
  };

  /**
   * Clear remaining tasks from the queue.
   */
  Task.prototype.clearQueue = function(options) {
    options = options || {};
    if (options.untilMarker) {
      this._queue.splice(0, this._queue.indexOf(this._marker) + 1);
    } else {
      this._queue = [];
    }
    return this;
  };

  /**
   * Test to see if all of the given tasks have succeeded.
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
   * Override default options.
   */
  Task.prototype.options = function(options) {
    Object.keys(options).forEach(function(name) {
      this._options[name] = options[name];
    }.bind(this));
  };

}(typeof exports === 'object' && exports || this));