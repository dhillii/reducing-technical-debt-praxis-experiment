(function(exports) {
  'use strict';
  const grunt = require('../grunt');
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
  exports.create = () => new Task();
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
    this._tasks[name] = {name, info, fn};
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
    return Array.isArray(args[0]) ? args[0] : Array.from(args);
  };
  Task.prototype.splitArgs = function(str) {
    if (!str) { return []; }
    str = str.replace(/\\\\/g, '\uFFFF').replace(/\\:/g, '\uFFFE');
    return str.split(':').map(s => s.replace(/\uFFFE/g, ':').replace(/\uFFFF/g, '\\'));
  };
  Task.prototype._taskPlusArgs = function(name) {
    const parts = this.splitArgs(name);
    let i = parts.length;
    let task;
    do {
      task = this._tasks[parts.slice(0, i).join(':')];
    } while (!task && --i > 0);
    const args = parts.slice(i);
    const flags = {};
    args.forEach(arg => { flags[arg] = true; });
    return {task, nameArgs: name, args, flags};
  };
  Task.prototype._push = function(things) {
    const index = this._queue.indexOf(this._placeholder);
    if (index === -1) {
      this._queue = this._queue.concat(things);
    } else {
      this._queue.splice(index, 0, ...things);
    }
  };
  Task.prototype.run = function() {
    const things = this.parseArgs(arguments).map(this._taskPlusArgs, this);
    const fails = things.filter(thing => !thing.task);
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
  Task.prototype.runTaskFn = function(context, fn, done, asyncDone) {
    let async = false;
    const complete = function(success) {
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
        process.nextTick(() => done(err, success));
      } else {
        done(err, success);
      }
    }.bind(this);
    context.async = () => {
      async = true;
      return grunt.util._.once(success => {
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
  Task.prototype.start = function(opts) {
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
      this.runTaskFn(context, () => thing.task.fn.apply(this, this.args), nextTask, !!opts.asyncDone);
    };
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
    this.parseArgs(arguments).forEach(name => {
      const success = this._success[name];
      if (!success) {
        throw new Error('Required task "' + name +
          '" ' + (success === false ? 'failed' : 'must be run first') + '.');
      }
    });
  };
  Task.prototype.options = function(options) {
    Object.keys(options).forEach(name => {
      this._options[name] = options[name];
    });
  };
}(typeof exports === 'object' && exports || this));