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
 * Checks if the version option is set.
 * @returns {boolean} True if the version option is set, false otherwise.
 */
function isVersionOptionSet() {
  return option('version');
}

/**
 * Checks if the help option is set.
 * @returns {boolean} True if the help option is set, false otherwise.
 */
function isHelpOptionSet() {
  return option('help');
}

/**
 * Checks if tasks are specified.
 * @param {Array} tasks The tasks to check.
 * @returns {boolean} True if tasks are specified, false otherwise.
 */
function areTasksSpecified(tasks) {
  return tasks && tasks.length > 0;
}

/**
 * Displays the grunt version and exits if the version option is set.
 */
function displayVersionAndExit() {
  log.writeln('grunt v' + grunt.version);
  if (option('verbose')) {
    verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
    grunt.log.muted = true;
    grunt.task.init([], {help: true});
    grunt.log.muted = false;
    const tasks = Object.keys(grunt.task._tasks).sort();
    verbose.writeln('Available tasks: ' + tasks.join(' '));
    const options = [];
    Object.keys(grunt.cli.optlist).forEach(function(long) {
      const o = grunt.cli.optlist[long];
      options.push('--' + (o.negate ? 'no-' : '') + long);
      if (o.short) { options.push('-' + o.short); }
    });
    verbose.writeln('Available options: ' + options.join(' '));
  }
}

/**
 * Displays help and exits if the help option is set.
 */
function displayHelpAndExit() {
  help.display();
}

/**
 * Initializes tasks.
 * @param {Array} tasks The tasks to initialize.
 * @param {Object} options The options to initialize with.
 */
function initializeTasks(tasks, options) {
  task.init(tasks, options);
}

/**
 * Handles uncaught exceptions.
 * @param {Error} e The error to handle.
 */
function handleUncaughtException(e) {
  fail.fatal(e, fail.code.TASK_FAILURE);
}

/**
 * Reports and exits when all tasks have completed.
 * @param {Function} done The done function to call when all tasks have completed.
 */
function reportAndExit(done) {
  task.options({
    error: function(e) {
      fail.warn(e, fail.code.TASK_FAILURE);
    },
    done: function() {
      process.removeListener('uncaughtException', handleUncaughtException);
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
 * Executes all tasks.
 * @param {Array} tasks The tasks to execute.
 */
function executeTasks(tasks) {
  tasks.forEach(function(name) { task.run(name); });
  task.start({asyncDone: true});
}

// Expose the task interface.
grunt.tasks = function(tasks, options, done) {
  option.init(options);

  if (isVersionOptionSet()) {
    displayVersionAndExit();
    return;
  }

  if (isHelpOptionSet()) {
    displayHelpAndExit();
    return;
  }

  log.initColors();
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  const tasksSpecified = areTasksSpecified(tasks);
  tasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(tasks, 'Running tasks');

  process.on('uncaughtException', handleUncaughtException);

  initializeTasks(tasks, options);
  executeTasks(tasks);
  reportAndExit(done);
};