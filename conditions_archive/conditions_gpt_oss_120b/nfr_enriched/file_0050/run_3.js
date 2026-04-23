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
 * Handles the --version flag, including verbose output of tasks and options.
 */
function handleVersionFlag() {
  log.writeln('grunt v' + grunt.version);
  if (!option('verbose')) return;

  verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
  grunt.log.muted = true;
  grunt.task.init([], { help: true });
  grunt.log.muted = false;

  const taskNames = Object.keys(grunt.task._tasks).sort();
  verbose.writeln('Available tasks: ' + taskNames.join(' '));

  const optionList = [];
  Object.keys(grunt.cli.optlist).forEach(long => {
    const o = grunt.cli.optlist[long];
    optionList.push('--' + (o.negate ? 'no-' : '') + long);
    if (o.short) optionList.push('-' + o.short);
  });
  verbose.writeln('Available options: ' + optionList.join(' '));
}

/**
 * Initializes colors and displays help if requested.
 */
function initColorsAndHelp() {
  log.initColors();
  if (option('help')) {
    help.display();
    return true;
  }
  return false;
}

/**
 * Writes the initial header and command‑line flags.
 */
function displayHeader() {
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');
}

/**
 * Sets up a temporary uncaught‑exception handler for task execution.
 */
function setupUncaughtHandler() {
  const handler = e => fail.fatal(e, fail.code.TASK_FAILURE);
  process.on('uncaughtException', handler);
  return handler;
}

/**
 * Configures task options for error handling and completion.
 */
function configureTaskOptions(uncaughtHandler, done) {
  task.options({
    error: e => fail.warn(e, fail.code.TASK_FAILURE),
    done: () => {
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
 * Executes the provided task list.
 */
function runTaskList(taskList) {
  taskList.forEach(name => task.run(name));
  task.start({ asyncDone: true });
}

/**
 * Primary entry point for running Grunt tasks.
 *
 * @param {Array|string} tasks - Tasks to run.
 * @param {Object} options - CLI options.
 * @param {Function} [done] - Optional callback when finished.
 */
grunt.tasks = function (tasks, options, done) {
  // Update options with passed‑in options.
  option.init(options);

  // Handle version flag early.
  if (option('version')) {
    handleVersionFlag();
    return;
  }

  // Initialize colors and possibly display help.
  if (initColorsAndHelp()) return;

  // Header output.
  displayHeader();

  // Determine which tasks will be run.
  const tasksSpecified = Array.isArray(tasks) ? tasks.length > 0 : !!tasks;
  const taskList = task.parseArgs([tasksSpecified ? tasks : 'default']);

  // Initialize tasks.
  task.init(taskList, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(taskList, 'Running tasks');

  // Setup uncaught‑exception handling.
  const uncaughtHandler = setupUncaughtHandler();

  // Configure task callbacks.
  configureTaskOptions(uncaughtHandler, done);

  // Execute tasks.
  runTaskList(taskList);
};
```