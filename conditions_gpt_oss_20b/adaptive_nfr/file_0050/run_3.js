'use strict';

const path = require('path');

try {
  require('coffeescript/register');
} catch (e) {
  if (require.extensions) {
    const FILE_EXTENSIONS = ['.coffee', '.litcoffee', '.coffee.md'];
    for (let i = 0; i < FILE_EXTENSIONS.length; i++) {
      require.extensions[FILE_EXTENSIONS[i]] = function () {
        throw new Error(
          'Grunt attempted to load a .coffee file but CoffeeScript was not installed.\n' +
          'Please run `npm install --dev coffeescript` to enable loading CoffeeScript.'
        );
      };
    }
  }
}

const grunt = module.exports = {};

function gRequire(name) {
  return grunt[name] = require('./grunt/' + name);
}

const util = require('grunt-legacy-util');
grunt.util = util;
grunt.util.task = require('./util/task');

const Log = require('grunt-legacy-log').Log;
const log = new Log({grunt: grunt});
grunt.log = log;

gRequire('template');
gRequire('event');
const fail = gRequire('fail');
gRequire('file');
const option = gRequire('option');
const config = gRequire('config');
const task = gRequire('task');
const help = gRequire('help');
gRequire('cli');
const verbose = grunt.verbose = log.verbose;

grunt.package = require('../package.json');
grunt.version = grunt.package.version;

function gExpose(obj, methodName, newMethodName) {
  grunt[newMethodName || methodName] = obj[methodName].bind(obj);
}
gExpose(task, 'registerTask');
gExpose(task, 'registerMultiTask');
gExpose(task, 'registerInitTask');
gExpose(task, 'renameTask');
gExpose(task, 'loadTasks');
gExpose(task, 'loadNpmTasks');
gExpose(config, 'init', 'initConfig');
gExpose(fail, 'warn');
gExpose(fail, 'fatal');

grunt.tasks = function (tasks, options, done) {
  option.init(options);

  if (isVersionOption()) {
    return handleVersionOption();
  }

  log.initColors();

  if (isHelpOption()) {
    help.display();
    return;
  }

  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  const tasksSpecified = tasks && tasks.length > 0;
  tasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  task.init(tasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(tasks, 'Running tasks');

  const uncaughtHandler = function (e) {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
  process.on('uncaughtException', uncaughtHandler);

  task.options({
    error: function (e) {
      fail.warn(e, fail.code.TASK_FAILURE);
    },
    done: function () {
      process.removeListener('uncaughtException', uncaughtHandler);
      fail.report();

      if (done) {
        done();
      } else {
        util.exit(0);
      }
    }
  });

  tasks.forEach(function (name) {
    task.run(name);
  });
  task.start({asyncDone: true});
};

function isVersionOption() {
  return option('version');
}

function handleVersionOption() {
  log.writeln('grunt v' + grunt.version);

  if (option('verbose')) {
    verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
    grunt.log.muted = true;
    grunt.task.init([], {help: true});
    grunt.log.muted = false;

    const _tasks = Object.keys(grunt.task._tasks).sort();
    verbose.writeln('Available tasks: ' + _tasks.join(' '));

    const _options = [];
    Object.keys(grunt.cli.optlist).forEach(function (long) {
      const o = grunt.cli.optlist[long];
      _options.push('--' + (o.negate ? 'no-' : '') + long);
      if (o.short) {
        _options.push('-' + o.short);
      }
    });
    verbose.writeln('Available options: ' + _options.join(' '));
  }

  return;
}

function isHelpOption() {
  return option('help');
}