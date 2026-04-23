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
    FILE_EXTENSIONS.forEach(ext => {
      require.extensions[ext] = function () {
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
  return grunt[name] = require('./grunt/' + name);
}

const util = require('grunt-legacy-util');
grunt.util = util;
grunt.util.task = require('./util/task');

const Log = require('grunt-legacy-log').Log;
const log = new Log({grunt});
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

// ---------------------------------------------------------------------------
// Helper functions for grunt.tasks
// ---------------------------------------------------------------------------

/**
 * Handles the --version option.
 * @returns {boolean} true if the version was displayed and execution should stop.
 */
function handleVersionOption() {
  if (!option('version')) {
    return false;
  }

  log.writeln(`grunt v${grunt.version}`);

  if (option('verbose')) {
    verbose.writeln(`Install path: ${path.resolve(__dirname, '..')}`);
    grunt.log.muted = true;
    grunt.task.init([], {help: true});
    grunt.log.muted = false;

    const availableTasks = Object.keys(grunt.task._tasks).sort();
    verbose.writeln(`Available tasks: ${availableTasks.join(' ')}`);

    const availableOptions = [];
    Object.keys(grunt.cli.optlist).forEach(long => {
      const o = grunt.cli.optlist[long];
      availableOptions.push(`--${o.negate ? 'no-' : ''}${long}`);
      if (o.short) {
        availableOptions.push(`-${o.short}`);
      }
    });
    verbose.writeln(`Available options: ${availableOptions.join(' ')}`);
  }

  return true;
}

/**
 * Handles the --help option.
 * @returns {boolean} true if help was displayed and execution should stop.
 */
function handleHelpOption() {
  if (!option('help')) {
    return false;
  }

  help.display();
  return true;
}

/**
 * Sets up a handler for uncaught exceptions during task execution.
 * @param {Function} onFatal Callback to invoke on fatal error.
 */
function setupUncaughtExceptionHandler(onFatal) {
  const uncaughtHandler = function (e) {
    onFatal(e, fail.code.TASK_FAILURE);
  };
  process.on('uncaughtException', uncaughtHandler);
  return () => process.removeListener('uncaughtException', uncaughtHandler);
}

/**
 * Configures task completion callbacks.
 * @param {Function} done Optional callback to run after all tasks finish.
 */
function setupTaskCompletion(done) {
  task.options({
    error: function (e) {
      fail.warn(e, fail.code.TASK_FAILURE);
    },
    done: function () {
      // Stop handling uncaught exceptions so that we don't leave any
      // unwanted process-level side effects behind.
      process.removeListener('uncaughtException', uncaughtHandler);

      // Output a final fail / success report.
      fail.report();

      if (done) {
        done();
      } else {
        util.exit(0);
      }
    }
  });
}

/**
 * Runs the specified tasks in order.
 * @param {Array<string>} tasks Array of task names.
 */
function runTasks(tasks) {
  tasks.forEach(name => task.run(name));
  task.start({asyncDone: true});
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

grunt.tasks = function (tasks, options, done) {
  // Update options with passed-in options.
  option.init(options);

  // Handle --version.
  if (handleVersionOption()) {
    return;
  }

  // Init colors.
  log.initColors();

  // Handle --help.
  if (handleHelpOption()) {
    return;
  }

  // A little header stuff.
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  // Determine and output which tasks will be run.
  const tasksSpecified = tasks && tasks.length > 0;
  const parsedTasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  // Initialize tasks.
  task.init(parsedTasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(parsedTasks, 'Running tasks');

  // Handle otherwise unhandleable (probably asynchronous) exceptions.
  const removeUncaught = setupUncaughtExceptionHandler((e, code) => {
    fail.fatal(e, code);
  });

  // Report, etc when all tasks have completed.
  setupTaskCompletion(done);

  // Execute all tasks, in order.
  runTasks(parsedTasks);
};