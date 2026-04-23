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

  const COFFEE_EXTENSIONS = ['.coffee', '.litcoffee', '.coffee.md'];
  const errorMessage = 'Grunt attempted to load a .coffee file but CoffeeScript was not installed.\n' +
    'Please run `npm install --dev coffeescript` to enable loading CoffeeScript.';

  COFFEE_EXTENSIONS.forEach(function(ext) {
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

// Initialize core utilities and logging
function initializeCoreModules() {
  const util = require('grunt-legacy-util');
  grunt.util = util;
  grunt.util.task = require('./util/task');

  const Log = require('grunt-legacy-log').Log;
  const log = new Log({grunt: grunt});
  grunt.log = log;

  return log;
}

// Load all internal grunt modules
function loadGruntModules() {
  gRequire('template');
  gRequire('event');
  const fail = gRequire('fail');
  gRequire('file');
  const option = gRequire('option');
  const config = gRequire('config');
  const task = gRequire('task');
  const help = gRequire('help');
  gRequire('cli');
  grunt.verbose = grunt.log.verbose;

  return { fail, option, config, task, help };
}

// Expose task-related methods on grunt
function exposeTaskMethods(task, config, fail) {
  gExpose(task, 'registerTask');
  gExpose(task, 'registerMultiTask');
  gExpose(task, 'registerInitTask');
  gExpose(task, 'renameTask');
  gExpose(task, 'loadTasks');
  gExpose(task, 'loadNpmTasks');
  gExpose(config, 'init', 'initConfig');
  gExpose(fail, 'warn');
  gExpose(fail, 'fatal');
}

// Handle --version flag display
function handleVersionFlag(option) {
  if (!option('version')) {
    return false;
  }

  grunt.log.writeln('grunt v' + grunt.version);

  if (option('verbose')) {
    displayVerboseVersionInfo();
  }

  return true;
}

// Display verbose version information and available tasks/options
function displayVerboseVersionInfo() {
  const verbose = grunt.verbose;
  verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));

  grunt.log.muted = true;
  grunt.task.init([], {help: true});
  grunt.log.muted = false;

  const availableTasks = Object.keys(grunt.task._tasks).sort();
  verbose.writeln('Available tasks: ' + availableTasks.join(' '));

  const availableOptions = [];
  Object.keys(grunt.cli.optlist).forEach(function(long) {
    const o = grunt.cli.optlist[long];
    availableOptions.push('--' + (o.negate ? 'no-' : '') + long);
    if (o.short) {
      availableOptions.push('-' + o.short);
    }
  });
  verbose.writeln('Available options: ' + availableOptions.join(' '));
}

// Handle --help flag display
function handleHelpFlag(option, help) {
  if (!option('help')) {
    return false;
  }

  help.display();
  return true;
}

// Parse and initialize tasks for execution
function initializeTasks(tasks, task, option) {
  const tasksSpecified = tasks && tasks.length > 0;
  const parsedTasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  task.init(parsedTasks, option);

  return { parsedTasks, tasksSpecified };
}

// Setup task completion handlers
function setupTaskHandlers(task, fail, done, util) {
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
function executeTasks(tasks, task) {
  tasks.forEach(function(name) {
    task.run(name);
  });
  task.start({asyncDone: true});
}

// Initialize grunt on module load
registerCoffeeScriptSupport();

const log = initializeCoreModules();
const { fail, option, config, task, help } = loadGruntModules();

exposeTaskMethods(task, config, fail);

grunt.package = require('../package.json');
grunt.version = grunt.package.version;

// Main task execution interface
grunt.tasks = function(tasks, options, done) {
  option.init(options);

  if (handleVersionFlag(option)) {
    return;
  }

  log.initColors();

  if (handleHelpFlag(option, help)) {
    return;
  }

  grunt.verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  const { parsedTasks, tasksSpecified } = initializeTasks(tasks, task, options);

  grunt.verbose.writeln();
  if (!tasksSpecified) {
    grunt.verbose.writeln('No tasks specified, running default tasks.');
  }
  grunt.verbose.writeflags(parsedTasks, 'Running tasks');

  setupTaskHandlers(task, fail, done, grunt.util);
  executeTasks(parsedTasks, task);
};