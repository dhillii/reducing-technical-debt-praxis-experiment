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
 * Check if version option is specified
 * @returns {boolean} True if version option is present
 */
function isVersionOptionSpecified() {
  return option('version');
}

/**
 * Display version information
 */
function displayVersionInfo() {
  log.writeln('grunt v' + grunt.version);
}

/**
 * Display verbose version details
 */
function displayVerboseVersionDetails() {
  verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
  // Yes, this is a total hack, but we don't want to log all that verbose
  // task initialization stuff here.
  grunt.log.muted = true;
  // Initialize task system so that available tasks can be listed.
  grunt.task.init([], {help: true});
  // Re-enable logging.
  grunt.log.muted = false;

  // Display available tasks (for shell completion, etc).
  const _tasks = Object.keys(grunt.task._tasks).sort();
  verbose.writeln('Available tasks: ' + _tasks.join(' '));

  // Display available options (for shell completion, etc).
  const _options = [];
  Object.keys(grunt.cli.optlist).forEach(function(long) {
    const o = grunt.cli.optlist[long];
    _options.push('--' + (o.negate ? 'no-' : '') + long);
    if (o.short) { _options.push('-' + o.short); }
  });
  verbose.writeln('Available options: ' + _options.join(' '));
}

/**
 * Handle version display and exit if needed
 * @returns {boolean} True if version was displayed and should exit
 */
function handleVersionDisplay() {
  if (!isVersionOptionSpecified()) {
    return false;
  }

  displayVersionInfo();

  if (option('verbose')) {
    displayVerboseVersionDetails();
  }

  return true;
}

/**
 * Check if help option is specified
 * @returns {boolean} True if help option is present
 */
function isHelpOptionSpecified() {
  return option('help');
}

/**
 * Handle help display and exit if needed
 * @returns {boolean} True if help was displayed and should exit
 */
function handleHelpDisplay() {
  if (!isHelpOptionSpecified()) {
    return false;
  }

  help.display();
  return true;
}

/**
 * Check if tasks were specified
 * @param {Array} tasks - Array of tasks
 * @returns {boolean} True if tasks were specified
 */
function areTasksSpecified(tasks) {
  return tasks && tasks.length > 0;
}

/**
 * Setup uncaught exception handler
 * @returns {Function} The handler function
 */
function setupUncaughtExceptionHandler() {
  const uncaughtHandler = function(e) {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
  process.on('uncaughtException', uncaughtHandler);
  return uncaughtHandler;
}

/**
 * Remove uncaught exception handler
 * @param {Function} handler - The handler to remove
 */
function removeUncaughtExceptionHandler(handler) {
  process.removeListener('uncaughtException', handler);
}

/**
 * Execute completion callback or exit
 * @param {Function} [done] - Optional completion callback
 */
function completeExecution(done) {
  if (done) {
    done();
  } else {
    util.exit(0);
  }
}

// Expose the task interface. I've never called this manually, and have no idea
// how it will work. But it might.
grunt.tasks = function(tasks, options, done) {
  // Update options with passed-in options.
  option.init(options);

  // Display the grunt version and quit if the user did --version.
  if (handleVersionDisplay()) {
    return;
  }

  // Init colors.
  log.initColors();

  // Display help and quit if the user did --help.
  if (handleHelpDisplay()) {
    return;
  }

  // A little header stuff.
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  // Determine and output which tasks will be run.
  const tasksSpecified = areTasksSpecified(tasks);
  tasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  // Initialize tasks.
  task.init(tasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(tasks, 'Running tasks');

  // Handle otherwise unhandleable (probably asynchronous) exceptions.
  const uncaughtHandler = setupUncaughtExceptionHandler();

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
      removeUncaughtExceptionHandler(uncaughtHandler);

      // Output a final fail / success report.
      fail.report();

      completeExecution(done);
    }
  });

  // Execute all tasks, in order. Passing each task individually in a forEach
  // allows the error callback to execute multiple times.
  tasks.forEach(function(name) { task.run(name); });
  // Run tasks async internally to reduce call-stack, per:
  // https://github.com/gruntjs/grunt/pull/1026
  task.start({asyncDone: true});
};