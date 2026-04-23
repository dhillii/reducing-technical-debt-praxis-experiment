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
 * Checks if the version option is enabled.
 * @returns {boolean}
 */
function isVersionOptionEnabled() {
  return Boolean(option('version'));
}

/**
 * Checks if the verbose option is enabled.
 * @returns {boolean}
 */
function isVerboseOptionEnabled() {
  return Boolean(option('verbose'));
}

/**
 * Checks if the help option is enabled.
 * @returns {boolean}
 */
function isHelpOptionEnabled() {
  return Boolean(option('help'));
}

/**
 * Determines whether tasks were explicitly specified.
 * @param {Array|string} tasks
 * @returns {boolean}
 */
function hasTasksSpecified(tasks) {
  return Array.isArray(tasks) ? tasks.length > 0 : !!tasks;
}

/**
 * Handles the --version flag, optionally displaying verbose information.
 * Returns true if processing should stop after handling version.
 * @returns {boolean}
 */
function handleVersionFlag() {
  log.writeln('grunt v' + grunt.version);
  if (!isVerboseOptionEnabled()) {
    return true;
  }

  verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
  // Suppress verbose task initialization logging.
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

  return true;
}

/**
 * Main entry point for executing grunt tasks.
 * @param {Array|string} tasks
 * @param {Object} [options]
 * @param {Function} [done]
 */
grunt.tasks = function (tasks, options, done) {
  // Update options with passed-in options.
  option.init(options);

  // Handle version flag early.
  if (isVersionOptionEnabled()) {
    if (handleVersionFlag()) {
      return;
    }
  }

  // Init colors.
  log.initColors();

  // Handle help flag early.
  if (isHelpOptionEnabled()) {
    help.display();
    return;
  }

  // Header output.
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

  // Uncaught exception handling.
  const uncaughtHandler = e => fail.fatal(e, fail.code.TASK_FAILURE);
  process.on('uncaughtException', uncaughtHandler);

  // Task completion handling.
  task.options({
    error: e => fail.warn(e, fail.code.TASK_FAILURE),
    done: () => {
      process.removeListener('uncaughtException', uncaughtHandler);
      fail.report();

      if (typeof done === 'function') {
        done();
      } else {
        util.exit(0);
      }
    }
  });

  // Execute tasks sequentially.
  parsedTasks.forEach(name => task.run(name));
  // Run tasks async internally to reduce call-stack.
  task.start({ asyncDone: true });
};
```