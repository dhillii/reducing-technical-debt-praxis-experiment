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
    for (const i of FILE_EXTENSIONS) {
      require.extensions[i] = function() {
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
  grunt[name] = require('./grunt/' + name);
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
 * Handles version flag display and initialization.
 * @param {Object} options - Command line options.
 * @param {boolean} verbose - Whether verbose mode is enabled.
 * @returns {void}
 */
function handleVersion(options, verbose) {
  log.writeln('grunt v' + grunt.version);

  if (verbose) {
    verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
    grunt.log.muted = true;
    grunt.task.init([], {help: true});
    grunt.log.muted = false;

    const _tasks = Object.keys(grunt.task._tasks).sort();
    verbose.writeln('Available tasks: ' + _tasks.join(' '));

    const _options = [];
    Object.keys(grunt.cli.optlist).forEach(function(long) {
      const o = grunt.cli.optlist[long];
      _options.push('--' + (o.negate ? 'no-' : '') + long);
      if (o.short) { _options.push('-' + o.short); }
    });
    verbose.writeln('Available options: ' + _options.join(' '));
  }
}

/**
 * Handles help flag display.
 * @returns {void}
 */
function handleHelp() {
  help.display();
}

/**
 * Initializes and runs the specified tasks.
 * @param {Array} tasks - Array of task names to run.
 * @param {Object} options - Task options.
 * @param {Function} done - Callback function when tasks complete.
 * @returns {void}
 */
function runTasks(tasks, options, done) {
  log.initColors();

  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  const tasksSpecified = tasks && tasks.length > 0;
  tasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  task.init(tasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(tasks, 'Running tasks');

  const uncaughtHandler = function(e) {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
  process.on('uncaughtException', uncaughtHandler);

  task.options({
    error: function(e) {
      fail.warn(e, fail.code.TASK_FAILURE);
    },
    done: function() {
      process.removeListener('uncaughtException', uncaughtHandler);
      fail.report();

      if (done) {
        done();
      } else {
        util.exit(0);
      }
    }
  });

  tasks.forEach(function(name) { task.run(name); });
  task.start({asyncDone: true});
}

/**
 * Main entry point for running grunt tasks.
 * @param {Array} tasks - Array of task names to run.
 * @param {Object} options - Command line options.
 * @param {Function} done - Callback function when tasks complete.
 * @returns {void}
 */
grunt.tasks = function(tasks, options, done) {
  option.init(options);

  if (option('version')) {
    handleVersion(options, verbose);
    return;
  }

  if (option('help')) {
    handleHelp();
    return;
  }

  runTasks(tasks, options, done);
};