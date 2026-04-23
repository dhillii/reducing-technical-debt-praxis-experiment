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
    for (const ext of FILE_EXTENSIONS) {
      require.extensions[ext] = function () {
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
function handleVersionFlag() {
  if (!option('version')) {
    return false;
  }

  log.writeln('grunt v' + grunt.version);

  if (option('verbose')) {
    verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
    grunt.log.muted = true;
    grunt.task.init([], { help: true });
    grunt.log.muted = false;

    const taskNames = Object.keys(grunt.task._tasks).sort();
    verbose.writeln('Available tasks: ' + taskNames.join(' '));

    const optionList = [];
    Object.keys(grunt.cli.optlist).forEach(function (long) {
      const o = grunt.cli.optlist[long];
      optionList.push('--' + (o.negate ? 'no-' : '') + long);
      if (o.short) {
        optionList.push('-' + o.short);
      }
    });
    verbose.writeln('Available options: ' + optionList.join(' '));
  }

  return true;
}

/**
 * Initializes colors and displays help if requested.
 * Returns true if processing should stop after handling help.
 */
function handleHelpFlag() {
  log.initColors();

  if (option('help')) {
    help.display();
    return true;
  }
  return false;
}

/**
 * Parses command‑line tasks and initializes the task system.
 */
function parseAndInitializeTasks(rawTasks) {
  const tasksSpecified = rawTasks && rawTasks.length > 0;
  const tasks = task.parseArgs([tasksSpecified ? rawTasks : 'default']);
  task.init(tasks, option());
  return { tasks, tasksSpecified };
}

/**
 * Sets up a temporary uncaught‑exception handler.
 */
function registerUncaughtHandler() {
  const handler = function (e) {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
  process.on('uncaughtException', handler);
  return handler;
}

/**
 * Configures task options for error handling and completion.
 */
function configureTaskCallbacks(uncaughtHandler, done) {
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
    },
  });
}

/**
 * Executes the list of tasks and starts the async runner.
 */
function executeTasks(taskList) {
  taskList.forEach(function (name) {
    task.run(name);
  });
  task.start({ asyncDone: true });
}

/**
 * Primary entry point for running grunt tasks.
 */
grunt.tasks = function (tasks, options, done) {
  // Update options with passed‑in options.
  option.init(options);

  // Handle version flag early.
  if (handleVersionFlag()) {
    return;
  }

  // Handle help flag early.
  if (handleHelpFlag()) {
    return;
  }

  // Header and flags.
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  // Parse and initialize tasks.
  const { tasks: taskList, tasksSpecified } = parseAndInitializeTasks(tasks);

  // Display task information.
  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(taskList, 'Running tasks');

  // Register temporary uncaught‑exception handler.
  const uncaughtHandler = registerUncaughtHandler();

  // Configure task callbacks.
  configureTaskCallbacks(uncaughtHandler, done);

  // Run tasks.
  executeTasks(taskList);
};