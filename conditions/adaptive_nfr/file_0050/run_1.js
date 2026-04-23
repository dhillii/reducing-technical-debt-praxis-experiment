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
 * Determines if version flag is set.
 * @returns {boolean}
 */
function isVersionRequested() {
  return option('version');
}

/**
 * Determines if verbose output is requested.
 * @returns {boolean}
 */
function isVerboseMode() {
  return option('verbose');
}

/**
 * Determines if help flag is set.
 * @returns {boolean}
 */
function isHelpRequested() {
  return option('help');
}

/**
 * Determines if tasks were explicitly specified.
 * @param {Array} tasks
 * @returns {boolean}
 */
function areTasksSpecified(tasks) {
  return tasks && tasks.length > 0;
}

/**
 * Handles version display with optional verbose details.
 */
function handleVersionDisplay() {
  log.writeln('grunt v' + grunt.version);

  if (!isVerboseMode()) {
    return;
  }

  displayVerboseVersionInfo();
}

/**
 * Displays verbose version information including install path and available tasks/options.
 */
function displayVerboseVersionInfo() {
  verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
  
  grunt.log.muted = true;
  grunt.task.init([], {help: true});
  grunt.log.muted = false;

  const availableTasks = Object.keys(grunt.task._tasks).sort();
  verbose.writeln('Available tasks: ' + availableTasks.join(' '));

  const availableOptions = buildAvailableOptions();
  verbose.writeln('Available options: ' + availableOptions.join(' '));
}

/**
 * Builds array of available command-line options.
 * @returns {Array<string>}
 */
function buildAvailableOptions() {
  const options = [];
  Object.keys(grunt.cli.optlist).forEach(function(long) {
    const o = grunt.cli.optlist[long];
    options.push('--' + (o.negate ? 'no-' : '') + long);
    if (o.short) {
      options.push('-' + o.short);
    }
  });
  return options;
}

/**
 * Handles task completion and cleanup.
 * @param {Function} done
 */
function handleTaskCompletion(done) {
  fail.report();

  if (done) {
    done();
  } else {
    util.exit(0);
  }
}

/**
 * Configures task completion handlers.
 * @param {Function} uncaughtHandler
 * @param {Function} done
 */
function configureTaskHandlers(uncaughtHandler, done) {
  task.options({
    error: function(e) {
      fail.warn(e, fail.code.TASK_FAILURE);
    },
    done: function() {
      process.removeListener('uncaughtException', uncaughtHandler);
      handleTaskCompletion(done);
    }
  });
}

// Expose the task interface. I've never called this manually, and have no idea
// how it will work. But it might.
grunt.tasks = function(tasks, options, done) {
  // Update options with passed-in options.
  option.init(options);

  if (isVersionRequested()) {
    handleVersionDisplay();
    return;
  }

  // Init colors.
  log.initColors();

  if (isHelpRequested()) {
    help.display();
    return;
  }

  // A little header stuff.
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  // Determine and output which tasks will be run.
  const tasksSpecified = areTasksSpecified(tasks);
  const parsedTasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  // Initialize tasks.
  task.init(parsedTasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(parsedTasks, 'Running tasks');

  // Handle otherwise unhandleable (probably asynchronous) exceptions.
  const uncaughtHandler = function(e) {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
  process.on('uncaughtException', uncaughtHandler);

  // Report, etc when all tasks have completed.
  configureTaskHandlers(uncaughtHandler, done);

  // Execute all tasks, in order. Passing each task individually in a forEach
  // allows the error callback to execute multiple times.
  parsedTasks.forEach(function(name) { task.run(name); });
  // Run tasks async internally to reduce call-stack, per:
  // https://github.com/gruntjs/grunt/pull/1026
  task.start({asyncDone: true});
};