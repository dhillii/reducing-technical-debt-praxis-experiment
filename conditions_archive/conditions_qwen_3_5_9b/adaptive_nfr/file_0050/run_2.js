```javascript
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
  // Print a useful error if we attempt to load .coffee files.
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
 * Check if version flag is set
 * @returns {boolean}
 */
function isVersionFlagSet() {
  return option('version');
}

/**
 * Check if verbose flag is set
 * @returns {boolean}
 */
function isVerboseFlagSet() {
  return option('verbose');
}

/**
 * Check if help flag is set
 * @returns {boolean}
 */
function isHelpFlagSet() {
  return option('help');
}

/**
 * Check if tasks are specified
 * @param {Array} tasks
 * @returns {boolean}
 */
function areTasksSpecified(tasks) {
  return tasks && tasks.length > 0;
}

/**
 * Check if tasks are empty
 * @param {Array} tasks
 * @returns {boolean}
 */
function areTasksEmpty(tasks) {
  return !areTasksSpecified(tasks);
}

/**
 * Display version information
 */
function displayVersionInfo() {
  log.writeln('grunt v' + grunt.version);
}

/**
 * Display verbose information
 */
function displayVerboseInfo() {
  verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
  grunt.log.muted = true;
  grunt.task.init([], {help: true});
  grunt.log.muted = false;
}

/**
 * Display available tasks
 */
function displayAvailableTasks() {
  const _tasks = Object.keys(grunt.task._tasks).sort();
  verbose.writeln('Available tasks: ' + _tasks.join(' '));
}

/**
 * Display available options
 */
function displayAvailableOptions() {
  const _options = [];
  Object.keys(grunt.cli.optlist).forEach(function(long) {
    const o = grunt.cli.optlist[long];
    _options.push('--' + (o.negate ? 'no-' : '') + long);
    if (o.short) { _options.push('-' + o.short); }
  });
  verbose.writeln('Available options: ' + _options.join(' '));
}

/**
 * Initialize task system
 */
function initializeTaskSystem() {
  grunt.task.init([], {help: true});
}

/**
 * Handle uncaught exceptions
 * @param {Error} e
 */
function handleUncaughtException(e) {
  fail.fatal(e, fail.code.TASK_FAILURE);
}

/**
 * Handle task completion
 */
function handleTaskCompletion() {
  process.removeListener('uncaughtException', handleUncaughtException);
  fail.report();
}

/**
 * Execute done callback
 * @param {Function} done
 */
function executeDoneCallback(done) {
  if (done) {
    done();
  } else {
    util.exit(0);
  }
}

/**
 * Execute all tasks
 * @param {Array} tasks
 */
function executeAllTasks(tasks) {
  tasks.forEach(function(name) { task.run(name); });
}

/**
 * Start task execution
 */
function startTaskExecution() {
  task.start({asyncDone: true});
}

/**
 * Main tasks function
 * @param {Array} tasks
 * @param {Object} options
 * @param {Function} done
 */
grunt.tasks = function(tasks, options, done) {
  // Update options with passed-in options.
  option.init(options);

  // Display the grunt version and quit if the user did --version.
  if (isVersionFlagSet()) {
    displayVersionInfo();

    if (isVerboseFlagSet()) {
      displayVerboseInfo();
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
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  // Determine and output which tasks will be run.
  const tasksSpecified = areTasksSpecified(tasks);
  tasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  // Initialize tasks.
  task.init(tasks, options);

  verbose.writeln();
  if (areTasksEmpty(tasks)) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(tasks, 'Running tasks');

  // Handle otherwise unhandleable (probably asynchronous) exceptions.
  process.on('uncaughtException', handleUncaughtException);

  // Report, etc when all tasks have completed.
  task.options({
    error: function(e) {
      fail.warn(e, fail.code.TASK_FAILURE);
    },
    done: function() {
      handleTaskCompletion();
      executeDoneCallback(done);
    }
  });

  // Execute all tasks, in order. Passing each task individually in a forEach
  // allows the error callback to execute multiple times.
  executeAllTasks(tasks);
  // Run tasks async internally to reduce call-stack, per:
  // https://github.com/gruntjs/grunt/pull/1026
  startTaskExecution();
};
```