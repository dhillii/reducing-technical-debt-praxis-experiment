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
    for (const i of FILE_EXTENSIONS.keys()) {
      require.extensions[FILE_EXTENSIONS[i]] = function() {
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

/**
 * Handles the --version command line option.
 * Displays grunt version and optionally verbose information.
 * @param {Object} options - Command line options
 * @param {Object} log - Grunt log instance
 * @param {Function} verbose - Verbose logging function
 * @param {string} version - Grunt version string
 */
function handleVersionOption(options, log, verbose, version) {
  // Not --verbose.
  log.writeln('grunt v' + version);

  if (option('verbose')) {
    // --verbose
    verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
    // Yes, this is a total hack, but we don't want to log all that verbose
    // task initialization stuff here.
    grunt.log.muted = true;
    // Initialize task system so that available tasks can be listed.
    grunt.task.init([], {help: true});
    // Re-enable logging.
    grunt.log.muted = false;

    // Display available tasks (for shell completion, etc).
    const availableTasks = Object.keys(grunt.task._tasks).sort();
    verbose.writeln('Available tasks: ' + availableTasks.join(' '));

    // Display available options (for shell completion, etc).
    const availableOptions = [];
    Object.keys(grunt.cli.optlist).forEach(function(long) {
      const o = grunt.cli.optlist[long];
      availableOptions.push('--' + (o.negate ? 'no-' : '') + long);
      if (o.short) { availableOptions.push('-' + o.short); }
    });
    verbose.writeln('Available options: ' + availableOptions.join(' '));
  }
}

/**
 * Handles the --help command line option.
 * Displays help information and exits.
 * @param {Object} help - Grunt help module
 */
function handleHelpOption(help) {
  help.display();
}

/**
 * Initializes the task system with specified tasks and options.
 * @param {Array} tasks - Array of task names to run
 * @param {Object} options - Task options
 */
function initializeTasks(tasks, options) {
  // Initialize tasks.
  task.init(tasks, options);
}

/**
 * Sets up task completion callbacks for error handling and final reporting.
 * @param {Function} done - Callback function to execute when all tasks complete
 */
function setupTaskCompletion(done) {
  // Handle otherwise unhandleable (probably asynchronous) exceptions.
  const uncaughtHandler = function(e) {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
  process.on('uncaughtException', uncaughtHandler);

  // Report, etc when all tasks have completed.
  task.options({
    error: function(e) {
      fail.warn(e, fail.code.TASK_FAILURE);
    },
    done: function() {
      // Stop handling uncaught exceptions so that we don't leave any
      // unwanted process-level side effects behind. There is no need to do
      // this in the error callback, because fail.warn() will either kill
      // the process, or with --force keep on going all the way here.
      process.removeListener('uncaughtException', uncaughtHandler);

      // Output a final fail / success report.
      fail.report();

      if (done) {
        // Execute "done" function when done (only if passed, of course).
        done();
      } else {
        // Otherwise, explicitly exit.
        util.exit(0);
      }
    }
  });
}

/**
 * Executes all specified tasks in order.
 * @param {Array} tasks - Array of task names to execute
 */
function executeTasks(tasks) {
  // Execute all tasks, in order. Passing each task individually in a forEach
  // allows the error callback to execute multiple times.
  tasks.forEach(function(name) { task.run(name); });
  // Run tasks async internally to reduce call-stack, per:
  // https://github.com/gruntjs/grunt/pull/1026
  task.start({asyncDone: true});
}

/**
 * Main entry point for running Grunt tasks.
 * Handles command line options, task initialization, and execution.
 * @param {Array} tasks - Array of task names to run
 * @param {Object} options - Command line options
 * @param {Function} done - Callback function to execute when all tasks complete
 */
grunt.tasks = function(tasks, options, done) {
  // Update options with passed-in options.
  option.init(options);

  // Display the grunt version and quit if the user did --version.
  if (option('version')) {
    handleVersionOption(options, log, verbose, grunt.version);
    return;
  }

  // Init colors.
  log.initColors();

  // Display help and quit if the user did --help.
  if (option('help')) {
    handleHelpOption(help);
    return;
  }

  // A little header stuff.
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  // Determine and output which tasks will be run.
  const tasksSpecified = tasks && tasks.length > 0;
  tasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  // Initialize tasks.
  initializeTasks(tasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(tasks, 'Running tasks');

  // Set up task completion callbacks.
  setupTaskCompletion(done);

  // Execute all tasks, in order.
  executeTasks(tasks);
};