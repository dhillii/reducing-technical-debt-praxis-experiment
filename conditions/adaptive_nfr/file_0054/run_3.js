```javascript
(function(exports) {

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

  exports.Task = Task;
  exports.create = function() {
    return new Task();
  };

  Task.prototype._throwIfRunning = function(obj) {
    if (this._running || !this._options.error) {
      throw obj;
    } else {
      this._options.error.call({name: null}, obj);
    }
  };

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

  Task.prototype.isTaskAlias = function(name) {
    return !!this._tasks[name].fn.alias;
  };

  Task.prototype.exists = function(name) {
    return name in this._tasks;
  };

  Task.prototype.renameTask = function(oldname, newname) {
    if (!this._tasks[oldname]) {
      throw new Error('Cannot rename missing "' + oldname + '" task.');
    }
    this._tasks[newname] = this._tasks[oldname];
    this._tasks[newname].name = newname;
    delete this._tasks[oldname];
    return this;
  };

  Task.prototype.parseArgs = function(args) {
    return Array.isArray(args[0]) ? args[0] : [].slice.call(args);
  };

  Task.prototype.splitArgs = function(str) {
    if (!str) { return []; }
    str = str.replace(/\\\\/g, '\uFFFF').replace(/\\:/g, '\uFFFE');
    return str.split(':').map(function(s) {
      return s.replace(/\uFFFE/g, ':').replace(/\uFFFF/g, '\\');
    });
  };

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

  Task.prototype._push = function(things) {
    var index = this._queue.indexOf(this._placeholder);
    if (index === -1) {
      this._queue = this._queue.concat(things);
    } else {
      [].splice.apply(this._queue, [index, 0].concat(things));
    }
  };

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

  Task.prototype.mark = function() {
    this._push(this._marker);
    return this;
  };

  Task.prototype._createCompleteHandler = function(context, done, asyncDone) {
    return function(success) {
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
  };

  Task.prototype.runTaskFn = function(context, fn, done, asyncDone) {
    var async = false;
    var complete = this._createCompleteHandler(context, done, asyncDone);

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

  Task.prototype._getNextQueueItem = function() {
    var thing;
    do {
      thing = this._queue.shift();
    } while (thing === this._placeholder || thing === this._marker);
    return thing;
  };

  Task.prototype._createTaskContext = function(thing) {
    return {
      nameArgs: thing.nameArgs,
      name: thing.task.name,
      args: thing.args,
      flags: thing.flags
    };
  };

  Task.prototype.start = function(opts) {
    opts = opts || {};

    if (this._running) { return false; }

    var nextTask = function() {
      var thing = this._getNextQueueItem();

      if (!thing) {
        this._running = false;
        if (this._options.done) {
          this._options.done();
        }
        return;
      }

      this._queue.unshift(this._placeholder);
      var context = this._createTaskContext(thing);

      this.runTaskFn(context, function() {
        return thing.task.fn.apply(this, this.args);
      }, nextTask, !!opts.asyncDone);

    }.bind(this);

    this._running = true;
    nextTask();
  };

  Task.prototype.clearQueue = function(options) {
    options = options || {};
    if (options.untilMarker) {
      this._queue.splice(0, this._queue.indexOf(this._marker) + 1);
    } else {
      this._queue = [];
    }
    return this;
  };

  Task.prototype.requires = function() {
    this.parseArgs(arguments).forEach(function(name) {
      var success = this._success[name];
      if (!success) {
        throw new Error('Required task "' + name +
          '" ' + (success === false ? 'failed' : 'must be run first') + '.');
      }
    }.bind(this));
  };

  Task.prototype.options = function(options) {
    Object.keys(options).forEach(function(name) {
      this._options[name] = options[name];
    }.bind(this));
  };

}(typeof exports === 'object' && exports || this));
```