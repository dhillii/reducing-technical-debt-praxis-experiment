'use strict';

const path = require('path');

// Register CoffeeScript support if available
function registerCoffeeScriptSupport() {
  try {
    require('coffeescript/register');
  } catch (e) {
    registerCoffeeScriptErrorHandler();
  }
}

// Handle missing CoffeeScript with helpful error messages
function registerCoffeeScriptErrorHandler() {
  if (!require.extensions) {
    return;
  }

  const FILE_EXTENSIONS = ['.coffee', '.litcoffee', '.coffee.md'];
  const errorMessage = 'Grunt attempted to load a .coffee file but CoffeeScript was not installed.\n' +
    'Please run `npm install --dev coffeescript` to enable loading CoffeeScript.';

  FILE_EXTENSIONS.forEach(function(ext) {
    require.extensions[ext] = function() {
      throw new Error(errorMessage);
    };
  });
}

const grunt = module.exports = {};

// Load and expose internal grunt libraries
function gRequire(name) {
  return grunt[name] = require('./grunt/' + name);
}

// Expose a method from an object onto the grunt object
function gExpose(obj, methodName, newMethodName) {
  grunt[newMethodName || methodName] = obj[methodName].bind(obj);
}

// Initialize utilities and logging
const util = require('grunt-legacy-util');
grunt.util = util;
grunt.util.task = require('./util/task');

const Log = require('grunt-legacy-log').Log;
const log = new Log({grunt: grunt});
grunt.log = log;

// Load core modules
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

// Expose grunt metadata
grunt.package = require('../package.json');
grunt.version = grunt.package.version;

// Expose task methods
gExpose(task, 'registerTask');
gExpose(task, 'registerMultiTask');
gExpose(task, 'registerInitTask');
gExpose(task, 'renameTask');
gExpose(task, 'loadTasks');
gExpose(task, 'loadNpmTasks');

// Expose config and fail methods
gExpose(config, 'init', 'initConfig');
gExpose(fail, 'warn');
gExpose(fail, 'fatal');

// Handle --version flag display
function handleVersionFlag() {
  log.writeln('grunt v' + grunt.version);

  if (!option('verbose')) {
    return;
  }

  verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
  grunt.log.muted = true;
  grunt.task.init([], {help: true});
  grunt.log.muted = false;

  displayAvailableTasks();
  displayAvailableOptions();
}

// Display available tasks for shell completion
function displayAvailableTasks() {
  const tasks = Object.keys(grunt.task._tasks).sort();
  verbose.writeln('Available tasks: ' + tasks.join(' '));
}

// Display available CLI options for shell completion
function displayAvailableOptions() {
  const options = [];
  Object.keys(grunt.cli.optlist).forEach(function(long) {
    const o = grunt.cli.optlist[long];
    options.push('--' + (o.negate ? 'no-' : '') + long);
    if (o.short) {
      options.push('-' + o.short);
    }
  });
  verbose.writeln('Available options: ' + options.join(' '));
}

// Parse and initialize tasks to be executed
function initializeTasks(tasks) {
  const tasksSpecified = tasks && tasks.length > 0;
  const parsedTasks = task.parseArgs([tasksSpecified ? tasks : 'default']);
  task.init(parsedTasks, {});

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(parsedTasks, 'Running tasks');

  return parsedTasks;
}

// Setup task completion handlers
function setupTaskHandlers(done) {
  const uncaughtHandler = function(e) {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
  process.on('uncaughtException', uncaughtHandler);

  task.options({
    error: function(e) {
      fail.warn(e, fail.code.TASK_FAILURE);
    },
    done: function() {
      process.removeListener('uncaughtException', uncaughtHandler);
      fail.report();

      if (done) {
        done();
      } else {
        util.exit(0);
      }
    }
  });

  return uncaughtHandler;
}

// Execute all specified tasks
function executeTasks(tasks) {
  tasks.forEach(function(name) {
    task.run(name);
  });
  task.start({asyncDone: true});
}

// Main task execution interface
grunt.tasks = function(tasks, options, done) {
  option.init(options);

  if (option('version')) {
    handleVersionFlag();
    return;
  }

  log.initColors();

  if (option('help')) {
    help.display();
    return;
  }

  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  const parsedTasks = initializeTasks(tasks);
  setupTaskHandlers(done);
  executeTasks(parsedTasks);
};

registerCoffeeScriptSupport();