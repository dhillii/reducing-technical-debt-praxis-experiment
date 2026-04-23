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
 * Determines if the version option was supplied.
 * @returns {boolean}
 */
function isVersionRequested() {
  return Boolean(option('version'));
}

/**
 * Determines if the verbose option was supplied.
 * @returns {boolean}
 */
function isVerboseRequested() {
  return Boolean(option('verbose'));
}

/**
 * Determines if the help option was supplied.
 * @returns {boolean}
 */
function isHelpRequested() {
  return Boolean(option('help'));
}

/**
 * Logs version information and, if verbose, additional details.
 */
function handleVersionOption() {
  log.writeln('grunt v' + grunt.version);
  if (!isVerboseRequested()) {
    return;
  }

  verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
  // Suppress verbose task initialization logs.
  grunt.log.muted = true;
  grunt.task.init([], { help: true });
  grunt.log.muted = false;

  const availableTasks = Object.keys(grunt.task._tasks).sort();
  verbose.writeln('Available tasks: ' + availableTasks.join(' '));

  const availableOptions = [];
  Object.keys(grunt.cli.optlist).forEach(function (long) {
    const o = grunt.cli.optlist[long];
    availableOptions.push('--' + (o.negate ? 'no-' : '') + long);
    if (o.short) {
      availableOptions.push('-' + o.short);
    }
  });
  verbose.writeln('Available options: ' + availableOptions.join(' '));
}

/**
 * Handles the help option.
 */
function handleHelpOption() {
  help.display();
}

/**
 * Executes the provided tasks with given options.
 *
 * @param {Array<string>} tasks
 * @param {Object} [options]
 * @param {Function} [done]
 */
grunt.tasks = function (tasks, options, done) {
  // Update options with passed-in options.
  option.init(options);

  // Guard: version request.
  if (isVersionRequested()) {
    handleVersionOption();
    return;
  }

  // Guard: help request.
  if (isHelpRequested()) {
    handleHelpOption();
    return;
  }

  // Init colors.
  log.initColors();

  // A little header stuff.
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  // Determine and output which tasks will be run.
  const tasksSpecified = Array.isArray(tasks) && tasks.length > 0;
  const parsedTasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  // Initialize tasks.
  task.init(parsedTasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(parsedTasks, 'Running tasks');

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
      // Stop handling uncaught exceptions.
      process.removeListener('uncaughtException', uncaughtHandler);

      // Output a final fail / success report.
      fail.report();

      if (typeof done === 'function') {
        done();
      } else {
        util.exit(0);
      }
    },
  });

  // Execute all tasks, in order.
  parsedTasks.forEach(function (name) {
    task.run(name);
  });
  // Run tasks async internally to reduce call-stack.
  task.start({ asyncDone: true });
};