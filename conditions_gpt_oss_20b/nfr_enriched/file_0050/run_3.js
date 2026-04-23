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
    for (const ext of FILE_EXTENSIONS) {
      require.extensions[ext] = function () {
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

// Handle --version option.
function handleVersionOption() {
  if (!option('version')) {
    return false;
  }
  log.writeln('grunt v' + grunt.version);
  if (option('verbose')) {
    verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
    grunt.log.muted = true;
    grunt.task.init([], {help: true});
    grunt.log.muted = false;
    const tasks = Object.keys(grunt.task._tasks).sort();
    verbose.writeln('Available tasks: ' + tasks.join(' '));
    const options = [];
    Object.keys(grunt.cli.optlist).forEach((long) => {
      const o = grunt.cli.optlist[long];
      options.push('--' + (o.negate ? 'no-' : '') + long);
      if (o.short) { options.push('-' + o.short); }
    });
    verbose.writeln('Available options: ' + options.join(' '));
  }
  return true;
}

// Handle --help option.
function handleHelpOption() {
  if (!option('help')) {
    return false;
  }
  help.display();
  return true;
}

// Initialize colors for output.
function initColors() {
  log.initColors();
}

// Display header for task initialization.
function displayHeader() {
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');
}

// Determine tasks to run.
function determineTasks(tasks) {
  const tasksSpecified = tasks && tasks.length > 0;
  const parsed = task.parseArgs([tasksSpecified ? tasks : 'default']);
  return { parsed, tasksSpecified };
}

// Initialize tasks.
function initTasks(parsed, options) {
  task.init(parsed, options);
}

// Setup uncaught exception handler.
function setupUncaughtHandler() {
  const handler = (e) => {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
  process.on('uncaughtException', handler);
  return handler;
}

// Configure task options for error handling and completion.
function configureTaskOptions(done) {
  task.options({
    error: (e) => {
      fail.warn(e, fail.code.TASK_FAILURE);
    },
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

// Execute all tasks in order.
function executeTasks(taskNames) {
  for (const name of taskNames) {
    task.run(name);
  }
  task.start({asyncDone: true});
}

// Expose the task interface.
grunt.tasks = function (tasks, options, done) {
  option.init(options);

  if (handleVersionOption()) {
    return;
  }

  initColors();

  if (handleHelpOption()) {
    return;
  }

  displayHeader();

  const { parsed, tasksSpecified } = determineTasks(tasks);
  initTasks(parsed, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(parsed, 'Running tasks');

  const uncaughtHandler = setupUncaughtHandler();
  configureTaskOptions(done);

  executeTasks(parsed);
};