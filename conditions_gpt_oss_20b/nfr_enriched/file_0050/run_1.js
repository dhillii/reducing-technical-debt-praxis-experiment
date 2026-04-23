'use strict';

// Nodejs libs.
const path = require('path');

// This allows grunt to require() .coffee files.
try {
  // Note: grunt no longer depends on CoffeeScript, it will only use it if it is intentionally
  // installed in the project.
  require('coffeescript/register');
} catch (e) {
  // This is fine, and will cause no problems so long as the user doesn't load .coffee files.
  // Print a useful error if we attempt to load a .coffee file.
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

// The module to be exported.
const grunt = module.exports = {};

// Expose internal grunt libs.
function gRequire(name) {
  return grunt[name] = require('./grunt/' + name);
}

const util = require('grunt-legacy-util');
grunt.util = util;
grunt.util.task = require('./util/task');

const Log = require('grunt-legacy-log').Log;
const log = new Log({ grunt: grunt });
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

// Expose some grunt metadata.
grunt.package = require('../package.json');
grunt.version = grunt.package.version;

// Expose specific grunt lib methods on grunt.
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

// Helper: handle --version option.
function handleVersionOption() {
  if (!option('version')) {
    return false;
  }
  log.writeln('grunt v' + grunt.version);
  if (option('verbose')) {
    verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
    grunt.log.muted = true;
    grunt.task.init([], { help: true });
    grunt.log.muted = false;
    const tasks = Object.keys(grunt.task._tasks).sort();
    verbose.writeln('Available tasks: ' + tasks.join(' '));
    const options = [];
    Object.keys(grunt.cli.optlist).forEach(function (long) {
      const o = grunt.cli.optlist[long];
      options.push('--' + (o.negate ? 'no-' : '') + long);
      if (o.short) {
        options.push('-' + o.short);
      }
    });
    verbose.writeln('Available options: ' + options.join(' '));
  }
  return true;
}

// Helper: handle --help option.
function handleHelpOption() {
  if (!option('help')) {
    return false;
  }
  help.display();
  return true;
}

// Helper: initialize tasks and options.
function initializeTasks(tasks, options) {
  const tasksSpecified = tasks && tasks.length > 0;
  const parsedTasks = task.parseArgs([tasksSpecified ? tasks : 'default']);
  task.init(parsedTasks, options);
  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(parsedTasks, 'Running tasks');
  return parsedTasks;
}

// Helper: setup uncaught exception handling.
function setupUncaughtHandler() {
  const uncaughtHandler = function (e) {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
  process.on('uncaughtException', uncaughtHandler);
  return uncaughtHandler;
}

// Helper: configure task options callbacks.
function configureTaskCallbacks(uncaughtHandler) {
  task.options({
    error: function (e) {
      fail.warn(e, fail.code.TASK_FAILURE);
    },
    done: function () {
      process.removeListener('uncaughtException', uncaughtHandler);
      fail.report();
      if (grunt.tasks._done) {
        grunt.tasks._done();
      } else {
        util.exit(0);
      }
    }
  });
}

// Helper: run tasks sequentially.
function runTasks(taskNames) {
  taskNames.forEach(function (name) {
    task.run(name);
  });
  task.start({ asyncDone: true });
}

// Expose the task interface.
grunt.tasks = function (tasks, options, done) {
  grunt.tasks._done = done;
  option.init(options);
  log.initColors();

  if (handleVersionOption()) {
    return;
  }
  if (handleHelpOption()) {
    return;
  }

  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  const parsedTasks = initializeTasks(tasks, options);
  const uncaughtHandler = setupUncaughtHandler();
  configureTaskCallbacks(uncaughtHandler);
  runTasks(parsedTasks);
};