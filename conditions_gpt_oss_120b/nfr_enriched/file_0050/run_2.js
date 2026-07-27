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
const grunt = (module.exports = {});

// Expose internal grunt libs.
function gRequire(name) {
  return (grunt[name] = require('./grunt/' + name));
}

const util = require('grunt-legacy-util');
grunt.util = util;
grunt.util.task = require('./util/task');

const Log = require('grunt-legacy-log').Log;
const log = new Log({ grunt });
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
const verbose = (grunt.verbose = log.verbose);

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

/**
 * Handles the --version flag, including verbose output.
 * Returns true if processing should stop after handling version.
 */
function handleVersionOption() {
  if (!option('version')) {
    return false;
  }

  log.writeln('grunt v' + grunt.version);

  if (option('verbose')) {
    verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
    // Suppress verbose task initialization logs.
    grunt.log.muted = true;
    grunt.task.init([], { help: true });
    grunt.log.muted = false;

    const availableTasks = Object.keys(grunt.task._tasks).sort();
    verbose.writeln('Available tasks: ' + availableTasks.join(' '));

    const availableOptions = [];
    Object.keys(grunt.cli.optlist).forEach(function (long) {
      const o = grunt.cli.optlist[long];
      availableOptions.push('--' + (o.negate ? 'no-' : '') + long);
      if (o.short) {
        availableOptions.push('-' + o.short);
      }
    });
    verbose.writeln('Available options: ' + availableOptions.join(' '));
  }

  return true;
}

/**
 * Initializes colors and displays help if requested.
 * Returns true if processing should stop after handling help.
 */
function initColorsAndHelp() {
  log.initColors();

  if (option('help')) {
    help.display();
    return true;
  }
  return false;
}

/**
 * Writes header information, parses task arguments, and initializes tasks.
 * Returns the parsed task list.
 */
function prepareTasks(tasks) {
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  const tasksSpecified = tasks && tasks.length > 0;
  const parsed = task.parseArgs([tasksSpecified ? tasks : 'default']);

  task.init(parsed, option());

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(parsed, 'Running tasks');

  return parsed;
}

/**
 * Sets up a temporary uncaughtException handler for task execution.
 * Returns a function to remove the handler.
 */
function setupUncaughtHandler() {
  const handler = function (e) {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
  process.on('uncaughtException', handler);
  return function removeHandler() {
    process.removeListener('uncaughtException', handler);
  };
}

/**
 * Configures task options for error handling and completion.
 */
function configureTaskCallbacks(removeUncaughtHandler, done) {
  task.options({
    error: function (e) {
      fail.warn(e, fail.code.TASK_FAILURE);
    },
    done: function () {
      // Clean up the uncaught exception listener.
      removeUncaughtHandler();

      // Output final report.
      fail.report();

      if (done) {
        done();
      } else {
        util.exit(0);
      }
    },
  });
}

/**
 * Executes the provided task list.
 */
function executeTaskList(taskList) {
  taskList.forEach(function (name) {
    task.run(name);
  });
  // Run tasks async internally to reduce call-stack, per:
  // https://github.com/gruntjs/grunt/pull/1026
  task.start({ asyncDone: true });
}

/**
 * Primary entry point for running Grunt tasks.
 */
grunt.tasks = function (tasks, options, done) {
  // Update options with passed-in options.
  option.init(options);

  // Handle version flag early.
  if (handleVersionOption()) {
    return;
  }

  // Initialize colors and possibly display help.
  if (initColorsAndHelp()) {
    return;
  }

  // Prepare tasks and environment.
  const taskList = prepareTasks(tasks);

  // Set up uncaught exception handling.
  const removeUncaughtHandler = setupUncaughtHandler();

  // Configure task callbacks for error handling and completion.
  configureTaskCallbacks(removeUncaughtHandler, done);

  // Execute tasks.
  executeTaskList(taskList);
};