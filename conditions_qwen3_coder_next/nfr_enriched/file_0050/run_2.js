'use strict';

// Nodejs libs.
var path = require('path');

// This allows grunt to require() .coffee files.
try {
  // Note: grunt no longer depends on CoffeeScript, it will only use it if it is intentionally
  // installed in the project.
  require('coffeescript/register');
} catch (e) {
  // This is fine, and will cause no problems so long as the user doesn't load .coffee files.
  // Print a useful error if we attempt to load a .coffee file.
  if (require.extensions) {
    registerCoffeeFileHandlers();
  }
}

// The module to be exported.
var grunt = module.exports = {};

// Expose internal grunt libs.
function gRequire(name) {
  return grunt[name] = require('./grunt/' + name);
}

var util = require('grunt-legacy-util');
grunt.util = util;
grunt.util.task = require('./util/task');

var Log = require('grunt-legacy-log').Log;
var log = new Log({grunt: grunt});
grunt.log = log;

gRequire('template');
gRequire('event');
var fail = gRequire('fail');
gRequire('file');
var option = gRequire('option');
var config = gRequire('config');
var task = gRequire('task');
var help = gRequire('help');
gRequire('cli');
var verbose = grunt.verbose = log.verbose;

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

// Expose the task interface.
grunt.tasks = function(tasks, options, done) {
  // Update options with passed-in options.
  option.init(options);

  // Handle version and help flags early.
  if (handleVersionFlag()) { return; }
  if (option('help')) {
    help.display();
    return;
  }

  // Initialize runtime state.
  log.initColors();
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  // Parse task arguments and initialize tasks.
  var tasksSpecified = tasks && tasks.length > 0;
  tasks = task.parseArgs([tasksSpecified ? tasks : 'default']);
  task.init(tasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(tasks, 'Running tasks');

  // Set up task execution handlers and run.
  var uncaughtHandler = wrapFatalErrorHandler();
  process.on('uncaughtException', uncaughtHandler);

  task.options({
    error: createErrorHandler(),
    done: createCompletionHandler(uncaughtHandler, done)
  });

  // Run tasks in order with async support.
  tasks.forEach(function(name) { task.run(name); });
  task.start({asyncDone: true});
};

// Extracted function to register .coffee handlers for early error support.
function registerCoffeeFileHandlers() {
  var FILE_EXTENSIONS = ['.coffee', '.litcoffee', '.coffee.md'];
  for (var i = 0; i < FILE_EXTENSIONS.length; i++) {
    (function(ext) {
      require.extensions[ext] = function() {
        throw new Error(
          'Grunt attempted to load a .coffee file but CoffeeScript was not installed.\n' +
          'Please run `npm install --dev coffeescript` to enable loading CoffeeScript.'
        );
      };
    })(FILE_EXTENSIONS[i]);
  }
}

// Extracted function to handle --version flag logic cleanly.
function handleVersionFlag() {
  if (!option('version')) { return false; }

  log.writeln('grunt v' + grunt.version);

  if (!option('verbose')) {
    return true;
  }

  verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
  grunt.log.muted = true;
  grunt.task.init([], {help: true});
  grunt.log.muted = false;

  var availableTasks = Object.keys(grunt.task._tasks).sort();
  verbose.writeln('Available tasks: ' + availableTasks.join(' '));

  var availableOptions = [];
  Object.keys(grunt.cli.optlist).forEach(function(long) {
    var o = grunt.cli.optlist[long];
    availableOptions.push('--' + (o.negate ? 'no-' : '') + long);
    if (o.short) { availableOptions.push('-' + o.short); }
  });
  verbose.writeln('Available options: ' + availableOptions.join(' '));

  return true;
}

// Extracted error handler factory.
function createErrorHandler() {
  return function(e) {
    fail.warn(e, fail.code.TASK_FAILURE);
  };
}

// Extracted completion handler factory.
function createCompletionHandler(uncaughtHandler, done) {
  return function() {
    process.removeListener('uncaughtException', uncaughtHandler);
    fail.report();

    if (done) {
      done();
    } else {
      util.exit(0);
    }
  };
}

// Extracted uncaught exception handler.
function wrapFatalErrorHandler() {
  return function(e) {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
}