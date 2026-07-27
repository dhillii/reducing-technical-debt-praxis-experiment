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
 * @returns {boolean}
 */
function isVersionOption() {
  return option('version');
}

/**
 * @returns {boolean}
 */
function isVerboseOption() {
  return option('verbose');
}

/**
 * @returns {boolean}
 */
function isHelpOption() {
  return option('help');
}

/**
 * Display grunt version information.
 */
function displayVersionInfo() {
  log.writeln('grunt v' + grunt.version);
}

/**
 * Display verbose information about available tasks and options.
 */
function displayVerboseInfo() {
  verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
  grunt.log.muted = true;
  grunt.task.init([], {help: true});
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
 * Display help information.
 */
function displayHelpInfo() {
  help.display();
}

/**
 * Initialize terminal colors.
 */
function initColors() {
  log.initColors();
}

/**
 * Handle uncaught exceptions during task execution.
 * @param {Error} e
 */
function handleUncaughtException(e) {
  fail.fatal(e, fail.code.TASK_FAILURE);
}

/**
 * Handle completion of all tasks.
 * @param {Function} [done]
 */
function handleTaskDone(done) {
  process.removeListener('uncaughtException', handleUncaughtException);
  fail.report();

  if (done) {
    done();
  } else {
    util.exit(0);
  }
}

/**
 * Expose the task interface.
 * @param {Array<string>} tasks
 * @param {Object} options
 * @param {Function} [done]
 */
grunt.tasks = function (tasks, options, done) {
  option.init(options);

  if (isVersionOption()) {
    displayVersionInfo();

    if (isVerboseOption()) {
      displayVerboseInfo();
    }

    return;
  }

  initColors();

  if (isHelpOption()) {
    displayHelpInfo();
    return;
  }

  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  const tasksSpecified = tasks && tasks.length > 0;
  tasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  task.init(tasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(tasks, 'Running tasks');

  process.on('uncaughtException', handleUncaughtException);

  task.options({
    error: function (e) {
      fail.warn(e, fail.code.TASK_FAILURE);
    },
    done: function () {
      handleTaskDone(done);
    }
  });

  tasks.forEach(function (name) {
    task.run(name);
  });

  task.start({asyncDone: true});
};