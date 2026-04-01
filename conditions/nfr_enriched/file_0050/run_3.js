'use strict';

// Nodejs libs.
const path = require('path');

// Register CoffeeScript support if available.
function registerCoffeeScriptSupport() {
  try {
    // Note: grunt no longer depends on CoffeeScript, it will only use it if it is intentionally
    // installed in the project.
    require('coffeescript/register');
  } catch (e) {
    // This is fine, and will cause no problems so long as the user doesn't load .coffee files.
    // Print a useful error if we attempt to load a .coffee file.
    if (require.extensions) {
      const FILE_EXTENSIONS = ['.coffee', '.litcoffee', '.coffee.md'];
      FILE_EXTENSIONS.forEach(function(ext) {
        require.extensions[ext] = function() {
          throw new Error(
            'Grunt attempted to load a .coffee file but CoffeeScript was not installed.\n' +
            'Please run `npm install --dev coffeescript` to enable loading CoffeeScript.'
          );
        };
      });
    }
  }
}

// The module to be exported.
const grunt = module.exports = {};

// Expose internal grunt libs.
function gRequire(name) {
  return grunt[name] = require('./grunt/' + name);
}

// Initialize core utilities and logging.
function initializeCoreModules() {
  const util = require('grunt-legacy-util');
  grunt.util = util;
  grunt.util.task = require('./util/task');

  const Log = require('grunt-legacy-log').Log;
  const log = new Log({grunt: grunt});
  grunt.log = log;

  return { util, log };
}

// Load and expose grunt internal modules.
function loadGruntModules() {
  gRequire('template');
  gRequire('event');
  const fail = gRequire('fail');
  gRequire('file');
  const option = gRequire('option');
  const config = gRequire('config');
  const task = gRequire('task');
  const help = gRequire('help');
  gRequire('cli');
  const verbose = grunt.verbose = grunt.log.verbose;

  return { fail, option, config, task, help, verbose };
}

// Expose specific grunt lib methods on grunt.
function gExpose(obj, methodName, newMethodName) {
  grunt[newMethodName || methodName] = obj[methodName].bind(obj);
}

// Register all public task methods.
function registerTaskMethods(task, config, fail) {
  gExpose(task, 'registerTask');
  gExpose(task, 'registerMultiTask');
  gExpose(task, 'registerInitTask');
  gExpose(task, 'renameTask');
  gExpose(task, 'loadTasks');
  gExpose(task, 'loadNpmTasks');
  gExpose(config, 'init', 'initConfig');
  gExpose(fail, 'warn');
  gExpose(fail, 'fatal');
}

// Handle version display with optional verbose output.
function handleVersionDisplay(option, log, verbose) {
  log.writeln('grunt v' + grunt.version);

  if (option('verbose')) {
    verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
    // Yes, this is a total hack, but we don't want to log all that verbose
    // task initialization stuff here.
    grunt.log.muted = true;
    // Initialize task system so that available tasks can be listed.
    grunt.task.init([], {help: true});
    // Re-enable logging.
    grunt.log.muted = false;

    displayAvailableTasks(verbose);
    displayAvailableOptions(verbose);
  }
}

// Display available tasks for shell completion.
function displayAvailableTasks(verbose) {
  const availableTasks = Object.keys(grunt.task._tasks).sort();
  verbose.writeln('Available tasks: ' + availableTasks.join(' '));
}

// Display available options for shell completion.
function displayAvailableOptions(verbose) {
  const availableOptions = [];
  Object.keys(grunt.cli.optlist).forEach(function(long) {
    const o = grunt.cli.optlist[long];
    availableOptions.push('--' + (o.negate ? 'no-' : '') + long);
    if (o.short) { availableOptions.push('-' + o.short); }
  });
  verbose.writeln('Available options: ' + availableOptions.join(' '));
}

// Setup exception handling for task execution.
function setupExceptionHandling(fail, task, done, util) {
  const uncaughtHandler = function(e) {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
  process.on('uncaughtException', uncaughtHandler);

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
}

// Execute all specified tasks.
function executeTasks(task, tasks) {
  // Execute all tasks, in order. Passing each task individually in a forEach
  // allows the error callback to execute multiple times.
  tasks.forEach(function(name) { task.run(name); });
  // Run tasks async internally to reduce call-stack, per:
  // https://github.com/gruntjs/grunt/pull/1026
  task.start({asyncDone: true});
}

// Initialize grunt and execute tasks.
registerCoffeeScriptSupport();

const { util, log } = initializeCoreModules();
const { fail, option, config, task, help, verbose } = loadGruntModules();

registerTaskMethods(task, config, fail);

// Expose grunt metadata.
grunt.package = require('../package.json');
grunt.version = grunt.package.version;

// Expose the task interface. I've never called this manually, and have no idea
// how it will work. But it might.
grunt.tasks = function(tasks, options, done) {
  // Update options with passed-in options.
  option.init(options);

  // Display the grunt version and quit if the user did --version.
  if (option('version')) {
    handleVersionDisplay(option, log, verbose);
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
  const parsedTasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  // Initialize tasks.
  task.init(parsedTasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(parsedTasks, 'Running tasks');

  // Setup exception handling and task completion callbacks.
  setupExceptionHandling(fail, task, done, util);

  // Execute all tasks.
  executeTasks(task, parsedTasks);
};