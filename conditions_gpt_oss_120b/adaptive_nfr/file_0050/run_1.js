'use strict';

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
 * Determines if the provided argument list contains any tasks.
 * @param {Array|string} tasks - The tasks argument.
 * @returns {boolean} True if tasks are specified.
 */
function hasTasksSpecified(tasks) {
  return !!tasks && tasks.length > 0;
}

/**
 * Checks whether the version flag is set.
 * @returns {boolean}
 */
function isVersionOption() {
  return option('version');
}

/**
 * Checks whether the verbose flag is set.
 * @returns {boolean}
 */
function isVerboseOption() {
  return option('verbose');
}

/**
 * Checks whether the help flag is set.
 * @returns {boolean}
 */
function isHelpOption() {
  return option('help');
}

/**
 * Handles the --version flag, including optional verbose output.
 * @returns {boolean} True if the version handling caused an early exit.
 */
function handleVersion() {
  if (!isVersionOption()) {
    return false;
  }
  log.writeln('grunt v' + grunt.version);
  if (isVerboseOption()) {
    verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
    grunt.log.muted = true;
    grunt.task.init([], { help: true });
    grunt.log.muted = false;

    const tasksList = Object.keys(grunt.task._tasks).sort();
    verbose.writeln('Available tasks: ' + tasksList.join(' '));

    const optionsList = [];
    Object.keys(grunt.cli.optlist).forEach(function (long) {
      const o = grunt.cli.optlist[long];
      optionsList.push('--' + (o.negate ? 'no-' : '') + long);
      if (o.short) {
        optionsList.push('-' + o.short);
      }
    });
    verbose.writeln('Available options: ' + optionsList.join(' '));
  }
  return true;
}

/**
 * Handles the --help flag.
 * @returns {boolean} True if help was displayed and an early exit is required.
 */
function handleHelp() {
  if (!isHelpOption()) {
    return false;
  }
  help.display();
  return true;
}

/**
 * Executes Grunt tasks based on provided arguments.
 * @param {Array|string} tasks - Tasks to run.
 * @param {Object} options - Command‑line options.
 * @param {Function} [done] - Optional callback invoked when all tasks complete.
 */
grunt.tasks = function (tasks, options, done) {
  // Update options with passed‑in options.
  option.init(options);

  // Early exit for version or help flags.
  if (handleVersion()) {
    return;
  }
  if (handleHelp()) {
    return;
  }

  // Init colors.
  log.initColors();

  // Header information.
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  // Determine and output which tasks will be run.
  const tasksSpecified = hasTasksSpecified(tasks);
  tasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  // Initialize tasks.
  task.init(tasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(tasks, 'Running tasks');

  // Handle otherwise unhandleable (probably asynchronous) exceptions.
  const uncaughtHandler = function (e) {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
  process.on('uncaughtException', uncaughtHandler);

  // Report, etc when all tasks have completed.
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

  // Execute all tasks, in order.
  tasks.forEach(function (name) {
    task.run(name);
  });
  // Run tasks async internally to reduce call‑stack.
  task.start({ asyncDone: true });
};