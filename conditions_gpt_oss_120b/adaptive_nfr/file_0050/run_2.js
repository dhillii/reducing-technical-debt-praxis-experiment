'use strict';

const path = require('path');

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
      require.extensions[ext] = () => {
        throw new Error(
          'Grunt attempted to load a .coffee file but CoffeeScript was not installed.\n' +
          'Please run `npm install --dev coffeescript` to enable loading CoffeeScript.'
        );
      };
    });
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
 * Determines if the version option was passed.
 * @returns {boolean}
 */
function isVersionOption() {
  return option('version');
}

/**
 * Determines if the verbose option was passed.
 * @returns {boolean}
 */
function isVerboseOption() {
  return option('verbose');
}

/**
 * Determines if the help option was passed.
 * @returns {boolean}
 */
function isHelpOption() {
  return option('help');
}

/**
 * Handles the --version flag, including optional verbose output.
 */
function handleVersion() {
  log.writeln('grunt v' + grunt.version);
  if (!isVerboseOption()) {
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
  Object.keys(grunt.cli.optlist).forEach(long => {
    const o = grunt.cli.optlist[long];
    availableOptions.push('--' + (o.negate ? 'no-' : '') + long);
    if (o.short) {
      availableOptions.push('-' + o.short);
    }
  });
  verbose.writeln('Available options: ' + availableOptions.join(' '));
}

/**
 * Handles the --help flag.
 */
function handleHelp() {
  help.display();
}

/**
 * Determines whether tasks were explicitly specified.
 * @param {Array<string>} tasks
 * @returns {boolean}
 */
function hasTasksSpecified(tasks) {
  return tasks && tasks.length > 0;
}

/**
 * Main entry point for running tasks.
 * @param {Array<string>} tasks
 * @param {Object} options
 * @param {Function} [done]
 */
grunt.tasks = function (tasks, options, done) {
  // Update options with passed-in options.
  option.init(options);

  if (isVersionOption()) {
    handleVersion();
    return;
  }

  // Init colors.
  log.initColors();

  if (isHelpOption()) {
    handleHelp();
    return;
  }

  // A little header stuff.
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  const tasksSpecified = hasTasksSpecified(tasks);
  const parsedTasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  // Initialize tasks.
  task.init(parsedTasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(parsedTasks, 'Running tasks');

  // Handle otherwise unhandleable (probably asynchronous) exceptions.
  const uncaughtHandler = e => {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
  process.on('uncaughtException', uncaughtHandler);

  // Report, etc when all tasks have completed.
  task.options({
    error: e => {
      fail.warn(e, fail.code.TASK_FAILURE);
    },
    done: () => {
      // Stop handling uncaught exceptions so that we don't leave any
      // unwanted process-level side effects behind.
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
    },
  });

  // Execute all tasks, in order.
  parsedTasks.forEach(name => {
    task.run(name);
  });
  // Run tasks async internally to reduce call-stack, per:
  // https://github.com/gruntjs/grunt/pull/1026
  task.start({ asyncDone: true });
};