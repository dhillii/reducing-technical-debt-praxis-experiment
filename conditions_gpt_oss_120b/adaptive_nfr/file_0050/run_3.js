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
 * Determines if the version flag was passed.
 * @returns {boolean}
 */
function isVersionRequested() {
  return option('version');
}

/**
 * Determines if the verbose flag was passed.
 * @returns {boolean}
 */
function isVerboseRequested() {
  return option('verbose');
}

/**
 * Determines if the help flag was passed.
 * @returns {boolean}
 */
function isHelpRequested() {
  return option('help');
}

/**
 * Checks whether tasks were explicitly specified.
 * @param {Array|string} tasks
 * @returns {boolean}
 */
function hasTasksSpecified(tasks) {
  return tasks && tasks.length > 0;
}

/**
 * Displays version information and, if verbose, additional details.
 */
function displayVersionInfo() {
  log.writeln('grunt v' + grunt.version);
  if (isVerboseRequested()) {
    displayVersionVerbose();
  }
}

/**
 * Displays additional version details when --verbose is used.
 */
function displayVersionVerbose() {
  verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
  // Silence logging while initializing task system for help listing.
  grunt.log.muted = true;
  grunt.task.init([], { help: true });
  grunt.log.muted = false;

  const taskNames = Object.keys(grunt.task._tasks).sort();
  verbose.writeln('Available tasks: ' + taskNames.join(' '));

  const optionsList = [];
  Object.keys(grunt.cli.optlist).forEach((long) => {
    const o = grunt.cli.optlist[long];
    optionsList.push('--' + (o.negate ? 'no-' : '') + long);
    if (o.short) {
      optionsList.push('-' + o.short);
    }
  });
  verbose.writeln('Available options: ' + optionsList.join(' '));
}

/**
 * Displays help information.
 */
function displayHelpInfo() {
  help.display();
}

/**
 * Main entry point for running grunt tasks.
 *
 * @param {Array|string} tasks
 * @param {Object} [options]
 * @param {Function} [done]
 */
grunt.tasks = function (tasks, options, done) {
  // Update options with passed-in options.
  option.init(options);

  if (isVersionRequested()) {
    displayVersionInfo();
    return;
  }

  if (isHelpRequested()) {
    displayHelpInfo();
    return;
  }

  // Init colors.
  log.initColors();

  // Header output.
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  const tasksSpecified = hasTasksSpecified(tasks);
  const parsedArgs = tasksSpecified ? [tasks] : ['default'];
  tasks = task.parseArgs(parsedArgs);

  // Initialize tasks.
  task.init(tasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(tasks, 'Running tasks');

  // Handle otherwise unhandleable (probably asynchronous) exceptions.
  const uncaughtHandler = (e) => {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
  process.on('uncaughtException', uncaughtHandler);

  // Report, etc when all tasks have completed.
  task.options({
    error: (e) => {
      fail.warn(e, fail.code.TASK_FAILURE);
    },
    done: () => {
      // Stop handling uncaught exceptions.
      process.removeListener('uncaughtException', uncaughtHandler);
      // Output a final fail / success report.
      fail.report();

      if (done) {
        done();
      } else {
        util.exit(0);
      }
    },
  });

  // Execute all tasks, in order.
  tasks.forEach((name) => task.run(name));
  // Run tasks async internally to reduce call-stack.
  task.start({ asyncDone: true });
};