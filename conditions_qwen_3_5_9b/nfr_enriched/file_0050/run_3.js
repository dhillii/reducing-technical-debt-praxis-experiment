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
  // Print a useful error if we attempt to load a .coffee file.
  if (require.extensions) {
    const FILE_EXTENSIONS = ['.coffee', '.litcoffee', '.coffee.md'];
    for (const extension of FILE_EXTENSIONS) {
      require.extensions[extension] = function() {
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
 * Display version information and available tasks/options if verbose mode is enabled.
 */
function displayVersionInfo() {
  log.writeln('grunt v' + grunt.version);

  if (option('verbose')) {
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
      if (o.short) { availableOptions.push('-' + o.short); }
    });
    verbose.writeln('Available options: ' + availableOptions.join(' '));
  }
}

/**
 * Display help information and exit.
 */
function displayHelp() {
  help.display();
}

/**
 * Initialize the task system with provided tasks and options.
 */
function initializeTaskSystem(tasks, options) {
  option.init(options);
  task.init(tasks, options);
}

/**
 * Setup uncaught exception handler for task failures.
 * @returns {Function} The uncaught exception handler function.
 */
function setupUncaughtExceptionHandler() {
  const uncaughtHandler = function(e) {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
  process.on('uncaughtException', uncaughtHandler);
  return uncaughtHandler;
}

/**
 * Handle task completion callbacks and cleanup.
 * @param {Function} done - Optional callback to execute when done.
 * @param {Function} uncaughtHandler - The uncaught exception handler to remove.
 */
function handleTaskCompletion(done, uncaughtHandler) {
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
}

/**
 * Execute all specified tasks in order.
 * @param {Array} tasks - Array of task names to execute.
 */
function executeTasks(tasks) {
  tasks.forEach(function(name) { task.run(name); });
  task.start({asyncDone: true});
}

/**
 * Main task execution entry point.
 * Handles version, help, task initialization, execution, and completion.
 * @param {Array} tasks - Array of task names to run.
 * @param {Object} options - Command-line options.
 * @param {Function} done - Optional callback when all tasks complete.
 */
function gruntTasks(tasks, options, done) {
  option.init(options);

  // Display version and exit if requested
  if (option('version')) {
    displayVersionInfo();
    return;
  }

  // Display help and exit if requested
  if (option('help')) {
    displayHelp();
    return;
  }

  // Initialize logging colors
  log.initColors();

  // Display header and command-line options
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  // Parse and initialize tasks
  const tasksSpecified = tasks && tasks.length > 0;
  tasks = task.parseArgs([tasksSpecified ? tasks : 'default']);
  initializeTaskSystem(tasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(tasks, 'Running tasks');

  // Setup error handling
  const uncaughtHandler = setupUncaughtExceptionHandler();

  // Handle task completion
  handleTaskCompletion(done, uncaughtHandler);

  // Execute all tasks
  executeTasks(tasks);
}

// Expose the task interface
grunt.tasks = gruntTasks;
```