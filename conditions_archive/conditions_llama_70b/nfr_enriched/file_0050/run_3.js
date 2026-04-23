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
    FILE_EXTENSIONS.forEach((extension) => {
      require.extensions[extension] = function() {
        throw new Error(
          'Grunt attempted to load a .coffee file but CoffeeScript was not installed.\n' +
          'Please run `npm install --dev coffeescript` to enable loading CoffeeScript.'
        );
      };
    });
  }
}

// The module to be exported.
const grunt = module.exports = {};

// Expose internal grunt libs.
/**
 * Expose internal grunt lib.
 * @param {string} name - Name of the lib to expose.
 * @returns {object} Exposed lib.
 */
function exposeInternalLib(name) {
  return grunt[name] = require('./grunt/' + name);
}

const util = require('grunt-legacy-util');
grunt.util = util;
grunt.util.task = require('./util/task');

const Log = require('grunt-legacy-log').Log;
const log = new Log({grunt: grunt});
grunt.log = log;

exposeInternalLib('template');
exposeInternalLib('event');
const fail = exposeInternalLib('fail');
exposeInternalLib('file');
const option = exposeInternalLib('option');
const config = exposeInternalLib('config');
const task = exposeInternalLib('task');
const help = exposeInternalLib('help');
exposeInternalLib('cli');
const verbose = grunt.verbose = log.verbose;

// Expose some grunt metadata.
grunt.package = require('../package.json');
grunt.version = grunt.package.version;

// Expose specific grunt lib methods on grunt.
/**
 * Expose a method from an object on grunt.
 * @param {object} obj - Object containing the method to expose.
 * @param {string} methodName - Name of the method to expose.
 * @param {string} [newMethodName] - New name for the method.
 */
function exposeMethod(obj, methodName, newMethodName) {
  grunt[newMethodName || methodName] = obj[methodName].bind(obj);
}
exposeMethod(task, 'registerTask');
exposeMethod(task, 'registerMultiTask');
exposeMethod(task, 'registerInitTask');
exposeMethod(task, 'renameTask');
exposeMethod(task, 'loadTasks');
exposeMethod(task, 'loadNpmTasks');
exposeMethod(config, 'init', 'initConfig');
exposeMethod(fail, 'warn');
exposeMethod(fail, 'fatal');

// Expose the task interface.
/**
 * Run tasks with the given options.
 * @param {array} tasks - Tasks to run.
 * @param {object} options - Options for the tasks.
 * @param {function} [done] - Callback to execute when done.
 */
grunt.tasks = function(tasks, options, done) {
  // Update options with passed-in options.
  option.init(options);

  // Display the grunt version and quit if the user did --version.
  if (option('version')) {
    displayVersion();
    return;
  }

  // Init colors.
  log.initColors();

  // Display help and quit if the user did --help.
  if (option('help')) {
    help.display();
    return;
  }

  // A little header stuff.
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  // Determine and output which tasks will be run.
  const tasksSpecified = tasks && tasks.length > 0;
  tasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  // Initialize tasks.
  task.init(tasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(tasks, 'Running tasks');

  // Handle otherwise unhandleable (probably asynchronous) exceptions.
  const uncaughtHandler = function(e) {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
  process.on('uncaughtException', uncaughtHandler);

  // Report, etc when all tasks have completed.
  task.options({
    error: function(e) {
      fail.warn(e, fail.code.TASK_FAILURE);
    },
    done: function() {
      // Stop handling uncaught exceptions so that we don't leave any
      // unwanted process-level side effects behind. There is no need to do
      // this in the error callback, because fail.warn() will either kill
      // the process, or with --force keep on going all the way here.
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
    }
  });

  // Execute all tasks, in order. Passing each task individually in a forEach
  // allows the error callback to execute multiple times.
  tasks.forEach(function(name) { task.run(name); });
  // Run tasks async internally to reduce call-stack, per:
  // https://github.com/gruntjs/grunt/pull/1026
  task.start({asyncDone: true});
};

/**
 * Display the grunt version.
 */
function displayVersion() {
  // Not --verbose.
  log.writeln('grunt v' + grunt.version);

  if (option('verbose')) {
    // --verbose
    verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
    // Yes, this is a total hack, but we don't want to log all that verbose
    // task initialization stuff here.
    grunt.log.muted = true;
    // Initialize task system so that available tasks can be listed.
    grunt.task.init([], {help: true});
    // Re-enable logging.
    grunt.log.muted = false;

    // Display available tasks (for shell completion, etc).
    const tasks = Object.keys(grunt.task._tasks).sort();
    verbose.writeln('Available tasks: ' + tasks.join(' '));

    // Display available options (for shell completion, etc).
    const options = [];
    Object.keys(grunt.cli.optlist).forEach(function(long) {
      const o = grunt.cli.optlist[long];
      options.push('--' + (o.negate ? 'no-' : '') + long);
      if (o.short) { options.push('-' + o.short); }
    });
    verbose.writeln('Available options: ' + options.join(' '));
  }
}
```