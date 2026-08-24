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
    registerCoffeeFileErrorHandler();
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

// Register error handlers for CoffeeScript file extensions.
// Ensures helpful error message when trying to load .coffee without CoffeeScript installed.
function registerCoffeeFileErrorHandler() {
  var FILE_EXTENSIONS = ['.coffee', '.litcoffee', '.coffee.md'];
  for (var i = 0; i < FILE_EXTENSIONS.length; i++) {
    require.extensions[FILE_EXTENSIONS[i]] = function() {
      throw new Error(
        'Grunt attempted to load a .coffee file but CoffeeScript was not installed.\n' +
        'Please run `npm install --dev coffeescript` to enable loading CoffeeScript.'
      );
    };
  }
}

// Expose the task interface. I've never called this manually, and have no idea
// how it will work. But it might.
grunt.tasks = function(tasks, options, done) {
  // Update options with passed-in options.
  option.init(options);

  // Handle version flag.
  if (option('version')) {
    handleVersionFlag();
    return;
  }

  // Handle help flag.
  if (option('help')) {
    help.display();
    return;
  }

  // Run tasks normally.
  runTasks(tasks, options, done);
};

// Displays grunt version and optional verbose info, then exits.
function handleVersionFlag() {
  log.writeln('grunt v' + grunt.version);

  if (!option('verbose')) { return; }

  verbose.writeln('Install path: ' + path.resolve(__dirname, '..'));
  grunt.log.muted = true;
  grunt.task.init([], {help: true});
  grunt.log.muted = false;

  logAvailableTasks();
  logAvailableOptions();
}

// Logs available tasks sorted alphabetically.
function logAvailableTasks() {
  var _tasks = Object.keys(grunt.task._tasks).sort();
  verbose.writeln('Available tasks: ' + _tasks.join(' '));
}

// Logs available command-line options (both long and short forms).
function logAvailableOptions() {
  var _options = [];
  Object.keys(grunt.cli.optlist).forEach(function(long) {
    var o = grunt.cli.optlist[long];
    _options.push('--' + (o.negate ? 'no-' : '') + long);
    if (o.short) { _options.push('-' + o.short); }
  });
  verbose.writeln('Available options: ' + _options.join(' '));
}

// Executes the normal task-running flow.
function runTasks(tasks, options, done) {
  // Init colors.
  log.initColors();

  // A little header stuff.
  verbose.header('Initializing').writeflags(option.flags(), 'Command-line options');

  // Determine and output which tasks will be run.
  var tasksSpecified = tasks && tasks.length > 0;
  tasks = task.parseArgs([tasksSpecified ? tasks : 'default']);

  // Initialize tasks.
  task.init(tasks, options);

  verbose.writeln();
  if (!tasksSpecified) {
    verbose.writeln('No tasks specified, running default tasks.');
  }
  verbose.writeflags(tasks, 'Running tasks');

  // Handle uncaught exceptions.
  var uncaughtHandler = function(e) {
    fail.fatal(e, fail.code.TASK_FAILURE);
  };
  process.on('uncaughtException', uncaughtHandler);

  // Configure task callbacks.
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

  // Execute tasks sequentially.
  tasks.forEach(function(name) { task.run(name); });
  task.start({asyncDone: true});
}