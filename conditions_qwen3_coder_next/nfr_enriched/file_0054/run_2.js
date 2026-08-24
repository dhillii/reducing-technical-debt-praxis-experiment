'use strict';

var grunt = require('../grunt');

// Construct-o-rama.
function Task() {
  this.current = {};
  this._tasks = {};
  this._queue = [];
  this._placeholder = {placeholder: true};
  this._marker = {marker: true};
  this._options = {};
  this._running = false;
  this._success = {};
}

// Expose the constructor function.
exports.Task = Task;

// Create a new Task instance.
exports.create = function() {
  return new Task();
};

// Throw exception if running or invoke error handler if defined.
Task.prototype._throwIfRunning = function(obj) {
  if (this._running || !this._options.error) {
    throw obj;
  } else {
    this._options.error.call({name: null}, obj);
  }
};

// Register a new task with optional info and function.
Task.prototype.registerTask = function(name, info, fn) {
  if (fn == null) {
    fn = info;
    info = null;
  }

  if (typeof fn !== 'function') {
    fn = this.run.bind(this, fn);
    fn.alias = true;
    var tasks = this.parseArgs([fn]);
    info = info || ('Alias for "' + tasks.join('", "') + '" task' +
      (tasks.length === 1 ? '' : 's') + '.');
  } else if (!info) {
    info = 'Custom task.';
  }

  this._tasks[name] = {name: name, info: info, fn: fn};
  return this;
};

// Check if task is an alias.
Task.prototype.isTaskAlias = function(name) {
  return !!this._tasks[name].fn.alias;
};

// Check if task exists.
Task.prototype.exists = function(name) {
  return name in this._tasks;
};

// Rename a registered task.
Task.prototype.renameTask = function(oldname, newname) {
  if (!this._tasks[oldname]) {
    throw new Error('Cannot rename missing "' + oldname + '" task.');
  }
  this._tasks[newname] = this._tasks[oldname];
  this._tasks[newname].name = newname;
  delete this._tasks[oldname];
  return this;
};

// Parse arguments into array format.
Task.prototype.parseArgs = function(args) {
  return Array.isArray(args[0]) ? args[0] : [].slice.call(args);
};

// Split colon-delimited string, respecting escaped colons.
Task.prototype.splitArgs = function(str) {
  if (!str) { return []; }
  str = str.replace(/\\\\/g, '\uFFFF').replace(/\\:/g, '\uFFFE');
  return str.split(':').map(function(s) {
    return s.replace(/\uFFFE/g, ':').replace(/\uFFFF/g, '\\');
  });
};

// Determine actual task and args based on hierarchical lookup.
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

// Insert items into queue at appropriate position relative to placeholder.
Task.prototype._push = function(things) {
  var index = this._queue.indexOf(this._placeholder);
  if (index === -1) {
    this._queue = this._queue.concat(things);
  } else {
    [].splice.apply(this._queue, [index, 0].concat(things));
  }
};

// Enqueue one or more tasks.
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

// Add a queue marker.
Task.prototype.mark = function() {
  this._push(this._marker);
  return this;
};

// Run a task function and handle async/sync completion.
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

// Start executing the task queue.
Task.prototype.start = function(opts) {
  opts = opts || {};
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

// Clear queue contents, optionally up to next marker.
Task.prototype.clearQueue = function(options) {
  options = options || {};
  if (options.untilMarker) {
    var markerIndex = this._queue.indexOf(this._marker);
    if (markerIndex !== -1) {
      this._queue.splice(0, markerIndex + 1);
    } else {
      this._queue = [];
    }
  } else {
    this._queue = [];
  }
  return this;
};

// Require one or more tasks to have succeeded.
Task.prototype.requires = function() {
  var names = this.parseArgs(arguments);
  names.forEach(function(name) {
    var success = this._success[name];
    if (!success) {
      throw new Error('Required task "' + name +
        '" ' + (success === false ? 'failed' : 'must be run first') + '.');
    }
  }.bind(this));
};

// Merge options into internal options store.
Task.prototype.options = function(options) {
  Object.keys(options).forEach(function(name) {
    this._options[name] = options[name];
  }.bind(this));
};