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
  // Print a useful error if we attempt to load .coffee file.
  if (require.extensions) {
    const FILE_EXTENSIONS = ['.coffee', '.litcoffee', '.coffee.md'];
    FILE_EXTENSIONS.forEach((extension) => {
      require.extensions[extension] = () => {
        throw new Error(
          'Grunt attempted to load a .coffee file but CoffeeScript was not installed.\n' +
          'Please run `npm install --dev coffeescript` to enable loading CoffeeScript.'
        );
      };
    });
  }
}

// The module to be exported.
const grunt = module.exports = {};

// Expose internal grunt libs.
function gRequire(name) {
  grunt[name] = require('./grunt/' + name);
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

// Check if version flag is set.
function isVersionFlagSet() {
  return option('version');
}

// Check if verbose flag is set.
function isVerboseFlagSet() {
  return option('verbose');
}

// Check if help flag is set.
function isHelpFlagSet() {
  return option('help');
}

// Display available tasks for shell completion.
function displayAvailableTasks() {
  const _tasks = Object.keys(grunt.task._tasks).sort();
  verbose.writeln('Available tasks: ' + _tasks.join(' '));
}

// Display available options for shell completion.
function displayAvailableOptions() {
  const _options = [];
  Object.keys(grunt.cli.optlist).forEach((long) => {
    const o = grunt.cli.optlist[long];
    _options.push('--' + (o.negate ? 'no-' : '') + long);
    if (o.short) { _options.push('-' + o.short); }
  });
  verbose.writeln('Available options: ' + _options.join(' '));
}

// Display grunt version and exit.
function displayVersion() {
  log.writeln('grunt v' + grunt.version);
}

// Display verbose installation path.
function displayVerboseInstallPath() {
  verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
}

// Initialize task system for listing available tasks.
function initTaskSystemForListing() {
  grunt.log.muted = true;
  grunt.task.init([], {help: true});
  grunt.log.muted = false;
}

// Display verbose header and command-line options.
function displayVerboseHeader() {
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');
}

// Determine and output which tasks will be run.
function determineAndOutputTasks(tasksSpecified) {
  tasks = task.parseArgs([tasksSpecified ? tasks : 'default']);
}

// Initialize tasks.
function initializeTasks(tasks, options) {
  task.init(tasks, options);
}

// Handle uncaught exceptions.
function handleUncaughtException(e) {
  fail.fatal(e, fail.code.TASK_FAILURE);
}

// Register uncaught exception handler.
function registerUncaughtExceptionHandler() {
  process.on('uncaughtException', handleUncaughtException);
}

// Remove uncaught exception handler.
function removeUncaughtExceptionHandler() {
  process.removeListener('uncaughtException', handleUncaughtException);
}

// Output final fail / success report.
function outputFinalReport() {
  fail.report();
}

// Execute done callback if provided.
function executeDoneCallback(done) {
  done();
}

// Explicitly exit if done callback is not provided.
function explicitlyExit() {
  util.exit(0);
}

// Execute all tasks in order.
function executeAllTasks(tasks) {
  tasks.forEach((name) => { task.run(name); });
}

// Start tasks asynchronously.
function startTasksAsync() {
  task.start({asyncDone: true});
}

// Expose the task interface.
grunt.tasks = function(tasks, options, done) {
  // Update options with passed-in options.
  option.init(options);

  // Display the grunt version and quit if the user did --version.
  if (isVersionFlagSet()) {
    displayVersion();

    if (isVerboseFlagSet()) {
      displayVerboseInstallPath();
      initTaskSystemForListing();
      displayAvailableTasks();
      displayAvailableOptions();
    }

    return;
  }

  // Init colors.
  log.initColors();

  // Display help and quit if the user did --help.
  if (isHelpFlagSet()) {
    help.display();
    return;
  }

  // A little header stuff.
  displayVerboseHeader();

  // Determine and output which tasks will be run.
  const tasksSpecified = tasks && tasks.length > 0;
  determineAndOutputTasks(tasksSpecified);

  // Initialize tasks.
  initializeTasks(tasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(tasks, 'Running tasks');

  // Handle otherwise unhandleable (probably asynchronous) exceptions.
  registerUncaughtExceptionHandler();

  // Report, etc when all tasks have completed.
  task.options({
    error: (e) => {
      fail.warn(e, fail.code.TASK_FAILURE);
    },
    done: () => {
      removeUncaughtExceptionHandler();
      outputFinalReport();

      if (done) {
        executeDoneCallback(done);
      } else {
        explicitlyExit();
      }
    }
  });

  // Execute all tasks, in order. Passing each task individually in a forEach
  // allows the error callback to execute multiple times.
  executeAllTasks(tasks);
  // Run tasks async internally to reduce call-stack, per:
  // https://github.com/gruntjs/grunt/pull/1026
  startTasksAsync();
};