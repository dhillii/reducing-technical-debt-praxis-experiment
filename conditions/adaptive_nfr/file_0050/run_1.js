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
 * Checks if version flag is set.
 * @returns {boolean}
 */
function isVersionRequested() {
  return option('version');
}

/**
 * Checks if verbose output is requested.
 * @returns {boolean}
 */
function isVerboseMode() {
  return option('verbose');
}

/**
 * Checks if help flag is set.
 * @returns {boolean}
 */
function isHelpRequested() {
  return option('help');
}

/**
 * Checks if tasks were explicitly specified.
 * @param {Array} tasks
 * @returns {boolean}
 */
function areTasksSpecified(tasks) {
  return tasks && tasks.length > 0;
}

/**
 * Handles version display with optional verbose information.
 */
function handleVersionDisplay() {
  log.writeln('grunt v' + grunt.version);

  if (!isVerboseMode()) {
    return;
  }

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

/**
 * Handles help display.
 */
function handleHelpDisplay() {
  help.display();
}

/**
 * Initializes and runs tasks.
 * @param {Array} tasks
 * @param {Object} options
 */
function initializeAndRunTasks(tasks, options) {
  log.initColors();

  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  const tasksSpecified = areTasksSpecified(tasks);
  const parsedTasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  task.init(parsedTasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(parsedTasks, 'Running tasks');

  setupTaskExecution(parsedTasks);
}

/**
 * Sets up task execution with error handling and completion callbacks.
 * @param {Array} tasks
 */
function setupTaskExecution(tasks) {
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
      executeCompletionCallback();
    }
  });

  tasks.forEach(function(name) {
    task.run(name);
  });
  task.start({asyncDone: true});
}

/**
 * Executes the completion callback or exits the process.
 */
function executeCompletionCallback() {
  if (grunt.tasks.done) {
    grunt.tasks.done();
  } else {
    util.exit(0);
  }
}

// Expose the task interface. I've never called this manually, and have no idea
// how it will work. But it might.
grunt.tasks = function(tasks, options, done) {
  grunt.tasks.done = done;
  option.init(options);

  if (isVersionRequested()) {
    handleVersionDisplay();
    return;
  }

  if (isHelpRequested()) {
    handleHelpDisplay();
    return;
  }

  initializeAndRunTasks(tasks, options);
};